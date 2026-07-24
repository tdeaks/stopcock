export type State<StateValue, A> = (state: StateValue) => readonly [A, StateValue]

export const state = <StateValue, A>(
  run: State<StateValue, A>,
): State<StateValue, A> => run

export const of =
  <A>(value: A) =>
  <StateValue>(initial: StateValue): readonly [A, StateValue] =>
    [value, initial]

export const get = <StateValue>(): State<StateValue, StateValue> => (initial) => [
  initial,
  initial,
]

export const gets = <StateValue, A>(
  project: (state: StateValue) => A,
): State<StateValue, A> => (initial) => [project(initial), initial]

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

export const map =
  <A, B>(transform: (value: A) => B) =>
  <StateValue>(self: State<StateValue, A>): State<StateValue, B> =>
  (initial) => {
    const [value, next] = self(initial)
    return [transform(value), next]
  }

export const flatMap =
  <StateValue, A, B>(transform: (value: A) => State<StateValue, B>) =>
  (self: State<StateValue, A>): State<StateValue, B> =>
  (initial) => {
    const [value, next] = self(initial)
    return transform(value)(next)
  }

export const flatten = <StateValue, A>(
  self: State<StateValue, State<StateValue, A>>,
): State<StateValue, A> =>
  (initial) => {
    const [nextState, afterFirst] = self(initial)
    return nextState(afterFirst)
  }

export const zipWith =
  <StateValue, A, B, C>(
    that: State<StateValue, B>,
    combine: (self: A, that: B) => C,
  ) =>
  (self: State<StateValue, A>): State<StateValue, C> =>
  (initial) => {
    const [left, afterLeft] = self(initial)
    const [right, afterRight] = that(afterLeft)
    return [combine(left, right), afterRight]
  }

export const zip =
  <StateValue, B>(that: State<StateValue, B>) =>
  <A>(self: State<StateValue, A>): State<StateValue, readonly [A, B]> =>
    zipWith(that, (left: A, right: B) => [left, right] as const)(self)

export const ap =
  <StateValue, A>(value: State<StateValue, A>) =>
  <B>(
    self: State<StateValue, (value: A) => B>,
  ): State<StateValue, B> =>
  (initial) => {
    const [transform, afterTransform] = self(initial)
    const [item, afterValue] = value(afterTransform)
    return [transform(item), afterValue]
  }

export const tap =
  <StateValue, A, B>(effect: (value: A) => State<StateValue, B>) =>
  (self: State<StateValue, A>): State<StateValue, A> =>
  (initial) => {
    const [value, afterSelf] = self(initial)
    // Bind the ignored effect value rather than using an elision. The previous
    // map-based implementation performed IteratorValue on both tuple entries,
    // which is observable for custom tuple iterators.
    const [effectValue, afterEffect] = effect(value)(afterSelf)
    void effectValue
    return [value, afterEffect]
  }

export const run =
  <StateValue>(initial: StateValue) =>
  <A>(self: State<StateValue, A>): readonly [A, StateValue] =>
    self(initial)

export const evaluate =
  <StateValue>(initial: StateValue) =>
  <A>(self: State<StateValue, A>): A =>
    self(initial)[0]

export const execute =
  <StateValue>(initial: StateValue) =>
  <A>(self: State<StateValue, A>): StateValue =>
    self(initial)[1]

/** Traverses left-to-right with dense array semantics. */
export const traverseReadonlyArray =
  <StateValue, A, B>(
    transform: (value: A, index: number) => State<StateValue, B>,
  ) =>
  (values: readonly A[]): State<StateValue, readonly B[]> =>
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

export const sequenceReadonlyArray = <StateValue, A>(
  values: readonly State<StateValue, A>[],
): State<StateValue, readonly A[]> =>
  traverseReadonlyArray((value: State<StateValue, A>) => value)(values)
