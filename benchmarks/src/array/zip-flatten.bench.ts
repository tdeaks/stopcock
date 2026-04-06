import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000])('zip — n=%i', (n) => {
  const a = getData<number>('numbers', n as any)
  const b = getData<string>('strings', n as any)

  bench('stopcock', () => A.zip(a, b))
  bench('ts-belt', () => TB.zip(a, b))
  bench('remeda', () => R.zip(a, b))
  bench('rambda', () => Rb.zip(a)(b))
  bench('ramda', () => Ra.zip(a, b))
  bench('lodash', () => _.zip(a, b))
})

describe.each([100, 1_000, 10_000])('flatten — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const nested = Array.from({ length: Math.floor(n / 10) }, (_, i) => data.slice(i * 10, i * 10 + 10))

  bench('stopcock', () => A.flatten(nested))
  bench('ts-belt', () => TB.flat(nested))
  bench('remeda', () => R.flat(nested))
  bench('rambda', () => Rb.flatten(nested))
  bench('ramda', () => Ra.flatten(nested))
  bench('lodash', () => _.flatten(nested))
})
