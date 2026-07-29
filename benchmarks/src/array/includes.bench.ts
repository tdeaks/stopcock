import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000, 100_000])('includes — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const needle = data[Math.floor(n * 0.75)]
  const stopcockIncludes = A.includes(needle) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockIncludes(data))
  bench('ts-belt', () => TB.includes(data, needle))
  bench('rambda', () => Rb.includes(data)(needle))
  bench('ramda', () => Ra.includes(needle, data))
  bench('lodash', () => _.includes(data, needle))
})
