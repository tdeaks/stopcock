import { inspectCanonicalView } from './internal/typed-array-view'
import { none, some, type Option } from './option'

type OptionalFloat16Array = typeof globalThis extends {
  readonly Float16Array: { readonly prototype: infer T }
}
  ? T
  : never

type ReallocatedFloat16Array = typeof globalThis extends {
  readonly Float16Array: { new (length: number): infer T }
}
  ? T
  : never

type WithOptional<Base, Extra> = [Extra] extends [never] ? Base : Base | Extra

type NativeNumberTypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array

export type NumberTypedArray = WithOptional<NativeNumberTypedArray, OptionalFloat16Array>

export type BigIntTypedArray = BigInt64Array | BigUint64Array
export type AnyTypedArray = NumberTypedArray | BigIntTypedArray

export type ElementOf<T extends AnyTypedArray> = T extends NumberTypedArray ? number : bigint

/**
 * The built-in view produced by an allocating operation.
 *
 * Allocating from a SharedArrayBuffer-backed view creates a fresh ArrayBuffer;
 * this mapping preserves the element constructor without falsely preserving
 * the source buffer type.
 */
type ReallocatedSharedView<T extends AnyTypedArray> = T extends Int8Array
  ? InstanceType<typeof Int8Array>
  : T extends Uint8Array
    ? InstanceType<typeof Uint8Array>
    : T extends Uint8ClampedArray
      ? InstanceType<typeof Uint8ClampedArray>
      : T extends Int16Array
        ? InstanceType<typeof Int16Array>
        : T extends Uint16Array
          ? InstanceType<typeof Uint16Array>
          : T extends Int32Array
            ? InstanceType<typeof Int32Array>
            : T extends Uint32Array
              ? InstanceType<typeof Uint32Array>
              : T extends OptionalFloat16Array
                ? ReallocatedFloat16Array
                : T extends Float32Array
                  ? InstanceType<typeof Float32Array>
                  : T extends Float64Array
                    ? InstanceType<typeof Float64Array>
                    : T extends BigInt64Array
                      ? InstanceType<typeof BigInt64Array>
                      : T extends BigUint64Array
                        ? InstanceType<typeof BigUint64Array>
                        : never

export type Reallocated<T extends AnyTypedArray> = ArrayBuffer extends T['buffer']
  ? T
  : ReallocatedSharedView<T>

type CompatibleTarget<Source extends AnyTypedArray, Target extends AnyTypedArray> = [
  Source,
] extends [NumberTypedArray]
  ? [Target] extends [NumberTypedArray]
    ? Target
    : never
  : [Source] extends [BigIntTypedArray]
    ? [Target] extends [BigIntTypedArray]
      ? Target
      : never
    : never

export interface TypedArrayConstructor<T extends AnyTypedArray> {
  new (length: number): T
}

interface OptionalFloat16ArrayConstructor {
  new (length: number): NumberTypedArray
  readonly prototype: NumberTypedArray
}

const float16ArrayConstructor = Reflect.get(globalThis, 'Float16Array') as
  | OptionalFloat16ArrayConstructor
  | undefined

interface WritableArrayLike<A> {
  readonly length: number
  [index: number]: A
}

type TypedArraySet = (
  this: AnyTypedArray,
  source: ArrayLike<number | bigint>,
  offset?: number,
) => void

type TypedArrayIncludes = (
  this: AnyTypedArray,
  search: number | bigint,
  fromIndex?: number,
) => boolean

type TypedArrayIndexOf = (
  this: AnyTypedArray,
  search: number | bigint,
  fromIndex?: number,
) => number

type TypedArraySlice = (this: AnyTypedArray, start?: number, end?: number) => AnyTypedArray
type TypedArrayReverse = (this: AnyTypedArray) => AnyTypedArray
type TypedArraySort = (
  this: AnyTypedArray,
  compare?: (left: number | bigint, right: number | bigint) => number,
) => AnyTypedArray

const typedArraySet = Reflect.get(Uint8Array.prototype, 'set') as TypedArraySet
const typedArrayIncludes = Reflect.get(Uint8Array.prototype, 'includes') as TypedArrayIncludes
const typedArrayIndexOf = Reflect.get(Uint8Array.prototype, 'indexOf') as TypedArrayIndexOf
const typedArraySlice = Reflect.get(Uint8Array.prototype, 'slice') as TypedArraySlice
const typedArrayReverse = Reflect.get(Uint8Array.prototype, 'reverse') as TypedArrayReverse
const typedArraySort = Reflect.get(Uint8Array.prototype, 'sort') as TypedArraySort

const SMALL_BULK_COPY_LENGTH = 128

const isCanonicalTypedArray = (source: AnyTypedArray): boolean =>
  inspectCanonicalView(source) !== undefined

/**
 * Every strategy candidate P2 measured lost against the real exported
 * functions, so every family stays size-banded.
 *
 * Dropping the size band so a short canonical view always takes the stashed
 * intrinsic looked like a clear win in the lab and was a reproducible loss in
 * production: on Bun 1.3.14 a 64-element Float64Array slice went from 0.98x to
 * 0.78x its frozen baseline, and reverse from 1.10x to 0.93x. The lab kernel
 * was not the production kernel, so the production A/B is what counts.
 *
 * There is therefore nothing to key on a runtime version, and a policy table
 * whose bands all select the same strategy would be structure with no
 * behaviour. Add one when a band actually earns a row.
 */
const SLICE_ALWAYS_INTRINSIC = false
const REVERSE_ALWAYS_INTRINSIC = false

const constructorOf = <T extends AnyTypedArray>(source: T): TypedArrayConstructor<T> =>
  source.constructor as unknown as TypedArrayConstructor<T>

const allocateLike = <T extends AnyTypedArray>(source: T, length: number): T => {
  const Constructor: unknown = constructorOf(source)
  if (Constructor === Float64Array) return new Float64Array(length) as T
  if (float16ArrayConstructor !== undefined && Constructor === float16ArrayConstructor) {
    return new float16ArrayConstructor(length) as T
  }
  if (Constructor === Float32Array) return new Float32Array(length) as T
  if (Constructor === Uint32Array) return new Uint32Array(length) as T
  if (Constructor === Int32Array) return new Int32Array(length) as T
  if (Constructor === Uint16Array) return new Uint16Array(length) as T
  if (Constructor === Int16Array) return new Int16Array(length) as T
  if (Constructor === Uint8ClampedArray) return new Uint8ClampedArray(length) as T
  if (Constructor === Uint8Array) return new Uint8Array(length) as T
  if (Constructor === Int8Array) return new Int8Array(length) as T
  if (Constructor === BigInt64Array) return new BigInt64Array(length) as T
  if (Constructor === BigUint64Array) return new BigUint64Array(length) as T
  return new (Constructor as TypedArrayConstructor<T>)(length)
}

const writable = <T extends AnyTypedArray>(source: T): WritableArrayLike<ElementOf<T>> =>
  source as unknown as WritableArrayLike<ElementOf<T>>

const sameValueZero = (left: number | bigint, right: number | bigint): boolean =>
  left === right || (left !== left && right !== right)

const isBigIntTypedArray = (source: AnyTypedArray): source is BigIntTypedArray =>
  source instanceof BigInt64Array || source instanceof BigUint64Array

const defaultSortCompare = (left: number | bigint, right: number | bigint): number =>
  left < right ? -1 : left > right ? 1 : 0

const setInto = (target: AnyTypedArray, source: ArrayLike<number | bigint>, offset = 0): void => {
  typedArraySet.call(target, source, offset)
}

const allocateNumberScratch = (source: NumberTypedArray, length: number): NumberTypedArray => {
  if (source instanceof Int8Array) return new Int8Array(length)
  if (source instanceof Uint8Array) return new Uint8Array(length)
  if (source instanceof Uint8ClampedArray) return new Uint8ClampedArray(length)
  if (source instanceof Int16Array) return new Int16Array(length)
  if (source instanceof Uint16Array) return new Uint16Array(length)
  if (source instanceof Int32Array) return new Int32Array(length)
  if (source instanceof Uint32Array) return new Uint32Array(length)
  if (float16ArrayConstructor !== undefined && source instanceof float16ArrayConstructor) {
    return new float16ArrayConstructor(length)
  }
  if (source instanceof Float32Array) return new Float32Array(length)
  return new Float64Array(length)
}

const allocateBigIntScratch = (source: BigIntTypedArray, length: number): BigIntTypedArray =>
  source instanceof BigInt64Array ? new BigInt64Array(length) : new BigUint64Array(length)

export function from<T extends NumberTypedArray>(
  constructor: TypedArrayConstructor<T>,
  source: Iterable<number>,
): T
export function from<T extends BigIntTypedArray>(
  constructor: TypedArrayConstructor<T>,
  source: Iterable<bigint>,
): T
export function from<T extends AnyTypedArray>(
  constructor: TypedArrayConstructor<T>,
  source: Iterable<number | bigint>,
): T {
  const values = Array.from(source)
  const result = new constructor(values.length)
  setInto(result, values)
  return result
}

export const clone = <T extends AnyTypedArray>(source: T): Reallocated<T> => {
  if (isCanonicalTypedArray(source)) {
    return typedArraySlice.call(source) as Reallocated<T>
  }

  const result = allocateLike(source, source.length)
  if (source.length === 0) {
    setInto(result, source)
    return result as unknown as Reallocated<T>
  }
  if (source.length < SMALL_BULK_COPY_LENGTH) {
    const output = writable(result)
    for (let index = 0; index < source.length; index++) {
      output[index] = source[index] as ElementOf<T>
    }
  } else {
    setInto(result, source)
  }
  return result as unknown as Reallocated<T>
}

const atOrUndefinedImpl = <T extends AnyTypedArray>(
  source: T,
  index: number,
): ElementOf<T> | undefined => {
  const integer = index === 0 || Number.isNaN(index) ? 0 : Math.trunc(index)
  const normalized = integer < 0 ? source.length + integer : integer
  return Number.isSafeInteger(normalized) && normalized >= 0 && normalized < source.length
    ? (source[normalized] as ElementOf<T>)
    : undefined
}

export function atOrUndefined<T extends AnyTypedArray>(
  source: T,
  index: number,
): ElementOf<T> | undefined
export function atOrUndefined(
  index: number,
): <T extends AnyTypedArray>(source: T) => ElementOf<T> | undefined
export function atOrUndefined<T extends AnyTypedArray>(
  sourceOrIndex: T | number,
  index?: number,
): ElementOf<T> | undefined | (<A extends AnyTypedArray>(source: A) => ElementOf<A> | undefined) {
  if (arguments.length !== 1) {
    return atOrUndefinedImpl(sourceOrIndex as T, index as number)
  }
  index = sourceOrIndex as number
  return <A extends AnyTypedArray>(source: A): ElementOf<A> | undefined =>
    atOrUndefinedImpl(source, index)
}

const atImpl = <T extends AnyTypedArray>(source: T, index: number): Option<ElementOf<T>> => {
  const value = atOrUndefinedImpl(source, index)
  return value === undefined ? none : some(value)
}

export function at<T extends AnyTypedArray>(source: T, index: number): Option<ElementOf<T>>
export function at(index: number): <T extends AnyTypedArray>(source: T) => Option<ElementOf<T>>
export function at<T extends AnyTypedArray>(
  sourceOrIndex: T | number,
  index?: number,
): Option<ElementOf<T>> | (<A extends AnyTypedArray>(source: A) => Option<ElementOf<A>>) {
  if (arguments.length !== 1) {
    return atImpl(sourceOrIndex as T, index as number)
  }
  index = sourceOrIndex as number
  return <A extends AnyTypedArray>(source: A): Option<ElementOf<A>> => atImpl(source, index)
}

export const headOrUndefined = <T extends AnyTypedArray>(source: T): ElementOf<T> | undefined =>
  atOrUndefinedImpl(source, 0)

export const head = <T extends AnyTypedArray>(source: T): Option<ElementOf<T>> => atImpl(source, 0)

export const lastOrUndefined = <T extends AnyTypedArray>(source: T): ElementOf<T> | undefined =>
  atOrUndefinedImpl(source, -1)

export const last = <T extends AnyTypedArray>(source: T): Option<ElementOf<T>> => atImpl(source, -1)

export const toArray = <T extends AnyTypedArray>(source: T): Array<ElementOf<T>> => {
  const result = new Array<ElementOf<T>>(source.length)
  for (let index = 0; index < source.length; index++) {
    result[index] = source[index] as ElementOf<T>
  }
  return result
}

const copyIntoImpl = <S extends AnyTypedArray, T extends AnyTypedArray>(
  source: S,
  target: CompatibleTarget<S, T>,
  targetOffset = 0,
): T => {
  const offset = Math.trunc(targetOffset)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + source.length > target.length) {
    throw new RangeError('TypedArray.copyInto: target range is out of bounds')
  }

  typedArraySet.call(target, source, offset)
  return target
}

export function copyInto<S extends AnyTypedArray, T extends AnyTypedArray>(
  source: S,
  target: CompatibleTarget<S, T>,
  targetOffset?: number,
): T
export function copyInto<T extends NumberTypedArray>(
  target: T,
  targetOffset?: number,
): <S extends NumberTypedArray>(source: S) => T
export function copyInto<T extends BigIntTypedArray>(
  target: T,
  targetOffset?: number,
): <S extends BigIntTypedArray>(source: S) => T
export function copyInto(
  sourceOrTarget: AnyTypedArray,
  targetOrOffset?: any,
  targetOffset = 0,
): any {
  if (targetOrOffset === undefined || typeof targetOrOffset === 'number') {
    const target = sourceOrTarget
    const offset = targetOrOffset ?? 0
    return (source: AnyTypedArray): AnyTypedArray => copyIntoImpl(source, target as never, offset)
  }
  return copyIntoImpl(sourceOrTarget, targetOrOffset as never, targetOffset)
}

const mapImpl = <T extends AnyTypedArray>(
  source: T,
  f: (value: ElementOf<T>, index: number) => ElementOf<T>,
): Reallocated<T> => {
  const result = allocateLike(source, source.length)
  const output = writable(result)
  for (let index = 0; index < source.length; index++) {
    output[index] = f(source[index] as ElementOf<T>, index)
  }
  return result as unknown as Reallocated<T>
}

export function map<T extends NumberTypedArray>(
  source: T,
  f: (value: number, index: number) => number,
): Reallocated<T>
export function map<T extends BigIntTypedArray>(
  source: T,
  f: (value: bigint, index: number) => bigint,
): Reallocated<T>
export function map(
  f: (value: number, index: number) => number,
): <T extends NumberTypedArray>(source: T) => Reallocated<T>
export function map(
  f: (value: bigint, index: number) => bigint,
): <T extends BigIntTypedArray>(source: T) => Reallocated<T>
export function map(
  sourceOrF:
    | AnyTypedArray
    | ((value: number, index: number) => number)
    | ((value: bigint, index: number) => bigint),
  f?: ((value: number, index: number) => number) | ((value: bigint, index: number) => bigint),
): unknown {
  if (arguments.length !== 1) {
    return mapImpl(
      sourceOrF as AnyTypedArray,
      f as (value: number | bigint, index: number) => number | bigint,
    )
  }
  const transform = sourceOrF as (value: number | bigint, index: number) => number | bigint
  return <A extends AnyTypedArray>(source: A): Reallocated<A> =>
    mapImpl(source, transform as unknown as (value: ElementOf<A>, index: number) => ElementOf<A>)
}

const mapIntoImpl = (
  source: AnyTypedArray,
  target: AnyTypedArray,
  f: Function,
  targetOffset = 0,
): AnyTypedArray => {
  const offset = Math.trunc(targetOffset)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + source.length > target.length) {
    throw new RangeError('TypedArray.mapInto: target range is out of bounds')
  }

  const output = writable(target)
  const transform = f as (value: number | bigint, index: number) => number | bigint
  for (let index = 0; index < source.length; index++) {
    output[offset + index] = transform(source[index] as number | bigint, index)
  }
  return target
}

export function mapInto<S extends NumberTypedArray, T extends NumberTypedArray>(
  source: S,
  target: T,
  f: (value: number, index: number) => number,
  targetOffset?: number,
): T
export function mapInto<S extends NumberTypedArray, T extends BigIntTypedArray>(
  source: S,
  target: T,
  f: (value: number, index: number) => bigint,
  targetOffset?: number,
): T
export function mapInto<S extends BigIntTypedArray, T extends NumberTypedArray>(
  source: S,
  target: T,
  f: (value: bigint, index: number) => number,
  targetOffset?: number,
): T
export function mapInto<S extends BigIntTypedArray, T extends BigIntTypedArray>(
  source: S,
  target: T,
  f: (value: bigint, index: number) => bigint,
  targetOffset?: number,
): T
export function mapInto<T extends NumberTypedArray>(
  target: T,
  f: (value: number, index: number) => number,
  targetOffset?: number,
): <S extends NumberTypedArray>(source: S) => T
export function mapInto<T extends BigIntTypedArray>(
  target: T,
  f: (value: number, index: number) => bigint,
  targetOffset?: number,
): <S extends NumberTypedArray>(source: S) => T
export function mapInto<T extends NumberTypedArray>(
  target: T,
  f: (value: bigint, index: number) => number,
  targetOffset?: number,
): <S extends BigIntTypedArray>(source: S) => T
export function mapInto<T extends BigIntTypedArray>(
  target: T,
  f: (value: bigint, index: number) => bigint,
  targetOffset?: number,
): <S extends BigIntTypedArray>(source: S) => T
export function mapInto(
  sourceOrTarget: AnyTypedArray,
  targetOrF: any,
  fOrOffset?: any,
  targetOffset = 0,
): any {
  if (typeof targetOrF === 'function') {
    const target = sourceOrTarget
    const offset = (fOrOffset as number | undefined) ?? 0
    return (source: AnyTypedArray): AnyTypedArray => mapIntoImpl(source, target, targetOrF, offset)
  }
  return mapIntoImpl(sourceOrTarget, targetOrF, fOrOffset as Function, targetOffset)
}

const filterLargeBigInt = <T extends BigIntTypedArray>(
  source: T,
  predicate: (value: bigint, index: number) => boolean,
): T => {
  const values = allocateBigIntScratch(source, source.length)
  const output = writable(values)
  let written = 0
  for (let index = 0; index < source.length; index++) {
    const value = source[index] as bigint
    if (!predicate(value, index)) continue
    output[written++] = value
  }

  const result = allocateLike(source, written)
  setInto(result, values.subarray(0, written))
  return result
}

const filterLargeNumber = <T extends NumberTypedArray>(
  source: T,
  predicate: (value: number, index: number) => boolean,
): T => {
  let values = allocateNumberScratch(source, Math.max(1, source.length))
  let written = 0
  for (let index = 0; index < source.length; index++) {
    const value = source[index] as number
    if (!predicate(value, index)) continue
    if (written === values.length) {
      const grown = allocateNumberScratch(source, values.length * 2)
      setInto(grown, values)
      values = grown
    }
    writable(values)[written++] = value
  }

  const result = allocateLike(source, written)
  setInto(result, values.subarray(0, written))
  return result
}

const filterSourceImpl = <T extends AnyTypedArray>(
  source: T,
  predicate: (value: ElementOf<T>, index: number) => boolean,
): Reallocated<T> => {
  if (source.length < SMALL_BULK_COPY_LENGTH) {
    const values: Array<ElementOf<T>> = []
    for (let index = 0; index < source.length; index++) {
      const value = source[index] as ElementOf<T>
      if (predicate(value, index)) values.push(value)
    }
    const result = allocateLike(source, values.length)
    const output = writable(result)
    for (let index = 0; index < values.length; index++) {
      output[index] = values[index] as ElementOf<T>
    }
    return result as unknown as Reallocated<T>
  }

  return typeof source[0] === 'bigint'
    ? (filterLargeBigInt(
        source as BigIntTypedArray,
        predicate as (value: bigint, index: number) => boolean,
      ) as Reallocated<T>)
    : (filterLargeNumber(
        source as NumberTypedArray,
        predicate as (value: number, index: number) => boolean,
      ) as Reallocated<T>)
}

export function filter<T extends AnyTypedArray>(
  source: T,
  predicate: (value: ElementOf<T>, index: number) => boolean,
): Reallocated<T>
export function filter(
  predicate: (value: number | bigint, index: number) => boolean,
): <T extends AnyTypedArray>(source: T) => Reallocated<T>
export function filter(
  predicate: (value: number, index: number) => boolean,
): <T extends NumberTypedArray>(source: T) => Reallocated<T>
export function filter(
  predicate: (value: bigint, index: number) => boolean,
): <T extends BigIntTypedArray>(source: T) => Reallocated<T>
export function filter<T extends AnyTypedArray>(
  sourceOrPredicate:
    | T
    | ((value: number, index: number) => boolean)
    | ((value: bigint, index: number) => boolean),
  predicate?: (value: ElementOf<T>, index: number) => boolean,
):
  | Reallocated<T>
  | (<A extends AnyTypedArray>(source: A) => Reallocated<A>)
  | (<A extends NumberTypedArray>(source: A) => Reallocated<A>)
  | (<A extends BigIntTypedArray>(source: A) => Reallocated<A>) {
  if (arguments.length !== 1) {
    const source = sourceOrPredicate as T
    const test = predicate as (value: ElementOf<T>, index: number) => boolean
    if (source.length < SMALL_BULK_COPY_LENGTH) {
      const values: Array<ElementOf<T>> = []
      for (let index = 0; index < source.length; index++) {
        const value = source[index] as ElementOf<T>
        if (test(value, index)) values.push(value)
      }
      const result = allocateLike(source, values.length)
      const output = writable(result)
      for (let index = 0; index < values.length; index++) {
        output[index] = values[index] as ElementOf<T>
      }
      return result as unknown as Reallocated<T>
    }
    return typeof source[0] === 'bigint'
      ? (filterLargeBigInt(
          source as BigIntTypedArray,
          test as (value: bigint, index: number) => boolean,
        ) as Reallocated<T>)
      : (filterLargeNumber(
          source as NumberTypedArray,
          test as (value: number, index: number) => boolean,
        ) as Reallocated<T>)
  }
  const test = sourceOrPredicate as (value: number | bigint, index: number) => boolean
  return <A extends AnyTypedArray>(source: A): Reallocated<A> =>
    filterSourceImpl(source, test as (value: ElementOf<A>, index: number) => boolean)
}

export interface FilterIntoResult<T extends AnyTypedArray> {
  readonly target: T
  readonly written: number
}

const filterIntoImpl = <S extends AnyTypedArray, T extends AnyTypedArray>(
  source: S,
  target: CompatibleTarget<S, T>,
  predicate: (value: ElementOf<S>, index: number) => boolean,
  targetOffset = 0,
): FilterIntoResult<T> => {
  const offset = Math.trunc(targetOffset)
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError('TypedArray.filterInto: target offset is out of bounds')
  }

  const output = writable(target)
  let written = 0
  for (let index = 0; index < source.length; index++) {
    const value = source[index] as ElementOf<S>
    if (!predicate(value, index)) continue
    if (offset + written >= target.length) {
      throw new RangeError('TypedArray.filterInto: target capacity exceeded')
    }
    output[offset + written++] = value as unknown as ElementOf<T>
  }
  return { target, written }
}

export function filterInto<S extends AnyTypedArray, T extends AnyTypedArray>(
  source: S,
  target: CompatibleTarget<S, T>,
  predicate: (value: ElementOf<S>, index: number) => boolean,
  targetOffset?: number,
): FilterIntoResult<T>
export function filterInto<T extends NumberTypedArray>(
  target: T,
  predicate: (value: number, index: number) => boolean,
  targetOffset?: number,
): <S extends NumberTypedArray>(source: S) => FilterIntoResult<T>
export function filterInto<T extends BigIntTypedArray>(
  target: T,
  predicate: (value: bigint, index: number) => boolean,
  targetOffset?: number,
): <S extends BigIntTypedArray>(source: S) => FilterIntoResult<T>
export function filterInto(
  sourceOrTarget: AnyTypedArray,
  targetOrPredicate: any,
  predicateOrOffset?: any,
  targetOffset = 0,
): any {
  if (typeof targetOrPredicate === 'function') {
    const target = sourceOrTarget
    const predicate = targetOrPredicate
    const offset = (predicateOrOffset as number | undefined) ?? 0
    return (source: AnyTypedArray): FilterIntoResult<AnyTypedArray> =>
      filterIntoImpl(source, target as never, predicate as never, offset)
  }
  return filterIntoImpl(
    sourceOrTarget,
    targetOrPredicate as never,
    predicateOrOffset as never,
    targetOffset,
  )
}

const normalizeRelativeIndex = (value: number, length: number): number => {
  const integer =
    value === 0 || Number.isNaN(value) ? 0 : Number.isFinite(value) ? Math.trunc(value) : value
  return integer < 0 ? Math.max(length + integer, 0) : Math.min(integer, length)
}

const sliceImpl = <T extends AnyTypedArray>(
  source: T,
  start: number,
  end: number,
): Reallocated<T> => {
  const sourceLength = source.length
  const from = normalizeRelativeIndex(start, sourceLength)
  const to = normalizeRelativeIndex(end, sourceLength)
  const length = Math.max(0, to - from)
  if (
    (SLICE_ALWAYS_INTRINSIC ||
      sourceLength >= SMALL_BULK_COPY_LENGTH ||
      isBigIntTypedArray(source)) &&
    isCanonicalTypedArray(source)
  ) {
    return typedArraySlice.call(source, from, to) as Reallocated<T>
  }
  const result = allocateLike(source, length)
  const output = writable(result)
  for (let index = 0; index < length; index++) {
    output[index] = source[from + index] as ElementOf<T>
  }
  return result as unknown as Reallocated<T>
}

export function slice<T extends AnyTypedArray>(
  source: T,
  start?: number,
  end?: number,
): Reallocated<T>
export function slice(
  start?: number,
  end?: number,
): <T extends AnyTypedArray>(source: T) => Reallocated<T>
export function slice<T extends AnyTypedArray>(
  sourceOrStart?: T | number,
  startOrEnd?: number,
  end?: number,
): Reallocated<T> | (<A extends AnyTypedArray>(source: A) => Reallocated<A>) {
  if (sourceOrStart === undefined || typeof sourceOrStart === 'number') {
    const from = sourceOrStart ?? 0
    const end = startOrEnd
    return <A extends AnyTypedArray>(source: A): Reallocated<A> =>
    sliceImpl(source, from, end ?? source.length)
  }
  const directStart = startOrEnd ?? 0
  const directEnd = end ?? sourceOrStart.length
  if (
    (SLICE_ALWAYS_INTRINSIC ||
      sourceOrStart.length >= SMALL_BULK_COPY_LENGTH ||
      isBigIntTypedArray(sourceOrStart)) &&
    isCanonicalTypedArray(sourceOrStart)
  ) {
    return typedArraySlice.call(sourceOrStart, directStart, directEnd) as Reallocated<T>
  }
  // Keep the small numeric data-first path in this dispatch frame. This is the
  // latency-sensitive case where an extra helper call is measurable; larger
  // and bigint arrays use the intrinsic directly above.
  if (
    sourceOrStart.length < SMALL_BULK_COPY_LENGTH &&
    !isBigIntTypedArray(sourceOrStart) &&
    directStart >= 0 &&
    directStart <= sourceOrStart.length &&
    (directStart | 0) === directStart &&
    directEnd >= 0 &&
    directEnd <= sourceOrStart.length &&
    (directEnd | 0) === directEnd
  ) {
    const length = Math.max(0, directEnd - directStart)
    const result = allocateLike(sourceOrStart, length)
    const output = writable(result)
    for (let index = 0; index < length; index++) {
      output[index] = sourceOrStart[directStart + index] as ElementOf<T>
    }
    return result as unknown as Reallocated<T>
  }
  return sliceImpl(sourceOrStart, directStart, directEnd)
}

export function concat<T extends NumberTypedArray>(
  source: T,
  ...others: readonly NumberTypedArray[]
): Reallocated<T>
export function concat<T extends BigIntTypedArray>(
  source: T,
  ...others: readonly BigIntTypedArray[]
): Reallocated<T>
export function concat<T extends AnyTypedArray>(
  source: T,
  ..._others: readonly AnyTypedArray[]
): Reallocated<T> {
  const argumentCount = arguments.length
  let length = source.length
  for (let argumentIndex = 1; argumentIndex < argumentCount; argumentIndex++) {
    length += (arguments[argumentIndex] as T).length
  }
  const result = allocateLike(source, length)
  if (length < SMALL_BULK_COPY_LENGTH && source.length > 0 && !isBigIntTypedArray(source)) {
    const output = writable(result)
    let written = 0
    for (let index = 0; index < source.length; index++) {
      output[written++] = source[index] as ElementOf<T>
    }
    for (let argumentIndex = 1; argumentIndex < argumentCount; argumentIndex++) {
      const current = arguments[argumentIndex] as T
      for (let index = 0; index < current.length; index++) {
        output[written++] = current[index] as ElementOf<T>
      }
    }
    return result as unknown as Reallocated<T>
  }
  let offset = 0
  setInto(result, source, offset)
  offset += source.length
  for (let argumentIndex = 1; argumentIndex < argumentCount; argumentIndex++) {
    const current = arguments[argumentIndex] as T
    setInto(result, current, offset)
    offset += current.length
  }
  return result as unknown as Reallocated<T>
}

export const reverse = <T extends AnyTypedArray>(source: T): Reallocated<T> => {
  if (
    (REVERSE_ALWAYS_INTRINSIC ||
      source.length >= SMALL_BULK_COPY_LENGTH ||
      isBigIntTypedArray(source)) &&
    isCanonicalTypedArray(source)
  ) {
    const result = typedArraySlice.call(source)
    typedArrayReverse.call(result)
    return result as Reallocated<T>
  }
  const result = allocateLike(source, source.length)
  const output = writable(result)
  for (let index = 0; index < source.length; index++) {
    output[index] = source[source.length - index - 1] as ElementOf<T>
  }
  return result as unknown as Reallocated<T>
}

const sortImpl = <T extends AnyTypedArray>(
  source: T,
  compare?: (left: ElementOf<T>, right: ElementOf<T>) => number,
): Reallocated<T> => {
  if (source.length === 0) {
    return allocateLike(source, 0) as unknown as Reallocated<T>
  }

  const compareValues =
    compare === undefined
      ? defaultSortCompare
      : (compare as (left: number | bigint, right: number | bigint) => number)

  let sorted: AnyTypedArray | Array<ElementOf<T>>
  if (typeof source[0] === 'number') {
    let hasNaN = false
    let hasPositiveZero = false
    let hasNegativeZero = false
    for (let index = 0; index < source.length; index++) {
      const value = source[index] as number
      if (Number.isNaN(value)) {
        hasNaN = true
        break
      }
      if (value === 0) {
        if (Object.is(value, -0)) hasNegativeZero = true
        else hasPositiveZero = true
      }
    }
    if (compare === undefined && !hasNaN && !(hasPositiveZero && hasNegativeZero)) {
      if (isCanonicalTypedArray(source)) {
        const result = typedArraySlice.call(source)
        typedArraySort.call(result)
        return result as Reallocated<T>
      }
      const values = allocateNumberScratch(source as NumberTypedArray, source.length)
      setInto(values, source)
      typedArraySort.call(values)
      sorted = values as AnyTypedArray
    } else {
      const values = allocateNumberScratch(source as NumberTypedArray, source.length)
      setInto(values, source)
      const sortable = Array.from(values) as Array<ElementOf<T>>
      sortable.sort(compareValues)
      sorted = sortable
    }
  } else if (source instanceof BigInt64Array) {
    if (compare === undefined) {
      if (isCanonicalTypedArray(source)) {
        const result = typedArraySlice.call(source)
        typedArraySort.call(result)
        return result as Reallocated<T>
      }
      const values = new BigInt64Array(source.length)
      setInto(values, source)
      typedArraySort.call(values)
      sorted = values
    } else {
      const values = toArray(source)
      values.sort(compareValues)
      sorted = values
    }
  } else if (source instanceof BigUint64Array) {
    if (compare === undefined) {
      if (isCanonicalTypedArray(source)) {
        const result = typedArraySlice.call(source)
        typedArraySort.call(result)
        return result as Reallocated<T>
      }
      const values = new BigUint64Array(source.length)
      setInto(values, source)
      typedArraySort.call(values)
      sorted = values
    } else {
      const values = toArray(source)
      values.sort(compareValues)
      sorted = values
    }
  } else {
    const values = toArray(source)
    values.sort(compareValues)
    sorted = values
  }

  const result = allocateLike(source, source.length)
  setInto(result, sorted)
  return result as unknown as Reallocated<T>
}

export function sort<T extends AnyTypedArray>(
  source: T,
  compare?: (left: ElementOf<T>, right: ElementOf<T>) => number,
): Reallocated<T>
export function sort(): <T extends AnyTypedArray>(source: T) => Reallocated<T>
export function sort(
  compare: (left: number | bigint, right: number | bigint) => number,
): <T extends AnyTypedArray>(source: T) => Reallocated<T>
export function sort(
  compare: (left: number, right: number) => number,
): <T extends NumberTypedArray>(source: T) => Reallocated<T>
export function sort(
  compare: (left: bigint, right: bigint) => number,
): <T extends BigIntTypedArray>(source: T) => Reallocated<T>
export function sort<T extends AnyTypedArray>(
  sourceOrCompare?:
    | T
    | ((left: number, right: number) => number)
    | ((left: bigint, right: bigint) => number),
  dataFirstCompare?: (left: ElementOf<T>, right: ElementOf<T>) => number,
):
  | Reallocated<T>
  | (<A extends AnyTypedArray>(source: A) => Reallocated<A>)
  | (<A extends NumberTypedArray>(source: A) => Reallocated<A>)
  | (<A extends BigIntTypedArray>(source: A) => Reallocated<A>) {
  if (sourceOrCompare === undefined || typeof sourceOrCompare === 'function') {
    const compare = sourceOrCompare
    return <A extends AnyTypedArray>(source: A): Reallocated<A> =>
    sortImpl(
      source,
      compare as unknown as ((left: ElementOf<A>, right: ElementOf<A>) => number) | undefined,
    )
  }
  return sortImpl(sourceOrCompare, dataFirstCompare)
}

const reduceImpl = <T extends AnyTypedArray, B>(
  source: T,
  reducer: (state: B, value: ElementOf<T>, index: number) => B,
  initial: B,
): B => {
  let state = initial
  for (let index = 0; index < source.length; index++) {
    state = reducer(state, source[index] as ElementOf<T>, index)
  }
  return state
}

export function reduce<T extends AnyTypedArray, B>(
  source: T,
  reducer: (state: B, value: ElementOf<T>, index: number) => B,
  initial: B,
): B
export function reduce<B>(
  reducer: (state: B, value: number | bigint, index: number) => B,
  initial: B,
): <T extends AnyTypedArray>(source: T) => B
export function reduce<B>(
  reducer: (state: B, value: number, index: number) => B,
  initial: B,
): <T extends NumberTypedArray>(source: T) => B
export function reduce<B>(
  reducer: (state: B, value: bigint, index: number) => B,
  initial: B,
): <T extends BigIntTypedArray>(source: T) => B
export function reduce<T extends AnyTypedArray, B>(
  sourceOrReducer:
    | T
    | ((state: B, value: number, index: number) => B)
    | ((state: B, value: bigint, index: number) => B),
  reducerOrInitial: ((state: B, value: ElementOf<T>, index: number) => B) | B,
  initial?: B,
):
  | B
  | (<A extends NumberTypedArray>(source: A) => B)
  | (<A extends BigIntTypedArray>(source: A) => B) {
  if (arguments.length !== 2) {
    return reduceImpl(
      sourceOrReducer as T,
      reducerOrInitial as (state: B, value: ElementOf<T>, index: number) => B,
      initial as B,
    )
  }
  const reducer = sourceOrReducer as (state: B, value: number | bigint, index: number) => B
  initial = reducerOrInitial as B
  return <A extends AnyTypedArray>(source: A): B =>
    reduceImpl(
      source,
      reducer as unknown as (state: B, value: ElementOf<A>, index: number) => B,
      initial,
    )
}

const indexOfOrUndefinedImpl = <T extends AnyTypedArray>(
  source: T,
  search: ElementOf<T>,
): number | undefined => {
  if (typeof search === 'number' && Number.isNaN(search)) {
    for (let index = 0; index < source.length; index++) {
      if (Number.isNaN(source[index])) return index
    }
    return undefined
  }

  const index = typedArrayIndexOf.call(source, search)
  return index === -1 ? undefined : index
}

export function indexOfOrUndefined<T extends AnyTypedArray>(
  source: T,
  search: ElementOf<T>,
): number | undefined
export function indexOfOrUndefined(
  search: number,
): <T extends NumberTypedArray>(source: T) => number | undefined
export function indexOfOrUndefined(
  search: bigint,
): <T extends BigIntTypedArray>(source: T) => number | undefined
export function indexOfOrUndefined<T extends AnyTypedArray>(
  sourceOrSearch: T | number | bigint,
  dataFirstSearch?: ElementOf<T>,
):
  | number
  | undefined
  | (<A extends NumberTypedArray>(source: A) => number | undefined)
  | (<A extends BigIntTypedArray>(source: A) => number | undefined) {
  if (arguments.length !== 1) {
    return indexOfOrUndefinedImpl(sourceOrSearch as T, dataFirstSearch as ElementOf<T>)
  }
  const search = sourceOrSearch as number | bigint
  return <A extends AnyTypedArray>(source: A): number | undefined =>
    indexOfOrUndefinedImpl(source, search as ElementOf<A>)
}

const indexOfImpl = <T extends AnyTypedArray>(source: T, search: ElementOf<T>): Option<number> => {
  const index = indexOfOrUndefinedImpl(source, search)
  return index === undefined ? none : some(index)
}

export function indexOf<T extends AnyTypedArray>(source: T, search: ElementOf<T>): Option<number>
export function indexOf(search: number): <T extends NumberTypedArray>(source: T) => Option<number>
export function indexOf(search: bigint): <T extends BigIntTypedArray>(source: T) => Option<number>
export function indexOf<T extends AnyTypedArray>(
  sourceOrSearch: T | number | bigint,
  dataFirstSearch?: ElementOf<T>,
):
  | Option<number>
  | (<A extends NumberTypedArray>(source: A) => Option<number>)
  | (<A extends BigIntTypedArray>(source: A) => Option<number>) {
  if (arguments.length !== 1) {
    return indexOfImpl(sourceOrSearch as T, dataFirstSearch as ElementOf<T>)
  }
  const search = sourceOrSearch as number | bigint
  return <A extends AnyTypedArray>(source: A): Option<number> =>
    indexOfImpl(source, search as ElementOf<A>)
}

const includesImpl = <T extends AnyTypedArray>(source: T, search: ElementOf<T>): boolean =>
  typedArrayIncludes.call(source, search)

export function includes<T extends AnyTypedArray>(source: T, search: ElementOf<T>): boolean
export function includes(search: number): <T extends NumberTypedArray>(source: T) => boolean
export function includes(search: bigint): <T extends BigIntTypedArray>(source: T) => boolean
export function includes<T extends AnyTypedArray>(
  sourceOrSearch: T | number | bigint,
  dataFirstSearch?: ElementOf<T>,
):
  | boolean
  | (<A extends NumberTypedArray>(source: A) => boolean)
  | (<A extends BigIntTypedArray>(source: A) => boolean) {
  if (arguments.length !== 1) {
    return includesImpl(sourceOrSearch as T, dataFirstSearch as ElementOf<T>)
  }
  const search = sourceOrSearch as number | bigint
  return <A extends AnyTypedArray>(source: A): boolean => includesImpl(source, search as ElementOf<A>)
}

const equalsImpl = (source: AnyTypedArray, other: AnyTypedArray): boolean => {
  if (source.length !== other.length) return false
  for (let index = 0; index < source.length; index++) {
    if (!sameValueZero(source[index] as number | bigint, other[index] as number | bigint)) {
      return false
    }
  }
  return true
}

export function equals(source: NumberTypedArray, other: NumberTypedArray): boolean
export function equals(source: BigIntTypedArray, other: BigIntTypedArray): boolean
export function equals(other: NumberTypedArray): (source: NumberTypedArray) => boolean
export function equals(other: BigIntTypedArray): (source: BigIntTypedArray) => boolean
export function equals(sourceOrOther: AnyTypedArray, other?: AnyTypedArray): unknown {
  if (arguments.length !== 1) {
    return equalsImpl(sourceOrOther, other as AnyTypedArray)
  }
  other = sourceOrOther
  return (source: AnyTypedArray) => equalsImpl(source, other)
}

export const sum = (source: NumberTypedArray): number => {
  let total = 0
  for (let index = 0; index < source.length; index++) total += source[index] as number
  return total
}

export const sumBigInt = (source: BigIntTypedArray): bigint => {
  let total = 0n
  for (let index = 0; index < source.length; index++) total += source[index] as bigint
  return total
}
