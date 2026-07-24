import { describe, expect, it } from 'vite-plus/test'
import * as Eq from '../eq'
import * as NEA from '../non-empty-array'
import * as Nullable from '../nullable'
import { none, some } from '../option'
import * as Ord from '../ord'
import * as Semigroup from '../semigroup'
import * as These from '../these'

describe('These', () => {
  const errors = Semigroup.array<string>()

  it('constructs, narrows, maps, and matches every case', () => {
    const warning = These.both(['warning'], 2)
    expect(These.isBoth(warning)).toBe(true)
    expect(These.map((value: number) => value * 2)(warning)).toEqual(
      These.both(['warning'], 4),
    )
    expect(
      These.match(
        (left: readonly string[]) => left.join(','),
        (right: number) => String(right),
        (left: readonly string[], right: number) => `${left.join(',')}:${right}`,
      )(warning),
    ).toBe('warning:2')
  })

  it('exposes optional projections without throwing', () => {
    expect(These.getLeft(These.left('bad'))).toEqual(some('bad'))
    expect(These.getRight(These.left('bad'))).toBe(none)
    expect(These.getBoth(These.both('warn', 1))).toEqual(some(['warn', 1]))
    expect(These.fromOptions(none, none)).toBe(none)
    expect(These.fromOptions(some('warn'), some(1))).toEqual(
      some(These.both('warn', 1)),
    )
  })

  it('accumulates diagnostics through flatMap and zipWith', () => {
    const next = These.flatMap(errors)((value: number) =>
      These.both(['second'], value + 1),
    )(These.both(['first'], 1))
    const zipped = These.zipWith(errors)(
      These.both(['right'], 2),
      (left: number, right: number) => left + right,
    )(These.both(['left'], 1))

    expect(next).toEqual(These.both(['first', 'second'], 2))
    expect(zipped).toEqual(These.both(['left', 'right'], 3))
  })

  it('derives an associative semigroup', () => {
    const instance = These.getSemigroup(errors, Semigroup.numberSum)
    expect(instance.combine(These.left(['a']), These.right(1))).toEqual(
      These.both(['a'], 1),
    )
    expect(instance.combine(These.both(['a'], 1), These.both(['b'], 2))).toEqual(
      These.both(['a', 'b'], 3),
    )
  })
})

describe('Nullable', () => {
  it('maps and flatMaps while preserving the nullish representation', () => {
    expect(Nullable.map((value: number) => value + 1)(1)).toBe(2)
    expect(Nullable.map((value: number) => value + 1)(null)).toBeNull()
    expect(Nullable.flatMap((value: number) => (value > 0 ? value : undefined))(undefined))
      .toBeUndefined()
  })

  it('uses Option and Result for explicit boundary conversion', () => {
    expect(Nullable.toOption(0)).toEqual(some(0))
    expect(Nullable.toOption(null)).toBe(none)
    expect(Nullable.toResult(() => 'missing')(undefined)).toEqual({
      _tag: 0,
      error: 'missing',
    })
    expect(Nullable.toResult(() => 'missing')(1)).toEqual({ _tag: 1, value: 1 })
  })

  it('filters safely and traverses arrays densely', () => {
    const sparse = new Array<number | undefined>(2)
    sparse[1] = 2
    expect(Nullable.filter((value: number) => value > 0)(-1)).toBeUndefined()
    expect(
      Nullable.traverseReadonlyArray((value: number | undefined) => value ?? 0)(sparse),
    ).toEqual([0, 2])
  })
})

describe('NonEmptyArray', () => {
  it('constructs with Option and densifies sparse arrays', () => {
    const sparse = new Array<number | undefined>(2)
    sparse[1] = 2
    const result = NEA.fromReadonlyArray(sparse)

    expect(NEA.fromReadonlyArray([])).toBe(none)
    expect(result).toEqual(some([undefined, 2]))
    if (result._tag === 1) expect(0 in result.value).toBe(true)
  })

  it('provides total head/last/reduce operations', () => {
    const values: NEA.NonEmptyArray<number> = [1, 2, 3]
    expect(NEA.head(values)).toBe(1)
    expect(NEA.last(values)).toBe(3)
    expect(NEA.reduce((left, right) => left + right)(values)).toBe(6)
    expect(NEA.reverse(values)).toEqual([3, 2, 1])
  })

  it('returns Option when filtering can erase non-emptiness', () => {
    const values: NEA.NonEmptyArray<number> = [1, 2, 3]
    expect(NEA.filter((value: number) => value > 3)(values)).toBe(none)
    expect(NEA.filter((value: number) => value > 1)(values)).toEqual(some([2, 3]))
    expect(
      NEA.filterMap((value: number) => (value % 2 === 0 ? some(value * 2) : none))(
        values,
      ),
    ).toEqual(some([4]))
  })

  it('maps, flatMaps, zips, sorts, and deduplicates immutably', () => {
    const values: NEA.NonEmptyArray<number> = [3, 1, 1, 2]
    expect(NEA.map((value: number) => value * 2)(values)).toEqual([6, 2, 2, 4])
    expect(NEA.flatMap((value: number) => [value, -value])(NEA.of(2))).toEqual([2, -2])
    expect(NEA.zip(NEA.of('a'))(values)).toEqual([[3, 'a']])
    expect(NEA.sort(Ord.number)(values)).toEqual([1, 1, 2, 3])
    expect(NEA.uniq(Eq.number)(values)).toEqual([3, 1, 2])
    expect(values).toEqual([3, 1, 1, 2])
  })

  it('groups adjacent values and validates chunk sizes with Option', () => {
    const values: NEA.NonEmptyArray<number> = [1, 1, 2, 3, 3]
    expect(NEA.groupAdjacent(Eq.number)(values)).toEqual([[1, 1], [2], [3, 3]])
    expect(NEA.chunksOf(2)(values)).toEqual(some([[1, 1], [2, 3], [3]]))
    expect(NEA.chunksOf(0)(values)).toBe(none)
  })
})

