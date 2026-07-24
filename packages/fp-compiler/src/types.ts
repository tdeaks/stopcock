export type FilterPattern =
  | ReadonlyArray<string | RegExp>
  | string
  | RegExp
  | null
  | undefined

export type DiagnosticsLevel = false | 'summary' | 'verbose' | 'error'
export type CompilerSemantics = 'exact' | 'pure'

export interface StopcockCompilerOptions {
  readonly include?: FilterPattern
  readonly exclude?: FilterPattern
  /**
   * Package roots that provide pipe/flow/compile. Array operator sources are
   * derived by appending `/array` unless arrayImportSources is provided.
   */
  readonly importSources?: readonly string[]
  /**
   * Exact module sources that provide compile/compilePure. Derived as
   * `${importSource}/compile` in addition to the root sources by default.
   */
  readonly compileImportSources?: readonly string[]
  /**
   * Exact module sources that provide named or namespace array operators.
   * Use this when a wrapper package does not expose operators at
   * `${importSource}/array`.
   */
  readonly arrayImportSources?: readonly string[]
  /**
   * Opts the transformed sites into pure semantics. The current transform
   * does not apply pure-only rewrites, but the selected mode is recorded on
   * every diagnostic and the transform result so it can never be implicit.
   */
  readonly assumePure?: boolean
  readonly diagnostics?: DiagnosticsLevel
}

export interface DiagnosticSite {
  readonly id: string
  readonly line: number
  readonly column: number
  readonly transformed: boolean
  readonly steps: number
  readonly semantics: CompilerSemantics
  readonly reason?: string
}

export interface TransformResult {
  readonly code: string
  readonly map: ReturnType<import('magic-string').default['generateMap']> | null
  readonly semantics: CompilerSemantics
  readonly diagnostics: readonly DiagnosticSite[]
}
