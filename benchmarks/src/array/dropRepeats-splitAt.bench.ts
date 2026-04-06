import { bench, describe } from 'vitest'
import { A } from '@stopcock/fp'
import * as Ra from 'ramda'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000])('dropRepeats — n=%i', (n) => {
  const data = getData<number>('numbersWithDupes', n as any)

  bench('stopcock', () => A.dropRepeats(data))
  bench('ramda', () => Ra.dropRepeats(data))
})

describe.each([100, 1_000, 10_000])('splitAt — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const mid = Math.floor(n / 2)

  bench('stopcock', () => A.splitAt(data, mid))
  bench('ramda', () => Ra.splitAt(mid, data))
})
