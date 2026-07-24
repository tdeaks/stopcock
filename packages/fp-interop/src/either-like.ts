import {
  valid,
  type NonEmptyArray,
  type Validation,
} from '@stopcock/fp/validation'
import { err, ok, type Result } from '@stopcock/fp/result'
import { hasOwn, isObject } from './internal'

export type EitherLikeView<E, A> =
  | { readonly _tag: 'Left'; readonly left: E }
  | { readonly _tag: 'Right'; readonly right: A }

export interface EitherLikeReader<Foreign, E, A> {
  readonly read: (value: Foreign) => EitherLikeView<E, A>
}

export interface EitherLikeConstructors<E, A, Foreign> {
  readonly left: (error: E) => Foreign
  readonly right: (value: A) => Foreign
}

type EitherLikeError<View> =
  View extends { readonly _tag: 'Left'; readonly left: infer E }
    ? E
    : never

type EitherLikeValue<View> =
  View extends { readonly _tag: 'Right'; readonly right: infer A }
    ? A
    : never

export function fromEitherLike<
  Foreign,
  View extends EitherLikeView<unknown, unknown>,
>(
  value: Foreign,
  reader: { readonly read: (value: Foreign) => View },
): Result<EitherLikeValue<View>, EitherLikeError<View>> {
  const view = reader.read(value)
  return view._tag === 'Right'
    ? ok(view.right as EitherLikeValue<View>)
    : err(view.left as EitherLikeError<View>)
}

export function toEitherLike<A, E, Foreign>(
  value: Result<A, E>,
  constructors: EitherLikeConstructors<E, A, Foreign>,
): Foreign {
  return value._tag === 1
    ? constructors.right(value.value)
    : constructors.left(value.error)
}

/**
 * The shared runtime shape used by fp-ts Either and Effect Either.
 * It is intentionally structural and read-only.
 */
export type TaggedEitherLike<E, A> =
  | { readonly _tag: 'Left'; readonly left: E }
  | { readonly _tag: 'Right'; readonly right: A }

export const taggedEitherReader = <E, A>(): EitherLikeReader<
  TaggedEitherLike<E, A>,
  E,
  A
> => ({
  read: (value) =>
    value._tag === 'Right'
      ? { _tag: 'Right', right: value.right }
      : { _tag: 'Left', left: value.left },
})

export function fromTaggedEither<E, A>(
  value: TaggedEitherLike<E, A>,
): Result<A, E> {
  return value._tag === 'Right' ? ok(value.right) : err(value.left)
}

export function toTaggedEitherWith<A, E, Foreign>(
  value: Result<A, E>,
  constructors: EitherLikeConstructors<E, A, Foreign>,
): Foreign {
  return toEitherLike(value, constructors)
}

export function fromValidationLike<Foreign, E, A>(
  value: Foreign,
  reader: EitherLikeReader<Foreign, NonEmptyArray<E>, A>,
): Validation<A, E> {
  const view = reader.read(value)
  if (view._tag === 'Right') return valid(view.right)
  const [head, ...tail] = view.left
  return {
    _tag: 0,
    error: [head, ...tail],
  }
}

export function toValidationLike<A, E, Foreign>(
  value: Validation<A, E>,
  constructors: EitherLikeConstructors<NonEmptyArray<E>, A, Foreign>,
): Foreign {
  return value._tag === 1
    ? constructors.right(value.value)
    : constructors.left(value.error)
}

export interface TaggedEitherDecodeError {
  readonly _tag: 'TaggedEitherDecodeError'
  readonly message: string
}

const taggedEitherError = (message: string): TaggedEitherDecodeError => ({
  _tag: 'TaggedEitherDecodeError',
  message,
})

export function decodeTaggedEither(
  input: unknown,
): Result<Result<unknown, unknown>, TaggedEitherDecodeError> {
  try {
    if (!isObject(input) || !hasOwn(input, '_tag')) {
      return err(taggedEitherError('Expected an object with an own _tag property'))
    }

    const tag = (input as { readonly _tag?: unknown })._tag
    if (tag === 'Left') {
      if (!hasOwn(input, 'left')) {
        return err(taggedEitherError('Expected Left to contain an own left property'))
      }
      return ok(err((input as { readonly left?: unknown }).left))
    }
    if (tag === 'Right') {
      if (!hasOwn(input, 'right')) {
        return err(taggedEitherError('Expected Right to contain an own right property'))
      }
      return ok(ok((input as { readonly right?: unknown }).right))
    }
    return err(taggedEitherError('Expected _tag to be "Left" or "Right"'))
  } catch {
    return err(taggedEitherError('Inspecting the tagged Either value threw'))
  }
}

export interface ValidationDecodeError {
  readonly _tag: 'ValidationDecodeError'
  readonly message: string
}

/**
 * Converts a structurally read Either into Validation while rejecting an empty
 * Left collection instead of fabricating a NonEmptyArray type.
 */
export function decodeTaggedValidation(
  input: unknown,
): Result<Validation<unknown, unknown>, TaggedEitherDecodeError | ValidationDecodeError> {
  const decoded = decodeTaggedEither(input)
  if (decoded._tag === 0) return decoded
  if (decoded.value._tag === 1) return ok(valid(decoded.value.value))

  const errors = decoded.value.error
  let isNonEmptyArray: boolean
  try {
    if (!Array.isArray(errors) || errors.length === 0) {
      isNonEmptyArray = false
    } else {
      isNonEmptyArray = true
      for (let index = 0; index < errors.length; index++) {
        if (!hasOwn(errors, index)) {
          isNonEmptyArray = false
          break
        }
      }
    }
  } catch {
    isNonEmptyArray = false
  }
  if (!isNonEmptyArray) {
    return err({
      _tag: 'ValidationDecodeError',
      message: 'Expected Left to contain a non-empty error array',
    })
  }
  try {
    const [head, ...tail] = errors as unknown[]
    return ok({ _tag: 0, error: [head, ...tail] })
  } catch {
    return err({
      _tag: 'ValidationDecodeError',
      message: 'Reading the foreign error array threw',
    })
  }
}
