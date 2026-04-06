import { bench, describe } from 'vitest'
import { N } from '@stopcock/fp'
import { getData } from './setup'

describe.each([100, 1_000, 10_000])('min — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => N.min(data))
})

describe.each([100, 1_000, 10_000])('max — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => N.max(data))
})

describe('clamp', () => {
  bench('stopcock', () => N.clamp(150, 0, 100))
})

describe('isEven/isOdd', () => {
  bench('stopcock isEven', () => N.isEven(42))
  bench('stopcock isOdd', () => N.isOdd(42))
})
