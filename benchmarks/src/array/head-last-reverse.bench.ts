import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000, 100_000])('head — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.head(data))
  bench('ts-belt', () => TB.head(data))
  bench('remeda', () => R.first(data))
  bench('rambda', () => Rb.head(data))
  bench('ramda', () => Ra.head(data))
  bench('lodash', () => _.head(data))
})

describe.each([100, 1_000, 10_000, 100_000])('last — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.last(data))
  bench('ts-belt', () => TB.last(data))
  bench('remeda', () => R.last(data))
  bench('rambda', () => Rb.last(data))
  bench('ramda', () => Ra.last(data))
  bench('lodash', () => _.last(data))
})

describe.each([100, 1_000, 10_000, 100_000])('reverse — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.reverse(data))
  bench('ts-belt', () => TB.reverse(data))
  bench('remeda', () => R.reverse(data))
  bench('ramda', () => Ra.reverse(data))
  bench('lodash', () => [...data].reverse())
})
