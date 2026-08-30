import type { Timestamp } from './types'
import { epochDays, MS_DAY, stamp } from './core'

function weekdayOf(d: number): number {
  return (((d + 4) % 7) + 7) % 7 // 0=Sun
}

export function isBusinessDay(ts: Timestamp): boolean {
  const dow = weekdayOf(epochDays(ts))
  return dow !== 0 && dow !== 6
}

function addBusinessDaysImpl(ts: Timestamp, amount: number): Timestamp {
  let d = epochDays(ts)
  let remaining = Math.abs(amount)
  const dir = amount >= 0 ? 1 : -1
  while (remaining > 0) {
    d += dir
    const dow = weekdayOf(d)
    if (dow !== 0 && dow !== 6) remaining--
  }
  // Preserve time-of-day
  return stamp(d * MS_DAY + ((ts as number) % MS_DAY))
}

export const addBusinessDays: {
  (ts: Timestamp, amount: number): Timestamp
  (amount: number): (ts: Timestamp) => Timestamp
} = function addBusinessDays(tsOrAmount: Timestamp | number, amount?: number): any {
  if (arguments.length >= 2) return addBusinessDaysImpl(tsOrAmount as Timestamp, amount as number)
  const selectedAmount = tsOrAmount as number
  return (ts: Timestamp): Timestamp => addBusinessDaysImpl(ts, selectedAmount)
}

export const subtractBusinessDays: {
  (ts: Timestamp, amount: number): Timestamp
  (amount: number): (ts: Timestamp) => Timestamp
} = function subtractBusinessDays(tsOrAmount: Timestamp | number, amount?: number): any {
  if (arguments.length >= 2) return (addBusinessDays as any)(tsOrAmount, -(amount as number))
  const selectedAmount = tsOrAmount as number
  return (ts: Timestamp): Timestamp => (addBusinessDays as any)(ts, -selectedAmount)
}

function businessDaysBetweenImpl(a: Timestamp, b: Timestamp): number {
  let d1 = epochDays(a)
  let d2 = epochDays(b)
  if (d1 > d2) {
    const tmp = d1
    d1 = d2
    d2 = tmp
  }
  let count = 0
  for (let d = d1 + 1; d <= d2; d++) {
    const dow = weekdayOf(d)
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

export const businessDaysBetween: {
  (a: Timestamp, b: Timestamp): number
  (b: Timestamp): (a: Timestamp) => number
} = function businessDaysBetween(aOrB: Timestamp, b?: Timestamp): any {
  if (arguments.length >= 2) return businessDaysBetweenImpl(aOrB, b as Timestamp)
  const end = aOrB
  return (a: Timestamp): number => businessDaysBetweenImpl(a, end)
}

export function nextBusinessDay(ts: Timestamp): Timestamp {
  return (addBusinessDays as any)(ts, 1)
}

export function prevBusinessDay(ts: Timestamp): Timestamp {
  return (addBusinessDays as any)(ts, -1)
}

function addBusinessDaysWithHolidaysImpl(
  ts: Timestamp,
  amount: number,
  holidays: readonly Timestamp[],
): Timestamp {
  const holidaySet = new Set(holidays.map((h) => epochDays(h)))
  let d = epochDays(ts)
  let remaining = Math.abs(amount)
  const dir = amount >= 0 ? 1 : -1
  while (remaining > 0) {
    d += dir
    const dow = weekdayOf(d)
    if (dow !== 0 && dow !== 6 && !holidaySet.has(d)) remaining--
  }
  return stamp(d * MS_DAY + ((ts as number) % MS_DAY))
}

export const addBusinessDaysWithHolidays: {
  (ts: Timestamp, amount: number, holidays: readonly Timestamp[]): Timestamp
  (amount: number, holidays: readonly Timestamp[]): (ts: Timestamp) => Timestamp
} = function addBusinessDaysWithHolidays(
  tsOrAmount: Timestamp | number,
  amountOrHolidays: number | readonly Timestamp[],
  holidays?: readonly Timestamp[],
): any {
  if (arguments.length >= 3) {
    return addBusinessDaysWithHolidaysImpl(
      tsOrAmount as Timestamp,
      amountOrHolidays as number,
      holidays as readonly Timestamp[],
    )
  }
  const amount = tsOrAmount as number
  const selectedHolidays = amountOrHolidays as readonly Timestamp[]
  return (ts: Timestamp): Timestamp => addBusinessDaysWithHolidaysImpl(ts, amount, selectedHolidays)
}
