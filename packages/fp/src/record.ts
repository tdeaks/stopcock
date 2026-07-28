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

type RefinedRecordTargets<Target extends MutableRecord<unknown>> =
  Target extends unknown
    ? Target extends MutableRecord<infer Value>
      ? MutableRecord<Value> extends Target
        ? never
        : Target
      : never
    : never

type EveryRecordTargetIsUnrefined<Target extends MutableRecord<unknown>> =
  [RefinedRecordTargets<Target>] extends [never] ? unknown : never

type CompatibleRecordTarget<Value, Target extends MutableRecord<unknown>> = Target &
  AcceptsAll<Value, MutableRecordValueCapacity<Target>> &
  EveryRecordTargetIsUnrefined<Target>

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
} = fromEntriesIntoImpl

export const clone = <A>(source: ReadonlyRecord<A>): MutableRecord<A> =>
  copyInto(source, create<A>())

export const keys = (source: object): PropertyKey[] => enumerableKeys(source)

export const values = <A>(source: ReadonlyRecord<A>): A[] => {
  const result: A[] = []
  for (const key of enumerableKeys(source)) result.push(source[key])
  return result
}

export const entries = <A>(source: ReadonlyRecord<A>): Array<readonly [PropertyKey, A]> => {
  const result: Array<readonly [PropertyKey, A]> = []
  for (const key of enumerableKeys(source)) result.push([key, source[key]])
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
  if (arguments.length === 1) {
    const search = sourceOrKey as PropertyKey
    return (source) => hasImpl(source, search)
  }
  return hasImpl(sourceOrKey as object, key as PropertyKey)
}

const getImpl = <A>(source: ReadonlyRecord<A>, key: PropertyKey): Option<A> =>
  hasImpl(source, key) ? some(source[key]) : none

export function get<A>(source: ReadonlyRecord<A>, key: PropertyKey): Option<A>
export function get(key: PropertyKey): <A>(source: ReadonlyRecord<A>) => Option<A>
export function get<A>(
  sourceOrKey: ReadonlyRecord<A> | PropertyKey,
  key?: PropertyKey,
): Option<A> | (<B>(source: ReadonlyRecord<B>) => Option<B>) {
  if (arguments.length === 1) {
    const search = sourceOrKey as PropertyKey
    return <B>(source: ReadonlyRecord<B>): Option<B> => getImpl(source, search)
  }
  return getImpl(sourceOrKey as ReadonlyRecord<A>, key as PropertyKey)
}

const getOrUndefinedImpl = <A>(source: ReadonlyRecord<A>, key: PropertyKey): A | undefined =>
  hasImpl(source, key) ? source[key] : undefined

export function getOrUndefined<A>(source: ReadonlyRecord<A>, key: PropertyKey): A | undefined
export function getOrUndefined(key: PropertyKey): <A>(source: ReadonlyRecord<A>) => A | undefined
export function getOrUndefined<A>(
  sourceOrKey: ReadonlyRecord<A> | PropertyKey,
  key?: PropertyKey,
): A | undefined | (<B>(source: ReadonlyRecord<B>) => B | undefined) {
  if (arguments.length === 1) {
    const search = sourceOrKey as PropertyKey
    return <B>(source: ReadonlyRecord<B>): B | undefined => getOrUndefinedImpl(source, search)
  }
  return getOrUndefinedImpl(sourceOrKey as ReadonlyRecord<A>, key as PropertyKey)
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
  if (arguments.length === 2) {
    const key = sourceOrKey as PropertyKey
    const next = keyOrValue as B
    return <C>(source: ReadonlyRecord<C>): MutableRecord<C | B> => setImpl(source, key, next)
  }
  return setImpl(sourceOrKey as ReadonlyRecord<A>, keyOrValue as PropertyKey, value as B)
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
  if (arguments.length === 1) {
    const excluded = sourceOrKey as PropertyKey
    return <B>(source: ReadonlyRecord<B>): MutableRecord<B> => removeImpl(source, excluded)
  }
  return removeImpl(sourceOrKey as ReadonlyRecord<A>, key as PropertyKey)
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
  if (arguments.length === 2) {
    const key = sourceOrKey as PropertyKey
    const transform = keyOrF as (value: A) => A
    return (source) => modifyImpl(source, key, transform)
  }
  return modifyImpl(sourceOrKey as ReadonlyRecord<A>, keyOrF as PropertyKey, f as (value: A) => A)
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
  if (arguments.length === 2) {
    const key = sourceOrKey as PropertyKey
    const transform = keyOrF as (value: Option<A>) => Option<A>
    return (source) => updateImpl(source, key, transform)
  }
  return updateImpl(
    sourceOrKey as ReadonlyRecord<A>,
    keyOrF as PropertyKey,
    f as (value: Option<A>) => Option<A>,
  )
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
  if (arguments.length === 1) {
    const transform = sourceOrF as (value: A, key: PropertyKey) => B
    return (source) => mapIntoImpl(source, create<B>(), transform)
  }
  return mapIntoImpl(
    sourceOrF as ReadonlyRecord<A>,
    create<B>(),
    f as (value: A, key: PropertyKey) => B,
  )
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
}

export const mapInto = mapIntoImpl as MapInto

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
  if (arguments.length === 1) {
    const test = sourceOrPredicate as (value: A, key: PropertyKey) => boolean
    return (source) => filterIntoImpl(source, create<A>(), test)
  }
  return filterIntoImpl(
    sourceOrPredicate as ReadonlyRecord<A>,
    create<A>(),
    predicate as (value: A, key: PropertyKey) => boolean,
  )
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
} = filterIntoImpl

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
  if (arguments.length === 1) {
    const transform = sourceOrF as (value: A, key: PropertyKey) => Option<B>
    return (source) => filterMapImpl(source, transform)
  }
  return filterMapImpl(
    sourceOrF as ReadonlyRecord<A>,
    f as (value: A, key: PropertyKey) => Option<B>,
  )
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
  if (arguments.length === 1) {
    const transform = sourceOrF as (key: PropertyKey, value: A) => PropertyKey
    return (source) => mapKeysImpl(source, transform)
  }
  return mapKeysImpl(
    sourceOrF as ReadonlyRecord<A>,
    f as (key: PropertyKey, value: A) => PropertyKey,
  )
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
  if (arguments.length === 1) {
    const right = sourceOrOther as ReadonlyRecord<B>
    return <C>(source: ReadonlyRecord<C>): MutableRecord<C | B> => mergeImpl(source, right)
  }
  return mergeImpl(sourceOrOther as ReadonlyRecord<A>, other as ReadonlyRecord<B>)
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
  if (arguments.length === 1) {
    const keys = sourceOrSelected as Iterable<PropertyKey>
    return <B>(source: ReadonlyRecord<B>): MutableRecord<B> => pickImpl(source, keys)
  }
  return pickImpl(sourceOrSelected as ReadonlyRecord<A>, selected as Iterable<PropertyKey>)
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
  if (arguments.length === 1) {
    const keys = sourceOrOmitted as Iterable<PropertyKey>
    return <B>(source: ReadonlyRecord<B>): MutableRecord<B> => omitImpl(source, keys)
  }
  return omitImpl(sourceOrOmitted as ReadonlyRecord<A>, omitted as Iterable<PropertyKey>)
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
  if (arguments.length === 1) {
    const test = sourceOrPredicate as (value: A, key: PropertyKey) => boolean
    return (source) => partitionImpl(source, test)
  }
  return partitionImpl(
    sourceOrPredicate as ReadonlyRecord<A>,
    predicate as (value: A, key: PropertyKey) => boolean,
  )
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
  if (arguments.length === 2) {
    const reducer = sourceOrReducer as (state: B, value: A, key: PropertyKey) => B
    const seed = reducerOrInitial as B
    return (source) => reduceImpl(source, reducer, seed)
  }
  return reduceImpl(
    sourceOrReducer as ReadonlyRecord<A>,
    reducerOrInitial as (state: B, value: A, key: PropertyKey) => B,
    initial as B,
  )
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
  if (arguments.length === 1) {
    const other = sourceOrOther
    return (source) => equalsImpl(source, other, Object.is)
  }
  if (typeof otherOrEqual === 'function') {
    const other = sourceOrOther
    return (source) => equalsImpl(source, other, otherOrEqual)
  }
  return equalsImpl(sourceOrOther, otherOrEqual as ReadonlyRecord<A>, equal)
}
