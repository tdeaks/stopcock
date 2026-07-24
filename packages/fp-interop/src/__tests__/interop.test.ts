import { describe, expect, it, vi } from 'vite-plus/test'
import * as Option from '@stopcock/fp/option'
import * as Result from '@stopcock/fp/result'
import * as Schema from '@stopcock/fp/schema'
import * as Validation from '@stopcock/fp/validation'
import {
  captureThrown,
  decodeStandardSchema,
  decodeStandardSchemaSync,
  decodeTaggedEither,
  decodeTaggedOption,
  decodeTaggedValidation,
  fromEitherLike,
  fromOptionLike,
  fromTaggedEither,
  fromTaggedOption,
  fromValidationLike,
  isStandardSchemaV1,
  optionFromAsyncIterableFirst,
  optionFromIterableFirst,
  optionFromNullable,
  optionToAsyncIterable,
  optionToIterable,
  optionToNullable,
  optionToPromise,
  optionToUndefined,
  resultFromAsyncIterableExactlyOne,
  resultFromIterableExactlyOne,
  resultFromNullable,
  resultOrThrow,
  resultToPromise,
  settlePromise,
  taggedEitherReader,
  taggedOptionReader,
  toEitherLike,
  toOptionLike,
  toValidationLike,
} from '../index'

describe('foreign Option and Either values', () => {
  it('reads caller-defined branded values without manufacturing the brand', () => {
    const brand = Symbol('foreign')
    type ForeignOption<A> =
      | { readonly kind: 'empty'; readonly [brand]: true }
      | { readonly kind: 'full'; readonly data: A; readonly [brand]: true }

    const empty: ForeignOption<number> = { kind: 'empty', [brand]: true }
    const full: ForeignOption<number> = {
      kind: 'full',
      data: 42,
      [brand]: true,
    }
    const reader = {
      read: (value: ForeignOption<number>) =>
        value.kind === 'full'
          ? { _tag: 'Some' as const, value: value.data }
          : { _tag: 'None' as const },
    }
    const constructors = {
      none: (): ForeignOption<number> => ({ kind: 'empty', [brand]: true }),
      some: (value: number): ForeignOption<number> => ({
        kind: 'full',
        data: value,
        [brand]: true,
      }),
    }

    expect(fromOptionLike(empty, reader)).toEqual(Option.none)
    expect(fromOptionLike(full, reader)).toEqual(Option.some(42))
    expect(toOptionLike(Option.some(7), constructors)).toEqual({
      kind: 'full',
      data: 7,
      [brand]: true,
    })
  })

  it('supports common fp-ts/Effect-style tagged shapes as read adapters', () => {
    const some = { _tag: 'Some' as const, value: 1 }
    const left = { _tag: 'Left' as const, left: 'bad' }
    const right = { _tag: 'Right' as const, right: 2 }

    expect(fromTaggedOption(some)).toEqual(Option.some(1))
    expect(fromOptionLike(some, taggedOptionReader())).toEqual(Option.some(1))
    expect(fromTaggedEither(left)).toEqual(Result.err('bad'))
    expect(fromTaggedEither(right)).toEqual(Result.ok(2))
    expect(fromEitherLike(right, taggedEitherReader())).toEqual(Result.ok(2))
  })

  it('uses supplied Either constructors for conversions back', () => {
    const left = vi.fn((error: string) => ({ failed: error } as const))
    const right = vi.fn((value: number) => ({ passed: value } as const))
    const constructors = { left, right }

    expect(toEitherLike(Result.ok(2), constructors)).toEqual({ passed: 2 })
    expect(toEitherLike(Result.err('no'), constructors)).toEqual({ failed: 'no' })
    expect(right).toHaveBeenCalledOnce()
    expect(left).toHaveBeenCalledOnce()
  })

  it('rejects malformed unknown tagged data before reading payloads', () => {
    expect(decodeTaggedOption({ _tag: 'Some' })._tag).toBe(0)
    expect(decodeTaggedOption({ _tag: 'Other', value: 1 })._tag).toBe(0)
    expect(decodeTaggedEither({ _tag: 'Left' })._tag).toBe(0)

    const inherited = Object.create({ _tag: 'Some', value: 1 })
    expect(decodeTaggedOption(inherited)._tag).toBe(0)

    const revoked = Proxy.revocable({ _tag: 'Some', value: 1 }, {})
    revoked.revoke()
    expect(decodeTaggedOption(revoked.proxy)._tag).toBe(0)
    expect(decodeTaggedEither(revoked.proxy)._tag).toBe(0)
  })

  it('round-trips non-empty Validation errors and rejects empty foreign errors', () => {
    const reader = taggedEitherReader<Validation.NonEmptyArray<string>, number>()
    const source = {
      _tag: 'Left' as const,
      left: ['first', 'second'] as const,
    }
    expect(fromValidationLike(source, reader)).toEqual(
      Result.err(['first', 'second']),
    )

    const foreign = toValidationLike(Validation.invalid('bad'), {
      left: (errors) => ({ _tag: 'Left' as const, left: errors }),
      right: (value) => ({ _tag: 'Right' as const, right: value }),
    })
    expect(foreign).toEqual({ _tag: 'Left', left: ['bad'] })
    expect(decodeTaggedValidation({ _tag: 'Left', left: [] })._tag).toBe(0)
    const sparseErrors: unknown[] = []
    sparseErrors.length = 1
    expect(
      decodeTaggedValidation({ _tag: 'Left', left: sparseErrors })._tag,
    ).toBe(0)
    expect(
      decodeTaggedValidation({ _tag: 'Right', right: 3 }),
    ).toEqual(Result.ok(Validation.valid(3)))
  })
})

describe('native boundaries', () => {
  it('keeps nullish conversion lazy and distinguishes null from undefined output', async () => {
    const onNullish = vi.fn(() => 'missing' as const)
    expect(optionFromNullable(null)).toEqual(Option.none)
    expect(optionFromNullable(0)).toEqual(Option.some(0))
    expect(optionToNullable(Option.none)).toBeNull()
    expect(optionToUndefined(Option.none)).toBeUndefined()
    expect(resultFromNullable(1, onNullish)).toEqual(Result.ok(1))
    expect(onNullish).not.toHaveBeenCalled()
    expect(resultFromNullable(null, onNullish)).toEqual(Result.err('missing'))
    expect(onNullish).toHaveBeenCalledOnce()

    expect(resultOrThrow(Result.ok(2), String)).toBe(2)
    expect(() =>
      resultOrThrow(Result.err('bad'), (error) => new Error(error)),
    ).toThrow('bad')
    await expect(
      optionToPromise(Option.none, () => new Error('none')),
    ).rejects.toThrow('none')
  })

  it('makes thrown and Promise rejection semantics explicit', async () => {
    const thrown = captureThrown(
      () => {
        throw new Error('boom')
      },
      (error) => (error as Error).message,
    )
    expect(thrown).toEqual(Result.err('boom'))
    expect(await settlePromise(Promise.resolve(1))).toEqual(Result.ok(1))
    expect(
      await settlePromise(Promise.reject(new Error('no')), (error) =>
        (error as Error).message,
      ),
    ).toEqual(Result.err('no'))
    await expect(
      resultToPromise(Result.err('bad'), (error) => new Error(error)),
    ).rejects.toThrow('bad')
  })

  it('names first and exactly-one iterable consumption and closes early', () => {
    let closed = 0
    function* values(): Generator<number> {
      try {
        yield 1
        yield 2
        yield 3
      } finally {
        closed++
      }
    }

    expect(optionFromIterableFirst(values())).toEqual(Option.some(1))
    expect(closed).toBe(1)
    expect(
      resultFromIterableExactlyOne([], () => 'empty', () => 'many'),
    ).toEqual(Result.err('empty'))
    expect(
      resultFromIterableExactlyOne([1], () => 'empty', () => 'many'),
    ).toEqual(Result.ok(1))
    expect(
      resultFromIterableExactlyOne(values(), () => 'empty', () => 'many'),
    ).toEqual(Result.err('many'))
    expect(closed).toBe(2)
    expect([...optionToIterable(Option.none)]).toEqual([])
    expect([...optionToIterable(Option.some(3))]).toEqual([3])
  })

  it('provides the same explicit semantics for async iterables', async () => {
    let closed = 0
    async function* values(): AsyncGenerator<number> {
      try {
        yield 1
        yield 2
      } finally {
        closed++
      }
    }

    expect(await optionFromAsyncIterableFirst(values())).toEqual(Option.some(1))
    expect(closed).toBe(1)
    expect(
      await resultFromAsyncIterableExactlyOne(
        values(),
        () => 'empty',
        () => 'many',
      ),
    ).toEqual(Result.err('many'))
    expect(closed).toBe(2)

    const output: number[] = []
    for await (const value of optionToAsyncIterable(Option.some(3))) {
      output.push(value)
    }
    expect(output).toEqual([3])
  })
})

describe('Standard Schema delegation', () => {
  it('uses the fp schema implementation directly', async () => {
    expect(decodeStandardSchema).toBe(Schema.validate)
    expect(decodeStandardSchemaSync).toBe(Schema.validateSync)

    const positive = Schema.fromPredicate(
      (value: unknown): value is number =>
        typeof value === 'number' && value > 0,
      () => 'Expected a positive number',
    )
    expect(isStandardSchemaV1(positive)).toBe(true)
    expect(decodeStandardSchemaSync(1, positive)).toEqual(Result.ok(1))
    expect((await decodeStandardSchema(-1, positive))._tag).toBe(0)

    const asynchronous = Schema.make(async (value) => Result.ok(String(value)))
    await expect(decodeStandardSchema(1, asynchronous)).resolves.toEqual(
      Result.ok('1'),
    )
    expect(() => decodeStandardSchemaSync(1, asynchronous)).toThrow(
      'schema validation returned a Promise',
    )
  })
})
