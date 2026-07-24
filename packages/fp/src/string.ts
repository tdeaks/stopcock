import { dual } from './dual-internal'
import { none, some, type Option } from './option'
import { err, ok, type Result } from './result'

export const isEmpty: (value: string) => boolean = dual(
  1,
  (value: string): boolean => value.length === 0,
  { op: 'strIsEmpty' },
)

/** UTF-16 code-unit length, matching String.prototype.length. */
export const length: (value: string) => number = dual(
  1,
  (value: string): number => value.length,
  { op: 'strLength' },
)

export const trim: (value: string) => string = dual(
  1,
  (value: string): string => value.trim(),
  { op: 'trim' },
)

export const trimStart: (value: string) => string = dual(
  1,
  (value: string): string => value.trimStart(),
  { op: 'trimStart' },
)

export const trimEnd: (value: string) => string = dual(
  1,
  (value: string): string => value.trimEnd(),
  { op: 'trimEnd' },
)

export const toLowerCase: (value: string) => string = dual(
  1,
  (value: string): string => value.toLowerCase(),
  { op: 'toLowerCase' },
)

export const toUpperCase: (value: string) => string = dual(
  1,
  (value: string): string => value.toUpperCase(),
  { op: 'toUpperCase' },
)

export const startsWith: {
  (value: string, prefix: string): boolean
  (prefix: string): (value: string) => boolean
} = dual(2, (value: string, prefix: string): boolean => value.startsWith(prefix))

export const endsWith: {
  (value: string, suffix: string): boolean
  (suffix: string): (value: string) => boolean
} = dual(2, (value: string, suffix: string): boolean => value.endsWith(suffix))

export const includes: {
  (value: string, search: string): boolean
  (search: string): (value: string) => boolean
} = dual(2, (value: string, search: string): boolean => value.includes(search))

export const split: {
  (value: string, separator: string | RegExp): string[]
  (separator: string | RegExp): (value: string) => string[]
} = dual(
  2,
  (value: string, separator: string | RegExp): string[] => value.split(separator),
  { op: 'split' },
)

export const repeat: {
  (value: string, count: number): string
  (count: number): (value: string) => string
} = dual(2, (value: string, count: number): string => value.repeat(count))

export const slice: {
  (value: string, start: number, end?: number): string
  (start: number, end?: number): (value: string) => string
} = function slice(
  valueOrStart: string | number,
  startOrEnd?: number,
  maybeEnd?: number,
): string | ((value: string) => string) {
  if (typeof valueOrStart === 'number') {
    return (value: string): string => value.slice(valueOrStart, startOrEnd)
  }
  return valueOrStart.slice(startOrEnd, maybeEnd)
} as {
  (value: string, start: number, end?: number): string
  (start: number, end?: number): (value: string) => string
}

export const padStart: {
  (value: string, targetLength: number, fill?: string): string
  (targetLength: number, fill?: string): (value: string) => string
} = function padStart(
  valueOrLength: string | number,
  lengthOrFill?: number | string,
  maybeFill?: string,
): string | ((value: string) => string) {
  if (typeof valueOrLength === 'number') {
    const fill = typeof lengthOrFill === 'string' ? lengthOrFill : undefined
    return (value: string): string => value.padStart(valueOrLength, fill)
  }
  return valueOrLength.padStart(lengthOrFill as number, maybeFill)
} as {
  (value: string, targetLength: number, fill?: string): string
  (targetLength: number, fill?: string): (value: string) => string
}

export const padEnd: typeof padStart = function padEnd(
  valueOrLength: string | number,
  lengthOrFill?: number | string,
  maybeFill?: string,
): string | ((value: string) => string) {
  if (typeof valueOrLength === 'number') {
    const fill = typeof lengthOrFill === 'string' ? lengthOrFill : undefined
    return (value: string): string => value.padEnd(valueOrLength, fill)
  }
  return valueOrLength.padEnd(lengthOrFill as number, maybeFill)
} as typeof padStart

export const stripPrefix: {
  (value: string, prefix: string): Option<string>
  (prefix: string): (value: string) => Option<string>
} = dual(
  2,
  (value: string, prefix: string): Option<string> =>
    value.startsWith(prefix) ? some(value.slice(prefix.length)) : none,
)

export const stripSuffix: {
  (value: string, suffix: string): Option<string>
  (suffix: string): (value: string) => Option<string>
} = dual(
  2,
  (value: string, suffix: string): Option<string> =>
    value.endsWith(suffix) ? some(value.slice(0, -suffix.length || undefined)) : none,
)

export const lines = (value: string): string[] => value.split(/\r\n?|\n/u)

export const words = (value: string): string[] => {
  const normalized = value.trim()
  return normalized === '' ? [] : normalized.split(/\s+/u)
}

export const replace: {
  (value: string, search: string | RegExp, replacement: string): string
  (search: string | RegExp, replacement: string): (value: string) => string
} = dual(
  3,
  (value: string, search: string | RegExp, replacement: string): string =>
    value.replace(search, replacement),
)

export const replaceAll: {
  (value: string, search: string | RegExp, replacement: string): string
  (search: string | RegExp, replacement: string): (value: string) => string
} = dual(
  3,
  (value: string, search: string | RegExp, replacement: string): string =>
    value.replaceAll(search, replacement),
)

export const test: {
  (value: string, expression: RegExp): boolean
  (expression: RegExp): (value: string) => boolean
} = dual(2, (value: string, expression: RegExp): boolean => {
  expression.lastIndex = 0
  return expression.test(value)
})

export const match: {
  (value: string, expression: RegExp): Option<RegExpMatchArray>
  (expression: RegExp): (value: string) => Option<RegExpMatchArray>
} = dual(2, (value: string, expression: RegExp): Option<RegExpMatchArray> => {
  expression.lastIndex = 0
  const result = value.match(expression)
  return result === null ? none : some(result)
})

export const truncate: {
  (value: string, maximum: number, omission?: string): string
  (maximum: number, omission?: string): (value: string) => string
} = function truncate(
  valueOrMaximum: string | number,
  maximumOrOmission?: number | string,
  maybeOmission: string = '…',
): string | ((value: string) => string) {
  if (typeof valueOrMaximum === 'number') {
    const omission = typeof maximumOrOmission === 'string' ? maximumOrOmission : '…'
    return (value: string): string => truncate(value, valueOrMaximum, omission) as string
  }
  const maximum = Math.max(0, Math.trunc(maximumOrOmission as number))
  if (valueOrMaximum.length <= maximum) return valueOrMaximum
  if (maximum <= maybeOmission.length) return maybeOmission.slice(0, maximum)
  return valueOrMaximum.slice(0, maximum - maybeOmission.length) + maybeOmission
} as {
  (value: string, maximum: number, omission?: string): string
  (maximum: number, omission?: string): (value: string) => string
}

export type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD'

export const normalize: {
  (value: string, form?: NormalizationForm): string
  (form?: NormalizationForm): (value: string) => string
} = function normalize(
  valueOrForm?: string,
  maybeForm?: NormalizationForm,
): string | ((value: string) => string) {
  if (
    valueOrForm === undefined ||
    valueOrForm === 'NFC' ||
    valueOrForm === 'NFD' ||
    valueOrForm === 'NFKC' ||
    valueOrForm === 'NFKD'
  ) {
    return (value: string): string => value.normalize(valueOrForm)
  }
  return valueOrForm.normalize(maybeForm)
} as {
  (value: string, form?: NormalizationForm): string
  (form?: NormalizationForm): (value: string) => string
}

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

export const kebabCase = (value: string): string =>
  lowerCaseWordParts(value).join('-')

export const snakeCase = (value: string): string =>
  lowerCaseWordParts(value).join('_')

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

const segmenter = (locale?: string): Intl.Segmenter => new Intl.Segmenter(locale, {
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
