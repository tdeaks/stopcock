import type { Timestamp, Duration, DateUnit } from './types'
import { MS_DAY, MS_HOUR, MS_MINUTE, MS_SECOND, stamp } from './core'

function dur(n: number): Duration {
  return n as Duration
}

export function duration(amount: number, unit: DateUnit): Duration {
  switch (unit) {
    case 'millisecond':
      return dur(amount)
    case 'second':
      return dur(amount * MS_SECOND)
    case 'minute':
      return dur(amount * MS_MINUTE)
    case 'hour':
      return dur(amount * MS_HOUR)
    case 'day':
      return dur(amount * MS_DAY)
    case 'week':
      return dur(amount * MS_DAY * 7)
    case 'month':
      return dur(amount * MS_DAY * 30)
    case 'year':
      return dur(amount * MS_DAY * 365)
  }
}

export const addDuration: {
  (ts: Timestamp, d: Duration): Timestamp
  (d: Duration): (ts: Timestamp) => Timestamp
} = function addDuration(tsOrDuration: Timestamp | Duration, duration?: Duration): any {
  if (arguments.length >= 2) return stamp((tsOrDuration as number) + (duration as number))
  const d = tsOrDuration as Duration
  return (ts: Timestamp): Timestamp => stamp((ts as number) + (d as number))
}

export const subtractDuration: {
  (ts: Timestamp, d: Duration): Timestamp
  (d: Duration): (ts: Timestamp) => Timestamp
} = function subtractDuration(tsOrDuration: Timestamp | Duration, duration?: Duration): any {
  if (arguments.length >= 2) return stamp((tsOrDuration as number) - (duration as number))
  const d = tsOrDuration as Duration
  return (ts: Timestamp): Timestamp => stamp((ts as number) - (d as number))
}

export function toDuration(a: Timestamp, b: Timestamp): Duration {
  return dur(Math.abs((a as number) - (b as number)))
}

export const durationToUnit: {
  (d: Duration, unit: DateUnit): number
  (unit: DateUnit): (d: Duration) => number
} = function durationToUnit(durationOrUnit: Duration | DateUnit, unit?: DateUnit): any {
  if (arguments.length >= 2) return durationToUnitImpl(durationOrUnit as Duration, unit as DateUnit)
  const selectedUnit = durationOrUnit as DateUnit
  return (d: Duration): number => durationToUnitImpl(d, selectedUnit)
}

function durationToUnitImpl(d: Duration, unit: DateUnit): number {
  const ms = d as number
  switch (unit) {
    case 'millisecond':
      return ms
    case 'second':
      return ms / MS_SECOND
    case 'minute':
      return ms / MS_MINUTE
    case 'hour':
      return ms / MS_HOUR
    case 'day':
      return ms / MS_DAY
    case 'week':
      return ms / (MS_DAY * 7)
    case 'month':
      return ms / (MS_DAY * 30)
    case 'year':
      return ms / (MS_DAY * 365)
  }
}

export function scaleDuration(d: Duration, factor: number): Duration {
  return dur((d as number) * factor)
}

export function negateDuration(d: Duration): Duration {
  return dur(-(d as number))
}
