import { bench, describe } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { getData } from '../setup'

const fn = (x: number) => x * 2

describe.each([100, 1_000, 10_000, 100_000])('adjust — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const idx = Math.floor(n / 2)
  const stopcockAdjust = A.adjust(idx, fn) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockAdjust(data))
  bench('rambda', () => Rb.adjust(idx, fn)(data))
  bench('ramda', () => Ra.adjust(idx, fn, data))
})

describe.each([100, 1_000, 10_000, 100_000])('update — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const idx = Math.floor(n / 2)
  const stopcockUpdate = A.update(idx, 999) // hoisted: isolate execution cost, not closure construction

  bench('stopcock', () => stopcockUpdate(data))
  bench('ramda', () => Ra.update(idx, 999, data))
})
