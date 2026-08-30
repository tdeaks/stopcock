import { expectTypeOf, test } from 'vite-plus/test'
import * as Monoid from '../monoid'
import * as NEA from '../non-empty-array'
import type { Option } from '../option'
import * as Reader from '../reader'
import * as Semigroup from '../semigroup'
import * as State from '../state-fn'
import * as These from '../these'
import * as Writer from '../writer'

declare const nonEmptyMixed: NEA.NonEmptyArray<string | number>
declare const nonEmptyNumbers: NEA.NonEmptyArray<number>

test('NonEmptyArray data-first and curried branches preserve inference and narrowing', () => {
  expectTypeOf(NEA.map(nonEmptyNumbers, (value) => String(value))).toEqualTypeOf<
    NEA.NonEmptyArray<string>
  >()
  expectTypeOf(NEA.map((value: number) => String(value))(nonEmptyNumbers)).toEqualTypeOf<
    NEA.NonEmptyArray<string>
  >()

  const isString = (value: string | number): value is string => typeof value === 'string'
  expectTypeOf(NEA.filter(nonEmptyMixed, isString)).toEqualTypeOf<
    Option<NEA.NonEmptyArray<string>>
  >()
  expectTypeOf(NEA.filter(isString)(nonEmptyMixed)).toEqualTypeOf<
    Option<NEA.NonEmptyArray<string>>
  >()

  NEA.reduceWith(nonEmptyNumbers, '', (text, value) => {
    expectTypeOf(text).toEqualTypeOf<string>()
    expectTypeOf(value).toEqualTypeOf<number>()
    return text + value
  })

  // @ts-expect-error data alone is not a config argument
  NEA.map(nonEmptyNumbers)
})

interface Environment {
  readonly value: number
  readonly offset: number
}

declare const reader: Reader.Reader<Environment, number>

test('Reader duals stop at the Reader input and retain returned environment functions', () => {
  expectTypeOf(Reader.map(reader, (value) => String(value))).toEqualTypeOf<
    Reader.Reader<Environment, string>
  >()
  expectTypeOf(Reader.map((value: number) => String(value))(reader)).toEqualTypeOf<
    Reader.Reader<Environment, string>
  >()
  expectTypeOf(
    Reader.flatMap(
      reader,
      (value) => (environment: { readonly offset: number }) => value + environment.offset,
    ),
  ).toEqualTypeOf<Reader.Reader<Environment & { readonly offset: number }, number>>()
  expectTypeOf(Reader.provide(reader, { value: 1, offset: 2 })).toEqualTypeOf<number>()
  expectTypeOf(Reader.provide({ value: 1, offset: 2 })(reader)).toEqualTypeOf<number>()
})

declare const state: State.State<number, number>

test('State duals preserve the state program as the data input', () => {
  expectTypeOf(State.map(state, (value) => String(value))).toEqualTypeOf<
    State.State<number, string>
  >()
  expectTypeOf(State.map((value: number) => String(value))(state)).toEqualTypeOf<
    State.State<number, string>
  >()
  expectTypeOf(State.run(state, 0)).toEqualTypeOf<readonly [number, number]>()
  expectTypeOf(State.run(0)(state)).toEqualTypeOf<readonly [number, number]>()
  expectTypeOf(State.evaluate(state, 0)).toEqualTypeOf<number>()
  expectTypeOf(State.execute(state, 0)).toEqualTypeOf<number>()
})

declare const writer: Writer.Writer<string, number>

test('Writer multi-stage config remains curried while data-first accepts every config', () => {
  expectTypeOf(Writer.of(1, Monoid.string)).toEqualTypeOf<Writer.Writer<string, number>>()
  expectTypeOf(Writer.of(Monoid.string)(1)).toEqualTypeOf<Writer.Writer<string, number>>()
  expectTypeOf(Writer.map(writer, (value) => String(value))).toEqualTypeOf<
    Writer.Writer<string, string>
  >()
  expectTypeOf(Writer.map((value: number) => String(value))(writer)).toEqualTypeOf<
    Writer.Writer<string, string>
  >()
  expectTypeOf(
    Writer.flatMap(writer, Monoid.string, (value) => Writer.writer(value + 1, 'next')),
  ).toEqualTypeOf<Writer.Writer<string, number>>()
  expectTypeOf(
    Writer.flatMap(Monoid.string)((value: number) => Writer.writer(value + 1, 'next'))(writer),
  ).toEqualTypeOf<Writer.Writer<string, number>>()
  expectTypeOf(Writer.sequenceReadonlyArray([writer], Monoid.string)).toEqualTypeOf<
    Writer.Writer<string, readonly number[]>
  >()

  // @ts-expect-error data-first flatMap requires both the Monoid and transform slots
  Writer.flatMap(writer, Monoid.string)
})

declare const these: These.These<string, number>

test('These nested config duals preserve diagnostics and value inference', () => {
  expectTypeOf(These.map(these, (value) => String(value))).toEqualTypeOf<
    These.These<string, string>
  >()
  expectTypeOf(These.map((value: number) => String(value))(these)).toEqualTypeOf<
    These.These<string, string>
  >()
  expectTypeOf(
    These.flatMap(these, Semigroup.string, (value) => These.right(String(value))),
  ).toEqualTypeOf<These.These<string, string>>()
  expectTypeOf(
    These.zipWith(these, Semigroup.string, These.right(2), (left, right) => left + right),
  ).toEqualTypeOf<These.These<string, number>>()
})
