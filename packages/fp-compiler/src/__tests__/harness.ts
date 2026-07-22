import { A, M, N, compile, flow, pipe } from '@stopcock/fp'
import { transformStopcockPipelines } from '../transform'
import type { StopcockCompilerOptions } from '../types'

const RUNTIME: Record<string, unknown> = { pipe, A, M, N, flow, compile }
// A namespace-import fixture (`import * as FP from '@stopcock/fp'`) binds
// its local to the whole module namespace; RUNTIME already has the shape
// FP.pipe/FP.A/etc need, so it doubles as that namespace object.
RUNTIME.FP = RUNTIME

const IMPORT_LINE_RE = /^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm

function stripImports(code: string): string {
  return code.replace(IMPORT_LINE_RE, '')
}

export interface Fixture {
  readonly name: string
  /** Import statement(s), e.g. "import { pipe, A } from '@stopcock/fp'" */
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

function runWrapped(wrappedCode: string, paramNames: readonly string[], paramValues: readonly unknown[]): RunResult {
  const strippedBody = stripImports(wrappedCode)
  const call = `${strippedBody}\nreturn __fixture(${paramNames.join(', ')});`
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(...paramNames, call)
    return { value: fn(...paramValues) }
  } catch (error) {
    return { value: undefined, error }
  }
}

export interface CompareResult {
  readonly transformed: boolean
  readonly reason?: string
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
    const fullSource = `${fixture.imports}\nfunction __fixture(${paramNames.join(', ')}) {\n${fixture.body}\n}\n`
    return { fullSource, paramNames }
  }

  const probe = build(makeExtra())
  const result = transformStopcockPipelines(probe.fullSource, `${fixture.name}.ts`, {
    diagnostics: 'verbose',
    ...fixture.options,
  })
  const transformed = result.code !== probe.fullSource
  const site = result.diagnostics[result.diagnostics.length - 1]

  const originalExtra = makeExtra()
  const originalBuilt = build(originalExtra)
  const originalValues = [...localNames.map((k) => RUNTIME[fixture.locals[k]]), ...Object.values(originalExtra)]
  const original = runWrapped(originalBuilt.fullSource, originalBuilt.paramNames, originalValues)

  const compiledExtra = makeExtra()
  const compiledValues = [...localNames.map((k) => RUNTIME[fixture.locals[k]]), ...Object.values(compiledExtra)]
  const compiledSource = result.code === probe.fullSource ? build(compiledExtra).fullSource : result.code
  const compiledParamNames = build(compiledExtra).paramNames
  const compiled = runWrapped(compiledSource, compiledParamNames, compiledValues)

  return { transformed, reason: site?.reason, original, compiled }
}
