import { defineMiddleware } from '../../middleware/define'
import type { Middleware } from '../../middleware/define'
import type { Ctx } from '../../router/types'
import { ValidationError, type JsonSchema, type ValidationIssue } from './adapter'

export interface BoundAdapter<S> {
  parse(schema: S, input: unknown): unknown | Promise<unknown>
  /** Return null when the error didn't come from this adapter so it can rethrow as-is. */
  extractIssues(error: unknown): ReadonlyArray<ValidationIssue> | null
  toJsonSchema?(schema: S): JsonSchema
}

/** Codegen consumers read `mw.meta?.[VALIDATE_META_KEY] as ValidateMeta`. */
export const VALIDATE_META_KEY = 'stopcock.validate' as const

export type ValidateMeta = {
  readonly source: 'body' | 'query' | 'params'
  readonly toJsonSchema?: () => JsonSchema
}

export type Validators<S> = {
  body<T = unknown>(schema: S): Middleware<{ body: T }, ValidationError>
  query<T = unknown>(schema: S): Middleware<{ query: T }, ValidationError>
  params<T = unknown>(schema: S): Middleware<{ params: T }, ValidationError>
}

const parseQuery = (url: string): Record<string, string | string[]> => {
  const q = url.indexOf('?')
  if (q < 0) return {}
  const out: Record<string, string | string[]> = {}
  const sp = new URLSearchParams(url.slice(q + 1))
  for (const [k, v] of sp) {
    const prev = out[k]
    if (prev === undefined) out[k] = v
    else if (Array.isArray(prev)) prev.push(v)
    else out[k] = [prev, v]
  }
  return out
}

const runParse = async <S>(
  adapter: BoundAdapter<S>,
  source: 'body' | 'query' | 'params',
  schema: S,
  raw: unknown,
): Promise<unknown> => {
  try {
    return await adapter.parse(schema, raw)
  } catch (e) {
    const issues = adapter.extractIssues(e)
    if (!issues) throw e
    throw new ValidationError(source, issues, e)
  }
}

const metaFor = <S>(adapter: BoundAdapter<S>, source: ValidateMeta['source'], schema: S) => {
  const m: ValidateMeta = adapter.toJsonSchema
    ? { source, toJsonSchema: () => adapter.toJsonSchema!(schema) }
    : { source }
  return { [VALIDATE_META_KEY]: m }
}

export const createValidators = <S>(adapter: BoundAdapter<S>): Validators<S> => ({
  body: <T>(schema: S) =>
    defineMiddleware<{ body: T }, ValidationError>(async (ctx: Ctx) => {
      let raw: unknown
      try { raw = await ctx.request.json() }
      catch { throw new ValidationError('body', [{ path: [], message: 'invalid JSON' }]) }
      return { body: (await runParse(adapter, 'body', schema, raw)) as T }
    }).withMeta(metaFor(adapter, 'body', schema)),

  query: <T>(schema: S) =>
    defineMiddleware<{ query: T }, ValidationError>(async (ctx: Ctx) => {
      const raw = parseQuery(ctx.request.url)
      return { query: (await runParse(adapter, 'query', schema, raw)) as T }
    }).withMeta(metaFor(adapter, 'query', schema)),

  params: <T>(schema: S) =>
    defineMiddleware<{ params: T }, ValidationError>(async (ctx: Ctx) => {
      return { params: (await runParse(adapter, 'params', schema, ctx.params)) as T }
    }).withMeta(metaFor(adapter, 'params', schema)),
})
