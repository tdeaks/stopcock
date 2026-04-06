import { dual } from '@stopcock/fp'
import type { Timestamp, DateUnit } from './types'
import { civilToEpochDays, daysInMonth, MS_DAY, stamp } from './core'
import { add } from './arithmetic'

export const range: {
  (start: Timestamp, end: Timestamp, step: number, unit: DateUnit): Timestamp[]
  (step: number, unit: DateUnit): (start: Timestamp, end: Timestamp) => Timestamp[]
} = dual(4, (start: Timestamp, end: Timestamp, step: number, unit: DateUnit): Timestamp[] => {
  const result: Timestamp[] = []
  let current = start
  while ((current as number) <= (end as number)) {
    result.push(current)
    current = add(current, step, unit)
  }
  return result
})

export const rangeBy: {
  (start: Timestamp, end: Timestamp, stepFn: (ts: Timestamp) => Timestamp): Timestamp[]
  (stepFn: (ts: Timestamp) => Timestamp): (start: Timestamp, end: Timestamp) => Timestamp[]
} = dual(3, (start: Timestamp, end: Timestamp, stepFn: (ts: Timestamp) => Timestamp): Timestamp[] => {
  const result: Timestamp[] = []
  let current = start
  while ((current as number) <= (end as number)) {
    result.push(current)
    current = stepFn(current)
  }
  return result
})

export function daysIn(year: number, month: number): Timestamp[] {
  const count = daysInMonth(year, month)
  const base = civilToEpochDays(year, month, 1) * MS_DAY
  const result = new Array<Timestamp>(count)
  for (let i = 0; i < count; i++) {
    result[i] = stamp(base + i * MS_DAY)
  }
  return result
}

export function weekdaysIn(year: number, month: number): Timestamp[] {
  const count = daysInMonth(year, month)
  const base = civilToEpochDays(year, month, 1)
  const result: Timestamp[] = []
  for (let i = 0; i < count; i++) {
    const d = base + i
    const dow = ((d + 4) % 7 + 7) % 7 // 0=Sun
    if (dow !== 0 && dow !== 6) {
      result.push(stamp(d * MS_DAY))
    }
  }
  return result
}

export const sequence: {
  (start: Timestamp, count: number, step: number, unit: DateUnit): Timestamp[]
  (count: number, step: number, unit: DateUnit): (start: Timestamp) => Timestamp[]
} = dual(4, (start: Timestamp, count: number, step: number, unit: DateUnit): Timestamp[] => {
  const result = new Array<Timestamp>(count)
  let current = start
  for (let i = 0; i < count; i++) {
    result[i] = current
    current = add(current, step, unit)
  }
  return result
})
