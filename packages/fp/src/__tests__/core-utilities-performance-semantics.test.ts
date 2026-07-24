import { describe, expect, it, vi } from 'vite-plus/test'
import { compose, curry } from '../function'
import * as MapOps from '../map'
import { map as optionMap, none, some } from '../option'
import * as RecordOps from '../record'
import * as Result from '../result'
import * as SetOps from '../set'

describe('core utility fast paths preserve public semantics', () => {
  describe('fixed-arity function composition', () => {
    it('preserves identity, reverse evaluation order, and the long fallback', () => {
      const trace: number[] = []
      const step =
        (id: number) =>
        (value: number): number => {
          trace.push(id)
          return value + id
        }

      expect((compose as (...fns: never[]) => (value: number) => number)()(5)).toBe(5)
      expect(compose(step(1))(0)).toBe(1)
      expect(compose(step(1), step(2))(0)).toBe(3)
      expect(compose(step(1), step(2), step(3))(0)).toBe(6)
      expect(compose(step(1), step(2), step(3), step(4))(0)).toBe(10)
      expect(compose(step(1), step(2), step(3), step(4), step(5))(0)).toBe(15)
      expect(compose(step(1), step(2), step(3), step(4), step(5), step(6))(0)).toBe(21)
      expect(trace).toEqual([
        1,
        2,
        1,
        3,
        2,
        1,
        4,
        3,
        2,
        1,
        5,
        4,
        3,
        2,
        1,
        6,
        5,
        4,
        3,
        2,
        1,
      ])
    })

    it('retains the existing callback receiver for short and long compositions', () => {
      for (const length of [1, 2, 3, 4, 5, 6]) {
        const receivers: unknown[] = []
        const callbacks = Array.from(
          { length },
          () =>
            function (this: unknown, value: number): number {
              receivers.push(this)
              return value + 1
            },
        )
        const composed = (compose as (...fns: typeof callbacks) => (value: number) => number)(
          ...callbacks,
        )

        expect(composed(0)).toBe(length)
        expect(receivers).toHaveLength(length)
        expect(receivers.every((receiver) => receiver === receivers[0])).toBe(true)
        expect(Array.isArray(receivers[0])).toBe(true)
        expect((receivers[0] as unknown[]).length).toBe(length)
      }
    })
  })

  describe('fixed-arity curry', () => {
    it('keeps zero through six argument functions equivalent', () => {
      expect(curry(() => 42)).toBe(42)
      expect(curry((a: number) => a + 1)(1)).toBe(2)
      expect(curry((a: number, b: number) => a + b)(1)(2)).toBe(3)
      expect(curry((a: number, b: number, c: number) => a + b + c)(1)(2)(3)).toBe(6)
      expect(curry((a: number, b: number, c: number, d: number) => a + b + c + d)(1)(2)(3)(4)).toBe(
        10,
      )
      expect(
        curry((a: number, b: number, c: number, d: number, e: number) => a + b + c + d + e)(1)(2)(
          3,
        )(4)(5),
      ).toBe(15)
      expect(
        curry(
          (a: number, b: number, c: number, d: number, e: number, f: number) =>
            a + b + c + d + e + f,
        )(1)(2)(3)(4)(5)(6),
      ).toBe(21)
    })

    it('uses Function.length and invokes the source only at the final layer', () => {
      const source = vi.fn((a: number, b = 2) => a + b)
      const curried = curry(source)

      expect(source).not.toHaveBeenCalled()
      expect(curried(3)).toBe(5)
      expect(source).toHaveBeenCalledOnce()

      const throwing = curry((left: number, right: number) => {
        throw new Error(`${left}:${right}`)
      })
      const pending = throwing(1)
      expect(() => pending(2)).toThrow('1:2')
    })
  })

  it('keeps Option and Result map tag/value access order exact', () => {
    const events: string[] = []
    const option = new Proxy(
      { _tag: 1 as const, value: 2 },
      {
        get(target, key, receiver) {
          events.push(`option:${String(key)}`)
          return Reflect.get(target, key, receiver)
        },
      },
    )
    const result = new Proxy(
      { _tag: 1 as const, value: 3 },
      {
        get(target, key, receiver) {
          events.push(`result:${String(key)}`)
          return Reflect.get(target, key, receiver)
        },
      },
    )

    expect(optionMap(option, (value) => value + 1)).toEqual(some(3))
    expect(Result.map(result, (value) => value + 1)).toEqual(Result.ok(4))
    expect(events).toEqual([
      'option:_tag',
      'option:value',
      'result:_tag',
      'result:value',
    ])
  })

  it('keeps Result.liftThrowable argument, error mapping, and throw boundaries exact', () => {
    const source = vi.fn((left: number, right: number) => left + right)
    const lifted = Result.liftThrowable(source)
    expect(lifted(2, 3)).toEqual(Result.ok(5))
    expect(source).toHaveBeenCalledExactlyOnceWith(2, 3)

    const failure = new Error('source')
    const onError = vi.fn((error: unknown) => (error as Error).message)
    expect(
      Result.liftThrowable(() => {
        throw failure
      }, onError)(),
    ).toEqual(Result.err('source'))
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure)

    expect(() =>
      Result.liftThrowable(
        () => {
          throw failure
        },
        () => {
          throw new Error('mapper')
        },
      )(),
    ).toThrow('mapper')
  })

  it('keeps Map.get present-undefined and missing keys distinct', () => {
    const present = new Map<string, number | undefined>([['value', undefined]])
    expect(MapOps.get(present, 'value')).toEqual(some(undefined))
    expect(MapOps.get(present, 'missing')).toBe(none)
    expect(MapOps.getOrUndefined(present, 'value')).toBeUndefined()
  })

  it('keeps Set intersection order, smaller-side selection, and disjointness exact', () => {
    const left = new Set([3, 2, 1])
    const right = new Set([2, 3])
    expect([...SetOps.intersection(left, right)]).toEqual([2, 3])
    expect([...SetOps.intersection(right, left)]).toEqual([2, 3])
    expect(SetOps.isDisjoint(left, new Set([4, 5]))).toBe(true)
    expect(SetOps.isDisjoint(left, new Set([5, 2]))).toBe(false)
    expect(SetOps.intersection(new Set([Number.NaN]), new Set([Number.NaN]))).toEqual(
      new Set([Number.NaN]),
    )
  })

  it('keeps Record.omit key normalization, symbols, iteration, and null prototypes exact', () => {
    const symbol = Symbol('kept')
    const omittedSymbol = Symbol('omitted')
    const source = RecordOps.fromEntries([
      [1, 'numeric'],
      ['safe', 'safe'],
      ['__proto__', 'data'],
      [symbol, 'symbol'],
      [omittedSymbol, 'gone'],
    ])
    let iterations = 0
    const omitted = {
      *[Symbol.iterator](): Iterator<PropertyKey> {
        iterations++
        yield 1
        yield '__proto__'
        yield omittedSymbol
      },
    }

    const result = RecordOps.omit(source, omitted)
    expect(iterations).toBe(1)
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(Reflect.ownKeys(result)).toEqual(['safe', symbol])
    expect(result.safe).toBe('safe')
    expect(result[symbol]).toBe('symbol')
  })
})
