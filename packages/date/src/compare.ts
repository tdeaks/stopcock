import type { Timestamp } from './types'

export const compare: {
  (a: Timestamp, b: Timestamp): -1 | 0 | 1
} = (a: Timestamp, b: Timestamp): -1 | 0 | 1 =>
  a < b ? -1 : a > b ? 1 : 0

export function min(dates: readonly Timestamp[]): Timestamp {
  let m = dates[0]!
  for (let i = 1; i < dates.length; i++) {
    if (dates[i]! < m) m = dates[i]!
  }
  return m
}

export function max(dates: readonly Timestamp[]): Timestamp {
  let m = dates[0]!
  for (let i = 1; i < dates.length; i++) {
    if (dates[i]! > m) m = dates[i]!
  }
  return m
}

export const clamp: {
  (ts: Timestamp, lo: Timestamp, hi: Timestamp): Timestamp
  (lo: Timestamp, hi: Timestamp): (ts: Timestamp) => Timestamp
} = function clamp(_p0: any, _p1: any, _p2: any) {
  if (_p2 !== undefined) return _p0 < _p1 ? _p1 : _p0 > _p2 ? _p2 : _p0
  const lo = _p0, hi = _p1
  return (ts: any) => ts < lo ? lo : ts > hi ? hi : ts
} as any

export function earliest(a: Timestamp, b: Timestamp): Timestamp {
  return a < b ? a : b
}

export function latest(a: Timestamp, b: Timestamp): Timestamp {
  return a > b ? a : b
}
