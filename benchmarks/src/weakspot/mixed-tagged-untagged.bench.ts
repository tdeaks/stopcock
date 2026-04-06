import { bench, describe } from 'vitest'
import { pipe, A } from '@stopcock/fp'
import * as R from 'remeda'
import { A as TB, pipe as tbPipe } from '@mobily/ts-belt'
import { getData } from '../setup'

const dbl = (x: number) => x * 2
const gt = (x: number) => x > 0.5
const custom = (arr: number[]) => arr.map(x => x + 100)

describe.each([100, 1_000, 10_000])('tagged→untagged→tagged — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => pipe(data, A.filter(gt), custom, A.map(dbl)))
  bench('remeda', () => R.pipe(data, R.filter(gt), custom, R.map(dbl)))
})

describe.each([100, 1_000, 10_000])('untagged→tagged→untagged — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => pipe(data, custom, A.filter(gt), custom))
  bench('remeda', () => R.pipe(data, custom, R.filter(gt), custom))
})

describe.each([100, 1_000, 10_000])('all untagged (worst case for fusion) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const f1 = (arr: number[]) => arr.filter(gt)
  const f2 = (arr: number[]) => arr.map(dbl)
  const f3 = (arr: number[]) => arr.slice(0, 10)

  bench('stopcock', () => pipe(data, f1, f2, f3))
  bench('remeda', () => R.pipe(data, f1, f2, f3))
})
