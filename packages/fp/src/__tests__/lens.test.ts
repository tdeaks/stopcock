import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { pipe } from '../pipe'
import { lens, prop, index, path, view, set, over, compose } from '../lens'

type User = { name: string; age: number; address: { city: string; zip: string } }

const user: User = { name: 'Alice', age: 30, address: { city: 'NYC', zip: '10001' } }

describe('Lens', () => {
  describe('prop', () => {
    const nameLens = prop<User, 'name'>('name')

    it('view (data-first)', () => {
      expect(view(user, nameLens)).toBe('Alice')
    })

    it('view (data-last)', () => {
      expect(view(nameLens)(user)).toBe('Alice')
    })

    it('set (data-first)', () => {
      const updated = set(user, nameLens, 'Bob')
      expect(updated.name).toBe('Bob')
      expect(updated.age).toBe(30)
    })

    it('set (data-last)', () => {
      const updated = set(nameLens, 'Bob')(user)
      expect(updated.name).toBe('Bob')
    })

    it('over (data-first)', () => {
      const ageLens = prop<User, 'age'>('age')
      expect(over(user, ageLens, n => n + 1).age).toBe(31)
    })

    it('over (data-last)', () => {
      const ageLens = prop<User, 'age'>('age')
      expect(over(ageLens, (n: number) => n + 1)(user).age).toBe(31)
    })

    it('immutability', () => {
      const updated = set(user, nameLens, 'Bob')
      expect(user.name).toBe('Alice')
      expect(updated).not.toBe(user)
    })
  })

  describe('index', () => {
    const second = index<number>(1)

    it('view', () => expect(view([10, 20, 30], second)).toBe(20))
    it('set', () => expect(set([10, 20, 30], second, 99)).toEqual([10, 99, 30]))
    it('over', () => expect(over([10, 20, 30], second, n => n * 2)).toEqual([10, 40, 30]))

    it('immutability', () => {
      const arr = [10, 20, 30]
      const updated = set(arr, second, 99)
      expect(arr[1]).toBe(20)
      expect(updated).not.toBe(arr)
    })
  })

  describe('path', () => {
    const cityLens = path<User, 'address', 'city'>('address', 'city')

    it('view', () => expect(view(user, cityLens)).toBe('NYC'))

    it('set', () => {
      const updated = set(user, cityLens, 'LA')
      expect(updated.address.city).toBe('LA')
      expect(updated.name).toBe('Alice')
    })

    it('immutability', () => {
      set(user, cityLens, 'LA')
      expect(user.address.city).toBe('NYC')
    })
  })

  describe('compose', () => {
    it('composes two lenses', () => {
      const addrLens = prop<User, 'address'>('address')
      const cityLens = prop<User['address'], 'city'>('city')
      const composed = compose(addrLens, cityLens)
      expect(view(user, composed)).toBe('NYC')
      expect(set(user, composed, 'SF').address.city).toBe('SF')
    })
  })

  describe('custom lens', () => {
    const celsiusToFahrenheit = lens<{ celsius: number }, number>(
      s => s.celsius * 9 / 5 + 32,
      (s, f) => ({ celsius: (f - 32) * 5 / 9 }),
    )

    it('view', () => expect(view({ celsius: 100 }, celsiusToFahrenheit)).toBe(212))
    it('set', () => expect(set({ celsius: 0 }, celsiusToFahrenheit, 212).celsius).toBe(100))
  })

  describe('pipe integration', () => {
    it('view in pipe', () => {
      const nameLens = prop<User, 'name'>('name')
      expect(pipe(user, view(nameLens))).toBe('Alice')
    })

    it('over in pipe', () => {
      const nameLens = prop<User, 'name'>('name')
      expect(pipe(user, over(nameLens, (n: string) => n.toUpperCase())).name).toBe('ALICE')
    })

    it('set in pipe', () => {
      const cityLens = path<User, 'address', 'city'>('address', 'city')
      expect(pipe(user, set(cityLens, 'Paris')).address.city).toBe('Paris')
    })
  })

  describe('lens laws (property-based)', () => {
    const nameLens = prop<{ name: string; age: number }, 'name'>('name')
    const arb = fc.record({ name: fc.string(), age: fc.integer() })

    it('get-set: set(s, lens, view(s, lens)) === s', () => {
      fc.assert(fc.property(arb, (s) => {
        expect(set(s, nameLens, view(s, nameLens))).toEqual(s)
      }))
    })

    it('set-get: view(set(s, lens, a), lens) === a', () => {
      fc.assert(fc.property(arb, fc.string(), (s, a) => {
        expect(view(set(s, nameLens, a), nameLens)).toBe(a)
      }))
    })

    it('set-set: set(set(s, lens, a), lens, b) === set(s, lens, b)', () => {
      fc.assert(fc.property(arb, fc.string(), fc.string(), (s, a, b) => {
        expect(set(set(s, nameLens, a), nameLens, b)).toEqual(set(s, nameLens, b))
      }))
    })
  })
})
