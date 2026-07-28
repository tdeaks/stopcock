import { describe, it, expect } from 'vite-plus/test'
import { pipe } from '../pipe'
import * as M from '../math'

describe('math', () => {
  describe('arity 1', () => {
    it('inc', () => expect(M.inc(1)).toBe(2))
    it('dec', () => expect(M.dec(3)).toBe(2))
    it('negate', () => expect(M.negate(5)).toBe(-5))
    it('product', () => expect(M.product([2, 3, 4])).toBe(24))
  })

  describe('arity 2', () => {
    it('add', () => expect(pipe(1, M.add(2))).toBe(3))
    it('subtract', () => expect(pipe(5, M.subtract(3))).toBe(2))
    it('multiply', () => expect(pipe(3, M.multiply(4))).toBe(12))
    it('divide', () => expect(pipe(10, M.divide(2))).toBe(5))
    it('modulo', () => expect(pipe(7, M.modulo(3))).toBe(1))
  })

  describe('pipe composition', () => {
    it('chains math operations', () => {
      expect(pipe(10, M.add(5), M.multiply(2), M.subtract(10))).toBe(20)
    })
  })
})
