import { bench, describe } from 'vitest'
import { pipe, A } from '@stopcock/fp'
import * as R from 'remeda'
import { A as TB, pipe as tbPipe } from '@mobily/ts-belt'
import { getData } from '../setup'

describe.each([1_000, 10_000])('15-step all-fuseable pipeline — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () =>
    pipe(data,
      A.filter((x: number) => x > 0.1),
      A.map((x: number) => x * 2),
      A.filter((x: number) => x > 0.5),
      A.map((x: number) => x + 1),
      A.filter((x: number) => x < 3),
      A.map((x: number) => x * 10),
      A.filter((x: number) => x > 5),
      A.map((x: number) => Math.round(x)),
      A.filter((x: number) => x % 2 === 0),
      A.map((x: number) => x / 2),
      A.filter((x: number) => x > 1),
      A.map((x: number) => x - 1),
      A.filter((x: number) => x > 0),
      A.map((x: number) => x * 3),
      A.take(20),
    ),
  )

    data
      .filter(x => x > 0.1)
      .map(x => x * 2)
      .filter(x => x > 0.5)
      .map(x => x + 1)
      .filter(x => x < 3)
      .map(x => x * 10)
      .filter(x => x > 5)
      .map(x => Math.round(x))
      .filter(x => x % 2 === 0)
      .map(x => x / 2)
      .filter(x => x > 1)
      .map(x => x - 1)
      .filter(x => x > 0)
      .map(x => x * 3)
      .slice(0, 20),
  )
})

describe.each([1_000, 10_000])('8-step mixed fuseable+terminal — n=%i', (n) => {
  const data = getData<number>('numbers', n as any)

  bench('stopcock', () =>
    pipe(data,
      A.filter((x: number) => x > 0.2),
      A.map((x: number) => x * 100),
      A.filter((x: number) => x > 50),
      A.map((x: number) => Math.floor(x)),
      A.filter((x: number) => x % 2 === 0),
      A.map((x: number) => x / 10),
      A.filter((x: number) => x > 2),
      A.reduce((acc: number, x: number) => acc + x, 0),
    ),
  )

    data
      .filter(x => x > 0.2)
      .map(x => x * 100)
      .filter(x => x > 50)
      .map(x => Math.floor(x))
      .filter(x => x % 2 === 0)
      .map(x => x / 10)
      .filter(x => x > 2)
      .reduce((acc, x) => acc + x, 0),
  )
})
