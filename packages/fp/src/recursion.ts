import type { Option } from './option'
import { none, some } from './option'

export interface Continue<State> {
  readonly _tag: 'Continue'
  readonly state: State
}

export interface Complete<A> {
  readonly _tag: 'Complete'
  readonly value: A
}

export type TailStep<State, A> = Continue<State> | Complete<A>

export const continueWith = <State>(state: State): TailStep<State, never> => ({
  _tag: 'Continue',
  state,
})

export const complete = <A>(value: A): TailStep<never, A> => ({
  _tag: 'Complete',
  value,
})

export const tailRec = <State, A>(
  initial: State,
  step: (state: State) => TailStep<State, A>,
): A => {
  let current = initial
  while (true) {
    const next = step(current)
    if (next._tag === 'Complete') return next.value
    current = next.state
  }
}

export interface Now<A> {
  readonly _tag: 'Now'
  readonly value: A
}

export interface Suspend<A> {
  readonly _tag: 'Suspend'
  readonly thunk: () => Trampoline<A>
}

export type Trampoline<A> = Now<A> | Suspend<A>

export const now = <A>(value: A): Trampoline<A> => ({ _tag: 'Now', value })
export const suspend = <A>(thunk: () => Trampoline<A>): Trampoline<A> => ({
  _tag: 'Suspend',
  thunk,
})

export const run = <A>(trampoline: Trampoline<A>): A => {
  let current = trampoline
  while (current._tag === 'Suspend') current = current.thunk()
  return current.value
}

export const map = <A, B>(
  transform: (value: A) => B,
): ((trampoline: Trampoline<A>) => Trampoline<B>) => {
  const loop = (trampoline: Trampoline<A>): Trampoline<B> =>
    trampoline._tag === 'Now'
      ? now(transform(trampoline.value))
      : suspend(() => loop(trampoline.thunk()))
  return loop
}

export const flatMap = <A, B>(
  transform: (value: A) => Trampoline<B>,
): ((trampoline: Trampoline<A>) => Trampoline<B>) => {
  const loop = (trampoline: Trampoline<A>): Trampoline<B> =>
    trampoline._tag === 'Now'
      ? transform(trampoline.value)
      : suspend(() => loop(trampoline.thunk()))
  return loop
}

export const fix = <A, B>(
  define: (recur: (value: A) => B, value: A) => B,
): ((value: A) => B) => {
  const recur = (value: A): B => define(recur, value)
  return recur
}

/** Memoized fixed point using Map's SameValueZero key semantics. */
export const memoFix = <A, B>(
  define: (recur: (value: A) => B, value: A) => B,
): ((value: A) => B) => {
  const cachedUndefined = {}
  const cache = new Map<A, B | typeof cachedUndefined>()
  const recur = (value: A): B => {
    const cached = cache.get(value)
    if (cached !== undefined) {
      return (cached === cachedUndefined ? undefined : cached) as B
    }
    const result = define(recur, value)
    cache.set(value, result === undefined ? cachedUndefined : result)
    return result
  }
  return recur
}

/** Builds a dense array until the step returns None. */
export const unfold = <State, A>(
  initial: State,
  step: (state: State) => Option<readonly [A, State]>,
): readonly A[] => {
  const result: A[] = []
  let current = initial
  while (true) {
    const next = step(current)
    if (next._tag === 0) return result
    result.push(next.value[0])
    current = next.value[1]
  }
}

export const foldLeft = <A, B>(
  values: readonly A[],
  initial: B,
  combine: (accumulator: B, value: A, index: number) => B,
): B => {
  let result = initial
  for (let index = 0; index < values.length; index += 1) {
    result = combine(result, values[index] as A, index)
  }
  return result
}

export const foldRight = <A, B>(
  values: readonly A[],
  initial: B,
  combine: (value: A, accumulator: B, index: number) => B,
): B => {
  let result = initial
  for (let index = values.length - 1; index >= 0; index -= 1) {
    result = combine(values[index] as A, result, index)
  }
  return result
}

/**
 * Iterates until a predicate holds. A finite maximum is required so callers
 * receive `None` instead of accidentally constructing an unbounded loop.
 */
export const iterateUntil = <A>(
  initial: A,
  predicate: (value: A) => boolean,
  step: (value: A) => A,
  maximumSteps: number,
): Option<A> => {
  if (!Number.isSafeInteger(maximumSteps) || maximumSteps < 0) return none
  let current = initial
  for (let count = 0; count <= maximumSteps; count += 1) {
    if (predicate(current)) return some(current)
    if (count < maximumSteps) current = step(current)
  }
  return none
}
