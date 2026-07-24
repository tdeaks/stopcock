// Oracle leg 2 (see docs/superpowers/plans/
// 2026-07-21-stopcock-fp-tiered-execution-implementation.md, "Oracle
// independence"): hand-written semantic fixtures against the public surface
// only. No registry/plan/interpret/opcodes imports -- this file must not be
// able to rot in lockstep with the engine it's checking. Expectations come
// from documented/native-JS semantics, not from running the implementation
// first and pasting its output.
import { describe, it, expect } from 'vite-plus/test'
import { pipe } from '../pipe'
import { compile, compilePure } from '../compile'
import { none, some } from '../option'
import * as A from '../array'

describe('callback order and argument shapes', () => {
  it('map/filter/reduce run left to right, one call per accepted item, in source order', () => {
    const order: number[] = []
    const result = pipe(
      [1, 2, 3, 4, 5],
      A.map((x: number) => {
        order.push(x)
        return x * 2
      }),
    )
    expect(result).toEqual([2, 4, 6, 8, 10])
    expect(order).toEqual([1, 2, 3, 4, 5])
  })

  it('map calls its callback with exactly the element value (single argument)', () => {
    const calls: unknown[][] = []
    pipe(
      [10, 20],
      A.map((...args: unknown[]) => {
        calls.push(args)
        return args[0]
      }),
    )
    expect(calls).toEqual([[10], [20]])
  })

  it('reduce calls its callback with (acc, item) in that order', () => {
    const calls: Array<[number, number]> = []
    const result = pipe(
      [1, 2, 3],
      A.reduce((acc: number, x: number) => {
        calls.push([acc, x])
        return acc + x
      }, 100),
    )
    expect(result).toBe(106)
    expect(calls).toEqual([
      [100, 1],
      [101, 2],
      [103, 3],
    ])
  })

  it('a fused chain runs each accepted item through every step before advancing to the next item', () => {
    const log: string[] = []
    pipe(
      [1, 2],
      A.map((x: number) => {
        log.push(`map(${x})`)
        return x + 1
      }),
      A.filter((x: number) => {
        log.push(`filter(${x})`)
        return true
      }),
    )
    expect(log).toEqual(['map(1)', 'filter(2)', 'map(2)', 'filter(3)'])
  })
})

describe('exceptions mid-pipeline', () => {
  it('propagates the first thrown error and calls no further callbacks', () => {
    const calls: number[] = []
    expect(() =>
      pipe(
        [1, 2, 3, 4, 5],
        A.map((x: number) => {
          calls.push(x)
          if (x === 3) throw new Error('boom')
          return x
        }),
      ),
    ).toThrow('boom')
    expect(calls).toEqual([1, 2, 3])
  })

  it('an exception in a later step still means earlier steps already ran for that item', () => {
    const mapped: number[] = []
    expect(() =>
      pipe(
        [1, 2, 3],
        A.map((x: number) => {
          mapped.push(x)
          return x
        }),
        A.forEach((x: number) => {
          if (x === 2) throw new Error('stop')
        }),
      ),
    ).toThrow('stop')
    expect(mapped).toEqual([1, 2])
  })
})

describe('input mutation during iteration', () => {
  // Asserted contract, diverging from Array.prototype.forEach: native
  // forEach snapshots the length once but then checks `k in O` per index, so
  // indices deleted by truncation are silently skipped (never invoke the
  // callback). stopcock's forEach also snapshots the length once (a plain
  // `for (i = 0; i < len; i++)` over the original length) but does NOT
  // re-check membership, so indices that truncation turned into holes still
  // invoke the callback, reading them as undefined (dense-hole semantics
  // applied to a hole created mid-iteration, not just a hole present up
  // front).
  it('shrinking the array mid-iteration does not shorten the run: still one call per original index', () => {
    const source = [1, 2, 3, 4, 5]
    const seen: unknown[] = []
    pipe(
      source,
      A.forEach((x: number) => {
        seen.push(x)
        if (x === 2) source.length = 3
      }),
    )
    expect(seen).toEqual([1, 2, 3, undefined, undefined])
  })

  it('growing the array mid-iteration is not visible: the length snapshot is taken once, up front', () => {
    const source = [1, 2]
    const seen: number[] = []
    pipe(
      source,
      A.forEach((x: number) => {
        seen.push(x)
        if (x === 1) source.push(3)
      }),
    )
    expect(seen).toEqual([1, 2])
  })

  it('reject and none use the same up-front length snapshot contract', () => {
    const rejectedSource = [1, 2]
    const rejectedSeen: number[] = []
    expect(
      pipe(
        rejectedSource,
        A.reject((value: number) => {
          rejectedSeen.push(value)
          if (rejectedSeen.length === 1) rejectedSource.push(3)
          return false
        }),
      ),
    ).toEqual([1, 2])
    expect(rejectedSeen).toEqual([1, 2])

    const noneSource = [1, 2]
    const noneSeen: number[] = []
    expect(
      pipe(
        noneSource,
        A.none((value: number) => {
          noneSeen.push(value)
          if (noneSeen.length === 1) noneSource.push(3)
          return false
        }),
      ),
    ).toBe(true)
    expect(noneSeen).toEqual([1, 2])
  })

  it('generated fused templates snapshot source length before the first callback', () => {
    const source = [1, 2]
    const seen: unknown[] = []
    const runner = compile(
      A.map((value: number) => {
        seen.push(value)
        if (seen.length === 1) source.push(3)
        return value
      }),
      A.filter(() => true),
    )

    expect(runner(source)).toEqual([1, 2])
    expect(seen).toEqual([1, 2])
  })

  it('generic fused loops retain the original length after source truncation', () => {
    const source: Array<number | undefined> = [1, 2, 3]
    const seen: unknown[] = []
    const runner = compile(
      A.map((value: number | undefined) => {
        seen.push(value)
        if (seen.length === 1) source.length = 1
        return value
      }),
      A.drop(0),
    )

    expect(runner(source)).toEqual([1, undefined, undefined])
    expect(seen).toEqual([1, undefined, undefined])
  })
})

describe('dense-hole semantics', () => {
  it('reads a sparse hole as undefined and still invokes the callback for it', () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 3]
    const seen: unknown[] = []
    const result = pipe(
      sparse,
      A.map((x: unknown) => {
        seen.push(x)
        return x
      }),
    )
    expect(seen).toEqual([1, undefined, 3])
    expect(result).toEqual([1, undefined, 3])
  })

  it('filter treats a hole (undefined) like any other falsy-testable value', () => {
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 3]
    const result = pipe(
      sparse,
      A.filter((x: unknown) => x !== undefined),
    )
    expect(result).toEqual([1, 3])
  })
})

describe('reentrancy', () => {
  it('a callback that calls pipe() on the same shape from inside another pipe() run behaves correctly', () => {
    const double = (x: number) => x * 2
    const inner = (x: number) => pipe([x, x + 1], A.map(double))
    const result = pipe(
      [1, 2, 3],
      A.map((x: number) => inner(x)[0]),
    )
    expect(result).toEqual([2, 4, 6])
  })

  it('reentrant pipe() calls do not share or corrupt each other take/drop state', () => {
    const result = pipe(
      [1, 2, 3, 4],
      A.map((x: number) => {
        const nested = pipe([10, 20, 30], A.take(1))
        return x + nested[0]
      }),
      A.take(2),
    )
    expect(result).toEqual([11, 12])
  })
})

describe('NaN and negative-zero preservation', () => {
  it('map preserves NaN as a distinct, self-unequal value', () => {
    const result = pipe(
      [1, NaN, 3],
      A.map((x: number) => x),
    ) as number[]
    expect(Number.isNaN(result[1])).toBe(true)
    expect(result[1] === result[1]).toBe(false)
  })

  it('map preserves negative zero, distinguishable from positive zero via Object.is', () => {
    const result = pipe(
      [0, -0],
      A.map((x: number) => x),
    ) as number[]
    expect(Object.is(result[0], 0)).toBe(true)
    expect(Object.is(result[1], -0)).toBe(true)
    expect(result[0] === result[1]).toBe(true) // === does not distinguish 0 from -0
  })

  it('reduce accumulating through -0 preserves it via Object.is, not just ===', () => {
    const result = pipe(
      [-0],
      A.reduce((acc: number, x: number) => acc + x, -0),
    )
    expect(Object.is(result, -0)).toBe(true)
  })

  it('filter keeps NaN out when the predicate uses Number.isNaN, in despite NaN !== NaN', () => {
    const result = pipe(
      [1, NaN, 2],
      A.filter((x: number) => !Number.isNaN(x)),
    )
    expect(result).toEqual([1, 2])
  })
})

describe('take/drop edge conventions', () => {
  it('take(0) returns an empty array without calling any downstream callback', () => {
    const calls: number[] = []
    const result = pipe(
      [1, 2, 3],
      A.take(0),
      A.map((x: number) => {
        calls.push(x)
        return x
      }),
    )
    expect(result).toEqual([])
    expect(calls).toEqual([])
  })

  it('take(n) beyond the array length returns the whole array', () => {
    const result = pipe([1, 2, 3], A.take(100))
    expect(result).toEqual([1, 2, 3])
  })

  it('drop(0) returns every element', () => {
    const result = pipe([1, 2, 3], A.drop(0))
    expect(result).toEqual([1, 2, 3])
  })

  it('drop(n) beyond the array length returns an empty array', () => {
    const result = pipe([1, 2, 3], A.drop(100))
    expect(result).toEqual([])
  })

  // Asserted contract: take's quota check happens at take's own position in
  // the fused chain, after any upstream step has already run for that item.
  // So an upstream map still gets called once on the item that reveals the
  // quota is full (the (n+1)-th accepted item), one call more than the
  // output length -- it just never reaches take's downstream (nothing here,
  // but the same rule is what lets a later step count differently).
  it('take(n) halts one item past its quota: the upstream step still runs on that (n+1)-th item', () => {
    const calls: number[] = []
    const result = pipe(
      [1, 2, 3, 4, 5],
      A.map((x: number) => {
        calls.push(x)
        return x
      }),
      A.take(2),
    )
    expect(result).toEqual([1, 2])
    expect(calls).toEqual([1, 2, 3])
  })
})

describe('every/some/find early exit callback counts', () => {
  it('every stops calling its predicate at the first false result', () => {
    const calls: number[] = []
    const result = pipe(
      [1, 2, 3, 4, 5],
      A.every((x: number) => {
        calls.push(x)
        return x < 3
      }),
    )
    expect(result).toBe(false)
    expect(calls).toEqual([1, 2, 3])
  })

  it('every calls its predicate for every item when none fail', () => {
    const calls: number[] = []
    const result = pipe(
      [1, 2, 3],
      A.every((x: number) => {
        calls.push(x)
        return true
      }),
    )
    expect(result).toBe(true)
    expect(calls).toEqual([1, 2, 3])
  })

  it('some stops calling its predicate at the first true result', () => {
    const calls: number[] = []
    const result = pipe(
      [1, 2, 3, 4, 5],
      A.some((x: number) => {
        calls.push(x)
        return x === 3
      }),
    )
    expect(result).toBe(true)
    expect(calls).toEqual([1, 2, 3])
  })

  it('find stops at the first match and returns Some(element)', () => {
    const calls: number[] = []
    const result = pipe(
      [1, 2, 3, 4, 5],
      A.find((x: number) => {
        calls.push(x)
        return x > 2
      }),
    )
    expect(result).toEqual(some(3))
    expect(calls).toEqual([1, 2, 3])
  })

  it('find returns None and calls the predicate for every item when nothing matches', () => {
    const calls: number[] = []
    const result = pipe(
      [1, 2, 3],
      A.find((x: number) => {
        calls.push(x)
        return x > 100
      }),
    )
    expect(result).toEqual(none)
    expect(calls).toEqual([1, 2, 3])
  })
})

describe('findIndex', () => {
  it('returns None when nothing matches', () => {
    const result = pipe(
      [1, 2, 3],
      A.findIndex((x: number) => x > 100),
    )
    expect(result).toEqual(none)
  })

  it('returns the index of the first match when one exists', () => {
    const result = pipe(
      [10, 20, 30],
      A.findIndex((x: number) => x === 20),
    )
    expect(result).toEqual(some(1))
  })
})

describe('reduce seeding', () => {
  it('starts from the given initial value, not the first element', () => {
    const calls: Array<[number, number]> = []
    const result = pipe(
      [1, 2, 3],
      A.reduce((acc: number, x: number) => {
        calls.push([acc, x])
        return acc + x
      }, 1000),
    )
    expect(result).toBe(1006)
    expect(calls[0]).toEqual([1000, 1])
  })

  it('runs the reducer zero times over an empty array, returning the initial value unchanged', () => {
    const calls: unknown[] = []
    const result = pipe(
      [] as number[],
      A.reduce((acc: number, x: number) => {
        calls.push([acc, x])
        return acc + x
      }, 42),
    )
    expect(result).toBe(42)
    expect(calls).toEqual([])
  })
})

describe('compile()/compilePure() agree with pipe() on these same contracts', () => {
  it('compile() preserves callback order and take() early exit like pipe()', () => {
    const calls: number[] = []
    const runner = compile(
      A.map((x: number) => {
        calls.push(x)
        return x * 2
      }),
      A.take(2),
    )
    expect(runner([1, 2, 3, 4])).toEqual([2, 4])
    expect(calls).toEqual([1, 2, 3])
  })

  it('compilePure() still runs left to right for a plain map/filter/reduce chain', () => {
    const order: number[] = []
    const runner = compilePure(
      A.map((x: number) => {
        order.push(x)
        return x + 1
      }),
      A.reduce((acc: number, x: number) => acc + x, 0),
    )
    expect(runner([1, 2, 3])).toBe(9)
    expect(order).toEqual([1, 2, 3])
  })
})
