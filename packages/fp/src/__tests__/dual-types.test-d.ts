import { expectTypeOf, test } from 'vite-plus/test'
import {
  dual,
  type DualOperation,
  type TaggedDataLast,
  type TaggedDualOperation,
  type TaggedUnaryOperation,
} from '../dual'

type IsAny<T> = 0 extends 1 & T ? true : false

test('dual infers data-first and data-last signatures for arities one through five', () => {
  const unary = dual(1, (value: number) => String(value))
  expectTypeOf(unary).toEqualTypeOf<(value: number) => string>()

  const binary = dual(2, (value: number, suffix: string) => `${value}${suffix}`)
  expectTypeOf(binary).toEqualTypeOf<DualOperation<number, readonly [suffix: string], string>>()
  expectTypeOf(binary(1, 'px')).toEqualTypeOf<string>()
  expectTypeOf(binary('px')).toEqualTypeOf<(data: number) => string>()

  const ternary = dual(3, (value: string, start: number, end: number) => value.slice(start, end))
  expectTypeOf(ternary).toEqualTypeOf<
    DualOperation<string, readonly [start: number, end: number], string>
  >()
  expectTypeOf(ternary(1, 3)).toEqualTypeOf<(data: string) => string>()

  const quaternary = dual(4, (value: number, a: number, b: number, c: number) => value + a + b + c)
  expectTypeOf(quaternary).toEqualTypeOf<
    DualOperation<number, readonly [a: number, b: number, c: number], number>
  >()

  const five = dual(
    5,
    (value: string, a: number, b: boolean, c: RegExp, d: Date) =>
      `${value}${a}${b}${c.source}${d.toISOString()}`,
  )
  expectTypeOf(five).toEqualTypeOf<
    DualOperation<string, readonly [a: number, b: boolean, c: RegExp, d: Date], string>
  >()
  expectTypeOf(five(1, true, /x/u, new Date())).toEqualTypeOf<(data: string) => string>()

  expectTypeOf<IsAny<typeof binary>>().toEqualTypeOf<false>()
  expectTypeOf<IsAny<ReturnType<typeof binary>>>().toEqualTypeOf<false>()

  // @ts-expect-error data-first binary calls require both arguments.
  binary(1)
  // @ts-expect-error the data-last argument retains its inferred type.
  binary(1, 2)
})

test('tagged operations expose their actual runtime metadata', () => {
  const taggedUnary = dual(1, (value: number) => -value, { op: 'negate' })
  expectTypeOf(taggedUnary).toEqualTypeOf<TaggedUnaryOperation<number, number>>()
  expectTypeOf(taggedUnary._op).toEqualTypeOf<number>()

  const taggedBinary = dual(
    2,
    (value: number, format: (value: number) => string) => format(value),
    { op: 'map' },
  )
  expectTypeOf(taggedBinary).toEqualTypeOf<
    TaggedDualOperation<number, readonly [format: (value: number) => string], string>
  >()
  const binaryDataLast = taggedBinary(String)
  expectTypeOf(binaryDataLast).toEqualTypeOf<
    TaggedDataLast<number, readonly [format: (value: number) => string], string>
  >()
  expectTypeOf(binaryDataLast._op).toEqualTypeOf<number>()
  expectTypeOf(binaryDataLast._fn).toEqualTypeOf<(value: number) => string>()
  // @ts-expect-error arity-two metadata has no second captured argument.
  void binaryDataLast._a1

  const taggedFour = dual(
    4,
    (value: string, search: RegExp, replacement: string, limit: number) =>
      `${value.replace(search, replacement)}${limit}`,
    { op: 'replace' },
  )
  const fourDataLast = taggedFour(/x/u, 'y', 2)
  expectTypeOf(fourDataLast._fn).toEqualTypeOf<RegExp>()
  expectTypeOf(fourDataLast._a1).toEqualTypeOf<string>()
  expectTypeOf(fourDataLast._a2).toEqualTypeOf<number>()

  const taggedFive = dual(
    5,
    (value: string, a: number, b: boolean, c: RegExp, d: Date) =>
      `${value}${a}${b}${c.source}${d.toISOString()}`,
    { op: 'map' },
  )
  const fiveDataLast = taggedFive(1, true, /x/u, new Date())
  expectTypeOf(fiveDataLast._fn).toEqualTypeOf<number>()
  expectTypeOf(fiveDataLast._a1).toEqualTypeOf<boolean>()
  expectTypeOf(fiveDataLast._a2).toEqualTypeOf<RegExp>()
})

test('untagged operations do not claim fusion metadata', () => {
  const operation = dual(2, (value: number, addend: number) => value + addend)
  const dataLast = operation(1)

  // @ts-expect-error untagged operations do not have an opcode.
  void dataLast._op
  // @ts-expect-error untagged operations do not expose captured arguments.
  void dataLast._fn
})

test('context and explicit type arguments cannot forge an unrelated operation', () => {
  // @ts-expect-error a contextual declaration cannot replace the numeric body contract.
  const forged: {
    (value: string, date: Date): boolean
    (date: Date): (value: string) => boolean
  } = dual(2, (value: number, addend: number) => value + addend)

  const numericBody = (value: number, addend: number): number => value + addend
  // @ts-expect-error an explicit Body argument must still match the implementation body.
  dual<(value: string, date: Date) => boolean>(2, numericBody)

  void forged
})

test('declared arity must exactly match the body parameter tuple', () => {
  // @ts-expect-error zero is not a supported public dual arity.
  dual(0, () => 'invalid')

  // @ts-expect-error arity two cannot discard a third required body parameter.
  dual(2, (data: number, a: string, b: boolean) => `${data}${a}${b}`)

  // @ts-expect-error arity three cannot invent a missing body parameter.
  dual(3, (data: number, a: string) => `${data}${a}`)

  // @ts-expect-error the generic fallback is restricted to exact arities of five or greater.
  dual(5, (data: number, a: number, b: number, c: number) => data + a + b + c)

  const fiveParameterBody = (data: number, a: number, b: number, c: number, d: number): number =>
    data + a + b + c + d
  // @ts-expect-error fallback arity remains tied to the complete body tuple.
  dual(6, fiveParameterBody)
})
