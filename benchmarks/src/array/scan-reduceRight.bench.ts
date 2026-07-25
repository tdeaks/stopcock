import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import { getData } from '../setup'

const fn = (acc: number, x: number) => acc + x

describe.each([100, 1_000, 10_000, 100_000])('reduceRight — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.reduceRight(data, fn, 0))
  bench('ramda', () => Ra.reduceRight(fn, 0, data))
  bench('lodash', () => _.reduceRight(data, fn, 0))
})

describe.each([100, 1_000, 10_000])('scan — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.scan(data, fn, 0))
  bench('ramda', () => Ra.scan(fn, 0, data))
})
