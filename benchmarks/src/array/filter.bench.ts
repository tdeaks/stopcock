import { bench, describe } from 'vitest'
import { pipe, A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB, pipe as tbPipe } from '@mobily/ts-belt'
import { getData } from '../setup'

const pred = (x: number) => x > 0.5

describe.each([100, 1_000, 10_000, 100_000])('filter (data-first) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.filter(data, pred))
  bench('ts-belt', () => TB.filter(data, pred))
  bench('remeda', () => R.filter(data, pred))
  bench('rambda', () => Rb.filter(pred)(data))
  bench('ramda', () => Ra.filter(pred, data))
  bench('lodash', () => _.filter(data, pred))
})

describe.each([100, 1_000, 10_000, 100_000])('filter (pipe) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => pipe(data, A.filter(pred)))
  bench('ts-belt', () => tbPipe(data, TB.filter(pred)))
  bench('remeda', () => R.pipe(data, R.filter(pred)))
  bench('rambda', () => Rb.pipe(data, Rb.filter(pred)))
  bench('ramda', () => Ra.pipe(Ra.filter(pred))(data))
  bench('lodash', () => _.flow([(d: number[]) => _.filter(d, pred)])(data))
})
