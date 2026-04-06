import { describe, it, expect } from 'vitest'
import { pipe } from '../pipe'
import * as Obj from '../object'

const user = {
  name: 'Alice',
  age: 30,
  address: { city: 'London', zip: 'SW1' },
}

describe('object', () => {
  describe('ReScript wrappers', () => {
    it('pick data-first', () => expect(Obj.pick(user, ['name', 'age'])).toEqual({ name: 'Alice', age: 30 }))
    it('pick data-last', () => expect(pipe(user, Obj.pick(['name', 'age']))).toEqual({ name: 'Alice', age: 30 }))

    it('omit data-first', () => {
      const result = Obj.omit(user, ['age'])
      expect(result).toEqual({ name: 'Alice', address: user.address })
    })
    it('omit data-last', () => {
      const result = pipe(user, Obj.omit(['age']))
      expect(result).toEqual({ name: 'Alice', address: user.address })
    })

    it('dissoc data-first', () => {
      const result = Obj.dissoc({ a: 1, b: 2 }, 'a')
      expect(result).toEqual({ b: 2 })
    })
    it('dissoc data-last', () => expect(pipe({ a: 1, b: 2 }, Obj.dissoc('a'))).toEqual({ b: 2 }))

    it('assoc data-first', () => expect(Obj.assoc({ a: 1 }, 'b', 2)).toEqual({ a: 1, b: 2 }))
    it('assoc data-last', () => expect(pipe({ a: 1 }, Obj.assoc('b', 2))).toEqual({ a: 1, b: 2 }))

    it('mergeDeepLeft data-first', () => {
      const a = { x: { a: 1, b: 2 }, y: 3 }
      const b = { x: { a: 10, c: 30 }, y: 30 }
      const result = Obj.mergeDeepLeft(a, b)
      expect(result).toEqual({ x: { a: 1, b: 2, c: 30 }, y: 3 })
    })

    it('mergeDeepRight data-first', () => {
      const a = { x: { a: 1, b: 2 }, y: 3 }
      const b = { x: { a: 10, c: 30 }, y: 30 }
      const result = Obj.mergeDeepRight(a, b)
      expect(result).toEqual({ x: { a: 10, b: 2, c: 30 }, y: 30 })
    })

    it('mergeWith data-first', () => {
      const result = Obj.mergeWith({ a: 1, b: 2 }, { a: 10, b: 20 }, (l: number, r: number) => l + r)
      expect(result).toEqual({ a: 11, b: 22 })
    })

    it('mergeWith data-last', () => {
      const result = pipe({ a: 1, b: 2 }, Obj.mergeWith({ a: 10, b: 20 }, (l: number, r: number) => l + r))
      expect(result).toEqual({ a: 11, b: 22 })
    })

    it('mergeWith adds new keys from b', () => {
      const result = Obj.mergeWith({ a: 1 } as any, { a: 10, c: 30 }, (l: number, r: number) => l + r)
      expect(result).toEqual({ a: 11, c: 30 })
    })

    it('mergeDeepLeft data-last', () => {
      const result = pipe({ x: { a: 1 } }, Obj.mergeDeepLeft({ x: { b: 2 } }))
      expect(result).toEqual({ x: { a: 1, b: 2 } })
    })

    it('mergeDeepRight data-last', () => {
      const result = pipe({ x: { a: 1 } }, Obj.mergeDeepRight({ x: { a: 10, b: 2 } }))
      expect(result).toEqual({ x: { a: 10, b: 2 } })
    })
  })

  describe('path', () => {
    it('shallow access', () => expect(Obj.path(user, 'name')).toBe('Alice'))
    it('deep access', () => expect(Obj.path(user, 'address.city')).toBe('London'))
    it('missing intermediate → undefined', () => expect(Obj.path({} as typeof user, 'address.city')).toBeUndefined())
    it('data-last', () => expect(pipe(user, Obj.path('address.zip'))).toBe('SW1'))
  })

  describe('pathOr', () => {
    it('existing path returns value', () => expect(Obj.pathOr(user, 'name', 'default')).toBe('Alice'))
    it('missing path returns default', () => expect(Obj.pathOr({} as typeof user, 'address.city', 'unknown')).toBe('unknown'))
    it('data-last', () => expect(pipe(user, Obj.pathOr('address.city', 'unknown'))).toBe('London'))
  })

  describe('evolve', () => {
    it('transforms multiple keys', () => {
      const result = Obj.evolve({ a: 1, b: 'hello' }, { a: (n: number) => n + 1 })
      expect(result).toEqual({ a: 2, b: 'hello' })
    })

    it('untransformed pass through', () => {
      const result = Obj.evolve({ x: 10, y: 20 }, { x: (n: number) => n * 2 })
      expect(result).toEqual({ x: 20, y: 20 })
    })

    it('empty transforms → shallow copy', () => {
      const obj = { a: 1 }
      const result = Obj.evolve(obj, {})
      expect(result).toEqual(obj)
      expect(result).not.toBe(obj)
    })

    it('data-last', () => {
      const result = pipe(
        { count: 5, label: 'test' },
        Obj.evolve({ count: (n: number) => n * 2 }),
      )
      expect(result).toEqual({ count: 10, label: 'test' })
    })
  })
})
