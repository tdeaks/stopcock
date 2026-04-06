import { bench, describe } from 'vitest'
import * as D from '@stopcock/date'
import type { Timestamp } from '@stopcock/date'
import { differenceInDays, differenceInMonths, differenceInYears } from 'date-fns'
import { DateTime } from 'luxon'
import moment from 'moment'
import { getTimestampPairs, type Size } from './setup'

const MS_DAY = 86_400_000

describe.each([100, 1_000, 10_000])('diffInDays (batch) — n=%i', (n) => {
  const pairs = getTimestampPairs(n as Size)
  const datePairs = pairs.map(([a, b]) => [new Date(a as number), new Date(b as number)] as const)

  bench('stopcock', () => { for (let i = 0; i < pairs.length; i++) D.diffInDays(pairs[i]![0], pairs[i]![1]) })
  bench('date-fns', () => { for (let i = 0; i < datePairs.length; i++) differenceInDays(datePairs[i]![0], datePairs[i]![1]) })
  bench('luxon', () => { for (let i = 0; i < pairs.length; i++) DateTime.fromMillis(pairs[i]![0] as number).diff(DateTime.fromMillis(pairs[i]![1] as number), 'days').days })
  bench('moment', () => { for (let i = 0; i < pairs.length; i++) moment(pairs[i]![0] as number).diff(moment(pairs[i]![1] as number), 'days') })
})

describe.each([100, 1_000, 10_000])('diffInMonths (batch) — n=%i', (n) => {
  const pairs = getTimestampPairs(n as Size)
  const datePairs = pairs.map(([a, b]) => [new Date(a as number), new Date(b as number)] as const)

  bench('stopcock', () => { for (let i = 0; i < pairs.length; i++) D.diffInMonths(pairs[i]![0], pairs[i]![1]) })
  bench('date-fns', () => { for (let i = 0; i < datePairs.length; i++) differenceInMonths(datePairs[i]![0], datePairs[i]![1]) })
  bench('luxon', () => { for (let i = 0; i < pairs.length; i++) DateTime.fromMillis(pairs[i]![0] as number).diff(DateTime.fromMillis(pairs[i]![1] as number), 'months').months })
  bench('moment', () => { for (let i = 0; i < pairs.length; i++) moment(pairs[i]![0] as number).diff(moment(pairs[i]![1] as number), 'months') })
})

describe.each([100, 1_000, 10_000])('diffInYears (batch) — n=%i', (n) => {
  const pairs = getTimestampPairs(n as Size)
  const datePairs = pairs.map(([a, b]) => [new Date(a as number), new Date(b as number)] as const)

  bench('stopcock', () => { for (let i = 0; i < pairs.length; i++) D.diffInYears(pairs[i]![0], pairs[i]![1]) })
  bench('date-fns', () => { for (let i = 0; i < datePairs.length; i++) differenceInYears(datePairs[i]![0], datePairs[i]![1]) })
  bench('luxon', () => { for (let i = 0; i < pairs.length; i++) DateTime.fromMillis(pairs[i]![0] as number).diff(DateTime.fromMillis(pairs[i]![1] as number), 'years').years })
  bench('moment', () => { for (let i = 0; i < pairs.length; i++) moment(pairs[i]![0] as number).diff(moment(pairs[i]![1] as number), 'years') })
})
