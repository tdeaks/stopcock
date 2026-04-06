import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

const pred = (x: number) => x > 0.95

describe.each([100, 1_000, 10_000, 100_000])('find — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.find(data, pred))
  bench('ts-belt', () => TB.getBy(data, pred))
  bench('remeda', () => R.find(data, pred))
  bench('rambda', () => Rb.find(pred)(data))
  bench('ramda', () => Ra.find(pred, data))
  bench('lodash', () => _.find(data, pred))
})
