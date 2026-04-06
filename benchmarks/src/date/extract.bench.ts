import { bench, describe } from 'vitest'
import * as D from '@stopcock/date'
import type { Timestamp } from '@stopcock/date'
import { getYear as dfnsGetYear, getMonth as dfnsGetMonth, getDay as dfnsGetDay } from 'date-fns'
import { DateTime } from 'luxon'
import moment from 'moment'
import { getTimestamps, getDates, type Size } from './setup'

describe.each([100, 1_000, 10_000])('getYear (batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { for (let i = 0; i < ts.length; i++) D.getYear(ts[i]!) })
  bench('date-fns', () => { for (let i = 0; i < ds.length; i++) dfnsGetYear(ds[i]!) })
  bench('luxon', () => { for (let i = 0; i < ts.length; i++) DateTime.fromMillis(ts[i]! as number).year })
  bench('moment', () => { for (let i = 0; i < ts.length; i++) moment(ts[i]! as number).year() })
})

describe.each([100, 1_000, 10_000])('getWeekday (batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { for (let i = 0; i < ts.length; i++) D.getWeekday(ts[i]!) })
  bench('date-fns', () => { for (let i = 0; i < ds.length; i++) dfnsGetDay(ds[i]!) })
  bench('luxon', () => { for (let i = 0; i < ts.length; i++) DateTime.fromMillis(ts[i]! as number).weekday })
  bench('moment', () => { for (let i = 0; i < ts.length; i++) moment(ts[i]! as number).day() })
})

describe.each([100, 1_000, 10_000])('decompose (year+month+day, batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { for (let i = 0; i < ts.length; i++) { D.getYear(ts[i]!); D.getMonth(ts[i]!); D.getDay(ts[i]!) } })
  bench('date-fns', () => { for (let i = 0; i < ds.length; i++) { dfnsGetYear(ds[i]!); dfnsGetMonth(ds[i]!); ds[i]!.getDate() } })
  bench('luxon', () => { for (let i = 0; i < ts.length; i++) { const dt = DateTime.fromMillis(ts[i]! as number); dt.year; dt.month; dt.day } })
  bench('moment', () => { for (let i = 0; i < ts.length; i++) { const m = moment(ts[i]! as number); m.year(); m.month(); m.date() } })
})
