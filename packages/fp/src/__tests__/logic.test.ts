import { describe, it, expect } from 'vitest'
import { pipe } from '../pipe'
import * as Logic from '../logic'

describe('logic', () => {
  describe('predicate combinators', () => {
    const isPositive = (n: number) => n > 0
    const isEven = (n: number) => n % 2 === 0

    it('both', () => {
      const pred = Logic.both(isPositive, isEven)
      expect(pred(4)).toBe(true)
      expect(pred(-2)).toBe(false)
      expect(pred(3)).toBe(false)
    })

    it('either', () => {
      const pred = Logic.either(isPositive, isEven)
      expect(pred(3)).toBe(true)
      expect(pred(-2)).toBe(true)
      expect(pred(-3)).toBe(false)
    })

    it('allPass', () => {
      const pred = Logic.allPass([isPositive, isEven])
      expect(pred(4)).toBe(true)
      expect(pred(3)).toBe(false)
    })

    it('anyPass', () => {
      const pred = Logic.anyPass([isPositive, isEven])
      expect(pred(-2)).toBe(true)
      expect(pred(-3)).toBe(false)
    })
  })

  describe('equals', () => {
    it('data-first', () => expect(Logic.equals(1, 1)).toBe(true))
    it('data-first false', () => expect(Logic.equals(1, 2)).toBe(false))
    it('data-last', () => expect(pipe(1, Logic.equals(1))).toBe(true))
  })

  describe('defaultTo', () => {
    it('data-first with value', () => expect(Logic.defaultTo('actual', 'fallback')).toBe('actual'))
    it('data-first with undefined', () => expect(Logic.defaultTo(undefined, 'fallback')).toBe('fallback'))
    it('data-last', () => expect(pipe(undefined, Logic.defaultTo('fallback'))).toBe('fallback'))
    it('data-last with value', () => expect(pipe('actual' as string | undefined, Logic.defaultTo('fallback'))).toBe('actual'))
  })

  describe('cond', () => {
    const conditions: [(n: number) => boolean, (n: number) => string][] = [
      [n => n < 0, () => 'negative'],
      [n => n === 0, () => 'zero'],
      [n => n > 0, () => 'positive'],
    ]

    it('data-first', () => expect(Logic.cond(5, conditions)).toBe('positive'))
    it('data-last', () => expect(pipe(-1, Logic.cond(conditions))).toBe('negative'))
  })

  describe('when_', () => {
    it('data-first applies', () => expect(Logic.when_(5, n => n > 0, n => n * 2)).toBe(10))
    it('data-first skips', () => expect(Logic.when_(-5, n => n > 0, n => n * 2)).toBe(-5))
    it('data-last', () => expect(pipe(5, Logic.when_((n: number) => n > 0, n => n * 2))).toBe(10))
  })

  describe('unless', () => {
    it('data-first applies', () => expect(Logic.unless(-5, n => n > 0, n => n * -1)).toBe(5))
    it('data-first skips', () => expect(Logic.unless(5, n => n > 0, n => n * -1)).toBe(5))
    it('data-last', () => expect(pipe(-5, Logic.unless((n: number) => n > 0, n => n * -1))).toBe(5))
  })
})
