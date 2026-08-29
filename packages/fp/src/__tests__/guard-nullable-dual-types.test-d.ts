import { expectTypeOf, test } from 'vite-plus/test'
import * as G from '../guard'
import * as N from '../nullable'

declare const nullableNumber: N.Nullable<number>
declare const nullableMixed: N.Nullable<string | number>

test('nullable data-first calls infer their data and callback types', () => {
  expectTypeOf(N.map(nullableNumber, (value) => String(value))).toEqualTypeOf<N.Nullable<string>>()
  expectTypeOf(N.flatMap(nullableNumber, (value) => value || null)).toEqualTypeOf<
    N.Nullable<number>
  >()
  expectTypeOf(N.tap(nullableNumber, (value) => expectTypeOf(value).toBeNumber())).toEqualTypeOf<
    N.Nullable<number>
  >()
  expectTypeOf(N.filter(nullableMixed, G.isString)).toEqualTypeOf<N.Nullable<string>>()
  expectTypeOf(N.match(nullableNumber, () => 'none' as const, String)).toEqualTypeOf<
    string | 'none'
  >()
  expectTypeOf(N.getOrElse(nullableNumber, () => 'none' as const)).toEqualTypeOf<number | 'none'>()
  expectTypeOf(N.getWithDefault(nullableNumber, 'none' as const)).toEqualTypeOf<number | 'none'>()
  expectTypeOf(N.toResult(nullableNumber, () => 'none' as const)).toEqualTypeOf<
    import('../result').Result<number, 'none'>
  >()
  expectTypeOf(N.zip(nullableNumber, 'value' as const)).toEqualTypeOf<
    N.Nullable<readonly [number, 'value']>
  >()
  expectTypeOf(N.zipWith(nullableNumber, 2, (left, right) => left + right)).toEqualTypeOf<
    N.Nullable<number>
  >()
  expectTypeOf(N.traverseReadonlyArray([1, 2], (value, index) => value + index)).toEqualTypeOf<
    N.Nullable<readonly number[]>
  >()
})

test('nullable curried calls keep their narrowing and result types', () => {
  expectTypeOf(N.map((value: number) => String(value))(nullableNumber)).toEqualTypeOf<
    N.Nullable<string>
  >()
  expectTypeOf(N.filter(G.isString)(nullableMixed)).toEqualTypeOf<N.Nullable<string>>()
  expectTypeOf(N.zip('value' as const)(nullableNumber)).toEqualTypeOf<
    N.Nullable<readonly [number, 'value']>
  >()
})

test('guard dual forms preserve narrowing', () => {
  let unknownValue: unknown = Math.random() > 0.5 ? new Date() : 'value'
  if (G.is(unknownValue, Date)) expectTypeOf(unknownValue).toEqualTypeOf<Date>()
  if (G.is(Date)(unknownValue)) expectTypeOf(unknownValue).toEqualTypeOf<Date>()
  if (G.is(Date, unknownValue)) expectTypeOf(unknownValue).toEqualTypeOf<Date>()

  let collection: unknown = Math.random() > 0.5 ? ['value'] : null
  if (G.isArrayOf(collection, G.isString)) expectTypeOf(collection).toEqualTypeOf<string[]>()
  if (G.isArrayOf(G.isString)(collection)) expectTypeOf(collection).toEqualTypeOf<string[]>()
  if (G.isRecordOf(collection, G.isNumber)) {
    expectTypeOf(collection).toEqualTypeOf<Record<PropertyKey, number>>()
  }
})

test('guard combinator data-first forms narrow exactly like their factories', () => {
  type Input = string | number | boolean
  let input = null as unknown as Input
  const isText = (value: Input): value is string => typeof value === 'string'
  const isLongText = (value: string): value is string & { readonly long: true } => value.length > 3
  const isNumber = (value: Input): value is number => typeof value === 'number'

  if (G.and(input, isText, isLongText)) {
    expectTypeOf(input).toEqualTypeOf<string & { readonly long: true }>()
  }
  if (G.and(isText, isLongText)(input)) {
    expectTypeOf(input).toEqualTypeOf<string & { readonly long: true }>()
  }
  if (G.or(input, isText, isNumber)) expectTypeOf(input).toEqualTypeOf<string | number>()
  if (G.not(input, isText)) expectTypeOf(input).toEqualTypeOf<number | boolean>()
})
