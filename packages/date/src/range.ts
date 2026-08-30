import type { Timestamp, DateUnit } from './types'
import { civilToEpochDays, daysInMonth, MS_DAY, stamp } from './core'
import { add } from './arithmetic'

function rangeImpl(start: Timestamp, end: Timestamp, step: number, unit: DateUnit): Timestamp[] {
  const result: Timestamp[] = []
  let current = start
  while ((current as number) <= (end as number)) {
    result.push(current)
    current = add(current, step, unit)
  }
  return result
}

export const range: {
  (start: Timestamp, end: Timestamp, step: number, unit: DateUnit): Timestamp[]
  (end: Timestamp, step: number, unit: DateUnit): (start: Timestamp) => Timestamp[]
} = function range(
  startOrEnd: Timestamp,
  endOrStep: Timestamp | number,
  stepOrUnit: number | DateUnit,
  unit?: DateUnit,
): any {
  if (arguments.length >= 4) {
    return rangeImpl(startOrEnd, endOrStep as Timestamp, stepOrUnit as number, unit as DateUnit)
  }
  const end = startOrEnd
  const step = endOrStep as number
  const selectedUnit = stepOrUnit as DateUnit
  return (start: Timestamp): Timestamp[] => rangeImpl(start, end, step, selectedUnit)
}

function rangeByImpl(
  start: Timestamp,
  end: Timestamp,
  stepFn: (ts: Timestamp) => Timestamp,
): Timestamp[] {
  const result: Timestamp[] = []
  let current = start
  while ((current as number) <= (end as number)) {
    result.push(current)
    current = stepFn(current)
  }
  return result
}

export const rangeBy: {
  (start: Timestamp, end: Timestamp, stepFn: (ts: Timestamp) => Timestamp): Timestamp[]
  (end: Timestamp, stepFn: (ts: Timestamp) => Timestamp): (start: Timestamp) => Timestamp[]
} = function rangeBy(
  startOrEnd: Timestamp,
  endOrStepFn: Timestamp | ((ts: Timestamp) => Timestamp),
  stepFn?: (ts: Timestamp) => Timestamp,
): any {
  if (arguments.length >= 3) return rangeByImpl(startOrEnd, endOrStepFn as Timestamp, stepFn!)
  const end = startOrEnd
  const selectedStepFn = endOrStepFn as (ts: Timestamp) => Timestamp
  return (start: Timestamp): Timestamp[] => rangeByImpl(start, end, selectedStepFn)
}

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
    const dow = (((d + 4) % 7) + 7) % 7 // 0=Sun
    if (dow !== 0 && dow !== 6) {
      result.push(stamp(d * MS_DAY))
    }
  }
  return result
}

function sequenceImpl(start: Timestamp, count: number, step: number, unit: DateUnit): Timestamp[] {
  const result = new Array<Timestamp>(count)
  let current = start
  for (let i = 0; i < count; i++) {
    result[i] = current
    current = add(current, step, unit)
  }
  return result
}

export const sequence: {
  (start: Timestamp, count: number, step: number, unit: DateUnit): Timestamp[]
  (count: number, step: number, unit: DateUnit): (start: Timestamp) => Timestamp[]
} = function sequence(
  startOrCount: Timestamp | number,
  countOrStep: number,
  stepOrUnit: number | DateUnit,
  unit?: DateUnit,
): any {
  if (arguments.length >= 4) {
    return sequenceImpl(startOrCount as Timestamp, countOrStep, stepOrUnit as number, unit as DateUnit)
  }
  const count = startOrCount as number
  const step = countOrStep
  const selectedUnit = stepOrUnit as DateUnit
  return (start: Timestamp): Timestamp[] => sequenceImpl(start, count, step, selectedUnit)
}
