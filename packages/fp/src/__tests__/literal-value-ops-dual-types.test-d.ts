import { expectTypeOf, test } from 'vite-plus/test'
import * as Eq from '../eq'
import * as Guard from '../guard'
import * as Hash from '../hash'
import * as Ord from '../ord'

test('Guard.is accepts callable data only in the unambiguous direct order', () => {
  class C {}
  expectTypeOf(Guard.is(() => 1, Function)).toEqualTypeOf<boolean>()
  expectTypeOf(Guard.is(C, Function)).toEqualTypeOf<boolean>()
  expectTypeOf(Guard.is(Function)(C)).toEqualTypeOf<boolean>()
  expectTypeOf(Guard.is(Date, new Date())).toEqualTypeOf<boolean>()
  expectTypeOf(Guard.is(Function, () => 1)).toEqualTypeOf<boolean>()
})

test('Eq and Hash value operations expose exact direct and curried results', () => {
  const project = (value: { readonly id: number }): number => value.id

  expectTypeOf(Eq.sameValueZero(1, 2)).toEqualTypeOf<boolean>()
  expectTypeOf(Eq.sameValueZero(2)(1)).toEqualTypeOf<boolean>()
  expectTypeOf(Eq.equals(Eq.number, 1, 2)).toEqualTypeOf<boolean>()
  expectTypeOf(Eq.equals(1, 2)(Eq.number)).toEqualTypeOf<boolean>()
  expectTypeOf(Eq.contramap(Eq.number, project)).toEqualTypeOf<
    Eq.Eq<{ readonly id: number }>
  >()
  expectTypeOf(Eq.contramap(project)(Eq.number)).toEqualTypeOf<
    Eq.Eq<{ readonly id: number }>
  >()

  expectTypeOf(Hash.combine(1, 2)).toEqualTypeOf<number>()
  expectTypeOf(Hash.combine(2)(1)).toEqualTypeOf<number>()
  expectTypeOf(Hash.contramap(Hash.number, project)).toEqualTypeOf<
    Hash.Hash<{ readonly id: number }>
  >()
  expectTypeOf(Hash.contramap(project)(Hash.number)).toEqualTypeOf<
    Hash.Hash<{ readonly id: number }>
  >()
})

test('Ord value operations expose exact direct and curried results', () => {
  const project = (value: { readonly id: number }): number => value.id

  expectTypeOf(Ord.contramap(Ord.number, project)).toEqualTypeOf<
    Ord.Ord<{ readonly id: number }>
  >()
  expectTypeOf(Ord.contramap(project)(Ord.number)).toEqualTypeOf<
    Ord.Ord<{ readonly id: number }>
  >()
  expectTypeOf(Ord.combine(Ord.number, Ord.number)).toEqualTypeOf<Ord.Ord<number>>()
  expectTypeOf(Ord.combine(Ord.number)(Ord.number)).toEqualTypeOf<Ord.Ord<number>>()
  expectTypeOf(Ord.lessThan(Ord.number, 1, 2)).toEqualTypeOf<boolean>()
  expectTypeOf(Ord.lessThan(1, 2)(Ord.number)).toEqualTypeOf<boolean>()
  expectTypeOf(Ord.lessThanOrEqual(1, 2)(Ord.number)).toEqualTypeOf<boolean>()
  expectTypeOf(Ord.greaterThan(1, 2)(Ord.number)).toEqualTypeOf<boolean>()
  expectTypeOf(Ord.greaterThanOrEqual(1, 2)(Ord.number)).toEqualTypeOf<boolean>()
  expectTypeOf(Ord.min(1, 2)(Ord.number)).toEqualTypeOf<number>()
  expectTypeOf(Ord.max(1, 2)(Ord.number)).toEqualTypeOf<number>()
  expectTypeOf(Ord.clamp(1, 0, 2)(Ord.number)).toEqualTypeOf<number>()
  expectTypeOf(Ord.between(1, 0, 2)(Ord.number)).toEqualTypeOf<boolean>()
  expectTypeOf(Ord.sort(Ord.number, [3, 1, 2])).toEqualTypeOf<number[]>()
  expectTypeOf(Ord.sort([3, 1, 2])(Ord.number)).toEqualTypeOf<number[]>()
})
