import { dual } from '@stopcock/fp'
import type { Timestamp } from './types'
import { epochDays, MS_DAY, stamp } from './core'

function weekdayOf(d: number): number {
  return ((d + 4) % 7 + 7) % 7 // 0=Sun
}

export function isBusinessDay(ts: Timestamp): boolean {
  const dow = weekdayOf(epochDays(ts))
  return dow !== 0 && dow !== 6
}

export const addBusinessDays: {
  (ts: Timestamp, amount: number): Timestamp
  (amount: number): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, amount: number): Timestamp => {
  let d = epochDays(ts)
  let remaining = Math.abs(amount)
  const dir = amount >= 0 ? 1 : -1
  while (remaining > 0) {
    d += dir
    const dow = weekdayOf(d)
    if (dow !== 0 && dow !== 6) remaining--
  }
  // Preserve time-of-day
  return stamp(d * MS_DAY + (ts as number) % MS_DAY)
})

export const subtractBusinessDays: {
  (ts: Timestamp, amount: number): Timestamp
  (amount: number): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, amount: number): Timestamp =>
  (addBusinessDays as any)(ts, -amount)
)

export const businessDaysBetween: {
  (a: Timestamp, b: Timestamp): number
  (b: Timestamp): (a: Timestamp) => number
} = dual(2, (a: Timestamp, b: Timestamp): number => {
  let d1 = epochDays(a)
  let d2 = epochDays(b)
  if (d1 > d2) { const tmp = d1; d1 = d2; d2 = tmp }
  let count = 0
  for (let d = d1 + 1; d <= d2; d++) {
    const dow = weekdayOf(d)
    if (dow !== 0 && dow !== 6) count++
  }
  return count
})

export function nextBusinessDay(ts: Timestamp): Timestamp {
  return (addBusinessDays as any)(ts, 1)
}

export function prevBusinessDay(ts: Timestamp): Timestamp {
  return (addBusinessDays as any)(ts, -1)
}

export const addBusinessDaysWithHolidays: {
  (ts: Timestamp, amount: number, holidays: readonly Timestamp[]): Timestamp
  (amount: number, holidays: readonly Timestamp[]): (ts: Timestamp) => Timestamp
} = dual(3, (ts: Timestamp, amount: number, holidays: readonly Timestamp[]): Timestamp => {
  const holidaySet = new Set(holidays.map(h => epochDays(h)))
  let d = epochDays(ts)
  let remaining = Math.abs(amount)
  const dir = amount >= 0 ? 1 : -1
  while (remaining > 0) {
    d += dir
    const dow = weekdayOf(d)
    if (dow !== 0 && dow !== 6 && !holidaySet.has(d)) remaining--
  }
  return stamp(d * MS_DAY + (ts as number) % MS_DAY)
})
