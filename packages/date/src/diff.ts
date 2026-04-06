import type { Timestamp, DateUnit } from './types'
import { epochDays, epochDaysToCivil, MS_DAY, MS_HOUR, MS_MINUTE, MS_SECOND } from './core'

function _diff(a: number, b: number, unit: DateUnit): number {
  const delta = a - b
  switch (unit) {
    case 'millisecond': return delta
    case 'second': return (delta / MS_SECOND) | 0
    case 'minute': return (delta / MS_MINUTE) | 0
    case 'hour': return (delta / MS_HOUR) | 0
    case 'day': return (delta / MS_DAY) | 0
    case 'week': return (delta / (MS_DAY * 7)) | 0
    case 'month': {
      const ac = epochDaysToCivil(epochDays(a as Timestamp))
      const bc = epochDaysToCivil(epochDays(b as Timestamp))
      return (ac.year - bc.year) * 12 + (ac.month - bc.month)
    }
    case 'year': {
      const ac = epochDaysToCivil(epochDays(a as Timestamp))
      const bc = epochDaysToCivil(epochDays(b as Timestamp))
      return ac.year - bc.year
    }
  }
}

export const diff: {
  (a: Timestamp, b: Timestamp, unit: DateUnit): number
  (b: Timestamp, unit: DateUnit): (a: Timestamp) => number
} = function diff(_p0: any, _p1: any, _p2: any) {
  if (_p2 !== undefined) return _diff(_p0, _p1, _p2)
  const b = _p0, unit = _p1
  return (a: any) => _diff(a, b, unit)
} as any

export const diffInDays: {
  (a: Timestamp, b: Timestamp): number
  (b: Timestamp): (a: Timestamp) => number
} = function diffInDays(_p0: any, _p1: any) {
  if (_p1 !== undefined) return ((_p0 - _p1) / MS_DAY) | 0
  const b = _p0
  return (a: any) => ((a - b) / MS_DAY) | 0
} as any

export const diffInHours: {
  (a: Timestamp, b: Timestamp): number
  (b: Timestamp): (a: Timestamp) => number
} = function diffInHours(_p0: any, _p1: any) {
  if (_p1 !== undefined) return ((_p0 - _p1) / MS_HOUR) | 0
  const b = _p0
  return (a: any) => ((a - b) / MS_HOUR) | 0
} as any

export const diffInMinutes: {
  (a: Timestamp, b: Timestamp): number
  (b: Timestamp): (a: Timestamp) => number
} = function diffInMinutes(_p0: any, _p1: any) {
  if (_p1 !== undefined) return ((_p0 - _p1) / MS_MINUTE) | 0
  const b = _p0
  return (a: any) => ((a - b) / MS_MINUTE) | 0
} as any

export const diffInSeconds: {
  (a: Timestamp, b: Timestamp): number
  (b: Timestamp): (a: Timestamp) => number
} = function diffInSeconds(_p0: any, _p1: any) {
  if (_p1 !== undefined) return ((_p0 - _p1) / MS_SECOND) | 0
  const b = _p0
  return (a: any) => ((a - b) / MS_SECOND) | 0
} as any

export const diffInMonths: {
  (a: Timestamp, b: Timestamp): number
  (b: Timestamp): (a: Timestamp) => number
} = function diffInMonths(_p0: any, _p1: any) {
  if (_p1 !== undefined) {
    const ac = epochDaysToCivil(epochDays(_p0))
    const bc = epochDaysToCivil(epochDays(_p1))
    return (ac.year - bc.year) * 12 + (ac.month - bc.month)
  }
  const b = _p0
  return (a: any) => {
    const ac = epochDaysToCivil(epochDays(a))
    const bc = epochDaysToCivil(epochDays(b))
    return (ac.year - bc.year) * 12 + (ac.month - bc.month)
  }
} as any

export const diffInYears: {
  (a: Timestamp, b: Timestamp): number
  (b: Timestamp): (a: Timestamp) => number
} = function diffInYears(_p0: any, _p1: any) {
  if (_p1 !== undefined) return epochDaysToCivil(epochDays(_p0)).year - epochDaysToCivil(epochDays(_p1)).year
  const b = _p0
  return (a: any) => epochDaysToCivil(epochDays(a)).year - epochDaysToCivil(epochDays(b)).year
} as any
