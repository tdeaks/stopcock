import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { flow } from '../flow'
import { pipe } from '../pipe'

describe('flow', () => {
  describe('basic', () => {
    it('composes a single function', () => {
      const f = flow((x: number) => x + 1)
      expect(f(1)).toBe(2)
    })

    it('threads types across multiple functions', () => {
      const f = flow(
        (s: string) => s.length,
        (n) => n > 3,
      )
      expect(f('hello')).toBe(true)
      expect(f('hi')).toBe(false)
    })

    it('chains many transforms', () => {
      const f = flow(
        (n: number) => n * 2,
        (n) => n + 1,
        (n) => String(n),
        (s) => s + '!',
      )
      expect(f(10)).toBe('21!')
    })
  })

  describe('20-arity coverage', () => {
    it('handles 20 functions', () => {
      const inc = (n: number) => n + 1
      const f = flow(
        inc, inc, inc, inc, inc,
        inc, inc, inc, inc, inc,
        inc, inc, inc, inc, inc,
        inc, inc, inc, inc, inc,
      )
      expect(f(0)).toBe(20)
    })
  })

  describe('equivalence with pipe', () => {
    it('flow(f, g)(x) === pipe(x, f, g)', () => {
      const f = (n: number) => n * 2
      const g = (n: number) => n + 1
      expect(flow(f, g)(5)).toBe(pipe(5, f, g))
    })
  })

  describe('properties', () => {
    it('flow(f, g)(x) === pipe(x, f, g)', () => {
      fc.assert(fc.property(fc.integer(), (x) => {
        const f = (n: number) => n * 2
        const g = (n: number) => n + 1
        expect(flow(f, g)(x)).toBe(pipe(x, f, g))
      }))
    })
  })
})
