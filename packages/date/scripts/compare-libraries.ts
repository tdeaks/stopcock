/**
 * @stopcock/date output comparison against date-fns, dayjs and luxon.
 *
 * Not wired into any suite, and deliberately not a gate: the comparison
 * libraries are not dependencies of this repo. Install them somewhere and run
 * it by hand when you want to check our calendar answers against the field.
 *
 *   npm install date-fns dayjs luxon
 *   TZ=UTC bun run packages/date/scripts/compare-libraries.ts
 *
 * This compares *answers*, not speed. The host is currently out of perf
 * qualification, so a timing comparison would be worthless; calendar logic is
 * unaffected by that.
 *
 * Everything runs under TZ=UTC. @stopcock/date is UTC-based by construction
 * while date-fns and dayjs default to local time, so without pinning the zone
 * most rows would differ for reasons that have nothing to do with calendar
 * logic. Pinning it isolates the disagreements that are actually interesting.
 *
 * A disagreement here is not automatically a bug. Several are documented
 * choices where the libraries genuinely differ (week start, whether a month
 * difference counts days). Those are labelled.
 */
import * as D from '../src/index'
import {
  addMonths, addYears, differenceInMonths, differenceInYears, differenceInDays,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, getISOWeek, getWeek,
  getDayOfYear, getDaysInMonth, isLeapYear, format as dfFormat, parseISO,
} from 'date-fns'
import dayjs from 'dayjs'
import { DateTime } from 'luxon'

const iso = (ms: number): string => new Date(ms).toISOString()
const ts = (s: string): number => Date.parse(s)

interface Row {
  readonly group: string
  readonly case: string
  readonly stopcock: string
  readonly dateFns: string
  readonly dayjs: string
  readonly luxon: string
  readonly note?: string
}

const rows: Row[] = []
const push = (r: Row): void => { rows.push(r) }

// ── month arithmetic across a short month ────────────────────────────
// The classic divergence: what is Jan 31 plus one month?
for (const start of ['2026-01-31T00:00:00.000Z', '2026-03-31T00:00:00.000Z', '2024-02-29T00:00:00.000Z']) {
  push({
    group: 'add 1 month',
    case: start.slice(0, 10),
    stopcock: iso(D.add(ts(start), 1, 'month')),
    dateFns: addMonths(parseISO(start), 1).toISOString(),
    dayjs: dayjs(start).add(1, 'month').toISOString(),
    luxon: DateTime.fromISO(start, { zone: 'utc' }).plus({ months: 1 }).toISO({ suppressMilliseconds: false })!,
  })
}

// Feb 29 plus a year: does it clamp to Feb 28 or roll to Mar 1?
push({
  group: 'add 1 year',
  case: '2024-02-29 (leap)',
  stopcock: iso(D.add(ts('2024-02-29T00:00:00.000Z'), 1, 'year')),
  dateFns: addYears(parseISO('2024-02-29T00:00:00.000Z'), 1).toISOString(),
  dayjs: dayjs('2024-02-29T00:00:00.000Z').add(1, 'year').toISOString(),
  luxon: DateTime.fromISO('2024-02-29T00:00:00.000Z', { zone: 'utc' }).plus({ years: 1 }).toISO()!,
})

// ── week boundaries ──────────────────────────────────────────────────
// date-fns and dayjs default to a Sunday week start; stopcock and luxon use
// Monday. Both defaults are shown, plus date-fns forced to Monday.
for (const day of ['2026-07-26T12:00:00.000Z', '2026-07-27T12:00:00.000Z']) {
  push({
    group: 'startOf week',
    case: `${day.slice(0, 10)} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(day).getUTCDay()]})`,
    stopcock: iso(D.startOf(ts(day), 'week')),
    dateFns: `${startOfWeek(parseISO(day)).toISOString()} (Sun default)`,
    dayjs: `${dayjs(day).startOf('week').toISOString()} (Sun default)`,
    luxon: DateTime.fromISO(day, { zone: 'utc' }).startOf('week').toISO()!,
    note: 'week start convention differs by design',
  })
}
push({
  group: 'startOf week',
  case: '2026-07-26 (date-fns forced Mon)',
  stopcock: iso(D.startOf(ts('2026-07-26T12:00:00.000Z'), 'week')),
  dateFns: startOfWeek(parseISO('2026-07-26T12:00:00.000Z'), { weekStartsOn: 1 }).toISOString(),
  dayjs: '—',
  luxon: DateTime.fromISO('2026-07-26T12:00:00.000Z', { zone: 'utc' }).startOf('week').toISO()!,
})

// ── week of year ─────────────────────────────────────────────────────
// stopcock implements the ISO rule (Jan 4, Monday-based). date-fns exposes
// both; the locale one is shown to make the distinction visible.
for (const day of ['2026-01-01T00:00:00.000Z', '2027-01-03T00:00:00.000Z', '2021-01-01T00:00:00.000Z', '2020-12-31T00:00:00.000Z']) {
  push({
    group: 'week of year',
    case: day.slice(0, 10),
    stopcock: String(D.getWeekOfYear(ts(day))),
    dateFns: `${getISOWeek(parseISO(day))} ISO / ${getWeek(parseISO(day))} locale`,
    dayjs: '— (needs plugin)',
    luxon: String(DateTime.fromISO(day, { zone: 'utc' }).weekNumber),
  })
}

// ── differences ──────────────────────────────────────────────────────
// Does a month difference consider the day of month?
for (const [a, b] of [
  ['2026-03-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z'],
  ['2026-02-28T00:00:00.000Z', '2026-01-31T00:00:00.000Z'],
  ['2026-12-31T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
]) {
  push({
    group: 'diff in months',
    case: `${a.slice(0, 10)} − ${b.slice(0, 10)}`,
    stopcock: String(D.diffInMonths(ts(a), ts(b))),
    dateFns: String(differenceInMonths(parseISO(a), parseISO(b))),
    dayjs: String(dayjs(a).diff(dayjs(b), 'month')),
    luxon: String(Math.trunc(DateTime.fromISO(a, { zone: 'utc' }).diff(DateTime.fromISO(b, { zone: 'utc' }), 'months').months)),
  })
}
push({
  group: 'diff in years',
  case: '2026-02-28 − 2024-02-29',
  stopcock: String(D.diffInYears(ts('2026-02-28T00:00:00.000Z'), ts('2024-02-29T00:00:00.000Z'))),
  dateFns: String(differenceInYears(parseISO('2026-02-28T00:00:00.000Z'), parseISO('2024-02-29T00:00:00.000Z'))),
  dayjs: String(dayjs('2026-02-28T00:00:00.000Z').diff(dayjs('2024-02-29T00:00:00.000Z'), 'year')),
  luxon: String(Math.trunc(DateTime.fromISO('2026-02-28T00:00:00.000Z', { zone: 'utc' }).diff(DateTime.fromISO('2024-02-29T00:00:00.000Z', { zone: 'utc' }), 'years').years)),
})
push({
  group: 'diff in days',
  case: '2026-03-01 − 2026-02-01',
  stopcock: String(D.diffInDays(ts('2026-03-01T00:00:00.000Z'), ts('2026-02-01T00:00:00.000Z'))),
  dateFns: String(differenceInDays(parseISO('2026-03-01T00:00:00.000Z'), parseISO('2026-02-01T00:00:00.000Z'))),
  dayjs: String(dayjs('2026-03-01T00:00:00.000Z').diff(dayjs('2026-02-01T00:00:00.000Z'), 'day')),
  luxon: String(DateTime.fromISO('2026-03-01T00:00:00.000Z', { zone: 'utc' }).diff(DateTime.fromISO('2026-02-01T00:00:00.000Z', { zone: 'utc' }), 'days').days),
})

// ── plain calendar facts, where everyone should agree ────────────────
for (const day of ['2026-07-26T00:00:00.000Z', '2024-02-29T00:00:00.000Z', '2000-02-15T00:00:00.000Z', '1900-03-01T00:00:00.000Z']) {
  push({
    group: 'day of year',
    case: day.slice(0, 10),
    stopcock: String(D.getDayOfYear(ts(day))),
    dateFns: String(getDayOfYear(parseISO(day))),
    dayjs: '— (needs plugin)',
    luxon: String(DateTime.fromISO(day, { zone: 'utc' }).ordinal),
  })
  push({
    group: 'days in month',
    case: day.slice(0, 7),
    stopcock: String(D.getDaysInMonth(ts(day))),
    dateFns: String(getDaysInMonth(parseISO(day))),
    dayjs: String(dayjs(day).daysInMonth()),
    luxon: String(DateTime.fromISO(day, { zone: 'utc' }).daysInMonth),
  })
  push({
    group: 'leap year',
    case: day.slice(0, 4),
    stopcock: String(D.isLeapYear(ts(day))),
    dateFns: String(isLeapYear(parseISO(day))),
    dayjs: '— (needs plugin)',
    luxon: String(DateTime.fromISO(day, { zone: 'utc' }).isInLeapYear),
  })
}

// ── formatting ───────────────────────────────────────────────────────
for (const day of ['2026-07-26T09:05:03.007Z', '2026-01-01T23:59:59.999Z']) {
  push({
    group: 'format YYYY-MM-DD HH:mm:ss',
    case: day,
    stopcock: D.format(ts(day), 'YYYY-MM-DD HH:mm:ss'),
    dateFns: dfFormat(parseISO(day), 'yyyy-MM-dd HH:mm:ss'),
    dayjs: dayjs(day).format('YYYY-MM-DD HH:mm:ss'),
    luxon: DateTime.fromISO(day, { zone: 'utc' }).toFormat('yyyy-MM-dd HH:mm:ss'),
  })
  push({
    group: 'format dddd MMMM',
    case: day.slice(0, 10),
    stopcock: D.format(ts(day), 'dddd MMMM'),
    dateFns: dfFormat(parseISO(day), 'EEEE MMMM'),
    dayjs: dayjs(day).format('dddd MMMM'),
    luxon: DateTime.fromISO(day, { zone: 'utc' }).toFormat('EEEE MMMM'),
  })
}

// ── ISO round trip ───────────────────────────────────────────────────
for (const day of ['2026-07-26T09:05:03.007Z', '1969-07-20T20:17:40.000Z', '2100-12-31T23:59:59.999Z']) {
  push({
    group: 'ISO round trip',
    case: day,
    stopcock: D.toISO(D.fromISO(day)!),
    dateFns: parseISO(day).toISOString(),
    dayjs: dayjs(day).toISOString(),
    luxon: DateTime.fromISO(day, { zone: 'utc' }).toISO()!,
  })
}

// ── report ───────────────────────────────────────────────────────────
const normalize = (v: string): string =>
  v
    .replace(/\+00:00$/u, 'Z')
    .replace(/ \(.*\)$/u, '')
    // The week-of-year row reports date-fns's ISO and locale answers together,
    // because the difference between them is the point. Compare on the ISO one.
    .replace(/^(\d+) ISO \/ \d+ locale$/u, '$1')
    .trim()
const comparable = (r: Row): string[] =>
  [r.dateFns, r.dayjs, r.luxon].filter((v) => !v.startsWith('—')).map(normalize)

let agree = 0
let differ = 0
const disagreements: Row[] = []

const pad = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n))
let lastGroup = ''
for (const r of rows) {
  if (r.group !== lastGroup) {
    console.log(`\n${r.group}`)
    console.log(`  ${pad('case', 34)}${pad('stopcock', 28)}${pad('date-fns', 28)}${pad('dayjs', 28)}luxon`)
    lastGroup = r.group
  }
  const others = comparable(r)
  const same = others.every((v) => v === normalize(r.stopcock))
  if (same) agree++
  else { differ++; disagreements.push(r) }
  console.log(
    `  ${same ? ' ' : '!'} ${pad(r.case, 32)}${pad(r.stopcock, 28)}${pad(r.dateFns, 28)}${pad(r.dayjs, 28)}${r.luxon}`,
  )
}

console.log(`\n${'─'.repeat(100)}`)
console.log(`${rows.length} comparisons: ${agree} agree with every comparable library, ${differ} differ`)
if (disagreements.length > 0) {
  console.log('\nRows where @stopcock/date differs from at least one library:')
  for (const r of disagreements) {
    console.log(`  ${r.group} / ${r.case}${r.note ? `  — ${r.note}` : ''}`)
  }
}
