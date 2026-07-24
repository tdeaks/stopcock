import {
  isStandardSchema,
  issue,
  issues,
  validate,
  validateSync,
} from '@stopcock/fp/schema'

export type {
  Issue as StandardSchemaIssue,
  StandardSchemaV1,
  StandardTypedV1,
} from '@stopcock/fp/schema'

/**
 * Standard Schema validation delegated directly to @stopcock/fp/schema.
 * These aliases exist to make an interop boundary read clearly at call sites.
 */
export const decodeStandardSchema: typeof validate = validate
export const decodeStandardSchemaSync: typeof validateSync = validateSync
export const isStandardSchemaV1: typeof isStandardSchema = isStandardSchema
export const standardSchemaIssue: typeof issue = issue
export const standardSchemaIssues: typeof issues = issues
