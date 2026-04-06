import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const fn = (acc: number, x: number) => acc + x

describe.each([100, 1_000, 10_000, 100_000])('reduce — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.reduce(data, fn, 0))
  bench('ts-belt', () => TB.reduce(data, 0, fn))
  bench('remeda', () => R.reduce(data, fn, 0))
  bench('rambda', () => Rb.reduce(fn, 0)(data))
  bench('ramda', () => Ra.reduce(fn, 0, data))
  bench('lodash', () => _.reduce(data, fn, 0))
})
