import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const fn = (x: number) => x < 0.25 ? 'low' : x < 0.75 ? 'mid' : 'high'

describe.each([100, 1_000, 10_000, 100_000])('groupBy — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.groupBy(data, fn))
  bench('ts-belt', () => TB.groupBy(data, fn))
  bench('remeda', () => R.groupBy(data, fn))
  bench('rambda', () => Rb.groupBy(fn)(data))
  bench('ramda', () => Ra.groupBy(fn, data))
  bench('lodash', () => _.groupBy(data, fn))
})
