import { expectTypeOf, test } from 'vite-plus/test'
import type { Option } from '@stopcock/fp/option'
import { none, some } from '@stopcock/fp/option'
import type { Result } from '@stopcock/fp/result'
import { err, ok } from '@stopcock/fp/result'
import * as Schema from '@stopcock/fp/schema'
import {
  decodeOptionWire,
  decodeStandardSchemaSync,
  fromEitherLike,
  fromOptionLike,
  fromTaggedEither,
  fromTaggedOption,
  resultFromIterableExactlyOne,
  settlePromise,
  toEitherLike,
  toOptionLike,
  type WireDecodeError,
} from '..'
import { liftNodeCallback } from '../node'

declare const foreignOptionBrand: unique symbol

test('constructor-driven adapters preserve foreign brands', () => {
  type ForeignOption<A> =
    | { readonly kind: 'none'; readonly [foreignOptionBrand]: 'option' }
    | {
        readonly kind: 'some'
        readonly value: A
        readonly [foreignOptionBrand]: 'option'
      }

  const constructors = {
    none: (): ForeignOption<number> => ({
      kind: 'none',
      [foreignOptionBrand]: 'option',
    }),
    some: (value: number): ForeignOption<number> => ({
      kind: 'some',
      value,
      [foreignOptionBrand]: 'option',
    }),
  }
  const foreign = toOptionLike(some(1), constructors)
  expectTypeOf(foreign).toEqualTypeOf<ForeignOption<number>>()

  const local = fromOptionLike(foreign, {
    read: (value) =>
      value.kind === 'some'
        ? { _tag: 'Some' as const, value: value.value }
        : { _tag: 'None' as const },
  })
  expectTypeOf(local).toEqualTypeOf<Option<number>>()

  // A foreign value cannot be created without the library-owned constructors.
  // @ts-expect-error none is required and there is no structural fallback.
  toOptionLike(none, { some: (value: never) => value })
})

test('Either adapters preserve both channels', () => {
  type ForeignEither<E, A> =
    | { readonly kind: 'failure'; readonly cause: E }
    | { readonly kind: 'success'; readonly data: A }

  const foreign = toEitherLike(ok(1) as Result<number, string>, {
    left: (cause): ForeignEither<string, number> => ({
      kind: 'failure',
      cause,
    }),
    right: (data): ForeignEither<string, number> => ({
      kind: 'success',
      data,
    }),
  })
  expectTypeOf(foreign).toEqualTypeOf<ForeignEither<string, number>>()

  const local = fromEitherLike(foreign, {
    read: (value) =>
      value.kind === 'success'
        ? { _tag: 'Right' as const, right: value.data }
        : { _tag: 'Left' as const, left: value.cause },
  })
  expectTypeOf(local).toEqualTypeOf<Result<number, string>>()

  expectTypeOf(
    fromTaggedOption({ _tag: 'Some', value: 1 }),
  ).toEqualTypeOf<Option<number>>()
  expectTypeOf(
    fromTaggedEither({ _tag: 'Left', left: 'bad' } as
      | { readonly _tag: 'Left'; readonly left: string }
      | { readonly _tag: 'Right'; readonly right: number }),
  ).toEqualTypeOf<Result<number, string>>()
})

test('native and wire boundaries retain explicit failures', async () => {
  const settled = await settlePromise(
    Promise.resolve(1),
    (reason) => String(reason),
  )
  expectTypeOf(settled).toEqualTypeOf<Result<number, string>>()

  const exactlyOne = resultFromIterableExactlyOne(
    [1],
    () => 'empty' as const,
    () => 'many' as const,
  )
  expectTypeOf(exactlyOne).toEqualTypeOf<
    Result<number, 'empty' | 'many'>
  >()

  const decoded = decodeOptionWire(
    { _tag: 'Some', value: 1 },
    (input): Result<number, 'not-number'> =>
      typeof input === 'number' ? ok(input) : err('not-number'),
  )
  expectTypeOf(decoded).toEqualTypeOf<
    Result<Option<number>, WireDecodeError<'not-number'>>
  >()
})

test('Standard Schema and Node callback adapters infer outputs', () => {
  const schema = Schema.fromPredicate(
    (value: unknown): value is string => typeof value === 'string',
  )
  expectTypeOf(
    decodeStandardSchemaSync(schema)('value'),
  ).toEqualTypeOf<Result<string, readonly Schema.Issue[]>>()

  const read = liftNodeCallback(
    (
      path: string,
      callback: (error: unknown, value: Uint8Array) => void,
    ) => callback(null, new Uint8Array(path.length)),
    (error) => String(error),
  )
  expectTypeOf(read).toEqualTypeOf<
    (path: string) => Promise<Result<Uint8Array, string>>
  >()
})
