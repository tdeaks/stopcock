import { bench, describe } from 'vitest'
import { Obj } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'

const obj = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10 }
const nested = { user: { name: 'Alice', address: { city: 'Portland', zip: '97201' } } }

describe('pick', () => {
  bench('stopcock', () => Obj.pick(obj, ['a', 'c', 'e']))
  bench('remeda', () => R.pick(obj, ['a', 'c', 'e']))
  bench('rambda', () => Rb.pick(['a', 'c', 'e'])(obj))
  bench('ramda', () => Ra.pick(['a', 'c', 'e'], obj))
  bench('lodash', () => _.pick(obj, ['a', 'c', 'e']))
})

describe('omit', () => {
  bench('stopcock', () => Obj.omit(obj, ['a', 'c', 'e']))
  bench('remeda', () => R.omit(obj, ['a', 'c', 'e']))
  bench('rambda', () => Rb.omit(['a', 'c', 'e'])(obj))
  bench('ramda', () => Ra.omit(['a', 'c', 'e'], obj))
  bench('lodash', () => _.omit(obj, ['a', 'c', 'e']))
})

describe('path', () => {
  bench('stopcock', () => Obj.path(nested, 'user.address.city'))
  bench('rambda', () => Rb.path(['user', 'address', 'city'])(nested))
  bench('ramda', () => Ra.path(['user', 'address', 'city'], nested))
  bench('lodash', () => _.get(nested, 'user.address.city'))
})

describe('assoc', () => {
  bench('stopcock', () => Obj.assoc(obj, 'a', 99))
  bench('rambda', () => Rb.assoc('a', 99)(obj))
  bench('ramda', () => Ra.assoc('a', 99, obj))
  bench('lodash', () => ({ ...obj, a: 99 }))
})

describe('dissoc', () => {
  bench('stopcock', () => Obj.dissoc(obj, 'a'))
  bench('rambda', () => Rb.dissoc('a')(obj))
  bench('ramda', () => Ra.dissoc('a', obj))
  bench('lodash', () => _.omit(obj, ['a']))
})

describe('mergeDeepRight', () => {
  const a = { x: { y: 1, z: 2 }, w: 3 }
  const b = { x: { y: 10 }, v: 4 }

  bench('stopcock', () => Obj.mergeDeepRight(a, b))
  bench('ramda', () => Ra.mergeDeepRight(a, b))
  bench('lodash', () => _.merge({}, a, b))
})

describe('evolve', () => {
  const spec = { a: (x: number) => x + 1, b: (x: number) => x * 2 }

  bench('stopcock', () => Obj.evolve(obj, spec))
  bench('rambda', () => Rb.evolve(spec)(obj))
  bench('ramda', () => Ra.evolve(spec, obj))
})
