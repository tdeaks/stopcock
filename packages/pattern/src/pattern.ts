import {
  capturesToObject,
  matchPatternInternal,
  matcherSymbol,
  negativeSymbol,
  selectionSymbol,
  type Captures,
} from './internal'

export type Primitive = string | number | bigint | boolean | symbol | null | undefined

export interface Matcher<Matched = unknown> {
  readonly [matcherSymbol]: (value: unknown, captures: Captures) => boolean
  readonly __matched?: Matched
}

export interface SelectionMatcher<Name extends string, Inner> extends Matcher<Invert<Inner>> {
  readonly [selectionSymbol]: {
    readonly name: Name
    readonly inner: Inner
  }
}

export interface NegativeMatcher<Excluded> extends Matcher<unknown> {
  readonly [negativeSymbol]: Excluded
}

export type Pattern<Input = unknown> =
  | Primitive
  | Matcher<unknown>
  | (Input extends readonly (infer Item)[] ? readonly Pattern<Item>[] : never)
  | (Input extends object ? { readonly [Key in keyof Input]?: Pattern<Input[Key]> } : never)

export type Invert<P> =
  P extends SelectionMatcher<string, infer Inner>
    ? Invert<Inner>
    : P extends Matcher<infer Matched>
      ? Matched
      : P extends Primitive
        ? P
        : P extends readonly unknown[]
          ? { readonly [Key in keyof P]: Invert<P[Key]> }
          : P extends object
            ? { readonly [Key in keyof P]: Invert<P[Key]> }
            : never

export type Matched<Input, P> =
  P extends NegativeMatcher<infer Excluded>
    ? Exclude<Input, Excluded>
    : Input extends unknown
      ? Input & Invert<P>
      : never

type At<Input, Key extends PropertyKey> = Input extends unknown
  ? Key extends keyof Input
    ? Input[Key]
    : unknown
  : never

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never

type EmptySelections = Readonly<Record<never, never>>

type SelectionRecord<Input, P> =
  P extends SelectionMatcher<infer Name, infer Inner>
    ? Readonly<Record<Name, Matched<Input, Inner>>>
    : P extends Matcher<unknown>
      ? never
      : P extends readonly unknown[]
        ? {
            readonly [Key in keyof P]: SelectionRecord<At<Input, Key>, P[Key]>
          }[number]
        : P extends object
          ? {
              readonly [Key in keyof P]: SelectionRecord<At<Input, Key>, P[Key]>
            }[keyof P]
          : never

export type Selections<Input, P> = [SelectionRecord<Input, P>] extends [never]
  ? EmptySelections
  : {
      readonly [Key in keyof UnionToIntersection<SelectionRecord<Input, P>>]: UnionToIntersection<
        SelectionRecord<Input, P>
      >[Key]
    }

const makeMatcher = <Matched>(
  predicate: (value: unknown, captures: Captures) => boolean,
): Matcher<Matched> => ({ [matcherSymbol]: predicate })

export const any: Matcher<unknown> = makeMatcher(() => true)
export const _: Matcher<unknown> = any

export const string: Matcher<string> = makeMatcher((value) => typeof value === 'string')
export const number: Matcher<number> = makeMatcher((value) => typeof value === 'number')
export const finite: Matcher<number> = makeMatcher(
  (value) => typeof value === 'number' && Number.isFinite(value),
)
export const bigint: Matcher<bigint> = makeMatcher((value) => typeof value === 'bigint')
export const boolean: Matcher<boolean> = makeMatcher((value) => typeof value === 'boolean')
export const symbol: Matcher<symbol> = makeMatcher((value) => typeof value === 'symbol')
export const function_: Matcher<(...args: never[]) => unknown> = makeMatcher(
  (value) => typeof value === 'function',
)
export const object: Matcher<object> = makeMatcher(
  (value) => typeof value === 'object' && value !== null,
)
export const defined: Matcher<{}> = makeMatcher((value) => value !== null && value !== undefined)
export const nullish: Matcher<null | undefined> = makeMatcher(
  (value) => value === null || value === undefined,
)

export const literal = <const Values extends readonly Primitive[]>(
  ...values: Values
): Matcher<Values[number]> =>
  makeMatcher((value) => {
    for (let index = 0; index < values.length; index++) {
      if (Object.is(values[index], value)) return true
    }
    return false
  })

export const oneOf = literal

export function when<A, B extends A>(refinement: (value: A) => value is B): Matcher<B>
export function when<A>(predicate: (value: A) => boolean): Matcher<A>
export function when(predicate: (value: never) => boolean): Matcher<unknown> {
  return makeMatcher((value) => predicate(value as never))
}

export const guard: typeof when = when

export const instanceOf = <Instance>(
  constructor: abstract new (...args: never[]) => Instance,
): Matcher<Instance> => makeMatcher((value) => value instanceof constructor)

export function array(): Matcher<readonly unknown[]>
export function array<const ItemPattern>(item: ItemPattern): Matcher<readonly Invert<ItemPattern>[]>
export function array(item: unknown = any): Matcher<readonly unknown[]> {
  return makeMatcher((value, captures) => {
    if (!Array.isArray(value)) return false
    if (item === any) return true
    for (let index = 0; index < value.length; index++) {
      if (!matchPatternInternal(item, value[index], captures)) return false
    }
    return true
  })
}

export const tuple = <const Patterns extends readonly unknown[]>(
  ...patterns: Patterns
): Matcher<{ readonly [Key in keyof Patterns]: Invert<Patterns[Key]> }> =>
  makeMatcher((value, captures) => matchPatternInternal(patterns, value, captures))

export const record = <const Shape extends object>(shape: Shape): Matcher<Invert<Shape>> =>
  makeMatcher((value, captures) => matchPatternInternal(shape, value, captures))

export const strict = <const Shape extends object>(shape: Shape): Matcher<Invert<Shape>> =>
  makeMatcher((value, captures) => {
    if (typeof value !== 'object' || value === null) return false
    const shapeKeys = Reflect.ownKeys(shape).filter((key) =>
      Object.prototype.propertyIsEnumerable.call(shape, key),
    )
    const valueKeys = Reflect.ownKeys(value).filter((key) =>
      Object.prototype.propertyIsEnumerable.call(value, key),
    )
    return shapeKeys.length === valueKeys.length && matchPatternInternal(shape, value, captures)
  })

export const property = <const Key extends PropertyKey, const ValuePattern>(
  key: Key,
  pattern: ValuePattern,
): Matcher<Readonly<Record<Key, Invert<ValuePattern>>>> =>
  makeMatcher(
    (value, captures) =>
      (typeof value === 'object' || typeof value === 'function') &&
      value !== null &&
      Reflect.has(value, key) &&
      matchPatternInternal(pattern, Reflect.get(value, key), captures),
  )

export const optional = <const Inner>(pattern: Inner): Matcher<Invert<Inner> | undefined> =>
  makeMatcher(
    (value, captures) => value === undefined || matchPatternInternal(pattern, value, captures),
  )

export const nullable = <const Inner>(pattern: Inner): Matcher<Invert<Inner> | null> =>
  makeMatcher((value, captures) => value === null || matchPatternInternal(pattern, value, captures))

export const union = <const Patterns extends readonly unknown[]>(
  ...patterns: Patterns
): Matcher<Invert<Patterns[number]>> =>
  makeMatcher((value, captures) => {
    for (let index = 0; index < patterns.length; index++) {
      if (matchPatternInternal(patterns[index], value, captures)) return true
    }
    return false
  })

export const or = union

export const intersection = <const Patterns extends readonly unknown[]>(
  ...patterns: Patterns
): Matcher<UnionToIntersection<Invert<Patterns[number]>>> =>
  makeMatcher((value, captures) => {
    for (let index = 0; index < patterns.length; index++) {
      if (!matchPatternInternal(patterns[index], value, captures)) return false
    }
    return true
  })

export const and = intersection

export const not = <const Inner>(pattern: Inner): NegativeMatcher<Invert<Inner>> => {
  const matcher = makeMatcher((value, captures) => {
    const checkpoint = captures.length
    const matched = matchPatternInternal(pattern, value, captures)
    captures.length = checkpoint
    return !matched
  })
  return Object.assign(matcher, {
    [negativeSymbol]: undefined as unknown as Invert<Inner>,
  })
}

export function select(): SelectionMatcher<'selected', Matcher<unknown>>
export function select<const Name extends string>(
  name: Name,
): SelectionMatcher<Name, Matcher<unknown>>
export function select<const Name extends string, const Inner>(
  name: Name,
  pattern: Inner,
): SelectionMatcher<Name, Inner>
export function select(
  name = 'selected',
  pattern: unknown = any,
): SelectionMatcher<string, unknown> {
  return {
    [matcherSymbol]: (value, captures) => {
      if (!matchPatternInternal(pattern, value, captures)) return false
      captures.push({ key: name, value })
      return true
    },
    [selectionSymbol]: { name, inner: pattern },
  }
}

export const setOf = <const ItemPattern>(
  item: ItemPattern,
): Matcher<ReadonlySet<Invert<ItemPattern>>> =>
  makeMatcher((value, captures) => {
    if (!(value instanceof Set)) return false
    for (const itemValue of value) {
      if (!matchPatternInternal(item, itemValue, captures)) return false
    }
    return true
  })

export const mapOf = <const KeyPattern, const ValuePattern>(
  key: KeyPattern,
  value: ValuePattern,
): Matcher<ReadonlyMap<Invert<KeyPattern>, Invert<ValuePattern>>> =>
  makeMatcher((input, captures) => {
    if (!(input instanceof Map)) return false
    for (const [entryKey, entryValue] of input) {
      if (
        !matchPatternInternal(key, entryKey, captures) ||
        !matchPatternInternal(value, entryValue, captures)
      ) {
        return false
      }
    }
    return true
  })

export const test = <Input, const InputPattern extends Pattern<Input>>(
  pattern: InputPattern,
  value: Input,
): value is Matched<Input, InputPattern> => matchPatternInternal(pattern, value, [])

export const isMatching =
  <const InputPattern>(pattern: InputPattern) =>
  <Input>(value: Input): value is Matched<Input, InputPattern> =>
    matchPatternInternal(pattern, value, [])

export interface Extracted<Input, InputPattern> {
  readonly value: Matched<Input, InputPattern>
  readonly selections: Selections<Input, InputPattern>
}

export const extract = <Input, const InputPattern extends Pattern<Input>>(
  pattern: InputPattern,
  value: Input,
): Extracted<Input, InputPattern> | undefined => {
  const captures: Captures = []
  if (!matchPatternInternal(pattern, value, captures)) return undefined
  return {
    value: value as Matched<Input, InputPattern>,
    selections: capturesToObject(captures) as Selections<Input, InputPattern>,
  }
}

export function assert<Input, const InputPattern extends Pattern<Input>>(
  pattern: InputPattern,
  value: Input,
  message = 'Value did not match the expected pattern',
): asserts value is Matched<Input, InputPattern> {
  if (!test(pattern, value)) throw new TypeError(message)
}
