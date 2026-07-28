import { isNone, isSome, none, some, type Option } from './option'
import { isErr, ok, type Result } from './result'

type ArrayElement<Source extends readonly unknown[]> = Source[number]

type TransformInput<Transform> = Transform extends (value: infer Input, ...args: never[]) => unknown
  ? Input
  : never

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

export const compact = <A>(values: readonly Option<A>[]): A[] => {
  const output: A[] = []
  for (const value of values) if (isSome(value)) output.push(value.value)
  return output
}

export const separate = <A, E>(values: readonly Result<A, E>[]): readonly [E[], A[]] => {
  const errors: E[] = []
  const successes: A[] = []
  for (const value of values) {
    if (isErr(value)) errors.push(value.error)
    else successes.push(value.value)
  }
  return [errors, successes]
}

export const partitionMap: {
  <A, E, B>(
    f: (value: A, index: number) => Result<B, E>,
  ): (values: readonly A[]) => readonly [E[], B[]]
} =
  <A, E, B>(f: (value: A, index: number) => Result<B, E>) =>
  (values: readonly A[]): readonly [E[], B[]] => {
    const errors: E[] = []
    const successes: B[] = []
    for (let index = 0; index < values.length; index++) {
      const result = f(values[index], index)
      if (isErr(result)) errors.push(result.error)
      else successes.push(result.value)
    }
    return [errors, successes]
  }

export const traverse: {
  <A, B, E>(f: (value: A, index: number) => Result<B, E>): (values: readonly A[]) => Result<B[], E>
} =
  <A, B, E>(f: (value: A, index: number) => Result<B, E>) =>
  (values: readonly A[]): Result<B[], E> => {
    const output: B[] = []
    for (let index = 0; index < values.length; index++) {
      const result = f(values[index], index)
      if (isErr(result)) return result
      output.push(result.value)
    }
    return ok(output)
  }

type ResultValue<T> = T extends { readonly _tag: 1; readonly value: infer A } ? A : never
type ResultError<T> = T extends { readonly _tag: 0; readonly error: infer E } ? E : never

export function sequence<const T extends readonly Result<unknown, unknown>[]>(
  values: T,
): Result<{ -readonly [K in keyof T]: ResultValue<T[K]> }, ResultError<T[number]>>
export function sequence(values: readonly Result<unknown, unknown>[]): Result<unknown[], unknown> {
  return traverse((value: Result<unknown, unknown>) => value)(values)
}

export const groupMap: {
  <A, K, B>(key: (value: A) => K, project: (value: A) => B): (values: readonly A[]) => Map<K, B[]>
} =
  <A, K, B>(key: (value: A) => K, project: (value: A) => B) =>
  (values: readonly A[]): Map<K, B[]> => {
    const output = new Map<K, B[]>()
    for (const value of values) {
      const group = key(value)
      const existing = output.get(group)
      if (existing) existing.push(project(value))
      else output.set(group, [project(value)])
    }
    return output
  }

export const groupMapReduce: {
  <A, K, B>(
    key: (value: A) => K,
    project: (value: A) => B,
    combine: (left: B, right: B) => B,
  ): (values: readonly A[]) => Map<K, B>
} =
  <A, K, B>(key: (value: A) => K, project: (value: A) => B, combine: (left: B, right: B) => B) =>
  (values: readonly A[]): Map<K, B> => {
    const output = new Map<K, B>()
    for (const value of values) {
      const group = key(value)
      const projected = project(value)
      output.set(group, output.has(group) ? combine(output.get(group) as B, projected) : projected)
    }
    return output
  }

export const countBy: {
  <A, K>(key: (value: A) => K): (values: readonly A[]) => Map<K, number>
} =
  <A, K>(key: (value: A) => K) =>
  (values: readonly A[]): Map<K, number> => {
    const output = new Map<K, number>()
    for (const value of values) {
      const group = key(value)
      output.set(group, (output.get(group) ?? 0) + 1)
    }
    return output
  }

export const zipAll: {
  <B>(right: readonly B[]): <A>(left: readonly A[]) => Array<readonly [Option<A>, Option<B>]>
} =
  <B>(right: readonly B[]) =>
  <A>(left: readonly A[]): Array<readonly [Option<A>, Option<B>]> => {
    const output: Array<readonly [Option<A>, Option<B>]> = []
    const length = Math.max(left.length, right.length)
    for (let index = 0; index < length; index++) {
      output.push([
        index < left.length ? some(left[index]) : none,
        index < right.length ? some(right[index]) : none,
      ])
    }
    return output
  }

export const unzip = <A, B>(values: readonly (readonly [A, B])[]): readonly [A[], B[]] => {
  const left = new Array<A>(values.length)
  const right = new Array<B>(values.length)
  for (let index = 0; index < values.length; index++) {
    left[index] = values[index][0]
    right[index] = values[index][1]
  }
  return [left, right]
}

export const span: {
  <A>(
    predicate: (value: A, index: number) => boolean,
  ): (values: readonly A[]) => readonly [A[], A[]]
} =
  <A>(predicate: (value: A, index: number) => boolean) =>
  (values: readonly A[]): readonly [A[], A[]] => {
    let index = 0
    while (index < values.length && predicate(values[index], index)) index++
    return [values.slice(0, index), values.slice(index)]
  }

export const dropUntil: {
  <A>(predicate: (value: A, index: number) => boolean): (values: readonly A[]) => A[]
} =
  <A>(predicate: (value: A, index: number) => boolean) =>
  (values: readonly A[]): A[] => {
    let index = 0
    while (index < values.length && !predicate(values[index], index)) index++
    return values.slice(index)
  }

export const cartesian: {
  <B>(right: readonly B[]): <A>(left: readonly A[]) => Array<readonly [A, B]>
} =
  <B>(right: readonly B[]) =>
  <A>(left: readonly A[]): Array<readonly [A, B]> => {
    const output: Array<readonly [A, B]> = []
    for (const a of left) for (const b of right) output.push([a, b])
    return output
  }

export const combinations: {
  (size: number): <A>(values: readonly A[]) => A[][]
} =
  (size: number) =>
  <A>(values: readonly A[]): A[][] => {
    const count = Math.trunc(size)
    if (count < 0) throw new RangeError('combinations: size must be non-negative')
    if (count === 0) return [[]]
    if (count > values.length) return []
    const output: A[][] = []
    const selected: A[] = []
    const visit = (start: number): void => {
      if (selected.length === count) {
        output.push(selected.slice())
        return
      }
      const remaining = count - selected.length
      for (let index = start; index <= values.length - remaining; index++) {
        selected.push(values[index])
        visit(index + 1)
        selected.pop()
      }
    }
    visit(0)
    return output
  }

export const permutations = <A>(values: readonly A[]): A[][] => {
  if (values.length === 0) return [[]]
  const output: A[][] = []
  const data = values.slice()
  const visit = (position: number): void => {
    if (position === data.length) {
      output.push(data.slice())
      return
    }
    for (let index = position; index < data.length; index++) {
      ;[data[position], data[index]] = [data[index], data[position]]
      visit(position + 1)
      ;[data[position], data[index]] = [data[index], data[position]]
    }
  }
  visit(0)
  return output
}

export const binarySearch: {
  <A>(
    target: A,
    compare: (left: A, right: A) => number,
  ): (values: readonly A[]) => Option<number>
} =
  <A>(target: A, compare: (left: A, right: A) => number) =>
  (values: readonly A[]): Option<number> => {
    let low = 0
    let high = values.length - 1
    while (low <= high) {
      const middle = (low + high) >>> 1
      const ordering = compare(values[middle], target)
      if (ordering === 0) return some(middle)
      if (ordering < 0) low = middle + 1
      else high = middle - 1
    }
    return none
  }

export const scan1 = <A>(
  values: readonly [A, ...A[]],
  f: (accumulator: A, value: A) => A,
): [A, ...A[]] => {
  const output = new Array<A>(values.length)
  let accumulator = values[0]
  output[0] = accumulator
  for (let index = 1; index < values.length; index++) {
    accumulator = f(accumulator, values[index])
    output[index] = accumulator
  }
  return output as [A, ...A[]]
}

export const mapInto: {
  <
    const Target extends unknown[],
    const Transform extends (...args: never[]) => ArrayTargetElementCapacity<NoInfer<Target>>,
  >(
    target: Target,
    f: Transform,
    ..._capacity: [] & EveryArrayTargetHasDynamicLength<Target> & EveryArrayTargetIsConcrete<Target>
  ): (values: readonly TransformInput<Transform>[]) => Target
} =
  ((target: unknown[], f: (value: never, index: number) => unknown) =>
    (values: readonly unknown[]): unknown[] => {
      target.length = values.length
      for (let index = 0; index < values.length; index++) {
        target[index] = f(values[index] as never, index)
      }
      return target
    }) as any

export const filterInto: {
  <A, Narrowed extends A, const Target extends unknown[]>(
    target: Target,
    predicate: (value: A, index: number) => value is Narrowed,
    ..._capacity: [] & ArrayTargetCapacity<Narrowed, Target>
  ): (values: readonly A[]) => Target
  <A, const Target extends unknown[]>(
    target: Target,
    predicate: (value: A, index: number) => boolean,
    ..._capacity: [] & ArrayTargetCapacity<A, Target>
  ): (values: readonly A[]) => Target
} =
  ((target: unknown[], predicate: (value: never, index: number) => boolean) =>
    (values: readonly unknown[]): unknown[] => {
      target.length = 0
      for (let index = 0; index < values.length; index++) {
        const value = values[index]
        if (predicate(value as never, index)) target.push(value)
      }
      return target
    }) as any

export const shuffleWith: {
  (random: () => number): <A>(values: readonly A[]) => A[]
} =
  (random: () => number) =>
  <A>(values: readonly A[]): A[] => {
    const output = values.slice()
    for (let index = output.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1))
      ;[output[index], output[other]] = [output[other], output[index]]
    }
    return output
  }
