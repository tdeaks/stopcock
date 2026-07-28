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

export function has<K>(
  key: K,
): <SourceKey>(source: ReadonlyMap<SourceKey, unknown> & AcceptsKey<K, SourceKey>) => boolean {
  return <SourceKey>(
    source: ReadonlyMap<SourceKey, unknown> & AcceptsKey<K, SourceKey>,
  ): boolean => source.has(key as unknown as SourceKey)
}

const getImpl = <K, V>(source: ReadonlyMap<K, V>, key: K): Option<V> => {
  const value = source.get(key)
  // One lookup for the overwhelmingly common present/non-undefined case;
  // `has` is only needed to distinguish a missing key from a stored
  // `undefined`.
  if (value === undefined && !source.has(key)) return none
  return some(value as V)
}

export function get<K>(
  key: K,
): <SourceKey, V>(source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>) => Option<V> {
  return <SourceKey, A>(
    source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>,
  ): Option<A> => getImpl(source, key as unknown as SourceKey)
}

export function getOrUndefined<K>(
  key: K,
): <SourceKey, V>(source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>) => V | undefined {
  return <SourceKey, A>(
    source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>,
  ): A | undefined => source.get(key as unknown as SourceKey)
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
export function getOrElse<K, B>(
  key: K,
  fallback: () => B,
): <SourceKey, V>(source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>) => V | B {
  return <SourceKey, A>(source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>): A | B =>
    getOrElseImpl(source, key as unknown as SourceKey, fallback)
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

export function set<L, B>(
  key: L,
  value: B,
): <K, A>(source: ReadonlyMap<K, A>) => ReadonlyMap<K | L, A | B> {
  return <SourceKey, C>(source: ReadonlyMap<SourceKey, C>): ReadonlyMap<SourceKey | L, C | B> =>
    setImpl(source, key, value)
}

const removeImpl = <K, V>(source: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> => {
  const result = new globalThis.Map(source)
  result.delete(key)
  return result
}

export function remove<K>(
  key: K,
): <SourceKey, V>(
  source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>,
) => ReadonlyMap<SourceKey, V> {
  return <SourceKey, A>(
    source: ReadonlyMap<SourceKey, A> & AcceptsKey<K, SourceKey>,
  ): ReadonlyMap<SourceKey, A> => removeImpl(source, key as unknown as SourceKey)
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
  key: K,
  f: (value: V) => V,
): <SourceKey>(
  source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>,
) => ReadonlyMap<SourceKey, V> {
  return <SourceKey>(
    source: ReadonlyMap<SourceKey, V> & AcceptsKey<K, SourceKey>,
  ): ReadonlyMap<SourceKey, V> => modifyImpl(source, key as unknown as SourceKey, f)
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

export function update<L, V>(
  key: L,
  f: (value: Option<V>) => Option<V>,
): <K>(source: ReadonlyMap<K, V>) => ReadonlyMap<K | L, V> {
  return <SourceKey>(source: ReadonlyMap<SourceKey, V>): ReadonlyMap<SourceKey | L, V> =>
    updateImpl(source, key, f)
}

export function map<A, B>(f: (value: A) => B): <K>(source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>
export function map<K, A, B>(
  f: (value: A, key: K) => B,
): (source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>
export function map<K, A, B>(
  f: (value: A, key: K) => B,
): (source: ReadonlyMap<K, A>) => ReadonlyMap<K, B> {
  return (source) => mapIntoImpl(source, new globalThis.Map<K, B>(), f)
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
  predicate: (value: A, key: K) => boolean,
): (source: ReadonlyMap<K, A>) => ReadonlyMap<K, A> {
  return (source) => filterIntoImpl(source, new globalThis.Map<K, A>(), predicate)
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

export function filterMap<A, B>(
  f: (value: A) => Option<B>,
): <K>(source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>
export function filterMap<K, A, B>(
  f: (value: A, key: K) => Option<B>,
): (source: ReadonlyMap<K, A>) => ReadonlyMap<K, B>
export function filterMap<K, A, B>(
  f: (value: A, key: K) => Option<B>,
): (source: ReadonlyMap<K, A>) => ReadonlyMap<K, B> {
  return (source) => filterMapImpl(source, f)
}

const mapKeysImpl = <K, L, V>(
  source: ReadonlyMap<K, V>,
  f: (key: K, value: V) => L,
): ReadonlyMap<L, V> => {
  const result = new globalThis.Map<L, V>()
  for (const [key, value] of source) result.set(f(key, value), value)
  return result
}

export function mapKeys<K, L>(f: (key: K) => L): <V>(source: ReadonlyMap<K, V>) => ReadonlyMap<L, V>
export function mapKeys<K, L, V>(
  f: (key: K, value: V) => L,
): (source: ReadonlyMap<K, V>) => ReadonlyMap<L, V>
export function mapKeys<K, L, V>(
  f: (key: K, value: V) => L,
): (source: ReadonlyMap<K, V>) => ReadonlyMap<L, V> {
  return (source) => mapKeysImpl(source, f)
}

const mergeImpl = <K, L, A, B>(
  source: ReadonlyMap<K, A>,
  other: ReadonlyMap<L, B>,
): ReadonlyMap<K | L, A | B> => {
  const result = new globalThis.Map<K | L, A | B>(source)
  for (const [key, value] of other) result.set(key, value)
  return result
}

export function merge<L, B>(
  other: ReadonlyMap<L, B>,
): <K, A>(source: ReadonlyMap<K, A>) => ReadonlyMap<K | L, A | B> {
  return <SourceKey, C>(source: ReadonlyMap<SourceKey, C>): ReadonlyMap<SourceKey | L, C | B> =>
    mergeImpl(source, other)
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

export function intersection<L>(
  other: ReadonlyMap<L, unknown>,
): <K, V>(source: ReadonlyMap<K, V>) => ReadonlyMap<K, V> {
  return <SourceKey, A>(source: ReadonlyMap<SourceKey, A>): ReadonlyMap<SourceKey, A> =>
    intersectionImpl(source, other)
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

export function difference<L>(
  other: ReadonlyMap<L, unknown>,
): <K, V>(source: ReadonlyMap<K, V>) => ReadonlyMap<K, V> {
  return <SourceKey, A>(source: ReadonlyMap<SourceKey, A>): ReadonlyMap<SourceKey, A> =>
    differenceImpl(source, other)
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
  predicate: (value: V, key: K) => boolean,
): (
  source: ReadonlyMap<K, V>,
) => readonly [accepted: ReadonlyMap<K, V>, rejected: ReadonlyMap<K, V>] {
  return (source) => partitionImpl(source, predicate)
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

export function reduce<A, B>(
  reducer: (state: B, value: A) => B,
  initial: B,
): <K>(source: ReadonlyMap<K, A>) => B
export function reduce<K, A, B>(
  reducer: (state: B, value: A, key: K) => B,
  initial: B,
): (source: ReadonlyMap<K, A>) => B
export function reduce<K, A, B>(
  reducer: (state: B, value: A, key: K) => B,
  initial: B,
): (source: ReadonlyMap<K, A>) => B {
  return (source) => reduceImpl(source, reducer, initial)
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

export function equals<K, V>(other: ReadonlyMap<K, V>): (source: ReadonlyMap<K, V>) => boolean
export function equals<K, V>(
  other: ReadonlyMap<K, V>,
  equal: (left: V, right: V) => boolean,
): (source: ReadonlyMap<K, V>) => boolean
export function equals<K, V>(
  other: ReadonlyMap<K, V>,
  equal: (left: V, right: V) => boolean = Object.is,
): (source: ReadonlyMap<K, V>) => boolean {
  return (source) => equalsImpl(source, other, equal)
}
