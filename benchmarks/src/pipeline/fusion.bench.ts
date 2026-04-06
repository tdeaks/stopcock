import { bench, describe } from 'vitest'
import { pipe, A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB, pipe as tbPipe } from '@mobily/ts-belt'
import { getData } from '../setup'

const gt = (x: number) => x > 0.5
const dbl = (x: number) => x * 2

describe.each([100, 1_000, 10_000, 100_000])('filter→map→take(10) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => pipe(data, A.filter(gt), A.map(dbl), A.take(10)))
  bench('ts-belt', () => tbPipe(data, TB.filter(gt), TB.map(dbl), TB.take(10)))
  bench('remeda', () => R.pipe(data, R.filter(gt), R.map(dbl), R.take(10)))
  bench('rambda', () => Rb.pipe(data, Rb.filter(gt), Rb.map(dbl), Rb.take(10)))
  bench('ramda', () => Ra.pipe(Ra.filter(gt), Ra.map(dbl), Ra.take(10))(data))
  bench('lodash', () =>
    _.flow([
      (d: number[]) => _.filter(d, gt),
      (d: number[]) => _.map(d, dbl),
      (d: number[]) => _.take(d, 10),
    ])(data),
  )
})
