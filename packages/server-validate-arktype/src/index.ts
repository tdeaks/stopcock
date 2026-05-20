import { type, ArkErrors, type Type } from 'arktype'
import {
  createValidators,
  type BoundAdapter,
  type ValidationIssue,
  type JsonSchema,
} from '@stopcock/server/validate'

// Arktype is sync: calling the type returns either the data or an ArkErrors
// instance. We throw the ArkErrors so extractIssues can rehydrate it later.
const adapter: BoundAdapter<Type<any>> = {
  parse: (schema, input) => {
    const out = schema(input)
    if (out instanceof ArkErrors) throw out
    return out
  },
  extractIssues: (error) => {
    if (!(error instanceof ArkErrors)) return null
    const issues: ValidationIssue[] = []
    for (const e of error) {
      const path = (e.path as ReadonlyArray<PropertyKey>).map((seg) =>
        typeof seg === 'symbol' ? seg.description ?? '' : (seg as string | number),
      )
      issues.push({ path, message: e.message })
    }
    return issues
  },
  toJsonSchema: (schema) => schema.toJsonSchema() as JsonSchema,
}

const base = createValidators<Type<any>>(adapter)

export const arktype = {
  body:   <S extends Type<any>>(schema: S) => base.body<type.infer<S>>(schema),
  query:  <S extends Type<any>>(schema: S) => base.query<type.infer<S>>(schema),
  params: <S extends Type<any>>(schema: S) => base.params<type.infer<S>>(schema),
}

export { adapter as arktypeAdapter }
