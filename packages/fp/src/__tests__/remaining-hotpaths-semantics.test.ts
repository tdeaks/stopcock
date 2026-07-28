import { describe, expect, it } from 'vite-plus/test'
import * as Indexed from '../indexed'
import * as Reader from '../reader'
import * as Semigroup from '../semigroup'
import * as State from '../state-fn'
import * as These from '../these'
import * as Validation from '../validation'

describe('Validation hot paths preserve Array iteration semantics', () => {
  it('tracks the intrinsic Array iterator dynamic length and dense holes', () => {
    const validations: Validation.Validation<number, string>[] = []
    const first = {
      _tag: 1 as const,
      get value(): number {
        validations.push(Validation.valid(2))
        return 1
      },
    }
    validations.push(first)

    expect(Validation.all(validations)).toEqual({
      _tag: 1,
      value: [1, 2],
    })

    const sparse = new Array<Validation.Validation<number, string>>(1)
    expect(() => Validation.all(sparse)).toThrow(TypeError)
  })

  it('reads and invokes a custom iterator once and closes it on failure', () => {
    const events: string[] = []
    const validations = [Validation.valid(1)]
    Object.defineProperty(validations, Symbol.iterator, {
      configurable: true,
      get() {
        events.push('iterator:get')
        return function* () {
          try {
            yield Validation.valid(2)
            yield {
              get _tag(): 1 {
                events.push('tag:get')
                throw new Error('stop')
              },
              value: 3,
            }
          } finally {
            events.push('iterator:close')
          }
        }
      },
    })

    expect(() => Validation.all(validations)).toThrow('stop')
    expect(events).toEqual(['iterator:get', 'tag:get', 'iterator:close'])
  })

  it('retains native ArrayIteratorClose when its prototype defines return', () => {
    const events: string[] = []
    const iterator = [Validation.valid(0)][Symbol.iterator]()
    const iteratorPrototype = Object.getPrototypeOf(iterator) as object
    const previousReturn = Object.getOwnPropertyDescriptor(
      iteratorPrototype,
      'return',
    )
    const nativeNext = iterator.next
    Object.defineProperty(iteratorPrototype, 'return', {
      configurable: true,
      writable: true,
      value: function (
        this: ArrayIterator<Validation.Validation<number, string>>,
      ) {
        const next = nativeNext.call(this)
        events.push(
          next.done
            ? 'iterator:close:done'
            : `iterator:close:${String(next.value.value)}`,
        )
        return { done: true as const, value: undefined }
      },
    })

    try {
      const validations = [
        {
          get _tag(): 1 {
            events.push('tag:get')
            throw new Error('stop')
          },
          value: 1,
        },
        Validation.valid(2),
      ]
      expect(() => Validation.all(validations)).toThrow('stop')
      expect(events).toEqual(['tag:get', 'iterator:close:2'])
    } finally {
      if (previousReturn === undefined) {
        delete (iteratorPrototype as { return?: unknown }).return
      } else {
        Object.defineProperty(iteratorPrototype, 'return', previousReturn)
      }
    }
  })

  it('preserves subclass iterator order', () => {
    class ReverseValidations extends Array<Validation.Validation<number, string>> {
      override *[Symbol.iterator](): ArrayIterator<Validation.Validation<number, string>> {
        for (let index = this.length - 1; index >= 0; index -= 1) {
          yield this[index] as Validation.Validation<number, string>
        }
      }
    }

    const validations = new ReverseValidations(
      Validation.valid(1),
      Validation.valid(2),
    )
    expect(Validation.all(validations)).toEqual({
      _tag: 1,
      value: [2, 1],
    })
  })

  it('reads an Array proxy iterator once and matches ArrayIterator property access', () => {
    const reads: PropertyKey[] = []
    const values = [Validation.valid(1), Validation.valid(2)]
    const proxy = new Proxy(values, {
      get(target, key, receiver) {
        reads.push(key)
        return Reflect.get(target, key, receiver)
      },
    })

    expect(Validation.all(proxy)).toEqual({ _tag: 1, value: [1, 2] })
    expect(reads.filter((key) => key === Symbol.iterator)).toHaveLength(1)
    expect(reads.filter((key) => key === 'length')).toHaveLength(3)
    expect(reads.filter((key) => key === '0')).toHaveLength(1)
    expect(reads.filter((key) => key === '1')).toHaveLength(1)
  })

  it('applies ArrayIterator ToLength coercion to proxy length values', () => {
    const fractional = new Proxy([Validation.valid(1)], {
      get(target, key, receiver) {
        return key === 'length' ? 0.5 : Reflect.get(target, key, receiver)
      },
    })
    expect(Validation.all(fractional)).toEqual({ _tag: 1, value: [] })

    const bigintLength = new Proxy([Validation.valid(1)], {
      get(target, key, receiver) {
        return key === 'length' ? 1n : Reflect.get(target, key, receiver)
      },
    })
    expect(() => Validation.all(bigintLength)).toThrow(TypeError)
  })

  it('keeps native map callback receiver, arguments, length snapshot, and sparse order', () => {
    const values = [1, 2]
    const calls: Array<readonly [unknown, number, number, boolean]> = []
    const validate = function (
      this: unknown,
      value: number,
      index: number,
      source: number[],
    ): Validation.Validation<number, never> {
      calls.push([this, value, index, source === values])
      if (index === 0) source.push(3)
      return Validation.valid(value)
    }

    expect(
      Validation.traverse(
        validate as (value: number) => Validation.Validation<number, never>,
      )(values),
    ).toEqual({ _tag: 1, value: [1, 2] })
    expect(calls).toEqual([
      [undefined, 1, 0, true],
      [undefined, 2, 1, true],
    ])

    const sparse = new Array<number>(3)
    sparse[1] = 1
    sparse[2] = 2
    const sparseCalls: number[] = []
    expect(() =>
      Validation.traverse((value: number, index: number) => {
        sparseCalls.push(index)
        return Validation.valid(value)
      })(sparse),
    ).toThrow(TypeError)
    expect(sparseCalls).toEqual([1, 2])
  })
})

describe('These.zipWith direct branch matrix', () => {
  const events: string[] = []
  const errors = Semigroup.make<string>((left, right) => {
    events.push(`errors:${left}:${right}`)
    return `${left}+${right}`
  })
  const combine = (left: number, right: number): number => {
    events.push(`values:${left}:${right}`)
    return left + right
  }
  const zip = (self: These.These<string, number>, that: These.These<string, number>) =>
    These.zipWith(errors)(that, combine)(self)

  it('preserves all nine Left, Right, and Both combinations', () => {
    const selfLeft = These.left('self')
    const thatLeft = These.left('that')

    expect(zip(selfLeft, thatLeft)).toBe(selfLeft)
    expect(zip(selfLeft, These.right(2))).toBe(selfLeft)
    expect(zip(selfLeft, These.both('that', 2))).toBe(selfLeft)
    expect(zip(These.right(1), thatLeft)).toBe(thatLeft)
    expect(zip(These.right(1), These.right(2))).toEqual(These.right(3))
    expect(zip(These.right(1), These.both('that', 2))).toEqual(
      These.both('that', 3),
    )
    expect(zip(These.both('self', 1), thatLeft)).toEqual(
      These.left('self+that'),
    )
    expect(zip(These.both('self', 1), These.right(2))).toEqual(
      These.both('self', 3),
    )
    expect(zip(These.both('self', 1), These.both('that', 2))).toEqual(
      These.both('self+that', 3),
    )
  })

  it('keeps value combination before diagnostic combination', () => {
    events.length = 0
    expect(zip(These.both('self', 1), These.both('that', 2))).toEqual(
      These.both('self+that', 3),
    )
    expect(events).toEqual(['values:1:2', 'errors:self:that'])
  })

  it('retains observable property reads and callback receivers', () => {
    const trace: string[] = []
    const self = {
      get _tag() {
        trace.push('self:tag')
        return 'Both' as const
      },
      get left() {
        trace.push('self:left')
        return 'self'
      },
      get right() {
        trace.push('self:right')
        return 1
      },
    }
    const that = {
      get _tag() {
        trace.push('that:tag')
        return 'Both' as const
      },
      get left() {
        trace.push('that:left')
        return 'that'
      },
      get right() {
        trace.push('that:right')
        return 2
      },
    }
    const receiverErrors = {
      combine(this: unknown, left: string, right: string) {
        trace.push(`errors:${String(this === receiverErrors)}:${left}:${right}`)
        return `${left}+${right}`
      },
      combineMany(self: string): string {
        return self
      },
    }
    const combineValues = function (
      this: unknown,
      left: number,
      right: number,
    ): number {
      trace.push(`values:${String(this === undefined)}:${left}:${right}`)
      return left + right
    }

    expect(
      These.zipWith(receiverErrors)(that, combineValues)(self),
    ).toEqual(These.both('self+that', 3))
    expect(trace).toEqual([
      'self:tag',
      'self:tag',
      'self:right',
      'that:tag',
      'that:left',
      'that:right',
      'values:true:1:2',
      'self:left',
      'errors:true:self:that',
    ])
  })

  it('retains the unused right read and second tag read for Both/Left', () => {
    const trace: string[] = []
    const self = {
      get _tag() {
        trace.push('self:tag')
        return 'Both' as const
      },
      get left() {
        trace.push('self:left')
        return 'self'
      },
      get right() {
        trace.push('self:right')
        return 1
      },
    }
    const that = {
      get _tag() {
        trace.push('that:tag')
        return 'Left' as const
      },
      get left() {
        trace.push('that:left')
        return 'that'
      },
    }

    expect(
      These.zipWith(Semigroup.string)(
        that,
        () => {
          trace.push('values')
          return 0
        },
      )(self),
    ).toEqual(These.left('selfthat'))
    expect(trace).toEqual([
      'self:tag',
      'self:tag',
      'self:right',
      'that:tag',
      'that:tag',
      'self:left',
      'that:left',
    ])
  })
})

describe('Reader.tap direct execution', () => {
  it('preserves callback receiver, evaluation order, environment, and original value', () => {
    const events: string[] = []
    const environment = { offset: 2 }
    const self = function (
      this: unknown,
      input: typeof environment,
    ): number {
      events.push(`self:${String(this === undefined)}:${input.offset}`)
      return 3
    }
    const effect = function (
      this: unknown,
      value: number,
    ): Reader.Reader<typeof environment, string> {
      events.push(`effect:${String(this === undefined)}:${value}`)
      return function (this: unknown, input: typeof environment): string {
        events.push(`run:${String(this === undefined)}:${input.offset}`)
        return 'ignored'
      }
    }

    const program = Reader.tap(effect)(self)
    expect(program.call({ receiver: true }, environment)).toBe(3)
    expect(events).toEqual([
      'self:true:2',
      'effect:true:3',
      'run:true:2',
    ])
  })
})

describe('State.tap direct execution', () => {
  const customPair = <A, S>(
    label: string,
    first: A,
    second: S,
    events: string[],
  ): readonly [A, S] =>
    ({
      [Symbol.iterator]() {
        let index = 0
        const values: readonly [A, S] = [first, second]
        return {
          next() {
            const current = index
            index += 1
            return {
              done: false as const,
              get value(): A | S {
                events.push(`${label}:value:${current}`)
                return values[current] as A | S
              },
            }
          },
          return() {
            events.push(`${label}:close`)
            return { done: true as const, value: undefined }
          },
        }
      },
    }) as unknown as readonly [A, S]

  it('reads both custom tuple values, closes iterators, and threads effect state', () => {
    const events: string[] = []
    const self: State.State<number, number> = (initial) => {
      events.push(`self:run:${initial}`)
      return customPair('self', 7, initial + 1, events)
    }
    const effect = (value: number): State.State<number, string> => {
      events.push(`effect:create:${value}`)
      return (initial) => {
        events.push(`effect:run:${initial}`)
        return customPair('effect', 'ignored', initial + 2, events)
      }
    }

    expect(State.tap(effect)(self)(0)).toEqual([7, 3])
    expect(events).toEqual([
      'self:run:0',
      'self:value:0',
      'self:value:1',
      'self:close',
      'effect:create:7',
      'effect:run:1',
      'effect:value:0',
      'effect:value:1',
      'effect:close',
    ])
  })
})

describe('Indexed allocation-free helpers preserve indexed behavior', () => {
  it('keeps SameValueZero, dense holes, and dynamic length behavior in includes', () => {
    const sparse = new Array<number | undefined>(2)
    sparse[1] = Number.NaN
    expect(Indexed.includes(sparse, undefined)).toBe(true)
    expect(Indexed.includes(sparse, Number.NaN)).toBe(true)
    expect(Indexed.includes([-0], 0)).toBe(true)

    let length = 1
    const source = {
      get length() {
        return length
      },
      get 0() {
        length = 2
        return 1
      },
      get 1() {
        return 2
      },
    }
    expect(Indexed.includes(source, 2)).toBe(true)
  })

  it('normalizes slice bounds without changing dense custom Indexed output', () => {
    const source = {
      length: 4,
      0: 'a',
      1: 'b',
      2: 'c',
      3: 'd',
    }
    expect(Indexed.slice(source, -3, -1)).toEqual(['b', 'c'])
    expect(Indexed.slice(source, Number.NaN, 2.9)).toEqual(['a', 'b'])
    expect(Indexed.slice(source, 3, 1)).toEqual([])
  })

  it('preserves same-target and distinct-overlapping-view copy direction', () => {
    const same = [1, 2, 3, 4, 5]
    expect(Indexed.copyInto(same, same, 1, 0, 4)).toBe(same)
    expect(same).toEqual([1, 1, 2, 3, 4])

    const buffer = new Uint8Array([1, 2, 3, 4, 5])
    const source = buffer.subarray(0, 4)
    const target = buffer.subarray(1)
    expect(Indexed.copyInto(source, target)).toBe(target)
    expect([...buffer]).toEqual([1, 1, 1, 1, 1])
  })
})
