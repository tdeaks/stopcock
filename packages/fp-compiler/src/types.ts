export type FilterPattern = ReadonlyArray<string | RegExp> | string | RegExp | null | undefined

export type DiagnosticsLevel = false | 'summary' | 'verbose' | 'error'
export type CompilerSemantics = 'exact' | 'pure'
export type CompilerSegmentKind = 'stream' | 'boundary' | 'opaque' | 'option' | 'dict' | 'iterable'
export type CompilerFallbackTier = 'sequential' | 'compact' | 'compiler' | 'none'
export type DiagnosticReasonCode =
  | 'opaque-callback'
  | 'materialization-boundary'
  | 'unsupported-layout'
  | 'host-restriction'
  | 'strict-scope-exclusion'
  | 'compiler-defect'
  /** `Obj.pick`/`Obj.omit` with a non-static key argument: still compiled
   * (the generic boundary call-through handles any key shape correctly),
   * just not eligible for the static unrolled-literal fast path. */
  | 'dynamic-keys'
  /** `Iter.zip`/`Iter.zipWith`: multi-source iterable ops are out of scope
   * for phase 4 and bail to the runtime, loudly. */
  | 'multi-source'

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
   * Runtime tier retained by a configured wrapper source when compilation
   * declines. First-party Stopcock sources are known exactly; custom sources
   * default to `compiler` unless declared here.
   */
  readonly fallbackTiers?: Readonly<
    Record<string, Exclude<CompilerFallbackTier, 'none'>>
  >
  /**
   * Opts transformed sites into the documented pure execution rewrites.
   * Source expressions and operator factories are still evaluated exactly
   * once; only proven-unobservable per-element work may be removed.
   */
  readonly assumePure?: boolean
  readonly diagnostics?: DiagnosticsLevel
}

export interface DiagnosticSite {
  readonly id: string
  readonly line: number
  readonly column: number
  readonly endLine: number
  readonly endColumn: number
  /** Exact public module specifier whose facade call was discovered. */
  readonly sourceSpecifier?: string
  /** Exact exported facade symbol, before any local import aliasing. */
  readonly sourceExport?: string
  readonly transformed: boolean
  readonly steps: number
  readonly semantics: CompilerSemantics
  readonly reason?: string
  /**
   * Operator names the site resolved, in pipeline order. Empty when the call
   * form was rejected before any operator could be identified.
   */
  readonly opNames?: readonly string[]
  /** The actual static plan shape selected for this site. */
  readonly segmentKinds?: readonly CompilerSegmentKind[]
  /** Stable lowering identity of the selected Plan IR. */
  readonly loweringId?: string
  /** Exact generated S2 facts consumed by the selected Plan IR. */
  readonly operatorFacts?: readonly import('./ops.js').CompilerOperatorFact[]
  /** Structured reasons supplementing, rather than parsing, free-form prose. */
  readonly reasonCodes?: readonly DiagnosticReasonCode[]
  /** The original runtime tier retained when this site is not transformed. */
  readonly fallbackTier?: CompilerFallbackTier
}

export interface TransformResult {
  readonly code: string
  readonly map: ReturnType<import('magic-string').Bundle['generateMap']> | null
  readonly semantics: CompilerSemantics
  readonly diagnostics: readonly DiagnosticSite[]
}
