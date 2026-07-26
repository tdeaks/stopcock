import { flow, none, pipe } from '@stopcock/fp'
// S8 moved compile off the root. The harness follows the final import map so a
// fixture exercises what a consumer would actually write.
import { compile, compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
import { transformStopcockPipelines } from '../transform'
import type { StopcockCompilerOptions, TransformResult } from '../types'

const ROOT_RUNTIME = { pipe, flow, compile, compilePure }
const RUNTIME: Record<string, unknown> = {
  ...ROOT_RUNTIME,
  ...A,
  A,
}
// A namespace-import fixture (`import * as FP from '@stopcock/fp'`) binds
// its local to the root module namespace. Array operators live in a separate
// namespace fixture so the harness mirrors the public package export map.
RUNTIME.FP = ROOT_RUNTIME

const IMPORT_LINE_RE = /^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm

function stripImports(code: string): string {
  return code.replace(IMPORT_LINE_RE, '')
}

export interface Fixture {
  readonly name: string
  /** Import statement(s), e.g. root `pipe` plus operators from `/array`. */
  readonly imports: string
  /** local name -> canonical runtime export name */
  readonly locals: Record<string, string>
  /** Body text; must contain exactly one `return <expr>;` statement. */
  readonly body: string
  readonly expectTransformed: boolean
  readonly reasonIncludes?: string
  readonly options?: StopcockCompilerOptions
}

export interface RunResult {
  readonly value: unknown
  readonly error?: unknown
}

function runWrapped(
  wrappedCode: string,
  paramNames: readonly string[],
  paramValues: readonly unknown[],
): RunResult {
  const strippedBody = stripImports(wrappedCode)
  const call = `${strippedBody}\nreturn __fixture();`
  const noneAlias = wrappedCode.match(/import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u)?.[1]
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(...paramNames, ...(noneAlias ? [noneAlias] : []), call)
    return { value: fn(...paramValues, ...(noneAlias ? [none] : [])) }
  } catch (error) {
    return { value: undefined, error }
  }
}

export interface CompareResult {
  readonly transformed: boolean
  readonly reason?: string
  readonly map: TransformResult['map']
  readonly original: RunResult
  readonly compiled: RunResult
}

/**
 * Runs a fixture's body twice -- once as written, once with its pipe() call
 * site fused by the compiler -- feeding both runs identical extra bindings
 * (e.g. a shared side-effect log array), and returns both outcomes for the
 * caller to compare.
 */
export function runFixture(
  fixture: Fixture,
  makeExtra: () => Record<string, unknown> = () => ({}),
): CompareResult {
  const localNames = Object.keys(fixture.locals)

  function build(extra: Record<string, unknown>) {
    const paramNames = [...localNames, ...Object.keys(extra)]
    // Imported identifiers stay free in the fixture body, as they would in
    // real module code. new Function supplies equivalent outer bindings only
    // after the imports have been stripped for runtime comparison.
    const fullSource = `${fixture.imports}\nfunction __fixture() {\n${fixture.body}\n}\n`
    return { fullSource, paramNames }
  }

  const probe = build(makeExtra())
  const result = transformStopcockPipelines(probe.fullSource, `${fixture.name}.ts`, {
    diagnostics: 'verbose',
    ...fixture.options,
  })
  const transformed = result.code !== probe.fullSource
  const site = result.diagnostics[result.diagnostics.length - 1]
  if (transformed !== fixture.expectTransformed) {
    throw new Error(
      `${fixture.name}: expected transformed=${fixture.expectTransformed}, received ${transformed}${
        site?.reason === undefined ? '' : ` (${site.reason})`
      }`,
    )
  }

  const originalExtra = makeExtra()
  const originalBuilt = build(originalExtra)
  const originalValues = [
    ...localNames.map((k) => RUNTIME[fixture.locals[k]]),
    ...Object.values(originalExtra),
  ]
  const original = runWrapped(originalBuilt.fullSource, originalBuilt.paramNames, originalValues)

  const compiledExtra = makeExtra()
  const compiledValues = [
    ...localNames.map((k) => RUNTIME[fixture.locals[k]]),
    ...Object.values(compiledExtra),
  ]
  const compiledSource =
    result.code === probe.fullSource ? build(compiledExtra).fullSource : result.code
  const compiledParamNames = build(compiledExtra).paramNames
  const compiled = runWrapped(compiledSource, compiledParamNames, compiledValues)

  return { transformed, reason: site?.reason, map: result.map, original, compiled }
}
