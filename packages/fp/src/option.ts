import { dual } from './dual-untagged'
import type { Predicate, Refinement } from './guard'
import type { Result } from './result'
import type { LazyValue } from './types'

export type None = { readonly _tag: 0 }
export type Some<A> = { readonly _tag: 1; readonly value: A }
export type Option<A> = None | Some<A>

export const none: None = /* @__PURE__ */ Object.freeze({ _tag: 0 })

export const some = <A>(value: A): Some<A> => ({ _tag: 1, value })

export const fromNullable = <A>(value: A | null | undefined): Option<NonNullable<A>> =>
  value == null ? none : some(value as NonNullable<A>)

export const fromPredicate: {
  <A, B extends A>(value: A, predicate: Refinement<A, B>): Option<B>
  <A>(value: A, predicate: Predicate<A>): Option<A>
  <A, B extends A>(predicate: Refinement<A, B>): <C extends A>(value: C) => Option<B & C>
  <A>(predicate: Predicate<A>): <B extends A>(value: B) => Option<B>
} = /* @__PURE__ */ dual(2,
  <A>(value: A, predicate: Predicate<A>): Option<A> => (predicate(value) ? some(value) : none),
)

export const isSome = <A>(option: Option<A>): option is Some<A> => option._tag === 1

export const isNone = <A>(option: Option<A>): option is None => option._tag === 0

export const map: {
  <A, B>(option: Option<A>, f: (value: A) => B): Option<B>
  <A, B>(f: (value: A) => B): (option: Option<A>) => Option<B>
} = /* @__PURE__ */ dual(2,
  <A, B>(option: Option<A>, f: (value: A) => B): Option<B> =>
    option._tag === 1 ? some(f(option.value)) : none,
)

export const flatMap: {
  <A, B>(option: Option<A>, f: (value: A) => Option<B>): Option<B>
  <A, B>(f: (value: A) => Option<B>): (option: Option<A>) => Option<B>
} = /* @__PURE__ */ dual(2,
  <A, B>(option: Option<A>, f: (value: A) => Option<B>): Option<B> =>
    isSome(option) ? f(option.value) : none,
)

export const andThen = flatMap

export const flatten = <A>(option: Option<Option<A>>): Option<A> =>
  isSome(option) ? option.value : none

export const orElse: {
  <A, B>(option: Option<A>, fallback: Option<B>): Option<A | B>
  <B>(fallback: Option<B>): <A>(option: Option<A>) => Option<A | B>
} = /* @__PURE__ */ dual(2,
  <A, B>(option: Option<A>, fallback: Option<B>): Option<A | B> =>
    isSome(option) ? option : fallback,
)

export const orElseWith: {
  <A, B>(option: Option<A>, fallback: LazyValue<Option<B>>): Option<A | B>
  <B>(fallback: LazyValue<Option<B>>): <A>(option: Option<A>) => Option<A | B>
} = /* @__PURE__ */ dual(2,
  <A, B>(option: Option<A>, fallback: LazyValue<Option<B>>): Option<A | B> =>
    isSome(option) ? option : fallback(),
)

export const and: {
  <A, B>(option: Option<A>, next: Option<B>): Option<B>
  <B>(next: Option<B>): <A>(option: Option<A>) => Option<B>
} = /* @__PURE__ */ dual(2,
  <A, B>(option: Option<A>, next: Option<B>): Option<B> => (isSome(option) ? next : none),
)

export const zip: {
  <A, B>(option: Option<A>, that: Option<B>): Option<readonly [A, B]>
  <B>(that: Option<B>): <A>(option: Option<A>) => Option<readonly [A, B]>
} = /* @__PURE__ */ dual(2,
  <A, B>(option: Option<A>, that: Option<B>): Option<readonly [A, B]> =>
    isSome(option) && isSome(that) ? some([option.value, that.value] as const) : none,
)

export const zipWith: {
  <A, B, C>(option: Option<A>, that: Option<B>, f: (left: A, right: B) => C): Option<C>
  <A, B, C>(that: Option<B>, f: (left: A, right: B) => C): (option: Option<A>) => Option<C>
} = /* @__PURE__ */ dual(3,
  <A, B, C>(option: Option<A>, that: Option<B>, f: (left: A, right: B) => C): Option<C> =>
    isSome(option) && isSome(that) ? some(f(option.value, that.value)) : none,
)

const sameValueZero = (left: unknown, right: unknown): boolean =>
  left === right || (left !== left && right !== right)

export const contains: {
  <A>(option: Option<A>, value: A): boolean
  <A>(value: A): (option: Option<A>) => boolean
} = /* @__PURE__ */ dual(2,
  <A>(option: Option<A>, value: A): boolean => isSome(option) && sameValueZero(option.value, value),
)

export const containsWith =
  <A>(equals: (left: A, right: A) => boolean) =>
  (value: A) =>
  (option: Option<A>): boolean =>
    isSome(option) && equals(option.value, value)

export const exists: {
  <A>(option: Option<A>, predicate: Predicate<A>): boolean
  <A>(predicate: Predicate<A>): (option: Option<A>) => boolean
} = /* @__PURE__ */ dual(2,
  <A>(option: Option<A>, predicate: Predicate<A>): boolean =>
    isSome(option) && predicate(option.value),
)

export const mapNullable: {
  <A, B>(option: Option<A>, f: (value: A) => B | null | undefined): Option<NonNullable<B>>
  <A, B>(f: (value: A) => B | null | undefined): (option: Option<A>) => Option<NonNullable<B>>
} = /* @__PURE__ */ dual(2,
  <A, B>(option: Option<A>, f: (value: A) => B | null | undefined): Option<NonNullable<B>> =>
    isSome(option) ? fromNullable(f(option.value)) : none,
)

export const filter: {
  <A, B extends A>(option: Option<A>, predicate: Refinement<A, B>): Option<B>
  <A>(option: Option<A>, predicate: Predicate<A>): Option<A>
  <A, B extends A>(predicate: Refinement<A, B>): <C extends A>(option: Option<C>) => Option<B & C>
  <A>(predicate: Predicate<A>): <B extends A>(option: Option<B>) => Option<B>
} = /* @__PURE__ */ dual(2,
  <A>(option: Option<A>, predicate: Predicate<A>): Option<A> =>
    isSome(option) && predicate(option.value) ? option : none,
)

export const ensure = filter

export const getOrElse: {
  <A, B>(option: Option<A>, onNone: LazyValue<B>): A | B
  <B>(onNone: LazyValue<B>): <A>(option: Option<A>) => A | B
} = /* @__PURE__ */ dual(2, <A, B>(option: Option<A>, onNone: LazyValue<B>): A | B =>
  isSome(option) ? option.value : onNone(),
)

export const getWithDefault: {
  <A, B>(option: Option<A>, defaultValue: B): A | B
  <B>(defaultValue: B): <A>(option: Option<A>) => A | B
} = /* @__PURE__ */ dual(2, <A, B>(option: Option<A>, defaultValue: B): A | B =>
  isSome(option) ? option.value : defaultValue,
)

export function getOrThrow<A>(option: Option<A>): A
export function getOrThrow<A>(option: Option<A>, onNone: LazyValue<unknown>): A
export function getOrThrow(onNone: LazyValue<unknown>): <A>(option: Option<A>) => A
export function getOrThrow<A>(
  optionOrError: Option<A> | LazyValue<unknown>,
  onNone: LazyValue<unknown> = () => new Error('Option is None'),
): A | ((option: Option<A>) => A) {
  if (typeof optionOrError === 'function') {
    return (option: Option<A>): A => getOrThrow(option, optionOrError)
  }
  if (isSome(optionOrError)) return optionOrError.value
  throw onNone()
}

export interface Matchers<A, B, C = B> {
  readonly none: LazyValue<B>
  readonly some: (value: A) => C
}

export const match: {
  <A, B, C>(option: Option<A>, matchers: Matchers<A, B, C>): B | C
  <A, B, C>(matchers: Matchers<A, B, C>): (option: Option<A>) => B | C
} = /* @__PURE__ */ dual(2,
  <A, B, C>(option: Option<A>, matchers: Matchers<A, B, C>): B | C =>
    isSome(option) ? matchers.some(option.value) : matchers.none(),
)

export const tap: {
  <A>(option: Option<A>, f: (value: A) => void): Option<A>
  <A>(f: (value: A) => void): (option: Option<A>) => Option<A>
} = /* @__PURE__ */ dual(2, <A>(option: Option<A>, f: (value: A) => void): Option<A> => {
  if (isSome(option)) f(option.value)
  return option
})

export const as: {
  <A, B>(option: Option<A>, value: B): Option<B>
  <B>(value: B): <A>(option: Option<A>) => Option<B>
} = /* @__PURE__ */ dual(2,
  <A, B>(option: Option<A>, value: B): Option<B> => (isSome(option) ? some(value) : none),
)

export const asVoid = <A>(option: Option<A>): Option<void> =>
  isSome(option) ? some(undefined) : none

export const ap: {
  <A, B>(option: Option<A>, fn: Option<(value: A) => B>): Option<B>
  <A, B>(fn: Option<(value: A) => B>): (option: Option<A>) => Option<B>
} = /* @__PURE__ */ dual(2,
  <A, B>(option: Option<A>, fn: Option<(value: A) => B>): Option<B> =>
    isSome(option) && isSome(fn) ? some(fn.value(option.value)) : none,
)

export const map2: {
  <A, B, C>(left: Option<A>, right: Option<B>, f: (left: A, right: B) => C): Option<C>
  <A, B, C>(right: Option<B>, f: (left: A, right: B) => C): (left: Option<A>) => Option<C>
} = zipWith

export const lift2 =
  <A, B, C>(f: (left: A, right: B) => C) =>
  (left: Option<A>, right: Option<B>): Option<C> =>
    zipWith(left, right, f)

type OptionValue<T> = T extends Option<infer A> ? A : never
type OptionValues<T extends readonly Option<unknown>[]> = {
  -readonly [K in keyof T]: OptionValue<T[K]>
}

export function all<const T extends readonly Option<unknown>[]>(options: T): Option<OptionValues<T>>
export function all(options: readonly Option<unknown>[]): Option<unknown[]> {
  const values: unknown[] = []
  for (const option of options) {
    if (isNone(option)) return none
    values.push(option.value)
  }
  return some(values)
}

export const tuple: typeof all = all
export const sequence: typeof all = all

export function struct<const T extends Readonly<Record<PropertyKey, Option<unknown>>>>(
  fields: T,
): Option<{ -readonly [K in keyof T]: OptionValue<T[K]> }> {
  const output: Record<PropertyKey, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(fields)) {
    if (!Object.prototype.propertyIsEnumerable.call(fields, key)) continue
    const option = fields[key]
    if (isNone(option)) return none
    output[key] = option.value
  }
  return some(output as { -readonly [K in keyof T]: OptionValue<T[K]> })
}

export const traverse: {
  <A, B>(values: readonly A[], f: (value: A, index: number) => Option<B>): Option<B[]>
  <A, B>(f: (value: A, index: number) => Option<B>): (values: readonly A[]) => Option<B[]>
} = /* @__PURE__ */ dual(2,
  <A, B>(values: readonly A[], f: (value: A, index: number) => Option<B>): Option<B[]> => {
    const output: B[] = []
    for (let index = 0; index < values.length; index += 1) {
      const option = f(values[index] as A, index)
      if (isNone(option)) return none
      output.push(option.value)
    }
    return some(output)
  },
)

export const partitionMap: {
  <A, E, B>(option: Option<A>, f: (value: A) => Result<B, E>): readonly [Option<E>, Option<B>]
  <A, E, B>(f: (value: A) => Result<B, E>): (option: Option<A>) => readonly [Option<E>, Option<B>]
} = /* @__PURE__ */ dual(2,
  <A, E, B>(option: Option<A>, f: (value: A) => Result<B, E>): readonly [Option<E>, Option<B>] => {
    if (isNone(option)) return [none, none]
    const result = f(option.value)
    return result._tag === 0 ? [some(result.error), none] : [none, some(result.value)]
  },
)

export const transpose = <A, E>(option: Option<Result<A, E>>): Result<Option<A>, E> => {
  if (isNone(option)) return { _tag: 1, value: none }
  const result = option.value
  return result._tag === 0 ? result : { _tag: 1, value: some(result.value) }
}

export const toNullable = <A>(option: Option<A>): A | null => (isSome(option) ? option.value : null)

export const toUndefined = <A>(option: Option<A>): A | undefined =>
  isSome(option) ? option.value : undefined

export const toResult: {
  <A, E>(option: Option<A>, onNone: LazyValue<E>): Result<A, E>
  <E>(onNone: LazyValue<E>): <A>(option: Option<A>) => Result<A, E>
} = /* @__PURE__ */ dual(2,
  <A, E>(option: Option<A>, onNone: LazyValue<E>): Result<A, E> =>
    isSome(option) ? { _tag: 1, value: option.value } : { _tag: 0, error: onNone() },
)

export const liftNullable =
  <Args extends readonly unknown[], A>(fn: (...args: Args) => A | null | undefined) =>
  (...args: Args): Option<NonNullable<A>> =>
    fromNullable(fn(...args))

export const liftThrowable =
  <Args extends readonly unknown[], A>(fn: (...args: Args) => A) =>
  (...args: Args): Option<A> => {
    try {
      return some(fn(...args))
    } catch {
      return none
    }
  }

export const bindTo =
  <Name extends PropertyKey>(name: Name) =>
  <A>(option: Option<A>): Option<{ readonly [K in Name]: A }> =>
    map(option, (value) => ({ [name]: value }) as { readonly [K in Name]: A })

export const bind =
  <Name extends PropertyKey, A extends object, B>(
    name: Exclude<Name, keyof A>,
    f: (value: A) => Option<B>,
  ) =>
  (option: Option<A>): Option<A & { readonly [K in Name]: B }> =>
    flatMap(option, (value) =>
      map(
        f(value),
        (bound) =>
          Object.assign({}, value, { [name]: bound }) as A & {
            readonly [K in Name]: B
          },
      ),
    )

const letValue =
  <Name extends PropertyKey, A extends object, B>(
    name: Exclude<Name, keyof A>,
    f: (value: A) => B,
  ) =>
  (option: Option<A>): Option<A & { readonly [K in Name]: B }> =>
    map(
      option,
      (value) =>
        Object.assign({}, value, { [name]: f(value) }) as A & {
          readonly [K in Name]: B
        },
    )

export { letValue as let }

export const Do: Option<Record<never, never>> = some({})

export function gen<A>(make: () => Generator<Option<unknown>, A, unknown>): Option<A> {
  const iterator = make()
  let state = iterator.next()
  while (!state.done) {
    if (isNone(state.value)) {
      iterator.return?.(undefined as A)
      return none
    }
    state = iterator.next(state.value.value)
  }
  return some(state.value)
}
