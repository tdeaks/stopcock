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
    expect(Obj.pick(user, ['name', 'age'])).toEqual({ name: 'Alice', age: 30 })
    expect(pipe(user, Obj.omit(['age']))).toEqual({
      name: 'Alice',
      address: user.address,
    })
    expect(Obj.assoc({ a: 1 }, 'b', 2)).toEqual({ a: 1, b: 2 })
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
    expect(Obj.pick(source, [symbol])).toEqual({ [symbol]: 2 })
    expect(() => Obj.assoc(source, '__proto__', 1)).toThrow(TypeError)
  })

  it('maps and filters keys and values into null-prototype records', () => {
    const mapped = Obj.mapValues({ a: 1, b: 2 }, (value) => value * 2)
    expect(mapped).toEqual({ a: 2, b: 4 })
    expect(Object.getPrototypeOf(mapped)).toBeNull()
    expect(Obj.mapKeys({ a: 1 }, (key) => `x_${String(key)}`)).toEqual({ x_a: 1 })
    expect(Obj.pickBy({ a: 1, b: 2 }, (value) => value > 1)).toEqual({ b: 2 })
    expect(Obj.omitBy({ a: 1, b: 2 }, (value) => value > 1)).toEqual({ a: 1 })
  })

  it('merges with an explicit resolver', () => {
    expect(
      Obj.mergeWith(
        { a: 1, b: 2 },
        { a: 10, b: 20, c: 30 },
        (left, right) => Number(left) + Number(right),
      ),
    ).toEqual({ a: 11, b: 22, c: 30 })
  })

  it('deep-merges with explicit bias and array policy', () => {
    const left = { x: { a: 1, b: 2 }, y: 3, values: [1, 2] }
    const right = { x: { a: 10, c: 30 }, y: 30, values: [3] }
    expect(Obj.mergeDeep(left, right, { bias: 'left' })).toEqual({
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
    expect(Obj.getPath(user, ['name'])).toEqual(some('Alice'))
    expect(pipe(user, Obj.getPath(['address', 'zip']))).toEqual(some('SW1'))
    expect(Obj.getPath({} as typeof user, ['address', 'city'])).toEqual(none)
    expect(Obj.getPathOrUndefined(user, ['address', 'city'])).toBe('London')
    expect(Obj.getPathOrUndefined({} as typeof user, ['address', 'city'])).toBeUndefined()
    expect(Obj.getPath({ present: undefined }, ['present'])).toEqual(some(undefined))
    expect(Obj.hasPath(user, ['address', 'city'])).toBe(true)
    expect(Obj.hasPath(user, ['address', 'missing'])).toBe(false)
  })

  it('sets, modifies, and removes paths immutably', () => {
    const changed = Obj.setPath(user, ['address', 'city'], 'York')
    const modified = Obj.modifyPath(changed, ['age'], (age) => Number(age) + 1)
    const removable: {
      name: string
      age: number
      address: { city: string; zip?: string }
    } = modified
    const removed = Obj.removePath(removable, ['address', 'zip'])
    expect(removed).toEqual({
      name: 'Alice',
      age: 31,
      address: { city: 'York' },
    })
    expect(user.address).toEqual({ city: 'London', zip: 'SW1' })
  })

  it('builds typed reusable paths and evolves selected fields', () => {
    const city = Obj.pathOf<typeof user>()('address', 'city')
    expect(Obj.getPath(user, city)).toEqual(some('London'))
    expect(
      Obj.evolve(user, {
        name: (name) => name.toUpperCase(),
        age: (age) => age + 1,
      }),
    ).toEqual({ ...user, name: 'ALICE', age: 31 })
  })
})
