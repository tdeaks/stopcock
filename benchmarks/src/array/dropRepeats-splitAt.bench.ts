import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
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
  const stopcockSplitAt = A.splitAt(mid) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockSplitAt(data))
  bench('ramda', () => Ra.splitAt(mid, data))
})
