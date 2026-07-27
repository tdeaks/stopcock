import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import { compile, compilePure } from '../compile'
import * as M from '../math'

describe('compact compilePure', () => {
  it('matches stable comparator ties and preserves arbitrary surrounding segments', () => {
    const input = [
      { key: 2, id: 'a' },
      { key: 1, id: 'b' },
      { key: 2, id: 'c' },
      { key: 1, id: 'd' },
    ]
    const compare = (left: (typeof input)[number], right: (typeof input)[number]) =>
      left.key - right.key
    const steps = [
      A.reverse,
      A.sortBy(compare),
      A.take(3),
      A.reverse,
      A.map((value) => value.id),
    ] as const

    expect(compilePure(...steps)(input)).toEqual(
      A.map(A.reverse(A.take(A.sortBy(A.reverse(input), compare), 3)), (value) => value.id),
    )
    expect(compilePure(...steps)(input)).toEqual(['c', 'b', 'd'])
  })

  it('fails sort/take closed to the exact path', () => {
    const input = Array.from({ length: 32 }, (_, index) => 32 - index)
    let pureCalls = 0
    let exactCalls = 0
    const pure = compilePure(
      A.sortBy((left: number, right: number) => {
        pureCalls++
        return left - right
      }),
      A.take(1),
    )

    const result = pure(input)
    const expected = A.take(
      A.sortBy(input, (left, right) => {
        exactCalls++
        return left - right
      }),
      1,
    )

    expect(result).toEqual(expected)
    expect(pureCalls).toBe(exactCalls)
  })

  it('snapshots every source value before the first comparator call', () => {
    const events: string[] = []
    const source = new Proxy([4, 1, 3, 2], {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/u.test(property)) {
          events.push(`get:${property}`)
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const result = compilePure(
      A.sortBy((left: number, right: number) => {
        events.push(`compare:${left}:${right}`)
        return left - right
      }),
      A.take(2),
    )(source)

    expect(result).toEqual([1, 2])
    const firstComparison = events.findIndex((event) => event.startsWith('compare:'))
    const lastSourceRead = events.findLastIndex((event) => event.startsWith('get:'))
    expect(firstComparison).toBeGreaterThan(lastSourceRead)
  })

  it('keeps exact sort semantics when take shares a stream segment with a suffix map', () => {
    const input = Array.from({ length: 32 }, (_, index) => 32 - index)
    let pureCalls = 0
    let exactCalls = 0
    const result = compilePure(
      A.sortBy((left: number, right: number) => {
        pureCalls++
        return left - right
      }),
      A.take(1),
      A.map((value: number) => value * 10),
    )(input)

    expect(result).toEqual([10])
    A.take(
      A.sortBy(input, (left, right) => {
        exactCalls++
        return left - right
      }),
      1,
    )
    expect(pureCalls).toBe(exactCalls)
  })

  it('preserves a changing source-length snapshot instead of guessing top-k eligibility', () => {
    const makeSource = (events: string[]): number[] => {
      let lengthReads = 0
      return new Proxy([4, 3, 2, 1], {
        get(target, property, receiver) {
          if (property === 'length') {
            const length = ++lengthReads === 1 ? 2 : 4
            events.push(`length:${length}`)
            return length
          }
          if (typeof property === 'string' && /^\d+$/u.test(property)) {
            events.push(`get:${property}`)
          }
          return Reflect.get(target, property, receiver)
        },
        has(target, property) {
          if (typeof property === 'string' && /^\d+$/u.test(property)) {
            events.push(`has:${property}`)
          }
          return Reflect.has(target, property)
        },
      })
    }
    const directEvents: string[] = []
    const pureEvents: string[] = []

    const direct = A.take(A.sort(makeSource(directEvents)), 2)
    const pure = compilePure(A.sort, A.take(2))(makeSource(pureEvents))

    expect(pure).toEqual(direct)
    expect(pure).toEqual([3, 4])
    expect(pureEvents).toEqual(directEvents)
  })

  it('preserves errors from a custom frozen sort snapshot', () => {
    const makeSource = (): number[] =>
      Object.assign([3, 1, 2], {
        slice: () => Object.freeze([3, 1, 2]),
      })

    expect(() => A.take(A.sort(makeSource()), 1)).toThrow(TypeError)
    expect(() => compile(A.sort, A.take(1))(makeSource())).toThrow(TypeError)
    expect(() => compilePure(A.sort, A.take(1))(makeSource())).toThrow(TypeError)
  })

  it('matches the descending numeric stable sort', () => {
    const input = [3, Number.NaN, -0, 2, 2, 1]
    expect(compilePure(A.sortDesc, A.take(4))(input)).toEqual(
      A.take(A.sortDesc(input), 4),
    )
  })

  it('elides every unused map callback before length and still runs before/after segments', () => {
    const calls: string[] = []
    const runner = compilePure(
      A.reverse,
      A.map((value: number) => {
        calls.push(`first:${value}`)
        return value * 2
      }),
      A.map((value: number) => {
        calls.push(`second:${value}`)
        return String(value)
      }),
      A.length,
      M.inc,
    )

    expect(runner([1, 2, 3])).toBe(4)
    expect(calls).toEqual([])
  })

  it('elides a pure map callback without eliding dense source reads', () => {
    const reads: string[] = []
    const calls: number[] = []
    const source = new Proxy([1, 2, 3], {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/u.test(property)) reads.push(property)
        return Reflect.get(target, property, receiver)
      },
    })

    expect(
      compilePure(
        A.map((value: number) => {
          calls.push(value)
          return value * 2
        }),
        A.length,
      )(source),
    ).toBe(3)
    expect(reads).toEqual(['0', '1', '2'])
    expect(calls).toEqual([])
  })

  it('keeps exact compile callback semantics for the same map-to-length plan', () => {
    const calls: number[] = []
    const runner = compile(
      A.map((value: number) => {
        calls.push(value)
        return value * 2
      }),
      A.length,
    )

    expect(runner([1, 2, 3])).toBe(3)
    expect(calls).toEqual([1, 2, 3])
  })

  it('uses the generic compact interpreter when no pure rewrite applies', () => {
    const calls: number[] = []
    const opaque = (values: readonly number[]) => values.concat(4)
    const runner = compilePure(
      opaque,
      A.filter((value: number) => {
        calls.push(value)
        return value % 2 === 0
      }),
      A.sum,
    )

    expect(runner([1, 2, 3])).toBe(6)
    expect(calls).toEqual([1, 2, 3, 4])
  })

  it('halts at take after the frozen one-item lookahead', () => {
    for (const build of [compile, compilePure]) {
      const reads: string[] = []
      const suffixCalls: number[] = []
      const source = new Proxy([1, 2, 3], {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/u.test(property)) reads.push(property)
          return Reflect.get(target, property, receiver)
        },
      })
      const runner = build(
        A.take(1),
        A.flatMap((value: number) => [value, value + 10]),
        A.map((value: number) => {
          suffixCalls.push(value)
          return value
        }),
      )

      expect(runner(source)).toEqual([1, 11])
      expect(reads).toEqual(['0', '1'])
      expect(suffixCalls).toEqual([1, 11])
    }
  })

  it('halts a flatMap expansion at take without materializing the outer source', () => {
    for (const build of [compile, compilePure]) {
      const innerReads: string[] = []
      const outerCalls: number[] = []
      const suffixCalls: number[] = []
      const inner = new Proxy([10, 20, 30], {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/u.test(property)) {
            innerReads.push(property)
          }
          return Reflect.get(target, property, receiver)
        },
      })
      const runner = build(
        A.flatMap((value: number) => {
          outerCalls.push(value)
          return inner
        }),
        A.take(1),
        A.filter((value: number) => {
          suffixCalls.push(value)
          return false
        }),
      )

      expect(runner([1, 2, 3])).toEqual([])
      expect(innerReads).toEqual(['0', '1'])
      expect(outerCalls).toEqual([1])
      expect(suffixCalls).toEqual([10])
    }
  })

  it.each([
    ['zero', 0],
    ['negative zero', -0],
    ['negative', -2],
    ['fractional', 2.9],
    ['infinity', Number.POSITIVE_INFINITY],
    ['nan', Number.NaN],
  ])('matches sequential sort/take for %s limits', (_label, count) => {
    const input = [3, Number.NaN, -0, 2, 2, 1]
    const expected = A.take(A.sort(input), count)
    expect(compile(A.sort, A.take(count))(input)).toEqual(expected)
    expect(compilePure(A.sort, A.take(count))(input)).toEqual(expected)
  })

  it.each([
    ['negative zero', -0],
    ['fractional', 2.9],
    ['infinity', Number.POSITIVE_INFINITY],
    ['nan', Number.NaN],
  ])('normalizes primitive %s quotas symmetrically for fused take and drop', (_label, count) => {
    const input = [1, 2, 3, 4]
    for (const build of [compile, compilePure]) {
      expect(build(A.take(count))(input)).toEqual(A.take(input, count))
      expect(build(A.drop(count))(input)).toEqual(A.drop(input, count))
    }
  })

  it('reads source length before coercing a throwing take count', () => {
    const events: string[] = []
    const source = new Proxy([1, 2, 3], {
      get(target, property, receiver) {
        if (property === 'length') events.push('length')
        return Reflect.get(target, property, receiver)
      },
    })
    const throwingTake = A.take(Symbol('count') as never)

    expect(() => compile(A.map((value: number) => value), throwingTake)(source)).toThrow(TypeError)
    expect(events).toEqual(['length'])

    events.length = 0
    expect(() =>
      compilePure(A.map((value: number) => value), throwingTake)(source),
    ).toThrow(TypeError)
    expect(events).toEqual(['length'])
  })

  it('preserves all object take coercions after the upstream stream completes', () => {
    const runDirect = (): { readonly result: number[]; readonly events: string[] } => {
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
      const mapped = A.map(source, (value) => {
        events.push(`prefix:${value}`)
        return value * 2
      })
      const taken = A.take(mapped, count as unknown as number)
      const result = A.map(taken, (value) => {
        events.push(`suffix:${value}`)
        return value + 1
      })
      return { result, events }
    }

    const expected = runDirect()
    for (const build of [compile, compilePure]) {
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
      const result = build(
        A.map((value: number) => {
          events.push(`prefix:${value}`)
          return value * 2
        }),
        A.take(count as unknown as number),
        A.map((value: number) => {
          events.push(`suffix:${value}`)
          return value + 1
        }),
      )(source)

      expect({ result, events }).toEqual(expected)
      expect(events.filter((event) => event === 'count:valueOf')).toHaveLength(3)
    }
  })

  it('preserves all object drop coercions after the upstream stream completes', () => {
    const run = (
      build: typeof compile | typeof compilePure | undefined,
    ): { readonly result: number[]; readonly events: string[] } => {
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
          return 1.75
        },
      }
      if (build === undefined) {
        const prefix = A.map(source, (value) => {
          events.push(`prefix:${value}`)
          return value * 2
        })
        return {
          result: A.drop(prefix, count as unknown as number),
          events,
        }
      }
      return {
        result: build(
          A.map((value: number) => {
            events.push(`prefix:${value}`)
            return value * 2
          }),
          A.drop(count as unknown as number),
        )(source),
        events,
      }
    }

    const expected = run(undefined)
    for (const build of [compile, compilePure]) {
      const actual = run(build)
      expect(actual).toEqual(expected)
      expect(actual.events.filter((event) => event === 'count:valueOf')).toHaveLength(3)
    }
  })

  it('preserves a third-coercion take error and its exact timing', () => {
    const sentinel = new Error('third take coercion')
    const run = (
      build: typeof compile | typeof compilePure | undefined,
    ): { readonly thrown: unknown; readonly events: string[] } => {
      const events: string[] = []
      let coercions = 0
      const count = {
        valueOf() {
          events.push(`count:${++coercions}`)
          if (coercions === 3) throw sentinel
          return 2.75
        },
      }
      const source = new Proxy([1, 2, 3], {
        get(target, property, receiver) {
          if (property === 'length') events.push('source:length')
          if (typeof property === 'string' && /^\d+$/u.test(property)) {
            events.push(`source:get:${property}`)
          }
          return Reflect.get(target, property, receiver)
        },
      })
      let thrown: unknown
      try {
        if (build === undefined) {
          A.take(
            A.map(source, (value) => {
              events.push(`prefix:${value}`)
              return value
            }),
            count as unknown as number,
          )
        } else {
          build(
            A.map((value: number) => {
              events.push(`prefix:${value}`)
              return value
            }),
            A.take(count as unknown as number),
          )(source)
        }
      } catch (error) {
        thrown = error
      }
      return { thrown, events }
    }

    const expected = run(undefined)
    expect(expected.thrown).toBe(sentinel)
    for (const build of [compile, compilePure]) {
      const actual = run(build)
      expect(actual.thrown).toBe(sentinel)
      expect(actual.events).toEqual(expected.events)
    }
  })

  it('keeps pure and exact compact dense-hole semantics aligned for sort/take', () => {
    const input = Array<number>(1)
    const result = compilePure(A.sort, A.take(1))(input) as number[]
    const expected = compile(A.sort, A.take(1))(input) as number[]
    const direct = A.take(A.sort(input), 1)

    expect(result).toEqual(expected)
    expect(result).toEqual(direct)
    expect(0 in result).toBe(true)
    expect(0 in direct).toBe(false)
  })

  it('matches dense sparse-slot semantics through surrounding reverse boundaries', () => {
    const input = Array<number>(1)
    const suffixResult = compilePure(
      A.sort,
      A.take(1),
      A.reverse,
      A.reverse,
    )(input) as number[]
    const prefixResult = compilePure(
      A.reverse,
      A.reverse,
      A.sort,
      A.take(1),
    )(input) as number[]

    expect(suffixResult).toEqual([undefined])
    expect(prefixResult).toEqual([undefined])
    expect(0 in suffixResult).toBe(true)
    expect(0 in prefixResult).toBe(true)
  })

  it('retains dense-hole semantics for a second take in the suffix stream', () => {
    const input = Array<number>(3)
    const result = compilePure(A.sort, A.take(2), A.take(1))(input) as number[]
    const expected = compile(A.sort, A.take(2), A.take(1))(input) as number[]

    expect(result).toEqual(expected)
    expect(0 in result).toBe(true)
  })

})
