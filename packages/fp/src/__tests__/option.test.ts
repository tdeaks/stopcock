import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  some, none, fromNullable, fromPredicate,
  isSome, isNone, map, flatMap, andThen, flatten, filter,
  orElse, orElseWith, and, zip, zipWith,
  contains, exists, mapNullable,
  getOrElse, getWithDefault, match, tap,
  toNullable, toUndefined, toResult,
} from '../option'
import { ok, err } from '../result'
import { pipe } from '../pipe'

describe('Option', () => {
  describe('constructors', () => {
    it('some wraps a value', () => {
      expect(some(1)).toEqual({ _tag: 1, value: 1 })
    })

    it('none is a singleton', () => {
      expect(none).toEqual({ _tag: 0 })
      expect(none).toBe(none)
    })

    it('fromNullable lifts values', () => {
      expect(fromNullable(1)).toEqual(some(1))
      expect(fromNullable(null)).toBe(none)
      expect(fromNullable(undefined)).toBe(none)
    })

    it('fromNullable preserves falsy non-nullish values', () => {
      expect(fromNullable(0)).toEqual(some(0))
      expect(fromNullable('')).toEqual(some(''))
      expect(fromNullable(false)).toEqual(some(false))
    })

    it('fromPredicate lifts when predicate holds', () => {
      const pos = fromPredicate((n: number) => n > 0)
      expect(pos(5)).toEqual(some(5))
      expect(pos(-1)).toBe(none)
    })
  })

  describe('guards', () => {
    it('isSome and isNone', () => {
      expect(isSome(some(1))).toBe(true)
      expect(isSome(none)).toBe(false)
      expect(isNone(none)).toBe(true)
      expect(isNone(some(1))).toBe(false)
    })
  })

  describe('operators', () => {
    it('map transforms Some, skips None', () => {
      expect(pipe(some(1), map((n) => n + 1))).toEqual(some(2))
      expect(pipe(none, map((n: number) => n + 1))).toBe(none)
    })

    it('flatMap chains Some, skips None', () => {
      const half = (n: number) => n % 2 === 0 ? some(n / 2) : none
      expect(pipe(some(4), flatMap(half))).toEqual(some(2))
      expect(pipe(some(3), flatMap(half))).toBe(none)
      expect(pipe(none, flatMap(half))).toBe(none)
    })

    it('andThen aliases flatMap', () => {
      const half = (n: number) => n % 2 === 0 ? some(n / 2) : none
      expect(pipe(some(4), andThen(half))).toEqual(some(2))
      expect(pipe(none, andThen(half))).toBe(none)
    })

    it('orElse returns the fallback only for None', () => {
      expect(pipe(some(1), orElse(some(2)))).toEqual(some(1))
      expect(pipe(none, orElse(some(2)))).toEqual(some(2))
    })

    it('orElseWith lazily returns the fallback only for None', () => {
      let calls = 0
      const fallback = () => {
        calls += 1
        return some(2)
      }

      expect(pipe(some(1), orElseWith(fallback))).toEqual(some(1))
      expect(calls).toBe(0)
      expect(pipe(none, orElseWith(fallback))).toEqual(some(2))
      expect(calls).toBe(1)
    })

    it('and returns the second option only when the first is Some', () => {
      expect(pipe(some(1), and(some('a')))).toEqual(some('a'))
      expect(pipe(some(1), and(none))).toBe(none)
      expect(pipe(none, and(some('a')))).toBe(none)
    })

    it('flatten unwraps nested options', () => {
      expect(flatten(some(some(1)))).toEqual(some(1))
      expect(flatten(some(none))).toBe(none)
      expect(flatten(none)).toBe(none)
    })

    it('zip combines two Some values', () => {
      expect(pipe(some(1), zip(some('a')))).toEqual(some([1, 'a']))
      expect(pipe(some(1), zip(none))).toBe(none)
      expect(pipe(none, zip(some('a')))).toBe(none)
    })

    it('zipWith combines two Some values with a function', () => {
      expect(pipe(some(1), zipWith(some(2), (a, b) => a + b))).toEqual(some(3))
      expect(pipe(some(1), zipWith(none, (a, b: number) => a + b))).toBe(none)
      expect(pipe(none, zipWith(some(2), (a: number, b) => a + b))).toBe(none)
    })

    it('contains checks Some values with Object.is semantics', () => {
      expect(pipe(some(1), contains(1))).toBe(true)
      expect(pipe(some(1), contains(2))).toBe(false)
      expect(pipe(none, contains(1))).toBe(false)
      expect(pipe(some(Number.NaN), contains(Number.NaN))).toBe(true)
    })

    it('exists checks predicates only for Some', () => {
      expect(pipe(some(2), exists((n) => n > 1))).toBe(true)
      expect(pipe(some(0), exists((n) => n > 1))).toBe(false)
      expect(pipe(none, exists((n: number) => n > 1))).toBe(false)
    })

    it('mapNullable maps nullish results to None', () => {
      const positiveLabel = (n: number) => n > 0 ? String(n) : null
      expect(pipe(some(1), mapNullable(positiveLabel))).toEqual(some('1'))
      expect(pipe(some(0), mapNullable(positiveLabel))).toBe(none)
      expect(pipe(none, mapNullable(positiveLabel))).toBe(none)
    })

    it('filter keeps matching Some, drops non-matching', () => {
      expect(pipe(some(4), filter((n) => n > 3))).toEqual(some(4))
      expect(pipe(some(2), filter((n) => n > 3))).toBe(none)
      expect(pipe(none, filter((n: number) => n > 3))).toBe(none)
    })

    it('getOrElse returns value or lazy default', () => {
      expect(pipe(some(1), getOrElse(() => 99))).toBe(1)
      expect(pipe(none, getOrElse(() => 99))).toBe(99)
    })

    it('getWithDefault returns value or strict default', () => {
      expect(pipe(some(1), getWithDefault(99))).toBe(1)
      expect(pipe(none, getWithDefault(99))).toBe(99)
    })

    it('match folds over both cases', () => {
      const fold = match(() => 'empty', (n: number) => `got ${n}`)
      expect(pipe(some(42), fold)).toBe('got 42')
      expect(pipe(none, fold)).toBe('empty')
    })

    it('tap calls effect for Some, returns original', () => {
      const calls: number[] = []
      const result = pipe(some(5), tap((n) => calls.push(n)))
      expect(result).toEqual(some(5))
      expect(calls).toEqual([5])
    })

    it('tap skips effect for None', () => {
      const calls: number[] = []
      const result = pipe(none, tap((n: number) => calls.push(n)))
      expect(result).toBe(none)
      expect(calls).toEqual([])
    })

    it('toNullable and toUndefined', () => {
      expect(toNullable(some(1))).toBe(1)
      expect(toNullable(none)).toBe(null)
      expect(toUndefined(some(1))).toBe(1)
      expect(toUndefined(none)).toBe(undefined)
    })
  })

  describe('toResult', () => {
    it('Some(a) → Ok(a)', () => {
      expect(pipe(some(42), toResult('missing'))).toEqual(ok(42))
    })

    it('None → Err(defaultError)', () => {
      expect(pipe(none, toResult('missing'))).toEqual(err('missing'))
    })
  })

  describe('pipeability', () => {
    it('chains through pipe', () => {
      expect(
        pipe(some(5), map((n) => n + 1), getOrElse(() => 0)),
      ).toBe(6)
    })

    it('short-circuits on None', () => {
      expect(
        pipe(none, map((n: number) => n + 1), getOrElse(() => 0)),
      ).toBe(0)
    })
  })

  describe('functor laws', () => {
    it('identity: map(x => x) roundtrips', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        expect(pipe(some(a), map((x) => x))).toEqual(some(a))
      }))
    })

    it('composition: map(f . g) === map(g) then map(f)', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        const f = (n: number) => n * 2
        const g = (n: number) => n + 1
        const left = pipe(some(a), map((x) => f(g(x))))
        const right = pipe(some(a), map(g), map(f))
        expect(left).toEqual(right)
      }))
    })
  })

  describe('monad laws', () => {
    it('left identity: flatMap(f)(some(a)) === f(a)', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        const f = (n: number) => some(n * 2)
        expect(pipe(some(a), flatMap(f))).toEqual(f(a))
      }))
    })

    it('right identity: flatMap(some)(m) === m', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        const m = some(a)
        expect(pipe(m, flatMap(some))).toEqual(m)
      }))
    })

    it('associativity', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        const f = (n: number) => some(n + 1)
        const g = (n: number) => some(n * 2)
        const left = pipe(some(a), flatMap(f), flatMap(g))
        const right = pipe(some(a), flatMap((x) => pipe(f(x), flatMap(g))))
        expect(left).toEqual(right)
      }))
    })
  })
})
