import { describe, it, expect } from 'vitest'
import { pipe } from '../pipe'
import * as N from '../number'

describe('number', () => {
  describe('ReScript wrappers', () => {
    it('isEven', () => expect(N.isEven(4)).toBe(true))
    it('isOdd', () => expect(N.isOdd(3)).toBe(true))

    it('clamp data-first', () => {
      expect(N.clamp(5, 0, 10)).toBe(5)
      expect(N.clamp(-1, 0, 10)).toBe(0)
      expect(N.clamp(15, 0, 10)).toBe(10)
    })
    it('clamp data-last', () => expect(pipe(5, N.clamp(0, 10))).toBe(5))
  })

  describe('sum', () => {
    it('empty → 0', () => expect(N.sum([])).toBe(0))
    it('single element', () => expect(N.sum([5])).toBe(5))
    it('multiple elements', () => expect(N.sum([1, 2, 3])).toBe(6))
    it('negative numbers', () => expect(N.sum([-1, 1, -2, 2])).toBe(0))
  })

  describe('mean', () => {
    it('empty → NaN', () => expect(N.mean([])).toBeNaN())
    it('single element = itself', () => expect(N.mean([5])).toBe(5))
    it('multiple elements', () => expect(N.mean([1, 2, 3])).toBe(2))
  })

  describe('median', () => {
    it('empty → NaN', () => expect(N.median([])).toBeNaN())
    it('odd length', () => expect(N.median([3, 1, 2])).toBe(2))
    it('even length', () => expect(N.median([1, 2, 3, 4])).toBe(2.5))
    it('single element', () => expect(N.median([7])).toBe(7))
    it('unsorted input', () => expect(N.median([5, 1, 3])).toBe(3))
  })

  describe('variance / standardDeviation', () => {
    it('known values', () => {
      const data = [2, 4, 4, 4, 5, 5, 7, 9]
      expect(N.variance(data)).toBeCloseTo(4, 5)
      expect(N.standardDeviation(data)).toBeCloseTo(2, 5)
    })
    it('uniform array → 0', () => {
      expect(N.variance([5, 5, 5])).toBe(0)
      expect(N.standardDeviation([5, 5, 5])).toBe(0)
    })
    it('empty → NaN', () => {
      expect(N.variance([])).toBeNaN()
      expect(N.standardDeviation([])).toBeNaN()
    })
  })

  describe('percentile', () => {
    it('0th → min', () => expect(N.percentile([1, 2, 3, 4, 5], 0)).toBe(1))
    it('100th → max', () => expect(N.percentile([1, 2, 3, 4, 5], 100)).toBe(5))
    it('50th ≈ median', () => expect(N.percentile([1, 2, 3, 4, 5], 50)).toBe(3))
    it('data-last', () => expect(pipe([1, 2, 3, 4, 5], N.percentile(50))).toBe(3))
  })

  describe('min / max / minMax', () => {
    it('min', () => expect(N.min([3, 1, 2])).toBe(1))
    it('max', () => expect(N.max([3, 1, 2])).toBe(3))
    it('min negative', () => expect(N.min([-5, -1, -3])).toBe(-5))
    it('max negative', () => expect(N.max([-5, -1, -3])).toBe(-1))
    it('single element', () => {
      expect(N.min([7])).toBe(7)
      expect(N.max([7])).toBe(7)
    })
    it('minMax', () => expect(N.minMax([3, 1, 4, 1, 5])).toEqual([1, 5]))
    it('minMax negative', () => expect(N.minMax([-5, 3, -1])).toEqual([-5, 3]))
    it('minMax single', () => expect(N.minMax([7])).toEqual([7, 7]))
    it('minMax empty', () => expect(N.minMax([])).toEqual([Infinity, -Infinity]))
  })

  describe('dotProduct', () => {
    it('basic', () => expect(N.dotProduct([1, 2, 3], [4, 5, 6])).toBe(32))
    it('different lengths (truncate)', () => expect(N.dotProduct([1, 2, 3], [4, 5])).toBe(14))
    it('empty → 0', () => expect(N.dotProduct([], [])).toBe(0))
    it('data-last', () => expect(pipe([1, 2, 3], N.dotProduct([4, 5, 6]))).toBe(32))
  })
})
