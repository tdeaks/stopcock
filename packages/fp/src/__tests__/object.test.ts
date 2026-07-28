import { describe, expect, it } from 'vite-plus/test'
import { pipe } from '../pipe'
import { none, some } from '../option'
import * as Obj from '../object'

const user = {
  name: 'Alice',
  age: 30,
  address: { city: 'London', zip: 'SW1' },
}

describe('object', () => {
  it('picks, omits, associates, and dissociates without mutating input', () => {
    expect(Obj.pick(['name', 'age'])(user)).toEqual({ name: 'Alice', age: 30 })
    expect(pipe(user, Obj.omit(['age']))).toEqual({
      name: 'Alice',
      address: user.address,
    })
    expect(Obj.assoc('b', 2)({ a: 1 })).toEqual({ a: 1, b: 2 })
    expect(pipe({ a: 1, b: 2 }, Obj.dissoc('a'))).toEqual({ b: 2 })
    expect(user).toEqual({
      name: 'Alice',
      age: 30,
      address: { city: 'London', zip: 'SW1' },
    })
  })

  it('preserves enumerable symbol keys and rejects prototype-polluting keys', () => {
    const symbol = Symbol('value')
    const source = { visible: 1, [symbol]: 2 }
    expect(Obj.keys(source)).toEqual(['visible', symbol])
    expect(Obj.pick([symbol])(source)).toEqual({ [symbol]: 2 })
    expect(() => Obj.assoc('__proto__', 1)(source)).toThrow(TypeError)
  })

  it('maps and filters keys and values into null-prototype records', () => {
    const mapped = pipe(
      { a: 1, b: 2 },
      Obj.mapValues((value) => value * 2),
    )
    expect(mapped).toEqual({ a: 2, b: 4 })
    expect(Object.getPrototypeOf(mapped)).toBeNull()
    expect(pipe({ a: 1 }, Obj.mapKeys((key) => `x_${String(key)}`))).toEqual({ x_a: 1 })
    expect(pipe({ a: 1, b: 2 }, Obj.pickBy((value) => value > 1))).toEqual({ b: 2 })
    expect(pipe({ a: 1, b: 2 }, Obj.omitBy((value) => value > 1))).toEqual({ a: 1 })
  })

  it('merges with an explicit resolver', () => {
    expect(
      pipe(
        { a: 1, b: 2 },
        Obj.mergeWith({ a: 10, b: 20, c: 30 }, (left, right) => Number(left) + Number(right)),
      ),
    ).toEqual({ a: 11, b: 22, c: 30 })
  })

  it('deep-merges with explicit bias and array policy', () => {
    const left = { x: { a: 1, b: 2 }, y: 3, values: [1, 2] }
    const right = { x: { a: 10, c: 30 }, y: 30, values: [3] }
    expect(Obj.mergeDeep(right, { bias: 'left' })(left)).toEqual({
      x: { a: 1, b: 2, c: 30 },
      y: 3,
      values: [1, 2],
    })
    expect(pipe(left, Obj.mergeDeep(right, { arrays: 'concat' }))).toEqual({
      x: { a: 10, b: 2, c: 30 },
      y: 30,
      values: [1, 2, 3],
    })
  })

  it('reads tuple paths and exposes Option for nullable or absent values', () => {
    expect(Obj.getPath(['name'])(user)).toEqual(some('Alice'))
    expect(pipe(user, Obj.getPath(['address', 'zip']))).toEqual(some('SW1'))
    expect(Obj.getPath(['address', 'city'])({} as typeof user)).toEqual(none)
    expect(Obj.getPathOrUndefined(['address', 'city'])(user)).toBe('London')
    expect(Obj.getPathOrUndefined(['address', 'city'])({} as typeof user)).toBeUndefined()
    expect(Obj.getPath(['present'])({ present: undefined })).toEqual(some(undefined))
    expect(Obj.hasPath(['address', 'city'])(user)).toBe(true)
    expect(Obj.hasPath(['address', 'missing'])(user)).toBe(false)
  })

  it('sets, modifies, and removes paths immutably', () => {
    const changed = Obj.setPath(['address', 'city'], 'York')(user)
    const modified = pipe(
      changed,
      Obj.modifyPath(['age'], (age) => Number(age) + 1),
    )
    const removable: {
      name: string
      age: number
      address: { city: string; zip?: string }
    } = modified
    const removed = Obj.removePath(['address', 'zip'])(removable)
    expect(removed).toEqual({
      name: 'Alice',
      age: 31,
      address: { city: 'York' },
    })
    expect(user.address).toEqual({ city: 'London', zip: 'SW1' })
  })

  it('builds typed reusable paths and evolves selected fields', () => {
    const city = Obj.pathOf<typeof user>()('address', 'city')
    expect(Obj.getPath(city)(user)).toEqual(some('London'))
    expect(
      pipe(
        user,
        Obj.evolve({
          name: (name) => name.toUpperCase(),
          age: (age) => age + 1,
        }),
      ),
    ).toEqual({ ...user, name: 'ALICE', age: 31 })
  })
})
