import { z, type ZodType, type infer as ZodInfer, type ZodError } from 'zod'
import {
  createValidators,
  type BoundAdapter,
  type ValidationIssue,
  type JsonSchema,
} from '@stopcock/server/validate'

const adapter: BoundAdapter<ZodType> = {
  parse: (schema, input) => schema.parseAsync(input),
  extractIssues: (error) => {
    const e = error as Partial<ZodError> & { name?: string }
    if (e?.name !== 'ZodError' || !Array.isArray(e.issues)) return null
    return e.issues.map((i): ValidationIssue => ({
      path: i.path.map((seg) => (typeof seg === 'symbol' ? seg.description ?? '' : seg)),
      message: i.message,
    }))
  },
  toJsonSchema: (schema) => z.toJSONSchema(schema) as JsonSchema,
}

const base = createValidators<ZodType>(adapter)

export const zod = {
  body:   <S extends ZodType>(schema: S) => base.body<ZodInfer<S>>(schema),
  query:  <S extends ZodType>(schema: S) => base.query<ZodInfer<S>>(schema),
  params: <S extends ZodType>(schema: S) => base.params<ZodInfer<S>>(schema),
}

export { adapter as zodAdapter }
