import { bench, describe } from 'vitest'
import { G } from '@stopcock/fp'
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

const shallowManual = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) if (a[k] !== b[k]) return false
  return true
}

describe('isShallowEqual — small objects (5 keys)', () => {
  bench('stopcock', () => G.isShallowEqual(small5A, small5B))
  bench('manual Object.keys + ===', () => shallowManual(small5A, small5B))
})

describe('isShallowEqual — large objects (50 keys)', () => {
  bench('stopcock', () => G.isShallowEqual(large50A, large50B))
  bench('manual Object.keys + ===', () => shallowManual(large50A, large50B))
})
