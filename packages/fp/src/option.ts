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
  <A, B extends A>(predicate: Refinement<A, B>): <C extends A>(value: C) => Option<B & C>
  <A>(predicate: Predicate<A>): <B extends A>(value: B) => Option<B>
} =
  <A>(predicate: Predicate<A>) =>
  (value: A): Option<A> =>
    predicate(value) ? some(value) : none

export const isSome = <A>(option: Option<A>): option is Some<A> => option._tag === 1

export const isNone = <A>(option: Option<A>): option is None => option._tag === 0

export const map: {
  <A, B>(f: (value: A) => B): (option: Option<A>) => Option<B>
} =
  <A, B>(f: (value: A) => B) =>
  (option: Option<A>): Option<B> =>
    option._tag === 1 ? some(f(option.value)) : none

export const flatMap: {
  <A, B>(f: (value: A) => Option<B>): (option: Option<A>) => Option<B>
} =
  <A, B>(f: (value: A) => Option<B>) =>
  (option: Option<A>): Option<B> =>
    isSome(option) ? f(option.value) : none

export const andThen = flatMap

export const flatten = <A>(option: Option<Option<A>>): Option<A> =>
  isSome(option) ? option.value : none

export const orElse: {
  <B>(fallback: Option<B>): <A>(option: Option<A>) => Option<A | B>
} =
  <B>(fallback: Option<B>) =>
  <A>(option: Option<A>): Option<A | B> =>
    isSome(option) ? option : fallback

export const orElseWith: {
  <B>(fallback: LazyValue<Option<B>>): <A>(option: Option<A>) => Option<A | B>
} =
  <B>(fallback: LazyValue<Option<B>>) =>
  <A>(option: Option<A>): Option<A | B> =>
    isSome(option) ? option : fallback()

export const and: {
  <B>(next: Option<B>): <A>(option: Option<A>) => Option<B>
} =
  <B>(next: Option<B>) =>
  <A>(option: Option<A>): Option<B> =>
    isSome(option) ? next : none

export const zip: {
  <B>(that: Option<B>): <A>(option: Option<A>) => Option<readonly [A, B]>
} =
  <B>(that: Option<B>) =>
  <A>(option: Option<A>): Option<readonly [A, B]> =>
    isSome(option) && isSome(that) ? some([option.value, that.value] as const) : none

export const zipWith: {
  <A, B, C>(that: Option<B>, f: (left: A, right: B) => C): (option: Option<A>) => Option<C>
} =
  <A, B, C>(that: Option<B>, f: (left: A, right: B) => C) =>
  (option: Option<A>): Option<C> =>
    isSome(option) && isSome(that) ? some(f(option.value, that.value)) : none

const sameValueZero = (left: unknown, right: unknown): boolean =>
  left === right || (left !== left && right !== right)

export const contains: {
  <A>(value: A): (option: Option<A>) => boolean
} =
  <A>(value: A) =>
  (option: Option<A>): boolean =>
    isSome(option) && sameValueZero(option.value, value)

export const containsWith =
  <A>(equals: (left: A, right: A) => boolean) =>
  (value: A) =>
  (option: Option<A>): boolean =>
    isSome(option) && equals(option.value, value)

export const exists: {
  <A>(predicate: Predicate<A>): (option: Option<A>) => boolean
} =
  <A>(predicate: Predicate<A>) =>
  (option: Option<A>): boolean =>
    isSome(option) && predicate(option.value)

export const mapNullable: {
  <A, B>(f: (value: A) => B | null | undefined): (option: Option<A>) => Option<NonNullable<B>>
} =
  <A, B>(f: (value: A) => B | null | undefined) =>
  (option: Option<A>): Option<NonNullable<B>> =>
    isSome(option) ? fromNullable(f(option.value)) : none

export const filter: {
  <A, B extends A>(predicate: Refinement<A, B>): <C extends A>(option: Option<C>) => Option<B & C>
  <A>(predicate: Predicate<A>): <B extends A>(option: Option<B>) => Option<B>
} =
  <A>(predicate: Predicate<A>) =>
  (option: Option<A>): Option<A> =>
    isSome(option) && predicate(option.value) ? option : none

export const ensure = filter

export const getOrElse: {
  <B>(onNone: LazyValue<B>): <A>(option: Option<A>) => A | B
} =
  <B>(onNone: LazyValue<B>) =>
  <A>(option: Option<A>): A | B =>
    isSome(option) ? option.value : onNone()

export const getWithDefault: {
  <B>(defaultValue: B): <A>(option: Option<A>) => A | B
} =
  <B>(defaultValue: B) =>
  <A>(option: Option<A>): A | B =>
    isSome(option) ? option.value : defaultValue

export function getOrThrow<A>(option: Option<A>): A
export function getOrThrow(onNone: LazyValue<unknown>): <A>(option: Option<A>) => A
export function getOrThrow<A>(
  optionOrError: Option<A> | LazyValue<unknown>,
): A | ((option: Option<A>) => A) {
  if (typeof optionOrError === 'function') {
    const onNone = optionOrError
    return (option: Option<A>): A => {
      if (isSome(option)) return option.value
      throw onNone()
    }
  }
  if (isSome(optionOrError)) return optionOrError.value
  throw new Error('Option is None')
}

export interface Matchers<A, B, C = B> {
  readonly none: LazyValue<B>
  readonly some: (value: A) => C
}

export const match: {
  <A, B, C>(matchers: Matchers<A, B, C>): (option: Option<A>) => B | C
} =
  <A, B, C>(matchers: Matchers<A, B, C>) =>
  (option: Option<A>): B | C =>
    isSome(option) ? matchers.some(option.value) : matchers.none()

export const tap: {
  <A>(f: (value: A) => void): (option: Option<A>) => Option<A>
} =
  <A>(f: (value: A) => void) =>
  (option: Option<A>): Option<A> => {
    if (isSome(option)) f(option.value)
    return option
  }

export const as: {
  <B>(value: B): <A>(option: Option<A>) => Option<B>
} =
  <B>(value: B) =>
  <A>(option: Option<A>): Option<B> =>
    isSome(option) ? some(value) : none

export const asVoid = <A>(option: Option<A>): Option<void> =>
  isSome(option) ? some(undefined) : none

export const ap: {
  <A, B>(fn: Option<(value: A) => B>): (option: Option<A>) => Option<B>
} =
  <A, B>(fn: Option<(value: A) => B>) =>
  (option: Option<A>): Option<B> =>
    isSome(option) && isSome(fn) ? some(fn.value(option.value)) : none

export const map2: {
  <A, B, C>(right: Option<B>, f: (left: A, right: B) => C): (left: Option<A>) => Option<C>
} = zipWith

export const lift2 =
  <A, B, C>(f: (left: A, right: B) => C) =>
  (left: Option<A>, right: Option<B>): Option<C> =>
    zipWith<A, B, C>(right, f)(left)

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
  <A, B>(f: (value: A, index: number) => Option<B>): (values: readonly A[]) => Option<B[]>
} =
  <A, B>(f: (value: A, index: number) => Option<B>) =>
  (values: readonly A[]): Option<B[]> => {
    const output: B[] = []
    for (let index = 0; index < values.length; index += 1) {
      const option = f(values[index] as A, index)
      if (isNone(option)) return none
      output.push(option.value)
    }
    return some(output)
  }

export const partitionMap: {
  <A, E, B>(f: (value: A) => Result<B, E>): (option: Option<A>) => readonly [Option<E>, Option<B>]
} =
  <A, E, B>(f: (value: A) => Result<B, E>) =>
  (option: Option<A>): readonly [Option<E>, Option<B>] => {
    if (isNone(option)) return [none, none]
    const result = f(option.value)
    return result._tag === 0 ? [some(result.error), none] : [none, some(result.value)]
  }

export const transpose = <A, E>(option: Option<Result<A, E>>): Result<Option<A>, E> => {
  if (isNone(option)) return { _tag: 1, value: none }
  const result = option.value
  return result._tag === 0 ? result : { _tag: 1, value: some(result.value) }
}

export const toNullable = <A>(option: Option<A>): A | null => (isSome(option) ? option.value : null)

export const toUndefined = <A>(option: Option<A>): A | undefined =>
  isSome(option) ? option.value : undefined

export const toResult: {
  <E>(onNone: LazyValue<E>): <A>(option: Option<A>) => Result<A, E>
} =
  <E>(onNone: LazyValue<E>) =>
  <A>(option: Option<A>): Result<A, E> =>
    isSome(option) ? { _tag: 1, value: option.value } : { _tag: 0, error: onNone() }

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
    map((value: A) => ({ [name]: value }) as { readonly [K in Name]: A })(option)

export const bind =
  <Name extends PropertyKey, A extends object, B>(
    name: Exclude<Name, keyof A>,
    f: (value: A) => Option<B>,
  ) =>
  (option: Option<A>): Option<A & { readonly [K in Name]: B }> =>
    flatMap((value: A) =>
      map(
        (bound: B) =>
          Object.assign({}, value, { [name]: bound }) as A & {
            readonly [K in Name]: B
          },
      )(f(value)),
    )(option)

const letValue =
  <Name extends PropertyKey, A extends object, B>(
    name: Exclude<Name, keyof A>,
    f: (value: A) => B,
  ) =>
  (option: Option<A>): Option<A & { readonly [K in Name]: B }> =>
    map(
      (value: A) =>
        Object.assign({}, value, { [name]: f(value) }) as A & {
          readonly [K in Name]: B
        },
    )(option)

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
