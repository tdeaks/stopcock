import { expectTypeOf, test } from 'vite-plus/test'
import { range, rangeBy, Tz, type Timestamp } from '../index'

const start = null as unknown as Timestamp
const end = null as unknown as Timestamp

test('range overloads match the executable data-last boundary', () => {
  expectTypeOf(range(start, end, 1, 'day')).toEqualTypeOf<Timestamp[]>()
  expectTypeOf(range(end, 1, 'day')).toEqualTypeOf<(start: Timestamp) => Timestamp[]>()
  expectTypeOf(rangeBy(start, end, (value) => value)).toEqualTypeOf<Timestamp[]>()
  expectTypeOf(rangeBy(end, (value) => value)).toEqualTypeOf<(start: Timestamp) => Timestamp[]>()

  // @ts-expect-error The end timestamp is required before the unary data-last closure.
  range(1, 'day')
  // @ts-expect-error The end timestamp is required before the unary data-last closure.
  rangeBy((value: Timestamp) => value)
})

test('timezone overloads keep optional disambiguation on the data-first side', () => {
  expectTypeOf(Tz.startOf(start, 'day', 'UTC', 'later')).toEqualTypeOf<Timestamp>()
  expectTypeOf(Tz.endOf(start, 'day', 'UTC', 'earlier')).toEqualTypeOf<Timestamp>()
  expectTypeOf(Tz.add(start, 1, 'day', 'UTC', 'later')).toEqualTypeOf<Timestamp>()
  expectTypeOf(Tz.subtract(start, 1, 'day', 'UTC', 'earlier')).toEqualTypeOf<Timestamp>()

  expectTypeOf(Tz.startOf('day', 'UTC')).toEqualTypeOf<(ts: Timestamp) => Timestamp>()
  expectTypeOf(Tz.endOf('day', 'UTC')).toEqualTypeOf<(ts: Timestamp) => Timestamp>()
  expectTypeOf(Tz.add(1, 'day', 'UTC')).toEqualTypeOf<(ts: Timestamp) => Timestamp>()
  expectTypeOf(Tz.subtract(1, 'day', 'UTC')).toEqualTypeOf<(ts: Timestamp) => Timestamp>()

  // @ts-expect-error Length-based dispatch cannot distinguish this from data-first startOf.
  Tz.startOf('day', 'UTC', 'later')
  // @ts-expect-error Length-based dispatch cannot distinguish this from data-first endOf.
  Tz.endOf('day', 'UTC', 'earlier')
  // @ts-expect-error Length-based dispatch cannot distinguish this from data-first add.
  Tz.add(1, 'day', 'UTC', 'later')
  // @ts-expect-error Length-based dispatch cannot distinguish this from data-first subtract.
  Tz.subtract(1, 'day', 'UTC', 'earlier')
})
