import { OP_CODES, OP_NON_FUSEABLE } from './opcodes'

export interface DualTag {
  readonly op: string
}

export interface TaggedOperation {
  readonly _op: number
}

type TaggedArguments<Args extends readonly unknown[]> = Args extends readonly [
  infer Fn,
  infer A1,
  infer A2,
  ...(readonly unknown[]),
]
  ? {
      readonly _fn: Fn
      readonly _a1: A1
      readonly _a2: A2
    }
  : Args extends readonly [infer Fn, infer A1, ...(readonly unknown[])]
    ? {
        readonly _fn: Fn
        readonly _a1: A1
      }
    : Args extends readonly [infer Fn, ...(readonly unknown[])]
      ? {
          readonly _fn: Fn
        }
      : object

export type TaggedDataLast<Data, Args extends readonly unknown[], Result> = ((
  data: Data,
) => Result) &
  TaggedOperation &
  TaggedArguments<Args>

export type DualOperation<Data, Args extends readonly unknown[], Result> = {
  (data: Data, ...args: Args): Result
  (...args: Args): (data: Data) => Result
}

export type TaggedDualOperation<Data, Args extends readonly unknown[], Result> = {
  (data: Data, ...args: Args): Result
  (...args: Args): TaggedDataLast<Data, Args, Result>
}

export type TaggedUnaryOperation<Data, Result> = ((data: Data) => Result) & TaggedOperation

type AnyFunction = (...args: never[]) => unknown
type ArityMatch<
  Body extends AnyFunction,
  Arity extends number,
> = Parameters<Body>['length'] extends Arity ? unknown : never
type DataParameter<Body extends AnyFunction> = Parameters<Body>[0]
type RemainingParameters<Body extends AnyFunction> =
  Parameters<Body> extends readonly [unknown, ...infer Rest] ? Readonly<Rest> : never
type AtLeastFiveParameters<Body extends AnyFunction> =
  Parameters<Body> extends readonly [unknown, unknown, unknown, unknown, unknown, ...unknown[]]
    ? unknown
    : never

export function dual<Body extends AnyFunction>(
  arity: 1 & ArityMatch<Body, 1>,
  body: Body,
  tag: DualTag,
): TaggedUnaryOperation<DataParameter<Body>, ReturnType<Body>>
export function dual<Body extends AnyFunction>(
  arity: 1 & ArityMatch<Body, 1>,
  body: Body,
): (data: DataParameter<Body>) => ReturnType<Body>
export function dual<Body extends AnyFunction>(
  arity: 2 & ArityMatch<Body, 2>,
  body: Body,
  tag: DualTag,
): TaggedDualOperation<DataParameter<Body>, RemainingParameters<Body>, ReturnType<Body>>
export function dual<Body extends AnyFunction>(
  arity: 2 & ArityMatch<Body, 2>,
  body: Body,
): DualOperation<DataParameter<Body>, RemainingParameters<Body>, ReturnType<Body>>
export function dual<Body extends AnyFunction>(
  arity: 3 & ArityMatch<Body, 3>,
  body: Body,
  tag: DualTag,
): TaggedDualOperation<DataParameter<Body>, RemainingParameters<Body>, ReturnType<Body>>
export function dual<Body extends AnyFunction>(
  arity: 3 & ArityMatch<Body, 3>,
  body: Body,
): DualOperation<DataParameter<Body>, RemainingParameters<Body>, ReturnType<Body>>
export function dual<Body extends AnyFunction>(
  arity: 4 & ArityMatch<Body, 4>,
  body: Body,
  tag: DualTag,
): TaggedDualOperation<DataParameter<Body>, RemainingParameters<Body>, ReturnType<Body>>
export function dual<Body extends AnyFunction>(
  arity: 4 & ArityMatch<Body, 4>,
  body: Body,
): DualOperation<DataParameter<Body>, RemainingParameters<Body>, ReturnType<Body>>
export function dual<Body extends AnyFunction>(
  arity: Parameters<Body>['length'] & AtLeastFiveParameters<Body>,
  body: Body,
  tag: DualTag,
): TaggedDualOperation<DataParameter<Body>, RemainingParameters<Body>, ReturnType<Body>>
export function dual<Body extends AnyFunction>(
  arity: Parameters<Body>['length'] & AtLeastFiveParameters<Body>,
  body: Body,
): DualOperation<DataParameter<Body>, RemainingParameters<Body>, ReturnType<Body>>
export function dual(arity: number, body: Function, tag?: DualTag): unknown {
  const opcode = tag ? (OP_CODES[tag.op] ?? OP_NON_FUSEABLE) : 0

  if (tag) {
    if (arity <= 1) {
      // Arity-1 tagged: tag the body directly, skip wrapper
      ;(body as any)._op = opcode
      return body
    }
    if (arity === 2) {
      return function () {
        if (arguments.length >= 2) return body(arguments[0], arguments[1])
        const a0 = arguments[0]
        const dataLast = (data: any) => body(data, a0)
        dataLast._op = opcode
        dataLast._fn = a0
        // No _args allocation. Fusion engine reads _fn directly
        return dataLast
      }
    }
    if (arity === 3) {
      return function () {
        if (arguments.length >= 3) return body(arguments[0], arguments[1], arguments[2])
        const a0 = arguments[0],
          a1 = arguments[1]
        const dataLast = (data: any) => body(data, a0, a1)
        dataLast._op = opcode
        dataLast._fn = a0
        dataLast._a1 = a1 // direct property, no array allocation
        return dataLast
      }
    }
    if (arity === 4) {
      return function () {
        if (arguments.length >= 4)
          return body(arguments[0], arguments[1], arguments[2], arguments[3])
        const a0 = arguments[0],
          a1 = arguments[1],
          a2 = arguments[2]
        const dataLast = (data: any) => body(data, a0, a1, a2)
        dataLast._op = opcode
        dataLast._fn = a0
        dataLast._a1 = a1
        dataLast._a2 = a2
        return dataLast
      }
    }
  }

  if (arity === 2) {
    return function () {
      if (arguments.length >= 2) return body(arguments[0], arguments[1])
      const a0 = arguments[0]
      return (data: any) => body(data, a0)
    }
  }

  if (arity === 3) {
    return function () {
      if (arguments.length >= 3) return body(arguments[0], arguments[1], arguments[2])
      const a0 = arguments[0],
        a1 = arguments[1]
      return (data: any) => body(data, a0, a1)
    }
  }

  if (arity === 4) {
    return function () {
      if (arguments.length >= 4) return body(arguments[0], arguments[1], arguments[2], arguments[3])
      const a0 = arguments[0],
        a1 = arguments[1],
        a2 = arguments[2]
      return (data: any) => body(data, a0, a1, a2)
    }
  }

  // Generic fallback (arity 5+)
  const wrapper = function (...args: any[]) {
    if (args.length >= arity) return (body as any)(...args)
    const dataLast = (data: any) => (body as any)(data, ...args)
    if (tag) {
      dataLast._op = opcode
      dataLast._fn = args[0]
      dataLast._a1 = args[1]
      dataLast._a2 = args[2]
    }
    return dataLast
  }
  if (tag && arity <= 1) {
    wrapper._op = opcode
  }
  return wrapper
}
