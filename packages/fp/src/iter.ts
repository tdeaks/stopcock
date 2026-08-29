import { none, some as optionSome, type Option } from './option'

// Plan step opcodes. Purely internal tags for IterStep['op'] -- there is no
// shared registry for these the way array.ts ops have one, since nothing
// outside this module's own fast-plan machinery ever reads them.
const ITER_MAP = 0
const ITER_FILTER = 1
const ITER_FILTER_MAP = 2
const ITER_FLAT_MAP = 3
const ITER_TAKE = 4
const ITER_DROP = 5
const ITER_TAKE_WHILE = 6
const ITER_DROP_WHILE = 7
const ITER_SCAN = 8

/**
 * A lazy, re-iterable sequence. Whether a particular value is actually
 * re-iterable depends on the source supplied to {@link from}; constructors in
 * this module create a fresh iterator for every traversal.
 */
export interface Iter<A> extends Iterable<A> {}

type Predicate<A> = (value: A, index: number) => boolean
type Refinement<A, B extends A> = (value: A, index: number) => value is B

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

type IsUnion<Value, Whole = Value> = Value extends Whole
  ? [Whole] extends [Value]
    ? false
    : true
  : never

type EveryArrayTargetIsConcrete<Target extends unknown[]> =
  true extends IsUnion<Target> ? never : unknown

/**
 * Shape rules the target must satisfy. Whether the target *accepts* the source
 * element type is not checked here: that rule lives on the source parameter of
 * the returned function, where it is plain assignability and needs no
 * inference ordering.
 */
type ArrayTargetCapacity<Target extends unknown[]> = EveryArrayTargetHasDynamicLength<Target> &
  EveryArrayTargetIsConcrete<Target>

type IterUnary = (value: unknown, index: number) => unknown
type IterPredicate = (value: unknown, index: number) => boolean
type IterReducer = (state: unknown, value: unknown, index: number) => unknown

type IterStep =
  | { readonly kind: 'map'; readonly op: typeof ITER_MAP; readonly fn: IterUnary }
  | { readonly kind: 'filter'; readonly op: typeof ITER_FILTER; readonly fn: IterPredicate }
  | { readonly kind: 'filterMap'; readonly op: typeof ITER_FILTER_MAP; readonly fn: IterUnary }
  | { readonly kind: 'flatMap'; readonly op: typeof ITER_FLAT_MAP; readonly fn: IterUnary }
  | { readonly kind: 'take'; readonly op: typeof ITER_TAKE; readonly count: number }
  | { readonly kind: 'drop'; readonly op: typeof ITER_DROP; readonly count: number }
  | { readonly kind: 'takeWhile'; readonly op: typeof ITER_TAKE_WHILE; readonly fn: IterPredicate }
  | { readonly kind: 'dropWhile'; readonly op: typeof ITER_DROP_WHILE; readonly fn: IterPredicate }
  | {
      readonly kind: 'scan'
      readonly op: typeof ITER_SCAN
      readonly fn: IterReducer
      readonly initial: unknown
    }

interface IterPlan {
  readonly source: Iterable<unknown>
  readonly steps: readonly IterStep[]
}

const make = <A>(factory: () => Iterator<A>): Iter<A> => ({
  [Symbol.iterator]: factory,
})

type IterStepKind = IterStep['kind']
type IterStepFunction = IterUnary | IterPredicate | IterReducer

/**
 * One immutable node is both the public Iter wrapper and its private plan
 * metadata. Public iteration walks the immediate upstream node through shared
 * generator helpers, while fused terminals materialize the linked plan once.
 */
class PlannedIterNode<A> implements Iter<A>, IterPlan {
  #cachedSteps: readonly IterStep[] | undefined
  readonly #upstream: Iterable<unknown>
  readonly #source: Iterable<unknown>
  readonly #previous: PlannedIterNode<unknown> | undefined
  readonly #kind: IterStepKind | undefined
  readonly #fn: IterStepFunction | undefined
  readonly #count: number
  readonly #initial: unknown
  readonly #depth: number

  constructor(
    upstream: Iterable<unknown>,
    source: Iterable<unknown>,
    previous: PlannedIterNode<unknown> | undefined,
    kind: IterStepKind | undefined,
    fn: IterStepFunction | undefined,
    count: number,
    initial: unknown,
    depth: number,
  ) {
    this.#upstream = upstream
    this.#source = source
    this.#previous = previous
    this.#kind = kind
    this.#fn = fn
    this.#count = count
    this.#initial = initial
    this.#depth = depth
  }

  static planOf(source: unknown): PlannedIterNode<unknown> | undefined {
    if (
      ((typeof source === 'object' && source !== null) || typeof source === 'function') &&
      #source in source
    ) {
      return source as PlannedIterNode<unknown>
    }
    return undefined
  }

  get upstream(): Iterable<unknown> {
    return this.#upstream
  }

  get source(): Iterable<unknown> {
    return this.#source
  }

  get previous(): PlannedIterNode<unknown> | undefined {
    return this.#previous
  }

  get kind(): IterStepKind | undefined {
    return this.#kind
  }

  get fn(): IterStepFunction | undefined {
    return this.#fn
  }

  get count(): number {
    return this.#count
  }

  get initial(): unknown {
    return this.#initial
  }

  get depth(): number {
    return this.#depth
  }

  get steps(): readonly IterStep[] {
    const cached = this.#cachedSteps
    if (cached) return cached

    const steps = new Array<IterStep>(this.depth)
    let node: PlannedIterNode<unknown> | undefined = this as PlannedIterNode<unknown>
    for (let position = this.depth - 1; position >= 0; position--) {
      const current = node as PlannedIterNode<unknown>
      switch (current.kind) {
        case 'map':
          steps[position] = { kind: 'map', op: ITER_MAP, fn: current.fn as IterUnary }
          break
        case 'filter':
          steps[position] = {
            kind: 'filter',
            op: ITER_FILTER,
            fn: current.fn as IterPredicate,
          }
          break
        case 'filterMap':
          steps[position] = {
            kind: 'filterMap',
            op: ITER_FILTER_MAP,
            fn: current.fn as IterUnary,
          }
          break
        case 'flatMap':
          steps[position] = {
            kind: 'flatMap',
            op: ITER_FLAT_MAP,
            fn: current.fn as IterUnary,
          }
          break
        case 'takeWhile':
          steps[position] = {
            kind: 'takeWhile',
            op: ITER_TAKE_WHILE,
            fn: current.fn as IterPredicate,
          }
          break
        case 'dropWhile':
          steps[position] = {
            kind: 'dropWhile',
            op: ITER_DROP_WHILE,
            fn: current.fn as IterPredicate,
          }
          break
        case 'take':
          steps[position] = { kind: 'take', op: ITER_TAKE, count: current.count }
          break
        case 'drop':
          steps[position] = { kind: 'drop', op: ITER_DROP, count: current.count }
          break
        case 'scan':
          steps[position] = {
            kind: 'scan',
            op: ITER_SCAN,
            fn: current.fn as IterReducer,
            initial: current.initial,
          }
          break
        case undefined:
          throw new Error('Iter: malformed planned step')
      }
      node = current.previous
    }
    this.#cachedSteps = steps
    return steps
  }

  [Symbol.iterator](): Iterator<A> {
    return plannedIterator(this as PlannedIterNode<unknown>) as Iterator<A>
  }
}

const plannedRoot = <A>(source: Iterable<A>): Iter<A> =>
  new PlannedIterNode<A>(source, source, undefined, undefined, undefined, 0, undefined, 0)

const internalPlanOf = (source: Iterable<unknown>): PlannedIterNode<unknown> | undefined =>
  PlannedIterNode.planOf(source)

const appendStep = <A>(
  source: Iterable<unknown>,
  kind: IterStepKind,
  fn?: IterStepFunction,
  count = 0,
  initial?: unknown,
): Iter<A> => {
  const previous = internalPlanOf(source)
  return new PlannedIterNode<A>(
    source,
    previous?.source ?? source,
    previous,
    kind,
    fn,
    count,
    initial,
    (previous?.depth ?? 0) + 1,
  )
}

interface IterExecutionState {
  readonly indexes: number[]
  readonly counts: number[]
  readonly dropping: boolean[]
  readonly scans: unknown[]
}

type IterEmit = (value: unknown) => boolean

const makeExecutionState = (steps: readonly IterStep[]): IterExecutionState => {
  const length = steps.length
  const scans = new Array<unknown>(length)
  for (let index = 0; index < length; index++) {
    const step = steps[index]
    if (step.kind === 'scan') scans[index] = step.initial
  }
  return {
    indexes: new Array<number>(length).fill(0),
    counts: new Array<number>(length).fill(0),
    dropping: new Array<boolean>(length).fill(true),
    scans,
  }
}

const nativeArrayIterator = Array.prototype[Symbol.iterator]
const nativeArrayIteratorPrototype = Object.getPrototypeOf(nativeArrayIterator.call([])) as {
  next: unknown
  return?: unknown
}
const nativeArrayIteratorNext = nativeArrayIteratorPrototype.next

const PLAN_SOURCE_ARRAY = 0
const PLAN_SOURCE_ITERABLE = 1

/**
 * The internal source forms. `array` is only ever set when the value is a plain
 * Array whose iteration protocol is observably the native one, so the
 * hand-written fast plans and the public iterator cannot disagree.
 */
interface PlanSourceAccess {
  readonly form: typeof PLAN_SOURCE_ARRAY | typeof PLAN_SOURCE_ITERABLE
  readonly array: unknown[] | undefined
  readonly iterable: Iterable<unknown>
  readonly replacesSource: boolean
}

const genericSource = (iterable: Iterable<unknown>, replacesSource: boolean): PlanSourceAccess => ({
  form: PLAN_SOURCE_ITERABLE,
  array: undefined,
  iterable,
  replacesSource,
})

const inspectPlanSource = (source: Iterable<unknown>): PlanSourceAccess => {
  if (!Array.isArray(source)) return genericSource(source, false)

  // Read the actual method once. This catches Array proxies whose traps report
  // no own Symbol.iterator while returning custom iteration behavior.
  const iteratorMethod = source[Symbol.iterator] as unknown
  if (
    iteratorMethod === nativeArrayIterator &&
    nativeArrayIteratorPrototype.next === nativeArrayIteratorNext &&
    !('return' in nativeArrayIteratorPrototype)
  ) {
    return {
      form: PLAN_SOURCE_ARRAY,
      array: source,
      iterable: source,
      replacesSource: false,
    }
  }

  return genericSource(
    {
      [Symbol.iterator](): Iterator<unknown> {
        return Reflect.apply(iteratorMethod as Function, source, []) as Iterator<unknown>
      },
    },
    true,
  )
}

class ArrayPlanIterator implements IterableIterator<unknown> {
  readonly #source: readonly unknown[]
  readonly #steps: readonly IterStep[]
  readonly #state: IterExecutionState
  #sourceIndex = 0
  #done = false

  constructor(source: readonly unknown[], steps: readonly IterStep[]) {
    this.#source = source
    this.#steps = steps
    this.#state = makeExecutionState(steps)
  }

  next(): IteratorResult<unknown> {
    while (!this.#done && this.#sourceIndex < this.#source.length) {
      let value = this.#source[this.#sourceIndex++]
      let rejected = false
      let stopAfterInput = false

      for (let position = 0; position < this.#steps.length; position++) {
        const step = this.#steps[position]
        switch (step.op) {
          case ITER_MAP:
            value = step.fn(value, this.#state.indexes[position]++)
            break
          case ITER_FILTER:
            if (!step.fn(value, this.#state.indexes[position]++)) rejected = true
            break
          case ITER_FILTER_MAP: {
            const result = step.fn(value, this.#state.indexes[position]++) as Option<unknown>
            if (result._tag === 1) value = result.value
            else rejected = true
            break
          }
          case ITER_FLAT_MAP:
            throw new Error('Iter: flatMap cannot use the direct array iterator')
          case ITER_TAKE:
            if (this.#state.counts[position] >= step.count) {
              this.#done = true
              return { done: true, value: undefined }
            }
            if (++this.#state.counts[position] >= step.count) stopAfterInput = true
            break
          case ITER_DROP:
            if (this.#state.counts[position] < step.count) {
              this.#state.counts[position]++
              rejected = true
            }
            break
          case ITER_TAKE_WHILE:
            if (!step.fn(value, this.#state.indexes[position]++)) {
              this.#done = true
              return { done: true, value: undefined }
            }
            break
          case ITER_DROP_WHILE:
            if (this.#state.dropping[position]) {
              if (step.fn(value, this.#state.indexes[position]++)) rejected = true
              else this.#state.dropping[position] = false
            }
            break
          case ITER_SCAN:
            value = step.fn(this.#state.scans[position], value, this.#state.indexes[position]++)
            this.#state.scans[position] = value
            break
        }
        if (rejected) break
      }

      if (stopAfterInput) this.#done = true
      if (!rejected) return { done: false, value }
    }

    this.#done = true
    return { done: true, value: undefined }
  }

  return(): IteratorResult<unknown> {
    this.#done = true
    return { done: true, value: undefined }
  }

  [Symbol.iterator](): IterableIterator<unknown> {
    return this
  }
}

const supportsDirectArrayIteration = (steps: readonly IterStep[]): boolean => {
  for (const step of steps) {
    if (step.kind === 'flatMap') return false
  }
  return true
}

const hasZeroTake = (steps: readonly IterStep[]): boolean => {
  for (const step of steps) {
    if (step.kind === 'take' && step.count === 0) return true
  }
  return false
}

const takeNeedsPublicIterator = (
  steps: readonly IterStep[],
  hasPlainArraySource: boolean,
): boolean => {
  let hasActiveNestedIterator = false
  for (const step of steps) {
    if (step.kind === 'flatMap') hasActiveNestedIterator = true
    else if (step.kind === 'take' && (!hasPlainArraySource || hasActiveNestedIterator)) return true
  }
  return false
}

/**
 * Advances one value through a compact lazy plan. Returning true requests
 * early termination and is propagated through flatMap so IteratorClose runs
 * for both the nested iterable and the original source.
 */
const advancePlan = (
  steps: readonly IterStep[],
  state: IterExecutionState,
  start: number,
  initial: unknown,
  emit: IterEmit,
): boolean => {
  let value = initial
  for (let position = start; position < steps.length; position++) {
    const step = steps[position]
    switch (step.op) {
      case ITER_MAP: {
        const fn = step.fn
        value = fn(value, state.indexes[position]++)
        break
      }
      case ITER_FILTER: {
        const fn = step.fn
        if (!fn(value, state.indexes[position]++)) return false
        break
      }
      case ITER_FILTER_MAP: {
        const fn = step.fn
        const result = fn(value, state.indexes[position]++) as Option<unknown>
        if (result._tag !== 1) return false
        value = result.value
        break
      }
      case ITER_FLAT_MAP: {
        const fn = step.fn
        const values = fn(value, state.indexes[position]++) as Iterable<unknown>
        for (const inner of values) {
          if (advancePlan(steps, state, position + 1, inner, emit)) return true
        }
        return false
      }
      case ITER_TAKE:
        if (state.counts[position] >= step.count) return true
        state.counts[position]++
        if (advancePlan(steps, state, position + 1, value, emit)) return true
        return state.counts[position] >= step.count
      case ITER_DROP:
        if (state.counts[position] < step.count) {
          state.counts[position]++
          return false
        }
        break
      case ITER_TAKE_WHILE: {
        const fn = step.fn
        if (!fn(value, state.indexes[position]++)) return true
        break
      }
      case ITER_DROP_WHILE:
        if (state.dropping[position]) {
          const fn = step.fn
          if (fn(value, state.indexes[position]++)) return false
          state.dropping[position] = false
        }
        break
      case ITER_SCAN: {
        const fn = step.fn
        value = fn(state.scans[position], value, state.indexes[position]++)
        state.scans[position] = value
        break
      }
    }
  }
  return emit(value)
}

const executeArrayFastPlan = (
  source: readonly unknown[],
  steps: readonly IterStep[],
  emit: IterEmit,
): boolean => {
  const length = steps.length
  if (length === 0) {
    for (let index = 0; index < source.length; index++) if (emit(source[index])) break
    return true
  }

  if (length === 1 && steps[0].kind === 'filterMap') {
    const fn = steps[0].fn
    for (let index = 0; index < source.length; index++) {
      const result = fn(source[index], index) as Option<unknown>
      if (result._tag === 1 && emit(result.value)) break
    }
    return true
  }
  if (length === 1 && steps[0].kind === 'flatMap') {
    const fn = steps[0].fn
    outer: for (let index = 0; index < source.length; index++) {
      for (const value of fn(source[index], index) as Iterable<unknown>) {
        if (emit(value)) break outer
      }
    }
    return true
  }
  if (length === 1 && steps[0].kind === 'take') {
    const limit = steps[0].count
    for (let index = 0; index < source.length && index < limit; index++) {
      if (emit(source[index])) break
    }
    return true
  }
  if (length === 1 && steps[0].kind === 'drop') {
    const limit = steps[0].count
    for (let index = limit; index < source.length; index++) {
      if (emit(source[index])) break
    }
    return true
  }
  if (length === 1 && steps[0].kind === 'takeWhile') {
    const fn = steps[0].fn
    for (let index = 0; index < source.length; index++) {
      const value = source[index]
      if (!fn(value, index) || emit(value)) break
    }
    return true
  }
  if (length === 1 && steps[0].kind === 'dropWhile') {
    const fn = steps[0].fn
    let index = 0
    while (index < source.length && fn(source[index], index)) index++
    for (; index < source.length; index++) {
      if (emit(source[index])) break
    }
    return true
  }
  if (length === 1 && steps[0].kind === 'scan') {
    const fn = steps[0].fn
    let state = steps[0].initial
    for (let index = 0; index < source.length; index++) {
      state = fn(state, source[index], index)
      if (emit(state)) break
    }
    return true
  }

  if (length === 2 && steps[0].kind === 'map' && steps[1].kind === 'take') {
    const mapFn = steps[0].fn
    const limit = steps[1].count
    for (let index = 0; index < source.length && index < limit; index++) {
      if (emit(mapFn(source[index], index))) break
    }
    return true
  }
  if (length === 2 && steps[0].kind === 'filter' && steps[1].kind === 'take') {
    const filterFn = steps[0].fn
    const limit = steps[1].count
    let emitted = 0
    for (let index = 0; index < source.length && emitted < limit; index++) {
      const value = source[index]
      if (!filterFn(value, index)) continue
      emitted++
      if (emit(value)) break
    }
    return true
  }
  if (length === 2 && steps[0].kind === 'drop' && steps[1].kind === 'takeWhile') {
    const start = Math.min(steps[0].count, source.length)
    const takeWhileFn = steps[1].fn
    let predicateIndex = 0
    for (let index = start; index < source.length; index++) {
      const value = source[index]
      if (!takeWhileFn(value, predicateIndex++) || emit(value)) break
    }
    return true
  }
  if (length === 2 && steps[0].kind === 'dropWhile' && steps[1].kind === 'takeWhile') {
    const dropWhileFn = steps[0].fn
    const takeWhileFn = steps[1].fn
    let index = 0
    while (index < source.length && dropWhileFn(source[index], index)) index++
    let predicateIndex = 0
    for (; index < source.length; index++) {
      const value = source[index]
      if (!takeWhileFn(value, predicateIndex++) || emit(value)) break
    }
    return true
  }
  if (length === 2 && steps[0].kind === 'scan' && steps[1].kind === 'filterMap') {
    const scanFn = steps[0].fn
    const filterMapFn = steps[1].fn
    let state = steps[0].initial
    for (let index = 0; index < source.length; index++) {
      state = scanFn(state, source[index], index)
      const result = filterMapFn(state, index) as Option<unknown>
      if (result._tag === 1 && emit(result.value)) break
    }
    return true
  }

  if (
    length === 3 &&
    steps[0].kind === 'flatMap' &&
    steps[1].kind === 'map' &&
    steps[2].kind === 'filter'
  ) {
    const flatMapFn = steps[0].fn
    const mapFn = steps[1].fn
    const filterFn = steps[2].fn
    let innerIndex = 0
    outer: for (let index = 0; index < source.length; index++) {
      for (const nested of flatMapFn(source[index], index) as Iterable<unknown>) {
        const value = mapFn(nested, innerIndex)
        if (filterFn(value, innerIndex++) && emit(value)) break outer
      }
    }
    return true
  }

  return false
}

const executeIterableFastPlan = (
  source: Iterable<unknown>,
  steps: readonly IterStep[],
  emit: IterEmit,
): boolean => {
  const length = steps.length
  if (length === 0) {
    for (const value of source) {
      if (emit(value)) break
    }
    return true
  }

  if (length === 1) {
    const step = steps[0]
    switch (step.kind) {
      case 'map': {
        let index = 0
        for (const value of source) {
          if (emit(step.fn(value, index++))) break
        }
        return true
      }
      case 'filter': {
        let index = 0
        for (const value of source) {
          if (step.fn(value, index++) && emit(value)) break
        }
        return true
      }
      case 'filterMap': {
        let index = 0
        for (const value of source) {
          const result = step.fn(value, index++) as Option<unknown>
          if (result._tag === 1 && emit(result.value)) break
        }
        return true
      }
      case 'flatMap': {
        let index = 0
        outer: for (const outerValue of source) {
          for (const value of step.fn(outerValue, index++) as Iterable<unknown>) {
            if (emit(value)) break outer
          }
        }
        return true
      }
      case 'drop': {
        let index = 0
        for (const value of source) {
          if (index++ >= step.count && emit(value)) break
        }
        return true
      }
      case 'takeWhile': {
        let index = 0
        for (const value of source) {
          if (!step.fn(value, index++) || emit(value)) break
        }
        return true
      }
      case 'dropWhile': {
        let dropping = true
        let index = 0
        for (const value of source) {
          if (dropping && step.fn(value, index++)) continue
          dropping = false
          if (emit(value)) break
        }
        return true
      }
      case 'scan': {
        let state = step.initial
        let index = 0
        for (const value of source) {
          state = step.fn(state, value, index++)
          if (emit(state)) break
        }
        return true
      }
      case 'take':
        return false
    }
  }

  if (length === 2 && steps[0].kind === 'map' && steps[1].kind === 'filter') {
    const mapFn = steps[0].fn
    const filterFn = steps[1].fn
    let index = 0
    for (const sourceValue of source) {
      const value = mapFn(sourceValue, index)
      if (filterFn(value, index++) && emit(value)) break
    }
    return true
  }
  if (length === 2 && steps[0].kind === 'drop' && steps[1].kind === 'takeWhile') {
    const limit = steps[0].count
    const takeWhileFn = steps[1].fn
    let sourceIndex = 0
    let predicateIndex = 0
    for (const value of source) {
      if (sourceIndex++ < limit) continue
      if (!takeWhileFn(value, predicateIndex++) || emit(value)) break
    }
    return true
  }
  if (length === 2 && steps[0].kind === 'dropWhile' && steps[1].kind === 'takeWhile') {
    const dropWhileFn = steps[0].fn
    const takeWhileFn = steps[1].fn
    let dropping = true
    let dropIndex = 0
    let predicateIndex = 0
    for (const value of source) {
      if (dropping && dropWhileFn(value, dropIndex++)) continue
      dropping = false
      if (!takeWhileFn(value, predicateIndex++) || emit(value)) break
    }
    return true
  }
  if (length === 2 && steps[0].kind === 'scan' && steps[1].kind === 'filterMap') {
    const scanFn = steps[0].fn
    const filterMapFn = steps[1].fn
    let state = steps[0].initial
    let index = 0
    for (const sourceValue of source) {
      state = scanFn(state, sourceValue, index)
      const result = filterMapFn(state, index++) as Option<unknown>
      if (result._tag === 1 && emit(result.value)) break
    }
    return true
  }
  if (
    length === 3 &&
    steps[0].kind === 'flatMap' &&
    steps[1].kind === 'map' &&
    steps[2].kind === 'filter'
  ) {
    const flatMapFn = steps[0].fn
    const mapFn = steps[1].fn
    const filterFn = steps[2].fn
    let outerIndex = 0
    let innerIndex = 0
    outer: for (const outerValue of source) {
      for (const nested of flatMapFn(outerValue, outerIndex++) as Iterable<unknown>) {
        const value = mapFn(nested, innerIndex)
        if (filterFn(value, innerIndex++) && emit(value)) break outer
      }
    }
    return true
  }

  return false
}

const executePlan = (
  plan: PlannedIterNode<unknown>,
  fallback: Iterable<unknown>,
  emit: IterEmit,
  preparedAccess?: PlanSourceAccess,
): void => {
  const { source, steps } = plan
  // An outer take(0) never opens or evaluates its upstream iterable.
  if (hasZeroTake(steps)) return

  const access = preparedAccess ?? inspectPlanSource(source)
  const arraySource = access.array
  // take closes its immediate upstream before exposing the last selected
  // value. The compact executor cannot reproduce that observable ordering for
  // an arbitrary source or an active nested flatMap iterator, so retain the
  // public generator path there. A native array pipeline with no upstream
  // flatMap has no IteratorClose hook and remains safe to specialize.
  if (takeNeedsPublicIterator(steps, arraySource !== undefined)) {
    const publicFallback: Iterable<unknown> = access.replacesSource
      ? { [Symbol.iterator]: () => plannedIteratorFromBase(plan, access.iterable) }
      : fallback
    for (const value of publicFallback) {
      if (emit(value)) break
    }
    return
  }
  if (arraySource && executeArrayFastPlan(arraySource, steps, emit)) return
  if (!arraySource && executeIterableFastPlan(access.iterable, steps, emit)) return

  const state = makeExecutionState(steps)
  if (arraySource) {
    for (let index = 0; index < arraySource.length; index++) {
      if (advancePlan(steps, state, 0, arraySource[index], emit)) return
    }
    return
  }
  for (const value of access.iterable) {
    if (advancePlan(steps, state, 0, value, emit)) return
  }
}

const collectFastPlan = (
  plan: PlannedIterNode<unknown>,
  target: unknown[],
  access: PlanSourceAccess,
): boolean => {
  const { steps } = plan
  const length = steps.length
  const arraySource = access.array

  if (takeNeedsPublicIterator(steps, arraySource !== undefined)) return false

  if (length === 0) {
    if (arraySource) {
      for (let index = 0; index < arraySource.length; index++) target.push(arraySource[index])
    } else {
      for (const value of access.iterable) target.push(value)
    }
    return true
  }

  // These dominate real lazy-array usage and avoid the generic stage
  // dispatcher entirely. Callback indexes retain the same per-stage meaning
  // as the generator implementation.
  if (length === 2 && steps[0].kind === 'map' && steps[1].kind === 'filter') {
    const mapFn = steps[0].fn
    const filterFn = steps[1].fn
    let index = 0
    for (const sourceValue of access.iterable) {
      const value = mapFn(sourceValue, index)
      if (filterFn(value, index++)) target.push(value)
    }
    return true
  }

  if (
    length === 3 &&
    steps[0].kind === 'map' &&
    steps[1].kind === 'filter' &&
    steps[2].kind === 'take'
  ) {
    const mapFn = steps[0].fn
    const filterFn = steps[1].fn
    const limit = steps[2].count
    if (limit === 0) return true
    let emitted = 0
    let index = 0
    for (const sourceValue of access.iterable) {
      const value = mapFn(sourceValue, index)
      if (filterFn(value, index)) {
        target.push(value)
        if (++emitted >= limit) break
      }
      index++
    }
    return true
  }

  if (length === 2 && steps[0].kind === 'filterMap' && steps[1].kind === 'take') {
    const filterMapFn = steps[0].fn
    const limit = steps[1].count
    if (limit === 0) return true
    let emitted = 0
    let index = 0
    for (const sourceValue of access.iterable) {
      const result = filterMapFn(sourceValue, index++) as Option<unknown>
      if (result._tag === 1) {
        target.push(result.value)
        if (++emitted >= limit) break
      }
    }
    return true
  }

  return false
}

const natural = (value: number): number => {
  if (Number.isNaN(value) || value <= 0) return 0
  if (value === Infinity) return Infinity
  return Math.floor(value)
}

const close = (iterator: Iterator<unknown>): void => {
  iterator.return?.()
}

function* mapIterator(source: Iterable<unknown>, fn: IterUnary): Generator<unknown> {
  let index = 0
  for (const value of source) yield fn(value, index++)
}

function* filterIterator(source: Iterable<unknown>, fn: IterPredicate): Generator<unknown> {
  let index = 0
  for (const value of source) {
    if (fn(value, index++)) yield value
  }
}

function* filterMapIterator(source: Iterable<unknown>, fn: IterUnary): Generator<unknown> {
  let index = 0
  for (const value of source) {
    const result = fn(value, index++) as Option<unknown>
    if (result._tag === 1) yield result.value
  }
}

function* flatMapIterator(source: Iterable<unknown>, fn: IterUnary): Generator<unknown> {
  let index = 0
  for (const value of source) yield* fn(value, index++) as Iterable<unknown>
}

function* takeIterator(source: Iterable<unknown>, limit: number): Generator<unknown> {
  if (limit === 0) return

  const iterator = source[Symbol.iterator]()
  let open = true
  let emitted = 0
  try {
    while (emitted < limit) {
      const item = iterator.next()
      if (item.done) {
        open = false
        return
      }

      emitted++
      if (emitted === limit) {
        close(iterator)
        open = false
      }
      yield item.value
    }
  } finally {
    if (open) close(iterator)
  }
}

function* dropIterator(source: Iterable<unknown>, limit: number): Generator<unknown> {
  let index = 0
  for (const value of source) {
    if (index++ >= limit) yield value
  }
}

function* takeWhileIterator(source: Iterable<unknown>, fn: IterPredicate): Generator<unknown> {
  let index = 0
  for (const value of source) {
    if (!fn(value, index++)) return
    yield value
  }
}

function* dropWhileIterator(source: Iterable<unknown>, fn: IterPredicate): Generator<unknown> {
  let dropping = true
  let index = 0
  for (const value of source) {
    if (dropping && fn(value, index++)) continue
    dropping = false
    yield value
  }
}

function* scanIterator(
  source: Iterable<unknown>,
  fn: IterReducer,
  initial: unknown,
): Generator<unknown> {
  let state = initial
  let index = 0
  for (const value of source) {
    state = fn(state, value, index++)
    yield state
  }
}

function plannedStepIterator(
  node: PlannedIterNode<unknown>,
  source: Iterable<unknown>,
): Iterator<unknown> {
  switch (node.kind) {
    case undefined:
      return source[Symbol.iterator]()
    case 'map':
      return mapIterator(source, node.fn as IterUnary)
    case 'filter':
      return filterIterator(source, node.fn as IterPredicate)
    case 'filterMap':
      return filterMapIterator(source, node.fn as IterUnary)
    case 'flatMap':
      return flatMapIterator(source, node.fn as IterUnary)
    case 'take':
      return takeIterator(source, node.count)
    case 'drop':
      return dropIterator(source, node.count)
    case 'takeWhile':
      return takeWhileIterator(source, node.fn as IterPredicate)
    case 'dropWhile':
      return dropWhileIterator(source, node.fn as IterPredicate)
    case 'scan':
      return scanIterator(source, node.fn as IterReducer, node.initial)
  }
}

function plannedIterator(node: PlannedIterNode<unknown>): Iterator<unknown> {
  const steps = node.steps
  if (supportsDirectArrayIteration(steps)) {
    const access = inspectPlanSource(node.source)
    if (access.array) return new ArrayPlanIterator(access.array, steps)
    if (access.replacesSource) return plannedIteratorFromBase(node, access.iterable)
  }
  return plannedStepIterator(node, node.upstream)
}

function plannedIteratorFromBase(
  node: PlannedIterNode<unknown>,
  base: Iterable<unknown>,
): Iterator<unknown> {
  if (!node.previous) return plannedStepIterator(node, base)
  const upstream: Iterable<unknown> = {
    [Symbol.iterator]: () =>
      plannedIteratorFromBase(node.previous as PlannedIterNode<unknown>, base),
  }
  return plannedStepIterator(node, upstream)
}

export const from = <A>(source: Iterable<A>): Iter<A> => plannedRoot(source)

export const fromIterator = <A>(factory: () => Iterator<A>): Iter<A> => make(factory)

export const defer = <A>(factory: () => Iterable<A>): Iter<A> =>
  make(() => factory()[Symbol.iterator]())

export const empty = <A = never>(): Iter<A> => make(() => [][Symbol.iterator]() as Iterator<A>)

export const of = <A>(...values: readonly A[]): Iter<A> => from(values)

export const range = (start: number, end: number, step = 1): Iter<number> => {
  if (!Number.isFinite(step) || step === 0) {
    throw new RangeError('Iter.range: step must be a finite, non-zero number')
  }

  return make(function* () {
    if (step > 0) {
      for (let value = start; value < end; value += step) yield value
    } else {
      for (let value = start; value > end; value += step) yield value
    }
  })
}

export const repeat = <A>(value: A): Iter<A> =>
  make(function* () {
    while (true) yield value
  })

export const iterate = <A>(seed: A, next: (value: A) => A): Iter<A> =>
  make(function* () {
    let value = seed
    while (true) {
      yield value
      value = next(value)
    }
  })

export const unfold = <S, A>(
  seed: S,
  next: (state: S) => Option<readonly [value: A, state: S]>,
): Iter<A> =>
  make(function* () {
    let state = seed
    while (true) {
      const result = next(state)
      if (result._tag === 0) return
      yield result.value[0]
      state = result.value[1]
    }
  })

const mapImpl = <A, B>(source: Iterable<A>, f: (value: A, index: number) => B): Iter<B> =>
  appendStep(source, 'map', f as IterUnary)

export const map: {
  <A, B>(source: Iterable<A>, f: (value: A, index: number) => B): Iter<B>
  <A, B>(f: (value: A, index: number) => B): (source: Iterable<A>) => Iter<B>
} = function map(f: any, __df?: any): any {
  if (arguments.length >= 2) return (map as any)(__df)(f)
  return ((source) => mapImpl(source, f)) as (...args: any[]) => any
} as any

const filterImpl = <A>(source: Iterable<A>, predicate: Predicate<A>): Iter<A> =>
  appendStep(source, 'filter', predicate as IterPredicate)

export const filter: {
  <A, B extends A>(source: Iterable<A>, predicate: Refinement<A, B>): Iter<B>
  <A>(source: Iterable<A>, predicate: Predicate<A>): Iter<A>
  <A, B extends A>(predicate: Refinement<A, B>): (source: Iterable<A>) => Iter<B>
  <A>(predicate: Predicate<A>): (source: Iterable<A>) => Iter<A>
} = function filter(predicate: Predicate<unknown>, __df?: any): any {
  if (arguments.length >= 2) return (filter as any)(__df)(predicate)
  return ((source: Iterable<unknown>) =>
  filterImpl(source, predicate)) as (...args: any[]) => any
} as any

const filterMapImpl = <A, B>(
  source: Iterable<A>,
  f: (value: A, index: number) => Option<B>,
): Iter<B> => appendStep(source, 'filterMap', f as IterUnary)

export const filterMap: {
  <A, B>(source: Iterable<A>, f: (value: A, index: number) => Option<B>): Iter<B>
  <A, B>(f: (value: A, index: number) => Option<B>): (source: Iterable<A>) => Iter<B>
} = function filterMap(f: any, __df?: any): any {
  if (arguments.length >= 2) return (filterMap as any)(__df)(f)
  return ((source) => filterMapImpl(source, f)) as (...args: any[]) => any
} as any

const flatMapImpl = <A, B>(
  source: Iterable<A>,
  f: (value: A, index: number) => Iterable<B>,
): Iter<B> => appendStep(source, 'flatMap', f as IterUnary)

export const flatMap: {
  <A, B>(source: Iterable<A>, f: (value: A, index: number) => Iterable<B>): Iter<B>
  <A, B>(f: (value: A, index: number) => Iterable<B>): (source: Iterable<A>) => Iter<B>
} = function flatMap(f: any, __df?: any): any {
  if (arguments.length >= 2) return (flatMap as any)(__df)(f)
  return ((source) => flatMapImpl(source, f)) as (...args: any[]) => any
} as any

export const flatten = <A>(source: Iterable<Iterable<A>>): Iter<A> =>
  flatMapImpl(source, (value) => value)

const tapImpl = <A>(source: Iterable<A>, effect: (value: A, index: number) => void): Iter<A> =>
  mapImpl(source, (value, index) => {
    effect(value, index)
    return value
  })

export const tap: {
  <A>(source: Iterable<A>, effect: (value: A, index: number) => void): Iter<A>
  <A>(effect: (value: A, index: number) => void): (source: Iterable<A>) => Iter<A>
} = function tap(effect: any, __df?: any): any {
  if (arguments.length >= 2) return (tap as any)(__df)(effect)
  return ((source) => tapImpl(source, effect)) as (...args: any[]) => any
} as any

const takeImpl = <A>(source: Iterable<A>, count: number): Iter<A> => {
  const limit = natural(count)
  return appendStep(source, 'take', undefined, limit)
}

export const take: {
  <A>(source: Iterable<A>, count: number): Iter<A>
  (count: number): <A>(source: Iterable<A>) => Iter<A>
} = function take(count: any, __df?: any): any {
  if (arguments.length >= 2) return (take as any)(__df)(count)
  return ((source) =>
  takeImpl(source, count)) as (...args: any[]) => any
} as any

const dropImpl = <A>(source: Iterable<A>, count: number): Iter<A> => {
  const limit = natural(count)
  return appendStep(source, 'drop', undefined, limit)
}

export const drop: {
  <A>(source: Iterable<A>, count: number): Iter<A>
  (count: number): <A>(source: Iterable<A>) => Iter<A>
} = function drop(count: any, __df?: any): any {
  if (arguments.length >= 2) return (drop as any)(__df)(count)
  return ((source) =>
  dropImpl(source, count)) as (...args: any[]) => any
} as any

const takeWhileImpl = <A>(source: Iterable<A>, predicate: Predicate<A>): Iter<A> =>
  appendStep(source, 'takeWhile', predicate as IterPredicate)

export const takeWhile: {
  <A>(source: Iterable<A>, predicate: Predicate<A>): Iter<A>
  <A>(predicate: Predicate<A>): (source: Iterable<A>) => Iter<A>
} = function takeWhile(predicate: any, __df?: any): any {
  if (arguments.length >= 2) return (takeWhile as any)(__df)(predicate)
  return ((source) => takeWhileImpl(source, predicate)) as (...args: any[]) => any
} as any

const dropWhileImpl = <A>(source: Iterable<A>, predicate: Predicate<A>): Iter<A> =>
  appendStep(source, 'dropWhile', predicate as IterPredicate)

export const dropWhile: {
  <A>(source: Iterable<A>, predicate: Predicate<A>): Iter<A>
  <A>(predicate: Predicate<A>): (source: Iterable<A>) => Iter<A>
} = function dropWhile(predicate: any, __df?: any): any {
  if (arguments.length >= 2) return (dropWhile as any)(__df)(predicate)
  return ((source) => dropWhileImpl(source, predicate)) as (...args: any[]) => any
} as any

const scanImpl = <A, B>(
  source: Iterable<A>,
  reducer: (state: B, value: A, index: number) => B,
  initial: B,
): Iter<B> => appendStep(source, 'scan', reducer as IterReducer, 0, initial)

export const scan: {
  <A, B>(
    source: Iterable<A>,
    reducer: (state: B, value: A, index: number) => B,
    initial: B,
  ): Iter<B>
  <A, B>(
    reducer: (state: B, value: A, index: number) => B,
    initial: B,
  ): (source: Iterable<A>) => Iter<B>
} = function scan(reducer: any, initial: any, __df?: any): any {
  if (arguments.length >= 3) return (scan as any)(initial, __df)(reducer)
  return ((source) =>
  scanImpl(source, reducer, initial)) as (...args: any[]) => any
} as any

const chunkImpl = <A>(source: Iterable<A>, size: number): Iter<readonly A[]> => {
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new RangeError('Iter.chunk: size must be a positive safe integer')
  }

  return make(function* () {
    let values: A[] = []
    for (const value of source) {
      values.push(value)
      if (values.length === size) {
        yield values
        values = []
      }
    }
    if (values.length > 0) yield values
  })
}

export const chunk: {
  <A>(source: Iterable<A>, size: number): Iter<readonly A[]>
  (size: number): <A>(source: Iterable<A>) => Iter<readonly A[]>
} = function chunk(size: any, __df?: any): any {
  if (arguments.length >= 2) return (chunk as any)(__df)(size)
  return ((source) => chunkImpl(source, size)) as (...args: any[]) => any
} as any

const intersperseImpl = <A>(source: Iterable<A>, separator: A): Iter<A> =>
  make(function* () {
    let first = true
    for (const value of source) {
      if (first) first = false
      else yield separator
      yield value
    }
  })

export const intersperse: {
  <A>(source: Iterable<A>, separator: A): Iter<A>
  <A>(separator: A): (source: Iterable<A>) => Iter<A>
} = function intersperse(separator: any, __df?: any): any {
  if (arguments.length >= 2) return (intersperse as any)(__df)(separator)
  return ((source) => intersperseImpl(source, separator)) as (...args: any[]) => any
} as any

const distinctByImpl = <A, K>(source: Iterable<A>, keyOf: (value: A) => K): Iter<A> =>
  make(function* () {
    const seen = new Set<K>()
    for (const value of source) {
      const key = keyOf(value)
      if (!seen.has(key)) {
        seen.add(key)
        yield value
      }
    }
  })

export const distinctBy: {
  <A, K>(source: Iterable<A>, keyOf: (value: A) => K): Iter<A>
  <A, K>(keyOf: (value: A) => K): (source: Iterable<A>) => Iter<A>
} = function distinctBy(keyOf: any, __df?: any): any {
  if (arguments.length >= 2) return (distinctBy as any)(__df)(keyOf)
  return ((source) => distinctByImpl(source, keyOf)) as (...args: any[]) => any
} as any

export const distinct = <A>(source: Iterable<A>): Iter<A> =>
  distinctByImpl(source, (value) => value)

const concatImpl = <A, B>(source: Iterable<A>, other: Iterable<B>): Iter<A | B> =>
  make(function* () {
    yield* source
    yield* other
  })

export const concat: {
  <A, B>(source: Iterable<A>, other: Iterable<B>): Iter<A | B>
  <B>(other: Iterable<B>): <A>(source: Iterable<A>) => Iter<A | B>
} = function concat(other: any, __df?: any): any {
  if (arguments.length >= 2) return (concat as any)(__df)(other)
  return ((source) => concatImpl(source, other)) as (...args: any[]) => any
} as any

const zipWithImpl = <A, B, C>(
  source: Iterable<A>,
  other: Iterable<B>,
  f: (left: A, right: B, index: number) => C,
): Iter<C> =>
  make(function* () {
    const left = source[Symbol.iterator]()
    const right = other[Symbol.iterator]()
    let leftOpen = true
    let rightOpen = true
    let index = 0
    try {
      while (true) {
        const leftValue = left.next()
        if (leftValue.done) {
          leftOpen = false
          return
        }

        const rightValue = right.next()
        if (rightValue.done) {
          rightOpen = false
          return
        }

        yield f(leftValue.value, rightValue.value, index++)
      }
    } finally {
      if (leftOpen) close(left)
      if (rightOpen) close(right)
    }
  })

export const zipWith: {
  <A, B, C>(
    source: Iterable<A>,
    other: Iterable<B>,
    f: (left: A, right: B, index: number) => C,
  ): Iter<C>
  <A, B, C>(
    other: Iterable<B>,
    f: (left: A, right: B, index: number) => C,
  ): (source: Iterable<A>) => Iter<C>
} = function zipWith(other: any, f: any, __df?: any): any {
  if (arguments.length >= 3) return (zipWith as any)(f, __df)(other)
  return ((source) => zipWithImpl(source, other, f)) as (...args: any[]) => any
} as any

export const zip: {
  <A, B>(source: Iterable<A>, other: Iterable<B>): Iter<readonly [A, B]>
  <B>(other: Iterable<B>): <A>(source: Iterable<A>) => Iter<readonly [A, B]>
} = function zip(other: any, __df?: any): any {
  if (arguments.length >= 2) return (zip as any)(__df)(other)
  return ((source) =>
    zipWithImpl(source, other, (left, right) => [left, right] as const)) as (...args: any[]) => any
} as any

export const enumerate = <A>(source: Iterable<A>): Iter<readonly [number, A]> =>
  mapImpl(source, (value, index) => [index, value] as const)

const planOf = internalPlanOf

export const toArray = <A>(source: Iterable<A>): A[] => {
  const plan = planOf(source)
  if (!plan) return Array.from(source)
  const output: A[] = []
  if (hasZeroTake(plan.steps)) return output
  const access = inspectPlanSource(plan.source)
  if (!collectFastPlan(plan, output, access)) {
    executePlan(
      plan,
      source,
      (value) => {
        output.push(value as A)
        return false
      },
      access,
    )
  }
  return output
}

const toArrayIntoImpl = <A, Target extends unknown[]>(
  source: Iterable<A>,
  target: Target,
): Target => {
  const plan = planOf(source)
  if (plan) {
    if (hasZeroTake(plan.steps)) return target
    const access = inspectPlanSource(plan.source)
    const steps = plan.steps
    if (steps.length === 2 && steps[0].kind === 'map' && steps[1].kind === 'filter') {
      const mapFn = steps[0].fn
      const filterFn = steps[1].fn
      let index = 0
      for (const sourceValue of access.iterable) {
        const value = mapFn(sourceValue, index)
        if (filterFn(value, index++)) target.push(value as A)
      }
      return target
    }
    if (!collectFastPlan(plan, target, access)) {
      executePlan(
        plan,
        source,
        (value) => {
          target.push(value as A)
          return false
        },
        access,
      )
    }
    return target
  }
  for (const value of source) target.push(value)
  return target
}

interface ToArrayIntoOperation {
  <A, const Target extends unknown[]>(
    source: Iterable<A> & Iterable<Target[number]>,
    target: Target,
    ..._capacity: [] & ArrayTargetCapacity<Target>
  ): Target
  <const Target extends unknown[]>(
    target: Target,
    ..._capacity: [] & ArrayTargetCapacity<Target>
  ): (source: Iterable<Target[number]>) => Target
}

export const toArrayInto = function toArrayInto(target: unknown[], __df?: unknown[]): unknown {
  if (arguments.length >= 2) return (toArrayInto as any)(__df as unknown[])(target)
  return ((source: Iterable<unknown>): unknown[] =>
    toArrayIntoImpl(source, target)) as (...args: any[]) => any
} as ToArrayIntoOperation

const reduceImpl = <A, B>(
  source: Iterable<A>,
  reducer: (state: B, value: A, index: number) => B,
  initial: B,
): B => {
  let state = initial
  let index = 0
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    executePlan(
      plan,
      source,
      (value) => {
        state = reducer(state, value as A, index++)
        return false
      },
      access,
    )
    return state
  }
  for (const value of source) state = reducer(state, value, index++)
  return state
}

export const reduce: {
  <A, B>(source: Iterable<A>, reducer: (state: B, value: A, index: number) => B, initial: B): B
  <A, B>(reducer: (state: B, value: A, index: number) => B, initial: B): (source: Iterable<A>) => B
} = function reduce(reducer: any, initial: any, __df?: any): any {
  if (arguments.length >= 3) return (reduce as any)(initial, __df)(reducer)
  return ((source) =>
  reduceImpl(source, reducer, initial)) as (...args: any[]) => any
} as any

export const firstOrUndefined = <A>(source: Iterable<A>): A | undefined => {
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    let result: A | undefined
    executePlan(
      plan,
      source,
      (value) => {
        result = value as A
        return true
      },
      access,
    )
    return result
  }
  for (const value of source) return value
  return undefined
}

export const first = <A>(source: Iterable<A>): Option<A> => {
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    let result: Option<A> = none
    executePlan(
      plan,
      source,
      (value) => {
        result = optionSome(value as A)
        return true
      },
      access,
    )
    return result
  }
  for (const value of source) return optionSome(value)
  return none
}

export const lastOrUndefined = <A>(source: Iterable<A>): A | undefined => {
  let result: A | undefined
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    executePlan(
      plan,
      source,
      (value) => {
        result = value as A
        return false
      },
      access,
    )
    return result
  }
  for (const value of source) result = value
  return result
}

export const last = <A>(source: Iterable<A>): Option<A> => {
  let found = false
  let result: A | undefined
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    executePlan(
      plan,
      source,
      (value) => {
        found = true
        result = value as A
        return false
      },
      access,
    )
  } else {
    for (const value of source) {
      found = true
      result = value
    }
  }
  return found ? optionSome(result as A) : none
}

const findOrUndefinedImpl = <A>(source: Iterable<A>, predicate: Predicate<A>): A | undefined => {
  let index = 0
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    let result: A | undefined
    executePlan(
      plan,
      source,
      (value) => {
        if (!predicate(value as A, index++)) return false
        result = value as A
        return true
      },
      access,
    )
    return result
  }
  for (const value of source) {
    if (predicate(value, index++)) return value
  }
  return undefined
}

export const findOrUndefined: {
  <A, B extends A>(source: Iterable<A>, predicate: Refinement<A, B>): B | undefined
  <A>(source: Iterable<A>, predicate: Predicate<A>): A | undefined
  <A, B extends A>(predicate: Refinement<A, B>): (source: Iterable<A>) => B | undefined
  <A>(predicate: Predicate<A>): (source: Iterable<A>) => A | undefined
} = function findOrUndefined(predicate: Predicate<unknown>, __df?: any): any {
  if (arguments.length >= 2) return (findOrUndefined as any)(__df)(predicate)
  return ((source: Iterable<unknown>) =>
  findOrUndefinedImpl(source, predicate)) as (...args: any[]) => any
} as any

const findImpl = <A>(source: Iterable<A>, predicate: Predicate<A>): Option<A> => {
  let index = 0
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    let result: Option<A> = none
    executePlan(
      plan,
      source,
      (value) => {
        if (!predicate(value as A, index++)) return false
        result = optionSome(value as A)
        return true
      },
      access,
    )
    return result
  }
  for (const value of source) {
    if (predicate(value, index++)) return optionSome(value)
  }
  return none
}

export const find: {
  <A, B extends A>(source: Iterable<A>, predicate: Refinement<A, B>): Option<B>
  <A>(source: Iterable<A>, predicate: Predicate<A>): Option<A>
  <A, B extends A>(predicate: Refinement<A, B>): (source: Iterable<A>) => Option<B>
  <A>(predicate: Predicate<A>): (source: Iterable<A>) => Option<A>
} = function find(predicate: Predicate<unknown>, __df?: any): any {
  if (arguments.length >= 2) return (find as any)(__df)(predicate)
  return ((source: Iterable<unknown>) =>
  findImpl(source, predicate)) as (...args: any[]) => any
} as any

const nthOrUndefinedImpl = <A>(source: Iterable<A>, index: number): A | undefined => {
  if (!Number.isSafeInteger(index) || index < 0) return undefined
  let current = 0
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    let result: A | undefined
    executePlan(
      plan,
      source,
      (value) => {
        if (current++ !== index) return false
        result = value as A
        return true
      },
      access,
    )
    return result
  }
  for (const value of source) {
    if (current++ === index) return value
  }
  return undefined
}

export const nthOrUndefined: {
  <A>(source: Iterable<A>, index: number): A | undefined
  (index: number): <A>(source: Iterable<A>) => A | undefined
} = function nthOrUndefined(index: any, __df?: any): any {
  if (arguments.length >= 2) return (nthOrUndefined as any)(__df)(index)
  return ((source) => nthOrUndefinedImpl(source, index)) as (...args: any[]) => any
} as any

const nthImpl = <A>(source: Iterable<A>, index: number): Option<A> => {
  if (!Number.isSafeInteger(index) || index < 0) return none
  let current = 0
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    let result: Option<A> = none
    executePlan(
      plan,
      source,
      (value) => {
        if (current++ !== index) return false
        result = optionSome(value as A)
        return true
      },
      access,
    )
    return result
  }
  for (const value of source) {
    if (current++ === index) return optionSome(value)
  }
  return none
}

export const nth: {
  <A>(source: Iterable<A>, index: number): Option<A>
  (index: number): <A>(source: Iterable<A>) => Option<A>
} = function nth(index: any, __df?: any): any {
  if (arguments.length >= 2) return (nth as any)(__df)(index)
  return ((source) =>
  nthImpl(source, index)) as (...args: any[]) => any
} as any

const someImpl = <A>(source: Iterable<A>, predicate: Predicate<A>): boolean => {
  let index = 0
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    let result = false
    executePlan(
      plan,
      source,
      (value) => {
        if (!predicate(value as A, index++)) return false
        result = true
        return true
      },
      access,
    )
    return result
  }
  for (const value of source) {
    if (predicate(value, index++)) return true
  }
  return false
}

export const some: {
  <A>(source: Iterable<A>, predicate: Predicate<A>): boolean
  <A>(predicate: Predicate<A>): (source: Iterable<A>) => boolean
} = function some(predicate: any, __df?: any): any {
  if (arguments.length >= 2) return (some as any)(__df)(predicate)
  return ((source) => someImpl(source, predicate)) as (...args: any[]) => any
} as any

const everyImpl = <A>(source: Iterable<A>, predicate: Predicate<A>): boolean => {
  let index = 0
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    let result = true
    executePlan(
      plan,
      source,
      (value) => {
        if (predicate(value as A, index++)) return false
        result = false
        return true
      },
      access,
    )
    return result
  }
  for (const value of source) {
    if (!predicate(value, index++)) return false
  }
  return true
}

export const every: {
  <A>(source: Iterable<A>, predicate: Predicate<A>): boolean
  <A>(predicate: Predicate<A>): (source: Iterable<A>) => boolean
} = function every(predicate: any, __df?: any): any {
  if (arguments.length >= 2) return (every as any)(__df)(predicate)
  return ((source) => everyImpl(source, predicate)) as (...args: any[]) => any
} as any

export const count = (source: Iterable<unknown>): number => {
  let total = 0
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    executePlan(
      plan,
      source,
      () => {
        total++
        return false
      },
      access,
    )
    return total
  }
  for (const _value of source) total++
  return total
}

const forEachImpl = <A>(source: Iterable<A>, effect: (value: A, index: number) => void): void => {
  let index = 0
  const plan = planOf(source)
  if (plan) {
    const access = inspectPlanSource(plan.source)
    executePlan(
      plan,
      source,
      (value) => {
        effect(value as A, index++)
        return false
      },
      access,
    )
    return
  }
  for (const value of source) effect(value, index++)
}

export const forEach: {
  <A>(source: Iterable<A>, effect: (value: A, index: number) => void): void
  <A>(effect: (value: A, index: number) => void): (source: Iterable<A>) => void
} = function forEach(effect: any, __df?: any): any {
  if (arguments.length >= 2) return (forEach as any)(__df)(effect)
  return ((source) => forEachImpl(source, effect)) as (...args: any[]) => any
} as any
