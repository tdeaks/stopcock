import { none, some, type Option } from './option'

export type TupleOf<A, B> = readonly [A, B]
export type NonEmptyTuple<A> = readonly [A, ...A[]]

type TupleElement<Source extends readonly unknown[]> = Source[number]

type ArrayTargetElementCapacity<Target extends unknown[]> = (
  Target extends unknown ? (value: Target[number]) => void : never
) extends (value: infer Capacity) => void
  ? Capacity
  : never

type RejectingArrayTargets<Value, Target extends unknown[]> = Target extends unknown
  ? [Value] extends [Target[number]]
    ? never
    : Target
  : never

type FixedLengthArrayTargets<Target extends unknown[]> = Target extends unknown
  ? number extends Target['length']
    ? never
    : Target
  : never

type EveryArrayTargetAccepts<Value, Target extends unknown[]> = [
  RejectingArrayTargets<Value, Target>,
] extends [never]
  ? unknown
  : never

type EveryArrayTargetHasDynamicLength<Target extends unknown[]> = [
  FixedLengthArrayTargets<Target>,
] extends [never]
  ? unknown
  : never

type IsUnion<Value, Whole = Value> = Value extends Whole
  ? [Whole] extends [Value]
    ? false
    : true
  : never

type EveryArrayTargetIsConcrete<Target extends unknown[]> =
  true extends IsUnion<Target> ? never : unknown

type ArrayTargetCapacity<Value, Target extends unknown[]> = EveryArrayTargetAccepts<Value, Target> &
  EveryArrayTargetHasDynamicLength<Target> &
  EveryArrayTargetIsConcrete<Target>

export const make = <A, B>(first: A, second: B): TupleOf<A, B> => [first, second]

export const first = <T extends readonly [unknown, ...unknown[]]>(tuple: T): T[0] => tuple[0]

export const second = <T extends readonly [unknown, unknown, ...unknown[]]>(tuple: T): T[1] =>
  tuple[1]

type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer A] ? A : never

export const last = <T extends readonly [unknown, ...unknown[]]>(tuple: T): Last<T> =>
  tuple[tuple.length - 1] as Last<T>

const atImpl = <A>(tuple: readonly A[], index: number): Option<A> => {
  const normalized = index < 0 ? tuple.length + index : index
  return Number.isSafeInteger(normalized) && normalized >= 0 && normalized < tuple.length
    ? some(tuple[normalized] as A)
    : none
}

export function at<A>(tuple: readonly A[], index: number): Option<A>
export function at(index: number): <A>(tuple: readonly A[]) => Option<A>
export function at<A>(
  tupleOrIndex: readonly A[] | number,
  index?: number,
): Option<A> | (<B>(tuple: readonly B[]) => Option<B>) {
  if (arguments.length !== 1) return atImpl(tupleOrIndex as readonly A[], index as number)
  index = tupleOrIndex as number
  return <B>(tuple: readonly B[]): Option<B> => atImpl(tuple, index)
}

const appendImpl = <T extends readonly unknown[], A>(tuple: T, value: A): readonly [...T, A] => [
  ...tuple,
  value,
]

export function append<T extends readonly unknown[], A>(tuple: T, value: A): readonly [...T, A]
export function append<A>(value: A): <T extends readonly unknown[]>(tuple: T) => readonly [...T, A]
export function append<T extends readonly unknown[], A>(
  tupleOrValue: T | A,
  maybeValue?: A,
):
  | readonly [...T, A]
  | (<Source extends readonly unknown[]>(tuple: Source) => readonly [...Source, A]) {
  if (arguments.length !== 1) return appendImpl(tupleOrValue as T, maybeValue as A)
  const value = tupleOrValue as A
  return <Source extends readonly unknown[]>(tuple: Source): readonly [...Source, A] =>
    appendImpl(tuple, value)
}

const prependImpl = <T extends readonly unknown[], A>(tuple: T, value: A): readonly [A, ...T] => [
  value,
  ...tuple,
]

export function prepend<T extends readonly unknown[], A>(tuple: T, value: A): readonly [A, ...T]
export function prepend<A>(value: A): <T extends readonly unknown[]>(tuple: T) => readonly [A, ...T]
export function prepend<T extends readonly unknown[], A>(
  tupleOrValue: T | A,
  maybeValue?: A,
):
  | readonly [A, ...T]
  | (<Source extends readonly unknown[]>(tuple: Source) => readonly [A, ...Source]) {
  if (arguments.length !== 1) return prependImpl(tupleOrValue as T, maybeValue as A)
  const value = tupleOrValue as A
  return <Source extends readonly unknown[]>(tuple: Source): readonly [A, ...Source] =>
    prependImpl(tuple, value)
}

const concatImpl = <A extends readonly unknown[], B extends readonly unknown[]>(
  source: A,
  other: B,
): readonly [...A, ...B] => [...source, ...other]

export function concat<A extends readonly unknown[], B extends readonly unknown[]>(
  source: A,
  other: B,
): readonly [...A, ...B]
export function concat<B extends readonly unknown[]>(
  other: B,
): <A extends readonly unknown[]>(source: A) => readonly [...A, ...B]
export function concat<A extends readonly unknown[], B extends readonly unknown[]>(
  sourceOrOther: A | B,
  maybeOther?: B,
):
  | readonly [...A, ...B]
  | (<Source extends readonly unknown[]>(source: Source) => readonly [...Source, ...B]) {
  if (arguments.length !== 1) return concatImpl(sourceOrOther as A, maybeOther as B)
  const other = sourceOrOther as B
  return <Source extends readonly unknown[]>(source: Source): readonly [...Source, ...B] =>
    concatImpl(source, other)
}

export const swap = <A, B>(tuple: TupleOf<A, B>): TupleOf<B, A> => [tuple[1], tuple[0]]

const mapFirstImpl = <A, B, C>(tuple: TupleOf<A, B>, f: (value: A) => C): TupleOf<C, B> => [
  f(tuple[0]),
  tuple[1],
]

export function mapFirst<A, B, C>(tuple: TupleOf<A, B>, f: (value: A) => C): TupleOf<C, B>
export function mapFirst<A, C>(f: (value: A) => C): <B>(tuple: TupleOf<A, B>) => TupleOf<C, B>
export function mapFirst<A, B, C>(
  tupleOrF: TupleOf<A, B> | ((value: A) => C),
  maybeF?: (value: A) => C,
): TupleOf<C, B> | (<D>(tuple: TupleOf<A, D>) => TupleOf<C, D>) {
  if (arguments.length !== 1)
    return mapFirstImpl(tupleOrF as TupleOf<A, B>, maybeF as (value: A) => C)
  const f = tupleOrF as (value: A) => C
  return <D>(tuple: TupleOf<A, D>): TupleOf<C, D> => mapFirstImpl(tuple, f)
}

const mapSecondImpl = <A, B, C>(tuple: TupleOf<A, B>, f: (value: B) => C): TupleOf<A, C> => [
  tuple[0],
  f(tuple[1]),
]

export function mapSecond<A, B, C>(tuple: TupleOf<A, B>, f: (value: B) => C): TupleOf<A, C>
export function mapSecond<B, C>(f: (value: B) => C): <A>(tuple: TupleOf<A, B>) => TupleOf<A, C>
export function mapSecond<A, B, C>(
  tupleOrF: TupleOf<A, B> | ((value: B) => C),
  maybeF?: (value: B) => C,
): TupleOf<A, C> | (<D>(tuple: TupleOf<D, B>) => TupleOf<D, C>) {
  if (arguments.length !== 1)
    return mapSecondImpl(tupleOrF as TupleOf<A, B>, maybeF as (value: B) => C)
  const f = tupleOrF as (value: B) => C
  return <D>(tuple: TupleOf<D, B>): TupleOf<D, C> => mapSecondImpl(tuple, f)
}

const bimapImpl = <A, B, C, D>(
  tuple: TupleOf<A, B>,
  mapLeft: (value: A) => C,
  mapRight: (value: B) => D,
): TupleOf<C, D> => [mapLeft(tuple[0]), mapRight(tuple[1])]

export function bimap<A, B, C, D>(
  tuple: TupleOf<A, B>,
  mapLeft: (value: A) => C,
  mapRight: (value: B) => D,
): TupleOf<C, D>
export function bimap<A, B, C, D>(
  mapLeft: (value: A) => C,
  mapRight: (value: B) => D,
): (tuple: TupleOf<A, B>) => TupleOf<C, D>
export function bimap<A, B, C, D>(
  tupleOrMapLeft: TupleOf<A, B> | ((value: A) => C),
  mapLeftOrMapRight: ((value: A) => C) | ((value: B) => D),
  maybeMapRight?: (value: B) => D,
): TupleOf<C, D> | ((tuple: TupleOf<A, B>) => TupleOf<C, D>) {
  if (arguments.length >= 3) {
    return bimapImpl(
      tupleOrMapLeft as TupleOf<A, B>,
      mapLeftOrMapRight as (value: A) => C,
      maybeMapRight as (value: B) => D,
    )
  }
  const mapLeft = tupleOrMapLeft as (value: A) => C
  const mapRight = mapLeftOrMapRight as (value: B) => D
  return (tuple: TupleOf<A, B>): TupleOf<C, D> => bimapImpl(tuple, mapLeft, mapRight)
}

export type MappedTuple<T extends readonly unknown[], B> = {
  readonly [K in keyof T]: B
}

const mapImpl = <T extends readonly unknown[], B>(
  tuple: T,
  f: (value: T[number], index: number) => B,
): MappedTuple<T, B> => {
  const result = new Array<B>(tuple.length)
  for (let index = 0; index < tuple.length; index++) {
    result[index] = f(tuple[index] as T[number], index)
  }
  return result as MappedTuple<T, B>
}

export function map<T extends readonly unknown[], B>(
  tuple: T,
  f: (value: T[number], index: number) => B,
): MappedTuple<T, B>
export function map<A, B>(
  f: (value: A, index: number) => B,
): <T extends readonly A[]>(tuple: T) => MappedTuple<T, B>
export function map<T extends readonly unknown[], B>(
  tupleOrF: T | ((value: T[number], index: number) => B),
  maybeF?: (value: T[number], index: number) => B,
): MappedTuple<T, B> | ((tuple: T) => MappedTuple<T, B>) {
  if (arguments.length !== 1)
    return mapImpl(tupleOrF as T, maybeF as (value: T[number], index: number) => B)
  const f = tupleOrF as (value: T[number], index: number) => B
  return (tuple: T): MappedTuple<T, B> => mapImpl(tuple, f)
}

const mapIntoImpl = <Source extends readonly unknown[], Output, Target extends unknown[]>(
  tuple: Source,
  target: Target,
  f: (value: TupleElement<Source>, index: number) => Output,
): Target => {
  for (let index = 0; index < tuple.length; index++) {
    target.push(f(tuple[index] as TupleElement<Source>, index))
  }
  return target
}

interface MapIntoOperation {
  <
    Source extends readonly unknown[],
    const Target extends unknown[],
    Output extends ArrayTargetElementCapacity<NoInfer<Target>>,
  >(
    tuple: Source,
    target: Target,
    f: (value: TupleElement<NoInfer<Source>>, index: number) => Output,
    ..._capacity: [] & EveryArrayTargetHasDynamicLength<Target> & EveryArrayTargetIsConcrete<Target>
  ): Target
  <A, const Target extends unknown[], Output extends ArrayTargetElementCapacity<NoInfer<Target>>>(
    target: Target,
    f: (value: A, index: number) => Output,
  ): <Source extends readonly A[]>(tuple: Source) => Target
}

export const mapInto: MapIntoOperation = function mapInto(
  tupleOrTarget: readonly unknown[] | unknown[],
  targetOrF: unknown[] | ((value: unknown, index: number) => unknown),
  maybeF?: (value: unknown, index: number) => unknown,
): unknown {
  if (typeof targetOrF === 'function') {
    const target = tupleOrTarget as unknown[]
    const f = targetOrF
    return (tuple: readonly unknown[]): unknown[] => mapIntoImpl(tuple, target, f)
  }
  return mapIntoImpl(tupleOrTarget, targetOrF, maybeF as (value: unknown, index: number) => unknown)
} as MapIntoOperation

export const reverse = <T extends readonly unknown[]>(tuple: T): readonly T[number][] => {
  const result = new Array<T[number]>(tuple.length)
  for (let index = 0; index < tuple.length; index++) {
    result[index] = tuple[tuple.length - index - 1] as T[number]
  }
  return result
}

const zipImpl = <A, B>(source: readonly A[], other: readonly B[]): Array<readonly [A, B]> => {
  const length = Math.min(source.length, other.length)
  const result = new Array<readonly [A, B]>(length)
  for (let index = 0; index < length; index++) {
    result[index] = [source[index] as A, other[index] as B]
  }
  return result
}

export function zip<A, B>(source: readonly A[], other: readonly B[]): Array<readonly [A, B]>
export function zip<B>(other: readonly B[]): <A>(source: readonly A[]) => Array<readonly [A, B]>
export function zip<A, B>(
  sourceOrOther: readonly A[] | readonly B[],
  maybeOther?: readonly B[],
): Array<readonly [A, B]> | (<C>(source: readonly C[]) => Array<readonly [C, B]>) {
  if (arguments.length !== 1)
    return zipImpl(sourceOrOther as readonly A[], maybeOther as readonly B[])
  const other = sourceOrOther as readonly B[]
  return <C>(source: readonly C[]): Array<readonly [C, B]> => zipImpl(source, other)
}
