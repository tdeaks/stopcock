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
 *
 * `isCanonicalView` and `hasIntrinsicIteration` used to also back Iter's
 * typed-array kernel admission (`internal/typed-array-source.ts`); that
 * kernel family is gone (phase 6), so this module now carries only what
 * `typed-array.ts` itself needs.
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
