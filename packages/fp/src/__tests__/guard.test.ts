import { describe, it, expect } from 'vitest'
import {
  is, propIs,
  isString, isNumber, isBoolean, isNonNull, isDefined,
  isNullish, isNonNullish, isArray, isPlainObject, isFunction,
  isBigInt, isDate, isEmpty, isEmptyish, isError, isPromise,
  isShallowEqual, isSymbol, isTruthy, isObjectType,
  isDeepEqual, isStrictEqual, isNil, isNotNil,
} from '../guard'

describe('guard', () => {
  describe('is', () => {
    it('true for matching instance', () => expect(is(Date, new Date())).toBe(true))
    it('false for non-instance', () => expect(is(Date, 'nope')).toBe(false))
    it('works with Error', () => expect(is(Error, new Error('x'))).toBe(true))
  })

  describe('propIs', () => {
    it('true when prop is instance', () => expect(propIs(Date, 'd', { d: new Date() })).toBe(true))
    it('false when prop is wrong type', () => expect(propIs(Date, 'd', { d: 'nope' })).toBe(false))
    it('false when prop missing', () => expect(propIs(Date, 'd', { x: 1 })).toBe(false))
  })

  describe('isString', () => {
    it('true for strings', () => expect(isString('hello')).toBe(true))
    it('false for numbers', () => expect(isString(42)).toBe(false))
  })

  describe('isNumber', () => {
    it('true for numbers', () => expect(isNumber(42)).toBe(true))
    it('true for NaN (typeof semantics)', () => expect(isNumber(NaN)).toBe(true))
    it('false for strings', () => expect(isNumber('42')).toBe(false))
  })

  describe('isBoolean', () => {
    it('true for booleans', () => expect(isBoolean(true)).toBe(true))
    it('false for numbers', () => expect(isBoolean(0)).toBe(false))
  })

  describe('isBigInt', () => {
    it('true for bigints', () => expect(isBigInt(BigInt(42))).toBe(true))
    it('false for numbers', () => expect(isBigInt(42)).toBe(false))
  })

  describe('isDate', () => {
    it('true for Date', () => expect(isDate(new Date())).toBe(true))
    it('false for string', () => expect(isDate('2024-01-01')).toBe(false))
  })

  describe('isEmpty', () => {
    it('true for null', () => expect(isEmpty(null)).toBe(true))
    it('true for undefined', () => expect(isEmpty(undefined)).toBe(true))
    it('true for empty string', () => expect(isEmpty('')).toBe(true))
    it('false for non-empty string', () => expect(isEmpty('a')).toBe(false))
    it('true for empty array', () => expect(isEmpty([])).toBe(true))
    it('false for non-empty array', () => expect(isEmpty([1])).toBe(false))
    it('true for empty object', () => expect(isEmpty({})).toBe(true))
    it('false for non-empty object', () => expect(isEmpty({ a: 1 })).toBe(false))
    it('false for number', () => expect(isEmpty(42)).toBe(false))
  })

  describe('isEmptyish', () => {
    it('true for null', () => expect(isEmptyish(null)).toBe(true))
    it('true for undefined', () => expect(isEmptyish(undefined)).toBe(true))
    it('true for empty string', () => expect(isEmptyish('')).toBe(true))
    it('true for empty array', () => expect(isEmptyish([])).toBe(true))
    it('false for non-empty string', () => expect(isEmptyish('x')).toBe(false))
  })

  describe('isError', () => {
    it('true for Error', () => expect(isError(new Error('x'))).toBe(true))
    it('true for TypeError', () => expect(isError(new TypeError('x'))).toBe(true))
    it('false for string', () => expect(isError('error')).toBe(false))
  })

  describe('isPlainObject', () => {
    it('true for plain objects', () => expect(isPlainObject({ a: 1 })).toBe(true))
    it('false for null', () => expect(isPlainObject(null)).toBe(false))
    it('false for arrays', () => expect(isPlainObject([1, 2])).toBe(false))
    it('false for functions', () => expect(isPlainObject(() => {})).toBe(false))
    it('false for Date', () => expect(isPlainObject(new Date())).toBe(false))
  })

  describe('isPromise', () => {
    it('true for Promise', () => expect(isPromise(Promise.resolve(1))).toBe(true))
    it('false for thenable-like object', () => expect(isPromise({ then: () => {} })).toBe(false))
    it('false for number', () => expect(isPromise(42)).toBe(false))
  })

  describe('isShallowEqual', () => {
    it('equal objects', () => expect(isShallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true))
    it('unequal objects', () => expect(isShallowEqual({ a: 1 }, { a: 2 })).toBe(false))
    it('different key counts', () => expect(isShallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false))
    it('same reference', () => { const o = { a: 1 }; expect(isShallowEqual(o, o)).toBe(true) })
    it('primitives', () => expect(isShallowEqual(1, 1)).toBe(true))
    it('different primitives', () => expect(isShallowEqual(1, 2)).toBe(false))
    it('null vs object', () => expect(isShallowEqual(null, { a: 1 })).toBe(false))
    it('object vs null', () => expect(isShallowEqual({ a: 1 }, null)).toBe(false))
  })

  describe('isSymbol', () => {
    it('true for symbol', () => expect(isSymbol(Symbol('x'))).toBe(true))
    it('false for string', () => expect(isSymbol('x')).toBe(false))
  })

  describe('isTruthy', () => {
    it('true for truthy values', () => {
      expect(isTruthy(1)).toBe(true)
      expect(isTruthy('x')).toBe(true)
      expect(isTruthy({})).toBe(true)
    })
    it('false for falsy values', () => {
      expect(isTruthy(0)).toBe(false)
      expect(isTruthy('')).toBe(false)
      expect(isTruthy(null)).toBe(false)
      expect(isTruthy(undefined)).toBe(false)
    })
  })

  describe('isNonNull', () => {
    it('true for values', () => expect(isNonNull(42)).toBe(true))
    it('true for undefined', () => expect(isNonNull(undefined)).toBe(true))
    it('false for null', () => expect(isNonNull(null)).toBe(false))
  })

  describe('isNonNullish', () => {
    it('true for values', () => expect(isNonNullish(42)).toBe(true))
    it('false for null', () => expect(isNonNullish(null)).toBe(false))
    it('false for undefined', () => expect(isNonNullish(undefined)).toBe(false))
  })

  describe('isDefined', () => {
    it('true for values', () => expect(isDefined(42)).toBe(true))
    it('true for null', () => expect(isDefined(null)).toBe(true))
    it('false for undefined', () => expect(isDefined(undefined)).toBe(false))
  })

  describe('isNullish', () => {
    it('true for null', () => expect(isNullish(null)).toBe(true))
    it('true for undefined', () => expect(isNullish(undefined)).toBe(true))
    it('false for 0', () => expect(isNullish(0)).toBe(false))
    it('false for empty string', () => expect(isNullish('')).toBe(false))
    it('false for false', () => expect(isNullish(false)).toBe(false))
  })

  describe('isArray', () => {
    it('true for arrays', () => expect(isArray([1, 2])).toBe(true))
    it('true for empty arrays', () => expect(isArray([])).toBe(true))
    it('false for objects', () => expect(isArray({ length: 0 })).toBe(false))
  })

  describe('isObjectType', () => {
    it('true for plain objects', () => expect(isObjectType({ a: 1 })).toBe(true))
    it('true for arrays', () => expect(isObjectType([1])).toBe(true))
    it('true for Date', () => expect(isObjectType(new Date())).toBe(true))
    it('false for null', () => expect(isObjectType(null)).toBe(false))
    it('false for string', () => expect(isObjectType('x')).toBe(false))
    it('false for number', () => expect(isObjectType(42)).toBe(false))
  })

  describe('isFunction', () => {
    it('true for functions', () => expect(isFunction(() => {})).toBe(true))
    it('false for objects', () => expect(isFunction({})).toBe(false))
  })

  describe('isDeepEqual', () => {
    it('equal Maps', () => {
      const a = new Map([['x', 1], ['y', 2]])
      const b = new Map([['x', 1], ['y', 2]])
      expect(isDeepEqual(a, b)).toBe(true)
    })

    it('unequal Maps (different size)', () => {
      const a = new Map([['x', 1]])
      const b = new Map([['x', 1], ['y', 2]])
      expect(isDeepEqual(a, b)).toBe(false)
    })

    it('unequal Maps (different values)', () => {
      const a = new Map([['x', 1]])
      const b = new Map([['x', 2]])
      expect(isDeepEqual(a, b)).toBe(false)
    })

    it('unequal Maps (missing key)', () => {
      const a = new Map([['x', 1]])
      const b = new Map([['y', 1]])
      expect(isDeepEqual(a, b)).toBe(false)
    })

    it('equal Sets', () => {
      expect(isDeepEqual(new Set([1, 2, 3]), new Set([1, 2, 3]))).toBe(true)
    })

    it('unequal Sets (different size)', () => {
      expect(isDeepEqual(new Set([1, 2]), new Set([1, 2, 3]))).toBe(false)
    })

    it('unequal Sets (different values)', () => {
      expect(isDeepEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false)
    })

    it('equal RegExps', () => {
      expect(isDeepEqual(/foo/gi, /foo/gi)).toBe(true)
    })

    it('unequal RegExps (different source)', () => {
      expect(isDeepEqual(/foo/, /bar/)).toBe(false)
    })

    it('unequal RegExps (different flags)', () => {
      expect(isDeepEqual(/foo/g, /foo/i)).toBe(false)
    })

    it('equal Dates', () => {
      const t = Date.now()
      expect(isDeepEqual(new Date(t), new Date(t))).toBe(true)
    })

    it('unequal Dates', () => {
      expect(isDeepEqual(new Date(1000), new Date(2000))).toBe(false)
    })

    it('array vs non-array object', () => {
      expect(isDeepEqual({ length: 0 }, [])).toBe(false)
    })

    it('non-array b when a is array', () => {
      expect(isDeepEqual([1], { 0: 1 })).toBe(false)
    })

    it('nested objects with Maps', () => {
      const a = { data: new Map([['k', [1, 2]]]) }
      const b = { data: new Map([['k', [1, 2]]]) }
      expect(isDeepEqual(a, b)).toBe(true)
    })

    it('nested objects with Sets', () => {
      const a = { items: new Set([1, 2]) }
      const b = { items: new Set([1, 2]) }
      expect(isDeepEqual(a, b)).toBe(true)
    })

    it('Map where a is Map but b is not', () => {
      expect(isDeepEqual(new Map(), {})).toBe(false)
    })

    it('Set where a is Set but b is not', () => {
      expect(isDeepEqual(new Set(), [])).toBe(false)
    })

    it('Date where b is not Date', () => {
      expect(isDeepEqual(new Date(), {})).toBe(false)
    })

    it('RegExp where b is not RegExp', () => {
      expect(isDeepEqual(/foo/, {})).toBe(false)
    })
  })
})
