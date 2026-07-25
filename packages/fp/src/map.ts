import { none, some, type Option } from './option'

type AcceptsKey<Key, SourceKey> = [Key] extends [SourceKey] ? unknown : never

type AcceptsAll<Source, Target> = [Source] extends [Target] ? unknown : never

type MutableMapKeyCapacity<Target extends Map<unknown, unknown>> = (
  Target extends Map<infer Key, infer _Value> ? (key: Key) => void : never
) extends (key: infer Key) => void
  ? Key
  : never

type MutableMapValueCapacity<Target extends Map<unknown, unknown>> = (
  Target extends Map<infer _Key, infer Value> ? (value: Value) => void : never
) extends (value: infer Value) => void
  ? Value
  : never

type CompatibleMapTarget<Key, Value, Target extends Map<unknown, unknown>> = Target &
  AcceptsAll<Key, MutableMapKeyCapacity<Target>> &
  AcceptsAll<Value, MutableMapValueCapacity<Target>>

type CompatibleMapKeyTarget<Key, Target extends Map<unknown, unknown>> = Target &
  AcceptsAll<Key, MutableMapKeyCapacity<Target>>

export const empty = <K = never, V = never>(): ReadonlyMap<K, V> => new globalThis.Map<K, V>()

export const fromIterable = <K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> =>
  new globalThis.Map(entries)

export const fromIterableInto = <K, V, Target extends Map<unknown, unknown>>(
  entries: Iterable<readonly [K, V]>,
  target: CompatibleMapTarget<K, V, Target>,
): Target => {
  for (const [key, value] of entries) target.set(key, value)
  return target
}

export const clone = <K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> =>
  new globalThis.Map(source)

export const size = (source: ReadonlyMap<unknown, unknown>): number => source.size

export const isEmpty = (source: ReadonlyMap<unknown, unknown>): boolean => source.size === 0

export function has<K>(source: ReadonlyMap<K, unknown>, key: K): boolean
export function has<K>(
  key: K,
): <SourceKey>(source: ReadonlyMap<SourceKey, unknown> & AcceptsKey<K, SourceKey>) => boolean
export function has<K>(
  sourceOrKey: ReadonlyMap<K, unknown> | K,
  key?: K,
):
  | boolean
  | (<SourceKey>(source: ReadonlyMap<SourceKey, unknown> & AcceptsKey<K, SourceKey>) => boolean) {
  if (arguments.length === 1) {
    const search = sourceOrKey as K
    return <SourceKey>(
      source: ReadonlyMap<SourceKey, unknown> & AcceptsKey<K, SourceKey>,
    ): boolean => source.has(search as unknown as SourceKey)
  }
  return (sourceOrKey as ReadonlyMap<K, unknown>).has(key as K)
}

const getImpl = <K, V>(source: ReadonlyMap<K, V>, key: K): Option<V> => {
  const value = source.get(key)
  // One lookup for the overwhelmingly common present/non-undefined case;
  // `has` is only needed to distinguish a missing key from a stored
  // `undefined`.
  if (value === undefined && !source.has(key)) return none
  return some(value as V)
}

export function get<K, V>(source: ReadonlyMap<K, V>, key: K): Option<V>
export function get<K>(
  key: K,
): <SourceKey, V>(source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>) => Option<V>
export function get<K, V>(
  sourceOrKey: ReadonlyMap<K, V> | K,
  key?: K,
):
  | Option<V>
  | (<SourceKey, A>(source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>) => Option<A>) {
  if (arguments.length === 1) {
    const search = sourceOrKey as K
    return <SourceKey, A>(
      source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>,
    ): Option<A> => getImpl(source, search as unknown as SourceKey)
  }
  return getImpl(sourceOrKey as ReadonlyMap<K, V>, key as K)
}

export function getOrUndefined<K, V>(source: ReadonlyMap<K, V>, key: K): V | undefined
export function getOrUndefined<K>(
  key: K,
): <SourceKey, V>(source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>) => V | undefined
export function getOrUndefined<K, V>(
  sourceOrKey: ReadonlyMap<K, V> | K,
  key?: K,
):
  | V
  | undefined
  | (<SourceKey, A>(
      source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>,
    ) => A | undefined) {
  if (arguments.length === 1) {
    const search = sourceOrKey as K
    return <SourceKey, A>(
      source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>,
    ): A | undefined => source.get(search as unknown as SourceKey)
  }
  return (sourceOrKey as ReadonlyMap<K, V>).get(key as K)
}

const getOrElseImpl = <K, V, B>(source: ReadonlyMap<K, V>, key: K, fallback: () => B): V | B => {
  const value = source.get(key)
  if (value !== undefined) return value
  // A stored `undefined` is a present value, so the fallback must not run for
  // it. `has` is the only way to tell it from an absent key, and it is worth
  // paying for only once `get` has already come back empty.
  return source.has(key) ? (value as V) : fallback()
}

/**
 * Reads a key, or produces a fallback for an absent one.
 *
 * The fallback is lazy and runs at most once, and only when the key really is
 * absent. A key whose stored value is `undefined` is present, so it returns
 * `undefined` rather than the fallback.
 */
export function getOrElse<K, V, B>(source: ReadonlyMap<K, V>, key: K, fallback: () => B): V | B
export function getOrElse<K, B>(
  key: K,
  fallback: () => B,
): <SourceKey, V>(source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>) => V | B
export function getOrElse<K, V, B>(
  sourceOrKey: ReadonlyMap<K, V> | K,
  keyOrFallback: K | (() => B),
  fallback?: () => B,
): V | B | (<SourceKey, A>(source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>) => A | B) {
  if (arguments.length === 2) {
    const search = sourceOrKey as K
    const produce = keyOrFallback as () => B
    return <SourceKey, A>(source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>): A | B =>
      getOrElseImpl(source, search as unknown as SourceKey, produce)
  }
  return getOrElseImpl(sourceOrKey as ReadonlyMap<K, V>, keyOrFallback as K, fallback as () => B)
}

const setImpl = <K, L, A, B>(
  source: ReadonlyMap<K, A>,
  key: L,
  value: B,
): ReadonlyMap<K | L, A | B> => {
  const result = new globalThis.Map<K | L, A | B>(source)
  result.set(key, value)
  return result
}

export function set<K, L, A, B>(
  source: ReadonlyMap<K, A>,
  key: L,
  value: B,
): ReadonlyMap<K | L, A | B>
export function set<L, B>(
  key: L,
  value: B,
): <K, A>(source: ReadonlyMap<K, A>) => ReadonlyMap<K | L, A | B>
export function set<K, L, A, B>(
  sourceOrKey: ReadonlyMap<K, A> | L,
  keyOrValue: L | B,
  value?: B,
):
  | ReadonlyMap<K | L, A | B>
  | (<SourceKey, C>(source: ReadonlyMap<SourceKey, C>) => ReadonlyMap<SourceKey | L, C | B>) {
  if (arguments.length === 2) {
    const key = sourceOrKey as L
    const next = keyOrValue as B
    return <SourceKey, C>(source: ReadonlyMap<SourceKey, C>): ReadonlyMap<SourceKey | L, C | B> =>
      setImpl(source, key, next)
  }
  return setImpl(sourceOrKey as ReadonlyMap<K, A>, keyOrValue as L, value as B)
}

const removeImpl = <K, V>(source: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> => {
  const result = new globalThis.Map(source)
  result.delete(key)
  return result
}

export function remove<K, V>(source: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V>
export function remove<K>(
  key: K,
): <SourceKey, V>(
  source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>,
) => ReadonlyMap<SourceKey, V>
export function remove<K, V>(
  sourceOrKey: ReadonlyMap<K, V> | K,
  key?: K,
):
  | ReadonlyMap<K, V>
  | (<SourceKey, A>(
      source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>,
    ) => ReadonlyMap<SourceKey, A>) {
  if (arguments.length === 1) {
    const search = sourceOrKey as K
    return <SourceKey, A>(
      source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>,
    ): ReadonlyMap<SourceKey, A> => removeImpl(source, search as unknown as SourceKey)
  }
  return removeImpl(sourceOrKey as ReadonlyMap<K, V>, key as K)
}

const modifyImpl = <K, V>(
  source: ReadonlyMap<K, V>,
  key: K,
  f: (value: V) => V,
): ReadonlyMap<K, V> => {
  if (!source.has(key)) return clone(source)
  return setImpl(source, key, f(source.get(key) as V))
}

export function modify<K, V>(
  source: ReadonlyMap<K, V>,
  key: K,
  f: (value: V) => V,
): ReadonlyMap<K, V>
export function modify<K, V>(
  key: K,
  f: (value: V) => V,
): <SourceKey>(
  source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>,
) => ReadonlyMap<SourceKey, V>
export function modify<K, V>(
  sourceOrKey: ReadonlyMap<K, V> | K,
  keyOrF: K | ((value: V) => V),
  f?: (value: V) => V,
):
  | ReadonlyMap<K, V>
  | (<SourceKey>(
      source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>,
    ) => ReadonlyMap<SourceKey, V>) {
  if (arguments.length === 2) {
    const key = sourceOrKey as K
    const transform = keyOrF as (value: V) => V
    return <SourceKey>(
      source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>,
    ): ReadonlyMap<SourceKey, V> => modifyImpl(source, key as unknown as SourceKey, transform)
  }
  return modifyImpl(sourceOrKey as ReadonlyMap<K, V>, keyOrF as K, f as (value: V) => V)
}

const updateImpl = <K, L, V>(
  source: ReadonlyMap<K, V>,
  key: L,
  f: (value: Option<V>) => Option<V>,
): ReadonlyMap<K | L, V> => {
  const widened = source as ReadonlyMap<K | L, V>
  const next = f(getImpl(widened, key))
  if (next._tag === 1) return setImpl(source, key, next.value)
  const result = new globalThis.Map<K | L, V>(source)
  result.delete(key)
  return result
}

export function update<K, L, V>(
  source: ReadonlyMap<K, V>,
  key: L,
  f: (value: Option<V>) => Option<V>,
): ReadonlyMap<K | L, V>
export function update<L, V>(
  key: L,
  f: (value: Option<V>) => Option<V>,
): <K>(source: ReadonlyMap<K, V>) => ReadonlyMap<K | L, V>
export function update<K, L, V>(
  sourceOrKey: ReadonlyMap<K, V> | L,
  keyOrF: L | ((value: Option<V>) => Option<V>),
  f?: (value: Option<V>) => Option<V>,
):
  | ReadonlyMap<K | L, V>
  | (<SourceKey>(source: ReadonlyMap<SourceKey, V>) => ReadonlyMap<SourceKey | L, V>) {
  if (arguments.length === 2) {
    const key = sourceOrKey as L
    const transform = keyOrF as (value: Option<V>) => Option<V>
    return <SourceKey>(source: ReadonlyMap<SourceKey, V>): ReadonlyMap<SourceKey | L, V> =>
      updateImpl(source, key, transform)
  }
  return updateImpl(
    sourceOrKey as ReadonlyMap<K, V>,
    keyOrF as L,
    f as (value: Option<V>) => Option<V>,
  )
}

export function map<K, A, B>(
  source: ReadonlyMap<K, A>,
  f: (value: A, key: K) => B,
): ReadonlyMap<K, B>
export function map<A, B>(f: (value: A) => B): <K>(source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>
export function map<K, A, B>(
  f: (value: A, key: K) => B,
): (source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>
export function map<K, A, B>(
  sourceOrF: ReadonlyMap<K, A> | ((value: A, key: K) => B),
  f?: (value: A, key: K) => B,
): ReadonlyMap<K, B> | ((source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>) {
  if (arguments.length === 1) {
    const transform = sourceOrF as (value: A, key: K) => B
    return (source) => mapIntoImpl(source, new globalThis.Map<K, B>(), transform)
  }
  return mapIntoImpl(
    sourceOrF as ReadonlyMap<K, A>,
    new globalThis.Map<K, B>(),
    f as (value: A, key: K) => B,
  )
}

const mapIntoImpl = <K, A, B, Target extends Map<unknown, unknown>>(
  source: ReadonlyMap<K, A>,
  target: Target,
  f: (value: A, key: K) => B,
): Target => {
  for (const [key, value] of source) {
    target.set(key, f(value, key))
  }
  return target
}

interface MapInto {
  <K, A, Target extends Map<unknown, unknown>, B extends MutableMapValueCapacity<Target>>(
    source: ReadonlyMap<K, A>,
    target: CompatibleMapKeyTarget<K, Target>,
    f: (value: A, key: K) => B,
  ): Target
}

export const mapInto = mapIntoImpl as MapInto

export function filter<K, A, B extends A>(
  source: ReadonlyMap<K, A>,
  predicate: (value: A, key: K) => value is B,
): ReadonlyMap<K, B>
export function filter<K, A>(
  source: ReadonlyMap<K, A>,
  predicate: (value: A, key: K) => boolean,
): ReadonlyMap<K, A>
export function filter<A, B extends A>(
  predicate: (value: A) => value is B,
): <K>(source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>
export function filter<A>(
  predicate: (value: A) => boolean,
): <K>(source: ReadonlyMap<K, A>) => ReadonlyMap<K, A>
export function filter<K, A, B extends A>(
  predicate: (value: A, key: K) => value is B,
): (source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>
export function filter<K, A>(
  predicate: (value: A, key: K) => boolean,
): (source: ReadonlyMap<K, A>) => ReadonlyMap<K, A>
export function filter<K, A>(
  sourceOrPredicate: ReadonlyMap<K, A> | ((value: A, key: K) => boolean),
  predicate?: (value: A, key: K) => boolean,
): ReadonlyMap<K, A> | ((source: ReadonlyMap<K, A>) => ReadonlyMap<K, A>) {
  if (arguments.length === 1) {
    const test = sourceOrPredicate as (value: A, key: K) => boolean
    return (source) => filterIntoImpl(source, new globalThis.Map<K, A>(), test)
  }
  return filterIntoImpl(
    sourceOrPredicate as ReadonlyMap<K, A>,
    new globalThis.Map<K, A>(),
    predicate as (value: A, key: K) => boolean,
  )
}

const filterIntoImpl = <K, A, Target extends Map<unknown, unknown>>(
  source: ReadonlyMap<K, A>,
  target: Target,
  predicate: (value: A, key: K) => boolean,
): Target => {
  for (const [key, value] of source) {
    if (predicate(value, key)) target.set(key, value)
  }
  return target
}

export const filterInto: {
  <K, A, B extends A, Target extends Map<unknown, unknown>>(
    source: ReadonlyMap<K, A>,
    target: CompatibleMapTarget<K, B, Target>,
    predicate: (value: A, key: K) => value is B,
  ): Target
  <K, A, Target extends Map<unknown, unknown>>(
    source: ReadonlyMap<K, A>,
    target: CompatibleMapTarget<K, A, Target>,
    predicate: (value: A, key: K) => boolean,
  ): Target
} = filterIntoImpl

const filterMapImpl = <K, A, B>(
  source: ReadonlyMap<K, A>,
  f: (value: A, key: K) => Option<B>,
): ReadonlyMap<K, B> => {
  const result = new globalThis.Map<K, B>()
  for (const [key, value] of source) {
    const next = f(value, key)
    if (next._tag === 1) result.set(key, next.value)
  }
  return result
}

export function filterMap<K, A, B>(
  source: ReadonlyMap<K, A>,
  f: (value: A, key: K) => Option<B>,
): ReadonlyMap<K, B>
export function filterMap<A, B>(
  f: (value: A) => Option<B>,
): <K>(source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>
export function filterMap<K, A, B>(
  f: (value: A, key: K) => Option<B>,
): (source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>
export function filterMap<K, A, B>(
  sourceOrF: ReadonlyMap<K, A> | ((value: A, key: K) => Option<B>),
  f?: (value: A, key: K) => Option<B>,
): ReadonlyMap<K, B> | ((source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>) {
  if (arguments.length === 1) {
    const transform = sourceOrF as (value: A, key: K) => Option<B>
    return (source) => filterMapImpl(source, transform)
  }
  return filterMapImpl(sourceOrF as ReadonlyMap<K, A>, f as (value: A, key: K) => Option<B>)
}

const mapKeysImpl = <K, L, V>(
  source: ReadonlyMap<K, V>,
  f: (key: K, value: V) => L,
): ReadonlyMap<L, V> => {
  const result = new globalThis.Map<L, V>()
  for (const [key, value] of source) result.set(f(key, value), value)
  return result
}

export function mapKeys<K, L, V>(
  source: ReadonlyMap<K, V>,
  f: (key: K, value: V) => L,
): ReadonlyMap<L, V>
export function mapKeys<K, L>(f: (key: K) => L): <V>(source: ReadonlyMap<K, V>) => ReadonlyMap<L, V>
export function mapKeys<K, L, V>(
  f: (key: K, value: V) => L,
): (source: ReadonlyMap<K, V>) => ReadonlyMap<L, V>
export function mapKeys<K, L, V>(
  sourceOrF: ReadonlyMap<K, V> | ((key: K, value: V) => L),
  f?: (key: K, value: V) => L,
): ReadonlyMap<L, V> | ((source: ReadonlyMap<K, V>) => ReadonlyMap<L, V>) {
  if (arguments.length === 1) {
    const transform = sourceOrF as (key: K, value: V) => L
    return (source) => mapKeysImpl(source, transform)
  }
  return mapKeysImpl(sourceOrF as ReadonlyMap<K, V>, f as (key: K, value: V) => L)
}

const mergeImpl = <K, L, A, B>(
  source: ReadonlyMap<K, A>,
  other: ReadonlyMap<L, B>,
): ReadonlyMap<K | L, A | B> => {
  const result = new globalThis.Map<K | L, A | B>(source)
  for (const [key, value] of other) result.set(key, value)
  return result
}

export function merge<K, L, A, B>(
  source: ReadonlyMap<K, A>,
  other: ReadonlyMap<L, B>,
): ReadonlyMap<K | L, A | B>
export function merge<L, B>(
  other: ReadonlyMap<L, B>,
): <K, A>(source: ReadonlyMap<K, A>) => ReadonlyMap<K | L, A | B>
export function merge<K, L, A, B>(
  sourceOrOther: ReadonlyMap<K, A> | ReadonlyMap<L, B>,
  other?: ReadonlyMap<L, B>,
):
  | ReadonlyMap<K | L, A | B>
  | (<SourceKey, C>(source: ReadonlyMap<SourceKey, C>) => ReadonlyMap<SourceKey | L, C | B>) {
  if (arguments.length === 1) {
    const right = sourceOrOther as ReadonlyMap<L, B>
    return <SourceKey, C>(source: ReadonlyMap<SourceKey, C>): ReadonlyMap<SourceKey | L, C | B> =>
      mergeImpl(source, right)
  }
  return mergeImpl(sourceOrOther as ReadonlyMap<K, A>, other as ReadonlyMap<L, B>)
}

export const union: typeof merge = merge

const intersectionImpl = <K, L, V>(
  source: ReadonlyMap<K, V>,
  other: ReadonlyMap<L, unknown>,
): ReadonlyMap<K, V> => {
  const result = new globalThis.Map<K, V>()
  for (const [key, value] of source) {
    if (other.has(key as unknown as L)) result.set(key, value)
  }
  return result
}

export function intersection<K, L, V>(
  source: ReadonlyMap<K, V>,
  other: ReadonlyMap<L, unknown>,
): ReadonlyMap<K, V>
export function intersection<L>(
  other: ReadonlyMap<L, unknown>,
): <K, V>(source: ReadonlyMap<K, V>) => ReadonlyMap<K, V>
export function intersection<K, L, V>(
  sourceOrOther: ReadonlyMap<K, V> | ReadonlyMap<L, unknown>,
  other?: ReadonlyMap<L, unknown>,
):
  | ReadonlyMap<K, V>
  | (<SourceKey, A>(source: ReadonlyMap<SourceKey, A>) => ReadonlyMap<SourceKey, A>) {
  if (arguments.length === 1) {
    const right = sourceOrOther as ReadonlyMap<L, unknown>
    return <SourceKey, A>(source: ReadonlyMap<SourceKey, A>): ReadonlyMap<SourceKey, A> =>
      intersectionImpl(source, right)
  }
  return intersectionImpl(sourceOrOther as ReadonlyMap<K, V>, other as ReadonlyMap<L, unknown>)
}

const differenceImpl = <K, L, V>(
  source: ReadonlyMap<K, V>,
  other: ReadonlyMap<L, unknown>,
): ReadonlyMap<K, V> => {
  const result = new globalThis.Map<K, V>()
  for (const [key, value] of source) {
    if (!other.has(key as unknown as L)) result.set(key, value)
  }
  return result
}

export function difference<K, L, V>(
  source: ReadonlyMap<K, V>,
  other: ReadonlyMap<L, unknown>,
): ReadonlyMap<K, V>
export function difference<L>(
  other: ReadonlyMap<L, unknown>,
): <K, V>(source: ReadonlyMap<K, V>) => ReadonlyMap<K, V>
export function difference<K, L, V>(
  sourceOrOther: ReadonlyMap<K, V> | ReadonlyMap<L, unknown>,
  other?: ReadonlyMap<L, unknown>,
):
  | ReadonlyMap<K, V>
  | (<SourceKey, A>(source: ReadonlyMap<SourceKey, A>) => ReadonlyMap<SourceKey, A>) {
  if (arguments.length === 1) {
    const right = sourceOrOther as ReadonlyMap<L, unknown>
    return <SourceKey, A>(source: ReadonlyMap<SourceKey, A>): ReadonlyMap<SourceKey, A> =>
      differenceImpl(source, right)
  }
  return differenceImpl(sourceOrOther as ReadonlyMap<K, V>, other as ReadonlyMap<L, unknown>)
}

const partitionImpl = <K, V>(
  source: ReadonlyMap<K, V>,
  predicate: (value: V, key: K) => boolean,
): readonly [accepted: ReadonlyMap<K, V>, rejected: ReadonlyMap<K, V>] => {
  const accepted = new globalThis.Map<K, V>()
  const rejected = new globalThis.Map<K, V>()
  for (const [key, value] of source) {
    ;(predicate(value, key) ? accepted : rejected).set(key, value)
  }
  return [accepted, rejected]
}

export function partition<K, V, B extends V>(
  source: ReadonlyMap<K, V>,
  predicate: (value: V, key: K) => value is B,
): readonly [accepted: ReadonlyMap<K, B>, rejected: ReadonlyMap<K, Exclude<V, B>>]
export function partition<K, V>(
  source: ReadonlyMap<K, V>,
  predicate: (value: V, key: K) => boolean,
): readonly [accepted: ReadonlyMap<K, V>, rejected: ReadonlyMap<K, V>]
export function partition<V, B extends V>(
  predicate: (value: V) => value is B,
): <K>(
  source: ReadonlyMap<K, V>,
) => readonly [accepted: ReadonlyMap<K, B>, rejected: ReadonlyMap<K, Exclude<V, B>>]
export function partition<V>(
  predicate: (value: V) => boolean,
): <K>(
  source: ReadonlyMap<K, V>,
) => readonly [accepted: ReadonlyMap<K, V>, rejected: ReadonlyMap<K, V>]
export function partition<K, V, B extends V>(
  predicate: (value: V, key: K) => value is B,
): (
  source: ReadonlyMap<K, V>,
) => readonly [accepted: ReadonlyMap<K, B>, rejected: ReadonlyMap<K, Exclude<V, B>>]
export function partition<K, V>(
  predicate: (value: V, key: K) => boolean,
): (
  source: ReadonlyMap<K, V>,
) => readonly [accepted: ReadonlyMap<K, V>, rejected: ReadonlyMap<K, V>]
export function partition<K, V>(
  sourceOrPredicate: ReadonlyMap<K, V> | ((value: V, key: K) => boolean),
  predicate?: (value: V, key: K) => boolean,
):
  | readonly [accepted: ReadonlyMap<K, V>, rejected: ReadonlyMap<K, V>]
  | ((
      source: ReadonlyMap<K, V>,
    ) => readonly [accepted: ReadonlyMap<K, V>, rejected: ReadonlyMap<K, V>]) {
  if (arguments.length === 1) {
    const test = sourceOrPredicate as (value: V, key: K) => boolean
    return (source) => partitionImpl(source, test)
  }
  return partitionImpl(
    sourceOrPredicate as ReadonlyMap<K, V>,
    predicate as (value: V, key: K) => boolean,
  )
}

export const keys = <K>(source: ReadonlyMap<K, unknown>): IterableIterator<K> => source.keys()

export const values = <V>(source: ReadonlyMap<unknown, V>): IterableIterator<V> => source.values()

export const entries = <K, V>(source: ReadonlyMap<K, V>): IterableIterator<[K, V]> =>
  source.entries()

export const toArray = <K, V>(source: ReadonlyMap<K, V>): Array<readonly [K, V]> =>
  Array.from(source)

const reduceImpl = <K, A, B>(
  source: ReadonlyMap<K, A>,
  reducer: (state: B, value: A, key: K) => B,
  initial: B,
): B => {
  let state = initial
  for (const [key, value] of source) state = reducer(state, value, key)
  return state
}

export function reduce<K, A, B>(
  source: ReadonlyMap<K, A>,
  reducer: (state: B, value: A, key: K) => B,
  initial: B,
): B
export function reduce<A, B>(
  reducer: (state: B, value: A) => B,
  initial: B,
): <K>(source: ReadonlyMap<K, A>) => B
export function reduce<K, A, B>(
  reducer: (state: B, value: A, key: K) => B,
  initial: B,
): (source: ReadonlyMap<K, A>) => B
export function reduce<K, A, B>(
  sourceOrReducer: ReadonlyMap<K, A> | ((state: B, value: A, key: K) => B),
  reducerOrInitial: ((state: B, value: A, key: K) => B) | B,
  initial?: B,
): B | ((source: ReadonlyMap<K, A>) => B) {
  if (arguments.length === 2) {
    const reducer = sourceOrReducer as (state: B, value: A, key: K) => B
    const seed = reducerOrInitial as B
    return (source) => reduceImpl(source, reducer, seed)
  }
  return reduceImpl(
    sourceOrReducer as ReadonlyMap<K, A>,
    reducerOrInitial as (state: B, value: A, key: K) => B,
    initial as B,
  )
}

const equalsImpl = <K, V>(
  source: ReadonlyMap<K, V>,
  other: ReadonlyMap<K, V>,
  equal: (left: V, right: V) => boolean,
): boolean => {
  if (source.size !== other.size) return false
  for (const [key, value] of source) {
    const otherValue = other.get(key)
    if ((otherValue === undefined && !other.has(key)) || !equal(value, otherValue as V)) {
      return false
    }
  }
  return true
}

type NonRuntimeFunction<T> = T extends
  | ((...arguments_: never[]) => unknown)
  | (abstract new (...arguments_: never[]) => unknown)
  ? never
  : T

export function equals<K, V, Other extends ReadonlyMap<K, V>>(
  source: ReadonlyMap<K, V>,
  other: Other & NonRuntimeFunction<Other>,
  equal?: (left: V, right: V) => boolean,
): boolean
export function equals<K, V>(other: ReadonlyMap<K, V>): (source: ReadonlyMap<K, V>) => boolean
export function equals<K, V>(
  other: ReadonlyMap<K, V>,
  equal: (left: V, right: V) => boolean,
): (source: ReadonlyMap<K, V>) => boolean
export function equals<K, V>(
  sourceOrOther: ReadonlyMap<K, V>,
  otherOrEqual?: ReadonlyMap<K, V> | ((left: V, right: V) => boolean),
  equal: (left: V, right: V) => boolean = Object.is,
): boolean | ((source: ReadonlyMap<K, V>) => boolean) {
  if (arguments.length === 1) {
    const other = sourceOrOther
    return (source) => equalsImpl(source, other, Object.is)
  }
  if (typeof otherOrEqual === 'function') {
    const other = sourceOrOther
    return (source) => equalsImpl(source, other, otherOrEqual)
  }
  return equalsImpl(sourceOrOther, otherOrEqual as ReadonlyMap<K, V>, equal)
}
