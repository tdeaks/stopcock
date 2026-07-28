import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const cmp = (a: number, b: number) => a - b

describe.each([100, 1_000, 10_000, 100_000])('sort — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const stopcockSortBy = A.sortBy(cmp) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockSortBy(data))
  bench('ts-belt', () => TB.sort(data, cmp))
  bench('remeda', () => R.sort(data, cmp))
  bench('rambda', () => Rb.sort(cmp)(data))
  bench('ramda', () => Ra.sort(cmp, data))
  bench('lodash', () => _.sortBy(data))
})
