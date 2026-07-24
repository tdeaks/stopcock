import { err, isErr, ok, type Result } from '@stopcock/fp/result'
import { none, some, type Option } from '@stopcock/fp/option'
import { failure, materializeError, positionAt, success } from './internal'
import type { ParseError, Parsed, Parser, ParseReply, SourcePosition } from './types'

export const succeed =
  <A>(value: A): Parser<A> =>
  (_source, position) =>
    success(value, position)

export const fail =
  (expected: string, message?: string): Parser<never> =>
  (_source, position) =>
    failure(position, expected, message === undefined ? {} : { message })

export const fromReply = <A>(
  parse: (source: string, position: number) => ParseReply<A>,
): Parser<A> => parse

export const defer = <A>(factory: () => Parser<A>): Parser<A> => {
  let cached: Parser<A> | undefined
  return (source, position) => {
    cached ??= factory()
    return cached(source, position)
  }
}

export const lazy = defer

export const position: Parser<number> = (_source, offset) => success(offset, offset)

export const sourcePosition: Parser<SourcePosition> = (source, offset) =>
  success(positionAt(source, offset), offset)

export const runReply = <A>(parser: Parser<A>, source: string, position = 0): ParseReply<A> => {
  if (!Number.isSafeInteger(position) || position < 0 || position > source.length) {
    return failure(position, 'a valid source offset', {
      message: `Invalid parser start offset: ${position}`,
      committed: true,
    })
  }
  return parser(source, position)
}

export const parsePrefix = <A>(
  parser: Parser<A>,
  source: string,
  position = 0,
): Result<Parsed<A>, ParseError> => {
  const result = runReply(parser, source, position)
  if (!result.ok) return err(materializeError(source, result.issue))
  return ok({
    value: result.value,
    position: result.position,
    rest: source.slice(result.position),
    span: { start: position, end: result.position },
  })
}

export const parse = <A>(parser: Parser<A>, source: string): Result<A, ParseError> => {
  const result = runReply(parser, source, 0)
  if (!result.ok) return err(materializeError(source, result.issue))
  if (result.position !== source.length) {
    return err(
      materializeError(source, {
        offset: result.position,
        expected: ['end of input'],
        contexts: [],
      }),
    )
  }
  return ok(result.value)
}

export const parseOption = <A>(parser: Parser<A>, source: string): Option<A> => {
  const result = parse(parser, source)
  return isErr(result) ? none : some(result.value)
}

export const unsafeParse = <A>(parser: Parser<A>, source: string): A => {
  const result = parse(parser, source)
  if (isErr(result)) throw new ParserError(result.error)
  return result.value
}

export class ParserError extends SyntaxError {
  readonly parseError: ParseError

  constructor(parseError: ParseError) {
    super(formatError(parseError))
    this.name = 'ParserError'
    this.parseError = parseError
  }
}

export const formatError = (error: ParseError): string => {
  const location = `${error.position.line}:${error.position.column}`
  return `${location} ${error.message}`
}

export type {
  OffsetSpan,
  ParseError,
  ParseFailure,
  ParseIssue,
  Parsed,
  Parser,
  ParserValue,
  ParseReply,
  ParseSuccess,
  SourcePosition,
  SourceSpan,
  Spanned,
} from './types'
