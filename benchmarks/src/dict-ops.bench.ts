import { bench, describe } from 'vitest'
import { D } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'

const small: Record<string, number> = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [`key${i}`, i]),
)
const medium: Record<string, number> = Object.fromEntries(
  Array.from({ length: 100 }, (_, i) => [`key${i}`, i]),
)
const large: Record<string, number> = Object.fromEntries(
  Array.from({ length: 1000 }, (_, i) => [`key${i}`, i]),
)
const dicts = { 10: small, 100: medium, 1000: large } as Record<number, Record<string, number>>

describe.each([10, 100, 1000])('keys — n=%i', (n) => {
  const dict = dicts[n]
  bench('stopcock', () => D.keys(dict))
  bench('ramda', () => Ra.keys(dict))
  bench('lodash', () => _.keys(dict))
})

describe.each([10, 100, 1000])('values — n=%i', (n) => {
  const dict = dicts[n]
  bench('stopcock', () => D.values(dict))
  bench('ramda', () => Ra.values(dict))
  bench('lodash', () => _.values(dict))
})

describe.each([10, 100, 1000])('map (dict) — n=%i', (n) => {
  const dict = dicts[n]
  const fn = (v: number) => v * 2

  bench('stopcock', () => D.map(dict, fn))
  bench('remeda', () => R.mapValues(dict, fn))
  bench('ramda', () => Ra.map(fn, dict))
  bench('lodash', () => _.mapValues(dict, fn))
})

describe.each([10, 100, 1000])('filter (dict) — n=%i', (n) => {
  const dict = dicts[n]
  const pred = (_: number, k: string) => parseInt(k.slice(3)) % 2 === 0

  bench('stopcock', () => D.filter(dict, pred))
  bench('lodash', () => _.pickBy(dict, (v, k) => parseInt(k!.slice(3)) % 2 === 0))
})

describe.each([10, 100, 1000])('fromEntries — n=%i', (n) => {
  const entries: [string, number][] = Array.from({ length: n }, (_, i) => [`key${i}`, i])

  bench('stopcock', () => D.fromEntries(entries))
  bench('ramda', () => Ra.fromPairs(entries))
  bench('lodash', () => _.fromPairs(entries))
})

describe.each([10, 100, 1000])('toEntries — n=%i', (n) => {
  const dict = dicts[n]

  bench('stopcock', () => D.toEntries(dict))
  bench('ramda', () => Ra.toPairs(dict))
  bench('lodash', () => _.toPairs(dict))
})

describe('merge', () => {
  bench('stopcock', () => D.merge(small, medium))
  bench('ramda', () => Ra.mergeRight(small, medium))
  bench('lodash', () => Object.assign({}, small, medium))
})
