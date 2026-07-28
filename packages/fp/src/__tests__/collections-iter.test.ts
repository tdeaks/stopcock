import { describe, expect, it, vi } from 'vite-plus/test'
import { none, some } from '../option'
import * as Indexed from '../indexed'
import * as Iter from '../iter'
import * as MapOps from '../map'
import * as RecordOps from '../record'
import * as SetOps from '../set'
import * as Tuple from '../tuple'
import * as TypedArray from '../typed-array'

describe('Iter', () => {
  it('is lazy, re-iterable, and supports data-first and data-last transforms', () => {
    const effect = vi.fn((value: number) => value * 2)
    const values = Iter.map(effect)(Iter.range(0, 4))
    expect(effect).not.toHaveBeenCalled()
    expect(Iter.toArray(values)).toEqual([0, 2, 4, 6])
    expect(Iter.toArray(Iter.map((value: number) => value + 1)(values))).toEqual([1, 3, 5, 7])
    expect(effect).toHaveBeenCalledTimes(8)
  })

  it('keeps planned source, callback, and plan metadata opaque', () => {
    const values = Iter.map((value) => value * 2)([1, 2, 3])

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
    expect(Iter.toArray(Iter.map((value) => value * 10)(source))).toEqual([10, 20])
    expect(hostileSymbolReads).toBe(0)
  })

  it('uses Option for partial terminals', () => {
    expect(Iter.first(Iter.empty())).toEqual(none)
    expect(Iter.first(Iter.of(undefined))).toEqual(some(undefined))
    expect(Iter.find((value) => value > 2)(Iter.range(0, 5))).toEqual(some(3))
    expect(Iter.nth(10)(Iter.range(0, 5))).toEqual(none)
  })

  it('makes undefined-returning terminal variants explicit', () => {
    expect(Iter.firstOrUndefined(Iter.empty())).toBeUndefined()
    expect(Iter.lastOrUndefined(Iter.range(0, 3))).toBe(2)
    expect(Iter.findOrUndefined((value) => value > 2)(Iter.range(0, 5))).toBe(3)
    expect(Iter.nthOrUndefined(10)(Iter.range(0, 5))).toBeUndefined()
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

    const iterator = Iter.take(2)(source)[Symbol.iterator]()
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

    expect(Iter.toArray(Iter.zip(right)(left))).toEqual([[1, 'a']])
    expect(leftClosed).toHaveBeenCalledOnce()
    expect(rightClosed).toHaveBeenCalledOnce()
  })

  it('fuses planned transforms into every terminal without changing indexes', () => {
    const mappedIndexes: number[] = []
    const filteredIndexes: number[] = []
    const values = Iter.take(2)(
      Iter.filter((value, index) => {
        filteredIndexes.push(index)
        return value > 2
      })(
        Iter.map((value, index) => {
          mappedIndexes.push(index)
          return value * 2
        })([1, 2, 3, 4]),
      ),
    )

    expect(Iter.toArray(values)).toEqual([4, 6])
    expect(mappedIndexes).toEqual([0, 1, 2])
    expect(filteredIndexes).toEqual([0, 1, 2])
    expect(Iter.reduce((total, value) => total + value, 0)(values)).toBe(10)
    expect(Iter.first(values)).toEqual(some(4))
    expect(Iter.last(values)).toEqual(some(6))
    expect(Iter.find((value) => value === 6)(values)).toEqual(some(6))
    expect(Iter.nth(1)(values)).toEqual(some(6))
    expect(Iter.some((value) => value === 6)(values)).toBe(true)
    expect(Iter.every((value) => value % 2 === 0)(values)).toBe(true)
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
    const values = Iter.take(2)(
      Iter.scan(
        (total, value) => total + value,
        0,
      )(
        Iter.filterMap((value) => (value % 2 === 0 ? some(value) : none))(
          Iter.flatMap((value) => [value, value + 10])(source),
        ),
      ),
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

    expect(Iter.toArray(Iter.take(0)(Iter.map(mapped)(source)))).toEqual([])
    expect(opened).not.toHaveBeenCalled()
    expect(mapped).not.toHaveBeenCalled()
  })

  it('appends into an existing destination without counting its existing values toward take', () => {
    const target = [0]
    expect(
      Iter.toArrayInto(target)(Iter.take(2)(Iter.map((value) => value * 2)([1, 2, 3]))),
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
      const dropped = Iter.dropWhile((value, index) => {
        events.push(`dropWhile:${value}:${index}`)
        return value < 3
      })(source)
      const bounded = Iter.takeWhile((value, index) => {
        events.push(`takeWhile:${value}:${index}`)
        return value < 6
      })(dropped)
      const scanned = Iter.scan(
        (total, value, index) => {
          events.push(`scan:${value}:${index}`)
          return total + value
        },
        0,
      )(bounded)
      return Iter.toArray(
        Iter.filterMap((value, index) => {
          events.push(`filterMap:${value}:${index}`)
          return value % 2 === 1 ? some(value * 10) : none
        })(scanned),
      )
    }

    const expectedEvents: string[] = []
    const actualEvents: string[] = []
    expect(run(sourceValues, actualEvents)).toEqual(run(genericSource(), expectedEvents))
    expect(actualEvents).toEqual(expectedEvents)

    const flatMapRun = (source: Iterable<number>, events: string[]): number[] =>
      Iter.toArray(
        Iter.filter((value, index) => {
          events.push(`filter:${value}:${index}`)
          return (value + index) % 3 !== 0
        })(
          Iter.map((value, index) => {
            events.push(`map:${value}:${index}`)
            return value + index
          })(
            Iter.flatMap((value, index) => {
              events.push(`flatMap:${value}:${index}`)
              return [value, value + 10]
            })(source),
          ),
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
            ? Iter.filter((value, index) => (value + index + stage) % 5 !== 0)(values)
            : Iter.map((value, index) => value + ((index + stage) % 3))(values)
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
    expect(Iter.reduce((total, value) => total + value, 0)(generatorPlan)).toBe(
      expected.reduce((total, value) => total + value, 0),
    )
    expect(Iter.find(() => false)(generatorPlan)).toEqual(none)
  })

  it('direct array iteration stays lazy and preserves stage-local callback indexes', () => {
    const events: string[] = []
    const values = Iter.take(2)(
      Iter.filter((value, index) => {
        events.push(`filter:${value}:${index}`)
        return value > 2
      })(
        Iter.map((value, index) => {
          events.push(`map:${value}:${index}`)
          return value * 2
        })([1, 2, 3, 4]),
      ),
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

    expect(Iter.toArray(Iter.takeWhile((value) => value < 2)(takeWhileSource))).toEqual([1])
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
    const values = Iter.filter(() => true)(
      Iter.map((value) => value)(
        Iter.flatMap((value) =>
          (function* () {
            try {
              yield value * 10
              yield value * 10 + 1
            } finally {
              flatMapEvents.push(`nested:${value}:close`)
            }
          })(),
        )(flatMapSource),
      ),
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

    expect(Iter.toArray(Iter.map((value) => value * 10)(source))).toEqual([30, 10])
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
    const values = Iter.map((value) => value)(source)

    expect(Array.from(values)).toEqual([99])
    expect(iteratorReads).toBe(1)
    iteratorReads = 0
    expect(Iter.toArray(values)).toEqual([99])
    expect(iteratorReads).toBe(1)

    iteratorReads = 0
    expect(Iter.toArray(Iter.take(1)(values))).toEqual([99])
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
    const values = Iter.map((value) => {
      events.push('after-take')
      return value
    })(
      Iter.take(1)(
        Iter.map((value) => {
          events.push('before-take')
          return value
        })(source),
      ),
    )

    expect(Iter.toArray(values)).toEqual([1])
    expect(events).toEqual(['next', 'before-take', 'close', 'after-take'])
  })

  it('observes array growth while a specialized take pipeline is running', () => {
    const source = [1]
    const values = Iter.take(3)(
      Iter.map((value) => {
        if (source.length < 3) source.push(source.length + 1)
        return value
      })(source),
    )

    expect(Iter.toArray(values)).toEqual([1, 2, 3])

    const terminalSource = [1]
    const seen: number[] = []
    Iter.forEach((value) => {
      seen.push(value)
      if (terminalSource.length < 3) terminalSource.push(terminalSource.length + 1)
    })(Iter.take(3)(terminalSource))
    expect(seen).toEqual([1, 2, 3])
  })

  it('invokes planned callbacks with the same undefined receiver as generators', () => {
    const receivers: unknown[] = []
    const values = Iter.scan(
      function (total, value) {
        receivers.push(this)
        return total + value
      },
      0,
    )(
      Iter.dropWhile(function () {
        receivers.push(this)
        return false
      })(
        Iter.filterMap(function (value) {
          receivers.push(this)
          return some(value)
        })(
          Iter.map(function (value) {
            receivers.push(this)
            return value * 2
          })([1, 2, 3]),
        ),
      ),
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
      result = Iter.first(Iter.map((value) => value * 2)([1, 2, 3]))
    } finally {
      if (previous) Object.defineProperty(iteratorPrototype, 'return', previous)
      else Reflect.deleteProperty(iteratorPrototype, 'return')
    }

    expect(result!).toEqual(some(2))
    expect(closed).toBe(1)
  })

  it('ignores malformed filterMap tags just like the public generator path', () => {
    const values = Iter.filterMap(() => ({ _tag: 2, value: 99 }) as never)([1, 2])
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
            values = Iter.map((value, index) => {
              events.push(`${position}:map:${value}:${index}`)
              return value * 2 + index
            })(values)
            break
          case 'filter':
            values = Iter.filter((value, index) => {
              events.push(`${position}:filter:${value}:${index}`)
              return (value + index + position) % 3 !== 0
            })(values)
            break
          case 'filterMap':
            values = Iter.filterMap((value, index) => {
              events.push(`${position}:filterMap:${value}:${index}`)
              return (value + index + position) % 2 === 0 ? some(value - index) : none
            })(values)
            break
          case 'flatMap':
            values = Iter.flatMap((value, index) => {
              events.push(`${position}:flatMap:${value}:${index}`)
              return [value, value + index + 1]
            })(values)
            break
          case 'take':
            values = Iter.take([2, 1, 3][position] ?? 2)(values)
            break
          case 'drop':
            values = Iter.drop(position % 2)(values)
            break
          case 'takeWhile':
            values = Iter.takeWhile((value, index) => {
              events.push(`${position}:takeWhile:${value}:${index}`)
              return value + index < 12 + position
            })(values)
            break
          case 'dropWhile':
            values = Iter.dropWhile((value, index) => {
              events.push(`${position}:dropWhile:${value}:${index}`)
              return value + index < 3 + position
            })(values)
            break
          case 'scan':
            values = Iter.scan(
              (total, value, index) => {
                events.push(`${position}:scan:${value}:${index}`)
                return total + value + index
              },
              position,
            )(values)
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
      ['toArrayInto', (values) => Iter.toArrayInto([-1])(values)],
      [
        'reduce',
        (values, events) =>
          Iter.reduce(
            (total, value, index) => {
              events.push(`terminal:reduce:${value}:${index}`)
              return total + value
            },
            0,
          )(values),
      ],
      ['firstOrUndefined', (values) => Iter.firstOrUndefined(values)],
      ['first', (values) => Iter.first(values)],
      ['lastOrUndefined', (values) => Iter.lastOrUndefined(values)],
      ['last', (values) => Iter.last(values)],
      [
        'findOrUndefined',
        (values, events) =>
          Iter.findOrUndefined((value, index) => {
            events.push(`terminal:findOrUndefined:${value}:${index}`)
            return value > 10
          })(values),
      ],
      [
        'find',
        (values, events) =>
          Iter.find((value, index) => {
            events.push(`terminal:find:${value}:${index}`)
            return value > 10
          })(values),
      ],
      ['nthOrUndefined', (values) => Iter.nthOrUndefined(2)(values)],
      ['nth', (values) => Iter.nth(2)(values)],
      [
        'some',
        (values, events) =>
          Iter.some((value, index) => {
            events.push(`terminal:some:${value}:${index}`)
            return value > 10
          })(values),
      ],
      [
        'every',
        (values, events) =>
          Iter.every((value, index) => {
            events.push(`terminal:every:${value}:${index}`)
            return value < 20
          })(values),
      ],
      ['count', (values) => Iter.count(values)],
      [
        'forEach',
        (values, events) => {
          const output: number[] = []
          Iter.forEach((value, index) => {
            events.push(`terminal:forEach:${value}:${index}`)
            output.push(value)
          })(values)
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

      return Iter.takeWhile((value, index) => {
        events.push(`takeWhile:${value}:${index}`)
        return value < 40
      })(
        Iter.scan(
          (total, value, index) => {
            events.push(`scan:${value}:${index}`)
            return total + value
          },
          0,
        )(
          Iter.dropWhile((value, index) => {
            events.push(`dropWhile:${value}:${index}`)
            return value < 4
          })(
            Iter.flatMap((value, index) => {
              events.push(`flatMap:${value}:${index}`)
              return [value, value + index + 1]
            })(
              Iter.filterMap((value, index) => {
                events.push(`filterMap:${value}:${index}`)
                return index % 2 === 0 ? some(value + index) : none
              })(
                Iter.map((value, index) => {
                  events.push(`map:${value}:${index}`)
                  return value * 3
                })(source),
              ),
            ),
          ),
        ),
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
      return Iter.map((value) => value)(
        Iter.flatMap((outer) => ({
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
        }))(source),
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
      Iter.forEach(() => {
        throw error
      })(makeValues(errorEvents)),
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
    const before = Iter.map((value) => {
      beforeEvents.push(`downstream:${value}`)
      return value
    })(
      Iter.flatMap((value) => {
        beforeEvents.push('flatMap')
        return [value, value + 1]
      })(Iter.take(1)(makeSource(beforeEvents))),
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
    const after = Iter.map((value) => {
      afterEvents.push('downstream')
      return value
    })(
      Iter.take(1)(
        Iter.flatMap(() => ({
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
        }))(makeSource(afterEvents)),
      ),
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
    const afterArray = Iter.map((value) => {
      arrayEvents.push('downstream')
      return value
    })(
      Iter.take(1)(
        Iter.flatMap(() => ({
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
        }))([1]),
      ),
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
          values = Iter.map(fail)(source)
          break
        case 'filter':
          values = Iter.filter(fail)(source)
          break
        case 'filterMap':
          values = Iter.filterMap(fail)(source)
          break
        case 'flatMap':
          values = Iter.flatMap(fail)(source)
          break
        case 'takeWhile':
          values = Iter.takeWhile(fail)(source)
          break
        case 'dropWhile':
          values = Iter.dropWhile(fail)(source)
          break
        case 'scan':
          values = Iter.scan(fail, 0)(source)
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
      (total, value) => total + value,
      0,
    )(Iter.flatMap((value) => [value, value * 10])(source))

    expect(Iter.toArray(values)).toEqual([1, 11, 13, 33])
    expect(Iter.toArray(values)).toEqual([])
    expect(closed).toBe(1)
  })

  it('keeps the fused terminal executor differential with the public iterator', () => {
    const sources: Array<Iter.Iter<number>> = [
      Iter.map((value, index) => value + index)([1, 2, 3, 4, 5]),
      Iter.take(2)(
        Iter.drop(1)(
          Iter.filter((value) => value % 2 === 0)(
            Iter.map((value) => value * 3)([1, 2, 3, 4, 5]),
          ),
        ),
      ),
      Iter.takeWhile((value) => value < 5)(
        Iter.dropWhile((value) => value < 3)([1, 2, 3, 4, 5]),
      ),
      Iter.scan(
        (total, value) => total + value,
        0,
      )(Iter.flatMap((value) => [value, value + 10])([1, 2, 3])),
      Iter.filterMap((value) => (value % 2 === 0 ? some(value * 10) : none))([0, 1, 2, 3]),
    ]

    for (const source of sources) {
      const expected = Array.from(source)
      expect(Iter.toArray(source)).toEqual(expected)
      expect(
        Iter.reduce((output, value) => [...output, value], [] as number[])(source),
      ).toEqual(expected)
      expect(Iter.count(source)).toBe(expected.length)
      expect(Iter.first(source)).toEqual(expected.length === 0 ? none : some(expected[0]))
      expect(Iter.last(source)).toEqual(
        expected.length === 0 ? none : some(expected[expected.length - 1]),
      )
    }
  })
})

describe('Record', () => {
  it('creates null-prototype immutable results and preserves symbol keys', () => {
    const symbol = Symbol('value')
    const source = { a: 1, [symbol]: 2 }
    const mapped = RecordOps.map((value) => value * 10)(source)

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
    expect(RecordOps.get('__proto__')(record)).toEqual(some(1))
    expect(RecordOps.getOrUndefined('__proto__')(record)).toBe(1)
    expect(RecordOps.getOrUndefined('missing')(record)).toBeUndefined()
    const presentUndefined = RecordOps.fromEntries([['present', undefined]])
    expect(RecordOps.get('present')(presentUndefined)).toEqual(some(undefined))
    expect(RecordOps.remove(1)(record)).not.toHaveProperty('1')
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

    const mapped = RecordOps.map((value, key) => `${String(key)}:${value}`)(source)
    expect(Object.getPrototypeOf(mapped)).toBeNull()
    expect(mapped.key69).toBe('key69:69')
    expect(mapped[included]).toBe(`${String(included)}:70`)
    expect(Reflect.ownKeys(mapped)).toHaveLength(71)
  })

  // Hybrid enumeration calls the `ownKeys` trap twice (once via `Object.keys`
  // for the string prefix, once via `getOwnPropertySymbols`), not once, so a
  // stateful trap like this one is observed twice. The result still matches
  // `first` here because the second call's list (`second`) carries no
  // symbols, but this is a documented trade, not a guarantee that a stateful
  // trap's second answer is ignored.
  it('enumerates a stateful record proxy a fixed number of times', () => {
    const first = Array.from({ length: 70 }, (_, index) => `first${index}`)
    const second = Array.from({ length: 70 }, (_, index) => `second${index}`)
    const target = Object.fromEntries([...first, ...second].map((key, index) => [key, index]))
    let ownKeysCalls = 0
    const source = new Proxy(target, {
      ownKeys: () => (ownKeysCalls++ === 0 ? first : second),
    })

    expect(RecordOps.keys(source)).toEqual(first)
    expect(ownKeysCalls).toBe(2)
  })
})

describe('Map and Set', () => {
  it('inherits SameValueZero key semantics without mutating inputs', () => {
    const source = new Map<number, string>([[Number.NaN, 'nan']])
    const updated = MapOps.set(1, 'one')(source)
    expect(MapOps.get(Number.NaN)(source)).toEqual(some('nan'))
    expect(MapOps.getOrUndefined(Number.NaN)(source)).toBe('nan')
    expect(MapOps.getOrUndefined(2)(source)).toBeUndefined()
    expect(MapOps.get('present')(new Map([['present', undefined]]))).toEqual(some(undefined))
    expect(MapOps.get('missing')(new Map<string, undefined>())).toEqual(none)
    expect(
      MapOps.equals(new Map<string, number | undefined>([['present', undefined]]))(
        new Map<string, number | undefined>([['present', undefined]]),
      ),
    ).toBe(true)
    expect(
      MapOps.equals(new Map<string, number | undefined>([['different', undefined]]))(
        new Map<string, number | undefined>([['present', undefined]]),
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
    const union = SetOps.union(new Set([2]))(source)
    expect(source.size).toBe(2)
    expect(SetOps.equals(new Set([Number.NaN, 1, 2]))(union)).toBe(true)
    expect(SetOps.intersection(new Set([2, 3]))(union)).toEqual(new Set([2]))
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
    const filtered = TypedArray.filter(predicate)(source)

    expect(filtered).toBeInstanceOf(Float32Array)
    expect(Array.from(filtered)).toEqual([Number.NaN, 3])
    expect(predicate).toHaveBeenCalledTimes(3)
    expect(TypedArray.indexOf(Number.NaN)(source)).toEqual(some(1))
    expect(TypedArray.atOrUndefined(0)(source)).toBe(1)
    expect(TypedArray.head(source)).toEqual(some(1))
    expect(TypedArray.last(source)).toEqual(some(3))
    expect(TypedArray.headOrUndefined(new Float32Array())).toBeUndefined()
    expect(TypedArray.indexOfOrUndefined(99)(source)).toBeUndefined()
    expect(TypedArray.equals(new Float32Array([1, Number.NaN, 3]))(source)).toBe(true)
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
