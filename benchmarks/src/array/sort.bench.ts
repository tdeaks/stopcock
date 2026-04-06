import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const cmp = (a: number, b: number) => a - b

describe.each([100, 1_000, 10_000, 100_000])('sort — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.sortBy(data, cmp))
  bench('ts-belt', () => TB.sort(data, cmp))
  bench('remeda', () => R.sort(data, cmp))
  bench('rambda', () => Rb.sort(cmp)(data))
  bench('ramda', () => Ra.sort(cmp, data))
  bench('lodash', () => _.sortBy(data))
})
