import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const pred = (x: number) => x > 0.5

describe.each([100, 1_000, 10_000, 100_000])('partition — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.partition(data, pred))
  bench('ts-belt', () => TB.partition(data, pred))
  bench('remeda', () => R.partition(data, pred))
  bench('rambda', () => Rb.partition(pred)(data))
  bench('ramda', () => Ra.partition(pred, data))
  bench('lodash', () => _.partition(data, pred))
})

describe.each([100, 1_000, 10_000])('chunk(10) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.chunk(data, 10))
  bench('ts-belt', () => TB.splitEvery(data, 10))
  bench('remeda', () => R.chunk(data, 10))
  bench('rambda', () => Rb.splitEvery(10)(data))
  bench('ramda', () => Ra.splitEvery(10, data))
  bench('lodash', () => _.chunk(data, 10))
})
