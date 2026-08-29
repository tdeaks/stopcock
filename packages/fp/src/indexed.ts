import { none, some as optionSome, type Option } from './option'

/**
 * The common dense-by-index surface shared by arrays and typed arrays.
 * Sparse JavaScript arrays are deliberately visited at every index; a hole is
 * observed as `undefined`, matching array iteration rather than callback
 * methods such as `Array.prototype.map`.
 */
export interface Indexed<A> {
  readonly length: number
  readonly [index: number]: A
}

export interface WritableIndexed<A> {
  readonly length: number
  [index: number]: A
}

type IndexedElement<Source extends Indexed<unknown>> = Source[number]

type WritableIndexedTargetElementCapacity<Target extends WritableIndexed<unknown>> = (
  Target extends unknown ? (value: Target[number]) => void : never
) extends (value: infer Capacity) => void
  ? Capacity
  : never

type RejectingWritableIndexedTargets<
  Value,
  Target extends WritableIndexed<unknown>,
> = Target extends unknown ? ([Value] extends [Target[number]] ? never : Target) : never

type FixedLengthWritableIndexedTargets<Target extends WritableIndexed<unknown>> =
  Target extends unknown ? (number extends Target['length'] ? never : Target) : never

type EveryWritableIndexedTargetAccepts<Value, Target extends WritableIndexed<unknown>> = [
  RejectingWritableIndexedTargets<Value, Target>,
] extends [never]
  ? unknown
  : never

type EveryWritableIndexedTargetHasDynamicLength<Target extends WritableIndexed<unknown>> = [
  FixedLengthWritableIndexedTargets<Target>,
] extends [never]
  ? unknown
  : never

type IsUnion<Value, Whole = Value> = Value extends Whole
  ? [Whole] extends [Value]
    ? false
    : true
  : never

type EveryWritableIndexedTargetIsConcrete<Target extends WritableIndexed<unknown>> =
  true extends IsUnion<Target> ? never : unknown

type WritableIndexedTargetCapacity<
  Value,
  Target extends WritableIndexed<unknown>,
> = EveryWritableIndexedTargetAccepts<Value, Target> &
  EveryWritableIndexedTargetHasDynamicLength<Target> &
  EveryWritableIndexedTargetIsConcrete<Target>

const sameValueZero = (left: unknown, right: unknown): boolean =>
  left === right || (left !== left && right !== right)

const bound = (length: number, index: number): number => {
  if (index === (index | 0)) {
    if (index < 0) {
      const shifted = length + index
      return shifted > 0 ? shifted : 0
    }
    return index < length ? index : length
  }
  const candidate =
    index < 0 ? Math.max(length + Math.trunc(index), 0) : Math.min(Math.trunc(index), length)
  return Number.isNaN(candidate) ? 0 : candidate
}

export const length = (source: Indexed<unknown>): number => source.length

export const isEmpty = (source: Indexed<unknown>): boolean => source.length === 0

const atOrUndefinedImpl = <A>(source: Indexed<A>, index: number): A | undefined => {
  const normalized = index < 0 ? source.length + index : index
  return Number.isSafeInteger(normalized) && normalized >= 0 && normalized < source.length
    ? (source[normalized] as A)
    : undefined
}

export function atOrUndefined<A>(source: Indexed<A>, index: number): A | undefined
export function atOrUndefined(index: number): <A>(source: Indexed<A>) => A | undefined
export function atOrUndefined<A>(
  sourceOrIndex: Indexed<A> | number,
  index?: number,
): A | undefined | (<B>(source: Indexed<B>) => B | undefined) {
  if (arguments.length !== 1) {
    return atOrUndefinedImpl(sourceOrIndex as Indexed<A>, index as number)
  }
  index = sourceOrIndex as number
  return <B>(source: Indexed<B>): B | undefined => atOrUndefinedImpl(source, index)
}

const atImpl = <A>(source: Indexed<A>, index: number): Option<A> => {
  const normalized = index < 0 ? source.length + index : index
  return Number.isSafeInteger(normalized) && normalized >= 0 && normalized < source.length
    ? optionSome(source[normalized] as A)
    : none
}

export function at<A>(source: Indexed<A>, index: number): Option<A>
export function at(index: number): <A>(source: Indexed<A>) => Option<A>
export function at<A>(
  sourceOrIndex: Indexed<A> | number,
  index?: number,
): Option<A> | (<B>(source: Indexed<B>) => Option<B>) {
  if (arguments.length !== 1) return atImpl(sourceOrIndex as Indexed<A>, index as number)
  index = sourceOrIndex as number
  return <B>(source: Indexed<B>): Option<B> => atImpl(source, index)
}

export const headOrUndefined = <A>(source: Indexed<A>): A | undefined => atOrUndefined(source, 0)

export const head = <A>(source: Indexed<A>): Option<A> => at(source, 0)

export const lastOrUndefined = <A>(source: Indexed<A>): A | undefined => atOrUndefined(source, -1)

export const last = <A>(source: Indexed<A>): Option<A> => at(source, -1)

export const toArray = <A>(source: Indexed<A>): A[] => {
  const result = new Array<A>(source.length)
  for (let index = 0; index < source.length; index++) result[index] = source[index] as A
  return result
}

const sliceImpl = <A>(source: Indexed<A>, start = 0, end = source.length): A[] => {
  const length = source.length
  const from = bound(length, start)
  const to = Math.max(from, bound(length, end))
  const result = new Array<A>(to - from)
  for (let index = from; index < to; index++) result[index - from] = source[index] as A
  return result
}

export function slice<A>(source: Indexed<A>, start?: number, end?: number): A[]
export function slice(start?: number, end?: number): <A>(source: Indexed<A>) => A[]
export function slice<A>(
  sourceOrStart?: Indexed<A> | number,
  startOrEnd?: number,
  maybeEnd?: number,
): A[] | (<B>(source: Indexed<B>) => B[]) {
  if (typeof sourceOrStart !== 'number' && sourceOrStart !== undefined) {
    return sliceImpl(sourceOrStart, startOrEnd, maybeEnd)
  }
  const start = sourceOrStart
  const end = startOrEnd
  return <B>(source: Indexed<B>): B[] => sliceImpl(source, start, end)
}

const copyIntoImpl = <Source extends Indexed<unknown>, Target extends WritableIndexed<unknown>>(
  source: Source,
  target: Target,
  targetOffset = 0,
  start = 0,
  end = source.length,
): Target => {
  const length = source.length
  const from = bound(length, start)
  const to = Math.max(from, bound(length, end))
  const offset = Math.trunc(targetOffset)
  const count = to - from
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + count > target.length) {
    throw new RangeError('Indexed.copyInto: target range is out of bounds')
  }

  const output = target as WritableIndexed<unknown>
  if ((source as unknown) === target && offset > from && offset < to) {
    for (let index = count - 1; index >= 0; index--) {
      output[offset + index] = source[from + index]
    }
  } else {
    for (let index = 0; index < count; index++) {
      output[offset + index] = source[from + index]
    }
  }
  return target
}

interface CopyIntoOperation {
  <Source extends Indexed<unknown>, const Target extends WritableIndexed<unknown>>(
    source: Source,
    target: Target,
    targetOffset?: number,
    start?: number,
    end?: number,
    ..._capacity: [] & WritableIndexedTargetCapacity<IndexedElement<Source>, Target>
  ): Target
  <const Target extends WritableIndexed<unknown>>(
    target: Target,
    targetOffset?: number,
    start?: number,
    end?: number,
  ): <Source extends Indexed<unknown>>(
    source: Source,
    ..._capacity: [] & WritableIndexedTargetCapacity<IndexedElement<Source>, Target>
  ) => Target
}

export const copyInto: CopyIntoOperation = function copyInto(
  sourceOrTarget: Indexed<unknown> | WritableIndexed<unknown>,
  targetOrOffset?: WritableIndexed<unknown> | number,
  offsetOrStart?: number,
  startOrEnd?: number,
  maybeEnd?: number,
): unknown {
  if (targetOrOffset === undefined || typeof targetOrOffset === 'number') {
    const target = sourceOrTarget as WritableIndexed<unknown>
    const targetOffset = targetOrOffset ?? 0
    const start = offsetOrStart ?? 0
    const end = startOrEnd
    return (source: Indexed<unknown>): WritableIndexed<unknown> =>
      copyIntoImpl(source, target, targetOffset, start, end)
  }
  return copyIntoImpl(
    sourceOrTarget as Indexed<unknown>,
    targetOrOffset,
    offsetOrStart,
    startOrEnd,
    maybeEnd,
  )
} as CopyIntoOperation

const mapImpl = <A, B>(source: Indexed<A>, f: (value: A, index: number) => B): B[] => {
  const result = new Array<B>(source.length)
  for (let index = 0; index < source.length; index++) {
    result[index] = f(source[index] as A, index)
  }
  return result
}

export function map<A, B>(source: Indexed<A>, f: (value: A, index: number) => B): B[]
export function map<A, B>(f: (value: A, index: number) => B): (source: Indexed<A>) => B[]
export function map<A, B>(
  sourceOrF: Indexed<A> | ((value: A, index: number) => B),
  f?: (value: A, index: number) => B,
): B[] | ((source: Indexed<A>) => B[]) {
  if (arguments.length !== 1) {
    return mapImpl(sourceOrF as Indexed<A>, f as (value: A, index: number) => B)
  }
  f = sourceOrF as (value: A, index: number) => B
  return (source: Indexed<A>): B[] => mapImpl(source, f)
}

const mapIntoImpl = <
  Source extends Indexed<unknown>,
  Output,
  Target extends WritableIndexed<unknown>,
>(
  source: Source,
  target: Target,
  f: (value: IndexedElement<Source>, index: number) => Output,
  targetOffset = 0,
): Target => {
  const offset = Math.trunc(targetOffset)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + source.length > target.length) {
    throw new RangeError('Indexed.mapInto: target range is out of bounds')
  }
  const output = target as WritableIndexed<unknown>
  for (let index = 0; index < source.length; index++) {
    output[offset + index] = f(source[index] as IndexedElement<Source>, index)
  }
  return target
}

interface MapIntoOperation {
  <
    Source extends Indexed<unknown>,
    const Target extends WritableIndexed<unknown>,
    Output extends WritableIndexedTargetElementCapacity<NoInfer<Target>>,
  >(
    source: Source,
    target: Target,
    f: (value: IndexedElement<NoInfer<Source>>, index: number) => Output,
    targetOffset?: number,
    ..._capacity: [] &
      EveryWritableIndexedTargetHasDynamicLength<Target> &
      EveryWritableIndexedTargetIsConcrete<Target>
  ): Target
  <
    A,
    const Target extends WritableIndexed<unknown>,
    Output extends WritableIndexedTargetElementCapacity<NoInfer<Target>>,
  >(
    target: Target,
    f: (value: A, index: number) => Output,
    targetOffset?: number,
  ): (source: Indexed<A>) => Target
}

export const mapInto: MapIntoOperation = function mapInto(
  sourceOrTarget: Indexed<unknown> | WritableIndexed<unknown>,
  targetOrF: WritableIndexed<unknown> | ((value: unknown, index: number) => unknown),
  fOrOffset?: ((value: unknown, index: number) => unknown) | number,
  targetOffset = 0,
): unknown {
  if (typeof targetOrF === 'function') {
    const target = sourceOrTarget as WritableIndexed<unknown>
    const f = targetOrF
    const offset = (fOrOffset as number | undefined) ?? 0
    return (source: Indexed<unknown>): WritableIndexed<unknown> =>
      mapIntoImpl(source, target, f, offset)
  }
  return mapIntoImpl(
    sourceOrTarget as Indexed<unknown>,
    targetOrF,
    fOrOffset as (value: unknown, index: number) => unknown,
    targetOffset,
  )
} as MapIntoOperation

export function filter<A, B extends A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => value is B,
): B[]
export function filter<A>(source: Indexed<A>, predicate: (value: A, index: number) => boolean): A[]
export function filter<A, B extends A>(
  predicate: (value: A, index: number) => value is B,
): (source: Indexed<A>) => B[]
export function filter<A>(
  predicate: (value: A, index: number) => boolean,
): (source: Indexed<A>) => A[]
export function filter<A>(
  sourceOrPredicate: Indexed<A> | ((value: A, index: number) => boolean),
  predicate?: (value: A, index: number) => boolean,
): A[] | ((source: Indexed<A>) => A[]) {
  if (arguments.length !== 1) {
    return filterIntoImpl(
      sourceOrPredicate as Indexed<A>,
      new Array<A>(),
      predicate as (value: A, index: number) => boolean,
    )
  }
  predicate = sourceOrPredicate as (value: A, index: number) => boolean
  return (source: Indexed<A>): A[] => filterIntoImpl(source, new Array<A>(), predicate)
}

const filterIntoImpl = <Source extends Indexed<unknown>, Target extends unknown[]>(
  source: Source,
  target: Target,
  predicate: (value: IndexedElement<Source>, index: number) => boolean,
): Target => {
  for (let index = 0; index < source.length; index++) {
    const value = source[index] as IndexedElement<Source>
    if (predicate(value, index)) target.push(value)
  }
  return target
}

interface FilterIntoOperation {
  <
    Source extends Indexed<unknown>,
    Narrowed extends IndexedElement<Source>,
    const Target extends unknown[],
  >(
    source: Source,
    target: Target,
    predicate: (value: IndexedElement<NoInfer<Source>>, index: number) => value is Narrowed,
    ..._capacity: [] & WritableIndexedTargetCapacity<Narrowed, Target>
  ): Target
  <Source extends Indexed<unknown>, const Target extends unknown[]>(
    source: Source,
    target: Target,
    predicate: (value: IndexedElement<NoInfer<Source>>, index: number) => boolean,
    ..._capacity: [] & WritableIndexedTargetCapacity<IndexedElement<Source>, Target>
  ): Target
  <A, B extends A, const Target extends unknown[]>(
    target: Target,
    predicate: (value: A, index: number) => value is B,
  ): (source: Indexed<A>, ..._capacity: [] & WritableIndexedTargetCapacity<B, Target>) => Target
  <A, const Target extends unknown[]>(
    target: Target,
    predicate: (value: A, index: number) => boolean,
  ): (source: Indexed<A>, ..._capacity: [] & WritableIndexedTargetCapacity<A, Target>) => Target
}

export const filterInto: FilterIntoOperation = function filterInto(
  sourceOrTarget: Indexed<unknown> | unknown[],
  targetOrPredicate: unknown[] | ((value: unknown, index: number) => boolean),
  maybePredicate?: (value: unknown, index: number) => boolean,
): unknown {
  if (typeof targetOrPredicate === 'function') {
    const target = sourceOrTarget as unknown[]
    const predicate = targetOrPredicate
    return (source: Indexed<unknown>): unknown[] => filterIntoImpl(source, target, predicate)
  }
  return filterIntoImpl(
    sourceOrTarget as Indexed<unknown>,
    targetOrPredicate,
    maybePredicate as (value: unknown, index: number) => boolean,
  )
} as FilterIntoOperation

const filterMapImpl = <A, B>(
  source: Indexed<A>,
  f: (value: A, index: number) => Option<B>,
): B[] => {
  const result: B[] = []
  for (let index = 0; index < source.length; index++) {
    const next = f(source[index] as A, index)
    if (next._tag === 1) result.push(next.value)
  }
  return result
}

export function filterMap<A, B>(source: Indexed<A>, f: (value: A, index: number) => Option<B>): B[]
export function filterMap<A, B>(
  f: (value: A, index: number) => Option<B>,
): (source: Indexed<A>) => B[]
export function filterMap<A, B>(
  sourceOrF: Indexed<A> | ((value: A, index: number) => Option<B>),
  f?: (value: A, index: number) => Option<B>,
): B[] | ((source: Indexed<A>) => B[]) {
  if (arguments.length !== 1) {
    return filterMapImpl(sourceOrF as Indexed<A>, f as (value: A, index: number) => Option<B>)
  }
  f = sourceOrF as (value: A, index: number) => Option<B>
  return (source: Indexed<A>): B[] => filterMapImpl(source, f)
}

const reduceImpl = <A, B>(
  source: Indexed<A>,
  reducer: (state: B, value: A, index: number) => B,
  initial: B,
): B => {
  let state = initial
  for (let index = 0; index < source.length; index++) {
    state = reducer(state, source[index] as A, index)
  }
  return state
}

export function reduce<A, B>(
  source: Indexed<A>,
  reducer: (state: B, value: A, index: number) => B,
  initial: B,
): B
export function reduce<A, B>(
  reducer: (state: B, value: A, index: number) => B,
  initial: B,
): (source: Indexed<A>) => B
export function reduce<A, B>(
  sourceOrReducer: Indexed<A> | ((state: B, value: A, index: number) => B),
  reducerOrInitial: ((state: B, value: A, index: number) => B) | B,
  maybeInitial?: B,
): B | ((source: Indexed<A>) => B) {
  if (arguments.length >= 3) {
    return reduceImpl(
      sourceOrReducer as Indexed<A>,
      reducerOrInitial as (state: B, value: A, index: number) => B,
      maybeInitial as B,
    )
  }
  const reducer = sourceOrReducer as (state: B, value: A, index: number) => B
  const initial = reducerOrInitial as B
  return (source: Indexed<A>): B => reduceImpl(source, reducer, initial)
}

const reduceRightImpl = <A, B>(
  source: Indexed<A>,
  reducer: (state: B, value: A, index: number) => B,
  initial: B,
): B => {
  let state = initial
  for (let index = source.length - 1; index >= 0; index--) {
    state = reducer(state, source[index] as A, index)
  }
  return state
}

export function reduceRight<A, B>(
  source: Indexed<A>,
  reducer: (state: B, value: A, index: number) => B,
  initial: B,
): B
export function reduceRight<A, B>(
  reducer: (state: B, value: A, index: number) => B,
  initial: B,
): (source: Indexed<A>) => B
export function reduceRight<A, B>(
  sourceOrReducer: Indexed<A> | ((state: B, value: A, index: number) => B),
  reducerOrInitial: ((state: B, value: A, index: number) => B) | B,
  maybeInitial?: B,
): B | ((source: Indexed<A>) => B) {
  if (arguments.length >= 3) {
    return reduceRightImpl(
      sourceOrReducer as Indexed<A>,
      reducerOrInitial as (state: B, value: A, index: number) => B,
      maybeInitial as B,
    )
  }
  const reducer = sourceOrReducer as (state: B, value: A, index: number) => B
  const initial = reducerOrInitial as B
  return (source: Indexed<A>): B => reduceRightImpl(source, reducer, initial)
}

const findOrUndefinedImpl = <A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): A | undefined => {
  for (let index = 0; index < source.length; index++) {
    const value = source[index] as A
    if (predicate(value, index)) return value
  }
  return undefined
}

export function findOrUndefined<A, B extends A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => value is B,
): B | undefined
export function findOrUndefined<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): A | undefined
export function findOrUndefined<A, B extends A>(
  predicate: (value: A, index: number) => value is B,
): (source: Indexed<A>) => B | undefined
export function findOrUndefined<A>(
  predicate: (value: A, index: number) => boolean,
): (source: Indexed<A>) => A | undefined
export function findOrUndefined<A>(
  sourceOrPredicate: Indexed<A> | ((value: A, index: number) => boolean),
  predicate?: (value: A, index: number) => boolean,
): A | undefined | ((source: Indexed<A>) => A | undefined) {
  if (arguments.length !== 1) {
    return findOrUndefinedImpl(
      sourceOrPredicate as Indexed<A>,
      predicate as (value: A, index: number) => boolean,
    )
  }
  predicate = sourceOrPredicate as (value: A, index: number) => boolean
  return (source: Indexed<A>): A | undefined => findOrUndefinedImpl(source, predicate)
}

const findImpl = <A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): Option<A> => {
  for (let index = 0; index < source.length; index++) {
    const value = source[index] as A
    if (predicate(value, index)) return optionSome(value)
  }
  return none
}

export function find<A, B extends A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => value is B,
): Option<B>
export function find<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): Option<A>
export function find<A, B extends A>(
  predicate: (value: A, index: number) => value is B,
): (source: Indexed<A>) => Option<B>
export function find<A>(
  predicate: (value: A, index: number) => boolean,
): (source: Indexed<A>) => Option<A>
export function find<A>(
  sourceOrPredicate: Indexed<A> | ((value: A, index: number) => boolean),
  predicate?: (value: A, index: number) => boolean,
): Option<A> | ((source: Indexed<A>) => Option<A>) {
  if (arguments.length !== 1) {
    return findImpl(
      sourceOrPredicate as Indexed<A>,
      predicate as (value: A, index: number) => boolean,
    )
  }
  predicate = sourceOrPredicate as (value: A, index: number) => boolean
  return (source: Indexed<A>): Option<A> => findImpl(source, predicate)
}

const findIndexOrUndefinedImpl = <A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): number | undefined => {
  for (let index = 0; index < source.length; index++) {
    if (predicate(source[index] as A, index)) return index
  }
  return undefined
}

export function findIndexOrUndefined<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): number | undefined
export function findIndexOrUndefined<A>(
  predicate: (value: A, index: number) => boolean,
): (source: Indexed<A>) => number | undefined
export function findIndexOrUndefined<A>(
  sourceOrPredicate: Indexed<A> | ((value: A, index: number) => boolean),
  predicate?: (value: A, index: number) => boolean,
): number | undefined | ((source: Indexed<A>) => number | undefined) {
  if (arguments.length !== 1) {
    return findIndexOrUndefinedImpl(
      sourceOrPredicate as Indexed<A>,
      predicate as (value: A, index: number) => boolean,
    )
  }
  predicate = sourceOrPredicate as (value: A, index: number) => boolean
  return (source: Indexed<A>): number | undefined => findIndexOrUndefinedImpl(source, predicate)
}

const findIndexImpl = <A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): Option<number> => {
  const index = findIndexOrUndefinedImpl(source, predicate)
  return index === undefined ? none : optionSome(index)
}

export function findIndex<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): Option<number>
export function findIndex<A>(
  predicate: (value: A, index: number) => boolean,
): (source: Indexed<A>) => Option<number>
export function findIndex<A>(
  sourceOrPredicate: Indexed<A> | ((value: A, index: number) => boolean),
  predicate?: (value: A, index: number) => boolean,
): Option<number> | ((source: Indexed<A>) => Option<number>) {
  if (arguments.length !== 1) {
    return findIndexImpl(
      sourceOrPredicate as Indexed<A>,
      predicate as (value: A, index: number) => boolean,
    )
  }
  predicate = sourceOrPredicate as (value: A, index: number) => boolean
  return (source: Indexed<A>): Option<number> => findIndexImpl(source, predicate)
}

const indexOfOrUndefinedImpl = <A>(source: Indexed<A>, search: A): number | undefined => {
  for (let index = 0; index < source.length; index++) {
    if (sameValueZero(source[index], search)) return index
  }
  return undefined
}

export function indexOfOrUndefined<A>(source: Indexed<A>, search: A): number | undefined
export function indexOfOrUndefined<A>(search: A): (source: Indexed<A>) => number | undefined
export function indexOfOrUndefined<A>(
  sourceOrSearch: Indexed<A> | A,
  search?: A,
): number | undefined | ((source: Indexed<A>) => number | undefined) {
  if (arguments.length !== 1) {
    return indexOfOrUndefinedImpl(sourceOrSearch as Indexed<A>, search as A)
  }
  search = sourceOrSearch as A
  return (source: Indexed<A>): number | undefined => indexOfOrUndefinedImpl(source, search)
}

const indexOfImpl = <A>(source: Indexed<A>, search: A): Option<number> => {
  const index = indexOfOrUndefinedImpl(source, search)
  return index === undefined ? none : optionSome(index)
}

export function indexOf<A>(source: Indexed<A>, search: A): Option<number>
export function indexOf<A>(search: A): (source: Indexed<A>) => Option<number>
export function indexOf<A>(
  sourceOrSearch: Indexed<A> | A,
  search?: A,
): Option<number> | ((source: Indexed<A>) => Option<number>) {
  if (arguments.length !== 1) return indexOfImpl(sourceOrSearch as Indexed<A>, search as A)
  search = sourceOrSearch as A
  return (source: Indexed<A>): Option<number> => indexOfImpl(source, search)
}

const includesImpl = <A>(source: Indexed<A>, search: A): boolean =>
  indexOfOrUndefinedImpl(source, search) !== undefined

export function includes<A>(source: Indexed<A>, search: A): boolean
export function includes<A>(search: A): (source: Indexed<A>) => boolean
export function includes<A>(
  sourceOrSearch: Indexed<A> | A,
  search?: A,
): boolean | ((source: Indexed<A>) => boolean) {
  if (arguments.length !== 1) return includesImpl(sourceOrSearch as Indexed<A>, search as A)
  search = sourceOrSearch as A
  return (source: Indexed<A>): boolean => includesImpl(source, search)
}

const someImpl = <A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): boolean => {
  for (let index = 0; index < source.length; index++) {
    if (predicate(source[index] as A, index)) return true
  }
  return false
}

export function some<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): boolean
export function some<A>(
  predicate: (value: A, index: number) => boolean,
): (source: Indexed<A>) => boolean
export function some<A>(
  sourceOrPredicate: Indexed<A> | ((value: A, index: number) => boolean),
  predicate?: (value: A, index: number) => boolean,
): boolean | ((source: Indexed<A>) => boolean) {
  if (arguments.length !== 1) {
    return someImpl(
      sourceOrPredicate as Indexed<A>,
      predicate as (value: A, index: number) => boolean,
    )
  }
  predicate = sourceOrPredicate as (value: A, index: number) => boolean
  return (source: Indexed<A>): boolean => someImpl(source, predicate)
}

const everyImpl = <A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): boolean => {
  for (let index = 0; index < source.length; index++) {
    if (!predicate(source[index] as A, index)) return false
  }
  return true
}

export function every<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): boolean
export function every<A>(
  predicate: (value: A, index: number) => boolean,
): (source: Indexed<A>) => boolean
export function every<A>(
  sourceOrPredicate: Indexed<A> | ((value: A, index: number) => boolean),
  predicate?: (value: A, index: number) => boolean,
): boolean | ((source: Indexed<A>) => boolean) {
  if (arguments.length !== 1) {
    return everyImpl(
      sourceOrPredicate as Indexed<A>,
      predicate as (value: A, index: number) => boolean,
    )
  }
  predicate = sourceOrPredicate as (value: A, index: number) => boolean
  return (source: Indexed<A>): boolean => everyImpl(source, predicate)
}

const forEachImpl = <A>(source: Indexed<A>, effect: (value: A, index: number) => void): void => {
  for (let index = 0; index < source.length; index++) {
    effect(source[index] as A, index)
  }
}

export function forEach<A>(source: Indexed<A>, effect: (value: A, index: number) => void): void
export function forEach<A>(effect: (value: A, index: number) => void): (source: Indexed<A>) => void
export function forEach<A>(
  sourceOrEffect: Indexed<A> | ((value: A, index: number) => void),
  effect?: (value: A, index: number) => void,
): void | ((source: Indexed<A>) => void) {
  if (arguments.length !== 1) {
    return forEachImpl(sourceOrEffect as Indexed<A>, effect as (value: A, index: number) => void)
  }
  effect = sourceOrEffect as (value: A, index: number) => void
  return (source: Indexed<A>): void => forEachImpl(source, effect)
}

const equalsImpl = <A>(
  source: Indexed<A>,
  other: Indexed<A>,
  equal: (left: A, right: A) => boolean = sameValueZero,
): boolean => {
  if (source.length !== other.length) return false
  for (let index = 0; index < source.length; index++) {
    if (!equal(source[index] as A, other[index] as A)) return false
  }
  return true
}

export function equals<A>(
  source: Indexed<A>,
  other: Indexed<A>,
  equal?: (left: A, right: A) => boolean,
): boolean
export function equals<A>(
  other: Indexed<A>,
  equal?: (left: A, right: A) => boolean,
): (source: Indexed<A>) => boolean
export function equals<A>(
  sourceOrOther: Indexed<A>,
  otherOrEqual?: Indexed<A> | ((left: A, right: A) => boolean),
  maybeEqual?: (left: A, right: A) => boolean,
): boolean | ((source: Indexed<A>) => boolean) {
  if (arguments.length >= 3 || (arguments.length === 2 && typeof otherOrEqual !== 'function')) {
    return equalsImpl(sourceOrOther, otherOrEqual as Indexed<A>, maybeEqual)
  }
  const other = sourceOrOther
  const equal = otherOrEqual as ((left: A, right: A) => boolean) | undefined
  return (source: Indexed<A>): boolean => equalsImpl(source, other, equal)
}
