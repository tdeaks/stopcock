import type { Timestamp, Duration } from './types'
import { stamp } from './core'

export function overlaps(a1: Timestamp, a2: Timestamp, b1: Timestamp, b2: Timestamp): boolean {
  return (a1 as number) < (b2 as number) && (b1 as number) < (a2 as number)
}

export function contains(start: Timestamp, end: Timestamp, point: Timestamp): boolean {
  return (point as number) >= (start as number) && (point as number) <= (end as number)
}

export function intersection(a1: Timestamp, a2: Timestamp, b1: Timestamp, b2: Timestamp): [Timestamp, Timestamp] | null {
  const start = Math.max(a1 as number, b1 as number)
  const end = Math.min(a2 as number, b2 as number)
  return start < end ? [stamp(start), stamp(end)] : null
}

export function union(a1: Timestamp, a2: Timestamp, b1: Timestamp, b2: Timestamp): [Timestamp, Timestamp] | null {
  if (!overlaps(a1, a2, b1, b2)) return null
  return [stamp(Math.min(a1 as number, b1 as number)), stamp(Math.max(a2 as number, b2 as number))]
}

export function gap(a1: Timestamp, a2: Timestamp, b1: Timestamp, b2: Timestamp): Duration | null {
  if (overlaps(a1, a2, b1, b2)) return null
  const g = (a2 as number) < (b1 as number)
    ? (b1 as number) - (a2 as number)
    : (a1 as number) - (b2 as number)
  return g as Duration
}

export function mergeIntervals(intervals: readonly [Timestamp, Timestamp][]): [Timestamp, Timestamp][] {
  if (intervals.length === 0) return []
  const sorted = intervals.slice().sort((a, b) => (a[0] as number) - (b[0] as number))
  const result: [Timestamp, Timestamp][] = [sorted[0]!]
  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1]!
    const cur = sorted[i]!
    if ((cur[0] as number) <= (last[1] as number)) {
      last[1] = stamp(Math.max(last[1] as number, cur[1] as number))
    } else {
      result.push([cur[0], cur[1]])
    }
  }
  return result
}
