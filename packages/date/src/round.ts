import { dual } from '@stopcock/fp'
import type { Timestamp, DateUnit } from './types'
import { MS_DAY, MS_HOUR, MS_MINUTE, MS_SECOND, stamp } from './core'
import { startOf, endOf } from './arithmetic'

export const roundTo: {
  (ts: Timestamp, unit: DateUnit): Timestamp
  (unit: DateUnit): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, unit: DateUnit): Timestamp => {
  const s = startOf(ts, unit)
  const e = (startOf as any)(stamp((s as number) + unitMs(unit)), unit) as Timestamp
  return (ts as number) - (s as number) < (e as number) - (ts as number) ? s : e
})

export const ceilTo: {
  (ts: Timestamp, unit: DateUnit): Timestamp
  (unit: DateUnit): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, unit: DateUnit): Timestamp => {
  const s = startOf(ts, unit)
  return (s as number) === (ts as number) ? ts : (startOf as any)(stamp((s as number) + unitMs(unit)), unit) as Timestamp
})

export const floorTo: {
  (ts: Timestamp, unit: DateUnit): Timestamp
  (unit: DateUnit): (ts: Timestamp) => Timestamp
} = dual(2, (ts: Timestamp, unit: DateUnit): Timestamp => startOf(ts, unit))

export const snapTo: {
  (ts: Timestamp, interval: number, unit: DateUnit): Timestamp
  (interval: number, unit: DateUnit): (ts: Timestamp) => Timestamp
} = dual(3, (ts: Timestamp, interval: number, unit: DateUnit): Timestamp => {
  const ms = interval * unitMs(unit)
  return stamp(Math.round((ts as number) / ms) * ms)
})

function unitMs(unit: DateUnit): number {
  switch (unit) {
    case 'millisecond': return 1
    case 'second': return MS_SECOND
    case 'minute': return MS_MINUTE
    case 'hour': return MS_HOUR
    case 'day': return MS_DAY
    case 'week': return MS_DAY * 7
    case 'month': return MS_DAY * 30
    case 'year': return MS_DAY * 365
  }
}
