import { bench, describe } from 'vitest'
import { pipe, O, R, some, ok, tryCatch } from '@stopcock/fp'

describe('Option.map chain (5 steps)', () => {
  bench('stopcock', () =>
    pipe(
      some(5),
      O.map((x) => x * 2),
      O.map((x) => x + 1),
      O.filter((x) => x > 5),
      O.getOrElse(() => 0),
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
})

describe('Result.map chain', () => {
  bench('stopcock', () =>
    pipe(
      ok(5),
      R.map((x) => x * 2),
      R.map((x) => x + 1),
    ),
  )
})

describe('Result.tryCatch', () => {
  bench('stopcock', () => tryCatch(() => JSON.parse('{"a":1}')))
})
