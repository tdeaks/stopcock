import { as, label, map, notFollowedBy, skipRight } from './combinators'
import { failure, success } from './internal'
import type { Parser } from './types'

export type CharacterPredicate = (character: string, offset: number) => boolean
export type CharacterRefinement<A extends string> = (
  character: string,
  offset: number,
) => character is A

const characterAt = (source: string, position: number): string | undefined => {
  const codePoint = source.codePointAt(position)
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint)
}

export const anyChar: Parser<string> = (source, position) => {
  const character = characterAt(source, position)
  return character === undefined
    ? failure(position, 'any character')
    : success(character, position + character.length)
}

export function satisfy<A extends string>(
  refinement: CharacterRefinement<A>,
  expected: string,
): Parser<A>
export function satisfy(predicate: CharacterPredicate, expected: string): Parser<string>
export function satisfy(predicate: CharacterPredicate, expected: string): Parser<string> {
  return (source, position) => {
    const character = characterAt(source, position)
    return character !== undefined && predicate(character, position)
      ? success(character, position + character.length)
      : failure(position, expected)
  }
}

export const char = <const Character extends string>(expected: Character): Parser<Character> => {
  if (Array.from(expected).length !== 1) {
    throw new RangeError('char requires exactly one Unicode character')
  }
  return (source, position) =>
    source.startsWith(expected, position)
      ? success(expected, position + expected.length)
      : failure(position, JSON.stringify(expected))
}

export const oneOf = <const Characters extends string>(
  characters: Characters,
): Parser<Characters[number]> => {
  const accepted = new Set(Array.from(characters))
  return satisfy(
    (character): character is Characters[number] => accepted.has(character),
    `one of ${JSON.stringify(characters)}`,
  )
}

export const noneOf = (characters: string): Parser<string> => {
  const excluded = new Set(Array.from(characters))
  return satisfy((character) => !excluded.has(character), `none of ${JSON.stringify(characters)}`)
}

export const string =
  <const Text extends string>(expected: Text): Parser<Text> =>
  (source, position) => {
    if (source.startsWith(expected, position)) {
      return success(expected, position + expected.length)
    }

    let mismatch = 0
    const available = source.length - position
    const maximum = Math.min(expected.length, available)
    while (
      mismatch < maximum &&
      source.charCodeAt(position + mismatch) === expected.charCodeAt(mismatch)
    ) {
      mismatch++
    }
    return failure(position + mismatch, JSON.stringify(expected))
  }

export const text = string

export const regex = (expression: RegExp, expected = expression.toString()): Parser<string> => {
  const flags = expression.flags.replaceAll('g', '').replaceAll('y', '')
  const sticky = new RegExp(expression.source, `${flags}y`)

  return (source, position) => {
    sticky.lastIndex = position
    const match = sticky.exec(source)
    return match ? success(match[0], sticky.lastIndex) : failure(position, expected)
  }
}

export const regexMatch = (
  expression: RegExp,
  expected = expression.toString(),
): Parser<RegExpExecArray> => {
  const flags = expression.flags.replaceAll('g', '').replaceAll('y', '')
  const sticky = new RegExp(expression.source, `${flags}y`)

  return (source, position) => {
    sticky.lastIndex = position
    const match = sticky.exec(source)
    return match ? success(match, sticky.lastIndex) : failure(position, expected)
  }
}

export const takeWhile =
  (predicate: CharacterPredicate): Parser<string> =>
  (source, position) => {
    let cursor = position
    while (cursor < source.length) {
      const character = characterAt(source, cursor)
      if (character === undefined || !predicate(character, cursor)) break
      cursor += character.length
    }
    return success(source.slice(position, cursor), cursor)
  }

export const takeWhile1 =
  (predicate: CharacterPredicate, expected: string): Parser<string> =>
  (source, position) => {
    let cursor = position
    while (cursor < source.length) {
      const character = characterAt(source, cursor)
      if (character === undefined || !predicate(character, cursor)) break
      cursor += character.length
    }
    return cursor === position
      ? failure(position, expected)
      : success(source.slice(position, cursor), cursor)
  }

export const rest: Parser<string> = (source, position) =>
  success(source.slice(position), source.length)

export const eof: Parser<void> = (source, position) =>
  position === source.length ? success(undefined, position) : failure(position, 'end of input')

export const end = eof

export const lineBreak: Parser<string> = (source, position) => {
  const first = source.charCodeAt(position)
  if (first === 13) {
    return source.charCodeAt(position + 1) === 10
      ? success('\r\n', position + 2)
      : success('\r', position + 1)
  }
  return first === 10 ? success('\n', position + 1) : failure(position, 'a line break')
}

const isWhitespace = (character: string): boolean =>
  character === ' ' || character === '\t' || character === '\r' || character === '\n'

const isHorizontalWhitespace = (character: string): boolean =>
  character === ' ' || character === '\t'

export const whitespace: Parser<string> = takeWhile(isWhitespace)
export const whitespace1: Parser<string> = takeWhile1(isWhitespace, 'whitespace')
export const spaces: Parser<string> = takeWhile(isHorizontalWhitespace)
export const spaces1: Parser<string> = takeWhile1(isHorizontalWhitespace, 'horizontal whitespace')

export const skipWhitespace: Parser<void> = (source, position) => {
  let cursor = position
  while (cursor < source.length && isWhitespace(source[cursor])) cursor++
  return success(undefined, cursor)
}

const isDigit = (character: string): boolean => character >= '0' && character <= '9'
const isHexDigit = (character: string): boolean =>
  isDigit(character) ||
  (character >= 'a' && character <= 'f') ||
  (character >= 'A' && character <= 'F')
const isLetter = (character: string): boolean =>
  (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z')
const isIdentifierStart = (character: string): boolean =>
  isLetter(character) || character === '_' || character === '$'
const isIdentifierContinue = (character: string): boolean =>
  isIdentifierStart(character) || isDigit(character)

export const digit: Parser<string> = satisfy(isDigit, 'a digit')
export const hexDigit: Parser<string> = satisfy(isHexDigit, 'a hexadecimal digit')
export const letter: Parser<string> = satisfy(isLetter, 'a letter')
export const alphaNumeric: Parser<string> = satisfy(
  (character) => isLetter(character) || isDigit(character),
  'a letter or digit',
)
export const digits: Parser<string> = takeWhile1(isDigit, 'digits')
export const hexDigits: Parser<string> = takeWhile1(isHexDigit, 'hexadecimal digits')
export const identifier: Parser<string> = regex(/[$A-Z_a-z][$\w]*/, 'an identifier')

export const integer: Parser<number> = map(regex(/[+-]?(?:0|[1-9]\d*)/, 'an integer'), Number)

export const natural: Parser<number> = map(regex(/(?:0|[1-9]\d*)/, 'a natural number'), Number)

export const number: Parser<number> = map(
  regex(/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[Ee][+-]?\d+)?/, 'a number'),
  Number,
)

export const bigint: Parser<bigint> = map(regex(/[+-]?(?:0|[1-9]\d*)/, 'an integer'), BigInt)

export const boolean: Parser<boolean> = (source, position) => {
  if (source.startsWith('true', position)) {
    return success(true, position + 4)
  }
  if (source.startsWith('false', position)) {
    return success(false, position + 5)
  }
  return failure(position, '"true" or "false"')
}

export const null_: Parser<null> = (source, position) =>
  source.startsWith('null', position) ? success(null, position + 4) : failure(position, '"null"')

const escapes: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

export const quotedString =
  (quote: '"' | "'" = '"'): Parser<string> =>
  (source, position) => {
    if (source[position] !== quote) {
      return failure(position, `${JSON.stringify(quote)}-quoted string`)
    }

    let cursor = position + 1
    let chunkStart = cursor
    let output = ''
    while (cursor < source.length) {
      const character = source[cursor]
      if (character === quote) {
        output += source.slice(chunkStart, cursor)
        return success(output, cursor + 1)
      }
      if (character === '\n' || character === '\r') {
        return failure(cursor, `closing ${JSON.stringify(quote)}`, {
          message: 'Unescaped line break in string literal',
          consumed: true,
        })
      }
      if (character !== '\\') {
        cursor++
        continue
      }

      output += source.slice(chunkStart, cursor)
      cursor++
      if (cursor >= source.length) {
        return failure(cursor, 'an escape sequence', { consumed: true })
      }
      const escaped = source[cursor]
      if (escaped === 'u') {
        const hexadecimal = source.slice(cursor + 1, cursor + 5)
        if (!/^[\dA-Fa-f]{4}$/.test(hexadecimal)) {
          return failure(cursor + 1, 'four hexadecimal digits', {
            consumed: true,
          })
        }
        output += String.fromCharCode(Number.parseInt(hexadecimal, 16))
        cursor += 5
      } else {
        const replacement = escapes[escaped]
        if (replacement === undefined) {
          return failure(cursor, 'a valid escape sequence', {
            consumed: true,
          })
        }
        output += replacement
        cursor++
      }
      chunkStart = cursor
    }

    return failure(cursor, `closing ${JSON.stringify(quote)}`, {
      consumed: true,
    })
  }

export const jsonString: Parser<string> = quotedString('"')

export const token = <A>(parser: Parser<A>, ignored: Parser<unknown> = skipWhitespace): Parser<A> =>
  skipRight(parser, ignored)

export const lexeme = token

export const symbol = <const Text extends string>(
  value: Text,
  ignored: Parser<unknown> = skipWhitespace,
): Parser<Text> => token(string(value), ignored)

export const keyword = <const Word extends string>(
  word: Word,
  ignored: Parser<unknown> = skipWhitespace,
): Parser<Word> =>
  token(
    label(
      skipRight(
        string(word),
        notFollowedBy(
          satisfy(isIdentifierContinue, 'an identifier character'),
          `a boundary after ${JSON.stringify(word)}`,
        ),
      ),
      JSON.stringify(word),
    ),
    ignored,
  )

export const comma: Parser<','> = symbol(',')
export const colon: Parser<':'> = symbol(':')
export const semicolon: Parser<';'> = symbol(';')
export const openParen: Parser<'('> = symbol('(')
export const closeParen: Parser<')'> = symbol(')')
export const openBracket: Parser<'['> = symbol('[')
export const closeBracket: Parser<']'> = symbol(']')
export const openBrace: Parser<'{'> = symbol('{')
export const closeBrace: Parser<'}'> = symbol('}')

export const ignored: Parser<void> = as(skipWhitespace, undefined)
