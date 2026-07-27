export type FilterPattern = ReadonlyArray<string | RegExp> | string | RegExp | null | undefined

export type DiagnosticsLevel = false | 'summary' | 'verbose' | 'error'
export type CompilerSemantics = 'exact' | 'pure'
export type CompilerSegmentKind = 'stream' | 'boundary' | 'opaque'
export type CompilerFallbackTier = 'sequential' | 'compact' | 'compiler' | 'none'

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
  /**
   * Optional build-policy pins. A mismatch never guesses: recognised sites
   * stay on their exact imported runtime tier and emit a stale-hash receipt.
   */
  readonly expectedSemanticManifestHash?: string
  readonly expectedLoweringAbiHash?: string
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
  /**
   * Packed-artifact identities for an extracted-host qualification build.
   * Ordinary source builds omit this and receipts record null instead.
   */
  readonly artifactContext?:
    | import('./receipt-schema.generated.js').CompilerReceiptArtifactContextV1
    | null
  /** For hosts that manage artifacts themselves. Called once per build. */
  readonly onReceipts?: (
    receipts: readonly import('./receipt-schema.generated.js').CompilerReceiptV1[],
  ) => void
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
   * form was rejected before any operator could be identified; that fallback
   * still receives a receipt with an empty semantic identity sequence.
   */
  readonly opNames?: readonly string[]
  /** The actual static plan shape selected for this site. */
  readonly segmentKinds?: readonly CompilerSegmentKind[]
  /** Stable lowering ABI identity used to derive the receipt lowering hash. */
  readonly loweringId?: string
  /** Exact generated S2 facts consumed by the selected Plan IR. */
  readonly operatorFacts?: readonly import('./ops.js').CompilerOperatorFact[]
  /** Structured reasons supplementing, rather than parsing, free-form prose. */
  readonly reasonCodes?: readonly import('./receipt-schema.generated.js').ReceiptReasonCodeV1[]
  /** The original runtime tier retained when this site is not transformed. */
  readonly fallbackTier?: CompilerFallbackTier
}

export interface TransformResult {
  readonly code: string
  readonly map: ReturnType<import('magic-string').Bundle['generateMap']> | null
  readonly semantics: CompilerSemantics
  readonly diagnostics: readonly DiagnosticSite[]
}
