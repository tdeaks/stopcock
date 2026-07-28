import { describe, it, expect } from 'vite-plus/test'
import { pipe } from '../pipe'
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

    it('preserves the unary reflection contract: no prototype, one parameter', () => {
      for (const operator of [
        S.isEmpty,
        S.length,
        S.trim,
        S.trimStart,
        S.trimEnd,
        S.toLowerCase,
        S.toUpperCase,
      ]) {
        expect(operator.length).toBe(1)
        expect(Object.prototype.hasOwnProperty.call(operator, 'prototype')).toBe(false)
      }
    })
  })

  describe('arity 2 operators', () => {
    it('startsWith', () => expect(pipe('hello', S.startsWith('he'))).toBe(true))

    it('endsWith', () => expect(pipe('hello', S.endsWith('lo'))).toBe(true))

    it('includes', () => expect(pipe('hello', S.includes('ell'))).toBe(true))

    it('split', () => expect(pipe('a,b,c', S.split(','))).toEqual(['a', 'b', 'c']))

    it('preserves the operator reflection contract', () => {
      expect(S.split.name).toBe('split')
      expect(S.split.length).toBe(1)
      expect(Object.prototype.hasOwnProperty.call(S.split, 'prototype')).toBe(false)
    })

    it('repeat', () => expect(pipe('ab', S.repeat(3))).toBe('ababab'))
  })

  describe('arity 3 operators', () => {
    it('slice', () => expect(pipe('hello', S.slice(1, 3))).toBe('el'))

    it('replaceAll', () => expect(pipe('aabbcc', S.replaceAll('b', 'x'))).toBe('aaxxcc'))
  })

  describe('pipe composition', () => {
    it('chains string operations', () => {
      const result = pipe('  Hello World  ', S.trim, S.toLowerCase, S.split(' '))
      expect(result).toEqual(['hello', 'world'])
    })
  })
})
