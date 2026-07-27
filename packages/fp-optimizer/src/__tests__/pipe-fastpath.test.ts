// Differential coverage for pipe()'s opcode-keyed front cache (src/pipe.ts).
// The front cache exists to fix inline-fresh-closure pipelines: every call
// site here builds brand-new closures per iteration, so the identity cache
// (4-entry, keyed on exact callback references) always misses. What must
// stay true is that the opcode-keyed cache still routes to the right shape
// runner and extracts the right bindings every time, matching interpret()'s
// oracle output and callback counts on every iteration -- not just the
// first (which would be a plausible way for a shape/binding mixup to hide).
import { describe, it, expect } from 'vite-plus/test'
// These exercise fused execution, which since S8 lives behind the explicit
// entry rather than at the root. Root pipe is sequential and is covered by
// root-sequential.test.ts.
import { pipe } from '@stopcock/fp/fusion'
import * as A from '@stopcock/fp/array'
import * as M from '@stopcock/fp/math'
import { buildPlan } from '../plan-bridge'
import { interpret } from '@stopcock/fp/abi'
import { getOptimizerStats, resetOptimizerStats } from '../compile'
import {
  NUM_KEY_BASE,
  NUM_KEY_MAX_LEN,
  __resetFusionCaches,
} from '../fusion-engine'
import { OP_CODES } from '@stopcock/fp/abi'

const ITERATIONS = 25

interface Counter {
  n: number
}

function run<T>(
  data: readonly unknown[],
  build: (c: Counter) => unknown[],
): { result: T; count: number } {
  const c: Counter = { n: 0 }
  const steps = build(c)
  const result = pipe(data as any, ...(steps as [any])) as T
  return { result, count: c.n }
}

function oracle<T>(
  data: readonly unknown[],
  build: (c: Counter) => unknown[],
): { result: T; count: number } {
  const c: Counter = { n: 0 }
  const steps = build(c)
  const plan = buildPlan(steps)
  const result = interpret(plan, data) as T
  return { result, count: c.n }
}

// Each shape builds fresh tagged steps from a counter, so every invocation
// creates new closure identities (defeating the identity cache) while the
// opcode sequence (and therefore the front-cache key) stays the same across
// iterations.
const shapes: Array<{ name: string; data: readonly unknown[]; build: (c: Counter) => unknown[] }> =
  [
    {
      name: 'filterMap + take (template-covered)',
      data: Array.from({ length: 40 }, (_, i) => i),
      build: (c) => [
        A.filterMap((x: number) => {
          c.n++
          return x % 2 === 0 ? x * 2 : undefined
        }),
        A.take(5),
      ],
    },
    {
      name: 'map + filter',
      data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      build: (c) => [
        A.map((x: number) => {
          c.n++
          return x + 1
        }),
        A.filter((x: number) => x % 2 === 0),
      ],
    },
    {
      name: 'map + take',
      data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      build: (c) => [
        A.map((x: number) => {
          c.n++
          return x * 2
        }),
        A.take(3),
      ],
    },
    {
      name: 'filter + drop',
      data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      build: (c) => [
        A.filter((x: number) => {
          c.n++
          return x % 2 === 0
        }),
        A.drop(1),
      ],
    },
    {
      name: 'map + reject',
      data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      build: (c) => [
        A.map((x: number) => {
          c.n++
          return x - 1
        }),
        A.reject((x: number) => x < 3),
      ],
    },
    {
      name: 'takeWhile',
      data: [1, 2, 3, 4, 5, -1, 6, 7],
      build: (c) => [
        A.takeWhile((x: number) => {
          c.n++
          return x > 0
        }),
      ],
    },
    {
      name: 'dropWhile + map',
      data: [1, 2, 3, 4, 5, 6, 7, 8],
      build: (c) => [
        A.dropWhile((x: number) => x < 3),
        A.map((x: number) => {
          c.n++
          return x * 10
        }),
      ],
    },
    {
      name: 'find',
      data: [1, 2, 3, 4, 5, 6, 7, 8],
      build: (c) => [
        A.find((x: number) => {
          c.n++
          return x > 4
        }),
      ],
    },
    {
      name: 'findIndex',
      data: [1, 2, 3, 4, 5, 6, 7, 8],
      build: (c) => [
        A.findIndex((x: number) => {
          c.n++
          return x > 4
        }),
      ],
    },
    {
      name: 'every',
      data: [1, 2, 3, 4, 5, 6, 7, 8],
      build: (c) => [
        A.every((x: number) => {
          c.n++
          return x > 0
        }),
      ],
    },
    {
      name: 'some',
      data: [1, 2, 3, 4, 5, 6, 7, 8],
      build: (c) => [
        A.some((x: number) => {
          c.n++
          return x > 6
        }),
      ],
    },
    {
      name: 'reduce with fresh reducer',
      data: [1, 2, 3, 4, 5, 6, 7, 8],
      build: (c) => [
        A.reduce((acc: number, x: number) => {
          c.n++
          return acc + x
        }, 0),
      ],
    },
    {
      name: 'map + sum + scalar math',
      data: [1, 2, 3, 4],
      build: (c) => [
        A.map((x: number) => {
          c.n++
          return x * 2
        }),
        A.sum,
        M.add(1),
      ],
    },
    {
      name: 'sortBy + take (generic, materializer boundary)',
      data: [5, 3, 8, 1, 9, 2],
      build: (c) => [
        A.sortBy((x: number) => {
          c.n++
          return -x
        }),
        A.take(3),
      ],
    },
    {
      name: 'flatMap + takeWhile',
      data: [1, 2, 3],
      build: (c) => [
        A.flatMap((x: number) => {
          c.n++
          return [x, x + 10]
        }),
        A.takeWhile((v: number) => v < 12),
      ],
    },
    {
      name: 'mapWhile',
      data: [1, 2, 3, 4, -1, 5],
      build: (c) => [
        A.mapWhile((x: number) => {
          c.n++
          return x > 0 ? x * 3 : undefined
        }),
      ],
    },
    {
      name: 'join (boundary op with bound arg)',
      data: ['a', 'b', 'c'],
      build: (c) => [
        A.map((x: string) => {
          c.n++
          return x.toUpperCase()
        }),
        A.join('-'),
      ],
    },
  ]

describe('pipe() fast path: inline fresh closures', () => {
  for (const shape of shapes) {
    it(`matches interpret() across ${ITERATIONS} fresh-closure calls: ${shape.name}`, () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const actual = run(shape.data, shape.build)
        const expected = oracle(shape.data, shape.build)
        expect(actual.result).toEqual(expected.result)
        expect(actual.count).toBe(expected.count)
      }
    })
  }

  it('covers at least 15 distinct shapes', () => {
    expect(shapes.length).toBeGreaterThanOrEqual(15)
  })
})

describe('pipe() fast path: distinct bound args, same opcode sequence', () => {
  it('take(2) vs take(5) alternating call-to-call stays correct (M0 staleness regression)', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    for (let i = 0; i < ITERATIONS; i++) {
      const f = (x: number) => x * 2
      const r2 = pipe(data, A.map(f), A.take(2))
      const r5 = pipe(data, A.map(f), A.take(5))
      expect(r2).toEqual([2, 4])
      expect(r5).toEqual([2, 4, 6, 8, 10])
    }
  })

  it('reduce with alternating initial values stays correct across fresh closures', () => {
    const data = [1, 2, 3, 4, 5]
    for (let i = 0; i < ITERATIONS; i++) {
      const reducer = (a: number, b: number) => a + b
      const rZero = pipe(
        data,
        A.filter((x: number) => x % 2 === 0),
        A.reduce(reducer, 0),
      )
      const rHundred = pipe(
        data,
        A.filter((x: number) => x % 2 === 0),
        A.reduce(reducer, 100),
      )
      expect(rZero).toBe(6)
      expect(rHundred).toBe(106)
    }
  })
})

describe('pipe() fast path: bail conditions stay correct', () => {
  it('untagged step in the middle forces the slow path and still matches interpret()', () => {
    const data = [1, 2, 3, 4, 5, 6]
    for (let i = 0; i < ITERATIONS; i++) {
      const calls: number[] = []
      const mapper = (x: number) => {
        calls.push(x)
        return x + 1
      }
      const untagged = (arr: readonly number[]) => arr.filter((x) => x % 2 === 0)
      const steps = [A.map(mapper), untagged, A.take(2)]
      const result = pipe(data, ...(steps as [any, any, any]))

      const oracleCalls: number[] = []
      const oracleMapper = (x: number) => {
        oracleCalls.push(x)
        return x + 1
      }
      const oracleSteps = [A.map(oracleMapper), untagged, A.take(2)]
      const plan = buildPlan(oracleSteps)
      const expected = interpret(plan, data)

      expect(result).toEqual(expected)
      expect(calls).toEqual(oracleCalls)
    }
  })

  it("nested tagged callback (a tagged step used as another step's bound arg) stays correct", () => {
    const data = [[1, 2], [3, 4], [5]]
    for (let i = 0; i < ITERATIONS; i++) {
      // A.take(1) is itself a tagged function; using it as map's mapper is
      // structurally unusual but buildPlan only ever reads the outer step's
      // _op/_fn/_a1/_a2 -- it never inspects whether _fn itself is tagged --
      // so this must produce identical results on the fast and slow paths.
      const nested = A.take(1)
      const steps = [A.map(nested as unknown as (x: unknown) => unknown)]
      const result = pipe(data, ...(steps as [any]))

      const oracleSteps = [A.map(nested as unknown as (x: unknown) => unknown)]
      const plan = buildPlan(oracleSteps)
      const expected = interpret(plan, data)

      expect(result).toEqual(expected)
    }
  })
})

describe('pipe() fast path: take quota eligibility', () => {
  const runObjectTake = (
    execute: (source: number[], steps: readonly unknown[]) => unknown,
  ): { readonly result: unknown; readonly events: string[] } => {
    const events: string[] = []
    const source = new Proxy([1, 2, 3], {
      get(target, property, receiver) {
        if (property === 'length') events.push('source:length')
        if (typeof property === 'string' && /^\d+$/u.test(property)) {
          events.push(`source:get:${property}`)
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const count = {
      valueOf() {
        events.push('count:valueOf')
        return 2.75
      },
    }
    const steps = [
      A.map((value: number) => {
        events.push(`first:${value}`)
        return value + 1
      }),
      A.map((value: number) => {
        events.push(`second:${value}`)
        return value * 2
      }),
      A.take(count as unknown as number),
    ] as const
    return { result: execute(source, steps), events }
  }

  it('keeps an object count generic after the numeric opcode shape is warm', () => {
    __resetFusionCaches()
    pipe(
      [1, 2, 3],
      A.map((value: number) => value + 1),
      A.map((value: number) => value * 2),
      A.take(2),
    )

    const expected = runObjectTake((source, steps) => interpret(buildPlan(steps), source))
    const actual = runObjectTake((source, steps) =>
      pipe(source, ...(steps as [any, any, any])),
    )

    expect(actual).toEqual(expected)
    expect(actual.events.filter((event) => event === 'count:valueOf')).toHaveLength(3)
  })

  it('does not poison the numeric opcode shape when an object count runs first', () => {
    __resetFusionCaches()
    runObjectTake((source, steps) => pipe(source, ...(steps as [any, any, any])))

    const reads: string[] = []
    const source = new Proxy([1, 2, 3, 4], {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/u.test(property)) reads.push(property)
        return Reflect.get(target, property, receiver)
      },
    })
    const result = pipe(
      source,
      A.map((value: number) => value + 1),
      A.map((value: number) => value * 2),
      A.take(2),
    )

    expect(result).toEqual([4, 6])
    expect(reads).toEqual(['0', '1', '2'])
  })

  it('preserves a third-coercion error after a numeric front-cache hit', () => {
    __resetFusionCaches()
    pipe(
      [1, 2, 3],
      A.map((value: number) => value),
      A.map((value: number) => value),
      A.take(2),
    )

    const sentinel = new Error('third take coercion')
    const events: string[] = []
    let coercions = 0
    const count = {
      valueOf() {
        events.push(`count:${++coercions}`)
        if (coercions === 3) throw sentinel
        return 2.75
      },
    }

    expect(() =>
      pipe(
        [1, 2, 3],
        A.map((value: number) => {
          events.push(`first:${value}`)
          return value
        }),
        A.map((value: number) => {
          events.push(`second:${value}`)
          return value
        }),
        A.take(count as unknown as number),
      ),
    ).toThrow(sentinel)
    expect(events).toEqual([
      'first:1',
      'second:1',
      'first:2',
      'second:2',
      'first:3',
      'second:3',
      'count:1',
      'count:2',
      'count:3',
    ])
  })

  it('never reads the fifth step binding from mutable public metadata', () => {
    __resetFusionCaches()
    const identity = (value: number) => value
    pipe(
      [1, 2, 3],
      A.map(identity),
      A.map(identity),
      A.map(identity),
      A.map(identity),
      A.take(2),
    )

    const take = A.take(2)
    ;(take as unknown as { _fn: number })._fn = 0
    expect(take([1, 2, 3])).toEqual([1, 2])
    expect(
      pipe(
        [1, 2, 3],
        A.map(identity),
        A.map(identity),
        A.map(identity),
        A.map(identity),
        take,
      ),
    ).toEqual([1, 2])
  })
})

describe('pipe() fast path: numeric front-cache key is collision-free', () => {
  it('every registered opcode fits under NUM_KEY_BASE', () => {
    const max = Math.max(...Object.values(OP_CODES))
    expect(max).toBeGreaterThan(0)
    expect(max).toBeLessThan(NUM_KEY_BASE)
  })

  it('the widest packed key (NUM_KEY_MAX_LEN steps, all max opcode) stays a safe integer', () => {
    const max = Math.max(...Object.values(OP_CODES))
    let key = 0
    for (let i = 0; i < NUM_KEY_MAX_LEN; i++) key = key * NUM_KEY_BASE + max
    expect(Number.isSafeInteger(key)).toBe(true)
  })

  it('makes an out-of-range forged opcode generic instead of hitting a colliding shape', () => {
    // [map=1, 129] and [filter=2, map=1] both pack to 257 unless every
    // numeric-cache digit is validated before lookup.
    pipe(
      [1, 2, 3],
      A.filter((value: number) => value > 0),
      A.map((value: number) => value * 10),
    )
    const forged = A.map((value: number) => value)
    ;(forged as { _op: number })._op = NUM_KEY_BASE + 1

    // Since S5A the forged tag carries no authority at all, so the step is
    // opaque and the pipeline runs generically rather than reaching the
    // numeric cache with an unvalidated digit.
    expect(
      pipe(
        [1, 2, 3],
        A.map((value: number) => value),
        forged,
      ),
    ).toEqual([1, 2, 3])
  })

  it('6+ step pipelines (beyond the numeric-key length) still match interpret() via the string-key fallback', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    for (let i = 0; i < ITERATIONS; i++) {
      const c: Counter = { n: 0 }
      const build = () => [
        A.map((x: number) => {
          c.n++
          return x + 1
        }),
        A.filter((x: number) => x % 2 === 0),
        A.map((x: number) => x * 2),
        A.filter((x: number) => x > 2),
        A.take(10),
        A.drop(1),
      ]
      const steps = build()
      const result = pipe(data, ...(steps as [any]))

      const oc: Counter = { n: 0 }
      const oracleSteps = [
        A.map((x: number) => {
          oc.n++
          return x + 1
        }),
        A.filter((x: number) => x % 2 === 0),
        A.map((x: number) => x * 2),
        A.filter((x: number) => x > 2),
        A.take(10),
        A.drop(1),
      ]
      const plan = buildPlan(oracleSteps)
      const expected = interpret(plan, data)

      expect(result).toEqual(expected)
      expect(c.n).toBe(oc.n)
    }
  })
})

describe('pipe() fast path: plansBuilt stays flat across repeated inline calls', () => {
  it('same opcode shape, fresh closures every call: only the first call builds a plan', () => {
    resetOptimizerStats()
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    pipe(
      data,
      A.filterMap((x: number) => (x % 2 === 0 ? x : undefined)),
      A.take(3),
    )
    const afterFirst = getOptimizerStats().plansBuilt

    for (let i = 0; i < ITERATIONS; i++) {
      pipe(
        data,
        A.filterMap((x: number) => (x % 2 === 0 ? x : undefined)),
        A.take(3),
      )
      expect(getOptimizerStats().plansBuilt).toBe(afterFirst)
    }
  })
})

describe('pipe() fast path: bounded hot identity', () => {
  it('stays binding-correct while more identities than the four-entry cache are cycled', () => {
    const data = [1, 2, 3, 4, 5, 6]
    const pipelines = Array.from({ length: 7 }, (_, index) => {
      const delta = index + 1
      const limit = (index % 4) + 1
      return {
        steps: [
          A.map((value: number) => value + delta),
          A.filter((value: number) => value % 2 === index % 2),
          A.take(limit),
        ],
        delta,
        limit,
        parity: index % 2,
      }
    })

    for (let pass = 0; pass < 20; pass++) {
      for (const pipeline of pipelines) {
        const actual = pipe(data, ...(pipeline.steps as [any, any, any]))
        const expected = data
          .map((value) => value + pipeline.delta)
          .filter((value) => value % 2 === pipeline.parity)
          .slice(0, pipeline.limit)
        expect(actual).toEqual(expected)
      }
    }
  })

  it('reuses a mixed tagged/opaque hot entry without bypassing the opaque step', () => {
    const data = [1, 2, 3, 4]
    const tagged = A.map((value: number) => value * 2)
    const opaque = (values: readonly number[]) => values.join(':')

    expect(pipe(data, tagged, opaque)).toBe('2:4:6:8')
    expect(pipe(data, tagged, opaque)).toBe('2:4:6:8')
  })
})
