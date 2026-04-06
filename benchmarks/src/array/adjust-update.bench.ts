import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { getData } from '../setup'

const fn = (x: number) => x * 2

describe.each([100, 1_000, 10_000, 100_000])('adjust — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const idx = Math.floor(n / 2)

  bench('stopcock', () => A.adjust(data, idx, fn))
  bench('rambda', () => Rb.adjust(idx, fn)(data))
  bench('ramda', () => Ra.adjust(idx, fn, data))
})

describe.each([100, 1_000, 10_000, 100_000])('update — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const idx = Math.floor(n / 2)

  bench('stopcock', () => A.update(data, idx, 999))
  bench('ramda', () => Ra.update(idx, 999, data))
})
