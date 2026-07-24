import { describe, expect, it } from 'vite-plus/test'
import * as G from '../guard'
import * as O from '../option'

describe('Option predicate combinators', () => {
  it('fromPredicate supports data-first and data-last forms', () => {
    const positive = (value: number) => value > 0

    expect(O.fromPredicate(1, positive)).toEqual(O.some(1))
    expect(O.fromPredicate(positive)(1)).toEqual(O.some(1))
    expect(O.fromPredicate(-1, positive)).toBe(O.none)
    expect(O.fromPredicate(positive)(-1)).toBe(O.none)
  })

  it('filter supports both forms without changing runtime identity behavior', () => {
    const value = O.some(2)
    const even = (input: number) => input % 2 === 0

    expect(O.filter(value, even)).toBe(value)
    expect(O.filter(even)(value)).toBe(value)
    expect(O.filter(O.some(1), even)).toBe(O.none)
    expect(O.filter(even)(O.some(1))).toBe(O.none)
    expect(O.filter(O.none, even)).toBe(O.none)
  })
})

describe('Guards', () => {
  it('recognizes only finite numbers', () => {
    expect(G.isFiniteNumber(0)).toBe(true)
    expect(G.isFiniteNumber(1.5)).toBe(true)
    expect(G.isFiniteNumber(Number.NaN)).toBe(false)
    expect(G.isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false)
    expect(G.isFiniteNumber(Number.NEGATIVE_INFINITY)).toBe(false)
    expect(G.isFiniteNumber('1')).toBe(false)
  })

  it('recognizes non-blank strings', () => {
    expect(G.isNonBlankString('value')).toBe(true)
    expect(G.isNonBlankString('  value  ')).toBe(true)
    expect(G.isNonBlankString('')).toBe(false)
    expect(G.isNonBlankString(' \n\t ')).toBe(false)
    expect(G.isNonBlankString(1)).toBe(false)
  })

  it('validates every array element', () => {
    const strings = G.isArrayOf(G.isString)

    expect(strings([])).toBe(true)
    expect(strings(['a', 'b'])).toBe(true)
    expect(strings(['a', 1])).toBe(false)
    expect(strings({ 0: 'a', length: 1 })).toBe(false)
  })

  it('accepts only plain records and validates own enumerable string values', () => {
    const numbers = G.isRecordOf(G.isFiniteNumber)

    expect(numbers({})).toBe(true)
    expect(numbers({ one: 1, two: 2 })).toBe(true)
    expect(numbers({ one: 1, two: '2' })).toBe(false)
    expect(numbers([1, 2])).toBe(false)
    expect(
      numbers(
        new (class RecordLike {
          one = 1
        })(),
      ),
    ).toBe(false)
    expect(numbers(Object.assign(Object.create({ inherited: 1 }), { own: 2 }))).toBe(false)

    Object.defineProperty(Object.prototype, '__stopcockInheritedGuardTest', {
      configurable: true,
      enumerable: true,
      value: 'not a number',
      writable: true,
    })
    try {
      expect(numbers({ own: 1 })).toBe(true)
    } finally {
      delete (Object.prototype as Record<string, unknown>).__stopcockInheritedGuardTest
    }
  })
})
