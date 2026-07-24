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

export const atOrUndefined = <A>(source: Indexed<A>, index: number): A | undefined => {
  const normalized = index < 0 ? source.length + index : index
  return Number.isSafeInteger(normalized) && normalized >= 0 && normalized < source.length
    ? (source[normalized] as A)
    : undefined
}

export const at = <A>(source: Indexed<A>, index: number): Option<A> => {
  const normalized = index < 0 ? source.length + index : index
  return Number.isSafeInteger(normalized) && normalized >= 0 && normalized < source.length
    ? optionSome(source[normalized] as A)
    : none
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

export const slice = <A>(source: Indexed<A>, start = 0, end = source.length): A[] => {
  const length = source.length
  const from = bound(length, start)
  const to = Math.max(from, bound(length, end))
  const result = new Array<A>(to - from)
  for (let index = from; index < to; index++) result[index - from] = source[index] as A
  return result
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
}

export const copyInto = copyIntoImpl as unknown as CopyIntoOperation

export const map = <A, B>(source: Indexed<A>, f: (value: A, index: number) => B): B[] => {
  const result = new Array<B>(source.length)
  for (let index = 0; index < source.length; index++) {
    result[index] = f(source[index] as A, index)
  }
  return result
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
}

export const mapInto = mapIntoImpl as unknown as MapIntoOperation

export function filter<A, B extends A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => value is B,
): B[]
export function filter<A>(source: Indexed<A>, predicate: (value: A, index: number) => boolean): A[]
export function filter<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): A[] {
  return filterIntoImpl(source, new Array<A>(), predicate)
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
}

export const filterInto = filterIntoImpl as unknown as FilterIntoOperation

export const filterMap = <A, B>(
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

export const reduce = <A, B>(
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

export const reduceRight = <A, B>(
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

export function findOrUndefined<A, B extends A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => value is B,
): B | undefined
export function findOrUndefined<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): A | undefined
export function findOrUndefined<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): A | undefined {
  for (let index = 0; index < source.length; index++) {
    const value = source[index] as A
    if (predicate(value, index)) return value
  }
  return undefined
}

export function find<A, B extends A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => value is B,
): Option<B>
export function find<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): Option<A>
export function find<A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): Option<A> {
  for (let index = 0; index < source.length; index++) {
    const value = source[index] as A
    if (predicate(value, index)) return optionSome(value)
  }
  return none
}

export const findIndexOrUndefined = <A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): number | undefined => {
  for (let index = 0; index < source.length; index++) {
    if (predicate(source[index] as A, index)) return index
  }
  return undefined
}

export const findIndex = <A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): Option<number> => {
  const index = findIndexOrUndefined(source, predicate)
  return index === undefined ? none : optionSome(index)
}

export const indexOfOrUndefined = <A>(source: Indexed<A>, search: A): number | undefined => {
  for (let index = 0; index < source.length; index++) {
    if (sameValueZero(source[index], search)) return index
  }
  return undefined
}

export const indexOf = <A>(source: Indexed<A>, search: A): Option<number> => {
  const index = indexOfOrUndefined(source, search)
  return index === undefined ? none : optionSome(index)
}

export const includes = <A>(source: Indexed<A>, search: A): boolean =>
  indexOfOrUndefined(source, search) !== undefined

export const some = <A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): boolean => {
  for (let index = 0; index < source.length; index++) {
    if (predicate(source[index] as A, index)) return true
  }
  return false
}

export const every = <A>(
  source: Indexed<A>,
  predicate: (value: A, index: number) => boolean,
): boolean => {
  for (let index = 0; index < source.length; index++) {
    if (!predicate(source[index] as A, index)) return false
  }
  return true
}

export const forEach = <A>(source: Indexed<A>, effect: (value: A, index: number) => void): void => {
  for (let index = 0; index < source.length; index++) {
    effect(source[index] as A, index)
  }
}

export const equals = <A>(
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
