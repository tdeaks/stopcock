export type FilterPattern = ReadonlyArray<string | RegExp> | string | RegExp | null | undefined

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
  /**
   * Emits one deterministic `CompilerReceiptV1` per recognised site. Off by
   * default: an ordinary build should not pay for evidence it did not ask for,
   * and receipt emission never changes generated code or transform selection.
   */
  readonly receipts?: ReceiptOptions
}

export interface ReceiptOptions {
  /** Directory for `stopcock-receipts.json`, relative to the project root. */
  readonly dir?: string
  /** Root that receipt paths are made relative to. Defaults to cwd. */
  readonly root?: string
  /** For hosts that manage artifacts themselves. Called once per build. */
  readonly onReceipts?: (
    receipts: readonly import('./receipt-schema.generated.js').CompilerReceiptV1[],
  ) => void
}

export interface DiagnosticSite {
  readonly id: string
  readonly line: number
  readonly column: number
  readonly transformed: boolean
  readonly steps: number
  readonly semantics: CompilerSemantics
  readonly reason?: string
  /**
   * Operator names the site resolved, in pipeline order. Empty when the call
   * form was rejected before any operator could be identified, which is also
   * when no receipt can be emitted for it.
   */
  readonly opNames?: readonly string[]
}

export interface TransformResult {
  readonly code: string
  readonly map: ReturnType<import('magic-string').default['generateMap']> | null
  readonly semantics: CompilerSemantics
  readonly diagnostics: readonly DiagnosticSite[]
}
