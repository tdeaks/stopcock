import { describe, it, expect } from 'vite-plus/test'
import { pipe } from '../pipe'
import { trustedOperatorEntry } from '../internal/provenance'
import {
  OP_STR_IS_EMPTY,
  OP_STR_LENGTH,
  OP_STR_LOWER,
  OP_STR_SPLIT,
  OP_STR_TRIM,
  OP_STR_TRIM_END,
  OP_STR_TRIM_START,
  OP_STR_UPPER,
} from '../opcodes'
import * as S from '../string'

describe('string', () => {
  describe('arity 1 re-exports', () => {
    it('isEmpty', () => expect(S.isEmpty('')).toBe(true))
    it('length', () => expect(S.length('hello')).toBe(5))
    it('trim', () => expect(S.trim('  hi  ')).toBe('hi'))
    it('trimStart', () => expect(S.trimStart('  hi')).toBe('hi'))
    it('trimEnd', () => expect(S.trimEnd('hi  ')).toBe('hi'))
    it('toLowerCase', () => expect(S.toLowerCase('HELLO')).toBe('hello'))
    it('toUpperCase', () => expect(S.toUpperCase('hello')).toBe('HELLO'))

    it.each([
      ['isEmpty', S.isEmpty, OP_STR_IS_EMPTY],
      ['length', S.length, OP_STR_LENGTH],
      ['trim', S.trim, OP_STR_TRIM],
      ['trimStart', S.trimStart, OP_STR_TRIM_START],
      ['trimEnd', S.trimEnd, OP_STR_TRIM_END],
      ['toLowerCase', S.toLowerCase, OP_STR_LOWER],
      ['toUpperCase', S.toUpperCase, OP_STR_UPPER],
    ] as const)(
      '%s carries compatible public metadata and private provenance',
      (_, operator, op) => {
        expect((operator as { readonly _op?: number })._op).toBe(op)
        expect(Object.prototype.propertyIsEnumerable.call(operator, '_op')).toBe(true)
        expect(trustedOperatorEntry(operator)).toEqual({
          op,
          fn: undefined,
          a1: undefined,
          a2: undefined,
        })
      },
    )

    it('preserves the tagged unary reflection contract', () => {
      for (const operator of [
        S.isEmpty,
        S.length,
        S.trim,
        S.trimStart,
        S.trimEnd,
        S.toLowerCase,
        S.toUpperCase,
      ]) {
        expect(operator.name).toBe('')
        expect(operator.length).toBe(1)
        expect(Object.prototype.hasOwnProperty.call(operator, 'prototype')).toBe(false)
      }
    })
  })

  describe('arity 2 dual wrappers', () => {
    it('startsWith data-first', () => expect(S.startsWith('hello', 'he')).toBe(true))
    it('startsWith data-last', () => expect(pipe('hello', S.startsWith('he'))).toBe(true))

    it('endsWith data-first', () => expect(S.endsWith('hello', 'lo')).toBe(true))
    it('endsWith data-last', () => expect(pipe('hello', S.endsWith('lo'))).toBe(true))

    it('includes data-first', () => expect(S.includes('hello', 'ell')).toBe(true))
    it('includes data-last', () => expect(pipe('hello', S.includes('ell'))).toBe(true))

    it('split data-first', () => expect(S.split('a,b,c', ',')).toEqual(['a', 'b', 'c']))
    it('split data-last', () => expect(pipe('a,b,c', S.split(','))).toEqual(['a', 'b', 'c']))

    it('split data-last carries compatible public metadata and private provenance', () => {
      const separator = /,/u
      const operator = S.split(separator)
      expect((operator as { readonly _op?: number })._op).toBe(OP_STR_SPLIT)
      expect((operator as { readonly _fn?: unknown })._fn).toBe(separator)
      expect(trustedOperatorEntry(operator)).toEqual({
        op: OP_STR_SPLIT,
        fn: separator,
        a1: undefined,
        a2: undefined,
      })
    })

    it('preserves the tagged binary wrapper reflection contract', () => {
      expect(S.split.name).toBe('')
      expect(S.split.length).toBe(0)
      expect(Object.prototype.hasOwnProperty.call(S.split, 'prototype')).toBe(true)
    })

    it('repeat data-first', () => expect(S.repeat('ab', 3)).toBe('ababab'))
    it('repeat data-last', () => expect(pipe('ab', S.repeat(3))).toBe('ababab'))
  })

  describe('arity 3 dual wrappers', () => {
    it('slice data-first', () => expect(S.slice('hello', 1, 3)).toBe('el'))
    it('slice data-last', () => expect(pipe('hello', S.slice(1, 3))).toBe('el'))

    it('replaceAll data-first', () => expect(S.replaceAll('aabbcc', 'b', 'x')).toBe('aaxxcc'))
    it('replaceAll data-last', () => expect(pipe('aabbcc', S.replaceAll('b', 'x'))).toBe('aaxxcc'))
  })

  describe('pipe composition', () => {
    it('chains string operations', () => {
      const result = pipe('  Hello World  ', S.trim, S.toLowerCase, S.split(' '))
      expect(result).toEqual(['hello', 'world'])
    })
  })
})
