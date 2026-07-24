import { describe, expect, it, vi } from 'vite-plus/test'
import { none, some } from '../option'
import * as Collector from '../collector'
import * as Indexed from '../indexed'
import * as Iter from '../iter'
import * as MapOps from '../map'
import * as RecordOps from '../record'
import * as SetOps from '../set'
import * as Transducer from '../transducer'
import * as Tuple from '../tuple'
import * as TypedArray from '../typed-array'

describe('Iter', () => {
  it('is lazy, re-iterable, and supports data-first and data-last transforms', () => {
    const effect = vi.fn((value: number) => value * 2)
    const values = Iter.map(Iter.range(0, 4), effect)
    expect(effect).not.toHaveBeenCalled()
    expect(Iter.toArray(values)).toEqual([0, 2, 4, 6])
    expect(Iter.toArray(Iter.map((value: number) => value + 1)(values))).toEqual([1, 3, 5, 7])
    expect(effect).toHaveBeenCalledTimes(8)
  })

  it('keeps planned source, callback, and plan metadata opaque', () => {
    const values = Iter.map([1, 2, 3], (value) => value * 2)

    expect(Object.keys(values)).toEqual([])
    expect(Reflect.ownKeys(values)).toEqual([])
    expect({ ...values }).toEqual({})
    expect(JSON.stringify(values)).toBe('{}')
    expect(Iter.toArray(values)).toEqual([2, 4, 6])
  })

  it('brands plans without probing arbitrary iterable properties', () => {
    let hostileSymbolReads = 0
    const source = new Proxy(
      {
        *[Symbol.iterator]() {
          yield 1
          yield 2
        },
      },
      {
        get(target, key, receiver) {
          if (typeof key === 'symbol' && key !== Symbol.iterator) {
            hostileSymbolReads++
            throw new Error('private symbol probed')
          }
          return Reflect.get(target, key, receiver)
        },
      },
    )

    expect(Iter.toArray(source)).toEqual([1, 2])
    expect(Iter.toArray(Iter.map(source, (value) => value * 10))).toEqual([10, 20])
    expect(hostileSymbolReads).toBe(0)
  })

  it('uses Option for partial terminals', () => {
    expect(Iter.first(Iter.empty())).toEqual(none)
    expect(Iter.first(Iter.of(undefined))).toEqual(some(undefined))
    expect(Iter.find(Iter.range(0, 5), (value) => value > 2)).toEqual(some(3))
    expect(Iter.nth(Iter.range(0, 5), 10)).toEqual(none)
  })

  it('makes undefined-returning terminal variants explicit', () => {
    expect(Iter.firstOrUndefined(Iter.empty())).toBeUndefined()
    expect(Iter.lastOrUndefined(Iter.range(0, 3))).toBe(2)
    expect(Iter.findOrUndefined(Iter.range(0, 5), (value) => value > 2)).toBe(3)
    expect(Iter.nthOrUndefined(Iter.range(0, 5), 10)).toBeUndefined()
  })

  it('closes a source immediately when take reaches its limit', () => {
    const closed = vi.fn()
    const source = (function* () {
      try {
        yield 1
        yield 2
        yield 3
      } finally {
        closed()
      }
    })()

    const iterator = Iter.take(source, 2)[Symbol.iterator]()
    expect(iterator.next()).toEqual({ done: false, value: 1 })
    expect(iterator.next()).toEqual({ done: false, value: 2 })
    expect(closed).toHaveBeenCalledOnce()
  })

  it('closes both sides of a zip when the shorter input finishes', () => {
    const leftClosed = vi.fn()
    const rightClosed = vi.fn()
    const left = (function* () {
      try {
        yield 1
        yield 2
      } finally {
        leftClosed()
      }
    })()
    const right = (function* () {
      try {
        yield 'a'
      } finally {
        rightClosed()
      }
    })()

    expect(Iter.toArray(Iter.zip(left, right))).toEqual([[1, 'a']])
    expect(leftClosed).toHaveBeenCalledOnce()
    expect(rightClosed).toHaveBeenCalledOnce()
  })

  it('fuses planned transforms into every terminal without changing indexes', () => {
    const mappedIndexes: number[] = []
    const filteredIndexes: number[] = []
    const values = Iter.take(
      Iter.filter(
        Iter.map([1, 2, 3, 4], (value, index) => {
          mappedIndexes.push(index)
          return value * 2
        }),
        (value, index) => {
          filteredIndexes.push(index)
          return value > 2
        },
      ),
      2,
    )

    expect(Iter.toArray(values)).toEqual([4, 6])
    expect(mappedIndexes).toEqual([0, 1, 2])
    expect(filteredIndexes).toEqual([0, 1, 2])
    expect(Iter.reduce(values, (total, value) => total + value, 0)).toBe(10)
    expect(Iter.first(values)).toEqual(some(4))
    expect(Iter.last(values)).toEqual(some(6))
    expect(Iter.find(values, (value) => value === 6)).toEqual(some(6))
    expect(Iter.nth(values, 1)).toEqual(some(6))
    expect(Iter.some(values, (value) => value === 6)).toBe(true)
    expect(Iter.every(values, (value) => value % 2 === 0)).toBe(true)
    expect(Iter.count(values)).toBe(2)
  })

  it('preserves flatMap, filterMap, scan, and early source cleanup in fused terminals', () => {
    const closed = vi.fn()
    const source = (function* () {
      try {
        yield 1
        yield 2
        yield 3
      } finally {
        closed()
      }
    })()
    const values = Iter.take(
      Iter.scan(
        Iter.filterMap(
          Iter.flatMap(source, (value) => [value, value + 10]),
          (value) => (value % 2 === 0 ? some(value) : none),
        ),
        (total, value) => total + value,
        0,
      ),
      2,
    )

    expect(Iter.toArray(values)).toEqual([2, 14])
    expect(closed).toHaveBeenCalledOnce()
  })

  it('does not open or evaluate an upstream plan for take(0)', () => {
    const opened = vi.fn()
    const mapped = vi.fn((value: number) => value * 2)
    const source = {
      *[Symbol.iterator]() {
        opened()
        yield 1
      },
    }

    expect(Iter.toArray(Iter.take(Iter.map(source, mapped), 0))).toEqual([])
    expect(opened).not.toHaveBeenCalled()
    expect(mapped).not.toHaveBeenCalled()
  })

  it('appends into an existing destination without counting its existing values toward take', () => {
    const target = [0]
    expect(
      Iter.toArrayInto(
        Iter.take(
          Iter.map([1, 2, 3], (value) => value * 2),
          2,
        ),
        target,
      ),
    ).toBe(target)
    expect(target).toEqual([0, 2, 4])
  })

  it('keeps the broadened array fast paths identical to generic iterable execution', () => {
    const sourceValues = [1, 2, 3, 4, 5, 6]
    const genericSource = (): Iterable<number> => ({
      *[Symbol.iterator]() {
        yield* sourceValues
      },
    })
    const run = (source: Iterable<number>, events: string[]): number[] => {
      const dropped = Iter.dropWhile(source, (value, index) => {
        events.push(`dropWhile:${value}:${index}`)
        return value < 3
      })
      const bounded = Iter.takeWhile(dropped, (value, index) => {
        events.push(`takeWhile:${value}:${index}`)
        return value < 6
      })
      const scanned = Iter.scan(
        bounded,
        (total, value, index) => {
          events.push(`scan:${value}:${index}`)
          return total + value
        },
        0,
      )
      return Iter.toArray(
        Iter.filterMap(scanned, (value, index) => {
          events.push(`filterMap:${value}:${index}`)
          return value % 2 === 1 ? some(value * 10) : none
        }),
      )
    }

    const expectedEvents: string[] = []
    const actualEvents: string[] = []
    expect(run(sourceValues, actualEvents)).toEqual(run(genericSource(), expectedEvents))
    expect(actualEvents).toEqual(expectedEvents)

    const flatMapRun = (source: Iterable<number>, events: string[]): number[] =>
      Iter.toArray(
        Iter.filter(
          Iter.map(
            Iter.flatMap(source, (value, index) => {
              events.push(`flatMap:${value}:${index}`)
              return [value, value + 10]
            }),
            (value, index) => {
              events.push(`map:${value}:${index}`)
              return value + index
            },
          ),
          (value, index) => {
            events.push(`filter:${value}:${index}`)
            return (value + index) % 3 !== 0
          },
        ),
      )
    const expectedFlatMapEvents: string[] = []
    const actualFlatMapEvents: string[] = []
    expect(flatMapRun(sourceValues, actualFlatMapEvents)).toEqual(
      flatMapRun(genericSource(), expectedFlatMapEvents),
    )
    expect(actualFlatMapEvents).toEqual(expectedFlatMapEvents)
  })

  it('supports replayable Set and generator-factory sources through broad plans', () => {
    const build = (source: Iterable<number>): Iter.Iter<number> => {
      let values: Iterable<number> = source
      for (let stage = 0; stage < 12; stage++) {
        values =
          stage % 3 === 1
            ? Iter.filter(values, (value, index) => (value + index + stage) % 5 !== 0)
            : Iter.map(values, (value, index) => value + ((index + stage) % 3))
      }
      return values
    }

    const expected = Iter.toArray(build(new Set([1, 2, 3, 4, 5, 6])))
    const generatorValues = Iter.defer(function* () {
      yield* [1, 2, 3, 4, 5, 6]
    })
    const generatorPlan = build(generatorValues)

    expect(Iter.toArray(generatorPlan)).toEqual(expected)
    expect(Iter.toArray(generatorPlan)).toEqual(expected)
    expect(Iter.reduce(generatorPlan, (total, value) => total + value, 0)).toBe(
      expected.reduce((total, value) => total + value, 0),
    )
    expect(Iter.find(generatorPlan, () => false)).toEqual(none)
  })

  it('direct array iteration stays lazy and preserves stage-local callback indexes', () => {
    const events: string[] = []
    const values = Iter.take(
      Iter.filter(
        Iter.map([1, 2, 3, 4], (value, index) => {
          events.push(`map:${value}:${index}`)
          return value * 2
        }),
        (value, index) => {
          events.push(`filter:${value}:${index}`)
          return value > 2
        },
      ),
      2,
    )
    const iterator = values[Symbol.iterator]()

    expect(events).toEqual([])
    expect(iterator.next()).toEqual({ done: false, value: 4 })
    expect(events).toEqual(['map:1:0', 'filter:2:0', 'map:2:1', 'filter:4:1'])
    expect(iterator.next()).toEqual({ done: false, value: 6 })
    expect(iterator.next()).toEqual({ done: true, value: undefined })
    expect(events).toEqual([
      'map:1:0',
      'filter:2:0',
      'map:2:1',
      'filter:4:1',
      'map:3:2',
      'filter:6:2',
    ])
  })

  it('closes generic and nested iterators through the specialized early-exit paths', () => {
    const takeWhileEvents: string[] = []
    const takeWhileSource = (function* () {
      try {
        yield 1
        yield 2
        yield 3
      } finally {
        takeWhileEvents.push('source:close')
      }
    })()

    expect(Iter.toArray(Iter.takeWhile(takeWhileSource, (value) => value < 2))).toEqual([1])
    expect(takeWhileEvents).toEqual(['source:close'])

    const flatMapEvents: string[] = []
    const flatMapSource = (function* () {
      try {
        yield 1
        yield 2
      } finally {
        flatMapEvents.push('source:close')
      }
    })()
    const values = Iter.filter(
      Iter.map(
        Iter.flatMap(flatMapSource, (value) =>
          (function* () {
            try {
              yield value * 10
              yield value * 10 + 1
            } finally {
              flatMapEvents.push(`nested:${value}:close`)
            }
          })(),
        ),
        (value) => value,
      ),
      () => true,
    )

    expect(Iter.first(values)).toEqual(some(10))
    expect(flatMapEvents).toEqual(['nested:1:close', 'source:close'])
  })

  it('preserves custom array iteration instead of applying indexed array fast paths', () => {
    const source = [1, 2, 3]
    Object.defineProperty(source, Symbol.iterator, {
      value: function* () {
        yield 3
        yield 1
      },
    })

    expect(Iter.toArray(Iter.map(source, (value) => value * 10))).toEqual([30, 10])
  })

  it('reads an Array proxy iterator once and preserves its custom values', () => {
    let iteratorReads = 0
    const source = new Proxy([1, 2, 3], {
      get(target, key, receiver) {
        if (key === Symbol.iterator) {
          iteratorReads++
          return function* () {
            yield 99
          }
        }
        return Reflect.get(target, key, receiver)
      },
      getOwnPropertyDescriptor(target, key) {
        if (key === Symbol.iterator) return undefined
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    const values = Iter.map(source, (value) => value)

    expect(Array.from(values)).toEqual([99])
    expect(iteratorReads).toBe(1)
    iteratorReads = 0
    expect(Iter.toArray(values)).toEqual([99])
    expect(iteratorReads).toBe(1)

    iteratorReads = 0
    expect(Iter.toArray(Iter.take(values, 1))).toEqual([99])
    expect(iteratorReads).toBe(1)
  })

  it('keeps take cleanup ordered before downstream callbacks for arbitrary iterators', () => {
    const events: string[] = []
    const source = {
      [Symbol.iterator](): Iterator<number> {
        let index = 0
        return {
          next() {
            events.push('next')
            return index++ < 2 ? { done: false, value: index } : { done: true, value: undefined }
          },
          return() {
            events.push('close')
            return { done: true, value: undefined }
          },
        }
      },
    }
    const values = Iter.map(
      Iter.take(
        Iter.map(source, (value) => {
          events.push('before-take')
          return value
        }),
        1,
      ),
      (value) => {
        events.push('after-take')
        return value
      },
    )

    expect(Iter.toArray(values)).toEqual([1])
    expect(events).toEqual(['next', 'before-take', 'close', 'after-take'])
  })

  it('observes array growth while a specialized take pipeline is running', () => {
    const source = [1]
    const values = Iter.take(
      Iter.map(source, (value) => {
        if (source.length < 3) source.push(source.length + 1)
        return value
      }),
      3,
    )

    expect(Iter.toArray(values)).toEqual([1, 2, 3])

    const terminalSource = [1]
    const seen: number[] = []
    Iter.forEach(Iter.take(terminalSource, 3), (value) => {
      seen.push(value)
      if (terminalSource.length < 3) terminalSource.push(terminalSource.length + 1)
    })
    expect(seen).toEqual([1, 2, 3])
  })

  it('invokes planned callbacks with the same undefined receiver as generators', () => {
    const receivers: unknown[] = []
    const values = Iter.scan(
      Iter.dropWhile(
        Iter.filterMap(
          Iter.map([1, 2, 3], function (value) {
            receivers.push(this)
            return value * 2
          }),
          function (value) {
            receivers.push(this)
            return some(value)
          },
        ),
        function () {
          receivers.push(this)
          return false
        },
      ),
      function (total, value) {
        receivers.push(this)
        return total + value
      },
      0,
    )

    expect(Iter.toArray(values)).toEqual([2, 6, 12])
    expect(receivers).toHaveLength(10)
    expect(receivers.every((receiver) => receiver === undefined)).toBe(true)
  })

  it('honours an observable return added to the native array iterator', () => {
    const iteratorPrototype = Object.getPrototypeOf([][Symbol.iterator]()) as object
    const previous = Object.getOwnPropertyDescriptor(iteratorPrototype, 'return')
    let closed = 0
    let result: ReturnType<typeof Iter.first<number>>
    try {
      Object.defineProperty(iteratorPrototype, 'return', {
        configurable: true,
        value() {
          closed++
          return { done: true, value: undefined }
        },
      })
      result = Iter.first(Iter.map([1, 2, 3], (value) => value * 2))
    } finally {
      if (previous) Object.defineProperty(iteratorPrototype, 'return', previous)
      else Reflect.deleteProperty(iteratorPrototype, 'return')
    }

    expect(result!).toEqual(some(2))
    expect(closed).toBe(1)
  })

  it('ignores malformed filterMap tags just like the public generator path', () => {
    const values = Iter.filterMap([1, 2], () => ({ _tag: 2, value: 99 }) as never)
    expect(Array.from(values)).toEqual([])
    expect(Iter.toArray(values)).toEqual([])
  })

  it('keeps every three-stage plan differential with its public iterator', () => {
    const stageKinds = [
      'map',
      'filter',
      'filterMap',
      'flatMap',
      'take',
      'drop',
      'takeWhile',
      'dropWhile',
      'scan',
    ] as const
    type StageKind = (typeof stageKinds)[number]

    const build = (
      kinds: readonly StageKind[],
      sourceKind: 'array' | 'iterator',
      events: string[],
    ): Iterable<number> => {
      let values: Iterable<number>
      if (sourceKind === 'array') {
        values = [1, 2, 3, 4]
      } else {
        values = {
          [Symbol.iterator](): Iterator<number> {
            let index = 0
            return {
              next() {
                events.push(`source:next:${index}`)
                return index < 4
                  ? { done: false, value: ++index }
                  : { done: true, value: undefined }
              },
              return() {
                events.push('source:close')
                return { done: true, value: undefined }
              },
            }
          },
        }
      }

      for (let position = 0; position < kinds.length; position++) {
        const kind = kinds[position]
        switch (kind) {
          case 'map':
            values = Iter.map(values, (value, index) => {
              events.push(`${position}:map:${value}:${index}`)
              return value * 2 + index
            })
            break
          case 'filter':
            values = Iter.filter(values, (value, index) => {
              events.push(`${position}:filter:${value}:${index}`)
              return (value + index + position) % 3 !== 0
            })
            break
          case 'filterMap':
            values = Iter.filterMap(values, (value, index) => {
              events.push(`${position}:filterMap:${value}:${index}`)
              return (value + index + position) % 2 === 0 ? some(value - index) : none
            })
            break
          case 'flatMap':
            values = Iter.flatMap(values, (value, index) => {
              events.push(`${position}:flatMap:${value}:${index}`)
              return [value, value + index + 1]
            })
            break
          case 'take':
            values = Iter.take(values, [2, 1, 3][position] ?? 2)
            break
          case 'drop':
            values = Iter.drop(values, position % 2)
            break
          case 'takeWhile':
            values = Iter.takeWhile(values, (value, index) => {
              events.push(`${position}:takeWhile:${value}:${index}`)
              return value + index < 12 + position
            })
            break
          case 'dropWhile':
            values = Iter.dropWhile(values, (value, index) => {
              events.push(`${position}:dropWhile:${value}:${index}`)
              return value + index < 3 + position
            })
            break
          case 'scan':
            values = Iter.scan(
              values,
              (total, value, index) => {
                events.push(`${position}:scan:${value}:${index}`)
                return total + value + index
              },
              position,
            )
            break
        }
      }
      return values
    }

    for (const sourceKind of ['array', 'iterator'] as const) {
      for (const first of stageKinds) {
        for (const second of stageKinds) {
          for (const third of stageKinds) {
            const stages = [first, second, third] as const
            const expectedEvents: string[] = []
            const expectedPlan = build(stages, sourceKind, expectedEvents)
            const expected = Array.from({
              [Symbol.iterator]: () => expectedPlan[Symbol.iterator](),
            })

            const actualEvents: string[] = []
            const actual = Iter.toArray(build(stages, sourceKind, actualEvents))
            const label = `${sourceKind}:${stages.join('-')}`
            expect(actual, label).toEqual(expected)
            expect(actualEvents, `${label}:events`).toEqual(expectedEvents)
          }
        }
      }
    }
  })

  it('keeps every fused terminal differential, including short-circuit cleanup', () => {
    type Terminal = (values: Iterable<number>, events: string[]) => unknown
    const terminals: ReadonlyArray<readonly [string, Terminal]> = [
      ['toArray', (values) => Iter.toArray(values)],
      ['toArrayInto', (values) => Iter.toArrayInto(values, [-1])],
      [
        'reduce',
        (values, events) =>
          Iter.reduce(
            values,
            (total, value, index) => {
              events.push(`terminal:reduce:${value}:${index}`)
              return total + value
            },
            0,
          ),
      ],
      ['firstOrUndefined', (values) => Iter.firstOrUndefined(values)],
      ['first', (values) => Iter.first(values)],
      ['lastOrUndefined', (values) => Iter.lastOrUndefined(values)],
      ['last', (values) => Iter.last(values)],
      [
        'findOrUndefined',
        (values, events) =>
          Iter.findOrUndefined(values, (value, index) => {
            events.push(`terminal:findOrUndefined:${value}:${index}`)
            return value > 10
          }),
      ],
      [
        'find',
        (values, events) =>
          Iter.find(values, (value, index) => {
            events.push(`terminal:find:${value}:${index}`)
            return value > 10
          }),
      ],
      ['nthOrUndefined', (values) => Iter.nthOrUndefined(values, 2)],
      ['nth', (values) => Iter.nth(values, 2)],
      [
        'some',
        (values, events) =>
          Iter.some(values, (value, index) => {
            events.push(`terminal:some:${value}:${index}`)
            return value > 10
          }),
      ],
      [
        'every',
        (values, events) =>
          Iter.every(values, (value, index) => {
            events.push(`terminal:every:${value}:${index}`)
            return value < 20
          }),
      ],
      ['count', (values) => Iter.count(values)],
      [
        'forEach',
        (values, events) => {
          const output: number[] = []
          Iter.forEach(values, (value, index) => {
            events.push(`terminal:forEach:${value}:${index}`)
            output.push(value)
          })
          return output
        },
      ],
    ]

    const build = (sourceKind: 'array' | 'iterator', events: string[]): Iterable<number> => {
      const source: Iterable<number> =
        sourceKind === 'array'
          ? [1, 2, 3, 4, 5]
          : {
              [Symbol.iterator](): Iterator<number> {
                let index = 0
                return {
                  next() {
                    events.push(`source:next:${index}`)
                    return index < 5
                      ? { done: false, value: ++index }
                      : { done: true, value: undefined }
                  },
                  return() {
                    events.push('source:close')
                    return { done: true, value: undefined }
                  },
                }
              },
            }

      return Iter.takeWhile(
        Iter.scan(
          Iter.dropWhile(
            Iter.flatMap(
              Iter.filterMap(
                Iter.map(source, (value, index) => {
                  events.push(`map:${value}:${index}`)
                  return value * 3
                }),
                (value, index) => {
                  events.push(`filterMap:${value}:${index}`)
                  return index % 2 === 0 ? some(value + index) : none
                },
              ),
              (value, index) => {
                events.push(`flatMap:${value}:${index}`)
                return [value, value + index + 1]
              },
            ),
            (value, index) => {
              events.push(`dropWhile:${value}:${index}`)
              return value < 4
            },
          ),
          (total, value, index) => {
            events.push(`scan:${value}:${index}`)
            return total + value
          },
          0,
        ),
        (value, index) => {
          events.push(`takeWhile:${value}:${index}`)
          return value < 40
        },
      )
    }

    for (const sourceKind of ['array', 'iterator'] as const) {
      for (const [name, terminal] of terminals) {
        const expectedEvents: string[] = []
        const expectedPlan = build(sourceKind, expectedEvents)
        const expected = terminal(
          { [Symbol.iterator]: () => expectedPlan[Symbol.iterator]() },
          expectedEvents,
        )

        const actualEvents: string[] = []
        const actual = terminal(build(sourceKind, actualEvents), actualEvents)
        const label = `${sourceKind}:${name}`
        expect(actual, label).toEqual(expected)
        expect(actualEvents, `${label}:events`).toEqual(expectedEvents)
      }
    }
  })

  it('closes nested flatMap iterators before their source on early exit and errors', () => {
    const makeValues = (events: string[]): Iterable<number> => {
      const source = {
        [Symbol.iterator](): Iterator<number> {
          let index = 0
          return {
            next() {
              events.push(`source:next:${index}`)
              return index++ < 2 ? { done: false, value: index } : { done: true, value: undefined }
            },
            return() {
              events.push('source:close')
              return { done: true, value: undefined }
            },
          }
        },
      }
      return Iter.map(
        Iter.flatMap(source, (outer) => ({
          [Symbol.iterator](): Iterator<number> {
            let index = 0
            return {
              next() {
                events.push(`inner:${outer}:next:${index}`)
                return index++ < 2
                  ? { done: false, value: outer * 10 + index }
                  : { done: true, value: undefined }
              },
              return() {
                events.push(`inner:${outer}:close`)
                return { done: true, value: undefined }
              },
            }
          },
        })),
        (value) => value,
      )
    }

    const earlyEvents: string[] = []
    expect(Iter.first(makeValues(earlyEvents))).toEqual(some(11))
    expect(earlyEvents).toEqual([
      'source:next:0',
      'inner:1:next:0',
      'inner:1:close',
      'source:close',
    ])

    const errorEvents: string[] = []
    const error = new Error('terminal failed')
    expect(() =>
      Iter.forEach(makeValues(errorEvents), () => {
        throw error
      }),
    ).toThrow(error)
    expect(errorEvents).toEqual([
      'source:next:0',
      'inner:1:next:0',
      'inner:1:close',
      'source:close',
    ])
  })

  it('preserves cleanup timing when take is before or after flatMap', () => {
    const makeSource = (events: string[]): Iterable<number> => ({
      [Symbol.iterator](): Iterator<number> {
        let emitted = false
        return {
          next() {
            events.push('source:next')
            if (emitted) return { done: true, value: undefined }
            emitted = true
            return { done: false, value: 1 }
          },
          return() {
            events.push('source:close')
            return { done: true, value: undefined }
          },
        }
      },
    })

    const beforeEvents: string[] = []
    const before = Iter.map(
      Iter.flatMap(Iter.take(makeSource(beforeEvents), 1), (value) => {
        beforeEvents.push('flatMap')
        return [value, value + 1]
      }),
      (value) => {
        beforeEvents.push(`downstream:${value}`)
        return value
      },
    )
    expect(Iter.toArray(before)).toEqual([1, 2])
    expect(beforeEvents).toEqual([
      'source:next',
      'source:close',
      'flatMap',
      'downstream:1',
      'downstream:2',
    ])

    const afterEvents: string[] = []
    const after = Iter.map(
      Iter.take(
        Iter.flatMap(makeSource(afterEvents), () => ({
          [Symbol.iterator](): Iterator<number> {
            let emitted = false
            return {
              next() {
                afterEvents.push('inner:next')
                if (emitted) return { done: true, value: undefined }
                emitted = true
                return { done: false, value: 10 }
              },
              return() {
                afterEvents.push('inner:close')
                return { done: true, value: undefined }
              },
            }
          },
        })),
        1,
      ),
      (value) => {
        afterEvents.push('downstream')
        return value
      },
    )
    expect(Iter.toArray(after)).toEqual([10])
    expect(afterEvents).toEqual([
      'source:next',
      'inner:next',
      'inner:close',
      'source:close',
      'downstream',
    ])

    const arrayEvents: string[] = []
    const afterArray = Iter.map(
      Iter.take(
        Iter.flatMap([1], () => ({
          [Symbol.iterator](): Iterator<number> {
            return {
              next() {
                arrayEvents.push('inner:next')
                return { done: false, value: 10 }
              },
              return() {
                arrayEvents.push('inner:close')
                return { done: true, value: undefined }
              },
            }
          },
        })),
        1,
      ),
      (value) => {
        arrayEvents.push('downstream')
        return value
      },
    )
    expect(Iter.toArray(afterArray)).toEqual([10])
    expect(arrayEvents).toEqual(['inner:next', 'inner:close', 'downstream'])
  })

  it('closes a single-use source when any planned callback throws', () => {
    const callbackStages = [
      'map',
      'filter',
      'filterMap',
      'flatMap',
      'takeWhile',
      'dropWhile',
      'scan',
    ] as const

    for (const stage of callbackStages) {
      const events: string[] = []
      const error = new Error(stage)
      const source = {
        [Symbol.iterator](): Iterator<number> {
          return {
            next() {
              events.push('source:next')
              return { done: false, value: 1 }
            },
            return() {
              events.push('source:close')
              return { done: true, value: undefined }
            },
          }
        },
      }
      const fail = (): never => {
        events.push(`${stage}:throw`)
        throw error
      }
      let values: Iterable<unknown>
      switch (stage) {
        case 'map':
          values = Iter.map(source, fail)
          break
        case 'filter':
          values = Iter.filter(source, fail)
          break
        case 'filterMap':
          values = Iter.filterMap(source, fail)
          break
        case 'flatMap':
          values = Iter.flatMap(source, fail)
          break
        case 'takeWhile':
          values = Iter.takeWhile(source, fail)
          break
        case 'dropWhile':
          values = Iter.dropWhile(source, fail)
          break
        case 'scan':
          values = Iter.scan(source, fail, 0)
          break
      }

      expect(() => Iter.toArray(values), stage).toThrow(error)
      expect(events, stage).toEqual(['source:next', `${stage}:throw`, 'source:close'])
    }
  })

  it('does not accidentally make a single-use source re-iterable', () => {
    let closed = 0
    const source = (function* () {
      try {
        yield 1
        yield 2
      } finally {
        closed++
      }
    })()
    const values = Iter.scan(
      Iter.flatMap(source, (value) => [value, value * 10]),
      (total, value) => total + value,
      0,
    )

    expect(Iter.toArray(values)).toEqual([1, 11, 13, 33])
    expect(Iter.toArray(values)).toEqual([])
    expect(closed).toBe(1)
  })

  it('keeps the fused terminal executor differential with the public iterator', () => {
    const sources: Array<Iter.Iter<number>> = [
      Iter.map([1, 2, 3, 4, 5], (value, index) => value + index),
      Iter.take(
        Iter.drop(
          Iter.filter(
            Iter.map([1, 2, 3, 4, 5], (value) => value * 3),
            (value) => value % 2 === 0,
          ),
          1,
        ),
        2,
      ),
      Iter.takeWhile(
        Iter.dropWhile([1, 2, 3, 4, 5], (value) => value < 3),
        (value) => value < 5,
      ),
      Iter.scan(
        Iter.flatMap([1, 2, 3], (value) => [value, value + 10]),
        (total, value) => total + value,
        0,
      ),
      Iter.filterMap([0, 1, 2, 3], (value) => (value % 2 === 0 ? some(value * 10) : none)),
    ]

    for (const source of sources) {
      const expected = Array.from(source)
      expect(Iter.toArray(source)).toEqual(expected)
      expect(Iter.reduce(source, (output, value) => [...output, value], [] as number[])).toEqual(
        expected,
      )
      expect(Iter.count(source)).toBe(expected.length)
      expect(Iter.first(source)).toEqual(expected.length === 0 ? none : some(expected[0]))
      expect(Iter.last(source)).toEqual(
        expected.length === 0 ? none : some(expected[expected.length - 1]),
      )
    }
  })
})

describe('transducers and collectors', () => {
  it('composes a single-pass transformation with early cleanup', () => {
    const closed = vi.fn()
    const source = (function* () {
      try {
        let value = 0
        while (true) yield value++
      } finally {
        closed()
      }
    })()
    const transform = Transducer.compose(
      Transducer.filter<number>((value) => value % 2 === 0),
      Transducer.map((value: number) => value * 10),
      Transducer.take<number>(3),
    )

    expect(Transducer.intoArray(source, transform)).toEqual([0, 20, 40])
    expect(closed).toHaveBeenCalledOnce()
  })

  it('supports explicit destination reuse', () => {
    const target = [1]
    expect(
      Transducer.intoArrayInto(
        [2, 3],
        Transducer.map((value: number) => value * 2),
        target,
      ),
    ).toBe(target)
    expect(target).toEqual([1, 4, 6])

    const set = new Set([0])
    expect(Collector.collect([1, 1, 2], Collector.setInto(set))).toBe(set)
    expect(Array.from(set)).toEqual([0, 1, 2])
  })

  it('keeps the map-filter-take fast path replayable across arrays, Sets, and generators', () => {
    const events: string[] = []
    const transform = Transducer.compose(
      Transducer.map((value: number) => {
        events.push(`map:${value}`)
        return value * 2
      }),
      Transducer.filter((value: number) => {
        events.push(`filter:${value}`)
        return value % 3 !== 0
      }),
      Transducer.take<number>(3),
    )
    const expected = [2, 4, 8]

    expect(Transducer.intoArray([1, 2, 3, 4, 5], transform)).toEqual(expected)
    expect(events).toEqual([
      'map:1',
      'filter:2',
      'map:2',
      'filter:4',
      'map:3',
      'filter:6',
      'map:4',
      'filter:8',
    ])
    events.length = 0
    expect(Transducer.intoArray(new Set([1, 2, 3, 4, 5]), transform)).toEqual(expected)
    events.length = 0
    expect(
      Transducer.intoArray(
        {
          *[Symbol.iterator]() {
            yield* [1, 2, 3, 4, 5]
          },
        },
        transform,
      ),
    ).toEqual(expected)
    expect(Transducer.intoArray([1, 2, 3, 4, 5], transform)).toEqual(expected)
  })

  it('preserves custom array iteration and closes callback failures in transducer fast paths', () => {
    const customArray = [1, 2, 3]
    let iteratorReads = 0
    Object.defineProperty(customArray, Symbol.iterator, {
      value() {
        iteratorReads++
        return [9, 8][Symbol.iterator]()
      },
    })
    const identityTransform = Transducer.compose(
      Transducer.map((value: number) => value),
      Transducer.filter((value: number) => value > 0),
      Transducer.take<number>(2),
    )
    expect(Transducer.intoArray(customArray, identityTransform)).toEqual([9, 8])
    expect(iteratorReads).toBe(1)

    const closed = vi.fn()
    const error = new Error('map failed')
    const source = (function* () {
      try {
        yield 1
        yield 2
      } finally {
        closed()
      }
    })()
    const failingTransform = Transducer.compose(
      Transducer.map((_value: number): number => {
        throw error
      }),
      Transducer.filter((value: number) => value > 0),
      Transducer.take<number>(1),
    )
    expect(() => Transducer.intoArray(source, failingTransform)).toThrow(error)
    expect(closed).toHaveBeenCalledOnce()
  })

  it('keeps stateful fallback transforms replayable', () => {
    const transform = Transducer.compose(
      Transducer.dropWhile((value: number) => value < 2),
      Transducer.distinct<number>(),
      Transducer.take<number>(2),
    )
    expect(Transducer.intoArray([1, 1, 2, 2, 3, 3, 4], transform)).toEqual([2, 3])
    expect(Transducer.intoArray([1, 2, 2, 4], transform)).toEqual([2, 4])
  })

  it('preserves arbitrary transducers, reducers, and collectors outside branded fast paths', () => {
    const events: string[] = []
    const custom: Transducer.Transducer<number, number> = (reducer) => ({
      init: () => {
        events.push('transducer:init')
        return reducer.init()
      },
      step: (state, value) => {
        events.push(`transducer:step:${value}`)
        return reducer.step(state, value + 1)
      },
      complete: (state) => {
        events.push('transducer:complete')
        return reducer.complete(state)
      },
    })
    const reducer: Transducer.Reducer<number, number, string> = {
      init: () => {
        events.push('reducer:init')
        return 0
      },
      step: (state, value) => {
        events.push(`reducer:step:${value}`)
        return state + value
      },
      complete: (state) => {
        events.push(`reducer:complete:${state}`)
        return String(state)
      },
    }

    expect(Transducer.transduce([1, 2], custom, reducer)).toBe('5')
    expect(events).toEqual([
      'transducer:init',
      'reducer:init',
      'transducer:step:1',
      'reducer:step:2',
      'transducer:step:2',
      'reducer:step:3',
      'transducer:complete',
      'reducer:complete:5',
    ])

    const collectorEvents: string[] = []
    const collector: Collector.Collector<number, number, number> = {
      init: () => 1,
      add: (state, value) => {
        collectorEvents.push(`add:${state}:${value}`)
        return state * value
      },
      finish: (state) => {
        collectorEvents.push(`finish:${state}`)
        return state
      },
    }
    expect(Collector.collect([2, 3], collector)).toBe(6)
    expect(collectorEvents).toEqual(['add:1:2', 'add:2:3', 'finish:6'])
  })

  it('falls back when built-in reducer or collector methods are replaced', () => {
    const transform = Transducer.compose(
      Transducer.map((value: number) => value),
      Transducer.filter((value: number) => value > 0),
      Transducer.take<number>(2),
    )
    const reducer = Transducer.arrayReducer<number>()
    Object.defineProperty(reducer, 'step', {
      value(state: number[], value: number) {
        state.push(value * 10)
        return state
      },
    })
    expect(Transducer.transduce([1, 2, 3], transform, reducer)).toEqual([10, 20])

    const collector = Collector.array<number>()
    Object.defineProperty(collector, 'add', {
      value(state: number[], value: number) {
        state.push(value * 10)
        return state
      },
    })
    expect(Collector.collect([1, 2], collector)).toEqual([10, 20])
    expect(Collector.collectTransduced([1, 2], transform, collector)).toEqual([10, 20])
  })

  it('preserves custom array iteration and closes failures in collector fast paths', () => {
    const customArray = [1, 2, 3]
    let iteratorReads = 0
    Object.defineProperty(customArray, Symbol.iterator, {
      value() {
        iteratorReads++
        return [9, 8][Symbol.iterator]()
      },
    })
    expect(Collector.collect(customArray, Collector.array())).toEqual([9, 8])
    expect(iteratorReads).toBe(1)

    const closed = vi.fn()
    const source = (function* () {
      try {
        yield 1
        yield 2
      } finally {
        closed()
      }
    })()
    const frozen = Object.freeze([]) as unknown as number[]
    expect(() => Collector.collect(source, Collector.arrayInto(frozen))).toThrow()
    expect(closed).toHaveBeenCalledOnce()
  })

  it('reuses collector destinations through transduced array collection', () => {
    const target = [-1]
    const result = Collector.collectTransduced(
      [1, 2, 3, 4],
      Transducer.compose(
        Transducer.map((value: number) => value * 2),
        Transducer.filter((value: number) => value > 2),
        Transducer.take<number>(2),
      ),
      Collector.arrayInto(target),
    )
    expect(result).toBe(target)
    expect(target).toEqual([-1, 4, 6])
  })

  it('uses collectors directly as transducer terminals', () => {
    expect(
      Collector.collectTransduced(
        [1, 2, 3],
        Transducer.map((value: number) => String(value)),
        Collector.join(':'),
      ),
    ).toBe('1:2:3')
  })

  it('exposes transduced output as a lazy iterable', () => {
    const effect = vi.fn((value: number) => value * 2)
    const output = Transducer.eduction(
      [1, 2, 3],
      Transducer.compose(Transducer.map(effect), Transducer.take<number>(2)),
    )
    expect(effect).not.toHaveBeenCalled()
    expect(Array.from(output)).toEqual([2, 4])
    expect(effect).toHaveBeenCalledTimes(2)
  })

  it('collects records with no prototype and short-circuits first', () => {
    const record = Collector.collect(
      [
        ['__proto__', 1],
        ['safe', 2],
      ] as const,
      Collector.record<number>(),
    )
    expect(Object.getPrototypeOf(record)).toBeNull()
    expect(record.__proto__).toBe(1)

    const closed = vi.fn()
    const source = (function* () {
      try {
        yield 1
        yield 2
      } finally {
        closed()
      }
    })()
    expect(Collector.collect(source, Collector.first())).toEqual(some(1))
    expect(closed).toHaveBeenCalledOnce()
  })
})

describe('Record', () => {
  it('creates null-prototype immutable results and preserves symbol keys', () => {
    const symbol = Symbol('value')
    const source = { a: 1, [symbol]: 2 }
    const mapped = RecordOps.map(source, (value) => value * 10)

    expect(Object.getPrototypeOf(mapped)).toBeNull()
    expect(mapped.a).toBe(10)
    expect(mapped[symbol]).toBe(20)
    expect(source).toEqual({ a: 1, [symbol]: 2 })
  })

  it('handles dangerous and numeric keys as data', () => {
    const record = RecordOps.fromEntries([
      ['__proto__', 1],
      [1, 2],
    ])
    expect(Object.getPrototypeOf(record)).toBeNull()
    expect(RecordOps.get(record, '__proto__')).toEqual(some(1))
    expect(RecordOps.getOrUndefined(record, '__proto__')).toBe(1)
    expect(RecordOps.getOrUndefined(record, 'missing')).toBeUndefined()
    const presentUndefined = RecordOps.fromEntries([['present', undefined]])
    expect(RecordOps.get(presentUndefined, 'present')).toEqual(some(undefined))
    expect(RecordOps.remove(record, 1)).not.toHaveProperty('1')
  })

  it('preserves enumerable key order while excluding non-enumerable strings and symbols', () => {
    const included = Symbol('included')
    const excluded = Symbol('excluded')
    const source = Object.defineProperties(
      { 2: 2, 1: 1, first: 3, [included]: 4 },
      {
        hidden: { value: 5, enumerable: false },
        [excluded]: { value: 6, enumerable: false },
      },
    )

    expect(RecordOps.keys(source)).toEqual(['1', '2', 'first', included])
    expect(RecordOps.values(source)).toEqual([1, 2, 3, 4])
    expect(RecordOps.entries(source)).toEqual([
      ['1', 1],
      ['2', 2],
      ['first', 3],
      [included, 4],
    ])
  })

  it('keeps large-record enumeration exact when symbols and hidden keys force compaction', () => {
    const included = Symbol('included-large')
    const excluded = Symbol('excluded-large')
    const source = Object.fromEntries(
      Array.from({ length: 70 }, (_, index) => [`key${index}`, index]),
    ) as Record<PropertyKey, number>
    source[included] = 70
    Object.defineProperties(source, {
      hidden: { value: 71, enumerable: false },
      [excluded]: { value: 72, enumerable: false },
    })

    const keys = RecordOps.keys(source)
    expect(keys).toHaveLength(71)
    expect(keys.slice(0, 3)).toEqual(['key0', 'key1', 'key2'])
    expect(keys.at(-1)).toBe(included)
    expect(keys).not.toContain('hidden')
    expect(keys).not.toContain(excluded)

    const mapped = RecordOps.map(source, (value, key) => `${String(key)}:${value}`)
    expect(Object.getPrototypeOf(mapped)).toBeNull()
    expect(mapped.key69).toBe('key69:69')
    expect(mapped[included]).toBe(`${String(included)}:70`)
    expect(Reflect.ownKeys(mapped)).toHaveLength(71)
  })

  it('takes one stable own-key snapshot from stateful record proxies', () => {
    const first = Array.from({ length: 70 }, (_, index) => `first${index}`)
    const second = Array.from({ length: 70 }, (_, index) => `second${index}`)
    const target = Object.fromEntries([...first, ...second].map((key, index) => [key, index]))
    let ownKeysCalls = 0
    const source = new Proxy(target, {
      ownKeys: () => (ownKeysCalls++ === 0 ? first : second),
    })

    expect(RecordOps.keys(source)).toEqual(first)
    expect(ownKeysCalls).toBe(1)
  })
})

describe('Map and Set', () => {
  it('inherits SameValueZero key semantics without mutating inputs', () => {
    const source = new Map<number, string>([[Number.NaN, 'nan']])
    const updated = MapOps.set(source, 1, 'one')
    expect(MapOps.get(source, Number.NaN)).toEqual(some('nan'))
    expect(MapOps.getOrUndefined(source, Number.NaN)).toBe('nan')
    expect(MapOps.getOrUndefined(source, 2)).toBeUndefined()
    expect(MapOps.get(new Map([['present', undefined]]), 'present')).toEqual(some(undefined))
    expect(MapOps.get(new Map<string, undefined>(), 'missing')).toEqual(none)
    expect(
      MapOps.equals(
        new Map<string, number | undefined>([['present', undefined]]),
        new Map<string, number | undefined>([['present', undefined]]),
      ),
    ).toBe(true)
    expect(
      MapOps.equals(
        new Map<string, number | undefined>([['present', undefined]]),
        new Map<string, number | undefined>([['different', undefined]]),
      ),
    ).toBe(false)
    expect(source.has(1)).toBe(false)
    expect(updated.get(1)).toBe('one')

    const target = new Map<number, number>()
    expect(MapOps.mapInto(new Map([[1, 2]]), target, (value) => value * 2)).toBe(target)
    expect(target.get(1)).toBe(4)
  })

  it('deduplicates NaN and implements immutable set algebra', () => {
    const source = SetOps.fromIterable([Number.NaN, Number.NaN, 1])
    const union = SetOps.union(source, new Set([2]))
    expect(source.size).toBe(2)
    expect(SetOps.equals(union, new Set([Number.NaN, 1, 2]))).toBe(true)
    expect(SetOps.intersection(union, new Set([2, 3]))).toEqual(new Set([2]))
  })
})

describe('Tuple and Indexed', () => {
  it('retains tuple positions through pair operations', () => {
    const pair = Tuple.make('answer', 42)
    expect(Tuple.swap(pair)).toEqual([42, 'answer'])
    expect(
      Tuple.bimap(
        pair,
        (value) => value.length,
        (value) => value + 1,
      ),
    ).toEqual([6, 43])
    expect(Tuple.append(pair, true)).toEqual(['answer', 42, true])
  })

  it('treats sparse arrays densely', () => {
    const sparse = new Array<number | undefined>(3)
    sparse[1] = 2
    const seen: Array<number | undefined> = []
    Indexed.forEach(sparse, (value) => seen.push(value))
    const mapped = Indexed.map(sparse, (value) => value ?? 0)

    expect(seen).toEqual([undefined, 2, undefined])
    expect(mapped).toEqual([0, 2, 0])
    expect(Object.hasOwn(mapped, 0)).toBe(true)
    expect(Indexed.indexOf([Number.NaN], Number.NaN)).toEqual(some(0))
    expect(Indexed.atOrUndefined([1, 2], -1)).toBe(2)
    expect(Indexed.headOrUndefined([])).toBeUndefined()
    expect(Indexed.lastOrUndefined([1, 2])).toBe(2)
    expect(Indexed.findOrUndefined([1, 2], (value) => value > 1)).toBe(2)
    expect(Indexed.findIndexOrUndefined([1, 2], (value) => value > 2)).toBeUndefined()
    expect(Indexed.indexOfOrUndefined([1, 2], 2)).toBe(1)
  })

  it('copies and maps into caller-owned indexed storage', () => {
    const target = new Uint16Array(4)
    expect(Indexed.mapInto([1, 2], target, (value) => value * 3, 1)).toBe(target)
    expect(Array.from(target)).toEqual([0, 3, 6, 0])
  })
})

describe('TypedArray', () => {
  it('preserves the concrete constructor and invokes filter predicates once', () => {
    const source = new Float32Array([1, Number.NaN, 3])
    const predicate = vi.fn((value: number) => Number.isNaN(value) || value > 2)
    const filtered = TypedArray.filter(source, predicate)

    expect(filtered).toBeInstanceOf(Float32Array)
    expect(Array.from(filtered)).toEqual([Number.NaN, 3])
    expect(predicate).toHaveBeenCalledTimes(3)
    expect(TypedArray.indexOf(source, Number.NaN)).toEqual(some(1))
    expect(TypedArray.atOrUndefined(source, 0)).toBe(1)
    expect(TypedArray.head(source)).toEqual(some(1))
    expect(TypedArray.last(source)).toEqual(some(3))
    expect(TypedArray.headOrUndefined(new Float32Array())).toBeUndefined()
    expect(TypedArray.indexOfOrUndefined(source, 99)).toBeUndefined()
    expect(TypedArray.equals(source, new Float32Array([1, Number.NaN, 3]))).toBe(true)
  })

  it('maps into caller-owned typed storage with capacity checks', () => {
    const target = new Int32Array(4)
    expect(TypedArray.mapInto(new Uint8Array([1, 2]), target, (value) => value * 10, 1)).toBe(
      target,
    )
    expect(Array.from(target)).toEqual([0, 10, 20, 0])
    expect(() =>
      TypedArray.mapInto(new Uint8Array([1, 2]), new Uint8Array(1), (value) => value),
    ).toThrow(RangeError)
  })
})
