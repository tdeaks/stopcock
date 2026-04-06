import { describe, it, expect } from 'vitest'
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
      const result = pipe(
        '  Hello World  ',
        S.trim,
        S.toLowerCase,
        S.split(' '),
      )
      expect(result).toEqual(['hello', 'world'])
    })
  })
})
