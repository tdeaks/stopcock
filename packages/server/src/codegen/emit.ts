/**
 * Build-time codegen: emit a `.gen.ts` with the matcher source statically
 * baked in. Workers-friendly (no `new Function`), reviewable output.
 *
 *   import { emitMatcher } from '@stopcock/server'
 *   import { routes } from './my-app-routes'
 *   await emitMatcher(routes, 'src/matcher.gen.ts')
 */
import { writeFile } from 'node:fs/promises'
import { generateMatcherSource } from '../router/compile'

type RouteSpec = {
  method: string
  path: string
  paramNames: string[]
  pattern: RegExp
}

const banner = `// AUTO-GENERATED. Run codegen to refresh. Do not edit by hand.
/* eslint-disable */
`

const renderClosureData = (closureData: Record<string, unknown>): string => {
  const decls: string[] = []
  for (const [name, value] of Object.entries(closureData)) {
    if (name === 'EMPTY_ARR') continue
    if (value instanceof Map) {
      const entries = Array.from(value.entries())
        .map(([k, v]) => `[${JSON.stringify(k)}, ${JSON.stringify(v)}]`)
        .join(', ')
      decls.push(`const ${name} = new Map<string, number>([${entries}])`)
    } else if (Array.isArray(value)) {
      decls.push(`const ${name} = ${JSON.stringify(value)} as const`)
    } else {
      decls.push(`const ${name} = ${JSON.stringify(value)} as const`)
    }
  }
  return decls.join('\n')
}

export const renderMatcherModule = (routes: RouteSpec[]): string => {
  const plan = generateMatcherSource(routes)

  return `${banner}
// Route table this matcher was generated from:
${routes.map((r, i) => `//   ${i.toString().padStart(2, ' ')}  ${r.method.padEnd(6)} ${r.path}`).join('\n')}

export type MatchScratch = {
  index: number
  m: RegExpExecArray | null
  paramNames: readonly string[]
  paramOffsets: readonly number[]
}
export type MatcherFn = (method: string, path: string) => MatchScratch | null

const EMPTY_ARR: readonly never[] = Object.freeze([]) as readonly never[]
${renderClosureData(plan.closureData)}

const SCRATCH: MatchScratch = { index: 0, m: null, paramNames: EMPTY_ARR, paramOffsets: EMPTY_ARR }

export const match: MatcherFn = (method, path) => {
${plan.functionBody}
}
`
}

export const emitMatcher = async (routes: RouteSpec[], outPath: string): Promise<void> => {
  const source = renderMatcherModule(routes)
  await writeFile(outPath, source, 'utf8')
}
