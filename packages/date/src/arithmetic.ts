import { dual } from '@stopcock/fp'
import type { Timestamp, DateUnit } from './types'
import { epochDays, epochDaysToCivil, msOfDay, timeComponents, compose, daysInMonth, MS_DAY, MS_HOUR, MS_MINUTE, MS_SECOND, stamp } from './core'

function addImpl(ts: Timestamp, amount: number, unit: DateUnit): Timestamp {
  switch (unit) {
    case 'day': return (ts as number + amount * MS_DAY) as any
    case 'millisecond': return (ts as number + amount) as any
    case 'second': return (ts as number + amount * MS_SECOND) as any
    case 'minute': return (ts as number + amount * MS_MINUTE) as any
    case 'hour': return (ts as number + amount * MS_HOUR) as any
    case 'week': return (ts as number + amount * MS_DAY * 7) as any
    case 'month': {
      const civil = epochDaysToCivil(epochDays(ts))
      const ms = msOfDay(ts)
      const totalMonths = civil.year * 12 + (civil.month - 1) + amount
      const y = Math.floor(totalMonths / 12)
      const m = ((totalMonths % 12) + 12) % 12 + 1
      const d = Math.min(civil.day, daysInMonth(y, m))
      return compose(y, m, d, 0, 0, 0, ms)
    }
    case 'year': {
      const civil = epochDaysToCivil(epochDays(ts))
      const ms = msOfDay(ts)
      const y = civil.year + amount
      const d = Math.min(civil.day, daysInMonth(y, civil.month))
      return compose(y, civil.month, d, 0, 0, 0, ms)
    }
  }
}

export const add: {
  (ts: Timestamp, amount: number, unit: DateUnit): Timestamp
  (amount: number, unit: DateUnit): (ts: Timestamp) => Timestamp
} = function add(a: any, b: any, c?: any): any {
  if (c !== undefined) return addImpl(a, b, c)
  return (ts: Timestamp) => addImpl(ts, a, b)
} as any

export const subtract: {
  (ts: Timestamp, amount: number, unit: DateUnit): Timestamp
  (amount: number, unit: DateUnit): (ts: Timestamp) => Timestamp
} = dual(3, (ts: Timestamp, amount: number, unit: DateUnit): Timestamp =>
  (add as any)(ts, -amount, unit)
)

export const startOf: {
  (ts: Timestamp, unit: DateUnit): Timestamp
  (unit: DateUnit): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, unit: DateUnit): Timestamp => {
  const ms = msOfDay(ts)
  const civil = unit === 'hour' || unit === 'minute' || unit === 'second' || unit === 'millisecond'
    ? null
    : epochDaysToCivil(epochDays(ts))

  switch (unit) {
    case 'millisecond': return ts
    case 'second': return stamp(ts - ms % MS_SECOND)
    case 'minute': return stamp(ts - ms % MS_MINUTE)
    case 'hour': return stamp(ts - ms % MS_HOUR)
    case 'day': return stamp(ts - ms)
    case 'week': {
      const d = epochDays(ts)
      const dow = ((d + 3) % 7 + 7) % 7
      return stamp((d - dow) * MS_DAY)
    }
    case 'month': return compose(civil!.year, civil!.month, 1, 0, 0, 0, 0)
    case 'year': return compose(civil!.year, 1, 1, 0, 0, 0, 0)
  }
})

export const endOf: {
  (ts: Timestamp, unit: DateUnit): Timestamp
  (unit: DateUnit): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, unit: DateUnit): Timestamp => {
  const civil = epochDaysToCivil(epochDays(ts))

  switch (unit) {
    case 'millisecond': return ts
    case 'second': return stamp(ts - (msOfDay(ts) % MS_SECOND) + MS_SECOND - 1)
    case 'minute': return stamp(ts - (msOfDay(ts) % MS_MINUTE) + MS_MINUTE - 1)
    case 'hour': return stamp(ts - (msOfDay(ts) % MS_HOUR) + MS_HOUR - 1)
    case 'day': return stamp(ts - msOfDay(ts) + MS_DAY - 1)
    case 'week': {
      const d = epochDays(ts)
      const dow = ((d + 3) % 7 + 7) % 7
      return stamp((d - dow + 6) * MS_DAY + MS_DAY - 1)
    }
    case 'month': return compose(civil.year, civil.month, daysInMonth(civil.year, civil.month), 23, 59, 59, 999)
    case 'year': return compose(civil.year, 12, 31, 23, 59, 59, 999)
  }
})

export const setYear: {
  (ts: Timestamp, year: number): Timestamp
  (year: number): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, year: number): Timestamp => {
  const civil = epochDaysToCivil(epochDays(ts))
  const d = Math.min(civil.day, daysInMonth(year, civil.month))
  return compose(year, civil.month, d, 0, 0, 0, msOfDay(ts))
})

export const setMonth: {
  (ts: Timestamp, month: number): Timestamp
  (month: number): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, month: number): Timestamp => {
  const civil = epochDaysToCivil(epochDays(ts))
  const d = Math.min(civil.day, daysInMonth(civil.year, month))
  return compose(civil.year, month, d, 0, 0, 0, msOfDay(ts))
})

export const setDay: {
  (ts: Timestamp, day: number): Timestamp
  (day: number): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, day: number): Timestamp => {
  const civil = epochDaysToCivil(epochDays(ts))
  return compose(civil.year, civil.month, day, 0, 0, 0, msOfDay(ts))
})

export const setHours: {
  (ts: Timestamp, hours: number): Timestamp
  (hours: number): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, hours: number): Timestamp => {
  const time = timeComponents(msOfDay(ts))
  const civil = epochDaysToCivil(epochDays(ts))
  return compose(civil.year, civil.month, civil.day, hours, time.minute, time.second, time.millisecond)
})

export const setMinutes: {
  (ts: Timestamp, minutes: number): Timestamp
  (minutes: number): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, minutes: number): Timestamp => {
  const time = timeComponents(msOfDay(ts))
  const civil = epochDaysToCivil(epochDays(ts))
  return compose(civil.year, civil.month, civil.day, time.hour, minutes, time.second, time.millisecond)
})

export const setSeconds: {
  (ts: Timestamp, seconds: number): Timestamp
  (seconds: number): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, seconds: number): Timestamp => {
  const time = timeComponents(msOfDay(ts))
  const civil = epochDaysToCivil(epochDays(ts))
  return compose(civil.year, civil.month, civil.day, time.hour, time.minute, seconds, time.millisecond)
})
