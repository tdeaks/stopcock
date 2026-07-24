export const identity = <A>(value: A): A => value

export const always =
  <A>(value: A) =>
  (): A =>
    value

export const noop = (): void => undefined

export const apply =
  <Args extends readonly unknown[], A>(...args: Args) =>
  (fn: (...args: Args) => A): A =>
    fn(...args)

export const flip =
  <A, B, C>(fn: (left: A, right: B) => C) =>
  (right: B, left: A): C =>
    fn(left, right)

export const complement =
  <Args extends readonly unknown[]>(predicate: (...args: Args) => boolean) =>
  (...args: Args): boolean =>
    !predicate(...args)

export const tap =
  <A>(effect: (value: A) => void) =>
  (value: A): A => {
    effect(value)
    return value
  }

type AnyFunction = (...args: never[]) => unknown

type ComposeResult<Fns extends readonly AnyFunction[]> = Fns extends readonly [
  ...(readonly AnyFunction[]),
  infer Last extends AnyFunction,
]
  ? ReturnType<Last>
  : never

type ComposeInput<Fns extends readonly AnyFunction[]> = Fns extends readonly [
  infer First extends AnyFunction,
  ...(readonly AnyFunction[]),
]
  ? Parameters<First>
  : never

export function compose<A, B>(first: (value: A) => B): (value: A) => B
export function compose<A, B, C>(last: (value: B) => C, first: (value: A) => B): (value: A) => C
export function compose<A, B, C, D>(
  last: (value: C) => D,
  middle: (value: B) => C,
  first: (value: A) => B,
): (value: A) => D
export function compose<const Fns extends readonly [AnyFunction, ...AnyFunction[]]>(
  ...fns: Fns
): (...args: ComposeInput<Fns>) => ComposeResult<Fns>
export function compose(
  ...fns: readonly ((value: unknown) => unknown)[]
): (value: unknown) => unknown {
  // Keep the overwhelmingly common short compositions monomorphic. Indexed
  // calls deliberately retain the existing receiver semantics (`this ===
  // fns`) for callbacks that observe their receiver.
  switch (fns.length) {
    case 0:
      return (input: unknown): unknown => input
    case 1:
      return (input: unknown): unknown => fns[0](input)
    case 2:
      return (input: unknown): unknown => fns[0](fns[1](input))
    case 3:
      return (input: unknown): unknown => fns[0](fns[1](fns[2](input)))
    case 4:
      return (input: unknown): unknown => fns[0](fns[1](fns[2](fns[3](input))))
    case 5:
      return (input: unknown): unknown =>
        fns[0](fns[1](fns[2](fns[3](fns[4](input)))))
  }
  return (input: unknown): unknown => {
    let value = input
    for (let index = fns.length - 1; index >= 0; index--) value = fns[index](value)
    return value
  }
}

type Curried<Args extends readonly unknown[], Output> = Args extends readonly [
  infer Head,
  ...infer Tail,
]
  ? (value: Head) => Curried<Tail, Output>
  : Output

export function curry<Args extends readonly unknown[], Output>(
  fn: (...args: Args) => Output,
): Curried<Args, Output> {
  const invoke = fn as (...args: readonly unknown[]) => Output
  switch (fn.length) {
    case 0:
      return invoke() as Curried<Args, Output>
    case 1:
      return ((first: unknown) => invoke(first)) as Curried<Args, Output>
    case 2:
      return ((first: unknown) => (second: unknown) => invoke(first, second)) as Curried<
        Args,
        Output
      >
    case 3:
      return ((first: unknown) => (second: unknown) => (third: unknown) =>
        invoke(first, second, third)) as Curried<Args, Output>
    case 4:
      return ((first: unknown) => (second: unknown) => (third: unknown) => (fourth: unknown) =>
        invoke(first, second, third, fourth)) as Curried<Args, Output>
    case 5:
      return ((first: unknown) => (second: unknown) => (third: unknown) => (fourth: unknown) =>
        (fifth: unknown) =>
          invoke(first, second, third, fourth, fifth)) as Curried<Args, Output>
  }
  const next = (received: readonly unknown[]): unknown =>
    received.length >= fn.length
      ? fn(...(received as Args))
      : (value: unknown) => next([...received, value])
  return next([]) as Curried<Args, Output>
}

export const uncurry =
  <Args extends readonly unknown[], Output>(fn: Curried<Args, Output>) =>
  (...args: Args): Output => {
    let current: unknown = fn
    for (const arg of args) current = (current as (value: unknown) => unknown)(arg)
    return current as Output
  }

type Drop<
  Values extends readonly unknown[],
  Count extends readonly unknown[],
> = Count extends readonly [unknown, ...infer Rest]
  ? Values extends readonly [unknown, ...infer Tail]
    ? Drop<Tail, Rest>
    : readonly []
  : Values

export function partial<Args extends readonly unknown[], Output, Prefix extends readonly unknown[]>(
  fn: (...args: Args) => Output,
  ...prefix: Prefix
): (...rest: Drop<Args, Prefix>) => Output {
  return (...rest: Drop<Args, Prefix>): Output => fn(...([...prefix, ...rest] as unknown as Args))
}

export function partialRight<
  Args extends readonly unknown[],
  Output,
  Suffix extends readonly unknown[],
>(fn: (...args: Args) => Output, ...suffix: Suffix): (...prefix: Drop<Args, Suffix>) => Output {
  return (...prefix: Drop<Args, Suffix>): Output =>
    fn(...([...prefix, ...suffix] as unknown as Args))
}

export const tupled =
  <Args extends readonly unknown[], Output>(fn: (...args: Args) => Output) =>
  (args: Args): Output =>
    fn(...args)

export const untupled =
  <Args extends readonly unknown[], Output>(fn: (args: Args) => Output) =>
  (...args: Args): Output =>
    fn(args)

interface CacheNode {
  readonly primitive: Map<unknown, CacheNode>
  readonly object: WeakMap<object, CacheNode>
  hasValue: boolean
  value: unknown
}

const cacheNode = (): CacheNode => ({
  primitive: new Map(),
  object: new WeakMap(),
  hasValue: false,
  value: undefined,
})

const childNode = (node: CacheNode, key: unknown): CacheNode => {
  if ((typeof key === 'object' && key !== null) || typeof key === 'function') {
    const objectKey = key as object
    const cached = node.object.get(objectKey)
    if (cached) return cached
    const child = cacheNode()
    node.object.set(objectKey, child)
    return child
  }
  const cached = node.primitive.get(key)
  if (cached) return cached
  const child = cacheNode()
  node.primitive.set(key, child)
  return child
}

export type Memoized<Fn extends AnyFunction> = Fn & { readonly clear: () => void }

export interface MemoizeOptions<Args extends readonly unknown[], Output, Key = unknown> {
  readonly resolver?: (...args: Args) => Key
  readonly cache?: Map<Key, Output>
}

export function memoize<Args extends readonly unknown[], Output, Key = unknown>(
  fn: (...args: Args) => Output,
  options: MemoizeOptions<Args, Output, Key> = {},
): Memoized<(...args: Args) => Output> {
  let root = cacheNode()
  const resolvedCache = options.cache ?? new Map<Key, Output>()

  const memoized = function (this: unknown, ...args: Args): Output {
    if (options.resolver) {
      const key = options.resolver(...args)
      if (resolvedCache.has(key)) return resolvedCache.get(key) as Output
      const value = Reflect.apply(fn, this, args) as Output
      resolvedCache.set(key, value)
      return value
    }

    let node = childNode(root, this)
    for (const arg of args) node = childNode(node, arg)
    if (node.hasValue) return node.value as Output
    const value = Reflect.apply(fn, this, args) as Output
    node.value = value
    node.hasValue = true
    return value
  }

  Object.defineProperty(memoized, 'clear', {
    value: (): void => {
      root = cacheNode()
      resolvedCache.clear()
    },
    enumerable: false,
  })

  return memoized as Memoized<(...args: Args) => Output>
}

export function once<Args extends readonly unknown[], Output>(
  fn: (...args: Args) => Output,
): Memoized<(...args: Args) => Output> {
  let completed = false
  let value: Output
  const wrapped = (...args: Args): Output => {
    if (completed) return value
    const next = fn(...args)
    value = next
    completed = true
    return next
  }
  Object.defineProperty(wrapped, 'clear', {
    value: (): void => {
      completed = false
    },
    enumerable: false,
  })
  return wrapped as Memoized<(...args: Args) => Output>
}

type JuxtValues<Fns extends readonly AnyFunction[]> = {
  readonly [K in keyof Fns]: ReturnType<Fns[K]>
}

export function juxt<const Fns extends readonly AnyFunction[]>(
  ...fns: Fns
): (...args: Parameters<Fns[number]>) => JuxtValues<Fns> {
  return (...args: Parameters<Fns[number]>): JuxtValues<Fns> =>
    fns.map((fn) => fn(...args)) as JuxtValues<Fns>
}

export function converge<Branches extends readonly AnyFunction[], Output>(
  combine: (...values: JuxtValues<Branches>) => Output,
  branches: Branches,
): (...args: Parameters<Branches[number]>) => Output {
  return (...args: Parameters<Branches[number]>): Output =>
    combine(...(branches.map((branch) => branch(...args)) as JuxtValues<Branches>))
}

export const ifElse =
  <Args extends readonly unknown[], A, B>(
    predicate: (...args: Args) => boolean,
    onTrue: (...args: Args) => A,
    onFalse: (...args: Args) => B,
  ) =>
  (...args: Args): A | B =>
    predicate(...args) ? onTrue(...args) : onFalse(...args)

interface SpecObject<Args extends readonly unknown[]> {
  readonly [key: string]: SpecNode<Args>
  readonly [key: symbol]: SpecNode<Args>
}

type SpecNode<Args extends readonly unknown[]> = ((...args: Args) => unknown) | SpecObject<Args>

type SpecResult<Node> = Node extends (...args: never[]) => infer Output
  ? Output
  : Node extends Readonly<Record<PropertyKey, unknown>>
    ? { readonly [K in keyof Node]: SpecResult<Node[K]> }
    : never

export function applySpec<
  Args extends readonly unknown[],
  Spec extends Readonly<Record<PropertyKey, SpecNode<Args>>>,
>(spec: Spec): (...args: Args) => SpecResult<Spec> {
  const evaluate = (node: SpecNode<Args>, args: Args): unknown => {
    if (typeof node === 'function') return node(...args)
    const output: Record<PropertyKey, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(node)) {
      if (!Object.prototype.propertyIsEnumerable.call(node, key)) continue
      output[key] = evaluate(node[key], args)
    }
    return output
  }
  return (...args: Args): SpecResult<Spec> => evaluate(spec, args) as SpecResult<Spec>
}
