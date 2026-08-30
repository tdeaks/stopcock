# @stopcock/date

Date and time manipulation. Immutable, pipe-friendly, no dependencies on Intl or native Date quirks.

```bash
bun add @stopcock/date
```

```ts
import * as D from '@stopcock/date'
import { pipe } from '@stopcock/fp'

const nextFriday = pipe(
  D.now(),
  D.startOf('week'),
  D.add(5, 'day'),
  D.setHours(9),
  D.format('YYYY-MM-DD HH:mm'),
)
```

## Dual operation reference

The left call is direct and data-first. The right call is the equivalent
data-last form.

```ts
D.clamp(timestamp, low, high) / D.clamp(low, high)(timestamp)
D.isBefore(timestamp, other) / D.isBefore(other)(timestamp)
D.isAfter(timestamp, other) / D.isAfter(other)(timestamp)
D.isEqual(timestamp, other) / D.isEqual(other)(timestamp)
D.isSameDay(timestamp, other) / D.isSameDay(other)(timestamp)
D.isSameMonth(timestamp, other) / D.isSameMonth(other)(timestamp)
D.isSameYear(timestamp, other) / D.isSameYear(other)(timestamp)
D.isBetween(timestamp, start, end) / D.isBetween(start, end)(timestamp)

D.add(timestamp, amount, unit) / D.add(amount, unit)(timestamp)
D.subtract(timestamp, amount, unit) / D.subtract(amount, unit)(timestamp)
D.startOf(timestamp, unit) / D.startOf(unit)(timestamp)
D.endOf(timestamp, unit) / D.endOf(unit)(timestamp)
D.setYear(timestamp, year) / D.setYear(year)(timestamp)
D.setMonth(timestamp, month) / D.setMonth(month)(timestamp)
D.setDay(timestamp, day) / D.setDay(day)(timestamp)
D.setHours(timestamp, hours) / D.setHours(hours)(timestamp)
D.setMinutes(timestamp, minutes) / D.setMinutes(minutes)(timestamp)
D.setSeconds(timestamp, seconds) / D.setSeconds(seconds)(timestamp)

D.diff(a, b, unit) / D.diff(b, unit)(a)
D.diffInDays(a, b) / D.diffInDays(b)(a)
D.diffInHours(a, b) / D.diffInHours(b)(a)
D.diffInMinutes(a, b) / D.diffInMinutes(b)(a)
D.diffInSeconds(a, b) / D.diffInSeconds(b)(a)
D.diffInMonths(a, b) / D.diffInMonths(b)(a)
D.diffInYears(a, b) / D.diffInYears(b)(a)

D.roundTo(timestamp, unit) / D.roundTo(unit)(timestamp)
D.ceilTo(timestamp, unit) / D.ceilTo(unit)(timestamp)
D.floorTo(timestamp, unit) / D.floorTo(unit)(timestamp)
D.snapTo(timestamp, interval, unit) / D.snapTo(interval, unit)(timestamp)

D.addDuration(timestamp, duration) / D.addDuration(duration)(timestamp)
D.subtractDuration(timestamp, duration) / D.subtractDuration(duration)(timestamp)
D.durationToUnit(duration, unit) / D.durationToUnit(unit)(duration)

D.range(start, end, step, unit) / D.range(end, step, unit)(start)
D.rangeBy(start, end, stepFn) / D.rangeBy(end, stepFn)(start)
D.sequence(start, count, step, unit) / D.sequence(count, step, unit)(start)

D.addBusinessDays(timestamp, amount) / D.addBusinessDays(amount)(timestamp)
D.subtractBusinessDays(timestamp, amount) / D.subtractBusinessDays(amount)(timestamp)
D.businessDaysBetween(a, b) / D.businessDaysBetween(b)(a)
D.addBusinessDaysWithHolidays(timestamp, amount, holidays) /
  D.addBusinessDaysWithHolidays(amount, holidays)(timestamp)

D.format(timestamp, template) / D.format(template)(timestamp)
D.parse(input, template) / D.parse(template)(input)
D.tryParse(input, template) / D.tryParse(template)(input)
```

Timezone operations use the same convention. Curried timezone arithmetic does
not accept the optional disambiguation argument. Use the complete data-first
call when you need `earlier`, `later`, or `compatible`.

```ts
D.Tz.getYear(timestamp, zone)                    / D.Tz.getYear(zone)(timestamp)
D.Tz.getMonth(timestamp, zone)                   / D.Tz.getMonth(zone)(timestamp)
D.Tz.getDay(timestamp, zone)                     / D.Tz.getDay(zone)(timestamp)
D.Tz.getHours(timestamp, zone)                   / D.Tz.getHours(zone)(timestamp)
D.Tz.getMinutes(timestamp, zone)                 / D.Tz.getMinutes(zone)(timestamp)
D.Tz.getSeconds(timestamp, zone)                 / D.Tz.getSeconds(zone)(timestamp)
D.Tz.isSameDay(a, b, zone)                       / D.Tz.isSameDay(b, zone)(a)
D.Tz.startOf(timestamp, unit, zone, disambiguation?) / D.Tz.startOf(unit, zone)(timestamp)
D.Tz.endOf(timestamp, unit, zone, disambiguation?) / D.Tz.endOf(unit, zone)(timestamp)
D.Tz.add(timestamp, amount, unit, zone, disambiguation?) / D.Tz.add(amount, unit, zone)(timestamp)
D.Tz.subtract(timestamp, amount, unit, zone, disambiguation?) / D.Tz.subtract(amount, unit, zone)(timestamp)
D.Tz.format(timestamp, template, zone)            / D.Tz.format(template, zone)(timestamp)
D.Tz.diff(a, b, unit, zone)                       / D.Tz.diff(b, unit, zone)(a)
```

## What's in the box

- **Creation**: `now`, `fromDate`, `fromParts`, `fromISO`, `fromTimestamp`
- **Extraction**: `getYear`, `getMonth`, `getDay`, `getWeekday`, `getDayOfYear`, `getQuarter`, etc.
- **Comparison**: `isBefore`, `isAfter`, `isBetween`, `isWeekend`, `isToday`, `min`, `max`, `clamp`
- **Arithmetic**: `add`, `subtract`, `diff`, `diffInDays`, `diffInMonths`, `startOf`, `endOf`, `roundTo`
- **Duration**: `duration`, `addDuration`, `subtractDuration`, `scaleDuration`
- **Ranges**: `range`, `rangeBy`, `daysIn`, `weekdaysIn`, `overlaps`, `intersection`, `mergeIntervals`
- **Business days**: `isBusinessDay`, `addBusinessDays`, `businessDaysBetween`, `addBusinessDaysWithHolidays`
- **Format / Parse**: `format`, `parse`, `tryParse`, `parseISO`, `formatter`, `parser`
- **Timezones**: `Tz` namespace

[Docs](https://stopcock.dev/libraries/date)
