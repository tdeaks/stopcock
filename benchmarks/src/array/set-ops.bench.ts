import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000])('intersection — n=%i', (n) => {
  const a = getData<number>('numbers', n as any).slice(0, n)
  const b = getData<number>('numbers', n as any).slice(Math.floor(n / 2))

  bench('stopcock', () => A.intersection(a, b))
  bench('ts-belt', () => TB.intersection(a, b))
  bench('remeda', () => R.intersection(a, b))
  bench('rambda', () => Rb.intersection(a)(b))
  bench('ramda', () => Ra.intersection(a, b))
  bench('lodash', () => _.intersection(a, b))
})

describe.each([100, 1_000, 10_000])('difference — n=%i', (n) => {
  const a = getData<number>('numbers', n as any).slice(0, n)
  const b = getData<number>('numbers', n as any).slice(Math.floor(n / 2))

  bench('stopcock', () => A.difference(a, b))
  bench('ts-belt', () => TB.difference(a, b))
  bench('remeda', () => R.difference(a, b))
  bench('rambda', () => Rb.difference(a)(b))
  bench('ramda', () => Ra.difference(a, b))
  bench('lodash', () => _.difference(a, b))
})

describe.each([100, 1_000, 10_000])('union — n=%i', (n) => {
  const a = getData<number>('numbers', n as any).slice(0, n)
  const b = getData<number>('numbers', n as any).slice(Math.floor(n / 2))

  bench('stopcock', () => A.union(a, b))
  bench('ts-belt', () => TB.union(a, b))
  bench('rambda', () => Rb.union(a)(b))
  bench('ramda', () => Ra.union(a, b))
  bench('lodash', () => _.union(a, b))
})
