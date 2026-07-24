export interface OffsetSpan {
  readonly start: number
  readonly end: number
}

export interface SourcePosition {
  readonly offset: number
  readonly line: number
  readonly column: number
}

export interface SourceSpan {
  readonly start: SourcePosition
  readonly end: SourcePosition
}

export interface ParseIssue {
  readonly offset: number
  readonly expected: readonly string[]
  readonly message?: string
  readonly contexts: readonly string[]
}

export interface ParseError {
  readonly _tag: 'ParseError'
  readonly message: string
  readonly expected: readonly string[]
  readonly found: string | null
  readonly position: SourcePosition
  readonly span: SourceSpan
  readonly contexts: readonly string[]
}

export interface ParseSuccess<A> {
  readonly ok: true
  readonly value: A
  readonly position: number
}

export interface ParseFailure {
  readonly ok: false
  readonly issue: ParseIssue
  readonly consumed: boolean
  readonly committed: boolean
}

export type ParseReply<A> = ParseSuccess<A> | ParseFailure

/**
 * A parser reads the original source at an absolute UTF-16 offset.
 *
 * Successful replies carry only the new offset and value. The hot path never
 * allocates substrings or line/column objects.
 */
export type Parser<A> = (source: string, position: number) => ParseReply<A>

export type ParserValue<InputParser> = InputParser extends Parser<infer Value> ? Value : never

export interface Parsed<A> {
  readonly value: A
  readonly position: number
  readonly rest: string
  readonly span: OffsetSpan
}

export interface Spanned<A> {
  readonly value: A
  readonly span: OffsetSpan
}
