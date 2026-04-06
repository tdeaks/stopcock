import { bench, describe } from 'vitest'
import * as D from '@stopcock/date'
import type { Timestamp } from '@stopcock/date'
import { format as dfnsFormat } from 'date-fns'
import { DateTime } from 'luxon'
import moment from 'moment'
import { getTimestamps, getDates, type Size } from './setup'

describe.each([100, 1_000, 10_000])('format (YYYY-MM-DD HH:mm:ss, batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { for (let i = 0; i < ts.length; i++) D.format(ts[i]!, 'YYYY-MM-DD HH:mm:ss') })
  bench('stopcock (compiled)', () => {
    const fmt = D.formatter('YYYY-MM-DD HH:mm:ss')
    for (let i = 0; i < ts.length; i++) fmt(ts[i]!)
  })
  bench('date-fns', () => { for (let i = 0; i < ds.length; i++) dfnsFormat(ds[i]!, 'yyyy-MM-dd HH:mm:ss') })
  bench('luxon', () => { for (let i = 0; i < ts.length; i++) DateTime.fromMillis(ts[i]! as number).toFormat('yyyy-MM-dd HH:mm:ss') })
  bench('moment', () => { for (let i = 0; i < ts.length; i++) moment(ts[i]! as number).format('YYYY-MM-DD HH:mm:ss') })
})

describe.each([100, 1_000, 10_000])('format (complex: ddd, DD MMM YYYY hh:mm A, batch) — n=%i', (n) => {
  const ts = getTimestamps(n as Size)
  const ds = getDates(n as Size)

  bench('stopcock', () => { for (let i = 0; i < ts.length; i++) D.format(ts[i]!, 'ddd, DD MMM YYYY hh:mm A') })
  bench('stopcock (compiled)', () => {
    const fmt = D.formatter('ddd, DD MMM YYYY hh:mm A')
    for (let i = 0; i < ts.length; i++) fmt(ts[i]!)
  })
  bench('date-fns', () => { for (let i = 0; i < ds.length; i++) dfnsFormat(ds[i]!, 'EEE, dd MMM yyyy hh:mm a') })
  bench('luxon', () => { for (let i = 0; i < ts.length; i++) DateTime.fromMillis(ts[i]! as number).toFormat('EEE, dd MMM yyyy hh:mm a') })
  bench('moment', () => { for (let i = 0; i < ts.length; i++) moment(ts[i]! as number).format('ddd, DD MMM YYYY hh:mm A') })
})
