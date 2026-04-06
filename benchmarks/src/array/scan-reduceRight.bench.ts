import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { getData } from '../setup'

const fn = (acc: number, x: number) => acc + x

describe.each([100, 1_000, 10_000, 100_000])('reduceRight — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.reduceRight(data, fn, 0))
  bench('remeda', () => R.reduceRight(data, fn, 0))
  bench('rambda', () => Rb.reduceRight(fn, 0)(data))
  bench('ramda', () => Ra.reduceRight(fn, 0, data))
  bench('lodash', () => _.reduceRight(data, fn, 0))
})

describe.each([100, 1_000, 10_000])('scan — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.scan(data, fn, 0))
  bench('ramda', () => Ra.scan(fn, 0, data))
})
