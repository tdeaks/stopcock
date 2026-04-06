import { bench, describe } from 'vitest'
import { pipe, A } from '@stopcock/fp'
import * as R from 'remeda'
import { A as TB, pipe as tbPipe } from '@mobily/ts-belt'
import { getData } from '../setup'

const expand = (x: number) => [x, x + 1]
const expandFilter = (x: number) => x > 0 ? [x] : []

describe.each([100, 1_000, 10_000])('flatMap×2 — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => pipe(data, A.flatMap(expand), A.flatMap(expand)))
  bench('remeda', () => R.pipe(data, R.flatMap(expand), R.flatMap(expand)))
})

describe.each([100, 1_000, 10_000])('flatMap×3 — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => pipe(data, A.flatMap(expand), A.flatMap(expand), A.flatMap(expand)))
  bench('remeda', () => R.pipe(data, R.flatMap(expand), R.flatMap(expand), R.flatMap(expand)))
})

describe.each([100, 1_000, 10_000])('flatMap→filter→take (expanding then limiting) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () => pipe(data, A.flatMap(expand), A.filter((x: number) => x > 0.5), A.take(10)))
  bench('remeda', () => R.pipe(data, R.flatMap(expand), R.filter((x: number) => x > 0.5), R.take(10)))
})
