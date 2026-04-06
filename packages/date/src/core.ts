import type { Civil, Timestamp } from './types'

// ── Constants ────────────────────────────────────────────────────────
export const MS_SECOND = 1000
export const MS_MINUTE = 60_000
export const MS_HOUR = 3_600_000
export const MS_DAY = 86_400_000
export const MS_WEEK = 604_800_000

export const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

// ── Hinnant: epoch-days <-> civil date ───────────────────────────────
// Reference: https://howardhinnant.github.io/date_algorithms.html
// Pure integer arithmetic, no branches, no Date object.

export function epochDaysToCivil(z: number): Civil {
  z += 719468
  const era = Math.floor(z >= 0 ? z / 146097 : (z - 146096) / 146097)
  const doe = z - era * 146097                                        // [0, 146096]
  let yoe = Math.floor((doe - Math.floor(doe / 1461) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365) // [0, 399]
  if (yoe === 400) yoe = 399 // JS float division edge case at era boundary
  let doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)) // [0, 365]
  if (doy < 0) { yoe--; doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)) }
  const y = yoe + era * 400
  const mp = Math.floor((5 * doy + 2) / 153)                          // [0, 11]
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1                  // [1, 31]
  const m = mp + (mp < 10 ? 3 : -9)                                   // [1, 12]
  return { year: y + (m <= 2 ? 1 : 0), month: m, day: d }
}

export function civilToEpochDays(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y >= 0 ? y / 400 : (y - 399) / 400)
  const yoe = y - era * 400                                           // [0, 399]
  const m = month <= 2 ? month + 9 : month - 3                        // [0, 11]
  const doy = Math.floor((153 * m + 2) / 5) + day - 1                 // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy // [0, 146096]
  return era * 146097 + doe - 719468
}

// ── Time-of-day decomposition (modular arithmetic only) ──────────────

export function msOfDay(ts: Timestamp): number {
  const r = (ts as number) % MS_DAY
  return r < 0 ? r + MS_DAY : r
}

export function epochDays(ts: Timestamp): number {
  return Math.floor((ts as number) / MS_DAY)
}

export function timeComponents(ms: number): { hour: number; minute: number; second: number; millisecond: number } {
  return {
    hour: (ms / MS_HOUR) | 0,
    minute: ((ms % MS_HOUR) / MS_MINUTE) | 0,
    second: ((ms % MS_MINUTE) / MS_SECOND) | 0,
    millisecond: ms % MS_SECOND,
  }
}

// ── Compose: civil + time -> Timestamp ───────────────────────────────

export function compose(year: number, month: number, day: number, hour: number, minute: number, second: number, ms: number): Timestamp {
  return (civilToEpochDays(year, month, day) * MS_DAY + hour * MS_HOUR + minute * MS_MINUTE + second * MS_SECOND + ms) as Timestamp
}

// ── Full decomposition (only when both date + time needed) ───────────

export function decompose(ts: Timestamp): { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number } {
  const ms = msOfDay(ts)
  const civil = epochDaysToCivil(epochDays(ts))
  const time = timeComponents(ms)
  return { ...civil, ...time }
}

// ── Leap year (no Date, pure arithmetic) ─────────────────────────────

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return DAYS_IN_MONTH[month]!
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365
}

// ── Branding helpers ─────────────────────────────────────────────────

export const stamp = (n: number) => n as Timestamp
