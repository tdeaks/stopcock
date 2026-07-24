import { bench, describe } from 'vite-plus/test'
import * as Optic from '@stopcock/fp/optic'
import * as Ra from 'ramda'

const obj = { name: 'Alice', age: 30, address: { city: 'Portland', zip: '97201' } }
const arr = [10, 20, 30, 40, 50]
const batchSize = 100_000

// Rambda 11 no longer exposes lens/view/set/over helpers, so lens cases compare Stopcock with Ramda only.
function batch<T>(operation: () => T): T {
  let result!: T
  for (let i = 0; i < batchSize; i++) result = operation()
  return result
}

describe('lensProp + view', () => {
  const l = Optic.prop<typeof obj, 'name'>('name')
  const raL = Ra.lensProp<typeof obj, 'name'>('name')

  bench('stopcock', () => batch(() => Optic.view(l, obj)))
  bench('ramda', () => batch(() => Ra.view(raL, obj)))
})

describe('lensProp + set', () => {
  const l = Optic.prop<typeof obj, 'name'>('name')
  const raL = Ra.lensProp<typeof obj, 'name'>('name')

  bench('stopcock', () => batch(() => Optic.set(l, obj, 'Bob')))
  bench('ramda', () => batch(() => Ra.set(raL, 'Bob', obj)))
})

describe('lensProp + over', () => {
  const l = Optic.prop<typeof obj, 'age'>('age')
  const raL = Ra.lensProp<typeof obj, 'age'>('age')

  bench('stopcock', () => batch(() => Optic.modify(l, obj, (x: number) => x + 1)))
  bench('ramda', () => batch(() => Ra.over(raL, (x: number) => x + 1, obj)))
})

describe('lensIndex + view', () => {
  const l = Optic.index<number>(2)
  const raL = Ra.lensIndex<number>(2)

  bench('stopcock Option preview', () => batch(() => Optic.preview(l, arr)))
  bench('ramda', () => batch(() => Ra.view(raL, arr)))
})

describe('lensPath + view', () => {
  const l = Optic.compose(
    Optic.prop<typeof obj, 'address'>('address'),
    Optic.prop<typeof obj.address, 'city'>('city'),
  )
  const raL = Ra.lensPath(['address', 'city'])

  bench('stopcock', () => batch(() => Optic.view(l, obj)))
  bench('ramda', () => batch(() => Ra.view(raL, obj)))
})

describe('lensPath + set (deep)', () => {
  const l = Optic.compose(
    Optic.prop<typeof obj, 'address'>('address'),
    Optic.prop<typeof obj.address, 'city'>('city'),
  )
  const raL = Ra.lensPath(['address', 'city'])

  bench('stopcock', () => batch(() => Optic.set(l, obj, 'Seattle')))
  bench('ramda', () => batch(() => Ra.set(raL, 'Seattle', obj)))
})
