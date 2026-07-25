/**
 * Typed-array source admission for Iter.
 *
 * A generated Iter kernel replaces `%TypedArrayPrototype%[@@iterator]` with an
 * indexed loop. That is only sound when nothing observable can tell the two
 * apart, so a value is admitted here on facts alone: P2 authenticates the view,
 * iteration must resolve to the intrinsic through every link of the lookup
 * chain, `length` must still report what the intrinsic accessor reports, and
 * the buffer must be one whose byte length cannot change under the loop.
 *
 * What is left after those checks is exactly one divergence: a stage or
 * terminal callback can detach the buffer mid-traversal, where the iterator
 * throws and an indexed loop simply stops. `typedArraySourceIntact` closes it
 * after the fact, which is why only terminals that cannot exit early are
 * admitted — for those, a short traversal can only mean the buffer went away.
 */

import { hasIntrinsicIteration, isCanonicalView } from './typed-array-view'

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object

const getterOf = (target: object, key: PropertyKey): unknown =>
  Object.getOwnPropertyDescriptor(target, key)?.get

const intrinsicLength = getterOf(typedArrayPrototype, 'length') as
  | ((this: object) => number)
  | undefined
const intrinsicBuffer = getterOf(typedArrayPrototype, 'buffer') as
  | ((this: object) => object)
  | undefined
const intrinsicIterator = Reflect.get(typedArrayPrototype, Symbol.iterator) as unknown

/**
 * `detached` is ES2024. An engine without it cannot be asked whether a view is
 * already dead, and a dead view iterates by throwing while indexed reads report
 * an empty source, so such an engine is never admitted.
 */
const canQueryDetached = getterOf(ArrayBuffer.prototype, 'detached') !== undefined

interface BufferFacts {
  readonly resizable?: boolean
  readonly growable?: boolean
  readonly detached?: boolean
}

/**
 * The source length at admission, or `-1` when the value must iterate.
 *
 * The length is the return value because every admitted caller needs it: it is
 * the only cheap witness that the buffer survived the traversal.
 */
export const admitTypedArraySource = (value: object): number => {
  if (!ArrayBuffer.isView(value)) return -1
  if (intrinsicLength === undefined || intrinsicBuffer === undefined) return -1
  if (!isCanonicalView(value) || !hasIntrinsicIteration(value)) return -1
  // isCanonicalView clears the value's own prototype and hasIntrinsicIteration
  // clears the value and the shared prototype. The family prototype sits
  // between them and can shadow iteration on its own.
  if (Reflect.get(value, Symbol.iterator) !== intrinsicIterator) return -1

  const length = intrinsicLength.call(value)
  // A kernel loops on the property, so a `length` the loop and the iterator
  // disagree about is disqualifying however it got that way.
  if ((value as unknown as ArrayLike<unknown>).length !== length) return -1

  const buffer = intrinsicBuffer.call(value) as BufferFacts
  // A resizable or growable buffer moves the view's length under the loop, and
  // a fixed-length view over one can go out of bounds, which iteration reports
  // by throwing.
  if (buffer.resizable === true || buffer.growable === true) return -1
  // A SharedArrayBuffer cannot detach, so it needs no detachment query at all.
  if (buffer.growable === undefined && (!canQueryDetached || buffer.detached !== false)) return -1

  return length
}

/**
 * Whether the buffer behind an admitted source is still the one the loop
 * started on. A detached view reports zero length, so an unchanged length is
 * proof the traversal saw every element the iterator would have yielded.
 */
export const typedArraySourceIntact = (source: ArrayLike<unknown>, length: number): boolean =>
  source.length === length

/**
 * Reports detachment the way iteration reports it, by driving the value's own
 * iterator so the engine writes the message rather than this module guessing at
 * it.
 */
export const throwTypedArrayDetached = (source: object): never => {
  ;(source as Iterable<unknown>)[Symbol.iterator]().next()
  throw new TypeError('Iter: the typed array buffer was detached during traversal')
}
