import { bench, describe } from 'vitest'
import { M } from '@stopcock/fp'
import * as Ra from 'ramda'
import * as Rb from 'rambda'

describe('add', () => {
  bench('stopcock', () => M.add(3, 5))
  bench('rambda', () => Rb.add(3)(5))
  bench('ramda', () => Ra.add(3, 5))
})

describe('multiply', () => {
  bench('stopcock', () => M.multiply(3, 5))
  bench('rambda', () => Rb.multiply(3)(5))
  bench('ramda', () => Ra.multiply(3, 5))
})

describe('subtract', () => {
  bench('stopcock', () => M.subtract(10, 3))
  bench('rambda', () => Rb.subtract(10)(3))
  bench('ramda', () => Ra.subtract(10, 3))
})

describe('divide', () => {
  bench('stopcock', () => M.divide(10, 3))
  bench('rambda', () => Rb.divide(10)(3))
  bench('ramda', () => Ra.divide(10, 3))
})

describe('negate', () => {
  bench('stopcock', () => M.negate(5))
  bench('ramda', () => Ra.negate(5))
})

describe('product', () => {
  const data = Array.from({ length: 100 }, (_, i) => i + 1)

  bench('stopcock', () => M.product(data))
  bench('ramda', () => Ra.product(data))
})

describe('inc/dec', () => {
  bench('stopcock inc', () => M.inc(5))
  bench('rambda inc', () => Rb.inc(5))
  bench('ramda inc', () => Ra.inc(5))
  bench('stopcock dec', () => M.dec(5))
  bench('rambda dec', () => Rb.dec(5))
  bench('ramda dec', () => Ra.dec(5))
})
