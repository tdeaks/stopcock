import type { ParseError, ParseFailure, ParseIssue, ParseSuccess, SourcePosition } from './types'

export const success = <A>(value: A, position: number): ParseSuccess<A> => ({
  ok: true,
  value,
  position,
})

export const failure = (
  offset: number,
  expected: string | readonly string[],
  options: {
    readonly message?: string
    readonly contexts?: readonly string[]
    readonly consumed?: boolean
    readonly committed?: boolean
  } = {},
): ParseFailure => ({
  ok: false,
  issue: {
    offset,
    expected: typeof expected === 'string' ? [expected] : expected,
    ...(options.message === undefined ? {} : { message: options.message }),
    contexts: options.contexts ?? [],
  },
  consumed: options.consumed ?? false,
  committed: options.committed ?? false,
})

export const markConsumed = (result: ParseFailure, consumed: boolean): ParseFailure =>
  consumed && !result.consumed ? { ...result, consumed: true } : result

const unique = (values: readonly string[]): readonly string[] => {
  if (values.length <= 1) return values
  return [...new Set(values)]
}

export const mergeFailures = (
  left: ParseFailure | undefined,
  right: ParseFailure,
): ParseFailure => {
  if (!left || right.issue.offset > left.issue.offset) return right
  if (left.issue.offset > right.issue.offset) return left

  return {
    ok: false,
    issue: {
      offset: left.issue.offset,
      expected: unique([...left.issue.expected, ...right.issue.expected]),
      ...(right.issue.message || left.issue.message
        ? { message: right.issue.message ?? left.issue.message }
        : {}),
      contexts:
        right.issue.contexts.length >= left.issue.contexts.length
          ? right.issue.contexts
          : left.issue.contexts,
    },
    consumed: left.consumed || right.consumed,
    committed: left.committed || right.committed,
  }
}

export const positionAt = (source: string, offset: number): SourcePosition => {
  let line = 1
  let column = 1
  const end = Math.min(Math.max(offset, 0), source.length)

  for (let index = 0; index < end; index++) {
    const code = source.charCodeAt(index)
    if (code === 10) {
      line++
      column = 1
    } else {
      column++
    }
  }

  return { offset: end, line, column }
}

const describeFound = (found: string | null): string =>
  found === null ? 'end of input' : JSON.stringify(found)

export const materializeError = (source: string, issue: ParseIssue): ParseError => {
  const start = positionAt(source, issue.offset)
  const found =
    issue.offset >= source.length
      ? null
      : String.fromCodePoint(source.codePointAt(issue.offset) ?? 0)
  const end = positionAt(source, found === null ? issue.offset : issue.offset + found.length)
  const expectation =
    issue.expected.length === 0
      ? 'valid input'
      : issue.expected.length === 1
        ? issue.expected[0]
        : issue.expected.join(' or ')
  const contextPrefix = issue.contexts.length === 0 ? '' : `${issue.contexts.join(' > ')}: `
  const message =
    issue.message ?? `${contextPrefix}expected ${expectation}, found ${describeFound(found)}`

  return {
    _tag: 'ParseError',
    message,
    expected: issue.expected,
    found,
    position: start,
    span: { start, end },
    contexts: issue.contexts,
  }
}
