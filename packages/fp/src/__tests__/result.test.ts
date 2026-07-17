import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  ok, err, isOk, isErr,
  map, mapErr, flatMap, andThen, flatten, getOrElse, match,
  orElse, orElseWith, and, zip, zipWith, contains, exists,
  toOption, tryCatch, fromThrowable, tryCatchAsync, fromNullable, tap, tapErr,
} from '../result'
import { some, none } from '../option'
import { pipe } from '../pipe'

describe('Result', () => {
  describe('constructors', () => {
    it('ok wraps a value', () => {
      expect(ok(1)).toEqual({ _tag: 1, value: 1 })
    })

    it('err wraps an error', () => {
      expect(err('fail')).toEqual({ _tag: 0, error: 'fail' })
    })
  })

  describe('guards', () => {
    it('isOk and isErr', () => {
      expect(isOk(ok(1))).toBe(true)
      expect(isOk(err('x'))).toBe(false)
      expect(isErr(err('x'))).toBe(true)
      expect(isErr(ok(1))).toBe(false)
    })
  })

  describe('operators', () => {
    it('map transforms Ok, skips Err', () => {
      expect(pipe(ok(1), map((n) => n + 1))).toEqual(ok(2))
      expect(pipe(err('x'), map((n: number) => n + 1))).toEqual(err('x'))
    })

    it('mapErr transforms Err, skips Ok', () => {
      expect(pipe(err('x'), mapErr((e) => e + '!'))).toEqual(err('x!'))
      expect(pipe(ok(1), mapErr((e: string) => e + '!'))).toEqual(ok(1))
    })

    it('flatMap chains Ok, skips Err', () => {
      const half = (n: number) => n % 2 === 0 ? ok(n / 2) : err('odd')
      expect(pipe(ok(4), flatMap(half))).toEqual(ok(2))
      expect(pipe(ok(3), flatMap(half))).toEqual(err('odd'))
      expect(pipe(err('x'), flatMap(half))).toEqual(err('x'))
    })

    it('andThen aliases flatMap', () => {
      const half = (n: number) => n % 2 === 0 ? ok(n / 2) : err('odd')
      expect(pipe(ok(4), andThen(half))).toEqual(ok(2))
      expect(pipe(err('x'), andThen(half))).toEqual(err('x'))
    })

    it('orElse returns fallback only for Err', () => {
      expect(pipe(ok(1), orElse(ok(2)))).toEqual(ok(1))
      expect(pipe(err('x'), orElse(ok(2)))).toEqual(ok(2))
      expect(pipe(err('x'), orElse(err('y')))).toEqual(err('y'))
    })

    it('orElseWith recovers from Err with access to the error', () => {
      const recover = (error: string) => ok(error.length)
      expect(pipe(ok(1), orElseWith(recover))).toEqual(ok(1))
      expect(pipe(err('fail'), orElseWith(recover))).toEqual(ok(4))
    })

    it('and returns the second result only when the first is Ok', () => {
      expect(pipe(ok(1), and(ok('a')))).toEqual(ok('a'))
      expect(pipe(ok(1), and(err('y')))).toEqual(err('y'))
      expect(pipe(err('x'), and(ok('a')))).toEqual(err('x'))
    })

    it('flatten unwraps nested results', () => {
      expect(flatten(ok(ok(1)))).toEqual(ok(1))
      expect(flatten(ok(err('inner')))).toEqual(err('inner'))
      expect(flatten(err('outer'))).toEqual(err('outer'))
    })

    it('zip combines two Ok values', () => {
      expect(pipe(ok(1), zip(ok('a')))).toEqual(ok([1, 'a']))
      expect(pipe(ok(1), zip(err('y')))).toEqual(err('y'))
      expect(pipe(err('x'), zip(ok('a')))).toEqual(err('x'))
    })

    it('zipWith combines two Ok values with a function', () => {
      expect(pipe(ok(1), zipWith(ok(2), (a, b) => a + b))).toEqual(ok(3))
      expect(pipe(ok(1), zipWith(err('y'), (a, b: number) => a + b))).toEqual(err('y'))
      expect(pipe(err('x'), zipWith(ok(2), (a: number, b) => a + b))).toEqual(err('x'))
    })

    it('contains checks Ok values with Object.is semantics', () => {
      expect(pipe(ok(1), contains(1))).toBe(true)
      expect(pipe(ok(1), contains(2))).toBe(false)
      expect(pipe(err('x'), contains(1))).toBe(false)
      expect(pipe(ok(Number.NaN), contains(Number.NaN))).toBe(true)
    })

    it('exists checks predicates only for Ok', () => {
      expect(pipe(ok(2), exists((n) => n > 1))).toBe(true)
      expect(pipe(ok(0), exists((n) => n > 1))).toBe(false)
      expect(pipe(err('x'), exists((n: number) => n > 1))).toBe(false)
    })

    it('getOrElse returns value or lazy default', () => {
      expect(pipe(ok(1), getOrElse(() => 99))).toBe(1)
      expect(pipe(err('x'), getOrElse(() => 99))).toBe(99)
    })

    it('match folds over both cases', () => {
      const fold = match((e: string) => `err: ${e}`, (n: number) => `ok: ${n}`)
      expect(pipe(ok(42), fold)).toBe('ok: 42')
      expect(pipe(err('fail'), fold)).toBe('err: fail')
    })

    it('tryCatch captures throwing fn', () => {
      expect(tryCatch(() => 42)).toEqual(ok(42))
      const result = tryCatch(() => { throw new Error('boom') })
      expect(isErr(result)).toBe(true)
    })

    it('fromThrowable aliases tryCatch', () => {
      expect(fromThrowable(() => 42)).toEqual(ok(42))
      expect(fromThrowable(() => { throw new Error('boom') }, () => 'boom')).toEqual(err('boom'))
    })

    it('tryCatchAsync captures resolved and rejected promises', async () => {
      await expect(tryCatchAsync(async () => 42)).resolves.toEqual(ok(42))
      await expect(
        tryCatchAsync(async () => {
          throw new Error('boom')
        }, (e) => e instanceof Error ? e.message : 'unknown'),
      ).resolves.toEqual(err('boom'))
    })

    it('fromNullable lifts values', () => {
      const lift = fromNullable('was null')
      expect(lift(1)).toEqual(ok(1))
      expect(lift(null)).toEqual(err('was null'))
      expect(lift(undefined)).toEqual(err('was null'))
    })

    it('toOption converts to Option', () => {
      expect(toOption(ok(1))).toEqual(some(1))
      expect(toOption(err('x'))).toBe(none)
    })

    it('tap calls effect for Ok, returns original', () => {
      const calls: number[] = []
      const result = pipe(ok(5), tap((n) => calls.push(n)))
      expect(result).toEqual(ok(5))
      expect(calls).toEqual([5])
    })

    it('tap skips effect for Err', () => {
      const calls: number[] = []
      const result = pipe(err('x'), tap((n: number) => calls.push(n)))
      expect(result).toEqual(err('x'))
      expect(calls).toEqual([])
    })

    it('tapErr calls effect for Err, returns original', () => {
      const calls: string[] = []
      const result = pipe(err('x'), tapErr((e) => calls.push(e)))
      expect(result).toEqual(err('x'))
      expect(calls).toEqual(['x'])
    })

    it('tapErr skips effect for Ok', () => {
      const calls: string[] = []
      const result = pipe(ok(1), tapErr((e: string) => calls.push(e)))
      expect(result).toEqual(ok(1))
      expect(calls).toEqual([])
    })
  })

  describe('pipeability', () => {
    it('chains through pipe', () => {
      expect(
        pipe(ok(10), map((n) => n * 2), getOrElse(() => 0)),
      ).toBe(20)
    })
  })

  describe('functor laws', () => {
    it('identity: map(x => x) roundtrips', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        expect(pipe(ok(a), map((x) => x))).toEqual(ok(a))
      }))
    })

    it('composition', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        const f = (n: number) => n * 2
        const g = (n: number) => n + 1
        expect(pipe(ok(a), map((x) => f(g(x))))).toEqual(pipe(ok(a), map(g), map(f)))
      }))
    })
  })

  describe('monad laws', () => {
    it('left identity', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        const f = (n: number) => ok(n * 2)
        expect(pipe(ok(a), flatMap(f))).toEqual(f(a))
      }))
    })

    it('right identity', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        const m = ok(a)
        expect(pipe(m, flatMap(ok))).toEqual(m)
      }))
    })

    it('associativity', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        const f = (n: number) => ok(n + 1)
        const g = (n: number) => ok(n * 2)
        const left = pipe(ok(a), flatMap(f), flatMap(g))
        const right = pipe(ok(a), flatMap((x) => pipe(f(x), flatMap(g))))
        expect(left).toEqual(right)
      }))
    })
  })

  describe('toOption consistency', () => {
    it('ok(a) |> toOption === some(a)', () => {
      fc.assert(fc.property(fc.integer(), (a) => {
        expect(toOption(ok(a))).toEqual(some(a))
      }))
    })
  })
})
