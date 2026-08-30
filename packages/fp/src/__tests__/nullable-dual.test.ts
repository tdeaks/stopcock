import { describe, expect, it } from 'vite-plus/test'
import * as N from '../nullable'

describe('nullable dual calls', () => {
  it('maps, flatMaps, taps, and filters in both call shapes', () => {
    const doubled = (value: number) => value * 2
    expect(N.map(2, doubled)).toBe(N.map(doubled)(2))
    expect(N.map(null, doubled)).toBe(N.map(doubled)(null))
    expect(N.flatMap(2, doubled)).toBe(N.flatMap(doubled)(2))
    expect(N.flatMap(undefined, doubled)).toBe(N.flatMap(doubled)(undefined))

    const direct: number[] = []
    const curried: number[] = []
    expect(N.tap(2, (value) => direct.push(value))).toBe(2)
    expect(N.tap((value: number) => curried.push(value))(2)).toBe(2)
    expect(direct).toEqual(curried)

    const positive = (value: number) => value > 0
    expect(N.filter(2, positive)).toBe(N.filter(positive)(2))
    expect(N.filter(-1, positive)).toBe(N.filter(positive)(-1))
  })

  it('matches and supplies fallbacks in both call shapes', () => {
    const onNullable = () => 'none'
    const onValue = (value: number) => `some:${value}`
    expect(N.match(2, onNullable, onValue)).toBe(N.match(onNullable, onValue)(2))
    expect(N.match(null, onNullable, onValue)).toBe(N.match(onNullable, onValue)(null))
    expect(N.getOrElse(null, () => 42)).toBe(N.getOrElse(() => 42)(null))
    expect(N.getWithDefault(undefined, 42)).toBe(N.getWithDefault(42)(undefined))
  })

  it('converts, zips, and combines in both call shapes', () => {
    expect(N.toResult(2, () => 'none')).toEqual(N.toResult(() => 'none')(2))
    expect(N.toResult(null, () => 'none')).toEqual(N.toResult(() => 'none')(null))
    expect(N.zip(1, 'two')).toEqual(N.zip('two')(1))
    expect(N.zip(1, null)).toEqual(N.zip(null)(1))

    const combine = (left: number, right: number) => left + right
    expect(N.zipWith(1, 2, combine)).toBe(N.zipWith(2, combine)(1))
    expect(N.zipWith(null, 2, combine)).toBe(N.zipWith(2, combine)(null))
  })

  it('traverses readonly arrays in both call shapes', () => {
    const transform = (value: number, index: number) => value + index
    expect(N.traverseReadonlyArray([1, 2, 3], transform)).toEqual(
      N.traverseReadonlyArray(transform)([1, 2, 3]),
    )

    const nullable = (value: number) => (value === 2 ? undefined : value)
    expect(N.traverseReadonlyArray([1, 2, 3], nullable)).toBeUndefined()
    expect(N.traverseReadonlyArray(nullable)([1, 2, 3])).toBeUndefined()
  })
})
