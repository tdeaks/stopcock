import { bench, describe } from 'vitest'
import { O, R, ok, pipe, some, tryCatch } from '@stopcock/fp'
import { O as BeltO, R as BeltR, pipe as beltPipe } from '@mobily/ts-belt'

const jsonInput = '{"a":1}'
const double = (x: number) => x * 2
const increment = (x: number) => x + 1
const greaterThanFive = (x: number) => x > 5

describe('Option.map chain (5 steps)', () => {
  bench('stopcock', () =>
    pipe(
      some(5),
      O.map(double),
      O.map(increment),
      O.filter(greaterThanFive),
      O.getOrElse(() => 0),
    ),
  )

  bench('ts-belt', () =>
    beltPipe(
      BeltO.Some(5),
      BeltO.map(double),
      BeltO.map(increment),
      BeltO.filter(greaterThanFive),
      BeltO.getWithDefault(0),
    ),
  )
})

describe('Option.flatMap chain', () => {
  bench('stopcock', () =>
    pipe(
      some({ user: { name: 'Tom' } }),
      O.map((x) => x.user),
      O.map((x) => x.name),
    ),
  )

  bench('ts-belt', () =>
    beltPipe(
      BeltO.Some({ user: { name: 'Tom' } }),
      BeltO.map((x) => x.user),
      BeltO.map((x) => x.name),
    ),
  )
})

describe('Result.map chain', () => {
  bench('stopcock', () =>
    pipe(
      ok(5),
      R.map(double),
      R.map(increment),
    ),
  )

  bench('ts-belt', () =>
    beltPipe(
      BeltR.Ok(5),
      BeltR.map(double),
      BeltR.map(increment),
    ),
  )
})

describe('Result.tryCatch', () => {
  bench('stopcock', () => tryCatch(() => JSON.parse(jsonInput)))
  bench('ts-belt', () => BeltR.fromExecution(() => JSON.parse(jsonInput)))
})
