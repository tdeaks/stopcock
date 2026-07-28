import { describe, expect, test } from 'vite-plus/test'
import * as Iter from '../iter'
import { none, some, type Option } from '../option'

/**
 * A plain Array source runs the hand-written indexed fast plan
 * (`ArrayPlanIterator`/`executeArrayFastPlan`/`collectFastPlan`); anything
 * else runs the generic executor. For every (shape, terminal) pair both
 * paths must agree on the result and on the exact (value, index) arguments
 * each stage callback saw.
 */

type Call = readonly [stage: string, value: unknown, index: number]

interface Stages {
  readonly calls: Call[]
  readonly double: (value: unknown, index: number) => unknown
  readonly keep: (value: unknown, index: number) => boolean
  readonly halve: (value: unknown, index: number) => Option<unknown>
}

const stages = (): Stages => {
  const calls: Call[] = []
  return {
    calls,
    double: (value, index) => {
      calls.push(['map', value, index])
      return (value as number) * 2
    },
    keep: (value, index) => {
      calls.push(['filter', value, index])
      return (value as number) % 3 !== 0
    },
    halve: (value, index) => {
      calls.push(['filterMap', value, index])
      return (value as number) % 4 === 0 ? some((value as number) / 2) : none
    },
  }
}

const SHAPES = {
  map: (source: Iterable<unknown>, s: Stages) => Iter.map(s.double)(source),
  filter: (source: Iterable<unknown>, s: Stages) => Iter.filter(s.keep)(source),
  'map-filter': (source: Iterable<unknown>, s: Stages) =>
    Iter.filter(s.keep)(Iter.map(s.double)(source)),
  'map-filter-take': (source: Iterable<unknown>, s: Stages) =>
    Iter.take(3)(Iter.filter(s.keep)(Iter.map(s.double)(source))),
  'filterMap-take': (source: Iterable<unknown>, s: Stages) =>
    Iter.take(3)(Iter.filterMap(s.halve)(source)),
} as const

interface TerminalRun {
  readonly calls: Call[]
  readonly run: (plan: Iterable<unknown>) => unknown
}

const TERMINALS: Readonly<Record<string, () => TerminalRun>> = {
  toArray: () => ({ calls: [], run: (plan) => Iter.toArray(plan) }),
  toArrayInto: () => ({ calls: [], run: (plan) => Iter.toArrayInto(plan, ['seed'] as unknown[]) }),
  reduce: () => {
    const calls: Call[] = []
    return {
      calls,
      run: (plan) =>
        Iter.reduce(
          (state: string, value, index) => {
            calls.push(['reduce', value, index])
            return `${state}|${String(value)}`
          },
          'seed',
        )(plan),
    }
  },
  find: () => {
    const calls: Call[] = []
    return {
      calls,
      run: (plan) =>
        Iter.find((value, index) => {
          calls.push(['find', value, index])
          return index === 1
        })(plan),
    }
  },
  findOrUndefined: () => {
    const calls: Call[] = []
    return {
      calls,
      run: (plan) =>
        Iter.findOrUndefined((value, index) => {
          calls.push(['find', value, index])
          return index === 1
        })(plan),
    }
  },
  findAbsent: () => {
    const calls: Call[] = []
    return {
      calls,
      run: (plan) =>
        Iter.findOrUndefined((value, index) => {
          calls.push(['find', value, index])
          return false
        })(plan),
    }
  },
  some: () => {
    const calls: Call[] = []
    return {
      calls,
      run: (plan) =>
        Iter.some((value, index) => {
          calls.push(['some', value, index])
          return index === 1
        })(plan),
    }
  },
  every: () => {
    const calls: Call[] = []
    return {
      calls,
      run: (plan) =>
        Iter.every((value, index) => {
          calls.push(['every', value, index])
          return index < 1
        })(plan),
    }
  },
  count: () => ({ calls: [], run: (plan) => Iter.count(plan) }),
  forEach: () => {
    const calls: Call[] = []
    return {
      calls,
      run: (plan) => {
        Iter.forEach((value, index) => {
          calls.push(['forEach', value, index])
        })(plan)
        return undefined
      },
    }
  },
  first: () => ({ calls: [], run: (plan) => Iter.first(plan) }),
  firstOrUndefined: () => ({ calls: [], run: (plan) => Iter.firstOrUndefined(plan) }),
  last: () => ({ calls: [], run: (plan) => Iter.last(plan) }),
  lastOrUndefined: () => ({ calls: [], run: (plan) => Iter.lastOrUndefined(plan) }),
  nth: () => ({ calls: [], run: (plan) => Iter.nth(1)(plan) }),
  nthOrUndefined: () => ({ calls: [], run: (plan) => Iter.nthOrUndefined(1)(plan) }),
  nthBeyond: () => ({ calls: [], run: (plan) => Iter.nthOrUndefined(99)(plan) }),
}

const generic = (values: readonly unknown[]): Iterable<unknown> => ({
  *[Symbol.iterator]() {
    yield* values
  },
})

const INPUTS: readonly (readonly number[])[] = [
  [],
  [1],
  [1, 2, 3],
  Array.from({ length: 33 }, (_, index) => index + 1),
]

describe('the Array fast plan matches the generic executor', () => {
  for (const [shapeId, build] of Object.entries(SHAPES)) {
    for (const [terminalId, makeTerminal] of Object.entries(TERMINALS)) {
      test(`${shapeId} / ${terminalId}`, () => {
        for (const input of INPUTS) {
          const arrayStages = stages()
          const arrayTerminal = makeTerminal()
          const fromArray = arrayTerminal.run(build(input.slice(), arrayStages))

          const genericStages = stages()
          const genericTerminal = makeTerminal()
          const fromGeneric = genericTerminal.run(build(generic(input), genericStages))

          expect(fromArray).toEqual(fromGeneric)
          expect(arrayStages.calls).toEqual(genericStages.calls)
          expect(arrayTerminal.calls).toEqual(genericTerminal.calls)
        }
      })
    }
  }
})

describe('Array admission', () => {
  test('reads holes as undefined and re-reads the live length', () => {
    const sparse = [1, , 3] as unknown[]
    expect(Iter.toArray(Iter.map((value) => value)(sparse))).toEqual([1, undefined, 3])

    const growing = [1, 2]
    const seen: number[] = []
    Iter.forEach((value) => {
      seen.push(value)
      if (growing.length < 4) growing.push(growing.length + 1)
    })(Iter.map((value) => value)(growing))
    expect(seen).toEqual([1, 2, 3, 4])
  })

  test('takes the generic path for a transparent proxy', () => {
    const calls: string[] = []
    const proxy = new Proxy([1, 2, 3], {
      get(target, property, receiver) {
        calls.push(String(property))
        return Reflect.get(target, property, receiver)
      },
    })
    expect(Iter.toArray(Iter.map((value) => (value as number) * 2)(proxy))).toEqual([2, 4, 6])
    expect(calls).toContain('Symbol(Symbol.iterator)')
  })

  test('takes the generic path when an array carries its own iterator', () => {
    const shadowed = [1, 2, 3] as number[] & { [Symbol.iterator]: () => Iterator<number> }
    shadowed[Symbol.iterator] = function* (): Iterator<number> {
      yield 9
      yield 8
    }
    expect(Iter.toArray(Iter.map((value) => value * 2)(shadowed))).toEqual([18, 16])
  })

  test('runs an Array subclass on the indexed path with identical results', () => {
    class Bag extends Array<number> {}
    const bag = Bag.from([1, 2, 3]) as Bag
    expect(
      Iter.toArray(Iter.filter((value) => value > 2)(Iter.map((value) => value * 2)(bag))),
    ).toEqual([4, 6])
  })

  test('falls back for Set and generator sources', () => {
    expect(
      Iter.count(Iter.filter(() => true)(Iter.map((value) => value * 2)(new Set([1, 2, 3])))),
    ).toBe(3)
    expect(Iter.toArray(Iter.map((value) => value)(generic([1, 2])))).toEqual([1, 2])
  })
})

describe('kernel-adjacent semantics', () => {
  test('take(0) never evaluates its upstream', () => {
    let calls = 0
    const plan = Iter.take(0)(
      Iter.filter(() => true)(
        Iter.map((value) => {
          calls++
          return value
        })([1, 2, 3]),
      ),
    )
    expect(Iter.toArray(plan)).toEqual([])
    expect(Iter.count(plan)).toBe(0)
    expect(Iter.firstOrUndefined(plan)).toBeUndefined()
    expect(calls).toBe(0)
  })

  test('an early-exit terminal stops reading the source', () => {
    const reads: number[] = []
    const source = [1, 2, 3, 4, 5]
    const plan = Iter.map((value, index) => {
      reads.push(index)
      return (value as number) * 2
    })(source)
    expect(Iter.firstOrUndefined(plan)).toBe(2)
    expect(reads).toEqual([0])

    reads.length = 0
    expect(Iter.nthOrUndefined(2)(plan)).toBe(6)
    expect(reads).toEqual([0, 1, 2])
  })

  test('a throwing callback propagates and leaves no state behind', () => {
    const boom = new Error('boom')
    const plan = Iter.filter((value) => {
      if (value === 2) throw boom
      return true
    })([1, 2, 3])
    expect(() => Iter.toArray(plan)).toThrow(boom)
    expect(() => Iter.toArray(plan)).toThrow(boom)
  })

  test('repeated terminals on one plan restart every stage index', () => {
    const indexes: number[] = []
    const plan = Iter.map((value, index) => {
      indexes.push(index)
      return value
    })([1, 2, 3])
    expect(Iter.toArray(plan)).toEqual([1, 2, 3])
    expect(Iter.toArray(plan)).toEqual([1, 2, 3])
    expect(indexes).toEqual([0, 1, 2, 0, 1, 2])
  })

  test('public iteration is unchanged by fast-plan selection', () => {
    const plan = Iter.filter((value) => value > 2)(Iter.map((value) => value * 2)([1, 2, 3, 4]))
    const iterator = plan[Symbol.iterator]()
    expect(iterator.next()).toEqual({ done: false, value: 4 })
    expect(iterator.return?.()).toEqual({ done: true, value: undefined })
    expect(iterator.next()).toEqual({ done: true, value: undefined })
    expect(iterator.next()).toEqual({ done: true, value: undefined })
    expect([...plan]).toEqual([4, 6, 8])
  })

  test('a consumer that leaves a for-of early closes the nested flatMap iterator', () => {
    let closed = 0
    const nested = (value: number): Iterable<number> => ({
      [Symbol.iterator]: () => {
        let emitted = 0
        return {
          next: () => (emitted++ < 2 ? { done: false, value } : { done: true, value: undefined }),
          return: () => {
            closed++
            return { done: true, value: undefined }
          },
        } as Iterator<number>
      },
    })
    const plan = Iter.filter(() => true)(
      Iter.map((value) => value * 10)(Iter.flatMap(nested)([1, 2])),
    )
    expect(Iter.firstOrUndefined(plan)).toBe(10)
    expect(closed).toBe(1)
  })
})
