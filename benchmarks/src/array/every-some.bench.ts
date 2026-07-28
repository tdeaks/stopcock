import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const pred = (x: number) => x < 2

describe.each([100, 1_000, 10_000, 100_000])('every — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const stopcockEvery = A.every(pred) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockEvery(data))
  bench('ts-belt', () => TB.every(data, pred))
  bench('rambda', () => Rb.all(pred)(data))
  bench('ramda', () => Ra.all(pred, data))
  bench('lodash', () => _.every(data, pred))
})

const somePred = (x: number) => x > 0.99

describe.each([100, 1_000, 10_000, 100_000])('some — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const stopcockSome = A.some(somePred) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockSome(data))
  bench('ts-belt', () => TB.some(data, somePred))
  bench('rambda', () => Rb.any(somePred)(data))
  bench('ramda', () => Ra.any(somePred, data))
  bench('lodash', () => _.some(data, somePred))
})
