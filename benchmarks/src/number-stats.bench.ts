import { bench, describe } from 'vitest'
import { N } from '@stopcock/fp'
import * as _ from 'lodash-es'
import { getData } from './setup'

describe.each([100, 1_000, 10_000, 100_000])('sum — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => N.sum(data))
  bench('lodash', () => _.sum(data))
})

describe.each([100, 1_000, 10_000, 100_000])('mean — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => N.mean(data))
  bench('lodash', () => _.mean(data))
})

describe.each([100, 1_000, 10_000])('median — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => N.median(data))
})

describe.each([100, 1_000, 10_000])('standardDeviation — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => N.standardDeviation(data))
})
