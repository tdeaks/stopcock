import { bench, describe } from 'vitest'
import { lens, lensProp, lensIndex, lensPath, view, set, over } from '@stopcock/fp'
import * as Ra from 'ramda'
import * as Rb from 'rambda'

const obj = { name: 'Alice', age: 30, address: { city: 'Portland', zip: '97201' } }
const arr = [10, 20, 30, 40, 50]

describe('lensProp + view', () => {
  const l = lensProp<typeof obj, 'name'>('name')
  const raL = Ra.lensProp<typeof obj, 'name'>('name')
  const rbL = Rb.lensProp<typeof obj>('name')

  bench('stopcock', () => view(l, obj))
  bench('rambda', () => Rb.view(rbL)(obj))
  bench('ramda', () => Ra.view(raL, obj))
})

describe('lensProp + set', () => {
  const l = lensProp<typeof obj, 'name'>('name')
  const raL = Ra.lensProp<typeof obj, 'name'>('name')
  const rbL = Rb.lensProp<typeof obj>('name')

  bench('stopcock', () => set(l, 'Bob', obj))
  bench('rambda', () => Rb.set(rbL, 'Bob')(obj))
  bench('ramda', () => Ra.set(raL, 'Bob', obj))
})

describe('lensProp + over', () => {
  const l = lensProp<typeof obj, 'age'>('age')
  const raL = Ra.lensProp<typeof obj, 'age'>('age')
  const rbL = Rb.lensProp<typeof obj>('age')

  bench('stopcock', () => over(l, (x: number) => x + 1, obj))
  bench('rambda', () => Rb.over(rbL, (x: number) => x + 1)(obj))
  bench('ramda', () => Ra.over(raL, (x: number) => x + 1, obj))
})

describe('lensIndex + view', () => {
  const l = lensIndex<number>(2)
  const raL = Ra.lensIndex<number>(2)
  const rbL = Rb.lensIndex(2)

  bench('stopcock', () => view(l, arr))
  bench('rambda', () => Rb.view(rbL)(arr))
  bench('ramda', () => Ra.view(raL, arr))
})

describe('lensPath + view', () => {
  const l = lensPath<typeof obj>(['address', 'city'])
  const raL = Ra.lensPath(['address', 'city'])
  const rbL = Rb.lensPath(['address', 'city'])

  bench('stopcock', () => view(l, obj))
  bench('rambda', () => Rb.view(rbL)(obj))
  bench('ramda', () => Ra.view(raL, obj))
})

describe('lensPath + set (deep)', () => {
  const l = lensPath<typeof obj>(['address', 'city'])
  const raL = Ra.lensPath(['address', 'city'])
  const rbL = Rb.lensPath(['address', 'city'])

  bench('stopcock', () => set(l, 'Seattle', obj))
  bench('rambda', () => Rb.set(rbL, 'Seattle')(obj))
  bench('ramda', () => Ra.set(raL, 'Seattle', obj))
})
