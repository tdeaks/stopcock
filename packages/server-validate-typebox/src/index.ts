import type { TSchema, Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import {
  createValidators,
  ValidationError,
  type BoundAdapter,
  type ValidationIssue,
  type JsonSchema,
} from '@stopcock/server/validate'

// Tag sentinel so extractIssues can distinguish our own re-throw from
// foreign errors that happened to look TypeBox-ish.
const TB_TAG = Symbol.for('@stopcock/server-validate-typebox/issues')

const adapter: BoundAdapter<TSchema> = {
  parse: (schema, input) => {
    if (Value.Check(schema, input)) return Value.Decode(schema, input)
    const issues: ValidationIssue[] = []
    for (const err of Value.Errors(schema, input)) {
      issues.push({ path: pointerToPath(err.path), message: err.message })
    }
    const tagged = new Error('typebox validation failed') as Error & { [TB_TAG]?: ValidationIssue[] }
    tagged[TB_TAG] = issues
    throw tagged
  },
  extractIssues: (error) => {
    const e = error as { [TB_TAG]?: ValidationIssue[] } | null
    return e && e[TB_TAG] ? e[TB_TAG]! : null
  },
  toJsonSchema: (schema) => schema as unknown as JsonSchema,
}

// JSON Pointer ("/a/0/b") → ["a", 0, "b"] with numeric segments lifted to numbers.
const pointerToPath = (pointer: string): ReadonlyArray<string | number> => {
  if (!pointer) return []
  return pointer
    .slice(1)
    .split('/')
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg))
}

const base = createValidators<TSchema>(adapter)

export const typebox = {
  body:   <S extends TSchema>(schema: S) => base.body<Static<S>>(schema),
  query:  <S extends TSchema>(schema: S) => base.query<Static<S>>(schema),
  params: <S extends TSchema>(schema: S) => base.params<Static<S>>(schema),
}

export { adapter as typeboxAdapter, ValidationError }
