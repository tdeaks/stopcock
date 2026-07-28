import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000, 100_000])('take(10) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const stopcockTake = A.take(10) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockTake(data))
  bench('ts-belt', () => TB.take(data, 10))
  bench('remeda', () => R.take(data, 10))
  bench('rambda', () => Rb.take(10)(data))
  bench('ramda', () => Ra.take(10, data))
  bench('lodash', () => _.take(data, 10))
})

describe.each([100, 1_000, 10_000, 100_000])('drop(10) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const stopcockDrop = A.drop(10) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockDrop(data))
  bench('ts-belt', () => TB.drop(data, 10))
  bench('remeda', () => R.drop(data, 10))
  bench('rambda', () => Rb.drop(10)(data))
  bench('ramda', () => Ra.drop(10, data))
  bench('lodash', () => _.drop(data, 10))
})
