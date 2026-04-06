import { bench, describe } from 'vitest'
import * as D from '@stopcock/date'
import type { Timestamp } from '@stopcock/date'
import { addDays, addMonths, startOfDay, startOfMonth, endOfYear } from 'date-fns'
import { DateTime } from 'luxon'
import moment from 'moment'
import { getTimestamps, getDates, type Size } from './setup'

const MS_DAY = 86_400_000

describe.each([100, 1_000, 10_000])('add days (batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { for (let i = 0; i < ts.length; i++) D.add(ts[i]!, 30, 'day') })
  bench('date-fns', () => { for (let i = 0; i < ds.length; i++) addDays(ds[i]!, 30) })
  bench('luxon', () => { for (let i = 0; i < ts.length; i++) DateTime.fromMillis(ts[i]! as number).plus({ days: 30 }) })
  bench('moment', () => { for (let i = 0; i < ts.length; i++) moment(ts[i]! as number).add(30, 'days') })
})

describe.each([100, 1_000, 10_000])('add months (batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { for (let i = 0; i < ts.length; i++) D.add(ts[i]!, 3, 'month') })
  bench('date-fns', () => { for (let i = 0; i < ds.length; i++) addMonths(ds[i]!, 3) })
  bench('luxon', () => { for (let i = 0; i < ts.length; i++) DateTime.fromMillis(ts[i]! as number).plus({ months: 3 }) })
  bench('moment', () => { for (let i = 0; i < ts.length; i++) moment(ts[i]! as number).add(3, 'months') })
})

describe.each([100, 1_000, 10_000])('startOf day (batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { for (let i = 0; i < ts.length; i++) D.startOf(ts[i]!, 'day') })
  bench('date-fns', () => { for (let i = 0; i < ds.length; i++) startOfDay(ds[i]!) })
  bench('luxon', () => { for (let i = 0; i < ts.length; i++) DateTime.fromMillis(ts[i]! as number).startOf('day') })
  bench('moment', () => { for (let i = 0; i < ts.length; i++) moment(ts[i]! as number).startOf('day') })
})

describe.each([100, 1_000, 10_000])('startOf month (batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { for (let i = 0; i < ts.length; i++) D.startOf(ts[i]!, 'month') })
  bench('date-fns', () => { for (let i = 0; i < ds.length; i++) startOfMonth(ds[i]!) })
  bench('luxon', () => { for (let i = 0; i < ts.length; i++) DateTime.fromMillis(ts[i]! as number).startOf('month') })
  bench('moment', () => { for (let i = 0; i < ts.length; i++) moment(ts[i]! as number).startOf('month') })
})

describe.each([100, 1_000, 10_000])('endOf year (batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { for (let i = 0; i < ts.length; i++) D.endOf(ts[i]!, 'year') })
  bench('date-fns', () => { for (let i = 0; i < ds.length; i++) endOfYear(ds[i]!) })
  bench('luxon', () => { for (let i = 0; i < ts.length; i++) DateTime.fromMillis(ts[i]! as number).endOf('year') })
  bench('moment', () => { for (let i = 0; i < ts.length; i++) moment(ts[i]! as number).endOf('year') })
})
