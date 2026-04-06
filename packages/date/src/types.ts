declare const TimestampBrand: unique symbol
declare const DurationBrand: unique symbol

export type Timestamp = number & { readonly [TimestampBrand]: true }
export type Duration = number & { readonly [DurationBrand]: true }

export type DateUnit =
  | 'year' | 'month' | 'week' | 'day'
  | 'hour' | 'minute' | 'second' | 'millisecond'

export type TimeUnit = 'hour' | 'minute' | 'second' | 'millisecond'

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type DateParts = {
  readonly year: number
  readonly month: number  // 1-12
  readonly day?: number   // 1-31, defaults to 1
  readonly hour?: number
  readonly minute?: number
  readonly second?: number
  readonly millisecond?: number
}

export type Civil = { year: number; month: number; day: number }
