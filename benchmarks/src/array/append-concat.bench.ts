import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000])('append — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => A.append(data, 999))
  bench('rambda', () => Rb.append(999)(data))
  bench('ramda', () => Ra.append(999, data))
})

describe.each([100, 1_000, 10_000])('concat — n=%i', (n) => {
  const a = getData<number>('numbers', n as any)
  const b = getData<number>('numbers', n as any).slice(0, Math.floor(n / 2))

  bench('stopcock', () => A.concat(a, b))
  bench('rambda', () => Rb.concat(a)(b))
  bench('ramda', () => Ra.concat(a, b))
  bench('lodash', () => _.concat(a, b))
})
