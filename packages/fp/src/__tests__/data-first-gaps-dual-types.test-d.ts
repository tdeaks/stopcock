import { expectTypeOf, test } from 'vite-plus/test'
import * as MapOps from '../map'
import * as RecordOps from '../record'
import * as SetOps from '../set'
import * as TypedArrayOps from '../typed-array'

class TextMap extends Map<string, string> {
  readonly kind = 'text-map' as const
}

class TextSet extends Set<string> {
  readonly kind = 'text-set' as const
}

class NumberBuffer extends Uint16Array {
  readonly kind = 'number-buffer' as const
}

test('Map, Record, and Set Into operations preserve exact targets in both lanes', () => {
  const mapSource = new Map<string, number>([['a', 1]])
  const textMap = new TextMap()
  expectTypeOf(MapOps.fromIterableInto([['a', 'one']], textMap)).toEqualTypeOf<TextMap>()
  expectTypeOf(MapOps.fromIterableInto(textMap)([['a', 'one']])).toEqualTypeOf<TextMap>()
  expectTypeOf(MapOps.mapInto(mapSource, textMap, String)).toEqualTypeOf<TextMap>()
  expectTypeOf(MapOps.mapInto(textMap, String)(mapSource)).toEqualTypeOf<TextMap>()
  expectTypeOf(
    MapOps.filterInto(textMap, (value: string | number): value is string => typeof value === 'string')(
      new Map<string, string | number>(),
    ),
  ).toEqualTypeOf<TextMap>()

  const recordTarget = Object.create(null) as RecordOps.MutableRecord<string>
  const recordSource: RecordOps.ReadonlyRecord<number> = { a: 1 }
  expectTypeOf(RecordOps.fromEntriesInto(recordTarget)([['a', 'one']])).toEqualTypeOf<
    RecordOps.MutableRecord<string>
  >()
  expectTypeOf(RecordOps.mapInto(recordTarget, String)(recordSource)).toEqualTypeOf<
    RecordOps.MutableRecord<string>
  >()

  const textSet = new TextSet()
  expectTypeOf(SetOps.fromIterableInto(textSet)(['one'])).toEqualTypeOf<TextSet>()
  expectTypeOf(SetOps.mapInto(textSet, String)(new Set([1]))).toEqualTypeOf<TextSet>()
  expectTypeOf(SetOps.unionInto(textSet)(new Set(['one']))).toEqualTypeOf<TextSet>()
})

test('TypedArray Into, slice, and sort operations expose both lanes', () => {
  const source = new Uint8Array([1, 2])
  const target = new NumberBuffer(4)
  expectTypeOf(TypedArrayOps.copyInto(source, target)).toEqualTypeOf<NumberBuffer>()
  expectTypeOf(TypedArrayOps.copyInto(target)(source)).toEqualTypeOf<NumberBuffer>()
  expectTypeOf(TypedArrayOps.mapInto(target, (value: number) => value * 2)(source)).toEqualTypeOf<
    NumberBuffer
  >()
  expectTypeOf(
    TypedArrayOps.filterInto(target, (value: number) => value > 1)(source),
  ).toEqualTypeOf<TypedArrayOps.FilterIntoResult<NumberBuffer>>()
  expectTypeOf(TypedArrayOps.slice(source, 1)).toEqualTypeOf<Uint8Array<ArrayBuffer>>()
  expectTypeOf(TypedArrayOps.sort(source)).toEqualTypeOf<Uint8Array<ArrayBuffer>>()

  // @ts-expect-error bigint sources cannot be copied into number targets.
  TypedArrayOps.copyInto(target)(new BigInt64Array([1n]))
  // @ts-expect-error a number-producing transform cannot populate a bigint target.
  TypedArrayOps.mapInto(new BigInt64Array(2), (value: number) => value)(source)
})
