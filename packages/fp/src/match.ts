type PropertyTag = string | number | symbol

type DiscriminantValues<
  Union,
  Key extends PropertyKey,
> = Union extends Readonly<Record<Key, infer Value extends PropertyTag>> ? Value : never

export type Handlers<
  Union,
  Key extends PropertyKey,
  Output,
> = {
  readonly [Value in DiscriminantValues<Union, Key>]: (
    value: Extract<Union, Readonly<Record<Key, Value>>>,
  ) => Output
}

const runDiscriminant = <
  Key extends PropertyKey,
  Union extends Readonly<Record<Key, PropertyTag>>,
  Output,
>(
  key: Key,
  value: Union,
  handlers: Handlers<Union, Key, Output>,
): Output => {
  const handler =
    handlers[value[key] as unknown as DiscriminantValues<Union, Key>]
  return handler(
    value as Extract<
      Union,
      Readonly<Record<Key, DiscriminantValues<Union, Key>>>
    >,
  )
}

export function discriminant<
  Key extends PropertyKey,
  Union extends Readonly<Record<Key, PropertyTag>>,
  Output,
>(
  key: Key,
  value: Union,
  handlers: Handlers<Union, Key, Output>,
): Output
export function discriminant<
  Key extends PropertyKey,
  Union extends Readonly<Record<Key, PropertyTag>>,
  Output,
>(
  key: Key,
  handlers: Handlers<Union, Key, Output>,
): (value: Union) => Output
export function discriminant<
  Key extends PropertyKey,
  Union extends Readonly<Record<Key, PropertyTag>>,
  Output,
>(
  key: Key,
  valueOrHandlers: Union | Handlers<Union, Key, Output>,
  maybeHandlers?: Handlers<Union, Key, Output>,
): Output | ((value: Union) => Output) {
  if (arguments.length === 2) {
    const handlers = valueOrHandlers as Handlers<Union, Key, Output>
    return (value: Union): Output =>
      runDiscriminant(key, value, handlers)
  }
  return runDiscriminant(
    key,
    valueOrHandlers as Union,
    maybeHandlers as Handlers<Union, Key, Output>,
  )
}

export type TaggedHandlers<
  Union extends { readonly _tag: PropertyTag },
  Output,
> = Handlers<Union, '_tag', Output>

export function tag<
  Union extends { readonly _tag: PropertyTag },
  Output,
>(value: Union, handlers: TaggedHandlers<Union, Output>): Output
export function tag<
  Union extends { readonly _tag: PropertyTag },
  Output,
>(handlers: TaggedHandlers<Union, Output>): (value: Union) => Output
export function tag<
  Union extends { readonly _tag: PropertyTag },
  Output,
>(
  valueOrHandlers: Union | TaggedHandlers<Union, Output>,
  maybeHandlers?: TaggedHandlers<Union, Output>,
): Output | ((value: Union) => Output) {
  if (arguments.length === 1) {
    const handlers = valueOrHandlers as TaggedHandlers<Union, Output>
    return (value: Union): Output =>
      runDiscriminant('_tag', value, handlers)
  }
  return runDiscriminant(
    '_tag',
    valueOrHandlers as Union,
    maybeHandlers as TaggedHandlers<Union, Output>,
  )
}

export const exhaustive = (value: never): never => {
  throw new TypeError(`Unmatched value: ${String(value)}`)
}

export const value =
  <const Cases extends Readonly<Record<PropertyTag, unknown>>, Output>(
    cases: { readonly [Key in keyof Cases]: (value: Key) => Output },
    otherwise?: (value: PropertyTag) => Output,
  ) =>
  (input: keyof Cases): Output => {
    const handler = cases[input]
    if (handler) return handler(input)
    if (otherwise) return otherwise(input)
    return exhaustive(input as never)
  }
