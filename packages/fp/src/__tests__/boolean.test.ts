import { describe, it, expect } from 'vitest'
import { pipe } from '../pipe'
import * as B from '../boolean'

describe('boolean', () => {
  it('not_', () => expect(B.not_(true)).toBe(false))

  describe('and_', () => {
    it('data-first true', () => expect(B.and_(true, false)).toBe(false))
    it('data-first false', () => expect(B.and_(false, true)).toBe(false))
    it('data-last true', () => expect(pipe(true, B.and_(true))).toBe(true))
    it('data-last false', () => expect(pipe(false, B.and_(true))).toBe(false))
  })

  describe('or_', () => {
    it('data-first false', () => expect(B.or_(false, true)).toBe(true))
    it('data-first true', () => expect(B.or_(true, false)).toBe(true))
    it('data-last false', () => expect(pipe(false, B.or_(true))).toBe(true))
    it('data-last true', () => expect(pipe(true, B.or_(false))).toBe(true))
  })

  describe('ifElse', () => {
    it('data-first true', () => expect(B.ifElse(true, () => 'yes', () => 'no')).toBe('yes'))
    it('data-first false', () => expect(B.ifElse(false, () => 'yes', () => 'no')).toBe('no'))
    it('data-last true', () => expect(pipe(true, B.ifElse(() => 'yes', () => 'no'))).toBe('yes'))
    it('data-last false', () => expect(pipe(false, B.ifElse(() => 'yes', () => 'no'))).toBe('no'))
  })
})
