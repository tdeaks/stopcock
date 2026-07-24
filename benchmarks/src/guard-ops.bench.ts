import { bench, describe } from 'vite-plus/test'
import * as G from '@stopcock/fp/guard'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'

const smallA = { x: 1, y: 'hello', z: true }
const smallB = { x: 1, y: 'hello', z: true }

const nestedA = { a: { b: { c: 1 } }, d: [1, 2], e: 'test' }
const nestedB = { a: { b: { c: 1 } }, d: [1, 2], e: 'test' }

const numsA = Array.from({ length: 100 }, (_, i) => i)
const numsB = Array.from({ length: 100 }, (_, i) => i)

describe('isDeepEqual — small objects (3 keys)', () => {
  bench('stopcock', () => G.isDeepEqual(smallA, smallB))
  bench('ramda', () => Ra.equals(smallA, smallB))
  bench('lodash', () => _.isEqual(smallA, smallB))
})

describe('isDeepEqual — nested objects (3 levels)', () => {
  bench('stopcock', () => G.isDeepEqual(nestedA, nestedB))
  bench('ramda', () => Ra.equals(nestedA, nestedB))
  bench('lodash', () => _.isEqual(nestedA, nestedB))
})

describe('isDeepEqual — arrays (100 numbers)', () => {
  bench('stopcock', () => G.isDeepEqual(numsA, numsB))
  bench('ramda', () => Ra.equals(numsA, numsB))
  bench('lodash', () => _.isEqual(numsA, numsB))
})

const small5A = { a: 1, b: 2, c: 3, d: 4, e: 5 }
const small5B = { a: 1, b: 2, c: 3, d: 4, e: 5 }

const large50A: Record<string, number> = {}
const large50B: Record<string, number> = {}
for (let i = 0; i < 50; i++) {
  large50A[`k${i}`] = i
  large50B[`k${i}`] = i
}

const enumerableOwnKeys = (value: object): PropertyKey[] =>
  Reflect.ownKeys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  )

const shallowManual = (a: object, b: object): boolean => {
  const ka = enumerableOwnKeys(a)
  if (ka.length !== enumerableOwnKeys(b).length) return false
  for (const key of ka) {
    if (
      !Object.prototype.propertyIsEnumerable.call(b, key) ||
      !Object.is(Reflect.get(a, key), Reflect.get(b, key))
    ) {
      return false
    }
  }
  return true
}

describe('isShallowEqual — small objects (5 keys)', () => {
  bench('stopcock', () => G.isShallowEqual(small5A, small5B))
  bench('manual equivalent Reflect.ownKeys + Object.is', () => shallowManual(small5A, small5B))
})

describe('isShallowEqual — large objects (50 keys)', () => {
  bench('stopcock', () => G.isShallowEqual(large50A, large50B))
  bench('manual equivalent Reflect.ownKeys + Object.is', () => shallowManual(large50A, large50B))
})
