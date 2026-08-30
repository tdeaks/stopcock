import type { Option } from './option'

type AcceptsValue<Value, SourceValue> = [Value] extends [SourceValue] ? unknown : never

type AcceptsAll<Source, Target> = [Source] extends [Target] ? unknown : never

type MutableSetValueCapacity<Target extends Set<unknown>> = (
  Target extends Set<infer Value> ? (value: Value) => void : never
) extends (value: infer Value) => void
  ? Value
  : never

type CompatibleSetTarget<Value, Target extends Set<unknown>> = Target &
  AcceptsAll<Value, MutableSetValueCapacity<Target>>

type TransformInput<Transform> = Transform extends (
  value: infer Input,
  ...args: never[]
) => unknown
  ? Input
  : never

export const empty = <A = never>(): ReadonlySet<A> => new globalThis.Set<A>()

export const fromIterable = <A>(source: Iterable<A>): ReadonlySet<A> => new globalThis.Set(source)

export const fromIterableInto: {
  <A, Target extends Set<unknown>>(
    source: Iterable<A>,
    target: CompatibleSetTarget<A, Target>,
  ): Target
  <Target extends Set<unknown>>(
    target: Target,
  ): <A extends MutableSetValueCapacity<Target>>(source: Iterable<A>) => Target
} = function fromIterableInto(target: Set<unknown>, __df?: any): any {
  if (arguments.length >= 2) return (fromIterableInto as any)(__df)(target)
  return (source: Iterable<unknown>): Set<unknown> => {
    for (const value of source) target.add(value)
    return target
  }
} as any

export const clone = <A>(source: ReadonlySet<A>): ReadonlySet<A> => new globalThis.Set(source)

export const size = (source: ReadonlySet<unknown>): number => source.size

export const isEmpty = (source: ReadonlySet<unknown>): boolean => source.size === 0

export function has<A>(source: ReadonlySet<A>, value: A): boolean
export function has<A>(
  value: A,
): <SourceValue>(source: ReadonlySet<SourceValue> & AcceptsValue<A, SourceValue>) => boolean
export function has<A>(
  sourceOrValue: ReadonlySet<A> | A,
  value?: A,
):
  | boolean
  | (<SourceValue>(source: ReadonlySet<SourceValue> & AcceptsValue<A, SourceValue>) => boolean) {
  if (arguments.length !== 1) {
    return (sourceOrValue as ReadonlySet<A>).has(value as A)
  }
  value = sourceOrValue as A
  return <SourceValue>(
    source: ReadonlySet<SourceValue> & AcceptsValue<A, SourceValue>,
  ): boolean => source.has(value as unknown as SourceValue)
}

const addImpl = <A, B>(source: ReadonlySet<A>, value: B): ReadonlySet<A | B> => {
  const result = new globalThis.Set<A | B>(source)
  result.add(value)
  return result
}

export function add<A, B>(source: ReadonlySet<A>, value: B): ReadonlySet<A | B>
export function add<B>(value: B): <A>(source: ReadonlySet<A>) => ReadonlySet<A | B>
export function add<A, B>(
  sourceOrValue: ReadonlySet<A> | B,
  value?: B,
): ReadonlySet<A | B> | (<C>(source: ReadonlySet<C>) => ReadonlySet<C | B>) {
  if (arguments.length !== 1) {
    return addImpl(sourceOrValue as ReadonlySet<A>, value as B)
  }
  value = sourceOrValue as B
  return <C>(source: ReadonlySet<C>): ReadonlySet<C | B> => addImpl(source, value)
}

const removeImpl = <A>(source: ReadonlySet<A>, value: A): ReadonlySet<A> => {
  const result = new globalThis.Set(source)
  result.delete(value)
  return result
}

export function remove<A>(source: ReadonlySet<A>, value: A): ReadonlySet<A>
export function remove<A>(
  value: A,
): <SourceValue>(
  source: ReadonlySet<SourceValue> & AcceptsValue<A, SourceValue>,
) => ReadonlySet<SourceValue>
export function remove<A>(
  sourceOrValue: ReadonlySet<A> | A,
  value?: A,
):
  | ReadonlySet<A>
  | (<SourceValue>(
      source: ReadonlySet<SourceValue> & AcceptsValue<A, SourceValue>,
    ) => ReadonlySet<SourceValue>) {
  if (arguments.length !== 1) {
    return removeImpl(sourceOrValue as ReadonlySet<A>, value as A)
  }
  value = sourceOrValue as A
  return <SourceValue>(
    source: ReadonlySet<SourceValue> & AcceptsValue<A, SourceValue>,
  ): ReadonlySet<SourceValue> => removeImpl(source, value as unknown as SourceValue)
}

const toggleImpl = <A, B>(source: ReadonlySet<A>, value: B): ReadonlySet<A | B> =>
  source.has(value as unknown as A)
    ? removeImpl(source, value as unknown as A)
    : addImpl(source, value)

export function toggle<A, B>(source: ReadonlySet<A>, value: B): ReadonlySet<A | B>
export function toggle<B>(value: B): <A>(source: ReadonlySet<A>) => ReadonlySet<A | B>
export function toggle<A, B>(
  sourceOrValue: ReadonlySet<A> | B,
  value?: B,
): ReadonlySet<A | B> | (<C>(source: ReadonlySet<C>) => ReadonlySet<C | B>) {
  if (arguments.length !== 1) {
    return toggleImpl(sourceOrValue as ReadonlySet<A>, value as B)
  }
  value = sourceOrValue as B
  return <C>(source: ReadonlySet<C>): ReadonlySet<C | B> => toggleImpl(source, value)
}

export function map<A, B>(source: ReadonlySet<A>, f: (value: A) => B): ReadonlySet<B>
export function map<A, B>(f: (value: A) => B): (source: ReadonlySet<A>) => ReadonlySet<B>
export function map<A, B>(
  sourceOrF: ReadonlySet<A> | ((value: A) => B),
  f?: (value: A) => B,
): ReadonlySet<B> | ((source: ReadonlySet<A>) => ReadonlySet<B>) {
  if (arguments.length !== 1) {
    return mapIntoImpl(sourceOrF as ReadonlySet<A>, new globalThis.Set<B>(), f as (value: A) => B)
  }
  f = sourceOrF as (value: A) => B
  return (source) => mapIntoImpl(source, new globalThis.Set<B>(), f)
}

const mapIntoImpl = <A, B, Target extends Set<unknown>>(
  source: ReadonlySet<A>,
  target: Target,
  f: (value: A) => B,
): Target => {
  for (const value of source) target.add(f(value))
  return target
}

interface MapInto {
  <A, Target extends Set<unknown>, B extends MutableSetValueCapacity<Target>>(
    source: ReadonlySet<A>,
    target: Target,
    f: (value: A) => B,
  ): Target
  <
    Target extends Set<unknown>,
    Transform extends (...args: never[]) => MutableSetValueCapacity<NoInfer<Target>>,
  >(
    target: Target,
    f: Transform,
  ): (source: ReadonlySet<TransformInput<Transform>>) => Target
}

export const mapInto: MapInto = function mapInto(
  target: Set<unknown>,
  f: (value: unknown) => unknown,
  __df?: any,
): any {
  if (arguments.length >= 3) return (mapInto as any)(f, __df)(target)
  return (source: ReadonlySet<unknown>): Set<unknown> => mapIntoImpl(source, target, f)
} as any

export function filter<A, B extends A>(
  source: ReadonlySet<A>,
  predicate: (value: A) => value is B,
): ReadonlySet<B>
export function filter<A>(source: ReadonlySet<A>, predicate: (value: A) => boolean): ReadonlySet<A>
export function filter<A, B extends A>(
  predicate: (value: A) => value is B,
): (source: ReadonlySet<A>) => ReadonlySet<B>
export function filter<A>(
  predicate: (value: A) => boolean,
): (source: ReadonlySet<A>) => ReadonlySet<A>
export function filter<A>(
  sourceOrPredicate: ReadonlySet<A> | ((value: A) => boolean),
  predicate?: (value: A) => boolean,
): ReadonlySet<A> | ((source: ReadonlySet<A>) => ReadonlySet<A>) {
  if (arguments.length !== 1) {
    return filterIntoImpl(
      sourceOrPredicate as ReadonlySet<A>,
      new globalThis.Set<A>(),
      predicate as (value: A) => boolean,
    )
  }
  predicate = sourceOrPredicate as (value: A) => boolean
  return (source) => filterIntoImpl(source, new globalThis.Set<A>(), predicate)
}

const filterIntoImpl = <A, Target extends Set<unknown>>(
  source: ReadonlySet<A>,
  target: Target,
  predicate: (value: A) => boolean,
): Target => {
  for (const value of source) {
    if (predicate(value)) target.add(value)
  }
  return target
}

export const filterInto: {
  <A, B extends A, Target extends Set<unknown>>(
    source: ReadonlySet<A>,
    target: CompatibleSetTarget<B, Target>,
    predicate: (value: A) => value is B,
  ): Target
  <A, Target extends Set<unknown>>(
    source: ReadonlySet<A>,
    target: CompatibleSetTarget<A, Target>,
    predicate: (value: A) => boolean,
  ): Target
  <A, B extends A, Target extends Set<unknown>>(
    target: CompatibleSetTarget<B, Target>,
    predicate: (value: A) => value is B,
  ): (source: ReadonlySet<A>) => Target
  <A, Target extends Set<unknown>>(
    target: CompatibleSetTarget<A, Target>,
    predicate: (value: A) => boolean,
  ): (source: ReadonlySet<A>) => Target
} = function filterInto(
  target: Set<unknown>,
  predicate: (value: unknown) => boolean,
  __df?: any,
): any {
  if (arguments.length >= 3) return (filterInto as any)(predicate, __df)(target)
  return (source: ReadonlySet<unknown>): Set<unknown> =>
    filterIntoImpl(source, target, predicate)
} as any

const filterMapImpl = <A, B>(
  source: ReadonlySet<A>,
  f: (value: A) => Option<B>,
): ReadonlySet<B> => {
  const result = new globalThis.Set<B>()
  for (const value of source) {
    const next = f(value)
    if (next._tag === 1) result.add(next.value)
  }
  return result
}

export function filterMap<A, B>(source: ReadonlySet<A>, f: (value: A) => Option<B>): ReadonlySet<B>
export function filterMap<A, B>(
  f: (value: A) => Option<B>,
): (source: ReadonlySet<A>) => ReadonlySet<B>
export function filterMap<A, B>(
  sourceOrF: ReadonlySet<A> | ((value: A) => Option<B>),
  f?: (value: A) => Option<B>,
): ReadonlySet<B> | ((source: ReadonlySet<A>) => ReadonlySet<B>) {
  if (arguments.length !== 1) {
    return filterMapImpl(sourceOrF as ReadonlySet<A>, f as (value: A) => Option<B>)
  }
  f = sourceOrF as (value: A) => Option<B>
  return (source) => filterMapImpl(source, f)
}

const flatMapImpl = <A, B>(
  source: ReadonlySet<A>,
  f: (value: A) => Iterable<B>,
): ReadonlySet<B> => {
  const result = new globalThis.Set<B>()
  for (const value of source) {
    for (const inner of f(value)) result.add(inner)
  }
  return result
}

export function flatMap<A, B>(source: ReadonlySet<A>, f: (value: A) => Iterable<B>): ReadonlySet<B>
export function flatMap<A, B>(
  f: (value: A) => Iterable<B>,
): (source: ReadonlySet<A>) => ReadonlySet<B>
export function flatMap<A, B>(
  sourceOrF: ReadonlySet<A> | ((value: A) => Iterable<B>),
  f?: (value: A) => Iterable<B>,
): ReadonlySet<B> | ((source: ReadonlySet<A>) => ReadonlySet<B>) {
  if (arguments.length !== 1) {
    return flatMapImpl(sourceOrF as ReadonlySet<A>, f as (value: A) => Iterable<B>)
  }
  f = sourceOrF as (value: A) => Iterable<B>
  return (source) => flatMapImpl(source, f)
}

const unionImpl = <A, B>(source: ReadonlySet<A>, other: ReadonlySet<B>): ReadonlySet<A | B> => {
  const result = new globalThis.Set<A | B>(source)
  for (const value of other) result.add(value)
  return result
}

export function union<A, B>(source: ReadonlySet<A>, other: ReadonlySet<B>): ReadonlySet<A | B>
export function union<B>(other: ReadonlySet<B>): <A>(source: ReadonlySet<A>) => ReadonlySet<A | B>
export function union<A, B>(
  sourceOrOther: ReadonlySet<A> | ReadonlySet<B>,
  other?: ReadonlySet<B>,
): ReadonlySet<A | B> | (<C>(source: ReadonlySet<C>) => ReadonlySet<C | B>) {
  if (arguments.length !== 1) {
    return unionImpl(sourceOrOther as ReadonlySet<A>, other as ReadonlySet<B>)
  }
  other = sourceOrOther as ReadonlySet<B>
  return <C>(source: ReadonlySet<C>): ReadonlySet<C | B> => unionImpl(source, other)
}

export const unionInto: {
  <A, Target extends Set<unknown>>(
    source: ReadonlySet<A>,
    target: CompatibleSetTarget<A, Target>,
  ): Target
  <Target extends Set<unknown>>(
    target: Target,
  ): <A extends MutableSetValueCapacity<Target>>(source: ReadonlySet<A>) => Target
} = function unionInto(target: Set<unknown>, __df?: any): any {
  if (arguments.length >= 2) return (unionInto as any)(__df)(target)
  return (source: ReadonlySet<unknown>): Set<unknown> => {
    for (const value of source) target.add(value)
    return target
  }
} as any

const intersectionImpl = <A>(
  source: ReadonlySet<A>,
  other: ReadonlySet<unknown>,
): ReadonlySet<A> => {
  const result = new globalThis.Set<A>()
  if (source.size <= other.size) {
    for (const value of source) {
      if (other.has(value)) result.add(value)
    }
  } else {
    for (const value of other) {
      if (source.has(value as A)) result.add(value as A)
    }
  }
  return result
}

export function intersection<A>(source: ReadonlySet<A>, other: ReadonlySet<unknown>): ReadonlySet<A>
export function intersection(
  other: ReadonlySet<unknown>,
): <A>(source: ReadonlySet<A>) => ReadonlySet<A>
export function intersection<A>(
  sourceOrOther: ReadonlySet<A> | ReadonlySet<unknown>,
  other?: ReadonlySet<unknown>,
): ReadonlySet<A> | (<B>(source: ReadonlySet<B>) => ReadonlySet<B>) {
  if (arguments.length !== 1) {
    return intersectionImpl(sourceOrOther as ReadonlySet<A>, other as ReadonlySet<unknown>)
  }
  other = sourceOrOther as ReadonlySet<unknown>
  return <B>(source: ReadonlySet<B>): ReadonlySet<B> => intersectionImpl(source, other)
}

const differenceImpl = <A>(source: ReadonlySet<A>, other: ReadonlySet<unknown>): ReadonlySet<A> => {
  const result = new globalThis.Set<A>()
  for (const value of source) {
    if (!other.has(value)) result.add(value)
  }
  return result
}

export function difference<A>(source: ReadonlySet<A>, other: ReadonlySet<unknown>): ReadonlySet<A>
export function difference(
  other: ReadonlySet<unknown>,
): <A>(source: ReadonlySet<A>) => ReadonlySet<A>
export function difference<A>(
  sourceOrOther: ReadonlySet<A> | ReadonlySet<unknown>,
  other?: ReadonlySet<unknown>,
): ReadonlySet<A> | (<B>(source: ReadonlySet<B>) => ReadonlySet<B>) {
  if (arguments.length !== 1) {
    return differenceImpl(sourceOrOther as ReadonlySet<A>, other as ReadonlySet<unknown>)
  }
  other = sourceOrOther as ReadonlySet<unknown>
  return <B>(source: ReadonlySet<B>): ReadonlySet<B> => differenceImpl(source, other)
}

const symmetricDifferenceImpl = <A, B>(
  source: ReadonlySet<A>,
  other: ReadonlySet<B>,
): ReadonlySet<A | B> => {
  const result = new globalThis.Set<A | B>()
  for (const value of source) {
    if (!other.has(value as unknown as B)) result.add(value)
  }
  for (const value of other) {
    if (!source.has(value as unknown as A)) result.add(value)
  }
  return result
}

export function symmetricDifference<A, B>(
  source: ReadonlySet<A>,
  other: ReadonlySet<B>,
): ReadonlySet<A | B>
export function symmetricDifference<B>(
  other: ReadonlySet<B>,
): <A>(source: ReadonlySet<A>) => ReadonlySet<A | B>
export function symmetricDifference<A, B>(
  sourceOrOther: ReadonlySet<A> | ReadonlySet<B>,
  other?: ReadonlySet<B>,
): ReadonlySet<A | B> | (<C>(source: ReadonlySet<C>) => ReadonlySet<C | B>) {
  if (arguments.length !== 1) {
    return symmetricDifferenceImpl(sourceOrOther as ReadonlySet<A>, other as ReadonlySet<B>)
  }
  other = sourceOrOther as ReadonlySet<B>
  return <C>(source: ReadonlySet<C>): ReadonlySet<C | B> => symmetricDifferenceImpl(source, other)
}

const isSubsetImpl = (source: ReadonlySet<unknown>, other: ReadonlySet<unknown>): boolean => {
  if (source.size > other.size) return false
  for (const value of source) {
    if (!other.has(value)) return false
  }
  return true
}

export function isSubset(source: ReadonlySet<unknown>, other: ReadonlySet<unknown>): boolean
export function isSubset(other: ReadonlySet<unknown>): (source: ReadonlySet<unknown>) => boolean
export function isSubset(
  sourceOrOther: ReadonlySet<unknown>,
  other?: ReadonlySet<unknown>,
): boolean | ((source: ReadonlySet<unknown>) => boolean) {
  if (arguments.length !== 1) {
    return isSubsetImpl(sourceOrOther, other as ReadonlySet<unknown>)
  }
  other = sourceOrOther
  return (source) => isSubsetImpl(source, other)
}

const isSupersetImpl = (source: ReadonlySet<unknown>, other: ReadonlySet<unknown>): boolean =>
  isSubsetImpl(other, source)

export function isSuperset(source: ReadonlySet<unknown>, other: ReadonlySet<unknown>): boolean
export function isSuperset(other: ReadonlySet<unknown>): (source: ReadonlySet<unknown>) => boolean
export function isSuperset(
  sourceOrOther: ReadonlySet<unknown>,
  other?: ReadonlySet<unknown>,
): boolean | ((source: ReadonlySet<unknown>) => boolean) {
  if (arguments.length !== 1) {
    return isSupersetImpl(sourceOrOther, other as ReadonlySet<unknown>)
  }
  other = sourceOrOther
  return (source) => isSupersetImpl(source, other)
}

const isDisjointImpl = (source: ReadonlySet<unknown>, other: ReadonlySet<unknown>): boolean => {
  let smaller = source
  let larger = other
  if (source.size > other.size) {
    smaller = other
    larger = source
  }
  for (const value of smaller) {
    if (larger.has(value)) return false
  }
  return true
}

export function isDisjoint(source: ReadonlySet<unknown>, other: ReadonlySet<unknown>): boolean
export function isDisjoint(other: ReadonlySet<unknown>): (source: ReadonlySet<unknown>) => boolean
export function isDisjoint(
  sourceOrOther: ReadonlySet<unknown>,
  other?: ReadonlySet<unknown>,
): boolean | ((source: ReadonlySet<unknown>) => boolean) {
  if (arguments.length !== 1) {
    return isDisjointImpl(sourceOrOther, other as ReadonlySet<unknown>)
  }
  other = sourceOrOther
  return (source) => isDisjointImpl(source, other)
}

const equalsImpl = (source: ReadonlySet<unknown>, other: ReadonlySet<unknown>): boolean =>
  source.size === other.size && isSubsetImpl(source, other)

export function equals(source: ReadonlySet<unknown>, other: ReadonlySet<unknown>): boolean
export function equals(other: ReadonlySet<unknown>): (source: ReadonlySet<unknown>) => boolean
export function equals(
  sourceOrOther: ReadonlySet<unknown>,
  other?: ReadonlySet<unknown>,
): boolean | ((source: ReadonlySet<unknown>) => boolean) {
  if (arguments.length !== 1) {
    return equalsImpl(sourceOrOther, other as ReadonlySet<unknown>)
  }
  other = sourceOrOther
  return (source) => equalsImpl(source, other)
}

const partitionImpl = <A>(
  source: ReadonlySet<A>,
  predicate: (value: A) => boolean,
): readonly [accepted: ReadonlySet<A>, rejected: ReadonlySet<A>] => {
  const accepted = new globalThis.Set<A>()
  const rejected = new globalThis.Set<A>()
  for (const value of source) {
    ;(predicate(value) ? accepted : rejected).add(value)
  }
  return [accepted, rejected]
}

export function partition<A, B extends A>(
  source: ReadonlySet<A>,
  predicate: (value: A) => value is B,
): readonly [accepted: ReadonlySet<B>, rejected: ReadonlySet<Exclude<A, B>>]
export function partition<A>(
  source: ReadonlySet<A>,
  predicate: (value: A) => boolean,
): readonly [accepted: ReadonlySet<A>, rejected: ReadonlySet<A>]
export function partition<A, B extends A>(
  predicate: (value: A) => value is B,
): (
  source: ReadonlySet<A>,
) => readonly [accepted: ReadonlySet<B>, rejected: ReadonlySet<Exclude<A, B>>]
export function partition<A>(
  predicate: (value: A) => boolean,
): (source: ReadonlySet<A>) => readonly [accepted: ReadonlySet<A>, rejected: ReadonlySet<A>]
export function partition<A>(
  sourceOrPredicate: ReadonlySet<A> | ((value: A) => boolean),
  predicate?: (value: A) => boolean,
):
  | readonly [accepted: ReadonlySet<A>, rejected: ReadonlySet<A>]
  | ((source: ReadonlySet<A>) => readonly [accepted: ReadonlySet<A>, rejected: ReadonlySet<A>]) {
  if (arguments.length !== 1) {
    return partitionImpl(sourceOrPredicate as ReadonlySet<A>, predicate as (value: A) => boolean)
  }
  predicate = sourceOrPredicate as (value: A) => boolean
  return (source) => partitionImpl(source, predicate)
}

const reduceImpl = <A, B>(
  source: ReadonlySet<A>,
  reducer: (state: B, value: A) => B,
  initial: B,
): B => {
  let state = initial
  for (const value of source) state = reducer(state, value)
  return state
}

export function reduce<A, B>(
  source: ReadonlySet<A>,
  reducer: (state: B, value: A) => B,
  initial: B,
): B
export function reduce<A, B>(
  reducer: (state: B, value: A) => B,
  initial: B,
): (source: ReadonlySet<A>) => B
export function reduce<A, B>(
  sourceOrReducer: ReadonlySet<A> | ((state: B, value: A) => B),
  reducerOrInitial: ((state: B, value: A) => B) | B,
  initial?: B,
): B | ((source: ReadonlySet<A>) => B) {
  if (arguments.length !== 2) {
    return reduceImpl(
      sourceOrReducer as ReadonlySet<A>,
      reducerOrInitial as (state: B, value: A) => B,
      initial as B,
    )
  }
  const reducer = sourceOrReducer as (state: B, value: A) => B
  initial = reducerOrInitial as B
  return (source) => reduceImpl(source, reducer, initial)
}

export const toArray = <A>(source: ReadonlySet<A>): A[] => Array.from(source)
