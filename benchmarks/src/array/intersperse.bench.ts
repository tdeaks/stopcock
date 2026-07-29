import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB } from '@mobily/ts-belt'
import { getData } from '../setup'

describe.each([100, 1_000, 10_000])('intersperse — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const stopcockIntersperse = A.intersperse(0) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockIntersperse(data))
  bench('ts-belt', () => TB.intersperse(data, 0))
  bench('rambda', () => Rb.intersperse(0)(data))
  bench('ramda', () => Ra.intersperse(0, data))
})
