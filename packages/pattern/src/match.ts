import { capturesToObject, matchPatternInternal, type Captures } from './internal'
import { type Matched, type Pattern, type Selections, when as guard } from './pattern'

type RuntimeHandler = (value: unknown, selections: Readonly<Record<string, unknown>>) => unknown

interface RuntimeCase {
  readonly pattern: unknown
  readonly handler: RuntimeHandler
}

export interface MatchExpression<Input, Remaining = Input, Output = never> {
  with<const InputPattern extends Pattern<Remaining>, Next>(
    pattern: InputPattern,
    handler: (
      value: Matched<Remaining, InputPattern>,
      selections: Selections<Remaining, InputPattern>,
    ) => Next,
  ): MatchExpression<Input, Exclude<Remaining, Matched<Remaining, InputPattern>>, Output | Next>

  when<Narrowed extends Remaining, Next>(
    refinement: (value: Remaining) => value is Narrowed,
    handler: (value: Narrowed) => Next,
  ): MatchExpression<Input, Exclude<Remaining, Narrowed>, Output | Next>

  when<Next>(
    predicate: (value: Remaining) => boolean,
    handler: (value: Remaining) => Next,
  ): MatchExpression<Input, Remaining, Output | Next>

  otherwise<Next>(handler: (value: Remaining) => Next): Output | Next

  run(): Output | undefined

  readonly exhaustive: [Remaining] extends [never] ? () => Output : never
}

class RuntimeMatchExpression {
  readonly #input: unknown
  readonly #cases: readonly RuntimeCase[]

  constructor(input: unknown, cases: readonly RuntimeCase[] = []) {
    this.#input = input
    this.#cases = cases
  }

  with(pattern: unknown, handler: RuntimeHandler): RuntimeMatchExpression {
    return new RuntimeMatchExpression(this.#input, [...this.#cases, { pattern, handler }])
  }

  when(predicate: (value: never) => boolean, handler: RuntimeHandler): RuntimeMatchExpression {
    return this.with(guard(predicate), handler)
  }

  otherwise(handler: RuntimeHandler): unknown {
    const evaluated = this.#evaluate()
    return evaluated.matched
      ? evaluated.value
      : handler(this.#input, Object.create(null) as Readonly<Record<string, unknown>>)
  }

  run(): unknown {
    const evaluated = this.#evaluate()
    return evaluated.matched ? evaluated.value : undefined
  }

  exhaustive(): unknown {
    const evaluated = this.#evaluate()
    if (evaluated.matched) return evaluated.value
    throw new PatternMatchError(this.#input)
  }

  #evaluate(): { readonly matched: false } | { readonly matched: true; readonly value: unknown } {
    for (let index = 0; index < this.#cases.length; index++) {
      const candidate = this.#cases[index]
      const captures: Captures = []
      if (matchPatternInternal(candidate.pattern, this.#input, captures)) {
        return {
          matched: true,
          value: candidate.handler(this.#input, capturesToObject(captures)),
        }
      }
    }
    return { matched: false }
  }
}

export class PatternMatchError extends TypeError {
  readonly value: unknown

  constructor(value: unknown) {
    super(`No pattern matched ${describeValue(value)}`)
    this.name = 'PatternMatchError'
    this.value = value
  }
}

const describeValue = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value)
  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

export const match = <Input>(input: Input): MatchExpression<Input, Input, never> =>
  new RuntimeMatchExpression(input) as unknown as MatchExpression<Input, Input, never>

type PropertyTag = string | number | symbol

type DiscriminantValues<Union, Key extends PropertyKey> =
  Union extends Readonly<Record<Key, infer Value extends PropertyTag>> ? Value : never

export type DiscriminantHandlers<Union, Key extends PropertyKey> = {
  readonly [Value in DiscriminantValues<Union, Key>]: (
    value: Extract<Union, Readonly<Record<Key, Value>>>,
  ) => unknown
}

type HandlerOutput<Handlers> = ReturnType<
  Extract<Handlers[keyof Handlers], (...args: never[]) => unknown>
>

export const discriminant = <
  Key extends PropertyKey,
  Union extends Readonly<Record<Key, PropertyTag>>,
  const Handlers extends DiscriminantHandlers<Union, Key>,
>(
  key: Key,
  value: Union,
  handlers: Handlers,
): HandlerOutput<Handlers> => {
  const runtimeHandlers = handlers as unknown as Readonly<
    Record<PropertyTag, (candidate: unknown) => unknown>
  >
  const discriminantValue = value[key] as unknown as PropertyTag
  return runtimeHandlers[discriminantValue](value) as HandlerOutput<Handlers>
}

export type TagHandlers<Union extends { readonly _tag: PropertyTag }> = DiscriminantHandlers<
  Union,
  '_tag'
>

export const tag = <
  Union extends { readonly _tag: PropertyTag },
  const Handlers extends TagHandlers<Union>,
>(
  value: Union,
  handlers: Handlers,
): HandlerOutput<Handlers> => discriminant('_tag', value, handlers)

export type ValueHandlers<Input extends PropertyTag> = {
  readonly [Value in Input]: (value: Value) => unknown
}

export const value = <const Input extends PropertyTag, const Handlers extends ValueHandlers<Input>>(
  input: Input,
  handlers: Handlers,
): HandlerOutput<Handlers> =>
  (handlers as unknown as Readonly<Record<PropertyTag, (candidate: unknown) => unknown>>)[input](
    input,
  ) as HandlerOutput<Handlers>

export const valueOr = <
  const Input extends PropertyTag,
  const Handlers extends Partial<ValueHandlers<Input>>,
  Fallback,
>(
  input: Input,
  handlers: Handlers,
  otherwise: (value: Exclude<Input, keyof Handlers>) => Fallback,
): HandlerOutput<Handlers> | Fallback => {
  const handler = (
    handlers as unknown as Readonly<Partial<Record<PropertyTag, (candidate: unknown) => unknown>>>
  )[input]
  return handler
    ? (handler(input) as HandlerOutput<Handlers>)
    : otherwise(input as Exclude<Input, keyof Handlers>)
}

export const exhaustive = (value: never): never => {
  throw new PatternMatchError(value)
}
