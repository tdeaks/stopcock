import { bench, describe } from 'vitest'
import * as D from '@stopcock/date'
import type { Timestamp } from '@stopcock/date'
import { parseISO as dfnsParseISO, format as dfnsFormat, addDays, differenceInDays, isWeekend as dfnsIsWeekend, getMonth as dfnsGetMonth } from 'date-fns'
import { DateTime } from 'luxon'
import moment from 'moment'
import { getTimestamps, getDates, getISOStrings, type Size } from './setup'

const today = D.fromTimestamp(Date.now())
const todayDate = new Date()

describe.each([100, 1_000, 10_000])('parse → format pipeline — n=%i', (n) => {
  const isos = getISOStrings(n as Size)

  bench('stopcock', () => {
    const fmt = D.formatter('DD MMM YYYY')
    for (let i = 0; i < isos.length; i++) fmt(D.parseISO(isos[i]!))
  })
  bench('date-fns', () => { for (let i = 0; i < isos.length; i++) dfnsFormat(dfnsParseISO(isos[i]!), 'dd MMM yyyy') })
  bench('luxon', () => { for (let i = 0; i < isos.length; i++) DateTime.fromISO(isos[i]!).toFormat('dd MMM yyyy') })
  bench('moment', () => { for (let i = 0; i < isos.length; i++) moment(isos[i]!).format('DD MMM YYYY') })
})

describe.each([100, 1_000, 10_000])('filter weekdays → add 30d → diff pipeline — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => {
    for (let i = 0; i < ts.length; i++) {
      if (D.isWeekday(ts[i]!)) D.diffInDays(D.add(ts[i]!, 30, 'day'), today)
    }
  })
  bench('date-fns', () => {
    for (let i = 0; i < ds.length; i++) {
      if (!dfnsIsWeekend(ds[i]!)) differenceInDays(addDays(ds[i]!, 30), todayDate)
    }
  })
  bench('luxon', () => {
    const todayLuxon = DateTime.now()
    for (let i = 0; i < ts.length; i++) {
      const dt = DateTime.fromMillis(ts[i]! as number)
      if (dt.weekday <= 5) dt.plus({ days: 30 }).diff(todayLuxon, 'days').days
    }
  })
  bench('moment', () => {
    const todayMoment = moment()
    for (let i = 0; i < ts.length; i++) {
      const m = moment(ts[i]! as number)
      if (m.isoWeekday() <= 5) m.add(30, 'days').diff(todayMoment, 'days')
    }
  })
})

describe.each([100, 1_000, 10_000])('group by month — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => {
    const counts = new Int32Array(13)
    for (let i = 0; i < ts.length; i++) counts[D.getMonth(ts[i]!)]++
  })
  bench('date-fns', () => {
    const counts = new Int32Array(13)
    for (let i = 0; i < ds.length; i++) counts[dfnsGetMonth(ds[i]!) + 1]++
  })
  bench('luxon', () => {
    const counts = new Int32Array(13)
    for (let i = 0; i < ts.length; i++) counts[DateTime.fromMillis(ts[i]! as number).month]++
  })
  bench('moment', () => {
    const counts = new Int32Array(13)
    for (let i = 0; i < ts.length; i++) counts[moment(ts[i]! as number).month() + 1]++
  })
    const counts = new Int32Array(13)
    for (let i = 0; i < ds.length; i++) counts[ds[i]!.getMonth() + 1]++
  })
})
