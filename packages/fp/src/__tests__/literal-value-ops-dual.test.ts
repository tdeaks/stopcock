import { describe, expect, it } from 'vite-plus/test'
import * as Eq from '../eq'
import * as Guard from '../guard'
import * as Hash from '../hash'
import * as Ord from '../ord'

/**
 * Literal Phase 2 inventory.
 * Included: Eq sameValueZero/equals/contramap; Hash combine/contramap; Ord
 * contramap/combine/comparisons/min/max/clamp/between/sort.
 * Excluded: unary operations and pure instance/constructor factories, including
 * make/lazy/tuple/struct/array/reverse/combineAll and function/semigroup/monoid.
 */
describe('literal value-operation dual inventory', () => {
  it('keeps Guard.is unambiguous when the data is callable', () => {
    const callable = () => 1
    class C {}

    expect(Guard.is(callable, Function)).toBe(true)
    expect(Guard.is(C, Function)).toBe(true)
    expect(Guard.is(Function)(callable)).toBe(true)
    expect(Guard.is(Function)(C)).toBe(true)
    expect(Guard.is(Date, new Date())).toBe(true)
    expect(Guard.is(Function, callable)).toBe(true)
  })

  it('keeps Eq direct and curried lanes equivalent', () => {
    const project = (value: { readonly id: number }): number => value.id
    const direct = Eq.contramap(Eq.number, project)
    const curried = Eq.contramap(project)(Eq.number)

    expect(Eq.sameValueZero(Number.NaN, Number.NaN)).toBe(
      Eq.sameValueZero(Number.NaN)(Number.NaN),
    )
    expect(Eq.equals(Eq.number, Number.NaN, Number.NaN)).toBe(
      Eq.equals(Number.NaN, Number.NaN)(Eq.number),
    )
    expect(direct.equals({ id: 1 }, { id: 1 })).toBe(curried.equals({ id: 1 }, { id: 1 }))
  })

  it('keeps Hash direct and curried lanes equivalent', () => {
    const project = (value: { readonly id: number }): number => value.id
    const direct = Hash.contramap(Hash.number, project)
    const curried = Hash.contramap(project)(Hash.number)

    expect(Hash.combine(1, 2)).toBe(Hash.combine(2)(1))
    expect(direct.hash({ id: 42 })).toBe(curried.hash({ id: 42 }))
  })

  it('keeps Ord direct and curried lanes equivalent', () => {
    const project = (value: { readonly id: number }): number => value.id
    const direct = Ord.contramap(Ord.number, project)
    const curried = Ord.contramap(project)(Ord.number)
    const byParity = Ord.make<number>((self, that) => (self % 2) - (that % 2))
    const combinedDirect = Ord.combine(byParity, Ord.number)
    const combinedCurried = Ord.combine(Ord.number)(byParity)

    expect(direct.compare({ id: 1 }, { id: 2 })).toBe(curried.compare({ id: 1 }, { id: 2 }))
    expect(combinedDirect.compare(3, 1)).toBe(combinedCurried.compare(3, 1))
    expect(Ord.lessThan(Ord.number, 1, 2)).toBe(Ord.lessThan(1, 2)(Ord.number))
    expect(Ord.lessThanOrEqual(Ord.number, 2, 2)).toBe(
      Ord.lessThanOrEqual(2, 2)(Ord.number),
    )
    expect(Ord.greaterThan(Ord.number, 2, 1)).toBe(Ord.greaterThan(2, 1)(Ord.number))
    expect(Ord.greaterThanOrEqual(Ord.number, 2, 2)).toBe(
      Ord.greaterThanOrEqual(2, 2)(Ord.number),
    )
    expect(Ord.min(Ord.number, 2, 1)).toBe(Ord.min(2, 1)(Ord.number))
    expect(Ord.max(Ord.number, 2, 1)).toBe(Ord.max(2, 1)(Ord.number))
    expect(Ord.clamp(Ord.number, 5, 0, 3)).toBe(Ord.clamp(5, 0, 3)(Ord.number))
    expect(Ord.clamp(Ord.number, 5, 10, 0)).toBe(0)
    expect(Ord.clamp(5, 10, 0)(Ord.number)).toBe(0)
    expect(Ord.between(Ord.number, 2, 0, 3)).toBe(Ord.between(2, 0, 3)(Ord.number))
    expect(Ord.sort(Ord.number, [3, 1, 2])).toEqual(Ord.sort([3, 1, 2])(Ord.number))
  })
})
