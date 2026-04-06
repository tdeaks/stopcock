import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { getData } from '../setup'

const fn = (x: number) => [x, x * 2]

describe.each([100, 1_000, 10_000])('flatMap — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.flatMap(data, fn))
  bench('remeda', () => R.flatMap(data, fn))
  bench('rambda', () => Rb.flatMap(fn)(data))
  bench('ramda', () => Ra.chain(fn, data))
  bench('lodash', () => _.flatMap(data, fn))
})
