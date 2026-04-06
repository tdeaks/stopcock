import type { Timestamp, Weekday } from './types'
import { epochDays, epochDaysToCivil, msOfDay, timeComponents, isLeapYear as _isLeapYear, daysInMonth as _daysInMonth, daysInYear as _daysInYear, civilToEpochDays, MS_DAY } from './core'

export function getYear(ts: Timestamp): number {
  return epochDaysToCivil(epochDays(ts)).year
}

export function getMonth(ts: Timestamp): number {
  return epochDaysToCivil(epochDays(ts)).month
}

export function getDay(ts: Timestamp): number {
  return epochDaysToCivil(epochDays(ts)).day
}

export function getWeekday(ts: Timestamp): Weekday {
  const d = epochDays(ts)
  const r = ((d + 4) % 7 + 7) % 7
  return r as Weekday
}

export function getHours(ts: Timestamp): number {
  return timeComponents(msOfDay(ts)).hour
}

export function getMinutes(ts: Timestamp): number {
  return timeComponents(msOfDay(ts)).minute
}

export function getSeconds(ts: Timestamp): number {
  return timeComponents(msOfDay(ts)).second
}

export function getMilliseconds(ts: Timestamp): number {
  return timeComponents(msOfDay(ts)).millisecond
}

export function getDayOfYear(ts: Timestamp): number {
  const { year, month, day } = epochDaysToCivil(epochDays(ts))
  const jan1 = civilToEpochDays(year, 1, 1)
  return epochDays(ts) - jan1 + 1
}

export function getWeekOfYear(ts: Timestamp): number {
  const d = epochDays(ts)
  const { year } = epochDaysToCivil(d)
  const jan4 = civilToEpochDays(year, 1, 4)
  const jan4Weekday = ((jan4 + 3) % 7 + 7) % 7
  const week1Monday = jan4 - jan4Weekday
  const daysSinceWeek1 = d - week1Monday
  if (daysSinceWeek1 < 0) {
    const prevJan4 = civilToEpochDays(year - 1, 1, 4)
    const prevJan4Weekday = ((prevJan4 + 3) % 7 + 7) % 7
    const prevWeek1Monday = prevJan4 - prevJan4Weekday
    return ((d - prevWeek1Monday) / 7 | 0) + 1
  }
  const week = (daysSinceWeek1 / 7 | 0) + 1
  if (week > 52) {
    const nextJan4 = civilToEpochDays(year + 1, 1, 4)
    const nextJan4Weekday = ((nextJan4 + 3) % 7 + 7) % 7
    const nextWeek1Monday = nextJan4 - nextJan4Weekday
    if (d >= nextWeek1Monday) return 1
  }
  return week
}

export function getQuarter(ts: Timestamp): 1 | 2 | 3 | 4 {
  const m = getMonth(ts)
  return ((m - 1) / 3 | 0) + 1 as 1 | 2 | 3 | 4
}

export function getDaysInMonth(ts: Timestamp): number {
  const { year, month } = epochDaysToCivil(epochDays(ts))
  return _daysInMonth(year, month)
}

export function getDaysInYear(ts: Timestamp): number {
  return _daysInYear(epochDaysToCivil(epochDays(ts)).year)
}

export { _isLeapYear as isLeapYear }
