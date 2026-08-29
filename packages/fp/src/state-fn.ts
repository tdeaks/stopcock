export type State<StateValue, A> = (state: StateValue) => readonly [A, StateValue]

export const state = <StateValue, A>(run: State<StateValue, A>): State<StateValue, A> => run

export const of =
  <A>(value: A) =>
  <StateValue>(initial: StateValue): readonly [A, StateValue] =>
    [value, initial]

export const get =
  <StateValue>(): State<StateValue, StateValue> =>
  (initial) => [
  initial,
  initial,
]

export const gets =
  <StateValue, A>(project: (state: StateValue) => A): State<StateValue, A> =>
  (initial) => [project(initial), initial]

export const put =
  <StateValue>(next: StateValue): State<StateValue, void> =>
  () =>
    [undefined, next]

export const modify =
  <StateValue>(transform: (state: StateValue) => StateValue): State<StateValue, void> =>
  (initial) =>
    [undefined, transform(initial)]

export const modifyAndGet =
  <StateValue>(transform: (state: StateValue) => StateValue): State<StateValue, StateValue> =>
  (initial) => {
    const next = transform(initial)
    return [next, next]
  }

export const getAndModify =
  <StateValue>(transform: (state: StateValue) => StateValue): State<StateValue, StateValue> =>
  (initial) =>
    [initial, transform(initial)]

export const map: {
  <A, B, StateValue>(self: State<StateValue, A>, transform: (value: A) => B): State<StateValue, B>
  <A, B>(
    transform: (value: A) => B,
  ): <StateValue>(self: State<StateValue, A>) => State<StateValue, B>
} = function map<A, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return map(__arg1)(__arg0)
  const transform = __arg0
  return <StateValue>(self: State<StateValue, A>): State<StateValue, B> =>
  (initial) => {
    const [value, next] = self(initial)
    return [transform(value), next]
  }
} as any

export const flatMap: {
  <StateValue, A, B>(
    self: State<StateValue, A>,
    transform: (value: A) => State<StateValue, B>,
  ): State<StateValue, B>
  <StateValue, A, B>(
    transform: (value: A) => State<StateValue, B>,
  ): (self: State<StateValue, A>) => State<StateValue, B>
} = function flatMap<StateValue, A, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return flatMap(__arg1)(__arg0)
  const transform = __arg0
  return (self: State<StateValue, A>): State<StateValue, B> =>
  (initial) => {
    const [value, next] = self(initial)
    return transform(value)(next)
  }
} as any

export const flatten =
  <StateValue, A>(self: State<StateValue, State<StateValue, A>>): State<StateValue, A> =>
  (initial) => {
    const [nextState, afterFirst] = self(initial)
    return nextState(afterFirst)
  }

export const zipWith: {
  <StateValue, A, B, C>(
    self: State<StateValue, A>,
    that: State<StateValue, B>,
    combine: (self: A, that: B) => C,
  ): State<StateValue, C>
  <StateValue, A, B, C>(
    that: State<StateValue, B>,
    combine: (self: A, that: B) => C,
  ): (self: State<StateValue, A>) => State<StateValue, C>
} = function zipWith<StateValue, A, B, C>(__arg0: any, __arg1?: any, __arg2?: any): any {
  if (arguments.length >= 3) return zipWith(__arg1, __arg2)(__arg0)
  const that: State<StateValue, B> = __arg0
  const combine = __arg1
  return (self: State<StateValue, A>): State<StateValue, C> =>
  (initial) => {
    const [left, afterLeft] = self(initial)
    const [right, afterRight] = that(afterLeft)
    return [combine(left, right), afterRight]
  }
} as any

export const zip: {
  <StateValue, B, A>(
    self: State<StateValue, A>,
    that: State<StateValue, B>,
  ): State<StateValue, readonly [A, B]>
  <StateValue, B>(
    that: State<StateValue, B>,
  ): <A>(self: State<StateValue, A>) => State<StateValue, readonly [A, B]>
} = function zip<StateValue, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return zip(__arg1)(__arg0)
  const that: State<StateValue, B> = __arg0
  return <A>(self: State<StateValue, A>): State<StateValue, readonly [A, B]> =>
    zipWith(that, (left: A, right: B) => [left, right] as const)(self)
} as any

export const ap: {
  <StateValue, A, B>(
    self: State<StateValue, (value: A) => B>,
    value: State<StateValue, A>,
  ): State<StateValue, B>
  <StateValue, A>(
    value: State<StateValue, A>,
  ): <B>(self: State<StateValue, (value: A) => B>) => State<StateValue, B>
} = function ap<StateValue, A>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return ap(__arg1)(__arg0)
  const value = __arg0
  return <B>(
    self: State<StateValue, (value: A) => B>,
  ): State<StateValue, B> =>
  (initial) => {
    const [transform, afterTransform] = self(initial)
    const [item, afterValue] = value(afterTransform)
    return [transform(item), afterValue]
  }
} as any

export const tap: {
  <StateValue, A, B>(
    self: State<StateValue, A>,
    effect: (value: A) => State<StateValue, B>,
  ): State<StateValue, A>
  <StateValue, A, B>(
    effect: (value: A) => State<StateValue, B>,
  ): (self: State<StateValue, A>) => State<StateValue, A>
} = function tap<StateValue, A, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return tap(__arg1)(__arg0)
  const effect = __arg0
  return (self: State<StateValue, A>): State<StateValue, A> =>
  (initial) => {
    const [value, afterSelf] = self(initial)
    // Bind the ignored effect value rather than using an elision. The previous
    // map-based implementation performed IteratorValue on both tuple entries,
    // which is observable for custom tuple iterators.
    const [effectValue, afterEffect] = effect(value)(afterSelf)
    void effectValue
    return [value, afterEffect]
  }
} as any

export const run: {
  <StateValue, A>(self: State<StateValue, A>, initial: StateValue): readonly [A, StateValue]
  <StateValue>(initial: StateValue): <A>(self: State<StateValue, A>) => readonly [A, StateValue]
} = function run<StateValue>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return run(__arg1)(__arg0)
  const initial = __arg0
  return <A>(self: State<StateValue, A>): readonly [A, StateValue] =>
    self(initial)
} as any

export const evaluate: {
  <StateValue, A>(self: State<StateValue, A>, initial: StateValue): A
  <StateValue>(initial: StateValue): <A>(self: State<StateValue, A>) => A
} = function evaluate<StateValue>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return evaluate(__arg1)(__arg0)
  const initial = __arg0
  return <A>(self: State<StateValue, A>): A =>
    self(initial)[0]
} as any

export const execute: {
  <StateValue, A>(self: State<StateValue, A>, initial: StateValue): StateValue
  <StateValue>(initial: StateValue): <A>(self: State<StateValue, A>) => StateValue
} = function execute<StateValue>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return execute(__arg1)(__arg0)
  const initial = __arg0
  return <A>(self: State<StateValue, A>): StateValue =>
    self(initial)[1]
} as any

/** Traverses left-to-right with dense array semantics. */
export const traverseReadonlyArray: {
  <StateValue, A, B>(
    values: readonly A[],
    transform: (value: A, index: number) => State<StateValue, B>,
  ): State<StateValue, readonly B[]>
  <StateValue, A, B>(
    transform: (value: A, index: number) => State<StateValue, B>,
  ): (values: readonly A[]) => State<StateValue, readonly B[]>
} = function traverseReadonlyArray<StateValue, A, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return traverseReadonlyArray(__arg1)(__arg0)
  const transform = __arg0
  return (values: readonly A[]): State<StateValue, readonly B[]> =>
  (initial) => {
    const result = new Array<B>(values.length)
    let current = initial
    for (let index = 0; index < values.length; index += 1) {
      const [value, next] = transform(values[index] as A, index)(current)
      result[index] = value
      current = next
    }
    return [result, current]
  }
} as any

export const sequenceReadonlyArray = <StateValue, A>(
  values: readonly State<StateValue, A>[],
): State<StateValue, readonly A[]> =>
  traverseReadonlyArray((value: State<StateValue, A>) => value)(values)
