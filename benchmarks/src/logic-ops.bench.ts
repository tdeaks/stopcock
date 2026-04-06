import { bench, describe } from 'vitest'
import { Logic } from '@stopcock/fp'
import * as Ra from 'ramda'
import * as Rb from 'rambda'

describe('equals', () => {
  const a = { x: 1, y: [2, 3], z: { w: 4 } }
  const b = { x: 1, y: [2, 3], z: { w: 4 } }
  const c = { x: 1, y: [2, 3], z: { w: 5 } }

  bench('stopcock (equal)', () => Logic.equals(a, b))
  bench('stopcock (not equal)', () => Logic.equals(a, c))
  bench('rambda (equal)', () => Rb.equals(a)(b))
  bench('rambda (not equal)', () => Rb.equals(a)(c))
  bench('ramda (equal)', () => Ra.equals(a, b))
  bench('ramda (not equal)', () => Ra.equals(a, c))
})

describe('defaultTo', () => {
  bench('stopcock', () => Logic.defaultTo(null, 42))
  bench('rambda', () => Rb.defaultTo(42)(null))
  bench('ramda', () => Ra.defaultTo(42, null))
})

describe('cond', () => {
  const fn = Logic.cond<number, string>([
    [(x) => x < 0, () => 'negative'],
    [(x) => x === 0, () => 'zero'],
    [(x) => x > 0, () => 'positive'],
  ])
  const raFn = Ra.cond<number, string>([
    [(x) => x < 0, () => 'negative'],
    [(x) => x === 0, () => 'zero'],
    [(x) => x > 0, () => 'positive'],
  ])
  const rbFn = Rb.cond<string>([
    [(x: number) => x < 0, () => 'negative'],
    [(x: number) => x === 0, () => 'zero'],
    [(x: number) => x > 0, () => 'positive'],
  ])

  bench('stopcock', () => fn(5))
  bench('rambda', () => rbFn(5))
  bench('ramda', () => raFn(5))
})

describe('allPass', () => {
  const preds = [(x: number) => x > 0, (x: number) => x < 100, (x: number) => x % 2 === 0]

  bench('stopcock', () => Logic.allPass(preds)(42))
  bench('rambda', () => Rb.allPass(preds)(42))
  bench('ramda', () => Ra.allPass(preds)(42))
})

describe('anyPass', () => {
  const preds = [(x: number) => x > 100, (x: number) => x < 0, (x: number) => x === 42]

  bench('stopcock', () => Logic.anyPass(preds)(42))
  bench('rambda', () => Rb.anyPass(preds)(42))
  bench('ramda', () => Ra.anyPass(preds)(42))
})
