import { none, some, type Option } from '@stopcock/fp/option'
import { err, ok, type Result } from '@stopcock/fp/result'
import { hasOwn, isObject } from './internal'

/**
 * A neutral view returned by a caller-owned reader.
 *
 * Foreign brands are only consumed by the reader. The interop package never
 * pretends that one of its own objects is a value owned by another library.
 */
export type OptionLikeView<A> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Some'; readonly value: A }

export interface OptionLikeReader<Foreign, A> {
  readonly read: (value: Foreign) => OptionLikeView<A>
}

export interface OptionLikeConstructors<A, Foreign> {
  readonly none: () => Foreign
  readonly some: (value: A) => Foreign
}

type OptionLikeValue<View> =
  View extends { readonly _tag: 'Some'; readonly value: infer A }
    ? A
    : never

export function fromOptionLike<
  Foreign,
  View extends OptionLikeView<unknown>,
>(
  value: Foreign,
  reader: { readonly read: (value: Foreign) => View },
): Option<OptionLikeValue<View>> {
  const view = reader.read(value)
  return view._tag === 'Some'
    ? some(view.value as OptionLikeValue<View>)
    : none
}

export function toOptionLike<A, Foreign>(
  value: Option<A>,
  constructors: OptionLikeConstructors<A, Foreign>,
): Foreign {
  return value._tag === 1
    ? constructors.some(value.value)
    : constructors.none()
}

/**
 * The shared runtime shape used by fp-ts Option and Effect Option.
 * This is a read-only structural contract, not either library's branded type.
 */
export type TaggedOptionLike<A> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Some'; readonly value: A }

export const taggedOptionReader = <A>(): OptionLikeReader<
  TaggedOptionLike<A>,
  A
> => ({
  read: (value) =>
    value._tag === 'Some'
      ? { _tag: 'Some', value: value.value }
      : { _tag: 'None' },
})

export function fromTaggedOption<A>(value: TaggedOptionLike<A>): Option<A> {
  return value._tag === 'Some' ? some(value.value) : none
}

export function toTaggedOptionWith<A, Foreign>(
  value: Option<A>,
  constructors: OptionLikeConstructors<A, Foreign>,
): Foreign {
  return toOptionLike(value, constructors)
}

export interface TaggedOptionDecodeError {
  readonly _tag: 'TaggedOptionDecodeError'
  readonly message: string
}

const taggedOptionError = (message: string): TaggedOptionDecodeError => ({
  _tag: 'TaggedOptionDecodeError',
  message,
})

/**
 * Safely reads an untrusted fp-ts/Effect-style Option shape.
 *
 * The payload stays `unknown`; callers can decode it separately when the
 * boundary also needs domain validation.
 */
export function decodeTaggedOption(
  input: unknown,
): Result<Option<unknown>, TaggedOptionDecodeError> {
  try {
    if (!isObject(input) || !hasOwn(input, '_tag')) {
      return err(taggedOptionError('Expected an object with an own _tag property'))
    }

    const tag = (input as { readonly _tag?: unknown })._tag
    if (tag === 'None') return ok(none)
    if (tag !== 'Some') {
      return err(taggedOptionError('Expected _tag to be "None" or "Some"'))
    }
    if (!hasOwn(input, 'value')) {
      return err(taggedOptionError('Expected Some to contain an own value property'))
    }

    return ok(some((input as { readonly value?: unknown }).value))
  } catch {
    return err(taggedOptionError('Inspecting the tagged Option value threw'))
  }
}
