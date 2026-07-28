import { none, some, type Option } from './option'
import { err, ok, type Result } from './result'

export const isEmpty = (value: string): boolean => value.length === 0

/** UTF-16 code-unit length, matching String.prototype.length. */
export const length = (value: string): number => value.length

export const trim = (value: string): string => value.trim()

export const trimStart = (value: string): string => value.trimStart()

export const trimEnd = (value: string): string => value.trimEnd()

export const toLowerCase = (value: string): string => value.toLowerCase()

export const toUpperCase = (value: string): string => value.toUpperCase()

export const startsWith: (prefix: string) => (value: string) => boolean =
  (prefix) => (value) =>
    value.startsWith(prefix)

export const endsWith: (suffix: string) => (value: string) => boolean =
  (suffix) => (value) =>
    value.endsWith(suffix)

export const includes: (search: string) => (value: string) => boolean =
  (search) => (value) =>
    value.includes(search)

export const split: (separator: string | RegExp) => (value: string) => string[] =
  (separator) => (value) =>
    value.split(separator)

export const repeat: (count: number) => (value: string) => string =
  (count) => (value) =>
    value.repeat(count)

export const slice: (start: number, end?: number) => (value: string) => string =
  (start, end) => (value) =>
    value.slice(start, end)

export const padStart: (targetLength: number, fill?: string) => (value: string) => string =
  (targetLength, fill) => (value) =>
    value.padStart(targetLength, fill)

export const padEnd: (targetLength: number, fill?: string) => (value: string) => string =
  (targetLength, fill) => (value) =>
    value.padEnd(targetLength, fill)

export const stripPrefix: (prefix: string) => (value: string) => Option<string> =
  (prefix) => (value) =>
    value.startsWith(prefix) ? some(value.slice(prefix.length)) : none

export const stripSuffix: (suffix: string) => (value: string) => Option<string> =
  (suffix) => (value) =>
    value.endsWith(suffix) ? some(value.slice(0, -suffix.length || undefined)) : none

export const lines = (value: string): string[] => value.split(/\r\n?|\n/u)

export const words = (value: string): string[] => {
  const normalized = value.trim()
  return normalized === '' ? [] : normalized.split(/\s+/u)
}

export const replace: (search: string | RegExp, replacement: string) => (value: string) => string =
  (search, replacement) => (value) =>
    value.replace(search, replacement)

export const replaceAll: (
  search: string | RegExp,
  replacement: string,
) => (value: string) => string = (search, replacement) => (value) =>
  value.replaceAll(search, replacement)

export const test: (expression: RegExp) => (value: string) => boolean =
  (expression) => (value) => {
    expression.lastIndex = 0
    return expression.test(value)
  }

export const match: (expression: RegExp) => (value: string) => Option<RegExpMatchArray> =
  (expression) => (value) => {
    expression.lastIndex = 0
    const result = value.match(expression)
    return result === null ? none : some(result)
  }

export const truncate: (maximum: number, omission?: string) => (value: string) => string =
  (maximum, omission = '…') =>
  (value) => {
    const bound = Math.max(0, Math.trunc(maximum))
    if (value.length <= bound) return value
    if (bound <= omission.length) return omission.slice(0, bound)
    return value.slice(0, bound - omission.length) + omission
  }

export type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD'

export const normalize: (form?: NormalizationForm) => (value: string) => string =
  (form) => (value) =>
    value.normalize(form)

const wordParts = (value: string): string[] =>
  value
    .replace(/([a-z\d])([A-Z])/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

const lowerCaseWordParts = (value: string): string[] => {
  const parts = wordParts(value)
  for (let index = 0; index < parts.length; index += 1) {
    parts[index] = parts[index].toLocaleLowerCase()
  }
  return parts
}

export const capitalize = (value: string): string =>
  value === '' ? '' : value[0].toLocaleUpperCase() + value.slice(1)

export const uncapitalize = (value: string): string =>
  value === '' ? '' : value[0].toLocaleLowerCase() + value.slice(1)

export const camelCase = (value: string): string => {
  const parts = lowerCaseWordParts(value)
  if (parts.length === 0) return ''
  let result = parts[0]
  for (let index = 1; index < parts.length; index += 1) {
    result += capitalize(parts[index])
  }
  return result
}

export const kebabCase = (value: string): string => lowerCaseWordParts(value).join('-')

export const snakeCase = (value: string): string => lowerCaseWordParts(value).join('_')

export const titleCase = (value: string): string => {
  const parts = wordParts(value)
  for (let index = 0; index < parts.length; index += 1) {
    parts[index] = capitalize(parts[index].toLocaleLowerCase())
  }
  return parts.join(' ')
}

export const codePoints = (value: string): string[] => Array.from(value)

export const codePointLength = (value: string): number => {
  let count = 0
  for (const _point of value) count += 1
  return count
}

const segmenter = (locale?: string): Intl.Segmenter =>
  new Intl.Segmenter(locale, {
    granularity: 'grapheme',
  })

export const graphemes = (value: string, locale?: string): string[] =>
  Array.from(segmenter(locale).segment(value), (part) => part.segment)

export const graphemeLength = (value: string, locale?: string): number => {
  let count = 0
  for (const _part of segmenter(locale).segment(value)) count++
  return count
}

export const parseJson = <A = unknown>(
  value: string,
  validate?: (value: unknown) => value is A,
): Result<A, SyntaxError | TypeError> => {
  try {
    const parsed: unknown = JSON.parse(value)
    if (validate && !validate(parsed)) return err(new TypeError('JSON value failed validation'))
    return ok(parsed as A)
  } catch (error) {
    return err(
      error instanceof SyntaxError
        ? error
        : new SyntaxError(error instanceof Error ? error.message : String(error)),
    )
  }
}
