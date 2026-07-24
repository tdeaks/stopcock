import { none, some, type Option } from './option'
import { intoArrayInto, reduced, transduce, type Reducer, type Transducer } from './transducer'

const intoKnownArrayTarget = intoArrayInto as unknown as <A, B>(
  source: Iterable<A>,
  transducer: Transducer<A, B>,
  target: B[],
) => B[]

export interface Collector<Input, State, Output = State> {
  readonly init: () => State
  readonly add: (state: State, input: Input) => State
  readonly finish: (state: State) => Output
  readonly isDone?: (state: State) => boolean
}

interface CollectorBuilder<Input, State, Output> {
  readonly init: () => State
  readonly add: (state: State, input: Input) => State
  readonly finish: (state: State) => Output
  isDone?: (state: State) => boolean
}

const withForwardedCollectorDone = <Input, State, Output>(
  source: { readonly isDone?: (state: State) => boolean },
  target: CollectorBuilder<Input, State, Output>,
): Collector<Input, State, Output> => {
  const isDone = source.isDone
  if (isDone !== undefined) target.isDone = isDone
  return target
}

type IsUnion<Value, Whole = Value> = Value extends Whole
  ? [Whole] extends [Value]
    ? false
    : true
  : never

type EveryTargetIsConcrete<Target> = true extends IsUnion<Target> ? never : unknown

type FixedLengthArrayTargets<Target extends unknown[]> = Target extends unknown
  ? number extends Target['length']
    ? never
    : Target
  : never

type EveryArrayTargetHasDynamicLength<Target extends unknown[]> = [
  FixedLengthArrayTargets<Target>,
] extends [never]
  ? unknown
  : never

type ArrayFactoryCapacity<Target extends unknown[]> = EveryTargetIsConcrete<Target> &
  EveryArrayTargetHasDynamicLength<Target>

type SetTargetValue<Target extends Set<unknown>> = Target extends Set<infer Value> ? Value : never

type MapTargetKey<Target extends Map<unknown, unknown>> =
  Target extends Map<infer Key, infer _Value> ? Key : never

type MapTargetValue<Target extends Map<unknown, unknown>> =
  Target extends Map<infer _Key, infer Value> ? Value : never

const arrayCollectors = new WeakMap<
  object,
  readonly [init: unknown, add: unknown, finish: unknown, isDone: unknown]
>()
const nativeArrayIterator = Array.prototype[Symbol.iterator]
const nativeArrayIteratorPrototype = Object.getPrototypeOf(nativeArrayIterator.call([])) as {
  readonly next: unknown
  readonly return?: unknown
}
const nativeArrayIteratorNext = nativeArrayIteratorPrototype.next

const isBuiltinArrayCollector = <Input, State, Output>(
  collector: Collector<Input, State, Output>,
): boolean => {
  const methods = arrayCollectors.get(collector)
  return (
    methods !== undefined &&
    collector.init === methods[0] &&
    collector.add === methods[1] &&
    collector.finish === methods[2] &&
    collector.isDone === methods[3]
  )
}

export const collect = <Input, State, Output>(
  source: Iterable<Input>,
  collector: Collector<Input, State, Output>,
): Output => {
  if (isBuiltinArrayCollector(collector)) {
    const target = collector.init() as unknown as Input[]
    const iteratorMethod = source[Symbol.iterator] as unknown
    if (
      Array.isArray(source) &&
      iteratorMethod === nativeArrayIterator &&
      nativeArrayIteratorPrototype.next === nativeArrayIteratorNext &&
      !('return' in nativeArrayIteratorPrototype)
    ) {
      const values = source as readonly Input[]
      for (let index = 0; index < values.length; index++) target.push(values[index] as Input)
      return collector.finish(target as unknown as State)
    }

    const iterator = Reflect.apply(iteratorMethod as Function, source, []) as Iterator<Input>
    let sourceDone = false
    try {
      while (true) {
        const item = iterator.next()
        if (item.done) {
          sourceDone = true
          break
        }
        target.push(item.value)
      }
    } finally {
      if (!sourceDone) iterator.return?.()
    }
    return collector.finish(target as unknown as State)
  }

  let state = collector.init()
  for (const input of source) {
    state = collector.add(state, input)
    if (collector.isDone?.(state)) break
  }
  return collector.finish(state)
}

export const toReducer = <Input, State, Output>(
  collector: Collector<Input, State, Output>,
): Reducer<Input, State, Output> => ({
  init: collector.init,
  step: (state, input) => {
    const next = collector.add(state, input)
    return collector.isDone?.(next) ? reduced(next) : next
  },
  complete: collector.finish,
})

export const collectTransduced = <A, B, State, Output>(
  source: Iterable<A>,
  transducer: Transducer<A, B>,
  collector: Collector<B, State, Output>,
): Output => {
  if (isBuiltinArrayCollector(collector)) {
    const target = collector.init() as unknown as B[]
    return collector.finish(intoKnownArrayTarget(source, transducer, target) as unknown as State)
  }
  return transduce(source, transducer, toReducer(collector))
}

export const contramap = <A, B, State, Output>(
  collector: Collector<B, State, Output>,
  f: (value: A) => B,
): Collector<A, State, Output> =>
  withForwardedCollectorDone(collector, {
    init: collector.init,
    add: (state, value) => collector.add(state, f(value)),
    finish: collector.finish,
  })

export const mapResult = <Input, State, A, B>(
  collector: Collector<Input, State, A>,
  f: (value: A) => B,
): Collector<Input, State, B> =>
  withForwardedCollectorDone(collector, {
    init: collector.init,
    add: collector.add,
    finish: (state) => f(collector.finish(state)),
  })

export const array = <A>(): Collector<A, A[]> => {
  const collector: Collector<A, A[]> = {
    init: () => [],
    add: (state, value) => {
      state.push(value)
      return state
    },
    finish: (state) => state,
  }
  arrayCollectors.set(
    collector,
    Object.freeze([collector.init, collector.add, collector.finish, collector.isDone]),
  )
  return collector
}

const arrayIntoImpl = <Target extends unknown[]>(
  target: Target,
): Collector<Target[number], Target> => {
  const collector: Collector<Target[number], Target> = {
    init: () => target,
    add: (state, value) => {
      state.push(value)
      return state
    },
    finish: (state) => state,
  }
  arrayCollectors.set(
    collector,
    Object.freeze([collector.init, collector.add, collector.finish, collector.isDone]),
  )
  return collector
}

interface ArrayIntoOperation {
  <const Target extends unknown[]>(
    target: Target,
    ..._capacity: [] & ArrayFactoryCapacity<Target>
  ): Collector<Target[number], Target>
}

export const arrayInto = arrayIntoImpl as unknown as ArrayIntoOperation

export const set = <A>(): Collector<A, Set<A>> => ({
  init: () => new globalThis.Set<A>(),
  add: (state, value) => {
    state.add(value)
    return state
  },
  finish: (state) => state,
})

const setIntoImpl = <Target extends Set<unknown>>(
  target: Target,
): Collector<SetTargetValue<Target>, Target> => ({
  init: () => target,
  add: (state, value) => {
    state.add(value)
    return state
  },
  finish: (state) => state,
})

interface SetIntoOperation {
  <const Target extends Set<unknown>>(
    target: Target,
    ..._capacity: [] & EveryTargetIsConcrete<Target>
  ): Collector<SetTargetValue<Target>, Target>
}

export const setInto = setIntoImpl as unknown as SetIntoOperation

export const map = <K, V>(): Collector<readonly [K, V], Map<K, V>> => ({
  init: () => new globalThis.Map<K, V>(),
  add: (state, [key, value]) => {
    state.set(key, value)
    return state
  },
  finish: (state) => state,
})

const mapIntoImpl = <Target extends Map<unknown, unknown>>(
  target: Target,
): Collector<readonly [MapTargetKey<Target>, MapTargetValue<Target>], Target> => ({
  init: () => target,
  add: (state, [key, value]) => {
    state.set(key, value)
    return state
  },
  finish: (state) => state,
})

interface MapIntoOperation {
  <const Target extends Map<unknown, unknown>>(
    target: Target,
    ..._capacity: [] & EveryTargetIsConcrete<Target>
  ): Collector<readonly [MapTargetKey<Target>, MapTargetValue<Target>], Target>
}

export const mapInto = mapIntoImpl as unknown as MapIntoOperation

export type MutableRecord<A> = {
  [key: string]: A
  [key: symbol]: A
}

const nullRecord = <A>(): MutableRecord<A> => Object.create(null) as MutableRecord<A>

type RecordTargetValue<Target extends MutableRecord<unknown>> =
  Target extends MutableRecord<infer Value> ? Value : never

type EveryRecordTargetHasIndexSignatures<Target extends MutableRecord<unknown>> =
  string extends keyof Target ? (symbol extends keyof Target ? unknown : never) : never

type EveryRecordTargetIsUnrefined<Target extends MutableRecord<unknown>> = [
  MutableRecord<RecordTargetValue<Target>>,
] extends [Target]
  ? unknown
  : never

type RecordFactoryCapacity<Target extends MutableRecord<unknown>> = EveryTargetIsConcrete<Target> &
  EveryRecordTargetHasIndexSignatures<Target> &
  EveryRecordTargetIsUnrefined<Target>

const setRecordEntry = (target: MutableRecord<unknown>, key: PropertyKey, value: unknown): void => {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      configurable: true,
      enumerable: true,
      writable: true,
    })
    return
  }
  target[key] = value
}

export const record = <V>(): Collector<readonly [PropertyKey, V], MutableRecord<V>> => ({
  init: nullRecord,
  add: (state, [key, value]) => {
    setRecordEntry(state, key, value)
    return state
  },
  finish: (state) => state,
})

const recordIntoImpl = <Target extends MutableRecord<unknown>>(
  target: Target,
): Collector<readonly [PropertyKey, RecordTargetValue<Target>], Target> => ({
  init: () => target,
  add: (state, [key, value]) => {
    setRecordEntry(state, key, value)
    return state
  },
  finish: (state) => state,
})

interface RecordIntoOperation {
  <const Target extends MutableRecord<unknown>>(
    target: Target,
    ..._capacity: [] & RecordFactoryCapacity<Target>
  ): Collector<readonly [PropertyKey, RecordTargetValue<Target>], Target>
}

export const recordInto = recordIntoImpl as unknown as RecordIntoOperation

export const count = <A>(): Collector<A, number> => ({
  init: () => 0,
  add: (state) => state + 1,
  finish: (state) => state,
})

export const sum: Collector<number, number> = {
  init: () => 0,
  add: (state, value) => state + value,
  finish: (state) => state,
}

export const product: Collector<number, number> = {
  init: () => 1,
  add: (state, value) => state * value,
  finish: (state) => state,
}

export const join = (separator = ''): Collector<string, string[], string> => ({
  init: () => [],
  add: (state, value) => {
    state.push(value)
    return state
  },
  finish: (state) => state.join(separator),
})

export const first = <A>(): Collector<A, Option<A>> => ({
  init: () => none,
  add: (state, value) => (state._tag === 1 ? state : some(value)),
  finish: (state) => state,
  isDone: (state) => state._tag === 1,
})

export const last = <A>(): Collector<A, Option<A>> => ({
  init: () => none,
  add: (_state, value) => some(value),
  finish: (state) => state,
})

interface Best<A> {
  readonly value: A
  readonly score: number
}

const bestBy = <A>(
  score: (value: A) => number,
  better: (candidate: number, current: number) => boolean,
): Collector<A, Option<Best<A>>, Option<A>> => ({
  init: () => none,
  add: (state, value) => {
    const candidate = score(value)
    return state._tag === 0 || better(candidate, state.value.score)
      ? some({ value, score: candidate })
      : state
  },
  finish: (state) => (state._tag === 0 ? none : some(state.value.value)),
})

export const minBy = <A>(score: (value: A) => number): Collector<A, Option<Best<A>>, Option<A>> =>
  bestBy(score, (candidate, current) => candidate < current)

export const maxBy = <A>(score: (value: A) => number): Collector<A, Option<Best<A>>, Option<A>> =>
  bestBy(score, (candidate, current) => candidate > current)

export const groupBy = <A, K>(keyOf: (value: A) => K): Collector<A, Map<K, A[]>> => ({
  init: () => new globalThis.Map<K, A[]>(),
  add: (state, value) => {
    const key = keyOf(value)
    const group = state.get(key)
    if (group === undefined) state.set(key, [value])
    else group.push(value)
    return state
  },
  finish: (state) => state,
})

export const partition = <A>(
  predicate: (value: A) => boolean,
): Collector<A, readonly [accepted: A[], rejected: A[]]> => ({
  init: () => [[], []],
  add: (state, value) => {
    state[predicate(value) ? 0 : 1].push(value)
    return state
  },
  finish: (state) => state,
})
