import { err, isErr, isOk, ok } from '@stopcock/fp/result'
import { isNone, isSome } from '@stopcock/fp/option'
import { describe, expect, it } from 'vite-plus/test'
import {
  attempt,
  between,
  boolean,
  chainLeft1,
  char,
  choice,
  closeBrace,
  closeBracket,
  comma,
  context,
  cut,
  defer,
  identifier,
  integer,
  jsonString,
  map,
  mapResult,
  many,
  null_,
  number,
  openBrace,
  openBracket,
  optional,
  pair,
  parse,
  parseOption,
  parsePrefix,
  sepEndBy,
  sequence,
  sequenceObject,
  skipLeft,
  skipRight,
  skipWhitespace,
  string,
  symbol,
  unsafeParse,
  withSpan,
  type Parser,
} from '..'

describe('@stopcock/parser', () => {
  it('parses sequences without allocating intermediate source slices', () => {
    const assignment = sequenceObject({
      name: skipRight(identifier, symbol('=')),
      value: integer,
    })

    expect(parse(assignment, 'answer=42')).toEqual(ok({ name: 'answer', value: 42 }))
    expect(parsePrefix(identifier, 'name + rest')).toEqual(
      ok({
        value: 'name',
        position: 4,
        rest: ' + rest',
        span: { start: 0, end: 4 },
      }),
    )
  })

  it('supports explicit backtracking and committed failures', () => {
    const first = map(sequence(string('ab'), char('x')), () => 'first')
    const second = map(sequence(string('ab'), char('y')), () => 'second')

    expect(isErr(parse(choice(first, second), 'aby'))).toBe(true)
    expect(parse(choice(attempt(first), second), 'aby')).toEqual(ok('second'))

    const committed = choice(skipLeft(char('a'), cut(char('b'))), string('ac'))
    const result = parse(committed, 'ac')
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error.expected).toEqual(['"b"'])
  })

  it('merges farthest alternative errors with line, column, span, and context', () => {
    const alternatives = choice(string('cat'), string('car'))
    const alternativeResult = parse(alternatives, 'cab')
    expect(isErr(alternativeResult)).toBe(true)
    if (isErr(alternativeResult)) {
      expect(alternativeResult.error.position).toEqual({
        offset: 2,
        line: 1,
        column: 3,
      })
      expect(alternativeResult.error.expected).toEqual(['"cat"', '"car"'])
      expect(alternativeResult.error.span.start.offset).toBe(2)
      expect(alternativeResult.error.found).toBe('b')
    }

    const assignment = context('assignment', sequence(identifier, symbol('='), number))
    const contextual = parse(assignment, 'name= \nnope')
    expect(isErr(contextual)).toBe(true)
    if (isErr(contextual)) {
      expect(contextual.error.position).toMatchObject({ line: 2, column: 1 })
      expect(contextual.error.contexts).toEqual(['assignment'])
      expect(contextual.error.message).toContain('assignment')
    }
  })

  it('rejects zero-width repetition instead of looping forever', () => {
    const result = parse(many(optional(char('a'))), '')
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.message).toContain('without consuming input')
    }
  })

  it('keeps repetition and operator chains stack safe', () => {
    const source = 'a'.repeat(50_000)
    const repeated = parse(many(char('a')), source)
    expect(isOk(repeated) && repeated.value.length).toBe(50_000)

    const plus = map(char('+'), () => (left: number, right: number) => left + right)
    const expression = Array.from({ length: 10_001 }, () => '1').join('+')
    expect(parse(chainLeft1(integer, plus), expression)).toEqual(ok(10_001))
  })

  it('supports lazy recursive grammars', () => {
    type Tree = number | readonly Tree[]
    let tree: Parser<Tree>
    const list: Parser<readonly Tree[]> = between(
      openBracket,
      sepEndBy(
        defer(() => tree),
        comma,
      ),
      closeBracket,
    )
    tree = choice(number, list)

    expect(parse(tree, '[1, [2, 3],]')).toEqual(ok([1, [2, 3]]))
  })

  it('parses a useful JSON grammar from public combinators', () => {
    type Json =
      | null
      | boolean
      | number
      | string
      | readonly Json[]
      | { readonly [key: string]: Json }

    let json: Parser<Json>
    const arrayParser: Parser<readonly Json[]> = between(
      openBracket,
      sepEndBy(
        defer(() => json),
        comma,
      ),
      closeBracket,
    )
    const entry = pair(
      skipRight(jsonString, symbol(':')),
      defer(() => json),
    )
    const objectParser = map(
      between(openBrace, sepEndBy(entry, comma), closeBrace),
      (entries): { readonly [key: string]: Json } => Object.fromEntries(entries),
    )
    json = choice(jsonString, number, boolean, null_, arrayParser, objectParser)

    const document = skipLeft(skipWhitespace, json)
    expect(unsafeParse(document, ' { "name": "Ada", "flags": [true, null, 3.5] } ')).toEqual({
      name: 'Ada',
      flags: [true, null, 3.5],
    })
  })

  it('integrates validation with Result and absence with Option', () => {
    const positive = mapResult(
      integer,
      (value) => (value > 0 ? ok(value) : err('must be positive')),
      (message) => message,
    )
    expect(parse(positive, '2')).toEqual(ok(2))
    const invalid = parse(positive, '-2')
    expect(isErr(invalid)).toBe(true)
    if (isErr(invalid)) expect(invalid.error.message).toBe('must be positive')

    const maybeSign = parse(optional(choice(char('+'), char('-'))), '')
    expect(isOk(maybeSign) && isNone(maybeSign.value)).toBe(true)
    const sign = parseOption(char('+'), '+')
    expect(isSome(sign) && sign.value).toBe('+')
    expect(isNone(parseOption(char('+'), '-'))).toBe(true)
  })

  it('tracks successful spans and decodes escaped strings', () => {
    expect(parse(withSpan(string('hello')), 'hello')).toEqual(
      ok({ value: 'hello', span: { start: 0, end: 5 } }),
    )
    expect(parse(jsonString, String.raw`"line\n\u0041"`)).toEqual(ok('line\nA'))
  })
})
