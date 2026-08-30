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
} = function fromPredicate<A>(predicate: Predicate<A>, __df?: any): any {
  if (arguments.length >= 2) return (fromPredicate as any)(__df)(predicate)
  return (value: A): Option<A> =>
    predicate(value) ? some(value) : none
} as any

export const isSome = <A>(option: Option<A>): option is Some<A> => option._tag === 1

export const isNone = <A>(option: Option<A>): option is None => option._tag === 0

export const map: {
  <A, B>(option: Option<A>, f: (value: A) => B): Option<B>
  <A, B>(f: (value: A) => B): (option: Option<A>) => Option<B>
} = function map<A, B>(f: (value: A) => B, __df?: any): any {
  if (arguments.length >= 2) return (map as any)(__df)(f)
  return (option: Option<A>): Option<B> =>
    option._tag === 1 ? some(f(option.value)) : none
} as any

export const flatMap: {
  <A, B>(option: Option<A>, f: (value: A) => Option<B>): Option<B>
  <A, B>(f: (value: A) => Option<B>): (option: Option<A>) => Option<B>
} = function flatMap<A, B>(f: (value: A) => Option<B>, __df?: any): any {
  if (arguments.length >= 2) return (flatMap as any)(__df)(f)
  return (option: Option<A>): Option<B> =>
    isSome(option) ? f(option.value) : none
} as any

export const andThen = flatMap

export const flatten = <A>(option: Option<Option<A>>): Option<A> =>
  isSome(option) ? option.value : none

export const orElse: {
  <A, B>(option: Option<A>, fallback: Option<B>): Option<A | B>
  <B>(fallback: Option<B>): <A>(option: Option<A>) => Option<A | B>
} = function orElse<B>(fallback: Option<B>, __df?: any): any {
  if (arguments.length >= 2) return (orElse as any)(__df)(fallback)
  return <A>(option: Option<A>): Option<A | B> =>
    isSome(option) ? option : fallback
} as any

export const orElseWith: {
  <A, B>(option: Option<A>, fallback: LazyValue<Option<B>>): Option<A | B>
  <B>(fallback: LazyValue<Option<B>>): <A>(option: Option<A>) => Option<A | B>
} = function orElseWith<B>(fallback: LazyValue<Option<B>>, __df?: any): any {
  if (arguments.length >= 2) return (orElseWith as any)(__df)(fallback)
  return <A>(option: Option<A>): Option<A | B> =>
    isSome(option) ? option : fallback()
} as any

export const and: {
  <A, B>(option: Option<A>, next: Option<B>): Option<B>
  <B>(next: Option<B>): <A>(option: Option<A>) => Option<B>
} = function and<B>(next: Option<B>, __df?: any): any {
  if (arguments.length >= 2) return (and as any)(__df)(next)
  return <A>(option: Option<A>): Option<B> =>
    isSome(option) ? next : none
} as any

export const zip: {
  <A, B>(option: Option<A>, that: Option<B>): Option<readonly [A, B]>
  <B>(that: Option<B>): <A>(option: Option<A>) => Option<readonly [A, B]>
} = function zip<B>(that: Option<B>, __df?: any): any {
  if (arguments.length >= 2) return (zip as any)(__df)(that)
  return <A>(option: Option<A>): Option<readonly [A, B]> =>
    isSome(option) && isSome(that) ? some([option.value, that.value] as const) : none
} as any

export const zipWith: {
  <A, B, C>(option: Option<A>, that: Option<B>, f: (left: A, right: B) => C): Option<C>
  <A, B, C>(that: Option<B>, f: (left: A, right: B) => C): (option: Option<A>) => Option<C>
} = function zipWith<A, B, C>(that: Option<B>, f: (left: A, right: B) => C, __df?: any): any {
  if (arguments.length >= 3) return (zipWith as any)(f, __df)(that)
  return (option: Option<A>): Option<C> =>
    isSome(option) && isSome(that) ? some(f(option.value, that.value)) : none
} as any

const sameValueZero = (left: unknown, right: unknown): boolean =>
  left === right || (left !== left && right !== right)

export const contains: {
  <A>(option: Option<A>, value: A): boolean
  <A>(value: A): (option: Option<A>) => boolean
} = function contains<A>(value: A, __df?: any): any {
  if (arguments.length >= 2) return (contains as any)(__df)(value)
  return (option: Option<A>): boolean =>
    isSome(option) && sameValueZero(option.value, value)
} as any

export const containsWith: {
  <A>(option: Option<A>, value: A, equals: (left: A, right: A) => boolean): boolean
  <A>(equals: (left: A, right: A) => boolean): (value: A) => (option: Option<A>) => boolean
} = function containsWith<A>(equals: (left: A, right: A) => boolean, value?: A, __df?: any): any {
  if (arguments.length >= 3) return (containsWith as any)(__df)(value)(equals)
  return (value: A) =>
  (option: Option<A>): boolean =>
    isSome(option) && equals(option.value, value)
} as any

export const exists: {
  <A>(option: Option<A>, predicate: Predicate<A>): boolean
  <A>(predicate: Predicate<A>): (option: Option<A>) => boolean
} = function exists<A>(predicate: Predicate<A>, __df?: any): any {
  if (arguments.length >= 2) return (exists as any)(__df)(predicate)
  return (option: Option<A>): boolean =>
    isSome(option) && predicate(option.value)
} as any

export const mapNullable: {
  <A, B>(option: Option<A>, f: (value: A) => B | null | undefined): Option<NonNullable<B>>
  <A, B>(f: (value: A) => B | null | undefined): (option: Option<A>) => Option<NonNullable<B>>
} = function mapNullable<A, B>(f: (value: A) => B | null | undefined, __df?: any): any {
  if (arguments.length >= 2) return (mapNullable as any)(__df)(f)
  return (option: Option<A>): Option<NonNullable<B>> =>
    isSome(option) ? fromNullable(f(option.value)) : none
} as any

export const filter: {
  <A, B extends A>(option: Option<A>, predicate: Refinement<A, B>): Option<B>
  <A>(option: Option<A>, predicate: Predicate<A>): Option<A>
  <A, B extends A>(predicate: Refinement<A, B>): <C extends A>(option: Option<C>) => Option<B & C>
  <A>(predicate: Predicate<A>): <B extends A>(option: Option<B>) => Option<B>
} = function filter<A>(predicate: Predicate<A>, __df?: any): any {
  if (arguments.length >= 2) return (filter as any)(__df)(predicate)
  return (option: Option<A>): Option<A> =>
    isSome(option) && predicate(option.value) ? option : none
} as any

export const ensure = filter

export const getOrElse: {
  <A, B>(option: Option<A>, onNone: LazyValue<B>): A | B
  <B>(onNone: LazyValue<B>): <A>(option: Option<A>) => A | B
} = function getOrElse<B>(onNone: LazyValue<B>, __df?: any): any {
  if (arguments.length >= 2) return (getOrElse as any)(__df)(onNone)
  return <A>(option: Option<A>): A | B =>
    isSome(option) ? option.value : onNone()
} as any

export const getWithDefault: {
  <A, B>(option: Option<A>, defaultValue: B): A | B
  <B>(defaultValue: B): <A>(option: Option<A>) => A | B
} = function getWithDefault<B>(defaultValue: B, __df?: any): any {
  if (arguments.length >= 2) return (getWithDefault as any)(__df)(defaultValue)
  return <A>(option: Option<A>): A | B =>
    isSome(option) ? option.value : defaultValue
} as any

export function getOrThrow<A>(option: Option<A>): A
export function getOrThrow<A>(option: Option<A>, onNone: LazyValue<unknown>): A
export function getOrThrow(onNone: LazyValue<unknown>): <A>(option: Option<A>) => A
export function getOrThrow<A>(
  optionOrError: Option<A> | LazyValue<unknown>,
  onNone: LazyValue<unknown> = () => new Error('Option is None'),
): A | ((option: Option<A>) => A) {
  if (typeof optionOrError === 'function') {
    const onNone = optionOrError
    return (option: Option<A>): A => {
      if (isSome(option)) return option.value
      throw onNone()
    }
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
} = function match<A, B, C>(matchers: Matchers<A, B, C>, __df?: any): any {
  if (arguments.length >= 2) return (match as any)(__df)(matchers)
  return (option: Option<A>): B | C =>
    isSome(option) ? matchers.some(option.value) : matchers.none()
} as any

export const tap: {
  <A>(option: Option<A>, f: (value: A) => void): Option<A>
  <A>(f: (value: A) => void): (option: Option<A>) => Option<A>
} = function tap<A>(f: (value: A) => void, __df?: any): any {
  if (arguments.length >= 2) return (tap as any)(__df)(f)
  return (option: Option<A>): Option<A> => {
    if (isSome(option)) f(option.value)
    return option
  }
} as any

export const as: {
  <A, B>(option: Option<A>, value: B): Option<B>
  <B>(value: B): <A>(option: Option<A>) => Option<B>
} = function as<B>(value: B, __df?: any): any {
  if (arguments.length >= 2) return (as as any)(__df)(value)
  return <A>(option: Option<A>): Option<B> =>
    isSome(option) ? some(value) : none
} as any

export const asVoid = <A>(option: Option<A>): Option<void> =>
  isSome(option) ? some(undefined) : none

export const ap: {
  <A, B>(option: Option<A>, fn: Option<(value: A) => B>): Option<B>
  <A, B>(fn: Option<(value: A) => B>): (option: Option<A>) => Option<B>
} = function ap<A, B>(fn: Option<(value: A) => B>, __df?: any): any {
  if (arguments.length >= 2) return (ap as any)(__df)(fn)
  return (option: Option<A>): Option<B> =>
    isSome(option) && isSome(fn) ? some(fn.value(option.value)) : none
} as any

export const map2: {
  <A, B, C>(left: Option<A>, right: Option<B>, f: (left: A, right: B) => C): Option<C>
  <A, B, C>(right: Option<B>, f: (left: A, right: B) => C): (left: Option<A>) => Option<C>
} = zipWith

export const lift2: {
  <A, B, C>(left: Option<A>, right: Option<B>, f: (left: A, right: B) => C): Option<C>
  <A, B, C>(f: (left: A, right: B) => C): (left: Option<A>, right: Option<B>) => Option<C>
} = function lift2<A, B, C>(
  f: (left: A, right: B) => C,
  right?: Option<B>,
  __df?: any,
): any {
  if (arguments.length >= 3) return (lift2 as any)(__df)(f, right)
  return (left: Option<A>, right: Option<B>): Option<C> =>
    zipWith<A, B, C>(right, f)(left)
} as any

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
} = function traverse<A, B>(f: (value: A, index: number) => Option<B>, __df?: any): any {
  if (arguments.length >= 2) return (traverse as any)(__df)(f)
  return (values: readonly A[]): Option<B[]> => {
    const output: B[] = []
    for (let index = 0; index < values.length; index += 1) {
      const option = f(values[index] as A, index)
      if (isNone(option)) return none
      output.push(option.value)
    }
    return some(output)
  }
} as any

export const partitionMap: {
  <A, E, B>(option: Option<A>, f: (value: A) => Result<B, E>): readonly [Option<E>, Option<B>]
  <A, E, B>(f: (value: A) => Result<B, E>): (option: Option<A>) => readonly [Option<E>, Option<B>]
} = function partitionMap<A, E, B>(f: (value: A) => Result<B, E>, __df?: any): any {
  if (arguments.length >= 2) return (partitionMap as any)(__df)(f)
  return (option: Option<A>): readonly [Option<E>, Option<B>] => {
    if (isNone(option)) return [none, none]
    const result = f(option.value)
    return result._tag === 0 ? [some(result.error), none] : [none, some(result.value)]
  }
} as any

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
} = function toResult<E>(onNone: LazyValue<E>, __df?: any): any {
  if (arguments.length >= 2) return (toResult as any)(__df)(onNone)
  return <A>(option: Option<A>): Result<A, E> =>
    isSome(option) ? { _tag: 1, value: option.value } : { _tag: 0, error: onNone() }
} as any

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

export const bindTo: {
  <A, Name extends PropertyKey>(option: Option<A>, name: Name): Option<{ readonly [K in Name]: A }>
  <Name extends PropertyKey>(name: Name): <A>(option: Option<A>) => Option<{ readonly [K in Name]: A }>
} = function bindTo<Name extends PropertyKey>(name: Name, __df?: any): any {
  if (arguments.length >= 2) return (bindTo as any)(__df)(name)
  return <A>(option: Option<A>): Option<{ readonly [K in Name]: A }> =>
    map((value: A) => ({ [name]: value }) as { readonly [K in Name]: A })(option)
} as any

export const bind: {
  <Name extends PropertyKey, A extends object, B>(
    option: Option<A>,
    name: Exclude<Name, keyof A>,
    f: (value: A) => Option<B>,
  ): Option<A & { readonly [K in Name]: B }>
  <Name extends PropertyKey, A extends object, B>(
    name: Exclude<Name, keyof A>,
    f: (value: A) => Option<B>,
  ): (option: Option<A>) => Option<A & { readonly [K in Name]: B }>
} = function bind<Name extends PropertyKey, A extends object, B>(
  name: Exclude<Name, keyof A>,
  f: (value: A) => Option<B>,
  __df?: any,
): any {
  if (arguments.length >= 3) return (bind as any)(f, __df)(name)
  return (option: Option<A>): Option<A & { readonly [K in Name]: B }> =>
    flatMap((value: A) =>
      map(
        (bound: B) =>
          Object.assign({}, value, { [name]: bound }) as A & {
            readonly [K in Name]: B
          },
      )(f(value)),
    )(option)
} as any

const letValue: {
  <Name extends PropertyKey, A extends object, B>(
    option: Option<A>,
    name: Exclude<Name, keyof A>,
    f: (value: A) => B,
  ): Option<A & { readonly [K in Name]: B }>
  <Name extends PropertyKey, A extends object, B>(
    name: Exclude<Name, keyof A>,
    f: (value: A) => B,
  ): (option: Option<A>) => Option<A & { readonly [K in Name]: B }>
} = function letValue<Name extends PropertyKey, A extends object, B>(
  name: Exclude<Name, keyof A>,
  f: (value: A) => B,
  __df?: any,
): any {
  if (arguments.length >= 3) return (letValue as any)(f, __df)(name)
  return (option: Option<A>): Option<A & { readonly [K in Name]: B }> =>
    map(
      (value: A) =>
        Object.assign({}, value, { [name]: f(value) }) as A & {
          readonly [K in Name]: B
        },
    )(option)
} as any

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
