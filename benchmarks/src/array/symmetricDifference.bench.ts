import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import * as _ from 'lodash-es'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000])('symmetricDifference — n=%i', (n) => {
  const a = getData<number>('numbers', n as any).slice(0, n)
  const b = getData<number>('numbers', n as any).slice(Math.floor(n / 2))

  bench('stopcock', () => A.symmetricDifference(a, b))
  bench('ramda', () => Ra.symmetricDifference(a, b))
  bench('rambda', () => Rb.symmetricDifference(a)(b))
  bench('lodash', () => _.xor(a, b))
})
