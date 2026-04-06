import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000, 100_000])('uniq — n=%i', (n) => {
  const data = getData<number>('numbersWithDupes', n as any)

  bench('stopcock', () => A.uniq(data))
  bench('ts-belt', () => TB.uniq(data))
  bench('remeda', () => R.unique(data))
  bench('rambda', () => Rb.uniq(data))
  bench('ramda', () => Ra.uniq(data))
  bench('lodash', () => _.uniq(data))
})
