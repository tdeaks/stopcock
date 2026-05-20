export type JsonSchema = Record<string, unknown>

export type ValidationIssue = {
  readonly path: ReadonlyArray<string | number>
  readonly message: string
}

export class ValidationError extends Error {
  readonly _tag = 'ValidationError' as const
  constructor(
    readonly source: 'body' | 'query' | 'params',
    readonly issues: ReadonlyArray<ValidationIssue>,
    readonly cause?: unknown,
  ) {
    super(`${source} validation failed`)
  }
}

export interface SchemaAdapter<S = unknown> {
  parse<T>(schema: S, input: unknown): T | Promise<T>
  toJsonSchema?(schema: S): JsonSchema
}

export type Infer<A, S> =
  A extends { parse: (schema: S, input: unknown) => infer R | Promise<infer R> } ? R : never
