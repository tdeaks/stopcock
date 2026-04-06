import { bench, describe } from 'vitest'
import { pipe, A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB, pipe as tbPipe } from '@mobily/ts-belt'
import { getData } from '../setup'

const fn = (x: number) => x * 2

describe.each([100, 1_000, 10_000, 100_000])('map (data-first) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.map(data, fn))
  bench('ts-belt', () => TB.map(data, fn))
  bench('remeda', () => R.map(data, fn))
  bench('rambda', () => Rb.map(fn)(data))
  bench('ramda', () => Ra.map(fn, data))
  bench('lodash', () => _.map(data, fn))
})

describe.each([100, 1_000, 10_000, 100_000])('map (pipe) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => pipe(data, A.map(fn)))
  bench('ts-belt', () => tbPipe(data, TB.map(fn)))
  bench('remeda', () => R.pipe(data, R.map(fn)))
  bench('rambda', () => Rb.pipe(data, Rb.map(fn)))
  bench('ramda', () => Ra.pipe(Ra.map(fn))(data))
  bench('lodash', () => _.flow([(d: number[]) => _.map(d, fn)])(data))
})
