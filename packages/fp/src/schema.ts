import { err, isErr, ok, type Result } from './result'

export interface StandardTypedV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardTypedV1.Props<Input, Output>
}

export namespace StandardTypedV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1
    readonly vendor: string
    readonly types?: Types<Input, Output> | undefined
  }

  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input
    readonly output: Output
  }

  export type InferInput<Schema extends StandardTypedV1> = NonNullable<
    Schema['~standard']['types']
  >['input']

  export type InferOutput<Schema extends StandardTypedV1> = NonNullable<
    Schema['~standard']['types']
  >['output']
}

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>
}

export namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> extends StandardTypedV1.Props<
    Input,
    Output
  > {
    readonly validate: (
      value: unknown,
      options?: Options,
    ) => ValidationResult<Output> | Promise<ValidationResult<Output>>
  }

  export interface Options {
    readonly libraryOptions?: Record<string, unknown> | undefined
  }

  export type ValidationResult<Output> = SuccessResult<Output> | FailureResult

  export interface SuccessResult<Output> {
    readonly value: Output
    readonly issues?: undefined
  }

  export interface FailureResult {
    readonly issues: readonly Issue[]
  }

  export interface Issue {
    readonly message: string
    readonly path?: readonly (PropertyKey | PathSegment)[] | undefined
  }

  export interface PathSegment {
    readonly key: PropertyKey
  }

  export interface Types<Input = unknown, Output = Input> extends StandardTypedV1.Types<
    Input,
    Output
  > {}

  export type InferInput<Schema extends StandardTypedV1> = StandardTypedV1.InferInput<Schema>

  export type InferOutput<Schema extends StandardTypedV1> = StandardTypedV1.InferOutput<Schema>
}

export type Issue = StandardSchemaV1.Issue
export type IssueInput = string | Issue | readonly Issue[]
export type Decoder<Output> = (
  value: unknown,
) => Result<Output, IssueInput> | Promise<Result<Output, IssueInput>>

const isPromiseLike = <A>(value: unknown): value is PromiseLike<A> =>
  typeof value === 'object' &&
  value !== null &&
  'then' in value &&
  typeof (value as { readonly then?: unknown }).then === 'function'

const isIssue = (value: unknown): value is Issue =>
  typeof value === 'object' &&
  value !== null &&
  'message' in value &&
  typeof (value as { readonly message?: unknown }).message === 'string'

export function issue(
  message: string,
  path?: readonly (PropertyKey | StandardSchemaV1.PathSegment)[],
): Issue {
  return path === undefined ? { message } : { message, path }
}

export function issues(input: IssueInput): readonly Issue[] {
  if (typeof input === 'string') return [issue(input)]
  if (isIssue(input)) return [input]
  return input
}

const toValidationResult = <Output>(
  result: Result<Output, IssueInput>,
): StandardSchemaV1.ValidationResult<Output> =>
  isErr(result) ? { issues: issues(result.error) } : { value: result.value }

const fromValidationResult = <Output>(
  result: StandardSchemaV1.ValidationResult<Output>,
): Result<Output, readonly Issue[]> => (result.issues ? err(result.issues) : ok(result.value))

const decode = <Input, Output>(
  schema: StandardSchemaV1<Input, Output>,
  value: unknown,
): Result<Output, readonly Issue[]> | Promise<Result<Output, readonly Issue[]>> => {
  const validated = schema['~standard'].validate(value)
  return isPromiseLike(validated)
    ? Promise.resolve(validated).then(fromValidationResult)
    : fromValidationResult(validated)
}

export function make<Input = unknown, Output = Input>(
  decode: Decoder<Output>,
  vendor = '@stopcock/fp',
): StandardSchemaV1<Input, Output> {
  return {
    '~standard': {
      version: 1,
      vendor,
      validate(value) {
        const decoded = decode(value)
        return isPromiseLike<Result<Output, IssueInput>>(decoded)
          ? Promise.resolve(decoded).then(toValidationResult)
          : toValidationResult(decoded)
      },
    },
  }
}

export function fromPredicate<A, B extends A>(
  refinement: (value: A) => value is B,
  onFailure?: (value: A) => IssueInput,
): StandardSchemaV1<A, B>
export function fromPredicate<A>(
  predicate: (value: A) => boolean,
  onFailure?: (value: A) => IssueInput,
): StandardSchemaV1<A>
export function fromPredicate<A>(
  predicate: (value: A) => boolean,
  onFailure: (value: A) => IssueInput = () => 'Value did not satisfy the predicate',
): StandardSchemaV1<A> {
  return make((value) => (predicate(value as A) ? ok(value as A) : err(onFailure(value as A))))
}

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (typeof value !== 'object' || value === null || !('~standard' in value)) return false
  const standard = (value as { readonly '~standard'?: unknown })['~standard']
  return (
    typeof standard === 'object' &&
    standard !== null &&
    (standard as { readonly version?: unknown }).version === 1 &&
    typeof (standard as { readonly vendor?: unknown }).vendor === 'string' &&
    typeof (standard as { readonly validate?: unknown }).validate === 'function'
  )
}

export const validateSync: {
  <Input, Output>(
    value: unknown,
    schema: StandardSchemaV1<Input, Output>,
  ): Result<Output, readonly Issue[]>
  <Input, Output>(
    schema: StandardSchemaV1<Input, Output>,
  ): (value: unknown) => Result<Output, readonly Issue[]>
} = function validateSync<Input, Output>(
  schema: StandardSchemaV1<Input, Output>,
  __df?: any,
): Result<Output, readonly Issue[]> | ((value: unknown) => Result<Output, readonly Issue[]>) {
  if (arguments.length >= 2) return (validateSync as any)(__df as StandardSchemaV1<Input, Output>)(schema)
  return (value: unknown): Result<Output, readonly Issue[]> => {
    const decoded = decode(schema, value)
    if (isPromiseLike(decoded)) {
      throw new TypeError('validateSync: schema validation returned a Promise')
    }
    return decoded
  }
} as any

export const validate: {
  <Input, Output>(
    value: unknown,
    schema: StandardSchemaV1<Input, Output>,
  ): Promise<Result<Output, readonly Issue[]>>
  <Input, Output>(
    schema: StandardSchemaV1<Input, Output>,
  ): (value: unknown) => Promise<Result<Output, readonly Issue[]>>
} = function validate<Input, Output>(
  schema: StandardSchemaV1<Input, Output>,
  __df?: any,
):
  | Promise<Result<Output, readonly Issue[]>>
  | ((value: unknown) => Promise<Result<Output, readonly Issue[]>>) {
  if (arguments.length >= 2) return (validate as any)(__df as StandardSchemaV1<Input, Output>)(schema)
  return async (value: unknown): Promise<Result<Output, readonly Issue[]>> =>
    Promise.resolve(decode(schema, value))
} as any

const mapImpl = <Input, A, B>(
  schema: StandardSchemaV1<Input, A>,
  transform: (value: A) => B,
): StandardSchemaV1<Input, B> => {
  const transformResult = (decoded: Result<A, readonly Issue[]>): Result<B, readonly Issue[]> =>
    isErr(decoded) ? decoded : ok(transform(decoded.value))
  return make((value) => {
    const result = decode(schema, value)
    return isPromiseLike(result)
      ? Promise.resolve(result).then(transformResult)
      : transformResult(result)
  }, schema['~standard'].vendor)
}

export function map<Input, A, B>(
  schema: StandardSchemaV1<Input, A>,
  transform: (value: A) => B,
): StandardSchemaV1<Input, B>
export function map<A, B>(
  transform: (value: A) => B,
): <Input>(schema: StandardSchemaV1<Input, A>) => StandardSchemaV1<Input, B>
export function map<Input, A, B>(
  schemaOrTransform: StandardSchemaV1<Input, A> | ((value: A) => B),
  maybeTransform?: (value: A) => B,
):
  | StandardSchemaV1<Input, B>
  | ((schema: StandardSchemaV1<Input, A>) => StandardSchemaV1<Input, B>) {
  if (arguments.length >= 2) {
    return mapImpl(
      schemaOrTransform as StandardSchemaV1<Input, A>,
      maybeTransform as (value: A) => B,
    )
  }
  const transform = schemaOrTransform as (value: A) => B
  return (schema: StandardSchemaV1<Input, A>): StandardSchemaV1<Input, B> =>
    mapImpl(schema, transform)
}

export function optional<Input, Output>(
  schema: StandardSchemaV1<Input, Output>,
): StandardSchemaV1<Input | undefined, Output | undefined> {
  return make(
    (value) => (value === undefined ? ok(undefined) : decode(schema, value)),
    schema['~standard'].vendor,
  )
}

export function nullable<Input, Output>(
  schema: StandardSchemaV1<Input, Output>,
): StandardSchemaV1<Input | null, Output | null> {
  return make(
    (value) => (value === null ? ok(null) : decode(schema, value)),
    schema['~standard'].vendor,
  )
}
