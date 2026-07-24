import { bench, describe } from 'vite-plus/test'
import * as N from '@stopcock/fp/number'
import * as _ from 'lodash-es'
import { getData } from './setup'

describe.each([100, 1_000, 10_000, 100_000])('sum — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => N.sum(data))
  bench('lodash', () => _.sum(data))
})

describe.each([100, 1_000, 10_000, 100_000])('mean — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => N.meanOrUndefined(data))
  bench('lodash', () => _.mean(data))
})

describe.each([100, 1_000, 10_000])('median — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => N.medianOrUndefined(data))
})

describe.each([100, 1_000, 10_000])('standardDeviation — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => N.standardDeviationOrUndefined(data))
})
