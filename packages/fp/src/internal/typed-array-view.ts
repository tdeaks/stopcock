/**
 * Canonical-view inspection.
 *
 * Answers one question: is this value a plain, current-realm, built-in typed
 * array whose element family is known, so an operation may use the stashed
 * intrinsic instead of an element loop? Everything else — subclasses, own
 * `constructor` overrides, cross-realm views, anything with a foreign
 * prototype — is deliberately not canonical and falls back to the generic
 * path.
 *
 * Private on purpose. It exists so a caller can authenticate a view without
 * importing the public typed-array entry, and it holds no policy of its own.
 */

export type TypedArrayFamily =
  | 'int8'
  | 'uint8'
  | 'uint8clamped'
  | 'int16'
  | 'uint16'
  | 'int32'
  | 'uint32'
  | 'float16'
  | 'float32'
  | 'float64'
  | 'bigint64'
  | 'biguint64'

export interface CanonicalView {
  readonly family: TypedArrayFamily
  /** Element type, so a caller can pick number or bigint kernels without a read. */
  readonly bigint: boolean
  /** Bytes per element, which for a canonical view is fixed by the family. */
  readonly bytesPerElement: number
}

const view = (family: TypedArrayFamily, bigint: boolean, bytesPerElement: number): CanonicalView =>
  Object.freeze({ family, bigint, bytesPerElement })

interface AnyTypedArrayConstructor {
  readonly prototype: object
}

/**
 * Float16Array is optional: it is absent on older engines and on TypeScript
 * libs that predate it. Probing for it keeps the table exhaustive on engines
 * that have it without asserting anything about engines that do not.
 */
const optionalFloat16 = Reflect.get(globalThis, 'Float16Array') as
  | AnyTypedArrayConstructor
  | undefined

const canonicalViews = new Map<object, CanonicalView>([
  [Int8Array.prototype, view('int8', false, 1)],
  [Uint8Array.prototype, view('uint8', false, 1)],
  [Uint8ClampedArray.prototype, view('uint8clamped', false, 1)],
  [Int16Array.prototype, view('int16', false, 2)],
  [Uint16Array.prototype, view('uint16', false, 2)],
  [Int32Array.prototype, view('int32', false, 4)],
  [Uint32Array.prototype, view('uint32', false, 4)],
  [Float32Array.prototype, view('float32', false, 4)],
  [Float64Array.prototype, view('float64', false, 8)],
  [BigInt64Array.prototype, view('bigint64', true, 8)],
  [BigUint64Array.prototype, view('biguint64', true, 8)],
])

if (optionalFloat16 !== undefined) {
  canonicalViews.set(optionalFloat16.prototype, view('float16', false, 2))
}

/** The families this realm actually has, in table order. */
export const CANONICAL_FAMILIES: readonly TypedArrayFamily[] = Object.freeze(
  [...canonicalViews.values()].map((entry) => entry.family),
)

const getPrototypeOf = Object.getPrototypeOf
const hasOwn = Object.hasOwn

/**
 * The canonical view fact, or `undefined` when the value is not one.
 *
 * An own `constructor` is disqualifying even when the prototype matches: the
 * allocating operations honour a concrete constructor override, and they can
 * only do that off the generic path.
 */
export const inspectCanonicalView = (value: object): CanonicalView | undefined =>
  hasOwn(value, 'constructor') ? undefined : canonicalViews.get(getPrototypeOf(value))

/** Cheaper form for callers that only need the yes/no. */
export const isCanonicalView = (value: object): boolean =>
  !hasOwn(value, 'constructor') && canonicalViews.has(getPrototypeOf(value))

const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype) as object
const intrinsicIterator = Reflect.get(typedArrayPrototype, Symbol.iterator) as unknown

/**
 * Whether iterating this value would reach `%TypedArrayPrototype%[@@iterator]`.
 *
 * A canonical view can still shadow iteration with an own property, and the
 * shared prototype method itself can be replaced after this module loads, so
 * both are checked against the intrinsic captured at load. Callers that intend
 * to replace iteration with indexed access need this; callers that only
 * allocate do not, which is why it is separate from `inspectCanonicalView`.
 */
/**
 * Resolves the method the value would actually iterate with, rather than
 * checking only its own property and the shared %TypedArray%.prototype. The
 * family prototype sits between those two: overriding
 * `Uint8Array.prototype[Symbol.iterator]` used to leave this answering true
 * while iteration was entirely custom.
 */
export const hasIntrinsicIteration = (value: object): boolean =>
  !hasOwn(value, Symbol.iterator) && Reflect.get(value, Symbol.iterator) === intrinsicIterator
