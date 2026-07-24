import { none, type Option } from './option'

export const ReducedTypeId: unique symbol = Symbol.for('@stopcock/fp/Reduced')

export interface Reduced<A> {
  readonly [ReducedTypeId]: true
  readonly value: A
}

export type Step<A> = A | Reduced<A>

export interface Reducer<Input, State, Output = State> {
  readonly init: () => State
  readonly step: (state: State, input: Input) => Step<State>
  readonly complete: (state: State) => Output
  readonly isDone?: () => boolean
}

/**
 * A state-independent transformation from inputs `A` to downstream inputs
 * `B`. A transformed reducer is single-use; call the transducer again for a
 * fresh reduction.
 */
export type Transducer<A, B> = <State, Output>(
  reducer: Reducer<B, State, Output>,
) => Reducer<A, State, Output>

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

type BuiltinStep =
  | { readonly kind: 'map'; readonly fn: (value: unknown) => unknown }
  | { readonly kind: 'filter'; readonly fn: (value: unknown) => boolean }
  | { readonly kind: 'take'; readonly count: number }

const builtinPlans = new WeakMap<object, readonly BuiltinStep[]>()
const arrayReducers = new WeakMap<
  object,
  readonly [init: unknown, step: unknown, complete: unknown, isDone: unknown]
>()

const registerPlan = <A, B>(
  transducer: Transducer<A, B>,
  steps: readonly BuiltinStep[],
): Transducer<A, B> => {
  builtinPlans.set(transducer, steps)
  return transducer
}

const isBuiltinArrayReducer = <Input, State, Output>(
  reducer: Reducer<Input, State, Output>,
): boolean => {
  const methods = arrayReducers.get(reducer)
  return (
    methods !== undefined &&
    reducer.init === methods[0] &&
    reducer.step === methods[1] &&
    reducer.complete === methods[2] &&
    reducer.isDone === methods[3]
  )
}

export const reduced = <A>(value: A): Reduced<A> => ({
  [ReducedTypeId]: true,
  value,
})

export const isReduced = <A>(value: Step<A>): value is Reduced<A> =>
  typeof value === 'object' && value !== null && ReducedTypeId in value

export const unreduced = <A>(value: Step<A>): A => (isReduced(value) ? value.value : value)

interface ReducerBuilder<Input, State, Output> {
  readonly init: () => State
  readonly step: (state: State, input: Input) => Step<State>
  readonly complete: (state: State) => Output
  isDone?: () => boolean
}

const withForwardedDone = <Input, State, Output>(
  source: { readonly isDone?: () => boolean },
  target: ReducerBuilder<Input, State, Output>,
): Reducer<Input, State, Output> => {
  const isDone = source.isDone
  if (isDone !== undefined) target.isDone = isDone
  return target
}

export const identity = <A>(): Transducer<A, A> =>
  registerPlan<A, A>((reducer) => reducer, Object.freeze([]))

export const map = <A, B>(f: (value: A) => B): Transducer<A, B> =>
  registerPlan<A, B>(
    (reducer) =>
      withForwardedDone(reducer, {
        init: reducer.init,
        step: (state, value) => reducer.step(state, f(value)),
        complete: reducer.complete,
      }),
    Object.freeze([{ kind: 'map', fn: f as (value: unknown) => unknown }]),
  )

export const filter = <A>(predicate: (value: A) => boolean): Transducer<A, A> =>
  registerPlan<A, A>(
    (reducer) =>
      withForwardedDone(reducer, {
        init: reducer.init,
        step: (state, value) => (predicate(value) ? reducer.step(state, value) : state),
        complete: reducer.complete,
      }),
    Object.freeze([{ kind: 'filter', fn: predicate as (value: unknown) => boolean }]),
  )

export const filterMap =
  <A, B>(f: (value: A) => Option<B>): Transducer<A, B> =>
  (reducer) =>
    withForwardedDone(reducer, {
      init: reducer.init,
      step: (state, value) => {
        const result = f(value)
        return result._tag === 1 ? reducer.step(state, result.value) : state
      },
      complete: reducer.complete,
    })

export const tap =
  <A>(effect: (value: A) => void): Transducer<A, A> =>
  (reducer) =>
    withForwardedDone(reducer, {
      init: reducer.init,
      step: (state, value) => {
        effect(value)
        return reducer.step(state, value)
      },
      complete: reducer.complete,
    })

export const flatMap =
  <A, B>(f: (value: A) => Iterable<B>): Transducer<A, B> =>
  (reducer) =>
    withForwardedDone(reducer, {
      init: reducer.init,
      step: (state, value) => {
        let current = state
        for (const inner of f(value)) {
          const next = reducer.step(current, inner)
          if (isReduced(next)) return next
          current = next
          if (reducer.isDone?.()) return reduced(current)
        }
        return current
      },
      complete: reducer.complete,
    })

export const flatten = <A>(): Transducer<Iterable<A>, A> => flatMap((value: Iterable<A>) => value)

export const take = <A>(count: number): Transducer<A, A> =>
  registerPlan<A, A>(
    (reducer) => {
      let remaining = Number.isNaN(count) || count <= 0 ? 0 : Math.floor(count)
      return {
        init: reducer.init,
        step: (state, value) => {
          if (remaining <= 0) return reduced(state)
          remaining--
          const result = reducer.step(state, value)
          return remaining === 0 && !isReduced(result) ? reduced(result) : result
        },
        complete: reducer.complete,
        isDone: () => remaining <= 0 || reducer.isDone?.() === true,
      }
    },
    Object.freeze([{ kind: 'take', count }]),
  )

export const drop =
  <A>(count: number): Transducer<A, A> =>
  (reducer) => {
    let remaining = Number.isNaN(count) || count <= 0 ? 0 : Math.floor(count)
    return withForwardedDone(reducer, {
      init: reducer.init,
      step: (state, value) => {
        if (remaining > 0) {
          remaining--
          return state
        }
        return reducer.step(state, value)
      },
      complete: reducer.complete,
    })
  }

export const takeWhile =
  <A>(predicate: (value: A) => boolean): Transducer<A, A> =>
  (reducer) => {
    let taking = true
    return {
      init: reducer.init,
      step: (state, value) => {
        if (!taking || !predicate(value)) {
          taking = false
          return reduced(state)
        }
        return reducer.step(state, value)
      },
      complete: reducer.complete,
      isDone: () => !taking || reducer.isDone?.() === true,
    }
  }

export const dropWhile =
  <A>(predicate: (value: A) => boolean): Transducer<A, A> =>
  (reducer) => {
    let dropping = true
    return withForwardedDone(reducer, {
      init: reducer.init,
      step: (state, value) => {
        if (dropping && predicate(value)) return state
        dropping = false
        return reducer.step(state, value)
      },
      complete: reducer.complete,
    })
  }

export const distinctBy =
  <A, K>(keyOf: (value: A) => K): Transducer<A, A> =>
  (reducer) => {
    const seen = new Set<K>()
    return withForwardedDone(reducer, {
      init: reducer.init,
      step: (state, value) => {
        const key = keyOf(value)
        if (seen.has(key)) return state
        seen.add(key)
        return reducer.step(state, value)
      },
      complete: reducer.complete,
    })
  }

export const distinct = <A>(): Transducer<A, A> => distinctBy((value: A) => value)

export function compose<A, B, C>(
  first: Transducer<A, B>,
  second: Transducer<B, C>,
): Transducer<A, C>
export function compose<A, B, C, D>(
  first: Transducer<A, B>,
  second: Transducer<B, C>,
  third: Transducer<C, D>,
): Transducer<A, D>
export function compose(
  ...transducers: readonly Transducer<unknown, unknown>[]
): Transducer<unknown, unknown> {
  const composed: Transducer<unknown, unknown> = (reducer) => {
    let current = reducer
    for (let index = transducers.length - 1; index >= 0; index--) {
      current = transducers[index]!(current)
    }
    return current
  }
  const combined: BuiltinStep[] = []
  for (const transducer of transducers) {
    const plan = builtinPlans.get(transducer)
    if (!plan) return composed
    combined.push(...plan)
  }
  return registerPlan(composed, Object.freeze(combined))
}

interface FastTransduceResult<Output> {
  readonly handled: boolean
  readonly output?: Output
}

const nativeArrayIterator = Array.prototype[Symbol.iterator]
const nativeArrayIteratorPrototype = Object.getPrototypeOf(nativeArrayIterator.call([])) as {
  readonly next: unknown
  readonly return?: unknown
}
const nativeArrayIteratorNext = nativeArrayIteratorPrototype.next

const transduceMapFilterTake = <A, State, Output>(
  source: Iterable<A>,
  plan: readonly BuiltinStep[],
  reducer: Reducer<unknown, State, Output>,
): FastTransduceResult<Output> => {
  if (
    !isBuiltinArrayReducer(reducer) ||
    plan.length !== 3 ||
    plan[0]?.kind !== 'map' ||
    plan[1]?.kind !== 'filter' ||
    plan[2]?.kind !== 'take'
  ) {
    return { handled: false }
  }

  const mapFn = plan[0].fn
  const filterFn = plan[1].fn
  const count = plan[2].count
  const limit = Number.isNaN(count) || count <= 0 ? 0 : Math.floor(count)
  const target = reducer.init() as unknown as unknown[]
  let emitted = 0
  const iteratorMethod = source[Symbol.iterator] as unknown
  const directArray =
    Array.isArray(source) &&
    iteratorMethod === nativeArrayIterator &&
    nativeArrayIteratorPrototype.next === nativeArrayIteratorNext &&
    !('return' in nativeArrayIteratorPrototype)

  if (directArray) {
    const values = source as unknown as readonly unknown[]
    for (let index = 0; index < values.length && emitted < limit; index++) {
      const value = mapFn(values[index])
      if (filterFn(value)) {
        target.push(value)
        emitted++
      }
    }
    return { handled: true, output: reducer.complete(target as unknown as State) }
  }

  const iterator = Reflect.apply(iteratorMethod as Function, source, []) as Iterator<A>
  let sourceDone = false
  try {
    while (emitted < limit) {
      const item = iterator.next()
      if (item.done) {
        sourceDone = true
        break
      }
      const value = mapFn(item.value)
      if (filterFn(value)) {
        target.push(value)
        emitted++
      }
    }
  } finally {
    if (!sourceDone) iterator.return?.()
  }
  return { handled: true, output: reducer.complete(target as unknown as State) }
}

export const transduce = <A, B, State, Output>(
  source: Iterable<A>,
  transducer: Transducer<A, B>,
  reducer: Reducer<B, State, Output>,
): Output => {
  const plan = builtinPlans.get(transducer)
  if (plan) {
    const fast = transduceMapFilterTake(
      source,
      plan,
      reducer as unknown as Reducer<unknown, State, Output>,
    )
    if (fast.handled) return fast.output as Output
  }

  const transformed = transducer(reducer)
  const iterator = source[Symbol.iterator]()
  let state = transformed.init()
  let sourceDone = false

  try {
    while (!transformed.isDone?.()) {
      const item = iterator.next()
      if (item.done) {
        sourceDone = true
        break
      }

      const result = transformed.step(state, item.value)
      state = unreduced(result)
      if (isReduced(result)) break
    }
  } finally {
    if (!sourceDone) iterator.return?.()
  }

  return transformed.complete(state)
}

export const eduction = <A, B>(source: Iterable<A>, transducer: Transducer<A, B>): Iterable<B> => ({
  *[Symbol.iterator](): Generator<B, void, undefined> {
    const transformed = transducer(arrayReducer<B>())
    const iterator = source[Symbol.iterator]()
    let state = transformed.init()
    let sourceDone = false

    try {
      while (!transformed.isDone?.()) {
        const item = iterator.next()
        if (item.done) {
          sourceDone = true
          break
        }

        const result = transformed.step(state, item.value)
        state = unreduced(result)
        for (const value of state) yield value
        state.length = 0
        if (isReduced(result)) break
      }

      const output = transformed.complete(state)
      for (const value of output) yield value
    } finally {
      if (!sourceDone) iterator.return?.()
    }
  },
})

export const arrayReducer = <A>(): Reducer<A, A[]> => {
  const reducer: Reducer<A, A[]> = {
    init: () => [],
    step: (state, value) => {
      state.push(value)
      return state
    },
    complete: (state) => state,
  }
  arrayReducers.set(
    reducer,
    Object.freeze([reducer.init, reducer.step, reducer.complete, reducer.isDone]),
  )
  return reducer
}

const arrayReducerIntoImpl = <Target extends unknown[]>(
  target: Target,
): Reducer<Target[number], Target> => {
  const reducer: Reducer<Target[number], Target> = {
    init: () => target,
    step: (state, value) => {
      state.push(value)
      return state
    },
    complete: (state) => state,
  }
  arrayReducers.set(
    reducer,
    Object.freeze([reducer.init, reducer.step, reducer.complete, reducer.isDone]),
  )
  return reducer
}

interface ArrayReducerIntoOperation {
  <const Target extends unknown[]>(
    target: Target,
    ..._capacity: [] & ArrayTargetCapacity<Target[number], Target>
  ): Reducer<Target[number], Target>
}

export const arrayReducerInto = arrayReducerIntoImpl as unknown as ArrayReducerIntoOperation

export const intoArray = <A, B>(source: Iterable<A>, transducer: Transducer<A, B>): B[] =>
  transduce(source, transducer, arrayReducer<B>())

const intoArrayIntoImpl = <A, B, Target extends unknown[]>(
  source: Iterable<A>,
  transducer: Transducer<A, B>,
  target: Target,
): Target =>
  transduce(source, transducer, arrayReducerIntoImpl(target as unknown as B[])) as unknown as Target

interface IntoArrayIntoOperation {
  <A, B, const Target extends unknown[]>(
    source: Iterable<A>,
    transducer: Transducer<A, B>,
    target: Target,
    ..._capacity: [] & ArrayTargetCapacity<B, Target>
  ): Target
}

export const intoArrayInto = intoArrayIntoImpl as unknown as IntoArrayIntoOperation

export const firstReducer = <A>(): Reducer<A, Option<A>> => ({
  init: () => none,
  step: (_state, value) => reduced({ _tag: 1, value }),
  complete: (state) => state,
  isDone: () => false,
})
