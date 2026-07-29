import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const pred = (x: number) => x > 0.95

describe.each([100, 1_000, 10_000, 100_000])('findIndex — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const stopcockFindIndex = A.findIndexOrUndefined(pred) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockFindIndex(data))
  bench('ts-belt', () => TB.getIndexBy(data, pred))
  bench('remeda', () => R.findIndex(data, pred))
  bench('rambda', () => Rb.findIndex(pred)(data))
  bench('ramda', () => Ra.findIndex(pred, data))
  bench('lodash', () => _.findIndex(data, pred))
})
