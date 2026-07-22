export type FilterPattern =
  | ReadonlyArray<string | RegExp>
  | string
  | RegExp
  | null
  | undefined

export type DiagnosticsLevel = false | 'summary' | 'verbose' | 'error'

export interface StopcockCompilerOptions {
  readonly include?: FilterPattern
  readonly exclude?: FilterPattern
  readonly importSources?: readonly string[]
  readonly assumePure?: boolean
  readonly diagnostics?: DiagnosticsLevel
}

export interface DiagnosticSite {
  readonly id: string
  readonly line: number
  readonly column: number
  readonly transformed: boolean
  readonly steps: number
  readonly reason?: string
}

export interface TransformResult {
  readonly code: string
  readonly map: ReturnType<import('magic-string').default['generateMap']> | null
  readonly diagnostics: readonly DiagnosticSite[]
}
