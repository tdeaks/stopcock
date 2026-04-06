import { bench, describe } from 'vitest'
import * as D from '@stopcock/date'
import type { Timestamp } from '@stopcock/date'
import { isBefore as dfnsIsBefore, compareAsc, min as dfnsMin, max as dfnsMax } from 'date-fns'
import { DateTime } from 'luxon'
import moment from 'moment'
import { getTimestamps, getDates, getTimestampPairs, type Size } from './setup'

describe.each([100, 1_000, 10_000])('isBefore (batch) — n=%i', (n) => {
  const pairs = getTimestampPairs(n as Size)
  const datePairs = pairs.map(([a, b]) => [new Date(a as number), new Date(b as number)] as const)

  bench('stopcock', () => { for (let i = 0; i < pairs.length; i++) pairs[i]![0] < pairs[i]![1] })
  bench('date-fns', () => { for (let i = 0; i < datePairs.length; i++) dfnsIsBefore(datePairs[i]![0], datePairs[i]![1]) })
  bench('luxon', () => { for (let i = 0; i < pairs.length; i++) DateTime.fromMillis(pairs[i]![0] as number) < DateTime.fromMillis(pairs[i]![1] as number) })
  bench('moment', () => { for (let i = 0; i < pairs.length; i++) moment(pairs[i]![0] as number).isBefore(moment(pairs[i]![1] as number)) })
})

describe.each([100, 1_000, 10_000])('sort dates (batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { const a = ts.slice(); a.sort(D.compare) })
  bench('date-fns', () => { const a = ds.slice(); a.sort(compareAsc) })
  bench('luxon', () => { const a = ts.slice(); a.sort((x, y) => (x as number) - (y as number)) })
  bench('moment', () => { const a = ts.slice(); a.sort((x, y) => (x as number) - (y as number)) })
})

describe.each([100, 1_000, 10_000])('min/max (batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { D.min(ts); D.max(ts) })
  bench('date-fns', () => { dfnsMin(ds); dfnsMax(ds) })
})
