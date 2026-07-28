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

/**
 * Data-first/data-last arity dispatch.
 *
 * The `tag` parameter is accepted for source compatibility with callers
 * written against the old tagged form (a fused runtime engine once read
 * `_op`/`_fn`/`_a1`/`_a2` off the returned data-last closure to recognise a
 * trusted operator). That engine is gone: nothing in this package or its
 * build-time compiler reads those fields any more, so `tag` is now inert.
 * The typed overloads below still describe a tagged operator's shape for
 * any caller still typed against it; the runtime just never populates it.
 */
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
export function dual(arity: number, body: Function, _tag?: DualTag): unknown {
  if (arity <= 1) return body

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
  return function (...args: any[]) {
    if (args.length >= arity) return (body as any)(...args)
    return (data: any) => (body as any)(data, ...args)
  }
}
