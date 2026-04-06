import { bench, describe } from 'vitest'
import { pipe } from '@stopcock/fp'
import * as R from 'remeda'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { pipe as tbPipe } from '@mobily/ts-belt'

const inc = (x: number) => x + 1
const dbl = (x: number) => x * 2
const neg = (x: number) => -x

describe('scalar pipe — 2 functions', () => {
  bench('stopcock', () => pipe(5, inc, dbl))
  bench('ts-belt', () => tbPipe(5, inc, dbl))
  bench('remeda', () => R.pipe(5, inc, dbl))
  bench('rambda', () => Rb.pipe(5, inc, dbl))
  bench('ramda', () => Ra.pipe(inc, dbl)(5))
})

describe('scalar pipe — 5 functions', () => {
  bench('stopcock', () => pipe(5, inc, dbl, neg, inc, dbl))
  bench('ts-belt', () => tbPipe(5, inc, dbl, neg, inc, dbl))
  bench('remeda', () => R.pipe(5, inc, dbl, neg, inc, dbl))
  bench('rambda', () => Rb.pipe(5, inc, dbl, neg, inc, dbl))
  bench('ramda', () => Ra.pipe(inc, dbl, neg, inc, dbl)(5))
})

describe('scalar pipe — 10 functions', () => {
  bench('stopcock', () => pipe(5, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc))
  bench('ts-belt', () => tbPipe(5, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc))
  bench('remeda', () => R.pipe(5, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc))
  bench('rambda', () => Rb.pipe(5, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc))
  bench('ramda', () => Ra.pipe(inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc)(5))
})

describe('scalar pipe — 20 functions', () => {
  bench('stopcock', () => pipe(5, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl))
  bench('ts-belt', () => tbPipe(5, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl))
  bench('remeda', () => R.pipe(5, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl, neg, inc, dbl))
})
