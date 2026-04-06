import { dual } from '@stopcock/fp'
import type { Timestamp } from './types'
import { epochDays, epochDaysToCivil, msOfDay, timeComponents } from './core'

// ── Lookup tables (allocated once, shared) ───────────────────────────

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const SHORT_MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const LONG_MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const

// ── Pad helpers (no string allocation for common cases) ──────────────

function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

function pad3(n: number): string {
  return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n
}

function pad4(n: number): string {
  if (n < 10) return '000' + n
  if (n < 100) return '00' + n
  if (n < 1000) return '0' + n
  return '' + n
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10]! || s[v]! || s[0]!)
}

// ── Compiled formatter ───────────────────────────────────────────────
// Parses the template once into an array of "part" functions.
// Each part is either a literal string or a token extractor.
// The compiled function runs the parts array — no parsing per call.

const enum Need { NONE = 0, CIVIL = 1, TIME = 2, BOTH = 3 }

type Part = {
  fn: (y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, dow: number) => string
  need: Need
}

const TOKENS: [string, Part][] = [
  ['YYYY', { fn: (y) => pad4(y), need: Need.CIVIL }],
  ['YY',   { fn: (y) => pad2(y % 100), need: Need.CIVIL }],
  ['MMMM', { fn: (_y, mo) => LONG_MONTHS[mo]!, need: Need.CIVIL }],
  ['MMM',  { fn: (_y, mo) => SHORT_MONTHS[mo]!, need: Need.CIVIL }],
  ['MM',   { fn: (_y, mo) => pad2(mo), need: Need.CIVIL }],
  ['M',    { fn: (_y, mo) => '' + mo, need: Need.CIVIL }],
  ['Do',   { fn: (_y, _mo, d) => ordinal(d), need: Need.CIVIL }],
  ['DD',   { fn: (_y, _mo, d) => pad2(d), need: Need.CIVIL }],
  ['D',    { fn: (_y, _mo, d) => '' + d, need: Need.CIVIL }],
  ['dddd', { fn: (_y, _mo, _d, _h, _mi, _s, _ms, dow) => LONG_DAYS[dow]!, need: Need.CIVIL }],
  ['ddd',  { fn: (_y, _mo, _d, _h, _mi, _s, _ms, dow) => SHORT_DAYS[dow]!, need: Need.CIVIL }],
  ['HH',   { fn: (_y, _mo, _d, h) => pad2(h), need: Need.TIME }],
  ['H',    { fn: (_y, _mo, _d, h) => '' + h, need: Need.TIME }],
  ['hh',   { fn: (_y, _mo, _d, h) => pad2(h % 12 || 12), need: Need.TIME }],
  ['h',    { fn: (_y, _mo, _d, h) => '' + (h % 12 || 12), need: Need.TIME }],
  ['mm',   { fn: (_y, _mo, _d, _h, mi) => pad2(mi), need: Need.TIME }],
  ['m',    { fn: (_y, _mo, _d, _h, mi) => '' + mi, need: Need.TIME }],
  ['ss',   { fn: (_y, _mo, _d, _h, _mi, s) => pad2(s), need: Need.TIME }],
  ['s',    { fn: (_y, _mo, _d, _h, _mi, s) => '' + s, need: Need.TIME }],
  ['SSS',  { fn: (_y, _mo, _d, _h, _mi, _s, ms) => pad3(ms), need: Need.TIME }],
  ['A',    { fn: (_y, _mo, _d, h) => h < 12 ? 'AM' : 'PM', need: Need.TIME }],
  ['a',    { fn: (_y, _mo, _d, h) => h < 12 ? 'am' : 'pm', need: Need.TIME }],
]

type CompiledFormatter = (ts: Timestamp) => string

function compile(template: string): CompiledFormatter {
  const parts: ((y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, dow: number) => string)[] = []
  let needs = Need.NONE
  let i = 0

  while (i < template.length) {
    let matched = false
    for (const [token, part] of TOKENS) {
      if (template.startsWith(token, i)) {
        parts.push(part.fn)
        needs |= part.need
        i += token.length
        matched = true
        break
      }
    }
    if (!matched) {
      // Collect literal run
      let lit = template[i]!
      i++
      while (i < template.length) {
        let isToken = false
        for (const [token] of TOKENS) {
          if (template.startsWith(token, i)) { isToken = true; break }
        }
        if (isToken) break
        lit += template[i]
        i++
      }
      const literal = lit
      parts.push(() => literal)
    }
  }

  const needsCivil = (needs & Need.CIVIL) !== 0
  const needsTime = (needs & Need.TIME) !== 0

  return (ts: Timestamp) => {
    let y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0, ms = 0, dow = 0

    if (needsCivil) {
      const ed = epochDays(ts)
      const civil = epochDaysToCivil(ed)
      y = civil.year; mo = civil.month; d = civil.day
      dow = ((ed + 4) % 7 + 7) % 7
    }
    if (needsTime) {
      const tod = msOfDay(ts)
      const time = timeComponents(tod)
      h = time.hour; mi = time.minute; s = time.second; ms = time.millisecond
    }

    let out = ''
    for (let i = 0; i < parts.length; i++) {
      out += parts[i]!(y, mo, d, h, mi, s, ms, dow)
    }
    return out
  }
}

// ── Cache ────────────────────────────────────────────────────────────

const cache = new Map<string, CompiledFormatter>()

function getFormatter(template: string): CompiledFormatter {
  let fn = cache.get(template)
  if (fn === undefined) {
    fn = compile(template)
    cache.set(template, fn)
  }
  return fn
}

// ── Public API ───────────────────────────────────────────────────────

let _lastFmtTpl = '', _lastFmt: CompiledFormatter

export const format: {
  (ts: Timestamp, template: string): string
  (template: string): (ts: Timestamp) => string
} = function format(a: any, b?: any): any {
  if (b !== undefined) {
    if (b === _lastFmtTpl) return _lastFmt(a)
    _lastFmtTpl = b
    _lastFmt = getFormatter(b)
    return _lastFmt(a)
  }
  const fn = getFormatter(a)
  return (ts: Timestamp) => fn(ts)
} as any

export function formatter(template: string): (ts: Timestamp) => string {
  return getFormatter(template)
}
