import { expectTypeOf, test } from 'vite-plus/test'
import * as MapOps from '../map'
import type { Option } from '../option'
import * as RecordOps from '../record'
import * as SetOps from '../set'
import * as TypedArray from '../typed-array'

test('Map operations preserve inference in both invocation styles', () => {
  type Value = number | string
  const source = new Map<string, Value>()
  const unionKeySource = new Map<string | number, Value>()
  const isString = (value: Value): value is string => typeof value === 'string'

  expectTypeOf(MapOps.empty()).toEqualTypeOf<ReadonlyMap<never, never>>()
  expectTypeOf(MapOps.set(MapOps.empty(), 'key', 1)).toEqualTypeOf<ReadonlyMap<string, number>>()
  expectTypeOf(MapOps.set('key', 1)(MapOps.empty())).toEqualTypeOf<ReadonlyMap<string, number>>()
  expectTypeOf(MapOps.get(source, 'key')).toEqualTypeOf<Option<Value>>()
  expectTypeOf(MapOps.get('key')(source)).toEqualTypeOf<Option<Value>>()
  expectTypeOf(MapOps.get('key')(unionKeySource)).toEqualTypeOf<Option<Value>>()
  expectTypeOf(MapOps.remove('key')(unionKeySource)).toEqualTypeOf<
    ReadonlyMap<string | number, Value>
  >()
  expectTypeOf(MapOps.getOrUndefined('key')(source)).toEqualTypeOf<Value | undefined>()
  expectTypeOf(MapOps.set('key', true)(source)).toEqualTypeOf<
    ReadonlyMap<string, Value | boolean>
  >()
  expectTypeOf(MapOps.set(Symbol.iterator, true)(source)).toEqualTypeOf<
    ReadonlyMap<string | typeof Symbol.iterator, Value | boolean>
  >()
  expectTypeOf(
    MapOps.update(Symbol.iterator, (value: Option<Value>) => value)(source),
  ).toEqualTypeOf<ReadonlyMap<string | typeof Symbol.iterator, Value>>()
  expectTypeOf(MapOps.remove('key')(source)).toEqualTypeOf<ReadonlyMap<string, Value>>()
  expectTypeOf(
    MapOps.map((value: Value, key: string) => `${key}:${String(value)}`)(source),
  ).toEqualTypeOf<ReadonlyMap<string, string>>()
  expectTypeOf(MapOps.mapKeys((key: string) => key.length)(source)).toEqualTypeOf<
    ReadonlyMap<number, Value>
  >()
  expectTypeOf(MapOps.filter(source, isString)).toEqualTypeOf<ReadonlyMap<string, string>>()
  expectTypeOf(MapOps.filter(isString)(source)).toEqualTypeOf<ReadonlyMap<string, string>>()
  expectTypeOf(MapOps.partition(source, isString)).toEqualTypeOf<
    readonly [accepted: ReadonlyMap<string, string>, rejected: ReadonlyMap<string, number>]
  >()
  expectTypeOf(MapOps.partition(isString)(source)).toEqualTypeOf<
    readonly [accepted: ReadonlyMap<string, string>, rejected: ReadonlyMap<string, number>]
  >()
  expectTypeOf(MapOps.merge(new Map<string, boolean>())(source)).toEqualTypeOf<
    ReadonlyMap<string, Value | boolean>
  >()
  expectTypeOf(MapOps.merge(new Map<symbol, boolean>())(source)).toEqualTypeOf<
    ReadonlyMap<string | symbol, Value | boolean>
  >()
  expectTypeOf(MapOps.intersection(new Map<symbol, boolean>())(source)).toEqualTypeOf<
    ReadonlyMap<string, Value>
  >()
  expectTypeOf(
    MapOps.reduce((total: number, value: Value) => total + String(value).length, 0)(source),
  ).toEqualTypeOf<number>()
  expectTypeOf(MapOps.equals(new Map(source))(source)).toEqualTypeOf<boolean>()
  const callableMap = (() => undefined) as (() => void) & ReadonlyMap<string, Value>
  expectTypeOf(MapOps.equals(callableMap)(source)).toEqualTypeOf<boolean>()

  // @ts-expect-error the captured key must belong to the eventual source key type.
  MapOps.get(Symbol.iterator)(unionKeySource)
  // @ts-expect-error a runtime function in the second position is always a comparator.
  MapOps.equals(source, callableMap)
  // @ts-expect-error Into operations deliberately require source, target, and callback.
  MapOps.mapInto(source, new Map<string, string>())
  // @ts-expect-error Into constructors deliberately require both source and target.
  MapOps.fromIterableInto(source)
})

test('Set operations preserve widening and refinement in both invocation styles', () => {
  type Value = number | string
  const source = new Set<Value>()
  const isString = (value: Value): value is string => typeof value === 'string'

  expectTypeOf(SetOps.empty()).toEqualTypeOf<ReadonlySet<never>>()
  expectTypeOf(SetOps.add(SetOps.empty(), 'key')).toEqualTypeOf<ReadonlySet<string>>()
  expectTypeOf(SetOps.add('key')(SetOps.empty())).toEqualTypeOf<ReadonlySet<string>>()
  expectTypeOf(SetOps.has('key')(source)).toEqualTypeOf<boolean>()
  expectTypeOf(SetOps.remove('key')(source)).toEqualTypeOf<ReadonlySet<Value>>()
  expectTypeOf(SetOps.toggle('key')(source)).toEqualTypeOf<ReadonlySet<Value>>()
  expectTypeOf(SetOps.toggle(true)(source)).toEqualTypeOf<ReadonlySet<Value | boolean>>()
  expectTypeOf(SetOps.add(true)(source)).toEqualTypeOf<ReadonlySet<Value | boolean>>()
  expectTypeOf(SetOps.map((value: Value) => String(value))(source)).toEqualTypeOf<
    ReadonlySet<string>
  >()
  expectTypeOf(SetOps.filter(source, isString)).toEqualTypeOf<ReadonlySet<string>>()
  expectTypeOf(SetOps.filter(isString)(source)).toEqualTypeOf<ReadonlySet<string>>()
  expectTypeOf(SetOps.partition(source, isString)).toEqualTypeOf<
    readonly [accepted: ReadonlySet<string>, rejected: ReadonlySet<number>]
  >()
  expectTypeOf(SetOps.partition(isString)(source)).toEqualTypeOf<
    readonly [accepted: ReadonlySet<string>, rejected: ReadonlySet<number>]
  >()
  expectTypeOf(SetOps.union(new Set<boolean>())(source)).toEqualTypeOf<
    ReadonlySet<Value | boolean>
  >()
  expectTypeOf(SetOps.symmetricDifference(new Set<boolean>())(source)).toEqualTypeOf<
    ReadonlySet<Value | boolean>
  >()
  expectTypeOf(SetOps.intersection(new Set<boolean>())(source)).toEqualTypeOf<ReadonlySet<Value>>()
  expectTypeOf(SetOps.difference(new Set<boolean>())(source)).toEqualTypeOf<ReadonlySet<Value>>()
  expectTypeOf(SetOps.isDisjoint(new Set<boolean>())(source)).toEqualTypeOf<boolean>()
  expectTypeOf(
    SetOps.reduce((total: number, value: Value) => total + String(value).length, 0)(source),
  ).toEqualTypeOf<number>()
  expectTypeOf(SetOps.equals(new Set(source))(source)).toEqualTypeOf<boolean>()

  // @ts-expect-error the captured value must belong to the eventual source element type.
  SetOps.has(true)(source)
  // @ts-expect-error removing an impossible value is rejected.
  SetOps.remove(true)(source)
  // @ts-expect-error Into operations deliberately require source, target, and callback.
  SetOps.filterInto(source, new Set<Value>())
  // @ts-expect-error Into constructors deliberately require both source and target.
  SetOps.fromIterableInto(source)
})

test('Record operations preserve values and refinements in both invocation styles', () => {
  type Value = number | string
  const source = {} as RecordOps.ReadonlyRecord<Value>
  const isString = (value: Value): value is string => typeof value === 'string'

  expectTypeOf(RecordOps.get(source, 'key')).toEqualTypeOf<Option<Value>>()
  expectTypeOf(RecordOps.get('key')(source)).toEqualTypeOf<Option<Value>>()
  expectTypeOf(RecordOps.remove('key')(source)).toEqualTypeOf<RecordOps.MutableRecord<Value>>()
  expectTypeOf(RecordOps.set('key', true)(source)).toEqualTypeOf<
    RecordOps.MutableRecord<Value | boolean>
  >()
  expectTypeOf(RecordOps.map((value: Value) => String(value))(source)).toEqualTypeOf<
    RecordOps.MutableRecord<string>
  >()
  expectTypeOf(RecordOps.mapKeys((key) => key)(source)).toEqualTypeOf<
    RecordOps.MutableRecord<Value>
  >()
  expectTypeOf(RecordOps.filter(source, isString)).toEqualTypeOf<RecordOps.MutableRecord<string>>()
  expectTypeOf(RecordOps.filter(isString)(source)).toEqualTypeOf<RecordOps.MutableRecord<string>>()
  expectTypeOf(RecordOps.partition(source, isString)).toEqualTypeOf<
    readonly [accepted: RecordOps.MutableRecord<string>, rejected: RecordOps.MutableRecord<number>]
  >()
  expectTypeOf(RecordOps.partition(isString)(source)).toEqualTypeOf<
    readonly [accepted: RecordOps.MutableRecord<string>, rejected: RecordOps.MutableRecord<number>]
  >()
  expectTypeOf(
    RecordOps.merge({ flag: true } as RecordOps.ReadonlyRecord<boolean>)(source),
  ).toEqualTypeOf<RecordOps.MutableRecord<Value | boolean>>()
  expectTypeOf(RecordOps.pick(['one', Symbol.iterator])(source)).toEqualTypeOf<
    RecordOps.MutableRecord<Value>
  >()
  expectTypeOf(
    RecordOps.reduce((total: number, value: Value) => total + String(value).length, 0)(source),
  ).toEqualTypeOf<number>()
  expectTypeOf(RecordOps.equals({ ...source })(source)).toEqualTypeOf<boolean>()
  const callableRecord = (() => 1) as (() => number) & RecordOps.ReadonlyRecord<Value>
  expectTypeOf(RecordOps.equals(callableRecord)(source)).toEqualTypeOf<boolean>()
  class ConstructableRecord {}
  const constructableRecord = ConstructableRecord as typeof ConstructableRecord &
    RecordOps.ReadonlyRecord<Value>
  expectTypeOf(RecordOps.equals(constructableRecord)(source)).toEqualTypeOf<boolean>()

  // @ts-expect-error Into operations deliberately require source, target, and callback.
  RecordOps.mapInto(source, {} as RecordOps.MutableRecord<string>)
  // @ts-expect-error Into constructors deliberately require both source and target.
  RecordOps.fromEntriesInto([])
  // @ts-expect-error callable records cannot occupy the dispatch-sensitive other position.
  RecordOps.equals(source, callableRecord)
  // @ts-expect-error constructable records are runtime functions in the same position.
  RecordOps.equals(source, constructableRecord)
})

test('Map Into targets must accept every key and value that can be written', () => {
  type Key = string | symbol
  type Value = number | string

  class WideTarget extends Map<PropertyKey, Value | boolean> {
    readonly marker = 'wide-map' as const
  }

  const source = new Map<Key, Value>()
  const entries = [] as Array<readonly [Key, Value]>
  const narrowKeys = new Map<string, Value>()
  const narrowValues = new Map<Key, string>()
  const strings = new Map<Key, string>()
  const wideTarget = new WideTarget()
  const isString = (value: Value): value is string => typeof value === 'string'

  expectTypeOf(MapOps.fromIterableInto(entries, wideTarget)).toEqualTypeOf<WideTarget>()
  expectTypeOf(MapOps.mapInto(source, strings, (value) => String(value))).toEqualTypeOf<
    typeof strings
  >()
  expectTypeOf(MapOps.filterInto(source, narrowValues, isString)).toEqualTypeOf<
    typeof narrowValues
  >()
  expectTypeOf(MapOps.filterInto(source, wideTarget, () => true)).toEqualTypeOf<WideTarget>()

  // @ts-expect-error constructor writes must fit the target's complete key capacity.
  MapOps.fromIterableInto(entries, narrowKeys)
  // @ts-expect-error constructor writes must fit the target's complete value capacity.
  MapOps.fromIterableInto(entries, narrowValues)
  // @ts-expect-error transformed keys still come from every source key.
  MapOps.mapInto(source, narrowKeys, (value) => value)
  // @ts-expect-error every possible transformed output must fit the target.
  MapOps.mapInto(source, strings, (value) => value)
  // @ts-expect-error a boolean predicate can retain every source value.
  MapOps.filterInto(source, narrowValues, () => true)
  // @ts-expect-error a guard may narrow values, but it cannot narrow source keys.
  MapOps.filterInto(source, new Map<string, string>(), isString)
})

test('Set Into targets must accept every value that can be written', () => {
  type Value = number | string

  class WideTarget extends Set<Value | boolean> {
    readonly marker = 'wide-set' as const
  }

  const source = new Set<Value>()
  const narrowTarget = new Set<string>()
  const wideTarget = new WideTarget()
  const isString = (value: Value): value is string => typeof value === 'string'

  expectTypeOf(SetOps.fromIterableInto(source, wideTarget)).toEqualTypeOf<WideTarget>()
  expectTypeOf(SetOps.mapInto(source, narrowTarget, (value) => String(value))).toEqualTypeOf<
    typeof narrowTarget
  >()
  expectTypeOf(SetOps.filterInto(source, narrowTarget, isString)).toEqualTypeOf<
    typeof narrowTarget
  >()
  expectTypeOf(SetOps.unionInto(source, wideTarget)).toEqualTypeOf<WideTarget>()

  // @ts-expect-error constructor writes include every member of the source union.
  SetOps.fromIterableInto(source, narrowTarget)
  // @ts-expect-error every possible transformed output must fit the target.
  SetOps.mapInto(source, narrowTarget, (value) => value)
  // @ts-expect-error a boolean predicate can retain every source value.
  SetOps.filterInto(source, narrowTarget, () => true)
  // @ts-expect-error unionInto writes every source value.
  SetOps.unionInto(source, narrowTarget)
})

test('Record Into targets must accept every value that can be written', () => {
  type Value = number | string

  const source = {} as RecordOps.ReadonlyRecord<Value>
  const entries = [] as Array<readonly [PropertyKey, Value]>
  const narrowTarget = {} as RecordOps.MutableRecord<string>
  const wideTarget = {} as RecordOps.MutableRecord<Value | boolean>
  const refinedTarget = {} as RecordOps.MutableRecord<Value | boolean> & {
    readonly marker: 'wide-record'
  }
  const isString = (value: Value): value is string => typeof value === 'string'

  expectTypeOf(RecordOps.fromEntriesInto(entries, wideTarget)).toEqualTypeOf<
    RecordOps.MutableRecord<Value | boolean>
  >()
  expectTypeOf(RecordOps.mapInto(source, narrowTarget, (value) => String(value))).toEqualTypeOf<
    typeof narrowTarget
  >()
  expectTypeOf(RecordOps.filterInto(source, narrowTarget, isString)).toEqualTypeOf<
    typeof narrowTarget
  >()
  expectTypeOf(RecordOps.filterInto(source, wideTarget, () => true)).toEqualTypeOf<
    RecordOps.MutableRecord<Value | boolean>
  >()

  // @ts-expect-error constructor writes include every member of the source union.
  RecordOps.fromEntriesInto(entries, narrowTarget)
  // @ts-expect-error every possible transformed output must fit the target.
  RecordOps.mapInto(source, narrowTarget, (value) => value)
  // @ts-expect-error a boolean predicate can retain every source value.
  RecordOps.filterInto(source, narrowTarget, () => true)
  // @ts-expect-error arbitrary property keys could invalidate a refined field.
  RecordOps.fromEntriesInto(entries, refinedTarget)
  // @ts-expect-error source keys could invalidate a refined field.
  RecordOps.mapInto(source, refinedTarget, (value) => value)
  // @ts-expect-error retained source keys could invalidate a refined field.
  RecordOps.filterInto(source, refinedTarget, () => true)
})

test('TypedArray dual operations retain the concrete numeric family', () => {
  const numbers = new Uint16Array()
  const bytes = new Uint8Array()
  const bigints = new BigInt64Array()

  expectTypeOf(TypedArray.at(0)(numbers)).toEqualTypeOf<Option<number>>()
  expectTypeOf(TypedArray.at(0)(bigints)).toEqualTypeOf<Option<bigint>>()
  expectTypeOf(TypedArray.atOrUndefined(0)(numbers)).toEqualTypeOf<number | undefined>()
  expectTypeOf(TypedArray.map((value: number) => value + 1)(numbers)).toEqualTypeOf<
    typeof numbers
  >()
  expectTypeOf(TypedArray.map((value: bigint) => value + 1n)(bigints)).toEqualTypeOf<
    typeof bigints
  >()
  expectTypeOf(TypedArray.filter((value: number) => value > 0)(numbers)).toEqualTypeOf<
    typeof numbers
  >()
  expectTypeOf(TypedArray.filter(() => true)(numbers)).toEqualTypeOf<typeof numbers>()
  expectTypeOf(TypedArray.filter(() => true)(bigints)).toEqualTypeOf<typeof bigints>()
  expectTypeOf(TypedArray.slice(1, 3)(numbers)).toEqualTypeOf<typeof numbers>()
  expectTypeOf(
    TypedArray.sort((left: number, right: number) => left - right)(numbers),
  ).toEqualTypeOf<typeof numbers>()
  expectTypeOf(TypedArray.sort(() => 0)(numbers)).toEqualTypeOf<typeof numbers>()
  expectTypeOf(TypedArray.sort(() => 0)(bigints)).toEqualTypeOf<typeof bigints>()
  expectTypeOf(
    TypedArray.reduce((total: number, value: number) => total + value, 0)(numbers),
  ).toEqualTypeOf<number>()
  expectTypeOf(TypedArray.reduce((total: number) => total + 1, 0)(numbers)).toEqualTypeOf<number>()
  expectTypeOf(TypedArray.reduce((total: number) => total + 1, 0)(bigints)).toEqualTypeOf<number>()
  expectTypeOf(TypedArray.indexOf(1)(numbers)).toEqualTypeOf<Option<number>>()
  expectTypeOf(TypedArray.indexOf(1n)(bigints)).toEqualTypeOf<Option<number>>()
  expectTypeOf(TypedArray.includes(1)(numbers)).toEqualTypeOf<boolean>()
  expectTypeOf(TypedArray.equals(new Uint16Array())(numbers)).toEqualTypeOf<boolean>()
  expectTypeOf(TypedArray.concat(bytes, new Float64Array())).toEqualTypeOf<typeof bytes>()
  expectTypeOf(TypedArray.equals(new Uint8Array(), new Float64Array())).toEqualTypeOf<boolean>()
  expectTypeOf(TypedArray.equals(new Float64Array())(new Uint8Array())).toEqualTypeOf<boolean>()
  const bigintTarget = new BigInt64Array()
  const numberTarget = new Float64Array()
  expectTypeOf(TypedArray.mapInto(numbers, bigintTarget, (value) => BigInt(value))).toEqualTypeOf<
    typeof bigintTarget
  >()
  expectTypeOf(TypedArray.mapInto(bigints, numberTarget, (value) => Number(value))).toEqualTypeOf<
    typeof numberTarget
  >()

  const directConcat = TypedArray.concat(numbers)
  expectTypeOf(directConcat).toEqualTypeOf<typeof numbers>()
  // @ts-expect-error concat(source) remains a concrete result, not an ambiguous operator.
  directConcat(numbers)
  // @ts-expect-error number operators cannot be applied to bigint storage.
  TypedArray.map((value: number) => value + 1)(bigints)
  // @ts-expect-error bigint searches cannot be applied to number storage.
  TypedArray.includes(1n)(numbers)
  // @ts-expect-error concat rejects mixing number and bigint storage families.
  TypedArray.concat(numbers, bigints)
  // @ts-expect-error equality rejects mixing number and bigint storage families.
  TypedArray.equals(numbers, bigints)
  // @ts-expect-error curried equality rejects mixing number and bigint storage families.
  TypedArray.equals(bigints)(numbers)
  // @ts-expect-error numeric targets require numeric callback output.
  TypedArray.mapInto(numbers, numberTarget, () => 1n)
  // @ts-expect-error bigint targets require bigint callback output.
  TypedArray.mapInto(bigints, bigintTarget, () => 1)
  // @ts-expect-error Into operations deliberately require source, target, and callback.
  TypedArray.mapInto(numbers, new Uint16Array())
})

test('TypedArray writes preserve family correlation and allocating operations rebind buffers', () => {
  const sharedNumbers = new Uint8Array(new SharedArrayBuffer(8))
  const otherNumbers = new Float64Array()

  expectTypeOf(TypedArray.clone(sharedNumbers)).toEqualTypeOf<Uint8Array<ArrayBuffer>>()
  expectTypeOf(TypedArray.map(sharedNumbers, (value) => value)).toEqualTypeOf<
    Uint8Array<ArrayBuffer>
  >()
  expectTypeOf(TypedArray.filter(sharedNumbers, () => true)).toEqualTypeOf<
    Uint8Array<ArrayBuffer>
  >()
  expectTypeOf(TypedArray.slice(sharedNumbers)).toEqualTypeOf<Uint8Array<ArrayBuffer>>()
  expectTypeOf(TypedArray.concat(sharedNumbers, otherNumbers)).toEqualTypeOf<
    Uint8Array<ArrayBuffer>
  >()
  expectTypeOf(TypedArray.reverse(sharedNumbers)).toEqualTypeOf<Uint8Array<ArrayBuffer>>()
  expectTypeOf(TypedArray.sort(sharedNumbers)).toEqualTypeOf<Uint8Array<ArrayBuffer>>()

  class CustomBytes extends Uint8Array {
    readonly marker = 'custom' as const
  }
  const custom = new CustomBytes(4)
  expectTypeOf(TypedArray.clone(custom)).toEqualTypeOf<CustomBytes>()
  expectTypeOf(TypedArray.map(custom, (value) => value)).toEqualTypeOf<CustomBytes>()

  const unknownSource = {} as TypedArray.AnyTypedArray
  const unknownTarget = {} as TypedArray.AnyTypedArray
  const unknownConstructor = {} as TypedArray.TypedArrayConstructor<TypedArray.AnyTypedArray>

  // @ts-expect-error an unresolved number-or-bigint source cannot be copied into an unresolved target.
  TypedArray.copyInto(unknownSource, unknownTarget)
  // @ts-expect-error an unresolved number-or-bigint source cannot be mapped into an unresolved target.
  TypedArray.mapInto(unknownSource, unknownTarget, () => 1n)
  // @ts-expect-error an unresolved number-or-bigint source cannot be filtered into an unresolved target.
  TypedArray.filterInto(unknownSource, unknownTarget, () => true)
  // @ts-expect-error a family-changing callback is unsafe for an unresolved source.
  TypedArray.map(unknownSource, () => 1n)
  // @ts-expect-error a constructor with an unresolved element family cannot accept a mixed iterable.
  TypedArray.from(unknownConstructor, [1, 2n])
})
