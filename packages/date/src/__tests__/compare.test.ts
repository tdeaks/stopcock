import { describe, it, expect } from 'vitest'
import { compose } from '../core'
import { compare, min, max, clamp, earliest, latest } from '../compare'

const a = compose(2024, 1, 1, 0, 0, 0, 0)
const b = compose(2024, 6, 15, 0, 0, 0, 0)
const c = compose(2024, 12, 31, 0, 0, 0, 0)

describe('compare', () => {
  it('a < b = -1', () => expect(compare(a, b)).toBe(-1))
  it('b > a = 1', () => expect(compare(b, a)).toBe(1))
  it('a = a = 0', () => expect(compare(a, a)).toBe(0))
})

describe('min', () => {
  it('finds minimum', () => expect(min([c, a, b])).toBe(a))
})

describe('max', () => {
  it('finds maximum', () => expect(max([a, c, b])).toBe(c))
})

describe('clamp', () => {
  it('below range returns lo', () => expect(clamp(a, b, c)).toBe(b))
  it('above range returns hi', () => expect(clamp(c, a, b)).toBe(b))
  it('in range returns ts', () => expect(clamp(b, a, c)).toBe(b))

  it('data-last', () => {
    const fn = clamp(a, c)
    expect(fn(b)).toBe(b)
  })
})

describe('earliest', () => {
  it('returns earlier', () => expect(earliest(b, a)).toBe(a))
})

describe('latest', () => {
  it('returns later', () => expect(latest(a, b)).toBe(b))
})
