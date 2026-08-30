import type { Timestamp, DateUnit } from './types'
import {
  epochDays,
  epochDaysToCivil,
  msOfDay,
  timeComponents,
  compose,
  daysInMonth,
  MS_DAY,
  MS_HOUR,
  MS_MINUTE,
  MS_SECOND,
  stamp,
} from './core'

function addImpl(ts: Timestamp, amount: number, unit: DateUnit): Timestamp {
  switch (unit) {
    case 'day':
      return ((ts as number) + amount * MS_DAY) as any
    case 'millisecond':
      return ((ts as number) + amount) as any
    case 'second':
      return ((ts as number) + amount * MS_SECOND) as any
    case 'minute':
      return ((ts as number) + amount * MS_MINUTE) as any
    case 'hour':
      return ((ts as number) + amount * MS_HOUR) as any
    case 'week':
      return ((ts as number) + amount * MS_DAY * 7) as any
    case 'month': {
      const civil = epochDaysToCivil(epochDays(ts))
      const ms = msOfDay(ts)
      const totalMonths = civil.year * 12 + (civil.month - 1) + amount
      const y = Math.floor(totalMonths / 12)
      const m = (((totalMonths % 12) + 12) % 12) + 1
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
  if (arguments.length >= 3) return addImpl(a, b, c)
  return (ts: Timestamp) => addImpl(ts, a, b)
} as any

export const subtract: {
  (ts: Timestamp, amount: number, unit: DateUnit): Timestamp
  (amount: number, unit: DateUnit): (ts: Timestamp) => Timestamp
} = function subtract(tsOrAmount: Timestamp | number, amountOrUnit: number | DateUnit, unit?: DateUnit): any {
  if (arguments.length >= 3) return (add as any)(tsOrAmount, -(amountOrUnit as number), unit)
  const amount = tsOrAmount as number
  const selectedUnit = amountOrUnit as DateUnit
  return (ts: Timestamp): Timestamp => (add as any)(ts, -amount, selectedUnit)
}

function startOfImpl(ts: Timestamp, unit: DateUnit): Timestamp {
  const ms = msOfDay(ts)
  const civil =
    unit === 'hour' || unit === 'minute' || unit === 'second' || unit === 'millisecond'
      ? null
      : epochDaysToCivil(epochDays(ts))

  switch (unit) {
    case 'millisecond':
      return ts
    case 'second':
      return stamp(ts - (ms % MS_SECOND))
    case 'minute':
      return stamp(ts - (ms % MS_MINUTE))
    case 'hour':
      return stamp(ts - (ms % MS_HOUR))
    case 'day':
      return stamp(ts - ms)
    case 'week': {
      const d = epochDays(ts)
      const dow = (((d + 3) % 7) + 7) % 7
      return stamp((d - dow) * MS_DAY)
    }
    case 'month':
      return compose(civil!.year, civil!.month, 1, 0, 0, 0, 0)
    case 'year':
      return compose(civil!.year, 1, 1, 0, 0, 0, 0)
  }
}

export const startOf: {
  (ts: Timestamp, unit: DateUnit): Timestamp
  (unit: DateUnit): (ts: Timestamp) => Timestamp
} = function startOf(tsOrUnit: Timestamp | DateUnit, unit?: DateUnit): any {
  if (arguments.length >= 2) return startOfImpl(tsOrUnit as Timestamp, unit as DateUnit)
  const selectedUnit = tsOrUnit as DateUnit
  return (ts: Timestamp): Timestamp => startOfImpl(ts, selectedUnit)
}

function endOfImpl(ts: Timestamp, unit: DateUnit): Timestamp {
  const civil = epochDaysToCivil(epochDays(ts))

  switch (unit) {
    case 'millisecond':
      return ts
    case 'second':
      return stamp(ts - (msOfDay(ts) % MS_SECOND) + MS_SECOND - 1)
    case 'minute':
      return stamp(ts - (msOfDay(ts) % MS_MINUTE) + MS_MINUTE - 1)
    case 'hour':
      return stamp(ts - (msOfDay(ts) % MS_HOUR) + MS_HOUR - 1)
    case 'day':
      return stamp(ts - msOfDay(ts) + MS_DAY - 1)
    case 'week': {
      const d = epochDays(ts)
      const dow = (((d + 3) % 7) + 7) % 7
      return stamp((d - dow + 6) * MS_DAY + MS_DAY - 1)
    }
    case 'month':
      return compose(civil.year, civil.month, daysInMonth(civil.year, civil.month), 23, 59, 59, 999)
    case 'year':
      return compose(civil.year, 12, 31, 23, 59, 59, 999)
  }
}

export const endOf: {
  (ts: Timestamp, unit: DateUnit): Timestamp
  (unit: DateUnit): (ts: Timestamp) => Timestamp
} = function endOf(tsOrUnit: Timestamp | DateUnit, unit?: DateUnit): any {
  if (arguments.length >= 2) return endOfImpl(tsOrUnit as Timestamp, unit as DateUnit)
  const selectedUnit = tsOrUnit as DateUnit
  return (ts: Timestamp): Timestamp => endOfImpl(ts, selectedUnit)
}

function setYearImpl(ts: Timestamp, year: number): Timestamp {
  const civil = epochDaysToCivil(epochDays(ts))
  const d = Math.min(civil.day, daysInMonth(year, civil.month))
  return compose(year, civil.month, d, 0, 0, 0, msOfDay(ts))
}

export const setYear: {
  (ts: Timestamp, year: number): Timestamp
  (year: number): (ts: Timestamp) => Timestamp
} = function setYear(tsOrYear: Timestamp | number, year?: number): any {
  if (arguments.length >= 2) return setYearImpl(tsOrYear as Timestamp, year as number)
  const selectedYear = tsOrYear as number
  return (ts: Timestamp): Timestamp => setYearImpl(ts, selectedYear)
}

function setMonthImpl(ts: Timestamp, month: number): Timestamp {
  const civil = epochDaysToCivil(epochDays(ts))
  const d = Math.min(civil.day, daysInMonth(civil.year, month))
  return compose(civil.year, month, d, 0, 0, 0, msOfDay(ts))
}

export const setMonth: {
  (ts: Timestamp, month: number): Timestamp
  (month: number): (ts: Timestamp) => Timestamp
} = function setMonth(tsOrMonth: Timestamp | number, month?: number): any {
  if (arguments.length >= 2) return setMonthImpl(tsOrMonth as Timestamp, month as number)
  const selectedMonth = tsOrMonth as number
  return (ts: Timestamp): Timestamp => setMonthImpl(ts, selectedMonth)
}

function setDayImpl(ts: Timestamp, day: number): Timestamp {
  const civil = epochDaysToCivil(epochDays(ts))
  return compose(civil.year, civil.month, day, 0, 0, 0, msOfDay(ts))
}

export const setDay: {
  (ts: Timestamp, day: number): Timestamp
  (day: number): (ts: Timestamp) => Timestamp
} = function setDay(tsOrDay: Timestamp | number, day?: number): any {
  if (arguments.length >= 2) return setDayImpl(tsOrDay as Timestamp, day as number)
  const selectedDay = tsOrDay as number
  return (ts: Timestamp): Timestamp => setDayImpl(ts, selectedDay)
}

function setHoursImpl(ts: Timestamp, hours: number): Timestamp {
  const time = timeComponents(msOfDay(ts))
  const civil = epochDaysToCivil(epochDays(ts))
  return compose(
    civil.year,
    civil.month,
    civil.day,
    hours,
    time.minute,
    time.second,
    time.millisecond,
  )
}

export const setHours: {
  (ts: Timestamp, hours: number): Timestamp
  (hours: number): (ts: Timestamp) => Timestamp
} = function setHours(tsOrHours: Timestamp | number, hours?: number): any {
  if (arguments.length >= 2) return setHoursImpl(tsOrHours as Timestamp, hours as number)
  const selectedHours = tsOrHours as number
  return (ts: Timestamp): Timestamp => setHoursImpl(ts, selectedHours)
}

function setMinutesImpl(ts: Timestamp, minutes: number): Timestamp {
  const time = timeComponents(msOfDay(ts))
  const civil = epochDaysToCivil(epochDays(ts))
  return compose(
    civil.year,
    civil.month,
    civil.day,
    time.hour,
    minutes,
    time.second,
    time.millisecond,
  )
}

export const setMinutes: {
  (ts: Timestamp, minutes: number): Timestamp
  (minutes: number): (ts: Timestamp) => Timestamp
} = function setMinutes(tsOrMinutes: Timestamp | number, minutes?: number): any {
  if (arguments.length >= 2) return setMinutesImpl(tsOrMinutes as Timestamp, minutes as number)
  const selectedMinutes = tsOrMinutes as number
  return (ts: Timestamp): Timestamp => setMinutesImpl(ts, selectedMinutes)
}

function setSecondsImpl(ts: Timestamp, seconds: number): Timestamp {
  const time = timeComponents(msOfDay(ts))
  const civil = epochDaysToCivil(epochDays(ts))
  return compose(
    civil.year,
    civil.month,
    civil.day,
    time.hour,
    time.minute,
    seconds,
    time.millisecond,
  )
}

export const setSeconds: {
  (ts: Timestamp, seconds: number): Timestamp
  (seconds: number): (ts: Timestamp) => Timestamp
} = function setSeconds(tsOrSeconds: Timestamp | number, seconds?: number): any {
  if (arguments.length >= 2) return setSecondsImpl(tsOrSeconds as Timestamp, seconds as number)
  const selectedSeconds = tsOrSeconds as number
  return (ts: Timestamp): Timestamp => setSecondsImpl(ts, selectedSeconds)
}
