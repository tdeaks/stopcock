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

export const at = <A>(tuple: readonly A[], index: number): Option<A> => {
  const normalized = index < 0 ? tuple.length + index : index
  return Number.isSafeInteger(normalized) && normalized >= 0 && normalized < tuple.length
    ? some(tuple[normalized] as A)
    : none
}

export const append = <T extends readonly unknown[], A>(tuple: T, value: A): readonly [...T, A] => [
  ...tuple,
  value,
]

export const prepend = <T extends readonly unknown[], A>(
  tuple: T,
  value: A,
): readonly [A, ...T] => [value, ...tuple]

export const concat = <A extends readonly unknown[], B extends readonly unknown[]>(
  source: A,
  other: B,
): readonly [...A, ...B] => [...source, ...other]

export const swap = <A, B>(tuple: TupleOf<A, B>): TupleOf<B, A> => [tuple[1], tuple[0]]

export const mapFirst = <A, B, C>(tuple: TupleOf<A, B>, f: (value: A) => C): TupleOf<C, B> => [
  f(tuple[0]),
  tuple[1],
]

export const mapSecond = <A, B, C>(tuple: TupleOf<A, B>, f: (value: B) => C): TupleOf<A, C> => [
  tuple[0],
  f(tuple[1]),
]

export const bimap = <A, B, C, D>(
  tuple: TupleOf<A, B>,
  mapLeft: (value: A) => C,
  mapRight: (value: B) => D,
): TupleOf<C, D> => [mapLeft(tuple[0]), mapRight(tuple[1])]

export type MappedTuple<T extends readonly unknown[], B> = {
  readonly [K in keyof T]: B
}

export const map = <T extends readonly unknown[], B>(
  tuple: T,
  f: (value: T[number], index: number) => B,
): MappedTuple<T, B> => {
  const result = new Array<B>(tuple.length)
  for (let index = 0; index < tuple.length; index++) {
    result[index] = f(tuple[index] as T[number], index)
  }
  return result as MappedTuple<T, B>
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
    ..._capacity: [] &
      EveryArrayTargetHasDynamicLength<Target> &
      EveryArrayTargetIsConcrete<Target>
  ): Target
}

export const mapInto = mapIntoImpl as unknown as MapIntoOperation

export const reverse = <T extends readonly unknown[]>(tuple: T): readonly T[number][] => {
  const result = new Array<T[number]>(tuple.length)
  for (let index = 0; index < tuple.length; index++) {
    result[index] = tuple[tuple.length - index - 1] as T[number]
  }
  return result
}

export const zip = <A, B>(source: readonly A[], other: readonly B[]): Array<readonly [A, B]> => {
  const length = Math.min(source.length, other.length)
  const result = new Array<readonly [A, B]>(length)
  for (let index = 0; index < length; index++) {
    result[index] = [source[index] as A, other[index] as B]
  }
  return result
}
