import { describe, it, expect } from 'vitest'
import { compose, decompose } from '../core'
import { isBusinessDay, addBusinessDays, subtractBusinessDays, businessDaysBetween, nextBusinessDay, prevBusinessDay, addBusinessDaysWithHolidays } from '../business'
import type { Timestamp } from '../types'

const mon = compose(2024, 3, 11, 10, 30, 0, 0)  // Monday
const sat = compose(2024, 3, 16, 10, 30, 0, 0)  // Saturday
const sun = compose(2024, 3, 17, 10, 30, 0, 0)  // Sunday
const fri = compose(2024, 3, 15, 10, 30, 0, 0)  // Friday

describe('isBusinessDay', () => {
  it('Monday is a business day', () => expect(isBusinessDay(mon)).toBe(true))
  it('Friday is a business day', () => expect(isBusinessDay(fri)).toBe(true))
  it('Saturday is not', () => expect(isBusinessDay(sat)).toBe(false))
  it('Sunday is not', () => expect(isBusinessDay(sun)).toBe(false))
})

describe('addBusinessDays', () => {
  it('adds 1 from Monday -> Tuesday', () => {
    expect(decompose(addBusinessDays(mon, 1)).day).toBe(12)
  })

  it('adds 5 from Monday -> next Monday', () => {
    expect(decompose(addBusinessDays(mon, 5)).day).toBe(18)
  })

  it('skips weekends', () => {
    const result = decompose(addBusinessDays(fri, 1))
    expect(result.day).toBe(18) // Friday + 1 biz day = Monday
  })

  it('preserves time of day', () => {
    const result = decompose(addBusinessDays(mon, 1))
    expect(result.hour).toBe(10)
    expect(result.minute).toBe(30)
  })

  it('data-last', () => {
    const fn = addBusinessDays(1)
    expect(decompose(fn(mon)).day).toBe(12)
  })
})

describe('subtractBusinessDays', () => {
  it('subtracts 1 from Monday -> previous Friday', () => {
    expect(decompose(subtractBusinessDays(mon, 1)).day).toBe(8) // Friday Mar 8
  })

  it('data-last', () => {
    const fn = subtractBusinessDays(1)
    expect(decompose(fn(mon)).day).toBe(8)
  })
})

describe('businessDaysBetween', () => {
  it('Mon to Fri = 4', () => {
    expect(businessDaysBetween(mon, fri)).toBe(4)
  })

  it('Mon to next Mon = 5', () => {
    const nextMon = compose(2024, 3, 18, 10, 0, 0, 0)
    expect(businessDaysBetween(mon, nextMon)).toBe(5)
  })

  it('reversed args still works', () => {
    expect(businessDaysBetween(fri, mon)).toBe(4)
  })

  it('data-last', () => {
    const fn = businessDaysBetween(fri)
    expect(fn(mon)).toBe(4)
  })
})

describe('nextBusinessDay', () => {
  it('from Friday -> Monday', () => {
    expect(decompose(nextBusinessDay(fri)).day).toBe(18)
  })

  it('from Monday -> Tuesday', () => {
    expect(decompose(nextBusinessDay(mon)).day).toBe(12)
  })
})

describe('prevBusinessDay', () => {
  it('from Monday -> Friday', () => {
    expect(decompose(prevBusinessDay(mon)).day).toBe(8)
  })
})

describe('addBusinessDaysWithHolidays', () => {
  const holiday = compose(2024, 3, 12, 0, 0, 0, 0) as Timestamp // Tuesday

  it('skips holidays', () => {
    const result = decompose(addBusinessDaysWithHolidays(mon, 1, [holiday]))
    expect(result.day).toBe(13) // skips Tuesday holiday -> Wednesday
  })

  it('data-last', () => {
    const fn = addBusinessDaysWithHolidays(1, [holiday])
    expect(decompose(fn(mon)).day).toBe(13)
  })
})
