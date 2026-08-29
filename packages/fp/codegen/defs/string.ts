import { dual } from './dual'
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

export const startsWith: {
  (value: string, prefix: string): boolean
  (prefix: string): (value: string) => boolean
} = /* @__PURE__ */ dual(2, (value: string, prefix: string): boolean => value.startsWith(prefix), (prefix) => (value) =>
    value.startsWith(prefix))

export const endsWith: {
  (value: string, suffix: string): boolean
  (suffix: string): (value: string) => boolean
} = /* @__PURE__ */ dual(2, (value: string, suffix: string): boolean => value.endsWith(suffix), (suffix) => (value) =>
    value.endsWith(suffix))

export const includes: {
  (value: string, search: string): boolean
  (search: string): (value: string) => boolean
} = /* @__PURE__ */ dual(2, (value: string, search: string): boolean => value.includes(search), (search) => (value) =>
    value.includes(search))

export const split: {
  (value: string, separator: string | RegExp): string[]
  (separator: string | RegExp): (value: string) => string[]
} = ((
  valueOrSeparator: string | RegExp,
  ...rest: [separator?: string | RegExp]
): string[] | ((value: string) => string[]) => {
  if (rest.length > 0) {
    return (valueOrSeparator as string).split(rest[0] as string | RegExp)
  }
  const separator = valueOrSeparator
  return (value) =>
    value.split(separator)
}) as {
  (value: string, separator: string | RegExp): string[]
  (separator: string | RegExp): (value: string) => string[]
}

export const repeat: {
  (value: string, count: number): string
  (count: number): (value: string) => string
} = /* @__PURE__ */ dual(2, (value: string, count: number): string => value.repeat(count), (count) => (value) =>
    value.repeat(count))

export const slice: {
  (value: string, start: number, end?: number): string
  (start: number, end?: number): (value: string) => string
} = function slice(
  valueOrStart: string | number,
  startOrEnd?: number,
  maybeEnd?: number,
): string | ((value: string) => string) {
  if (typeof valueOrStart === 'number') {
    const start = valueOrStart
    const end = startOrEnd
    return (value) =>
    value.slice(start, end)
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
    const targetLength = valueOrLength
    const fill = typeof lengthOrFill === 'string' ? lengthOrFill : undefined
    return (value) =>
    value.padStart(targetLength, fill)
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
    const targetLength = valueOrLength
    const fill = typeof lengthOrFill === 'string' ? lengthOrFill : undefined
    return (value) =>
    value.padEnd(targetLength, fill)
  }
  return valueOrLength.padEnd(lengthOrFill as number, maybeFill)
} as typeof padStart

export const stripPrefix: {
  (value: string, prefix: string): Option<string>
  (prefix: string): (value: string) => Option<string>
} = /* @__PURE__ */ dual(
  2,
  (value: string, prefix: string): Option<string> =>
    value.startsWith(prefix) ? some(value.slice(prefix.length)) : none,
  (prefix) => (value) =>
    value.startsWith(prefix) ? some(value.slice(prefix.length)) : none,
)

export const stripSuffix: {
  (value: string, suffix: string): Option<string>
  (suffix: string): (value: string) => Option<string>
} = /* @__PURE__ */ dual(
  2,
  (value: string, suffix: string): Option<string> =>
    value.endsWith(suffix) ? some(value.slice(0, -suffix.length || undefined)) : none,
  (suffix) => (value) =>
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
} = /* @__PURE__ */ dual(3, (value: string, search: string | RegExp, replacement: string): string =>
  value.replace(search, replacement),
  (search, replacement) => (value) =>
    value.replace(search, replacement),
)

export const replaceAll: {
  (value: string, search: string | RegExp, replacement: string): string
  (search: string | RegExp, replacement: string): (value: string) => string
} = /* @__PURE__ */ dual(3, (value: string, search: string | RegExp, replacement: string): string =>
  value.replaceAll(search, replacement),
  (search, replacement) => (value) =>
  value.replaceAll(search, replacement),
)

export const test: {
  (value: string, expression: RegExp): boolean
  (expression: RegExp): (value: string) => boolean
} = /* @__PURE__ */ dual(2, (value: string, expression: RegExp): boolean => {
  expression.lastIndex = 0
  return expression.test(value)
},
  (expression) => (value) => {
    expression.lastIndex = 0
    return expression.test(value)
  },
)

export const match: {
  (value: string, expression: RegExp): Option<RegExpMatchArray>
  (expression: RegExp): (value: string) => Option<RegExpMatchArray>
} = /* @__PURE__ */ dual(2, (value: string, expression: RegExp): Option<RegExpMatchArray> => {
  expression.lastIndex = 0
  const result = value.match(expression)
  return result === null ? none : some(result)
},
  (expression) => (value) => {
    expression.lastIndex = 0
    const result = value.match(expression)
    return result === null ? none : some(result)
  },
)

export const truncate: {
  (value: string, maximum: number, omission?: string): string
  (maximum: number, omission?: string): (value: string) => string
} = function truncate(
  valueOrMaximum: string | number,
  maximumOrOmission?: number | string,
  maybeOmission: string = '…',
): string | ((value: string) => string) {
  if (typeof valueOrMaximum === 'string') {
    const maximum = Math.max(0, Math.trunc(maximumOrOmission as number))
    if (valueOrMaximum.length <= maximum) return valueOrMaximum
    if (maximum <= maybeOmission.length) return maybeOmission.slice(0, maximum)
    return valueOrMaximum.slice(0, maximum - maybeOmission.length) + maybeOmission
  }
  const maximum = valueOrMaximum
  const omission = typeof maximumOrOmission === 'string' ? maximumOrOmission : '…'
  return (value) => {
    const bound = Math.max(0, Math.trunc(maximum))
    if (value.length <= bound) return value
    if (bound <= omission.length) return omission.slice(0, bound)
    return value.slice(0, bound - omission.length) + omission
  }
} as {
  (value: string, maximum: number, omission?: string): string
  (maximum: number, omission?: string): (value: string) => string
}

export type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD'

export const normalize: {
  (value: string, form: NormalizationForm | undefined): string
  (form?: NormalizationForm): (value: string) => string
} = function normalize(
  valueOrForm?: string,
  maybeForm?: NormalizationForm,
): string | ((value: string) => string) {
  if (arguments.length >= 2) {
    return (valueOrForm as string).normalize(maybeForm)
  }
  const form = valueOrForm as NormalizationForm | undefined
  return (value) =>
    value.normalize(form)
} as {
  (value: string, form: NormalizationForm | undefined): string
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

export const graphemes: {
  (value: string, locale: string | undefined): string[]
  (locale?: string): (value: string) => string[]
} = function graphemes(
  valueOrLocale?: string,
  maybeLocale?: string,
): string[] | ((value: string) => string[]) {
  if (arguments.length >= 2) {
    return Array.from(
      segmenter(maybeLocale).segment(valueOrLocale as string),
      (part) => part.segment,
    )
  }
  const locale = valueOrLocale
  return (value: string): string[] =>
    Array.from(segmenter(locale).segment(value), (part) => part.segment)
} as {
  (value: string, locale: string | undefined): string[]
  (locale?: string): (value: string) => string[]
}

export const graphemeLength: {
  (value: string, locale: string | undefined): number
  (locale?: string): (value: string) => number
} = function graphemeLength(
  valueOrLocale?: string,
  maybeLocale?: string,
): number | ((value: string) => number) {
  if (arguments.length >= 2) {
    let count = 0
    for (const _part of segmenter(maybeLocale).segment(valueOrLocale as string)) count++
    return count
  }
  const locale = valueOrLocale
  return (value: string): number => {
    let count = 0
    for (const _part of segmenter(locale).segment(value)) count++
    return count
  }
} as {
  (value: string, locale: string | undefined): number
  (locale?: string): (value: string) => number
}

const parseJsonValue = <A = unknown>(
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

export const parseJson: {
  <A = unknown>(
    value: string,
    validate?: (value: unknown) => value is A,
  ): Result<A, SyntaxError | TypeError>
  <A = unknown>(
    validate?: (value: unknown) => value is A,
  ): (value: string) => Result<A, SyntaxError | TypeError>
} = function parseJson<A = unknown>(
  valueOrValidate?: string | ((value: unknown) => value is A),
  maybeValidate?: (value: unknown) => value is A,
): Result<A, SyntaxError | TypeError> | ((value: string) => Result<A, SyntaxError | TypeError>) {
  if (typeof valueOrValidate === 'string') {
    return parseJsonValue(valueOrValidate, maybeValidate)
  }
  const validate = valueOrValidate
  return (value: string): Result<A, SyntaxError | TypeError> => parseJsonValue(value, validate)
} as {
  <A = unknown>(
    value: string,
    validate?: (value: unknown) => value is A,
  ): Result<A, SyntaxError | TypeError>
  <A = unknown>(
    validate?: (value: unknown) => value is A,
  ): (value: string) => Result<A, SyntaxError | TypeError>
}
