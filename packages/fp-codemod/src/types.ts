export type DiagnosticSeverity = 'info' | 'warning' | 'error'

export interface MigrationDiagnostic {
  readonly code: string
  readonly severity: DiagnosticSeverity
  readonly message: string
  readonly start: number
  readonly length: number
}

export interface TextEdit {
  readonly start: number
  readonly end: number
  readonly text: string
  readonly reason: string
}

export interface TransformOptions {
  readonly rewriteRootImports?: boolean
}

export interface TransformResult {
  readonly code: string
  readonly changed: boolean
  readonly edits: readonly TextEdit[]
  readonly diagnostics: readonly MigrationDiagnostic[]
}
