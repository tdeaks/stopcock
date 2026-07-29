import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const pred = (x: number) => x < 0.5

describe.each([100, 1_000, 10_000, 100_000])('takeWhile — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const stopcockTakeWhile = A.takeWhile(pred) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockTakeWhile(data))
  bench('ts-belt', () => TB.takeWhile(data, pred))
  bench('remeda', () => R.takeWhile(data, pred))
  bench('rambda', () => Rb.takeWhile(pred)(data))
  bench('ramda', () => Ra.takeWhile(pred, data))
  bench('lodash', () => _.takeWhile(data, pred))
})

describe.each([100, 1_000, 10_000, 100_000])('dropWhile — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const stopcockDropWhile = A.dropWhile(pred) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockDropWhile(data))
  bench('ts-belt', () => TB.dropWhile(data, pred))
  bench('remeda', () => R.dropWhile(data, pred))
  bench('rambda', () => Rb.dropWhile(pred)(data))
  bench('ramda', () => Ra.dropWhile(pred, data))
  bench('lodash', () => _.dropWhile(data, pred))
})
