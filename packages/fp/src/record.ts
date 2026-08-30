import { none, some, type Option } from './option'

export type ReadonlyRecord<A> = {
  readonly [key: string]: A
  readonly [key: symbol]: A
}

export type MutableRecord<A> = {
  [key: string]: A
  [key: symbol]: A
}

type AcceptsAll<Source, Target> = [Source] extends [Target] ? unknown : never

type MutableRecordValueCapacity<Target extends MutableRecord<unknown>> = (
  Target extends MutableRecord<infer Value> ? (value: Value) => void : never
) extends (value: infer Value) => void
  ? Value
  : never

type RefinedRecordTargets<Target extends MutableRecord<unknown>> = Target extends unknown
  ? Target extends MutableRecord<infer Value>
    ? MutableRecord<Value> extends Target
      ? never
      : Target
    : never
  : never

type EveryRecordTargetIsUnrefined<Target extends MutableRecord<unknown>> = [
  RefinedRecordTargets<Target>,
] extends [never]
  ? unknown
  : never

type CompatibleRecordTarget<Value, Target extends MutableRecord<unknown>> = Target &
  AcceptsAll<Value, MutableRecordValueCapacity<Target>> &
  EveryRecordTargetIsUnrefined<Target>

type TransformInput<Transform> = Transform extends (
  value: infer Input,
  ...args: never[]
) => unknown
  ? Input
  : never

const create = <A>(): MutableRecord<A> => Object.create(null) as MutableRecord<A>

const enumerableKeys = (source: object): PropertyKey[] => {
  // Native `Object.keys` covers the whole string prefix in one call. Symbols
  // never carry an enumerable-string shortcut, so they still need an explicit
  // `propertyIsEnumerable` pass, appended after -- same order as
  // `Reflect.ownKeys` would give (strings, then symbols, each in their own
  // insertion order).
  const keys = Object.keys(source) as PropertyKey[]
  const symbols = Object.getOwnPropertySymbols(source)
  for (let index = 0; index < symbols.length; index++) {
    const symbol = symbols[index]!
    if (Object.prototype.propertyIsEnumerable.call(source, symbol)) keys.push(symbol)
  }
  return keys
}

const normalizeKey = (key: PropertyKey): string | symbol =>
  typeof key === 'number' ? String(key) : key

const writeOwn = (target: MutableRecord<unknown>, key: PropertyKey, value: unknown): void => {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
    return
  }
  target[key] = value
}

// `Object.assign` copies exactly the same own-enumerable string+symbol keys
// `enumerableKeys` would, in one native call, straight assignment semantics.
const copyInto = <A, Target extends MutableRecord<unknown>>(
  source: ReadonlyRecord<A>,
  target: Target,
): Target => Object.assign(target, source)

export const empty = <A = never>(): MutableRecord<A> => create()

export const fromEntries = <A>(entries: Iterable<readonly [PropertyKey, A]>): MutableRecord<A> =>
  fromEntriesIntoImpl(entries, create<A>())

const fromEntriesIntoImpl = <A, Target extends MutableRecord<unknown>>(
  entries: Iterable<readonly [PropertyKey, A]>,
  target: Target,
): Target => {
  const output = target as MutableRecord<unknown>
  for (const [key, value] of entries) writeOwn(output, key, value)
  return target
}

export const fromEntriesInto: {
  <A, Target extends MutableRecord<unknown>>(
    entries: Iterable<readonly [PropertyKey, A]>,
    target: CompatibleRecordTarget<A, Target>,
  ): Target
  <Target extends MutableRecord<unknown>>(
    target: Target & EveryRecordTargetIsUnrefined<Target>,
  ): <A extends MutableRecordValueCapacity<Target>>(
    entries: Iterable<readonly [PropertyKey, A]>,
  ) => Target
} = function fromEntriesInto(target: MutableRecord<unknown>, __df?: any): any {
  if (arguments.length >= 2) return (fromEntriesInto as any)(__df)(target)
  return (entries: Iterable<readonly [PropertyKey, unknown]>): MutableRecord<unknown> =>
    fromEntriesIntoImpl(entries, target)
} as any

export const clone = <A>(source: ReadonlyRecord<A>): MutableRecord<A> =>
  copyInto(source, create<A>())

export const keys = (source: object): PropertyKey[] => enumerableKeys(source)

export const values = <A>(source: ReadonlyRecord<A>): A[] => {
  const result: A[] = []
  for (const key of enumerableKeys(source)) result.push(source[key])
  return result
}

export const entries = <A>(source: ReadonlyRecord<A>): Array<readonly [PropertyKey, A]> => {
  // `Object.entries` is the same single-pass intrinsic as `Object.keys`, key
  // and value read together -- same trade as `enumerableKeys`, symbols
  // appended after.
  const result = Object.entries(source as Record<string, A>) as Array<[PropertyKey, A]>
  const symbols = Object.getOwnPropertySymbols(source)
  for (let index = 0; index < symbols.length; index++) {
    const symbol = symbols[index]!
    if (Object.prototype.propertyIsEnumerable.call(source, symbol))
      result.push([symbol, source[symbol]])
  }
  return result
}

export const size = (source: object): number => enumerableKeys(source).length

export const isEmpty = (source: object): boolean => {
  if (Object.keys(source).length > 0) return false
  const symbols = Object.getOwnPropertySymbols(source)
  for (let index = 0; index < symbols.length; index++) {
    if (Object.prototype.propertyIsEnumerable.call(source, symbols[index])) return false
  }
  return true
}

const hasImpl = (source: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(source, key)

export function has(source: object, key: PropertyKey): boolean
export function has(key: PropertyKey): (source: object) => boolean
export function has(
  sourceOrKey: object | PropertyKey,
  key?: PropertyKey,
): boolean | ((source: object) => boolean) {
  if (arguments.length !== 1) {
    return hasImpl(sourceOrKey as object, key as PropertyKey)
  }
  key = sourceOrKey as PropertyKey
  return (source) => hasImpl(source, key)
}

const getImpl = <A>(source: ReadonlyRecord<A>, key: PropertyKey): Option<A> =>
  hasImpl(source, key) ? some(source[key]) : none

export function get<A>(source: ReadonlyRecord<A>, key: PropertyKey): Option<A>
export function get(key: PropertyKey): <A>(source: ReadonlyRecord<A>) => Option<A>
export function get<A>(
  sourceOrKey: ReadonlyRecord<A> | PropertyKey,
  key?: PropertyKey,
): Option<A> | (<B>(source: ReadonlyRecord<B>) => Option<B>) {
  if (arguments.length !== 1) {
    return getImpl(sourceOrKey as ReadonlyRecord<A>, key as PropertyKey)
  }
  key = sourceOrKey as PropertyKey
  return <A>(source: ReadonlyRecord<A>): Option<A> => getImpl(source, key)
}

const getOrUndefinedImpl = <A>(source: ReadonlyRecord<A>, key: PropertyKey): A | undefined =>
  hasImpl(source, key) ? source[key] : undefined

export function getOrUndefined<A>(source: ReadonlyRecord<A>, key: PropertyKey): A | undefined
export function getOrUndefined(key: PropertyKey): <A>(source: ReadonlyRecord<A>) => A | undefined
export function getOrUndefined<A>(
  sourceOrKey: ReadonlyRecord<A> | PropertyKey,
  key?: PropertyKey,
): A | undefined | (<B>(source: ReadonlyRecord<B>) => B | undefined) {
  if (arguments.length !== 1) {
    return getOrUndefinedImpl(sourceOrKey as ReadonlyRecord<A>, key as PropertyKey)
  }
  key = sourceOrKey as PropertyKey
  return <A>(source: ReadonlyRecord<A>): A | undefined => getOrUndefinedImpl(source, key)
}

const setImpl = <A, B>(
  source: ReadonlyRecord<A>,
  key: PropertyKey,
  value: B,
): MutableRecord<A | B> => {
  const result = create<A | B>()
  copyInto(source, result)
  result[key] = value
  return result
}

export function set<A, B>(
  source: ReadonlyRecord<A>,
  key: PropertyKey,
  value: B,
): MutableRecord<A | B>
export function set<B>(
  key: PropertyKey,
  value: B,
): <A>(source: ReadonlyRecord<A>) => MutableRecord<A | B>
export function set<A, B>(
  sourceOrKey: ReadonlyRecord<A> | PropertyKey,
  keyOrValue: PropertyKey | B,
  value?: B,
): MutableRecord<A | B> | (<C>(source: ReadonlyRecord<C>) => MutableRecord<C | B>) {
  if (arguments.length !== 2) {
    return setImpl(sourceOrKey as ReadonlyRecord<A>, keyOrValue as PropertyKey, value as B)
  }
  const key = sourceOrKey as PropertyKey
  value = keyOrValue as B
  return <A>(source: ReadonlyRecord<A>): MutableRecord<A | B> => setImpl(source, key, value)
}

const removeImpl = <A>(source: ReadonlyRecord<A>, key: PropertyKey): MutableRecord<A> => {
  const excluded = normalizeKey(key)
  const result = create<A>()
  for (const current of enumerableKeys(source)) {
    if (current !== excluded) result[current] = source[current]
  }
  return result
}

export function remove<A>(source: ReadonlyRecord<A>, key: PropertyKey): MutableRecord<A>
export function remove(key: PropertyKey): <A>(source: ReadonlyRecord<A>) => MutableRecord<A>
export function remove<A>(
  sourceOrKey: ReadonlyRecord<A> | PropertyKey,
  key?: PropertyKey,
): MutableRecord<A> | (<B>(source: ReadonlyRecord<B>) => MutableRecord<B>) {
  if (arguments.length !== 1) {
    return removeImpl(sourceOrKey as ReadonlyRecord<A>, key as PropertyKey)
  }
  key = sourceOrKey as PropertyKey
  return <A>(source: ReadonlyRecord<A>): MutableRecord<A> => removeImpl(source, key)
}

const modifyImpl = <A>(
  source: ReadonlyRecord<A>,
  key: PropertyKey,
  f: (value: A) => A,
): MutableRecord<A> => {
  if (!hasImpl(source, key)) return clone(source)
  return setImpl(source, key, f(source[key]))
}

export function modify<A>(
  source: ReadonlyRecord<A>,
  key: PropertyKey,
  f: (value: A) => A,
): MutableRecord<A>
export function modify<A>(
  key: PropertyKey,
  f: (value: A) => A,
): (source: ReadonlyRecord<A>) => MutableRecord<A>
export function modify<A>(
  sourceOrKey: ReadonlyRecord<A> | PropertyKey,
  keyOrF: PropertyKey | ((value: A) => A),
  f?: (value: A) => A,
): MutableRecord<A> | ((source: ReadonlyRecord<A>) => MutableRecord<A>) {
  if (arguments.length !== 2) {
    return modifyImpl(sourceOrKey as ReadonlyRecord<A>, keyOrF as PropertyKey, f as (value: A) => A)
  }
  const key = sourceOrKey as PropertyKey
  f = keyOrF as (value: A) => A
  return (source) => modifyImpl(source, key, f)
}

const updateImpl = <A>(
  source: ReadonlyRecord<A>,
  key: PropertyKey,
  f: (value: Option<A>) => Option<A>,
): MutableRecord<A> => {
  const next = f(getImpl(source, key))
  return next._tag === 0 ? removeImpl(source, key) : setImpl(source, key, next.value)
}

export function update<A>(
  source: ReadonlyRecord<A>,
  key: PropertyKey,
  f: (value: Option<A>) => Option<A>,
): MutableRecord<A>
export function update<A>(
  key: PropertyKey,
  f: (value: Option<A>) => Option<A>,
): (source: ReadonlyRecord<A>) => MutableRecord<A>
export function update<A>(
  sourceOrKey: ReadonlyRecord<A> | PropertyKey,
  keyOrF: PropertyKey | ((value: Option<A>) => Option<A>),
  f?: (value: Option<A>) => Option<A>,
): MutableRecord<A> | ((source: ReadonlyRecord<A>) => MutableRecord<A>) {
  if (arguments.length !== 2) {
    return updateImpl(
      sourceOrKey as ReadonlyRecord<A>,
      keyOrF as PropertyKey,
      f as (value: Option<A>) => Option<A>,
    )
  }
  const key = sourceOrKey as PropertyKey
  f = keyOrF as (value: Option<A>) => Option<A>
  return (source) => updateImpl(source, key, f)
}

export function map<A, B>(
  source: ReadonlyRecord<A>,
  f: (value: A, key: PropertyKey) => B,
): MutableRecord<B>
export function map<A, B>(
  f: (value: A, key: PropertyKey) => B,
): (source: ReadonlyRecord<A>) => MutableRecord<B>
export function map<A, B>(
  sourceOrF: ReadonlyRecord<A> | ((value: A, key: PropertyKey) => B),
  f?: (value: A, key: PropertyKey) => B,
): MutableRecord<B> | ((source: ReadonlyRecord<A>) => MutableRecord<B>) {
  if (arguments.length !== 1) {
    return mapIntoImpl(
      sourceOrF as ReadonlyRecord<A>,
      create<B>(),
      f as (value: A, key: PropertyKey) => B,
    )
  }
  f = sourceOrF as (value: A, key: PropertyKey) => B
  return (source) => mapIntoImpl(source, create<B>(), f)
}

const mapIntoImpl = <A, B, Target extends MutableRecord<unknown>>(
  source: ReadonlyRecord<A>,
  target: Target,
  f: (value: A, key: PropertyKey) => B,
): Target => {
  const output = target as MutableRecord<unknown>
  for (const key of enumerableKeys(source)) writeOwn(output, key, f(source[key], key))
  return target
}

interface MapInto {
  <A, Target extends MutableRecord<unknown>, B extends MutableRecordValueCapacity<Target>>(
    source: ReadonlyRecord<A>,
    target: Target & EveryRecordTargetIsUnrefined<Target>,
    f: (value: A, key: PropertyKey) => B,
  ): Target
  <
    Target extends MutableRecord<unknown>,
    Transform extends (...args: never[]) => MutableRecordValueCapacity<NoInfer<Target>>,
  >(
    target: Target & EveryRecordTargetIsUnrefined<Target>,
    f: Transform,
  ): (source: ReadonlyRecord<TransformInput<Transform>>) => Target
}

export const mapInto: MapInto = function mapInto(
  target: MutableRecord<unknown>,
  f: (value: unknown, key: PropertyKey) => unknown,
  __df?: any,
): any {
  if (arguments.length >= 3) return (mapInto as any)(f, __df)(target)
  return (source: ReadonlyRecord<unknown>): MutableRecord<unknown> =>
    mapIntoImpl(source, target, f)
} as any

export function filter<A, B extends A>(
  source: ReadonlyRecord<A>,
  predicate: (value: A, key: PropertyKey) => value is B,
): MutableRecord<B>
export function filter<A>(
  source: ReadonlyRecord<A>,
  predicate: (value: A, key: PropertyKey) => boolean,
): MutableRecord<A>
export function filter<A, B extends A>(
  predicate: (value: A, key: PropertyKey) => value is B,
): (source: ReadonlyRecord<A>) => MutableRecord<B>
export function filter<A>(
  predicate: (value: A, key: PropertyKey) => boolean,
): (source: ReadonlyRecord<A>) => MutableRecord<A>
export function filter<A>(
  sourceOrPredicate: ReadonlyRecord<A> | ((value: A, key: PropertyKey) => boolean),
  predicate?: (value: A, key: PropertyKey) => boolean,
): MutableRecord<A> | ((source: ReadonlyRecord<A>) => MutableRecord<A>) {
  if (arguments.length !== 1) {
    return filterIntoImpl(
      sourceOrPredicate as ReadonlyRecord<A>,
      create<A>(),
      predicate as (value: A, key: PropertyKey) => boolean,
    )
  }
  predicate = sourceOrPredicate as (value: A, key: PropertyKey) => boolean
  return (source) => filterIntoImpl(source, create<A>(), predicate)
}

const filterIntoImpl = <A, Target extends MutableRecord<unknown>>(
  source: ReadonlyRecord<A>,
  target: Target,
  predicate: (value: A, key: PropertyKey) => boolean,
): Target => {
  const output = target as MutableRecord<unknown>
  for (const key of enumerableKeys(source)) {
    const value = source[key]
    if (predicate(value, key)) writeOwn(output, key, value)
  }
  return target
}

export const filterInto: {
  <A, B extends A, Target extends MutableRecord<unknown>>(
    source: ReadonlyRecord<A>,
    target: CompatibleRecordTarget<B, Target>,
    predicate: (value: A, key: PropertyKey) => value is B,
  ): Target
  <A, Target extends MutableRecord<unknown>>(
    source: ReadonlyRecord<A>,
    target: CompatibleRecordTarget<A, Target>,
    predicate: (value: A, key: PropertyKey) => boolean,
  ): Target
  <A, B extends A, Target extends MutableRecord<unknown>>(
    target: CompatibleRecordTarget<B, Target>,
    predicate: (value: A, key: PropertyKey) => value is B,
  ): (source: ReadonlyRecord<A>) => Target
  <A, Target extends MutableRecord<unknown>>(
    target: CompatibleRecordTarget<A, Target>,
    predicate: (value: A, key: PropertyKey) => boolean,
  ): (source: ReadonlyRecord<A>) => Target
} = function filterInto(
  target: MutableRecord<unknown>,
  predicate: (value: unknown, key: PropertyKey) => boolean,
  __df?: any,
): any {
  if (arguments.length >= 3) return (filterInto as any)(predicate, __df)(target)
  return (source: ReadonlyRecord<unknown>): MutableRecord<unknown> =>
    filterIntoImpl(source, target, predicate)
} as any

const filterMapImpl = <A, B>(
  source: ReadonlyRecord<A>,
  f: (value: A, key: PropertyKey) => Option<B>,
): MutableRecord<B> => {
  const result = create<B>()
  for (const key of enumerableKeys(source)) {
    const value = f(source[key], key)
    if (value._tag === 1) result[key] = value.value
  }
  return result
}

export function filterMap<A, B>(
  source: ReadonlyRecord<A>,
  f: (value: A, key: PropertyKey) => Option<B>,
): MutableRecord<B>
export function filterMap<A, B>(
  f: (value: A, key: PropertyKey) => Option<B>,
): (source: ReadonlyRecord<A>) => MutableRecord<B>
export function filterMap<A, B>(
  sourceOrF: ReadonlyRecord<A> | ((value: A, key: PropertyKey) => Option<B>),
  f?: (value: A, key: PropertyKey) => Option<B>,
): MutableRecord<B> | ((source: ReadonlyRecord<A>) => MutableRecord<B>) {
  if (arguments.length !== 1) {
    return filterMapImpl(
      sourceOrF as ReadonlyRecord<A>,
      f as (value: A, key: PropertyKey) => Option<B>,
    )
  }
  f = sourceOrF as (value: A, key: PropertyKey) => Option<B>
  return (source) => filterMapImpl(source, f)
}

const mapKeysImpl = <A>(
  source: ReadonlyRecord<A>,
  f: (key: PropertyKey, value: A) => PropertyKey,
): MutableRecord<A> => {
  const result = create<A>()
  for (const key of enumerableKeys(source)) result[f(key, source[key])] = source[key]
  return result
}

export function mapKeys<A>(
  source: ReadonlyRecord<A>,
  f: (key: PropertyKey, value: A) => PropertyKey,
): MutableRecord<A>
export function mapKeys(
  f: (key: PropertyKey) => PropertyKey,
): <A>(source: ReadonlyRecord<A>) => MutableRecord<A>
export function mapKeys<A>(
  f: (key: PropertyKey, value: A) => PropertyKey,
): (source: ReadonlyRecord<A>) => MutableRecord<A>
export function mapKeys<A>(
  sourceOrF: ReadonlyRecord<A> | ((key: PropertyKey, value: A) => PropertyKey),
  f?: (key: PropertyKey, value: A) => PropertyKey,
): MutableRecord<A> | ((source: ReadonlyRecord<A>) => MutableRecord<A>) {
  if (arguments.length !== 1) {
    return mapKeysImpl(
      sourceOrF as ReadonlyRecord<A>,
      f as (key: PropertyKey, value: A) => PropertyKey,
    )
  }
  f = sourceOrF as (key: PropertyKey, value: A) => PropertyKey
  return (source) => mapKeysImpl(source, f)
}

const mergeImpl = <A, B>(
  source: ReadonlyRecord<A>,
  other: ReadonlyRecord<B>,
): MutableRecord<A | B> => Object.assign(create<A | B>(), source, other)

export function merge<A, B>(
  source: ReadonlyRecord<A>,
  other: ReadonlyRecord<B>,
): MutableRecord<A | B>
export function merge<B>(
  other: ReadonlyRecord<B>,
): <A>(source: ReadonlyRecord<A>) => MutableRecord<A | B>
export function merge<A, B>(
  sourceOrOther: ReadonlyRecord<A> | ReadonlyRecord<B>,
  other?: ReadonlyRecord<B>,
): MutableRecord<A | B> | (<C>(source: ReadonlyRecord<C>) => MutableRecord<C | B>) {
  if (arguments.length !== 1) {
    return mergeImpl(sourceOrOther as ReadonlyRecord<A>, other as ReadonlyRecord<B>)
  }
  other = sourceOrOther as ReadonlyRecord<B>
  return <A>(source: ReadonlyRecord<A>): MutableRecord<A | B> => mergeImpl(source, other)
}

const pickImpl = <A>(
  source: ReadonlyRecord<A>,
  selected: Iterable<PropertyKey>,
): MutableRecord<A> => {
  const result = create<A>()
  for (const key of selected) {
    if (hasImpl(source, key)) result[key] = source[key]
  }
  return result
}

export function pick<A>(
  source: ReadonlyRecord<A>,
  selected: Iterable<PropertyKey>,
): MutableRecord<A>
export function pick(
  selected: Iterable<PropertyKey>,
): <A>(source: ReadonlyRecord<A>) => MutableRecord<A>
export function pick<A>(
  sourceOrSelected: ReadonlyRecord<A> | Iterable<PropertyKey>,
  selected?: Iterable<PropertyKey>,
): MutableRecord<A> | (<B>(source: ReadonlyRecord<B>) => MutableRecord<B>) {
  if (arguments.length !== 1) {
    return pickImpl(sourceOrSelected as ReadonlyRecord<A>, selected as Iterable<PropertyKey>)
  }
  selected = sourceOrSelected as Iterable<PropertyKey>
  return <A>(source: ReadonlyRecord<A>): MutableRecord<A> => pickImpl(source, selected)
}

const omitImpl = <A>(
  source: ReadonlyRecord<A>,
  omitted: Iterable<PropertyKey>,
): MutableRecord<A> => {
  const excluded = new Set<string | symbol>()
  for (const key of omitted) excluded.add(normalizeKey(key))
  const result = create<A>()
  for (const key of enumerableKeys(source)) {
    if (!excluded.has(normalizeKey(key))) result[key] = source[key]
  }
  return result
}

export function omit<A>(source: ReadonlyRecord<A>, omitted: Iterable<PropertyKey>): MutableRecord<A>
export function omit(
  omitted: Iterable<PropertyKey>,
): <A>(source: ReadonlyRecord<A>) => MutableRecord<A>
export function omit<A>(
  sourceOrOmitted: ReadonlyRecord<A> | Iterable<PropertyKey>,
  omitted?: Iterable<PropertyKey>,
): MutableRecord<A> | (<B>(source: ReadonlyRecord<B>) => MutableRecord<B>) {
  if (arguments.length !== 1) {
    return omitImpl(sourceOrOmitted as ReadonlyRecord<A>, omitted as Iterable<PropertyKey>)
  }
  omitted = sourceOrOmitted as Iterable<PropertyKey>
  return <A>(source: ReadonlyRecord<A>): MutableRecord<A> => omitImpl(source, omitted)
}

const partitionImpl = <A>(
  source: ReadonlyRecord<A>,
  predicate: (value: A, key: PropertyKey) => boolean,
): readonly [accepted: MutableRecord<A>, rejected: MutableRecord<A>] => {
  const accepted = create<A>()
  const rejected = create<A>()
  for (const key of enumerableKeys(source)) {
    const value = source[key]
    ;(predicate(value, key) ? accepted : rejected)[key] = value
  }
  return [accepted, rejected]
}

export function partition<A, B extends A>(
  source: ReadonlyRecord<A>,
  predicate: (value: A, key: PropertyKey) => value is B,
): readonly [accepted: MutableRecord<B>, rejected: MutableRecord<Exclude<A, B>>]
export function partition<A>(
  source: ReadonlyRecord<A>,
  predicate: (value: A, key: PropertyKey) => boolean,
): readonly [accepted: MutableRecord<A>, rejected: MutableRecord<A>]
export function partition<A, B extends A>(
  predicate: (value: A, key: PropertyKey) => value is B,
): (
  source: ReadonlyRecord<A>,
) => readonly [accepted: MutableRecord<B>, rejected: MutableRecord<Exclude<A, B>>]
export function partition<A>(
  predicate: (value: A, key: PropertyKey) => boolean,
): (source: ReadonlyRecord<A>) => readonly [accepted: MutableRecord<A>, rejected: MutableRecord<A>]
export function partition<A>(
  sourceOrPredicate: ReadonlyRecord<A> | ((value: A, key: PropertyKey) => boolean),
  predicate?: (value: A, key: PropertyKey) => boolean,
):
  | readonly [accepted: MutableRecord<A>, rejected: MutableRecord<A>]
  | ((
      source: ReadonlyRecord<A>,
    ) => readonly [accepted: MutableRecord<A>, rejected: MutableRecord<A>]) {
  if (arguments.length !== 1) {
    return partitionImpl(
      sourceOrPredicate as ReadonlyRecord<A>,
      predicate as (value: A, key: PropertyKey) => boolean,
    )
  }
  predicate = sourceOrPredicate as (value: A, key: PropertyKey) => boolean
  return (source) => partitionImpl(source, predicate)
}

const reduceImpl = <A, B>(
  source: ReadonlyRecord<A>,
  reducer: (state: B, value: A, key: PropertyKey) => B,
  initial: B,
): B => {
  let state = initial
  for (const key of enumerableKeys(source)) state = reducer(state, source[key], key)
  return state
}

export function reduce<A, B>(
  source: ReadonlyRecord<A>,
  reducer: (state: B, value: A, key: PropertyKey) => B,
  initial: B,
): B
export function reduce<A, B>(
  reducer: (state: B, value: A, key: PropertyKey) => B,
  initial: B,
): (source: ReadonlyRecord<A>) => B
export function reduce<A, B>(
  sourceOrReducer: ReadonlyRecord<A> | ((state: B, value: A, key: PropertyKey) => B),
  reducerOrInitial: ((state: B, value: A, key: PropertyKey) => B) | B,
  initial?: B,
): B | ((source: ReadonlyRecord<A>) => B) {
  if (arguments.length !== 2) {
    return reduceImpl(
      sourceOrReducer as ReadonlyRecord<A>,
      reducerOrInitial as (state: B, value: A, key: PropertyKey) => B,
      initial as B,
    )
  }
  const reducer = sourceOrReducer as (state: B, value: A, key: PropertyKey) => B
  initial = reducerOrInitial as B
  return (source) => reduceImpl(source, reducer, initial)
}

const equalsImpl = <A>(
  source: ReadonlyRecord<A>,
  other: ReadonlyRecord<A>,
  equal: (left: A, right: A) => boolean,
): boolean => {
  const sourceKeys = enumerableKeys(source)
  if (sourceKeys.length !== enumerableKeys(other).length) return false
  for (const key of sourceKeys) {
    if (!hasImpl(other, key) || !equal(source[key], other[key])) return false
  }
  return true
}

type NonRuntimeFunction<T> = T extends
  | ((...arguments_: never[]) => unknown)
  | (abstract new (...arguments_: never[]) => unknown)
  ? never
  : T

type RecordValue<T extends ReadonlyRecord<unknown>> = T extends ReadonlyRecord<infer A> ? A : never

export function equals<A, Other extends ReadonlyRecord<A>>(
  source: ReadonlyRecord<A>,
  other: Other & NonRuntimeFunction<Other>,
  equal?: (left: A, right: A) => boolean,
): boolean
export function equals<Other extends ReadonlyRecord<unknown>>(
  other: Other,
): (source: ReadonlyRecord<RecordValue<Other>>) => boolean
export function equals<Other extends ReadonlyRecord<unknown>>(
  other: Other,
  equal: (left: RecordValue<Other>, right: RecordValue<Other>) => boolean,
): (source: ReadonlyRecord<RecordValue<Other>>) => boolean
export function equals<A>(
  sourceOrOther: ReadonlyRecord<A>,
  otherOrEqual?: ReadonlyRecord<A> | ((left: A, right: A) => boolean),
  equal: (left: A, right: A) => boolean = Object.is,
): boolean | ((source: ReadonlyRecord<A>) => boolean) {
  if (arguments.length >= 2 && typeof otherOrEqual !== 'function') {
    return equalsImpl(sourceOrOther, otherOrEqual as ReadonlyRecord<A>, equal)
  }
  const other = sourceOrOther
  equal = typeof otherOrEqual === 'function' ? otherOrEqual : Object.is
  return (source) => equalsImpl(source, other, equal)
}
