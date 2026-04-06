import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

let sink = 0
const fn = (x: number) => { sink += x }

describe.each([100, 1_000, 10_000, 100_000])('forEach — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.forEach(data, fn))
  bench('ts-belt', () => TB.forEach(data, fn))
  bench('remeda', () => R.forEach(data, fn))
  bench('ramda', () => Ra.forEach(fn, data))
  bench('lodash', () => _.forEach(data, fn))
})
