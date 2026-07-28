import { expectTypeOf, test } from 'vite-plus/test'
import * as ArrayOps from '../array'
import * as Indexed from '../indexed'
import * as Iter from '../iter'
import * as Tuple from '../tuple'

type Value = string | number

const isString = (value: Value): value is string => typeof value === 'string'
const toTextOrNumber = (value: number): string | number => (value > 0 ? String(value) : value)

class TextBucket extends Array<string> {
  readonly kind = 'text' as const
}

class NumberBucket extends Array<number> {
  readonly kind = 'number' as const
}

test('array Into operations preserve their target and allow proven refinements', () => {
  const values = ['one', 2] as readonly Value[]
  const textTarget = new TextBucket()
  const numberTarget = new NumberBucket()

  expectTypeOf(
    ArrayOps.mapInto([1, 2], textTarget, (value) => String(value)),
  ).toEqualTypeOf<TextBucket>()
  expectTypeOf(
    ArrayOps.mapInto(textTarget, (value: number) => String(value))([1, 2]),
  ).toEqualTypeOf<TextBucket>()
  expectTypeOf(ArrayOps.filterInto(values, textTarget, isString)).toEqualTypeOf<TextBucket>()
  expectTypeOf(ArrayOps.filterInto(textTarget, isString)(values)).toEqualTypeOf<TextBucket>()
  expectTypeOf(
    ArrayOps.filterInto([1, 2], numberTarget, (value) => value > 0),
  ).toEqualTypeOf<NumberBucket>()
  const commonTarget = [] as string[] | Value[]
  // @ts-expect-error mutable target unions are rejected to prevent inference from widening them.
  ArrayOps.mapInto([1, 2], commonTarget, (value) => String(value))

  // @ts-expect-error a union-producing callback cannot write into string-only storage.
  ArrayOps.mapInto([1, -1], textTarget, toTextOrNumber)
  // @ts-expect-error the data-last form enforces the same output compatibility.
  ArrayOps.mapInto(textTarget, toTextOrNumber)([1, -1])
  // @ts-expect-error a boolean predicate does not prove that only strings are written.
  ArrayOps.filterInto(values, textTarget, () => true)
  // @ts-expect-error the data-last form also requires a refining predicate for a narrow target.
  ArrayOps.filterInto(textTarget, (value: Value) => Boolean(value))(values)

  const splitTarget = [] as string[] | number[]
  // @ts-expect-error each possible target must accept every transformed output.
  ArrayOps.mapInto([1, -1], splitTarget, toTextOrNumber)
  // @ts-expect-error the curried map form checks every possible target too.
  ArrayOps.mapInto(splitTarget, toTextOrNumber)([1, -1])
  // @ts-expect-error a guard cannot write strings when one target branch accepts only numbers.
  ArrayOps.filterInto(values, splitTarget, isString)
  // @ts-expect-error the curried guard form preserves the same target-union check.
  ArrayOps.filterInto(splitTarget, isString)(values)

  const fixedTarget = ['existing'] as [string]
  // @ts-expect-error length-changing Into operations reject fixed-length targets.
  ArrayOps.mapInto([1], fixedTarget, String)
  // @ts-expect-error filtering can clear required tuple positions.
  ArrayOps.filterInto(['value'], fixedTarget, () => true)
})

test('Indexed writes use source and callback types rather than widening from the target', () => {
  const values = ['one', 2] as readonly Value[]
  const textTarget = new TextBucket(4)
  const numberTarget = new Uint16Array(4)

  expectTypeOf(Indexed.copyInto(['one', 'two'], textTarget)).toEqualTypeOf<TextBucket>()
  expectTypeOf(
    Indexed.mapInto(values, textTarget, (value) => String(value)),
  ).toEqualTypeOf<TextBucket>()
  expectTypeOf(Indexed.mapInto([1, 2], numberTarget, (value) => value * 2)).toEqualTypeOf<
    typeof numberTarget
  >()
  expectTypeOf(Indexed.filterInto(values, textTarget, isString)).toEqualTypeOf<TextBucket>()
  const commonTarget = [] as string[] | Value[]
  // @ts-expect-error mutable target unions are rejected even when this particular write is common.
  Indexed.copyInto(['one', 'two'], commonTarget)

  // @ts-expect-error all possible source elements must fit in the writable target.
  Indexed.copyInto(values, textTarget)
  // @ts-expect-error a union-producing callback cannot write into string-only storage.
  Indexed.mapInto([1, -1], textTarget, toTextOrNumber)
  // @ts-expect-error a boolean predicate cannot filter a union into narrow storage.
  Indexed.filterInto(values, textTarget, () => true)

  const splitTarget = [] as string[] | number[]
  // @ts-expect-error each possible indexed target must accept the complete source union.
  Indexed.copyInto(values, splitTarget)
  // @ts-expect-error each possible indexed target must accept the callback union.
  Indexed.mapInto([1, -1], splitTarget, toTextOrNumber)
  // @ts-expect-error guard output must fit every possible indexed target.
  Indexed.filterInto(values, splitTarget, isString)

  const fixedTarget = ['existing'] as [string]
  // @ts-expect-error indexed offsets make fixed-position target writes unsafe.
  Indexed.copyInto(['replacement'], fixedTarget)
  // @ts-expect-error indexed mapping rejects fixed-position targets for the same reason.
  Indexed.mapInto([1], fixedTarget, String)
  // @ts-expect-error indexed filtering appends and therefore rejects fixed-length targets.
  Indexed.filterInto(['value'], fixedTarget, () => true)
})

test('Tuple.mapInto preserves broad mutable targets without accepting narrow ones', () => {
  const textTarget = new TextBucket()

  expectTypeOf(
    Tuple.mapInto([1, 2] as const, textTarget, (value) => String(value)),
  ).toEqualTypeOf<TextBucket>()
  const commonTarget = [] as string[] | Value[]
  // @ts-expect-error mutable target unions are rejected to avoid target widening.
  Tuple.mapInto([1, 2] as const, commonTarget, (value) => String(value))

  // @ts-expect-error every callback result must fit the target element type.
  Tuple.mapInto([1, -1] as const, textTarget, toTextOrNumber)

  const splitTarget = [] as string[] | number[]
  // @ts-expect-error each possible tuple destination must accept every callback output.
  Tuple.mapInto([1, -1] as const, splitTarget, toTextOrNumber)

  const fixedTarget = ['existing'] as [string]
  // @ts-expect-error appending changes the length promised by a tuple target.
  Tuple.mapInto([1] as const, fixedTarget, String)
})

test('iterable Into terminals preserve and validate exact targets', () => {
  const textTarget = new TextBucket()
  const values = ['one', 2] as readonly Value[]

  expectTypeOf(Iter.toArrayInto(['one', 'two'], textTarget)).toEqualTypeOf<TextBucket>()
  const commonTarget = [] as string[] | Value[]
  // @ts-expect-error mutable target unions are intentionally rejected.
  Iter.toArrayInto(['one', 'two'], commonTarget)

  // @ts-expect-error every iterable source value must fit the target.
  Iter.toArrayInto(values, textTarget)

  const splitTarget = [] as string[] | number[]
  // @ts-expect-error every possible iterable target must accept the source union.
  Iter.toArrayInto(values, splitTarget)

  const fixedTarget = ['existing'] as [string]
  // @ts-expect-error appending into a tuple invalidates its fixed length.
  Iter.toArrayInto(['value'], fixedTarget)
})

test('toArrayInto reads the element type through an inline lazy pipeline', () => {
  const input: readonly number[] = [1, 2, 3]
  const double = (value: number): number => value * 2
  const isEven = (value: number): boolean => value % 2 === 0
  const numbers: number[] = []
  const texts: string[] = []

  // Every stage here is an overloaded dual call. The element type has to survive
  // being read out of one, or the target-capacity rules resolve against nothing.
  expectTypeOf(Iter.toArrayInto(Iter.map(Iter.from(input), double), numbers)).toEqualTypeOf<
    number[]
  >()
  expectTypeOf(
    Iter.toArrayInto(Iter.filter(Iter.map(Iter.from(input), double), isEven), numbers),
  ).toEqualTypeOf<number[]>()
  expectTypeOf(
    Iter.toArrayInto(Iter.take(Iter.map(Iter.from(input), double), 2), numbers),
  ).toEqualTypeOf<number[]>()
  expectTypeOf(
    Iter.toArrayInto<number, number[]>(Iter.map(Iter.from(input), double), numbers),
  ).toEqualTypeOf<number[]>()

  // @ts-expect-error the mapped element type still has to fit the target.
  Iter.toArrayInto(Iter.map(Iter.from(input), double), texts)
})
