import { describe, it, expect } from 'vitest'
import { dual } from '../dual'
import { pipe } from '../pipe'

describe('dual', () => {
  describe('arity 2', () => {
    const add: {
      (a: number, b: number): number
      (b: number): (a: number) => number
    } = dual(2, (a: number, b: number) => a + b)

    it('data-first: executes immediately with all args', () => {
      expect(add(1, 2)).toBe(3)
    })

    it('data-last: returns curried function', () => {
      expect(add(2)(1)).toBe(3)
    })

    it('works in pipe', () => {
      expect(pipe(1, add(2))).toBe(3)
    })
  })

  describe('arity 3', () => {
    const clamp: {
      (value: number, min: number, max: number): number
      (min: number, max: number): (value: number) => number
    } = dual(3, (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max),
    )

    it('data-first: executes immediately with all args', () => {
      expect(clamp(5, 0, 10)).toBe(5)
      expect(clamp(-1, 0, 10)).toBe(0)
      expect(clamp(15, 0, 10)).toBe(10)
    })

    it('data-last: returns curried function', () => {
      expect(clamp(0, 10)(5)).toBe(5)
      expect(clamp(0, 10)(-1)).toBe(0)
    })

    it('works in pipe', () => {
      expect(pipe(5, clamp(0, 10))).toBe(5)
    })
  })

  describe('tagging', () => {
    const multiply = dual(2, (a: number, b: number) => a * b, { op: 'multiply' })

    it('tagged data-last form has _op and _fn', () => {
      const dataLast = multiply(3)
      expect(typeof dataLast._op).toBe('number')
      expect(dataLast._fn).toBe(3)
    })

    it('tagged data-first still works', () => {
      expect(multiply(4, 3)).toBe(12)
    })

    it('tagged data-last still works', () => {
      expect(multiply(3)(4)).toBe(12)
    })

    it('tagged works in pipe', () => {
      expect(pipe(4, multiply(3))).toBe(12)
    })

    it('untagged dual has no _op or _fn', () => {
      const add = dual(2, (a: number, b: number) => a + b)
      const dataLast = add(2)
      expect(dataLast._op).toBeUndefined()
      expect(dataLast._fn).toBeUndefined()
    })

    it('each data-last invocation gets fresh metadata', () => {
      const fn1 = multiply(5)
      const fn2 = multiply(10)
      expect(fn1._fn).toBe(5)
      expect(fn2._fn).toBe(10)
    })

    it('arity-1 tagged: wrapper itself has _op', () => {
      const negate = dual(1, (x: number) => -x, { op: 'negate' })
      expect(typeof negate._op).toBe('number')
      expect(negate(5)).toBe(-5)
    })

    it('arity-1 untagged: no _op on wrapper', () => {
      const negate = dual(1, (x: number) => -x)
      expect(negate._op).toBeUndefined()
    })
  })

  describe('arity 4', () => {
    const replace: {
      (s: string, from: string, to: string, count: number): string
      (from: string, to: string, count: number): (s: string) => string
    } = dual(4, (s: string, from: string, to: string, count: number) => {
      let result = s
      for (let i = 0; i < count; i++) result = result.replace(from, to)
      return result
    })

    it('data-first: executes immediately', () => {
      expect(replace('aaa', 'a', 'b', 2)).toBe('bba')
    })

    it('data-last: returns curried function', () => {
      expect(replace('a', 'b', 2)('aaa')).toBe('bba')
    })

    it('works in pipe', () => {
      expect(pipe('aaa', replace('a', 'b', 2))).toBe('bba')
    })
  })

  describe('arity 5 (generic fallback)', () => {
    const combine = dual(
      5,
      (a: number, b: number, c: number, d: number, e: number) => a + b + c + d + e,
    )

    it('data-first: all args', () => {
      expect(combine(1, 2, 3, 4, 5)).toBe(15)
    })

    it('data-last: curried', () => {
      expect(combine(2, 3, 4, 5)(1)).toBe(15)
    })

    it('works in pipe', () => {
      expect(pipe(1, combine(2, 3, 4, 5))).toBe(15)
    })
  })

  describe('tagged arity 3', () => {
    const tagged3 = dual(
      3,
      (data: number, a: number, b: number) => data + a + b,
      { op: 'map' },
    )

    it('data-first', () => expect(tagged3(10, 2, 3)).toBe(15))

    it('data-last has _op and _fn', () => {
      const dl = tagged3(2, 3)
      expect(typeof dl._op).toBe('number')
      expect(dl._fn).toBe(2)
      expect(dl._a1).toBe(3)
      expect(dl(10)).toBe(15)
    })
  })

  describe('tagged arity 4', () => {
    const tagged4 = dual(
      4,
      (data: number, a: number, b: number, c: number) => data + a + b + c,
      { op: 'map' },
    )

    it('data-first', () => expect(tagged4(10, 1, 2, 3)).toBe(16))

    it('data-last has _op, _fn, _a1, _a2', () => {
      const dl = tagged4(1, 2, 3)
      expect(typeof dl._op).toBe('number')
      expect(dl._fn).toBe(1)
      expect(dl._a1).toBe(2)
      expect(dl._a2).toBe(3)
      expect(dl(10)).toBe(16)
    })
  })

  describe('tagged arity 5+ (generic fallback)', () => {
    const tagged5 = dual(
      5,
      (a: number, b: number, c: number, d: number, e: number) => a + b + c + d + e,
      { op: 'map' },
    )

    it('data-first', () => expect(tagged5(1, 2, 3, 4, 5)).toBe(15))

    it('data-last has _op and _fn', () => {
      const dl = tagged5(2, 3, 4, 5)
      expect(typeof dl._op).toBe('number')
      expect(dl._fn).toBe(2)
      expect(dl(1)).toBe(15)
    })
  })
})
