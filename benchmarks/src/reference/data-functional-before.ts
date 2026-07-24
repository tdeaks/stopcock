/**
 * Frozen pre-optimization implementations for the remaining data/functional
 * hot-path gate. Keep this file byte-stable; the contract pins its SHA-256.
 */

import type { Indexed, WritableIndexed } from '../../../packages/fp/src/indexed'
import type { Reader } from '../../../packages/fp/src/reader'
import type { Semigroup } from '../../../packages/fp/src/semigroup'
import type { State } from '../../../packages/fp/src/state-fn'
import type { These } from '../../../packages/fp/src/these'
import type { Validation } from '../../../packages/fp/src/validation'

export const validationAllBefore = (
  validations: readonly Validation<unknown, unknown>[],
): Validation<unknown[], unknown> => {
  const values: unknown[] = []
  const errors: unknown[] = []
  for (const validation of validations) {
    if (validation._tag === 1) values.push(validation.value)
    else errors.push(...validation.error)
  }
  return errors.length === 0
    ? { _tag: 1, value: values }
    : { _tag: 0, error: errors as [unknown, ...unknown[]] }
}

const theseLeft = <E>(value: E): These<E, never> => ({
  _tag: 'Left',
  left: value,
})

const theseRight = <A>(value: A): These<never, A> => ({
  _tag: 'Right',
  right: value,
})

const theseBoth = <E, A>(error: E, value: A): These<E, A> => ({
  _tag: 'Both',
  left: error,
  right: value,
})

const theseMapBefore =
  <A, B>(transform: (value: A) => B) =>
  <E>(value: These<E, A>): These<E, B> => {
    switch (value._tag) {
      case 'Left':
        return value
      case 'Right':
        return theseRight(transform(value.right))
      case 'Both':
        return theseBoth(value.left, transform(value.right))
    }
  }

const theseFlatMapBefore =
  <E>(errors: Semigroup<E>) =>
  <A, B>(transform: (value: A) => These<E, B>) =>
  (value: These<E, A>): These<E, B> => {
    if (value._tag === 'Left') return value
    if (value._tag === 'Right') return transform(value.right)
    const next = transform(value.right)
    switch (next._tag) {
      case 'Left':
        return theseLeft(errors.combine(value.left, next.left))
      case 'Right':
        return theseBoth(value.left, next.right)
      case 'Both':
        return theseBoth(errors.combine(value.left, next.left), next.right)
    }
  }

export const theseZipWithBefore =
  <E>(errors: Semigroup<E>) =>
  <A, B, C>(that: These<E, B>, combineValues: (self: A, that: B) => C) =>
  (self: These<E, A>): These<E, C> =>
    theseFlatMapBefore(errors)((selfValue: A) =>
      theseMapBefore((thatValue: B) => combineValues(selfValue, thatValue))(that),
    )(self)

const readerMapBefore =
  <A, B>(transform: (value: A) => B) =>
  <Environment>(self: Reader<Environment, A>): Reader<Environment, B> =>
  (environment: Environment): B =>
    transform(self(environment))

const readerFlatMapBefore =
  <A, Environment2, B>(transform: (value: A) => Reader<Environment2, B>) =>
  <Environment>(
    self: Reader<Environment, A>,
  ): Reader<Environment & Environment2, B> =>
  (environment: Environment & Environment2): B =>
    transform(self(environment))(environment)

export const readerTapBefore =
  <A, Environment2, B>(effect: (value: A) => Reader<Environment2, B>) =>
  <Environment>(
    self: Reader<Environment, A>,
  ): Reader<Environment & Environment2, A> =>
    readerFlatMapBefore((value: A) =>
      readerMapBefore(() => value)(effect(value)),
    )(self)

const stateMapBefore =
  <A, B>(transform: (value: A) => B) =>
  <StateValue>(self: State<StateValue, A>): State<StateValue, B> =>
  (initial: StateValue): readonly [B, StateValue] => {
    const [value, next] = self(initial)
    return [transform(value), next]
  }

const stateFlatMapBefore =
  <StateValue, A, B>(transform: (value: A) => State<StateValue, B>) =>
  (self: State<StateValue, A>): State<StateValue, B> =>
  (initial: StateValue): readonly [B, StateValue] => {
    const [value, next] = self(initial)
    return transform(value)(next)
  }

export const stateTapBefore =
  <StateValue, A, B>(effect: (value: A) => State<StateValue, B>) =>
  (self: State<StateValue, A>): State<StateValue, A> =>
    stateFlatMapBefore((value: A) =>
      stateMapBefore(() => value)(effect(value)),
    )(self)

const sameValueZero = (left: unknown, right: unknown): boolean =>
  left === right || (left !== left && right !== right)

const indexedNoneBefore = { _tag: 0 as const }

const indexedIndexOfBefore = <A>(
  source: Indexed<A>,
  search: A,
): { readonly _tag: 0 } | { readonly _tag: 1; readonly value: number } => {
  for (let index = 0; index < source.length; index += 1) {
    if (sameValueZero(source[index], search)) return { _tag: 1, value: index }
  }
  return indexedNoneBefore
}

export const indexedIncludesBefore = <A>(
  source: Indexed<A>,
  search: A,
): boolean => indexedIndexOfBefore(source, search)._tag === 1

const indexedBoundsBefore = (
  length: number,
  start = 0,
  end = length,
): readonly [number, number] => {
  const candidateStart =
    start < 0
      ? Math.max(length + Math.trunc(start), 0)
      : Math.min(Math.trunc(start), length)
  const candidateEnd =
    end < 0
      ? Math.max(length + Math.trunc(end), 0)
      : Math.min(Math.trunc(end), length)
  const normalizedStart = Number.isNaN(candidateStart) ? 0 : candidateStart
  const normalizedEnd = Number.isNaN(candidateEnd) ? 0 : candidateEnd
  return [normalizedStart, Math.max(normalizedStart, normalizedEnd)]
}

export const indexedSliceBefore = <A>(
  source: Indexed<A>,
  start = 0,
  end = source.length,
): A[] => {
  const [from, to] = indexedBoundsBefore(source.length, start, end)
  const result = new Array<A>(to - from)
  for (let index = from; index < to; index++) {
    result[index - from] = source[index] as A
  }
  return result
}

export const indexedCopyIntoBefore = <A, T extends WritableIndexed<A>>(
  source: Indexed<A>,
  target: T,
  targetOffset = 0,
  start = 0,
  end = source.length,
): T => {
  const [from, to] = indexedBoundsBefore(source.length, start, end)
  const offset = Math.trunc(targetOffset)
  const count = to - from
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + count > target.length) {
    throw new RangeError('Indexed.copyInto: target range is out of bounds')
  }
  if (source === target && offset > from && offset < to) {
    for (let index = count - 1; index >= 0; index--) {
      target[offset + index] = source[from + index] as A
    }
  } else {
    for (let index = 0; index < count; index++) {
      target[offset + index] = source[from + index] as A
    }
  }
  return target
}
