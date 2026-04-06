import type { Timestamp, DateParts } from './types'
import { compose, stamp } from './core'

export function now(): Timestamp {
  return Date.now() as Timestamp
}

export function fromDate(date: Date): Timestamp {
  return date.getTime() as Timestamp
}

export function toDate(ts: Timestamp): Date {
  return new Date(ts as number)
}

export function fromParts(parts: DateParts): Timestamp {
  return compose(
    parts.year,
    parts.month,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    parts.millisecond ?? 0,
  )
}

export function fromTimestamp(ms: number): Timestamp {
  return ms as Timestamp
}

export function fromISO(iso: string): Timestamp {
  return Date.parse(iso) as Timestamp
}

export function toTimestamp(ts: Timestamp): number {
  return ts as number
}

export function toISO(ts: Timestamp): string {
  return new Date(ts as number).toISOString()
}

export function clone(ts: Timestamp): Timestamp {
  return ts
}
