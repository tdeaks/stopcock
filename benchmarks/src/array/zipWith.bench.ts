import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as Ra from 'ramda'
import * as _ from 'lodash-es'
import { getData } from '../setup'

const fn = (a: number, b: number) => a + b

describe.each([100, 1_000, 10_000])('zipWith — n=%i', (n) => {
  const a = getData<number>('numbers', n as any)
  const b = getData<number>('numbers', n as any).slice().reverse()

  bench('stopcock', () => A.zipWith(a, b, fn))
  bench('ramda', () => Ra.zipWith(fn, a, b))
  bench('lodash', () => _.zipWith(a, b, fn))
})
