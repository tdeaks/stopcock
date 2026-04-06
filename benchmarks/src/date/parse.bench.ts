import { bench, describe } from 'vitest'
import * as D from '@stopcock/date'
import { parseISO as dfnsParseISO, parse as dfnsParse } from 'date-fns'
import { DateTime } from 'luxon'
import moment from 'moment'
import { getISOStrings, getCustomStrings, type Size } from './setup'

describe.each([100, 1_000, 10_000])('parseISO (batch) — n=%i', (n) => {
  const isos = getISOStrings(n as Size)

  bench('stopcock', () => { for (let i = 0; i < isos.length; i++) D.parseISO(isos[i]!) })
  bench('date-fns', () => { for (let i = 0; i < isos.length; i++) dfnsParseISO(isos[i]!) })
  bench('luxon', () => { for (let i = 0; i < isos.length; i++) DateTime.fromISO(isos[i]!) })
  bench('moment', () => { for (let i = 0; i < isos.length; i++) moment(isos[i]!) })
})

describe.each([100, 1_000, 10_000])('parse (custom template, batch) — n=%i', (n) => {
  const strs = getCustomStrings(n as Size)

  bench('stopcock', () => { for (let i = 0; i < strs.length; i++) D.parse(strs[i]!, 'DD/MM/YYYY HH:mm:ss') })
  bench('stopcock (compiled)', () => {
    const p = D.parser('DD/MM/YYYY HH:mm:ss')
    for (let i = 0; i < strs.length; i++) p(strs[i]!)
  })
  bench('date-fns', () => { const ref = new Date(); for (let i = 0; i < strs.length; i++) dfnsParse(strs[i]!, 'dd/MM/yyyy HH:mm:ss', ref) })
  bench('luxon', () => { for (let i = 0; i < strs.length; i++) DateTime.fromFormat(strs[i]!, 'dd/MM/yyyy HH:mm:ss') })
  bench('moment', () => { for (let i = 0; i < strs.length; i++) moment(strs[i]!, 'DD/MM/YYYY HH:mm:ss') })
})
