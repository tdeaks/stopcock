import { describe, expect, it } from 'vite-plus/test'
import {
  isNone,
  isSome,
  none,
  some as optionSome,
  type Option,
} from '../option'
import {
  err as resultErr,
  ok as resultOk,
  type Result,
} from '../result'
import * as Optic from '../optic'

describe('optic', () => {
  interface User {
    readonly name: string
    readonly address: {
      readonly city: string
    }
  }

  const user: User = {
    name: 'Ada',
    address: { city: 'London' },
  }

  it('reads, composes, and immutably updates lenses', () => {
    const address = Optic.prop<User, 'address'>('address')
    const city = Optic.prop<User['address'], 'city'>('city')
    const userCity = Optic.compose(address, city)

    expect(Optic.view(userCity)(user)).toBe('London')
    expect(Optic.set(userCity, 'Manchester')(user)).toEqual({
      name: 'Ada',
      address: { city: 'Manchester' },
    })
    expect(user.address.city).toBe('London')
    expect(Optic.set(Optic.prop<User, 'name'>('name'), 'Ada')(user)).toBe(user)
  })

  it('models partial and multi-focus updates explicitly', () => {
    const missing = Optic.index<number>(5)
    expect(isNone(Optic.preview(missing)([1, 2]))).toBe(true)
    expect(Optic.set(missing, 9)([1, 2])).toEqual([1, 2])

    const even = Optic.filtered<number>((value) => value % 2 === 0)
    expect(Optic.collect(even)([1, 2, 3, 4])).toEqual([2, 4])
    expect(Optic.modify(even, (value) => value * 10)([1, 2, 3, 4])).toEqual([
      1,
      20,
      3,
      40,
    ])
  })

  it('supports keyed At optics and the fluent builder', () => {
    const theme = Optic.atKey<'theme', string>('theme')
    const current = Optic.view(theme)({ theme: 'dark' })
    expect(isSome(current) && current.value).toBe('dark')

    const city = Optic.optic<User>().prop('address').prop('city').value
    expect(Optic.view(city as Optic.Lens<User, string>)(user)).toBe('London')
  })

  it('provides Option, Result, predicate, and nullable prisms', () => {
    const present = Optic.some<number>()
    expect(Optic.preview(present)(optionSome(2))).toEqual(optionSome(2))
    expect(Optic.preview(present)(none as Option<number>)).toBe(none)
    expect(
      Optic.modify(present, (value: number) => value * 3)(optionSome(2)),
    ).toEqual(optionSome(6))
    expect(Optic.set(present, 6)(none as Option<number>)).toBe(none)

    const success = Optic.ok<number, string>()
    const failure = Optic.err<number, string>()
    expect(
      Optic.set(success, 3)(resultOk(2) as Result<number, string>),
    ).toEqual(resultOk(3))
    expect(
      Optic.set(success, 3)(resultErr('no') as Result<number, string>),
    ).toEqual(resultErr('no'))
    expect(
      Optic.modify(
        failure,
        (error: string) => error.toUpperCase(),
      )(resultErr('no') as Result<number, string>),
    ).toEqual(resultErr('NO'))

    const positive = Optic.fromPredicate<number>((value) => value > 0)
    expect(Optic.preview(positive)(1)).toEqual(optionSome(1))
    expect(Optic.preview(positive)(-1)).toBe(none)
    expect(Optic.preview(Optic.nonNullable<number>())(null)).toBe(none)
  })

  it('round-trips reversible isomorphisms', () => {
    const textNumber = Optic.iso(
      (value: string) => Number(value),
      (value: number) => String(value),
    )
    const numberText = Optic.reverse(textNumber)
    expect(Optic.view(textNumber)('42')).toBe(42)
    expect(Optic.view(numberText)(42)).toBe('42')
    expect(Optic.set(numberText, '7')(42)).toBe(7)
  })

  it('composes traversals and partial focuses without losing updates', () => {
    const nested = Optic.compose(
      Optic.each<readonly number[]>(),
      Optic.each<number>(),
    )
    expect(Optic.collect(nested)([[1, 2], [3]])).toEqual([1, 2, 3])
    expect(
      Optic.modify(nested, (value: number) => value + 10)([[1, 2], [3]]),
    ).toEqual([[11, 12], [13]])

    const optionAddress = Optic.compose(
      Optic.some<User>(),
      Optic.prop<User, 'address'>('address'),
    )
    expect(
      Optic.modify(optionAddress, (address: User['address']) => ({
        ...address,
        city: 'Paris',
      }))(optionSome(user)),
    ).toEqual(optionSome({ ...user, address: { city: 'Paris' } }))
  })

  it('exposes passing lens-law checks for structural updates', () => {
    const name = Optic.prop<User, 'name'>('name')
    expect(Optic.laws.lensGetSet(name, user)).toBe(true)
    expect(Optic.laws.lensSetGet(name, user, 'Grace')).toBe(true)
    expect(Optic.laws.lensSetSet(name, user, 'Grace', 'Lin')).toBe(true)
  })
})
