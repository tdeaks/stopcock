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

## What's in the box

- **Creation** — `now`, `fromDate`, `fromParts`, `fromISO`, `fromTimestamp`
- **Extraction** — `getYear`, `getMonth`, `getDay`, `getWeekday`, `getDayOfYear`, `getQuarter`, etc.
- **Comparison** — `isBefore`, `isAfter`, `isBetween`, `isWeekend`, `isToday`, `min`, `max`, `clamp`
- **Arithmetic** — `add`, `subtract`, `diff`, `diffInDays`, `diffInMonths`, `startOf`, `endOf`, `roundTo`
- **Duration** — `duration`, `addDuration`, `subtractDuration`, `scaleDuration`
- **Ranges** — `range`, `rangeBy`, `daysIn`, `weekdaysIn`, `overlaps`, `intersection`, `mergeIntervals`
- **Business days** — `isBusinessDay`, `addBusinessDays`, `businessDaysBetween`, `addBusinessDaysWithHolidays`
- **Format / Parse** — `format`, `parse`, `tryParse`, `parseISO`, `formatter`, `parser`
- **Timezones** — `Tz` namespace

[Docs](https://stopcock.dev/libraries/date)
