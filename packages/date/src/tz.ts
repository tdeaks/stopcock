import { dual } from '@stopcock/fp'
import type { Timestamp, DateUnit } from './types'
import { epochDays, epochDaysToCivil, msOfDay, timeComponents, compose, civilToEpochDays, daysInMonth, MS_DAY, MS_HOUR, MS_MINUTE, MS_SECOND, stamp } from './core'
import { format as utcFormat, formatter as utcFormatter } from './format'
import { parse as utcParse, parseISO as utcParseISO } from './parse'
import { startOf as utcStartOf, endOf as utcEndOf, add as utcAdd } from './arithmetic'

// ── Types ────────────────────────────────────────────────────────────

export type Disambiguation = 'earlier' | 'later' | 'compatible'

type TransitionEntry = { at: number; offset: number }

// ── Cache ────────────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>()
const tzCache = new Map<string, TransitionEntry[]>()

function getFmt(tz: string): Intl.DateTimeFormat {
  let fmt = fmtCache.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    })
    fmtCache.set(tz, fmt)
  }
  return fmt
}

// ── Offset probing ───────────────────────────────────────────────────

// Fast path: use formatToParts to derive the UTC offset for an instant in a timezone.
// We cache the Intl formatter per timezone (expensive to create, cheap to reuse).
function probeOffset(fmt: Intl.DateTimeFormat, utcMs: number): number {
  const d = new Date(utcMs)
  const parts = fmt.formatToParts(d)
  let year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    switch (p.type) {
      case 'year': year = +p.value; break
      case 'month': month = +p.value; break
      case 'day': day = +p.value; break
      case 'hour': hour = +p.value; break
      case 'minute': minute = +p.value; break
      case 'second': second = +p.value; break
    }
  }
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  return Math.round((localAsUtc - utcMs) / 60_000) * 60_000
}

// probeWithFmt reuses the cached formatter (0.0015ms/call vs 0.05ms for toLocaleString)
function probeWithFmt(tz: string, utcMs: number): number {
  return probeOffset(getFmt(tz), utcMs)
}

// ── Transition discovery ─────────────────────────────────────────────

function binarySearchTransition(tz: string, lo: number, hi: number, loOffset: number): number {
  // Search to 60-second precision (DST transitions are always on whole minutes)
  // NOTE: cannot use >> 1 here — ms values exceed 2^31 and bitwise ops truncate to 32-bit
  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 2)
    if (probeWithFmt(tz, mid) === loOffset) lo = mid
    else hi = mid
  }
  return hi
}

function buildCache(tz: string, aroundMs: number): TransitionEntry[] {
  // Scan the year containing aroundMs, plus 2 months buffer each side
  // Use 45-day probe steps (covers all DST periods, fewer probes)
  const yearStart = aroundMs - 200 * MS_DAY
  const yearEnd = aroundMs + 200 * MS_DAY
  const PROBE_STEP = 45 * MS_DAY

  let prevOffset = probeWithFmt(tz, yearStart)
  const entries: TransitionEntry[] = [{ at: yearStart, offset: prevOffset }]

  let probe = yearStart + PROBE_STEP
  while (probe <= yearEnd) {
    const offset = probeWithFmt(tz, probe)
    if (offset !== prevOffset) {
      const exact = binarySearchTransition(tz, probe - PROBE_STEP, probe, prevOffset)
      entries.push({ at: exact, offset })
      prevOffset = offset
    }
    probe += PROBE_STEP
  }

  return entries
}

function getOrBuildCache(tz: string, utcMs: number): TransitionEntry[] {
  let entries = tzCache.get(tz)
  if (entries) {
    const first = entries[0]!.at
    const last = entries[entries.length - 1]!.at
    if (utcMs >= first && utcMs <= last + 180 * MS_DAY) return entries
    // Extend cache if timestamp is outside scanned range
    const extended = buildCache(tz, utcMs)
    // Merge: deduplicate by transition point
    const merged = new Map<number, TransitionEntry>()
    for (const e of entries) merged.set(e.at, e)
    for (const e of extended) merged.set(e.at, e)
    entries = [...merged.values()].sort((a, b) => a.at - b.at)
    tzCache.set(tz, entries)
    return entries
  }
  entries = buildCache(tz, utcMs)
  tzCache.set(tz, entries)
  return entries
}

// ── Hot path: offset resolution ──────────────────────────────────────

export function resolveOffset(tz: string, utcMs: number): number {
  const entries = getOrBuildCache(tz, utcMs)
  // Linear scan from end (2-4 entries, faster than binary search for tiny N)
  for (let i = entries.length - 1; i >= 0; i--) {
    if (utcMs >= entries[i]!.at) return entries[i]!.offset
  }
  return entries[0]!.offset
}

// ── UTC <-> Local conversions ────────────────────────────────────────

export function utcToLocal(ts: Timestamp, tz: string): Timestamp {
  return stamp((ts as number) + resolveOffset(tz, ts as number))
}

export function localToUTC(localMs: number, tz: string, disambig: Disambiguation = 'compatible'): Timestamp {
  const entries = getOrBuildCache(tz, localMs)

  // Try ALL distinct offsets in the cache (there are only 2-3)
  const offsets = new Set<number>()
  for (let i = 0; i < entries.length; i++) {
    offsets.add(entries[i]!.offset)
  }

  // Try each offset: verify it produces a self-consistent UTC instant
  const validUTCs: number[] = []
  for (const offset of offsets) {
    const utcCandidate = localMs - offset
    const actualOffset = resolveOffset(tz, utcCandidate)
    if (actualOffset === offset) {
      validUTCs.push(utcCandidate)
    }
  }

  if (validUTCs.length === 1) return stamp(validUTCs[0]!)

  if (validUTCs.length >= 2) {
    // FOLD: multiple valid UTC instants for this local time
    validUTCs.sort((a, b) => a - b)
    return stamp(disambig === 'later' ? validUTCs[validUTCs.length - 1]! : validUTCs[0]!)
  }

  // GAP: no valid UTC instant — local time doesn't exist
  // Find the transition that caused the gap by checking which transition
  // creates an inconsistency for our local time
  let transitionAt = 0
  let newOffset = 0
  for (let i = 1; i < entries.length; i++) {
    const prevOff = entries[i - 1]!.offset
    const currOff = entries[i]!.offset
    // A gap exists when clocks jump forward (new offset > old offset for positive offsets,
    // or the UTC candidate lands on the wrong side)
    const utcWithPrev = localMs - prevOff
    const utcWithCurr = localMs - currOff
    // If one lands before and one after the transition, we found our gap
    if (utcWithPrev >= entries[i]!.at && utcWithCurr < entries[i]!.at) {
      transitionAt = entries[i]!.at
      newOffset = prevOff // use old offset for 'compatible' — pushes time past gap
      break
    }
  }

  switch (disambig) {
    case 'earlier':
      return stamp(transitionAt - 1)
    case 'later':
      return stamp(transitionAt)
    case 'compatible':
    default:
      return stamp(localMs - newOffset)
  }
}

// ── Tz-aware operations ──────────────────────────────────────────────

// Extract components in local time
export const getYear: {
  (ts: Timestamp, tz: string): number
  (tz: string): (ts: Timestamp) => number
} = dual(2, (ts: Timestamp, tz: string): number =>
  epochDaysToCivil(epochDays(utcToLocal(ts, tz))).year
)

export const getMonth: {
  (ts: Timestamp, tz: string): number
  (tz: string): (ts: Timestamp) => number
} = dual(2, (ts: Timestamp, tz: string): number =>
  epochDaysToCivil(epochDays(utcToLocal(ts, tz))).month
)

export const getDay: {
  (ts: Timestamp, tz: string): number
  (tz: string): (ts: Timestamp) => number
} = dual(2, (ts: Timestamp, tz: string): number =>
  epochDaysToCivil(epochDays(utcToLocal(ts, tz))).day
)

export const getHours: {
  (ts: Timestamp, tz: string): number
  (tz: string): (ts: Timestamp) => number
} = dual(2, (ts: Timestamp, tz: string): number =>
  timeComponents(msOfDay(utcToLocal(ts, tz))).hour
)

export const getMinutes: {
  (ts: Timestamp, tz: string): number
  (tz: string): (ts: Timestamp) => number
} = dual(2, (ts: Timestamp, tz: string): number =>
  timeComponents(msOfDay(utcToLocal(ts, tz))).minute
)

export const getSeconds: {
  (ts: Timestamp, tz: string): number
  (tz: string): (ts: Timestamp) => number
} = dual(2, (ts: Timestamp, tz: string): number =>
  timeComponents(msOfDay(utcToLocal(ts, tz))).second
)

// Predicates in local time
export const isSameDay: {
  (a: Timestamp, b: Timestamp, tz: string): boolean
  (b: Timestamp, tz: string): (a: Timestamp) => boolean
} = dual(3, (a: Timestamp, b: Timestamp, tz: string): boolean =>
  epochDays(utcToLocal(a, tz)) === epochDays(utcToLocal(b, tz))
)

export function isWeekend(ts: Timestamp, tz: string): boolean {
  const d = epochDays(utcToLocal(ts, tz))
  const dow = ((d + 4) % 7 + 7) % 7
  return dow === 0 || dow === 6
}

export function isWeekday(ts: Timestamp, tz: string): boolean {
  return !isWeekend(ts, tz)
}

export function isToday(ts: Timestamp, tz: string): boolean {
  const nowLocal = utcToLocal(stamp(Date.now()), tz)
  const tsLocal = utcToLocal(ts, tz)
  return epochDays(nowLocal) === epochDays(tsLocal)
}

// startOf / endOf in local time
export const startOf: {
  (ts: Timestamp, unit: DateUnit, tz: string, disambig?: Disambiguation): Timestamp
  (unit: DateUnit, tz: string, disambig?: Disambiguation): (ts: Timestamp) => Timestamp
} = dual(3, (ts: Timestamp, unit: DateUnit, tz: string, disambig: Disambiguation = 'compatible'): Timestamp => {
  // For sub-day units, offset doesn't change within an hour
  if (unit === 'millisecond' || unit === 'second' || unit === 'minute' || unit === 'hour') {
    const local = utcToLocal(ts, tz)
    const resultLocal = utcStartOf(local, unit)
    return localToUTC(resultLocal as number, tz, disambig)
  }
  const local = utcToLocal(ts, tz)
  const resultLocal = utcStartOf(local, unit)
  return localToUTC(resultLocal as number, tz, disambig)
})

export const endOf: {
  (ts: Timestamp, unit: DateUnit, tz: string, disambig?: Disambiguation): Timestamp
  (unit: DateUnit, tz: string, disambig?: Disambiguation): (ts: Timestamp) => Timestamp
} = dual(3, (ts: Timestamp, unit: DateUnit, tz: string, disambig: Disambiguation = 'compatible'): Timestamp => {
  const local = utcToLocal(ts, tz)
  const resultLocal = utcEndOf(local, unit)
  return localToUTC(resultLocal as number, tz, disambig)
})

// add / subtract in local time (calendar units are tz-aware)
export const add: {
  (ts: Timestamp, amount: number, unit: DateUnit, tz: string, disambig?: Disambiguation): Timestamp
  (amount: number, unit: DateUnit, tz: string, disambig?: Disambiguation): (ts: Timestamp) => Timestamp
} = dual(4, (ts: Timestamp, amount: number, unit: DateUnit, tz: string, disambig: Disambiguation = 'compatible'): Timestamp => {
  // Absolute units: no tz needed
  if (unit === 'millisecond' || unit === 'second' || unit === 'minute' || unit === 'hour') {
    return utcAdd(ts, amount, unit)
  }
  // Calendar units: convert to local, add, convert back
  const local = utcToLocal(ts, tz)
  const resultLocal = utcAdd(local, amount, unit)
  return localToUTC(resultLocal as number, tz, disambig)
})

export const subtract: {
  (ts: Timestamp, amount: number, unit: DateUnit, tz: string, disambig?: Disambiguation): Timestamp
  (amount: number, unit: DateUnit, tz: string, disambig?: Disambiguation): (ts: Timestamp) => Timestamp
} = dual(4, (ts: Timestamp, amount: number, unit: DateUnit, tz: string, disambig: Disambiguation = 'compatible'): Timestamp =>
  (add as any)(ts, -amount, unit, tz, disambig)
)

// format in local time
export const format: {
  (ts: Timestamp, template: string, tz: string): string
  (template: string, tz: string): (ts: Timestamp) => string
} = dual(3, (ts: Timestamp, template: string, tz: string): string =>
  utcFormat(utcToLocal(ts, tz), template)
)

export function formatter(template: string, tz: string): (ts: Timestamp) => string {
  const fmt = utcFormatter(template)
  return (ts: Timestamp) => fmt(utcToLocal(ts, tz))
}

// parse as local time
export function parseTz(s: string, template: string, tz: string, disambig?: Disambiguation): Timestamp {
  const localMs = utcParse(s, template) as number
  return localToUTC(localMs, tz, disambig)
}

export function parserTz(template: string, tz: string, disambig: Disambiguation = 'compatible'): (s: string) => Timestamp {
  return (s: string) => {
    const localMs = utcParse(s, template) as number
    return localToUTC(localMs, tz, disambig)
  }
}

// Alias for pipe-friendly usage
export { parseTz as parse }

// diff in local time (calendar units)
export const diff: {
  (a: Timestamp, b: Timestamp, unit: DateUnit, tz: string): number
  (b: Timestamp, unit: DateUnit, tz: string): (a: Timestamp) => number
} = dual(4, (a: Timestamp, b: Timestamp, unit: DateUnit, tz: string): number => {
  if (unit === 'millisecond' || unit === 'second' || unit === 'minute' || unit === 'hour') {
    const delta = (a as number) - (b as number)
    switch (unit) {
      case 'millisecond': return delta
      case 'second': return (delta / MS_SECOND) | 0
      case 'minute': return (delta / MS_MINUTE) | 0
      case 'hour': return (delta / MS_HOUR) | 0
    }
  }
  const aLocal = utcToLocal(a, tz)
  const bLocal = utcToLocal(b, tz)
  const ac = epochDaysToCivil(epochDays(aLocal))
  const bc = epochDaysToCivil(epochDays(bLocal))
  switch (unit) {
    case 'day': return epochDays(aLocal) - epochDays(bLocal)
    case 'week': return ((epochDays(aLocal) - epochDays(bLocal)) / 7) | 0
    case 'month': return (ac.year - bc.year) * 12 + (ac.month - bc.month)
    case 'year': return ac.year - bc.year
    default: return 0
  }
})

// Get the timezone abbreviation at a given instant
export function getOffsetString(ts: Timestamp, tz: string): string {
  const offset = resolveOffset(tz, ts as number)
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const h = (abs / MS_HOUR) | 0
  const m = ((abs % MS_HOUR) / MS_MINUTE) | 0
  return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function getOffsetMinutes(ts: Timestamp, tz: string): number {
  return resolveOffset(tz, ts as number) / MS_MINUTE
}

// Clear the cache (useful for testing or long-running processes)
export function clearCache(): void {
  tzCache.clear()
  fmtCache.clear()
}
