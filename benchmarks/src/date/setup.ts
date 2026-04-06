import { fromTimestamp, toISO, format, type Timestamp } from '@stopcock/date'

function xorshift32(seed: number) {
  let state = seed
  return () => {
    state ^= state << 13
    state ^= state >> 17
    state ^= state << 5
    return (state >>> 0) / 0xFFFFFFFF
  }
}

const SIZES = [100, 1_000, 10_000] as const
export type Size = (typeof SIZES)[number]

const rand = xorshift32(77) // different seed from fp benchmarks to avoid any cache effects

// Range: 1970-01-01 to 2030-01-01 (~60 years)
const BASE = 0
const RANGE = 1_893_456_000_000

const timestamps = new Map<Size, Timestamp[]>()
const dates = new Map<Size, Date[]>()
const isoStrings = new Map<Size, string[]>()
const customStrings = new Map<Size, string[]>()
const timestampPairs = new Map<Size, [Timestamp, Timestamp][]>()

for (const n of SIZES) {
  const ts: Timestamp[] = []
  const ds: Date[] = []
  const isos: string[] = []
  const customs: string[] = []
  const pairs: [Timestamp, Timestamp][] = []

  for (let i = 0; i < n; i++) {
    const ms = BASE + Math.floor(rand() * RANGE)
    const t = fromTimestamp(ms)
    ts.push(t)
    ds.push(new Date(ms))
    isos.push(new Date(ms).toISOString())
    customs.push(format(t, 'DD/MM/YYYY HH:mm:ss'))
  }

  for (let i = 0; i < n; i++) {
    const a = BASE + Math.floor(rand() * RANGE)
    const b = BASE + Math.floor(rand() * RANGE)
    pairs.push([fromTimestamp(a), fromTimestamp(b)])
  }

  timestamps.set(n, ts)
  dates.set(n, ds)
  isoStrings.set(n, isos)
  customStrings.set(n, customs)
  timestampPairs.set(n, pairs)
}

export function getTimestamps(n: Size): Timestamp[] {
  return timestamps.get(n)!
}

export function getDates(n: Size): Date[] {
  return dates.get(n)!
}

export function getISOStrings(n: Size): string[] {
  return isoStrings.get(n)!
}

export function getCustomStrings(n: Size): string[] {
  return customStrings.get(n)!
}

export function getTimestampPairs(n: Size): [Timestamp, Timestamp][] {
  return timestampPairs.get(n)!
}
