/*
 * Frozen pre-third-wave implementations. This is benchmark evidence; update
 * only when deliberately replacing the pinned baseline.
 */
import type { Monoid } from '../../../packages/fp/src/monoid'
import {
  now,
  suspend,
  type Trampoline,
} from '../../../packages/fp/src/recursion'
import {
  err,
  isErr,
  ok,
  type Result,
} from '../../../packages/fp/src/result'
import type {
  Issue,
  IssueInput,
  StandardSchemaV1,
} from '../../../packages/fp/src/schema'
import type { Writer } from '../../../packages/fp/src/writer'

export const recursionMapBefore =
  <A, B>(transform: (value: A) => B) =>
  (trampoline: Trampoline<A>): Trampoline<B> =>
    trampoline._tag === 'Now'
      ? now(transform(trampoline.value))
      : suspend(() =>
          recursionMapBefore(transform)(trampoline.thunk()),
        )

export const recursionFlatMapBefore =
  <A, B>(transform: (value: A) => Trampoline<B>) =>
  (trampoline: Trampoline<A>): Trampoline<B> =>
    trampoline._tag === 'Now'
      ? transform(trampoline.value)
      : suspend(() =>
          recursionFlatMapBefore(transform)(trampoline.thunk()),
        )

export const recursionMemoFixBefore = <A, B>(
  define: (recur: (value: A) => B, value: A) => B,
): ((value: A) => B) => {
  const cache = new Map<A, B>()
  const recur = (value: A): B => {
    if (cache.has(value)) return cache.get(value) as B
    const result = define(recur, value)
    cache.set(value, result)
    return result
  }
  return recur
}

type PropertyTag = string | number | symbol

type DiscriminantValues<
  Union,
  Key extends PropertyKey,
> = Union extends Readonly<
  Record<Key, infer Value extends PropertyTag>
>
  ? Value
  : never

type Handlers<
  Union,
  Key extends PropertyKey,
  Output,
> = {
  readonly [Value in DiscriminantValues<Union, Key>]: (
    value: Extract<Union, Readonly<Record<Key, Value>>>,
  ) => Output
}

export function matchDiscriminantBefore<
  Key extends PropertyKey,
  Union extends Readonly<Record<Key, PropertyTag>>,
  Output,
>(
  key: Key,
  value: Union,
  handlers: Handlers<Union, Key, Output>,
): Output
export function matchDiscriminantBefore<
  Key extends PropertyKey,
  Union extends Readonly<Record<Key, PropertyTag>>,
  Output,
>(
  key: Key,
  handlers: Handlers<Union, Key, Output>,
): (value: Union) => Output
export function matchDiscriminantBefore<
  Key extends PropertyKey,
  Union extends Readonly<Record<Key, PropertyTag>>,
  Output,
>(
  key: Key,
  valueOrHandlers: Union | Handlers<Union, Key, Output>,
  maybeHandlers?: Handlers<Union, Key, Output>,
): Output | ((value: Union) => Output) {
  const run = (
    value: Union,
    handlers: Handlers<Union, Key, Output>,
  ): Output => {
    const handler =
      handlers[
        value[key] as unknown as DiscriminantValues<Union, Key>
      ]
    return handler(
      value as Extract<
        Union,
        Readonly<
          Record<Key, DiscriminantValues<Union, Key>>
        >
      >,
    )
  }
  if (arguments.length === 2) {
    const handlers = valueOrHandlers as Handlers<
      Union,
      Key,
      Output
    >
    return (value: Union): Output => run(value, handlers)
  }
  return run(
    valueOrHandlers as Union,
    maybeHandlers as Handlers<Union, Key, Output>,
  )
}

type TaggedHandlers<
  Union extends { readonly _tag: PropertyTag },
  Output,
> = Handlers<Union, '_tag', Output>

export function matchTagBefore<
  Union extends { readonly _tag: PropertyTag },
  Output,
>(
  value: Union,
  handlers: TaggedHandlers<Union, Output>,
): Output
export function matchTagBefore<
  Union extends { readonly _tag: PropertyTag },
  Output,
>(
  handlers: TaggedHandlers<Union, Output>,
): (value: Union) => Output
export function matchTagBefore<
  Union extends { readonly _tag: PropertyTag },
  Output,
>(
  valueOrHandlers: Union | TaggedHandlers<Union, Output>,
  maybeHandlers?: TaggedHandlers<Union, Output>,
): Output | ((value: Union) => Output) {
  if (arguments.length === 1) {
    const handlers = valueOrHandlers as TaggedHandlers<
      Union,
      Output
    >
    return (value: Union): Output =>
      matchDiscriminantBefore('_tag', value, handlers)
  }
  return matchDiscriminantBefore(
    '_tag',
    valueOrHandlers as Union,
    maybeHandlers as TaggedHandlers<Union, Output>,
  )
}

const isPromiseLike = <A>(value: unknown): value is PromiseLike<A> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof (value as { readonly then?: unknown }).then === 'function'

const isIssue = (value: unknown): value is Issue =>
  typeof value === 'object' &&
  value !== null &&
  'message' in value &&
  typeof (value as { readonly message?: unknown }).message ===
    'string'

const normalizeIssues = (input: IssueInput): readonly Issue[] => {
  if (typeof input === 'string') return [{ message: input }]
  if (isIssue(input)) return [input]
  return input
}

const toValidationResult = <Output>(
  result: Result<Output, IssueInput>,
): StandardSchemaV1.ValidationResult<Output> =>
  isErr(result)
    ? { issues: normalizeIssues(result.error) }
    : { value: result.value }

const fromValidationResult = <Output>(
  result: StandardSchemaV1.ValidationResult<Output>,
): Result<Output, readonly Issue[]> =>
  result.issues ? err(result.issues) : ok(result.value)

const schemaDecodeBefore = <Input, Output>(
  schema: StandardSchemaV1<Input, Output>,
  value: unknown,
): Result<Output, readonly Issue[]> | Promise<Result<Output, readonly Issue[]>> => {
  const validated = schema['~standard'].validate(value)
  return isPromiseLike(validated)
    ? Promise.resolve(validated).then(fromValidationResult)
    : fromValidationResult(validated)
}

const schemaMakeBefore = <Input = unknown, Output = Input>(
  decode: (
    value: unknown,
  ) => Result<Output, IssueInput> | Promise<Result<Output, IssueInput>>,
  vendor: string,
): StandardSchemaV1<Input, Output> => ({
  '~standard': {
    version: 1,
    vendor,
    validate(value) {
      const decoded = decode(value)
      return isPromiseLike<Result<Output, IssueInput>>(decoded)
        ? Promise.resolve(decoded).then(toValidationResult)
        : toValidationResult(decoded)
    },
  },
})

export const schemaMapBefore = <Input, A, B>(
  schema: StandardSchemaV1<Input, A>,
  transform: (value: A) => B,
): StandardSchemaV1<Input, B> =>
  schemaMakeBefore(
    (value) => {
      const result = schemaDecodeBefore(schema, value)
      const transformResult = (
        decoded: Result<A, readonly Issue[]>,
      ): Result<B, readonly Issue[]> =>
        isErr(decoded) ? decoded : ok(transform(decoded.value))
      return isPromiseLike(result)
        ? Promise.resolve(result).then(transformResult)
        : transformResult(result)
    },
    schema['~standard'].vendor,
  )

const writerZipWithBefore =
  <Output>(output: Monoid<Output>) =>
  <A, B, C>(
    that: Writer<Output, B>,
    combine: (self: A, that: B) => C,
  ) =>
  (self: Writer<Output, A>): Writer<Output, C> => [
    combine(self[0], that[0]),
    output.combine(self[1], that[1]),
  ]

export const writerZipBefore =
  <Output>(output: Monoid<Output>) =>
  <B>(that: Writer<Output, B>) =>
  <A>(self: Writer<Output, A>): Writer<Output, readonly [A, B]> =>
    writerZipWithBefore(output)(
      that,
      (left: A, right: B): readonly [A, B] =>
        [left, right] as const,
    )(self)

const writerTraverseBefore =
  <Output>(output: Monoid<Output>) =>
  <A, B>(
    transform: (
      value: A,
      index: number,
    ) => Writer<Output, B>,
  ) =>
  (
    values: readonly A[],
  ): Writer<Output, readonly B[]> => {
    const result = new Array<B>(values.length)
    let written = output.empty
    for (let index = 0; index < values.length; index += 1) {
      const next = transform(values[index] as A, index)
      result[index] = next[0]
      written = output.combine(written, next[1])
    }
    return [result, written]
  }

export const writerSequenceBefore =
  <Output>(output: Monoid<Output>) =>
  <A>(
    values: readonly Writer<Output, A>[],
  ): Writer<Output, readonly A[]> =>
    writerTraverseBefore(output)(
      (value: Writer<Output, A>): Writer<Output, A> => value,
    )(values)
