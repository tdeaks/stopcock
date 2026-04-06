import type { Timestamp } from './types'
import { epochDays, epochDaysToCivil } from './core'

export const isBefore: {
  (ts: Timestamp, other: Timestamp): boolean
  (other: Timestamp): (ts: Timestamp) => boolean
} = function isBefore(_p0: any, _p1: any) {
  if (_p1 !== undefined) return _p0 < _p1
  const other = _p0
  return (ts: any) => ts < other
} as any

export const isAfter: {
  (ts: Timestamp, other: Timestamp): boolean
  (other: Timestamp): (ts: Timestamp) => boolean
} = function isAfter(_p0: any, _p1: any) {
  if (_p1 !== undefined) return _p0 > _p1
  const other = _p0
  return (ts: any) => ts > other
} as any

export const isEqual: {
  (ts: Timestamp, other: Timestamp): boolean
  (other: Timestamp): (ts: Timestamp) => boolean
} = function isEqual(_p0: any, _p1: any) {
  if (_p1 !== undefined) return _p0 === _p1
  const other = _p0
  return (ts: any) => ts === other
} as any

export const isSameDay: {
  (ts: Timestamp, other: Timestamp): boolean
  (other: Timestamp): (ts: Timestamp) => boolean
} = function isSameDay(_p0: any, _p1: any) {
  if (_p1 !== undefined) return epochDays(_p0) === epochDays(_p1)
  const other = _p0
  return (ts: any) => epochDays(ts) === epochDays(other)
} as any

export const isSameMonth: {
  (ts: Timestamp, other: Timestamp): boolean
  (other: Timestamp): (ts: Timestamp) => boolean
} = function isSameMonth(_p0: any, _p1: any) {
  if (_p1 !== undefined) {
    const a = epochDaysToCivil(epochDays(_p0))
    const b = epochDaysToCivil(epochDays(_p1))
    return a.year === b.year && a.month === b.month
  }
  const other = _p0
  return (ts: any) => {
    const a = epochDaysToCivil(epochDays(ts))
    const b = epochDaysToCivil(epochDays(other))
    return a.year === b.year && a.month === b.month
  }
} as any

export const isSameYear: {
  (ts: Timestamp, other: Timestamp): boolean
  (other: Timestamp): (ts: Timestamp) => boolean
} = function isSameYear(_p0: any, _p1: any) {
  if (_p1 !== undefined) return epochDaysToCivil(epochDays(_p0)).year === epochDaysToCivil(epochDays(_p1)).year
  const other = _p0
  return (ts: any) => epochDaysToCivil(epochDays(ts)).year === epochDaysToCivil(epochDays(other)).year
} as any

export const isBetween: {
  (ts: Timestamp, start: Timestamp, end: Timestamp): boolean
  (start: Timestamp, end: Timestamp): (ts: Timestamp) => boolean
} = function isBetween(_p0: any, _p1: any, _p2: any) {
  if (_p2 !== undefined) return _p0 >= _p1 && _p0 <= _p2
  const start = _p0, end = _p1
  return (ts: any) => ts >= start && ts <= end
} as any

export function isWeekend(ts: Timestamp): boolean {
  const d = epochDays(ts)
  const dow = ((d + 4) % 7 + 7) % 7
  return dow === 0 || dow === 6
}

export function isWeekday(ts: Timestamp): boolean {
  return !isWeekend(ts)
}

export function isToday(ts: Timestamp): boolean {
  return epochDays(ts) === Math.floor(Date.now() / 86_400_000)
}

export function isPast(ts: Timestamp): boolean {
  return (ts as number) < Date.now()
}

export function isFuture(ts: Timestamp): boolean {
  return (ts as number) > Date.now()
}

export function isValid(ts: Timestamp): boolean {
  return !Number.isNaN(ts as number)
}
