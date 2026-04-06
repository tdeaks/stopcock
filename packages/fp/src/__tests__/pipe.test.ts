import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { pipe } from '../pipe'
import * as A from '../array'
import * as M from '../math'
import * as S from '../string'

describe('pipe', () => {
  describe('basic', () => {
    it('threads a value through one function', () => {
      expect(pipe(1, (x) => x + 1)).toBe(2)
    })

    it('identity passthrough', () => {
      expect(pipe(1, (x) => x)).toBe(1)
    })

    it('threads types across multiple functions', () => {
      const result = pipe(
        'hello',
        (s) => s.length,
        (n) => n > 3,
      )
      expect(result).toBe(true)
    })

    it('chains many transforms', () => {
      expect(
        pipe(
          10,
          (n) => n * 2,
          (n) => n + 1,
          (n) => String(n),
          (s) => s + '!',
        ),
      ).toBe('21!')
    })
  })

  describe('20-arity coverage', () => {
    it('handles 20 functions', () => {
      const inc = (n: number) => n + 1
      expect(
        pipe(
          0,
          inc, inc, inc, inc, inc,
          inc, inc, inc, inc, inc,
          inc, inc, inc, inc, inc,
          inc, inc, inc, inc, inc,
        ),
      ).toBe(20)
    })
  })

  describe('large chain (general loop path)', () => {
    it('handles 8 plain functions via general loop', () => {
      const inc = (n: number) => n + 1
      expect(
        pipe(0, inc, inc, inc, inc, inc, inc, inc, inc),
      ).toBe(8)
    })

    it('handles 10 plain functions', () => {
      const dbl = (n: number) => n * 2
      const add1 = (n: number) => n + 1
      expect(
        pipe(1, dbl, add1, dbl, add1, dbl, add1, dbl, add1, dbl, add1),
      ).toBe(63)
    })
  })

  describe('5 plain functions (argc=6 untagged path)', () => {
    it('threads through 5 untagged functions', () => {
      expect(
        pipe(
          1,
          (n: number) => n + 1,
          (n: number) => n * 2,
          (n: number) => n + 3,
          (n: number) => n * 4,
          (n: number) => String(n),
        ),
      ).toBe('28')
    })
  })

  describe('6 plain functions (argc=7 untagged path)', () => {
    it('threads through 6 untagged functions', () => {
      expect(
        pipe(
          1,
          (n: number) => n + 1,
          (n: number) => n * 2,
          (n: number) => n + 3,
          (n: number) => n * 4,
          (n: number) => n - 1,
          (n: number) => String(n),
        ),
      ).toBe('27')
    })
  })

  describe('7+ tagged array ops (fuseArray path)', () => {
    it('fuses 7 tagged array ops via fuseArray', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      expect(
        pipe(
          data,
          A.map((x: number) => x * 2),
          A.filter((x: number) => x > 4),
          A.map((x: number) => x + 1),
          A.filter((x: number) => x % 2 === 1),
          A.map((x: number) => x - 1),
          A.filter((x: number) => x > 5),
          A.take(3),
        ),
      ).toEqual([6, 8, 10])
    })
  })

  describe('7+ tagged ops with non-array ops (fuse path)', () => {
    it('mixes array and scalar ops in long pipe', () => {
      expect(
        pipe(
          10,
          M.add(5),
          M.multiply(2),
          M.subtract(3),
          M.add(1),
          M.negate,
          M.negate,
          M.inc,
        ),
      ).toBe(29)
    })
  })

  describe('properties', () => {
    it('pipe(x, f, g) === g(f(x))', () => {
      fc.assert(fc.property(fc.integer(), (x) => {
        const f = (n: number) => n * 2
        const g = (n: number) => n + 1
        expect(pipe(x, f, g)).toBe(g(f(x)))
      }))
    })
  })
})
