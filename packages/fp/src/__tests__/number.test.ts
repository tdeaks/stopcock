import { describe, it, expect } from 'vite-plus/test'
import { pipe } from '../pipe'
import { none, some } from '../option'
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
    it('empty → None', () => expect(N.mean([])).toEqual(none))
    it('single element = itself', () => expect(N.mean([5])).toEqual(some(5)))
    it('multiple elements', () => expect(N.mean([1, 2, 3])).toEqual(some(2)))
    it('provides explicit raw and total non-empty variants', () => {
      expect(N.meanOrUndefined([])).toBeUndefined()
      expect(N.meanOrUndefined([1, 2, 3])).toBe(2)
      expect(N.meanNonEmpty([1, 2, 3])).toBe(2)
    })
  })

  describe('median', () => {
    it('empty → None', () => expect(N.median([])).toEqual(none))
    it('odd length', () => expect(N.median([3, 1, 2])).toEqual(some(2)))
    it('even length', () => expect(N.median([1, 2, 3, 4])).toEqual(some(2.5)))
    it('single element', () => expect(N.median([7])).toEqual(some(7)))
    it('unsorted input', () => expect(N.median([5, 1, 3])).toEqual(some(3)))
  })

  describe('variance / standardDeviation', () => {
    it('known values', () => {
      const data = [2, 4, 4, 4, 5, 5, 7, 9]
      expect(N.variance(data)).toEqual(some(4))
      expect(N.standardDeviation(data)).toEqual(some(2))
    })
    it('uniform array → 0', () => {
      expect(N.variance([5, 5, 5])).toEqual(some(0))
      expect(N.standardDeviation([5, 5, 5])).toEqual(some(0))
    })
    it('empty → None', () => {
      expect(N.variance([])).toEqual(none)
      expect(N.standardDeviation([])).toEqual(none)
    })
    it('exposes sample-safe and total constrained variants', () => {
      expect(N.varianceSample([1])).toEqual(none)
      expect(N.varianceSampleAtLeastTwo([1, 3])).toBe(2)
      expect(N.standardDeviationSampleAtLeastTwo([1, 3])).toBeCloseTo(Math.sqrt(2))
    })
  })

  describe('percentile', () => {
    it('0th → min', () => expect(N.percentile([1, 2, 3, 4, 5], 0)).toEqual(some(1)))
    it('100th → max', () => expect(N.percentile([1, 2, 3, 4, 5], 100)).toEqual(some(5)))
    it('50th ≈ median', () => expect(N.percentile([1, 2, 3, 4, 5], 50)).toEqual(some(3)))
    it('data-last', () => expect(pipe([1, 2, 3, 4, 5], N.percentile(50))).toEqual(some(3)))
  })

  describe('min / max / minMax', () => {
    it('min', () => expect(N.min([3, 1, 2])).toEqual(some(1)))
    it('max', () => expect(N.max([3, 1, 2])).toEqual(some(3)))
    it('min negative', () => expect(N.min([-5, -1, -3])).toEqual(some(-5)))
    it('max negative', () => expect(N.max([-5, -1, -3])).toEqual(some(-1)))
    it('single element', () => {
      expect(N.min([7])).toEqual(some(7))
      expect(N.max([7])).toEqual(some(7))
    })
    it('minMax', () => expect(N.minMax([3, 1, 4, 1, 5])).toEqual(some([1, 5])))
    it('minMax negative', () => expect(N.minMax([-5, 3, -1])).toEqual(some([-5, 3])))
    it('minMax single', () => expect(N.minMax([7])).toEqual(some([7, 7])))
    it('minMax empty', () => expect(N.minMax([])).toEqual(none))
    it('non-empty variants are total', () => {
      expect(N.minNonEmpty([3, 1, 2])).toBe(1)
      expect(N.maxNonEmpty([3, 1, 2])).toBe(3)
      expect(N.minMaxNonEmpty([3, 1, 2])).toEqual([1, 3])
    })
  })

  describe('weightedMean', () => {
    it('returns Option and reserves undefined for the explicit escape hatch', () => {
      expect(N.weightedMean([10, 20], [1, 3])).toEqual(some(17.5))
      expect(N.weightedMean([10], [0])).toEqual(none)
      expect(N.weightedMeanOrUndefined([10], [0])).toBeUndefined()
    })
  })

  describe('dotProduct', () => {
    it('basic', () => expect(N.dotProduct([1, 2, 3], [4, 5, 6])).toBe(32))
    it('different lengths throw', () =>
      expect(() => N.dotProduct([1, 2, 3], [4, 5])).toThrow(RangeError))
    it('explicit truncate variant uses the shorter length', () =>
      expect(N.dotProductTruncate([1, 2, 3], [4, 5])).toBe(14))
    it('empty → 0', () => expect(N.dotProduct([], [])).toBe(0))
    it('data-last', () => expect(pipe([1, 2, 3], N.dotProduct([4, 5, 6]))).toBe(32))
  })
})
