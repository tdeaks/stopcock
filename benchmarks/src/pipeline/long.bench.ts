import { bench, describe } from 'vitest'
import { pipe, A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import { A as TB, pipe as tbPipe } from '@mobily/ts-belt'
import { getData } from '../setup'

describe.each([1_000, 10_000, 100_000])('filter→map→flatMap→filter→take(20) — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () =>
    pipe(
      data,
      A.filter((x: number) => x > 0.2),
      A.map((x: number) => x * 100),
      A.flatMap((x: number) => [x, x + 1]),
      A.filter((x: number) => x % 3 === 0),
      A.take(20),
    ),
  )
  bench('ts-belt', () =>
    tbPipe(
      data,
      TB.filter((x: number) => x > 0.2),
      TB.map((x: number) => x * 100),
      // ts-belt has no flatMap — must fallback
      (arr: number[]) => arr.flatMap((x: number) => [x, x + 1]),
      TB.filter((x: number) => x % 3 === 0),
      TB.take(20),
    ),
  )
  bench('remeda', () =>
    R.pipe(
      data,
      R.filter((x: number) => x > 0.2),
      R.map((x: number) => x * 100),
      R.flatMap((x: number) => [x, x + 1]),
      R.filter((x: number) => x % 3 === 0),
      R.take(20),
    ),
  )
    data
      .filter(x => x > 0.2)
      .map(x => x * 100)
      .flatMap(x => [x, x + 1])
      .filter(x => x % 3 === 0)
      .slice(0, 20),
  )
})

describe.each([1_000, 10_000, 100_000])('map→map→map→map→map — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)
  const f1 = (x: number) => x * 2
  const f2 = (x: number) => x + 1
  const f3 = (x: number) => x * 3
  const f4 = (x: number) => x - 5
  const f5 = (x: number) => x / 2

  bench('stopcock', () => pipe(data, A.map(f1), A.map(f2), A.map(f3), A.map(f4), A.map(f5)))
  bench('ts-belt', () => tbPipe(data, TB.map(f1), TB.map(f2), TB.map(f3), TB.map(f4), TB.map(f5)))
  bench('remeda', () => R.pipe(data, R.map(f1), R.map(f2), R.map(f3), R.map(f4), R.map(f5)))
})
