/**
 * Type-level contract for the dual emission
 * (2026-08-24-dual-performance-first.md, Phase 1): the generated modules'
 * two-branch annotations must resolve both call shapes with full generic
 * inference, keep contextual (unannotated) lambdas working inside pipe, and
 * reject shape-confused calls. The runtime never sees these; a regression
 * here is an inference collapse, the exact failure mode that killed the old
 * generic dual() types.
 */
import { expectTypeOf, test } from 'vite-plus/test'
import { pipe } from '../pipe'
import * as A from '../array'
import * as AX from '../array-extra'
import * as M from '../math'
import * as G from '../guard'
import * as I from '../iter'
import * as MapOps from '../map'
import * as Match from '../match'
import * as NEA from '../non-empty-array'
import * as N from '../number'
import * as Nullable from '../nullable'
import * as O from '../object'
import * as Optic from '../optic'
import * as OptionOps from '../option'
import type { Option } from '../option'
import * as RecordOps from '../record'
import * as ResultOps from '../result'
import type { Result } from '../result'
import * as Schema from '../schema'
import * as SetOps from '../set'
import * as S from '../string'
import * as TypedArray from '../typed-array'
import * as Validation from '../validation'

declare const numbers: number[]
declare const mixed: (string | number)[]

test('data-first calls infer generics from the data argument', () => {
  expectTypeOf(A.map(numbers, (x) => x + 1)).toEqualTypeOf<number[]>()
  expectTypeOf(A.map(numbers, (x) => String(x))).toEqualTypeOf<string[]>()
  expectTypeOf(A.filter(numbers, (x) => x > 1)).toEqualTypeOf<number[]>()
  expectTypeOf(A.take(numbers, 3)).toEqualTypeOf<number[]>()
  expectTypeOf(A.reduce(numbers, (acc: number, x) => acc + x, 0)).toEqualTypeOf<number>()
  expectTypeOf(M.add(2, 3)).toEqualTypeOf<number>()
})

test('data-first callback parameters are contextually typed, not any', () => {
  A.map(numbers, (x) => {
    expectTypeOf(x).toEqualTypeOf<number>()
    return x
  })
  A.filter(mixed, (x) => {
    expectTypeOf(x).toEqualTypeOf<string | number>()
    return true
  })
})

test('data-first filter narrows through type guards', () => {
  expectTypeOf(A.filter(mixed, G.isString)).toEqualTypeOf<string[]>()
})

test('curried calls keep working unchanged, including inside pipe with unannotated lambdas', () => {
  expectTypeOf(A.map((x: number) => x + 1)(numbers)).toEqualTypeOf<number[]>()
  expectTypeOf(M.add(2)(3)).toEqualTypeOf<number>()
  const result = pipe(
    numbers,
    A.map((x) => x + 1),
    A.filter((x) => x > 1),
    A.take(3),
  )
  expectTypeOf(result).toEqualTypeOf<number[]>()
  const narrowed = pipe(mixed, A.filter(G.isString))
  expectTypeOf(narrowed).toEqualTypeOf<string[]>()
})

test('shape-confused calls are rejected', () => {
  // @ts-expect-error data alone is not a config argument
  A.map(numbers)
  // @ts-expect-error config-first with trailing data is not a call shape
  A.map((x: number) => x + 1, numbers)
  // @ts-expect-error curried step applied to the wrong element type
  A.map((x: number) => x + 1)(['a'])
})

test('generated string operations retain both overload branches', () => {
  const isPayload = (value: unknown): value is { readonly value: number } =>
    typeof value === 'object' && value !== null && 'value' in value

  expectTypeOf(S.slice('stopcock', 1)).toEqualTypeOf<string>()
  expectTypeOf(S.slice(1)('stopcock')).toEqualTypeOf<string>()
  expectTypeOf(S.padStart('7', 3, '0')).toEqualTypeOf<string>()
  expectTypeOf(S.padStart(3, '0')('7')).toEqualTypeOf<string>()
  expectTypeOf(S.normalize('e\u0301', 'NFC')).toEqualTypeOf<string>()
  expectTypeOf(S.normalize('NFC')('e\u0301')).toEqualTypeOf<string>()
  expectTypeOf(S.graphemes('á', undefined)).toEqualTypeOf<string[]>()
  expectTypeOf(S.graphemes(undefined)('á')).toEqualTypeOf<string[]>()
  expectTypeOf(S.graphemes('en')).toEqualTypeOf<(value: string) => string[]>()
  expectTypeOf(S.parseJson('{"value":1}', isPayload)).toEqualTypeOf<
    Result<{ readonly value: number }, SyntaxError | TypeError>
  >()
  expectTypeOf(S.parseJson(isPayload)('{"value":1}')).toEqualTypeOf<
    Result<{ readonly value: number }, SyntaxError | TypeError>
  >()

  // @ts-expect-error one arbitrary string is a config slot, not an unconfigured data-first call.
  S.normalize('plain text')
  // @ts-expect-error string data cannot occupy slice's numeric config slot.
  S.slice('stopcock')
})

test('generated object operations preserve data-first generic inference', () => {
  const source: {
    readonly count: number
    readonly label?: string
    readonly nested: { readonly value: number }
  } = { count: 1, label: 'one', nested: { value: 2 } }

  expectTypeOf(O.pick(source, ['count'])).toEqualTypeOf<Pick<typeof source, 'count'>>()
  expectTypeOf(O.pick(['count'])(source)).toEqualTypeOf<Pick<typeof source, 'count'>>()
  expectTypeOf(O.omit(['count'])(source)).toEqualTypeOf<Omit<typeof source, 'count'>>()
  expectTypeOf(
    O.mapValues(source, (value) => {
      expectTypeOf(value).toEqualTypeOf<number | string | { readonly value: number } | undefined>()
      return String(value)
    }),
  ).toEqualTypeOf<{
    readonly count: string
    readonly label?: string
    readonly nested: string
  }>()
  expectTypeOf(O.getPath(source, ['nested', 'value'])).toEqualTypeOf<Option<number>>()
  expectTypeOf(O.setPath(source, ['count'], 2)).toEqualTypeOf<typeof source>()
  expectTypeOf(
    O.modifyPath(source, ['count'], (value) => {
      expectTypeOf(value).toEqualTypeOf<number>()
      return value + 1
    }),
  ).toEqualTypeOf<typeof source>()
  expectTypeOf(O.mergeDeep(source, { extra: true }, undefined)).toEqualTypeOf<
    typeof source & { extra: boolean }
  >()
  expectTypeOf(O.mergeDeep({ extra: true })(source)).toEqualTypeOf<
    typeof source & { extra: boolean }
  >()

  // @ts-expect-error two object arguments are ambiguous with curried options; data-first supplies slot three.
  O.mergeDeep(source, { extra: true })
})

test('generated number operations retain Option and disambiguated optional contracts', () => {
  expectTypeOf(N.weightedMean([10, 20], [1, 3])).toEqualTypeOf<Option<number>>()
  expectTypeOf(N.weightedMean([1, 3])([10, 20])).toEqualTypeOf<Option<number>>()
  expectTypeOf(N.percentile([1, 2, 3], 50)).toEqualTypeOf<Option<number>>()
  expectTypeOf(N.percentile(50)([1, 2, 3])).toEqualTypeOf<Option<number>>()
  expectTypeOf(N.parseInteger('ff', 16)).toEqualTypeOf<Option<N.Integer>>()
  expectTypeOf(N.parseInteger(16)('ff')).toEqualTypeOf<Option<N.Integer>>()
  expectTypeOf(N.roundTo(1.234, 2)).toEqualTypeOf<number>()
  expectTypeOf(N.roundTo(1.234, 2, 'round')).toEqualTypeOf<number>()
  expectTypeOf(N.roundTo(2)(1.234)).toEqualTypeOf<number>()
  expectTypeOf(N.roundTo(2, 'floor')(1.234)).toEqualTypeOf<number>()
  expectTypeOf(N.roundTo(2, undefined)(1.234)).toEqualTypeOf<number>()
})

test('hand-written modules retain both branches with contextual inference', () => {
  const mapValue = new Map<string, number>()
  const recordValue: RecordOps.ReadonlyRecord<number> = { one: 1 }
  const setValue = new Set<number>()
  const optionValue = OptionOps.some(2)
  const resultValue = ResultOps.ok(2)

  expectTypeOf(MapOps.map(mapValue, (value) => String(value))).toEqualTypeOf<
    ReadonlyMap<string, string>
  >()
  expectTypeOf(MapOps.map((value: number) => String(value))(mapValue)).toEqualTypeOf<
    ReadonlyMap<string, string>
  >()
  expectTypeOf(RecordOps.map(recordValue, (value) => String(value))).toEqualTypeOf<
    RecordOps.MutableRecord<string>
  >()
  expectTypeOf(SetOps.map(setValue, (value) => String(value))).toEqualTypeOf<ReadonlySet<string>>()
  expectTypeOf(I.map([1, 2], (value) => String(value))).toEqualTypeOf<I.Iter<string>>()
  expectTypeOf(AX.scan1([1, 2], (left, right) => left + right)).toEqualTypeOf<
    [number, ...number[]]
  >()
  expectTypeOf(TypedArray.slice(new Uint8Array(), 1)).toEqualTypeOf<Uint8Array<ArrayBuffer>>()
  expectTypeOf(OptionOps.map(optionValue, (value) => String(value))).toEqualTypeOf<Option<string>>()
  ResultOps.map(resultValue, (value) => {
    expectTypeOf(value).toEqualTypeOf<number>()
    return String(value)
  })
  expectTypeOf(ResultOps.fromNullable(1 as number | null, () => 'missing')).toEqualTypeOf<
    Result<number, string>
  >()
  expectTypeOf(Nullable.map(1 as number | null, (value) => String(value))).toEqualTypeOf<
    string | null | undefined
  >()

  const valueLens = Optic.prop<{ readonly value: number }, 'value'>('value')
  expectTypeOf(Optic.view(valueLens, { value: 1 })).toEqualTypeOf<number>()

  const positive = Schema.fromPredicate<number>((value) => value > 0)
  expectTypeOf(Schema.map(positive, (value) => String(value))).toEqualTypeOf<
    Schema.StandardSchemaV1<number, string>
  >()
  expectTypeOf(Schema.map((value: number) => String(value))(positive)).toEqualTypeOf<
    Schema.StandardSchemaV1<number, string>
  >()
  expectTypeOf(
    Validation.fromPredicate(
      1,
      (value) => value > 0,
      () => 'negative',
    ),
  ).toMatchTypeOf<Validation.Validation<number, string>>()

  const valueCases = {
    one: () => 1,
    two: () => 2,
  } as const
  expectTypeOf(Match.value<typeof valueCases, number>('one', valueCases)).toEqualTypeOf<number>()
  expectTypeOf(Match.value<typeof valueCases, number>(valueCases)('one')).toEqualTypeOf<number>()

  const unknownValue: unknown = ['one']
  if (G.isArrayOf(unknownValue, G.isString)) {
    expectTypeOf(unknownValue).toEqualTypeOf<string[]>()
  }
  if (G.isArrayOf(G.isString)(unknownValue)) {
    expectTypeOf(unknownValue).toEqualTypeOf<string[]>()
  }

  const nonEmpty: NEA.NonEmptyArray<number> = [1]
  expectTypeOf(NEA.map(nonEmpty, (value) => String(value))).toEqualTypeOf<
    NEA.NonEmptyArray<string>
  >()
})
