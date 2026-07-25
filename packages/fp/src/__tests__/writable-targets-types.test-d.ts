import { expectTypeOf, test } from 'vite-plus/test'
import * as ArrayOps from '../array'
import * as Collector from '../collector'
import * as Indexed from '../indexed'
import * as Iter from '../iter'
import * as Transducer from '../transducer'
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

class TextSet extends Set<string> {
  readonly kind = 'text-set' as const
}

class CountMap extends Map<string, number> {
  readonly kind = 'count-map' as const
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

test('iterable and transducer Into terminals preserve and validate exact targets', () => {
  const textTarget = new TextBucket()
  const values = ['one', 2] as readonly Value[]
  const stringify = Transducer.map((value: Value) => String(value))

  expectTypeOf(Iter.toArrayInto(['one', 'two'], textTarget)).toEqualTypeOf<TextBucket>()
  expectTypeOf(Transducer.intoArrayInto(values, stringify, textTarget)).toEqualTypeOf<TextBucket>()
  const commonTarget = [] as string[] | Value[]
  // @ts-expect-error mutable target unions are intentionally rejected.
  Iter.toArrayInto(['one', 'two'], commonTarget)
  // @ts-expect-error transducer destinations use the same conservative union rule.
  Transducer.intoArrayInto(values, stringify, commonTarget)

  // @ts-expect-error every iterable source value must fit the target.
  Iter.toArrayInto(values, textTarget)

  const splitTarget = [] as string[] | number[]
  // @ts-expect-error every possible iterable target must accept the source union.
  Iter.toArrayInto(values, splitTarget)
  // @ts-expect-error every possible transducer target must accept its output union.
  Transducer.intoArrayInto(values, Transducer.identity<Value>(), splitTarget)

  const fixedTarget = ['existing'] as [string]
  // @ts-expect-error appending into a tuple invalidates its fixed length.
  Iter.toArrayInto(['value'], fixedTarget)
  // @ts-expect-error transducer destinations must also have dynamic length.
  Transducer.intoArrayInto(['value'], Transducer.identity<string>(), fixedTarget)
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

test('collector target factories derive input capacity and preserve exact targets', () => {
  const arrayTarget = new TextBucket()
  const setTarget = new TextSet()
  const mapTarget = new CountMap()
  const recordTarget = Object.create(null) as Collector.MutableRecord<string>

  const arrayCollector = Collector.arrayInto(arrayTarget)
  const setCollector = Collector.setInto(setTarget)
  const mapCollector = Collector.mapInto(mapTarget)
  const recordCollector = Collector.recordInto(recordTarget)

  expectTypeOf(arrayCollector).toEqualTypeOf<Collector.Collector<string, TextBucket>>()
  expectTypeOf(setCollector).toEqualTypeOf<Collector.Collector<string, TextSet>>()
  expectTypeOf(mapCollector).toEqualTypeOf<
    Collector.Collector<readonly [string, number], CountMap>
  >()
  expectTypeOf(recordCollector).toEqualTypeOf<
    Collector.Collector<readonly [PropertyKey, string], Collector.MutableRecord<string>>
  >()
  expectTypeOf(Collector.collect(['one'], arrayCollector)).toEqualTypeOf<TextBucket>()
  expectTypeOf(Collector.collect(['one'], setCollector)).toEqualTypeOf<TextSet>()
  expectTypeOf(Collector.collect([['one', 1] as const], mapCollector)).toEqualTypeOf<CountMap>()
  expectTypeOf(Collector.collect([['one', 'value'] as const], recordCollector)).toEqualTypeOf<
    Collector.MutableRecord<string>
  >()

  // @ts-expect-error the array target alone fixes the collector input type.
  Collector.collect([1], arrayCollector)
  // @ts-expect-error the set target alone fixes the collector input type.
  Collector.collect([1], setCollector)
  // @ts-expect-error map keys must fit the concrete target.
  Collector.collect([[Symbol.iterator, 1] as const], mapCollector)
  // @ts-expect-error map values must fit the concrete target.
  Collector.collect([['one', 'value'] as const], mapCollector)
  // @ts-expect-error record values must fit the homogeneous target capacity.
  Collector.collect([['one', 1] as const], recordCollector)
})

test('collector and reducer factories reject unions, tuples, and refined records', () => {
  const arrayUnion = [] as string[] | Value[]
  const setUnion = new Set<string>() as Set<string> | Set<Value>
  const mapUnion = new Map<string, number>() as Map<string, number> | Map<PropertyKey, Value>
  const recordUnion = Object.create(null) as
    | Collector.MutableRecord<string>
    | Collector.MutableRecord<Value>
  const fixedTuple = ['value'] as [string]

  // @ts-expect-error mutable array target unions are rejected even when capacities overlap.
  Collector.arrayInto(arrayUnion)
  // @ts-expect-error mutable Set target unions are rejected conservatively.
  Collector.setInto(setUnion)
  // @ts-expect-error mutable Map target unions are rejected conservatively.
  Collector.mapInto(mapUnion)
  // @ts-expect-error mutable record target unions are rejected conservatively.
  Collector.recordInto(recordUnion)
  // @ts-expect-error appending would invalidate the tuple's fixed length.
  Collector.arrayInto(fixedTuple)
  // @ts-expect-error array reducers also reject mutable target unions.
  Transducer.arrayReducerInto(arrayUnion)
  // @ts-expect-error array reducers also reject fixed tuples.
  Transducer.arrayReducerInto(fixedTuple)

  type RefinedRecord = Collector.MutableRecord<Value> & {
    readonly marker: 'refined'
  }
  type HeterogeneousRecord = Collector.MutableRecord<Value> & {
    readonly count: number
  }
  const refined = Object.create(null) as RefinedRecord
  const heterogeneous = Object.create(null) as HeterogeneousRecord

  // @ts-expect-error arbitrary refinements cannot be preserved after writes to any key.
  Collector.recordInto(refined)
  // @ts-expect-error heterogeneous property refinements are not homogeneous record targets.
  Collector.recordInto(heterogeneous)
  // @ts-expect-error finite objects do not provide the required string and symbol index capacity.
  Collector.recordInto({ known: 'value' })
})

test('arrayReducerInto preserves the concrete target in state and output', () => {
  const target = new TextBucket()
  const reducer = Transducer.arrayReducerInto(target)

  expectTypeOf(reducer).toEqualTypeOf<Transducer.Reducer<string, TextBucket>>()
  expectTypeOf(reducer.init()).toEqualTypeOf<TextBucket>()
  expectTypeOf(reducer.complete(target)).toEqualTypeOf<TextBucket>()

  // @ts-expect-error reducer input is derived from the target element type.
  reducer.step(target, 1)
})
