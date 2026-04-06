import { dual } from '@stopcock/fp'
import type { Timestamp } from './types'
import { compose, stamp } from './core'

// ── Compiled parser ──────────────────────────────────────────────────
// Compiles a format string into a function that extracts date components
// from a string at known character offsets using charCodeAt arithmetic.
// No regex, no substring allocation, no parseInt.

type Extractor = (s: string, offset: number) => [value: number, consumed: number]

function digits1(s: string, offset: number): [number, number] {
  const c0 = s.charCodeAt(offset) - 48
  if (c0 < 0 || c0 > 9) return [0, 0]
  const c1 = s.charCodeAt(offset + 1) - 48
  if (c1 < 0 || c1 > 9) return [c0, 1]
  return [c0 * 10 + c1, 2]
}

function digits2(s: string, offset: number): [number, number] {
  return [(s.charCodeAt(offset) - 48) * 10 + (s.charCodeAt(offset + 1) - 48), 2]
}

function digits3(s: string, offset: number): [number, number] {
  return [
    (s.charCodeAt(offset) - 48) * 100 +
    (s.charCodeAt(offset + 1) - 48) * 10 +
    (s.charCodeAt(offset + 2) - 48),
    3
  ]
}

function digits4(s: string, offset: number): [number, number] {
  return [
    (s.charCodeAt(offset) - 48) * 1000 +
    (s.charCodeAt(offset + 1) - 48) * 100 +
    (s.charCodeAt(offset + 2) - 48) * 10 +
    (s.charCodeAt(offset + 3) - 48),
    4
  ]
}

const enum Field { YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, MS, AMPM, SKIP }

type ParsePart = {
  field: Field
  extract: Extractor
}

const PARSE_TOKENS: [string, ParsePart][] = [
  ['YYYY', { field: Field.YEAR, extract: digits4 }],
  ['YY',   { field: Field.YEAR, extract: (s, o) => { const [v, c] = digits2(s, o); return [v + 2000, c] } }],
  ['MM',   { field: Field.MONTH, extract: digits2 }],
  ['M',    { field: Field.MONTH, extract: digits1 }],
  ['DD',   { field: Field.DAY, extract: digits2 }],
  ['D',    { field: Field.DAY, extract: digits1 }],
  ['HH',   { field: Field.HOUR, extract: digits2 }],
  ['H',    { field: Field.HOUR, extract: digits1 }],
  ['hh',   { field: Field.HOUR, extract: digits2 }],
  ['h',    { field: Field.HOUR, extract: digits1 }],
  ['mm',   { field: Field.MINUTE, extract: digits2 }],
  ['m',    { field: Field.MINUTE, extract: digits1 }],
  ['ss',   { field: Field.SECOND, extract: digits2 }],
  ['s',    { field: Field.SECOND, extract: digits1 }],
  ['SSS',  { field: Field.MS, extract: digits3 }],
  ['A',    { field: Field.AMPM, extract: (s, o) => [s.charCodeAt(o) === 80 /* P */ ? 1 : 0, 2] }],
  ['a',    { field: Field.AMPM, extract: (s, o) => [s.charCodeAt(o) === 112 /* p */ ? 1 : 0, 2] }],
]

type CompiledParser = (s: string) => Timestamp

function compileParser(template: string): CompiledParser {
  const parts: { field: Field; extract: Extractor; offset: number }[] = []
  let pos = 0
  let i = 0

  while (i < template.length) {
    let matched = false
    for (const [token, part] of PARSE_TOKENS) {
      if (template.startsWith(token, i)) {
        parts.push({ field: part.field, extract: part.extract, offset: pos })
        pos += token === 'YYYY' ? 4 : token === 'SSS' ? 3 : token === 'M' || token === 'D' || token === 'H' || token === 'h' || token === 'm' || token === 's' ? -1 : 2
        i += token.length
        matched = true
        break
      }
    }
    if (!matched) {
      pos++
      i++
    }
  }

  // For fixed-width formats, use direct offset extraction (fastest path)
  const hasVariable = parts.some(p => p.offset < 0)

  if (!hasVariable) {
    return (s: string) => {
      let year = 1970, month = 1, day = 1, hour = 0, minute = 0, second = 0, ms = 0, ampm = -1

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]!
        const [val] = p.extract(s, p.offset)
        switch (p.field) {
          case Field.YEAR: year = val; break
          case Field.MONTH: month = val; break
          case Field.DAY: day = val; break
          case Field.HOUR: hour = val; break
          case Field.MINUTE: minute = val; break
          case Field.SECOND: second = val; break
          case Field.MS: ms = val; break
          case Field.AMPM: ampm = val; break
        }
      }

      if (ampm === 1 && hour < 12) hour += 12
      else if (ampm === 0 && hour === 12) hour = 0

      return compose(year, month, day, hour, minute, second, ms)
    }
  }

  // Variable-width: scan left to right
  return (s: string) => {
    let year = 1970, month = 1, day = 1, hour = 0, minute = 0, second = 0, ms = 0, ampm = -1
    let offset = 0

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!
      const actualOffset = p.offset >= 0 ? p.offset : offset
      const [val, consumed] = p.extract(s, actualOffset)
      offset = actualOffset + consumed

      switch (p.field) {
        case Field.YEAR: year = val; break
        case Field.MONTH: month = val; break
        case Field.DAY: day = val; break
        case Field.HOUR: hour = val; break
        case Field.MINUTE: minute = val; break
        case Field.SECOND: second = val; break
        case Field.MS: ms = val; break
        case Field.AMPM: ampm = val; break
      }
    }

    if (ampm === 1 && hour < 12) hour += 12
    else if (ampm === 0 && hour === 12) hour = 0

    return compose(year, month, day, hour, minute, second, ms)
  }
}

// ── Cache ────────────────────────────────────────────────────────────

const cache = new Map<string, CompiledParser>()

function getParser(template: string): CompiledParser {
  let fn = cache.get(template)
  if (fn === undefined) {
    fn = compileParser(template)
    cache.set(template, fn)
  }
  return fn
}

// ── Hardcoded fast path for ISO 8601 ─────────────────────────────────

export function parseISO(s: string): Timestamp {
  // "2024-01-15T10:30:00.000Z". Fixed offsets, pure charCodeAt
  const year = (s.charCodeAt(0) - 48) * 1000 + (s.charCodeAt(1) - 48) * 100 + (s.charCodeAt(2) - 48) * 10 + (s.charCodeAt(3) - 48)
  const month = (s.charCodeAt(5) - 48) * 10 + (s.charCodeAt(6) - 48)
  const day = (s.charCodeAt(8) - 48) * 10 + (s.charCodeAt(9) - 48)

  if (s.length <= 10) return compose(year, month, day, 0, 0, 0, 0)

  const hour = (s.charCodeAt(11) - 48) * 10 + (s.charCodeAt(12) - 48)
  const minute = (s.charCodeAt(14) - 48) * 10 + (s.charCodeAt(15) - 48)
  const second = (s.charCodeAt(17) - 48) * 10 + (s.charCodeAt(18) - 48)
  const ms = s.length >= 23
    ? (s.charCodeAt(20) - 48) * 100 + (s.charCodeAt(21) - 48) * 10 + (s.charCodeAt(22) - 48)
    : 0

  return compose(year, month, day, hour, minute, second, ms)
}

// ── Public API ───────────────────────────────────────────────────────

let _lastParseTpl = '', _lastParse: CompiledParser

export const parse: {
  (s: string, template: string): Timestamp
  (template: string): (s: string) => Timestamp
} = function parse(a: any, b?: any): any {
  if (b !== undefined) {
    if (b === _lastParseTpl) return _lastParse(a)
    _lastParseTpl = b
    _lastParse = getParser(b)
    return _lastParse(a)
  }
  const fn = getParser(a)
  return (s: string) => fn(s)
} as any

export function parser(template: string): (s: string) => Timestamp {
  return getParser(template)
}

export const tryParse: {
  (s: string, template: string): Timestamp | null
  (template: string): (s: string) => Timestamp | null
} = dual(2, (s: string, template: string): Timestamp | null => {
  try {
    const result = getParser(template)(s)
    return Number.isNaN(result as number) ? null : result
  } catch {
    return null
  }
})

export function tryParser(template: string): (s: string) => Timestamp | null {
  const fn = getParser(template)
  return (s: string) => {
    try {
      const result = fn(s)
      return Number.isNaN(result as number) ? null : result
    } catch {
      return null
    }
  }
}
