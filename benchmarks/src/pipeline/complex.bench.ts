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
const cmp = (a: number, b: number) => a - b

describe.each([1_000, 10_000, 100_000])('filter→map→sort→take(5) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () =>
    pipe(data, A.filter(gt), A.map(dbl), A.sortBy(cmp), A.take(5)),
  )
  bench('ts-belt', () =>
    tbPipe(data, TB.filter(gt), TB.map(dbl), TB.sort(cmp), TB.take(5)),
  )
  bench('remeda', () =>
    R.pipe(data, R.filter(gt), R.map(dbl), R.sort(cmp), R.take(5)),
  )
  bench('rambda', () =>
    Rb.pipe(data, Rb.filter(gt), Rb.map(dbl), Rb.sort(cmp), Rb.take(5) as any),
  )
  bench('ramda', () =>
    Ra.pipe(
      Ra.filter(gt) as (data: number[]) => number[],
      Ra.map(dbl),
      Ra.sort(cmp),
      Ra.take(5),
    )(data),
  )
  bench('lodash', () =>
    _.flow([
      (d: number[]) => _.filter(d, gt),
      (d: number[]) => _.map(d, dbl),
      (d: number[]) => _.sortBy(d),
      (d: number[]) => _.take(d, 5),
    ])(data),
  )
})
