import { describe, it, expect } from 'vite-plus/test'
import { pipe } from '../pipe'
import * as B from '../boolean'

describe('boolean', () => {
  it('not_', () => expect(B.not_(true)).toBe(false))

  describe('and_', () => {
    it('true', () => expect(pipe(true, B.and_(true))).toBe(true))
    it('false', () => expect(pipe(false, B.and_(true))).toBe(false))
  })

  describe('or_', () => {
    it('false', () => expect(pipe(false, B.or_(true))).toBe(true))
    it('true', () => expect(pipe(true, B.or_(false))).toBe(true))
  })

  describe('ifElse', () => {
    it('true', () =>
      expect(
        pipe(
          true,
          B.ifElse(
            () => 'yes',
            () => 'no',
          ),
        ),
      ).toBe('yes'))
    it('false', () =>
      expect(
        pipe(
          false,
          B.ifElse(
            () => 'yes',
            () => 'no',
          ),
        ),
      ).toBe('no'))
  })
})
