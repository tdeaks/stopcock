import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const fn = (x: number) => (x < 0.25 ? 'low' : x < 0.75 ? 'mid' : 'high')

describe.each([100, 1_000, 10_000, 100_000])('groupBy — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const stopcockGroupBy = A.groupBy(fn) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockGroupBy(data))
  bench('ts-belt', () => TB.groupBy(data, fn))
  bench('remeda', () => R.groupBy(data, fn))
  bench('rambda', () => Rb.groupBy(fn)(data))
  bench('ramda', () => Ra.groupBy(fn, data))
  bench('lodash', () => _.groupBy(data, fn))
})
