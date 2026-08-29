import type { Timestamp, DateUnit } from './types'
import { MS_DAY, MS_HOUR, MS_MINUTE, MS_SECOND, stamp } from './core'
import { startOf, endOf } from './arithmetic'

function roundToImpl(ts: Timestamp, unit: DateUnit): Timestamp {
  const s = startOf(ts, unit)
  const e = (startOf as any)(stamp((s as number) + unitMs(unit)), unit) as Timestamp
  return (ts as number) - (s as number) < (e as number) - (ts as number) ? s : e
}

export const roundTo: {
  (ts: Timestamp, unit: DateUnit): Timestamp
  (unit: DateUnit): (ts: Timestamp) => Timestamp
} = function roundTo(tsOrUnit: Timestamp | DateUnit, unit?: DateUnit): any {
  if (arguments.length >= 2) return roundToImpl(tsOrUnit as Timestamp, unit as DateUnit)
  const selectedUnit = tsOrUnit as DateUnit
  return (ts: Timestamp): Timestamp => roundToImpl(ts, selectedUnit)
}

function ceilToImpl(ts: Timestamp, unit: DateUnit): Timestamp {
  const s = startOf(ts, unit)
  return (s as number) === (ts as number)
    ? ts
    : ((startOf as any)(stamp((s as number) + unitMs(unit)), unit) as Timestamp)
}

export const ceilTo: {
  (ts: Timestamp, unit: DateUnit): Timestamp
  (unit: DateUnit): (ts: Timestamp) => Timestamp
} = function ceilTo(tsOrUnit: Timestamp | DateUnit, unit?: DateUnit): any {
  if (arguments.length >= 2) return ceilToImpl(tsOrUnit as Timestamp, unit as DateUnit)
  const selectedUnit = tsOrUnit as DateUnit
  return (ts: Timestamp): Timestamp => ceilToImpl(ts, selectedUnit)
}

export const floorTo: {
  (ts: Timestamp, unit: DateUnit): Timestamp
  (unit: DateUnit): (ts: Timestamp) => Timestamp
} = function floorTo(tsOrUnit: Timestamp | DateUnit, unit?: DateUnit): any {
  if (arguments.length >= 2) return startOf(tsOrUnit as Timestamp, unit as DateUnit)
  const selectedUnit = tsOrUnit as DateUnit
  return (ts: Timestamp): Timestamp => startOf(ts, selectedUnit)
}

function snapToImpl(ts: Timestamp, interval: number, unit: DateUnit): Timestamp {
  const ms = interval * unitMs(unit)
  return stamp(Math.round((ts as number) / ms) * ms)
}

export const snapTo: {
  (ts: Timestamp, interval: number, unit: DateUnit): Timestamp
  (interval: number, unit: DateUnit): (ts: Timestamp) => Timestamp
} = function snapTo(
  tsOrInterval: Timestamp | number,
  intervalOrUnit: number | DateUnit,
  unit?: DateUnit,
): any {
  if (arguments.length >= 3) {
    return snapToImpl(tsOrInterval as Timestamp, intervalOrUnit as number, unit as DateUnit)
  }
  const interval = tsOrInterval as number
  const selectedUnit = intervalOrUnit as DateUnit
  return (ts: Timestamp): Timestamp => snapToImpl(ts, interval, selectedUnit)
}

function unitMs(unit: DateUnit): number {
  switch (unit) {
    case 'millisecond':
      return 1
    case 'second':
      return MS_SECOND
    case 'minute':
      return MS_MINUTE
    case 'hour':
      return MS_HOUR
    case 'day':
      return MS_DAY
    case 'week':
      return MS_DAY * 7
    case 'month':
      return MS_DAY * 30
    case 'year':
      return MS_DAY * 365
  }
}
