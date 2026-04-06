import { describe, it, expect } from 'vitest'
import { pipe } from '../pipe'
import * as D from '../dict'

describe('dict', () => {
  describe('arity 1 re-exports', () => {
    it('keys', () => expect(D.keys({ a: 1, b: 2 }).sort()).toEqual(['a', 'b']))
    it('values', () => expect(D.values({ a: 1, b: 2 }).sort()).toEqual([1, 2]))
    it('isEmpty', () => expect(D.isEmpty({})).toBe(true))
    it('toEntries', () => expect(D.toEntries({ a: 1 })).toEqual([['a', 1]]))
    it('fromEntries', () => expect(D.fromEntries([['a', 1]])).toEqual({ a: 1 }))
  })

  describe('arity 2 dual wrappers', () => {
    it('map data-first', () => expect(D.map({ a: 1, b: 2 }, x => x * 10)).toEqual({ a: 10, b: 20 }))
    it('map data-last', () => expect(pipe({ a: 1, b: 2 }, D.map(x => x * 10))).toEqual({ a: 10, b: 20 }))

    it('filter data-first', () => expect(D.filter({ a: 1, b: 2, c: 3 }, x => x > 1)).toEqual({ b: 2, c: 3 }))
    it('filter data-last', () => expect(pipe({ a: 1, b: 2, c: 3 }, D.filter(x => x > 1))).toEqual({ b: 2, c: 3 }))

    it('get data-first', () => expect(D.get({ a: 1, b: 2 }, 'a')).toBe(1))
    it('get data-last', () => expect(pipe({ a: 1, b: 2 }, D.get('a'))).toBe(1))
    it('get missing key', () => expect(D.get({ a: 1 }, 'b')).toBeUndefined())

    it('merge data-first', () => expect(D.merge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 }))
    it('merge data-last', () => expect(pipe({ a: 1 }, D.merge({ b: 2 }))).toEqual({ a: 1, b: 2 }))
  })
})
