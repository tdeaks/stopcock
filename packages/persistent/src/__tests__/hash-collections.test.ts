import { describe, expect, it } from 'vite-plus/test'
import { makeHashEq } from '../hash'
import { HashMap } from '../hash-map'
import { HashSet } from '../hash-set'

describe('HashMap', () => {
  it('matches JavaScript key semantics and distinguishes stored undefined', () => {
    const object = { id: 1 }
    const sameShape = { id: 1 }
    const map = HashMap.empty<unknown, string | undefined>()
      .set(Number.NaN, 'nan')
      .set(-0, 'zero')
      .set(object, 'object')
      .set('undefined', undefined)

    expect(map.get(Number.NaN)).toBe('nan')
    expect(map.get(0)).toBe('zero')
    expect(map.get(object)).toBe('object')
    expect(map.get(sameShape)).toBeUndefined()
    expect(map.has(sameShape)).toBe(false)
    expect(map.has('undefined')).toBe(true)
    expect(map.getEntry('undefined')).toEqual({ found: true, value: undefined })
    expect(map.getEntry('missing')).toEqual({ found: false, value: undefined })
    expect(map.size).toBe(4)
  })

  it('preserves prior versions through updates and removals', () => {
    const original = HashMap.from<string, number>([
      ['one', 1],
      ['two', 2],
    ])
    const updated = original.set('two', 20).set('three', 3)
    const removed = updated.remove('one')

    expect(original.toMap()).toEqual(
      new Map([
        ['one', 1],
        ['two', 2],
      ]),
    )
    expect(updated.toMap()).toEqual(
      new Map([
        ['one', 1],
        ['two', 20],
        ['three', 3],
      ]),
    )
    expect(removed.has('one')).toBe(false)
    expect(removed.size).toBe(2)
    expect(removed.remove('missing')).toBe(removed)
    expect(original.set('one', 1)).toBe(original)
  })

  it('handles deliberate full-hash collisions correctly', () => {
    const colliding = makeHashEq<{ id: number }>(
      () => 1,
      (left, right) => left.id === right.id,
    )
    let map = HashMap.empty<{ id: number }, string>(colliding)
    for (let id = 0; id < 200; id += 1) map = map.set({ id }, `value:${id}`)

    expect(map.size).toBe(200)
    expect(map.get({ id: 0 })).toBe('value:0')
    expect(map.get({ id: 199 })).toBe('value:199')
    const removed = map.remove({ id: 100 })
    expect(removed.size).toBe(199)
    expect(removed.has({ id: 100 })).toBe(false)
    expect(map.has({ id: 100 })).toBe(true)
  })

  it('handles deep trie paths and custom domain equality', () => {
    const integer = makeHashEq<number>((value) => value, Object.is)
    const values = [0, 1, 31, 32, 33, 1 << 10, 1 << 20, 0x40000000, -1, -2147483648]
    const map = HashMap.from(
      values.map((value) => [value, String(value)] as const),
      integer,
    )
    for (const value of values) expect(map.get(value)).toBe(String(value))

    const caseInsensitive = makeHashEq<string>(
      (value) => {
        let hash = 0
        for (const character of value.toLowerCase()) {
          hash = Math.imul(hash, 31) + character.charCodeAt(0)
        }
        return hash
      },
      (left, right) => left.toLowerCase() === right.toLowerCase(),
    )
    const names = HashMap.empty<string, number>(caseInsensitive).set('Ada', 1).set('ADA', 2)
    expect(names.size).toBe(1)
    expect(names.get('ada')).toBe(2)
    expect([...names.keys()]).toEqual(['Ada'])
  })

  it('maps, filters, merges, and builds in mutable bulk mode', () => {
    const input = HashMap.from([
      ['one', 1],
      ['two', 2],
      ['three', 3],
    ])
    expect(input.mapValues((value) => value * 2).toMap()).toEqual(
      new Map([
        ['one', 2],
        ['two', 4],
        ['three', 6],
      ]),
    )
    expect(input.filter((value) => value > 1).toMap()).toEqual(
      new Map([
        ['two', 2],
        ['three', 3],
      ]),
    )
    expect(
      input
        .merge([
          ['one', 10],
          ['four', 4],
        ])
        .toMap(),
    ).toEqual(
      new Map([
        ['one', 10],
        ['two', 2],
        ['three', 3],
        ['four', 4],
      ]),
    )

    const builder = input.transient()
    builder.set('four', 4).set('two', 20)
    expect(builder.remove('one')).toBe(true)
    expect(builder.remove('missing')).toBe(false)
    const output = builder.build()
    expect(output.toMap()).toEqual(
      new Map([
        ['two', 20],
        ['three', 3],
        ['four', 4],
      ]),
    )
    expect(() => builder.set('five', 5)).toThrow(/sealed/)
    expect(() => builder.remove('two')).toThrow(/sealed/)
    expect(() => builder.build()).toThrow(/sealed/)
  })

  it('tracks a deterministic native-map model through mixed mutations', () => {
    let persistent = HashMap.empty<number, number>()
    const native = new Map<number, number>()
    let state = 0x12345678
    const next = (): number => {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      return state >>> 0
    }

    for (let operation = 0; operation < 5_000; operation += 1) {
      const key = next() % 750
      if ((next() & 3) === 0) {
        persistent = persistent.remove(key)
        native.delete(key)
      } else {
        const value = next()
        persistent = persistent.set(key, value)
        native.set(key, value)
      }
    }

    expect(persistent.size).toBe(native.size)
    for (let key = 0; key < 750; key += 1) {
      expect(persistent.has(key)).toBe(native.has(key))
      expect(persistent.get(key)).toBe(native.get(key))
    }
  })
})

describe('HashSet', () => {
  it('supports immutable set algebra, collisions, and NaN', () => {
    const original = HashSet.from([1, 2, Number.NaN, Number.NaN])
    const updated = original.add(3).remove(1)

    expect(original.size).toBe(3)
    expect(original.has(Number.NaN)).toBe(true)
    expect(original.has(3)).toBe(false)
    expect(updated.has(1)).toBe(false)
    expect(updated.has(3)).toBe(true)
    expect([...HashSet.from([1, 2]).union([2, 3])].sort()).toEqual([1, 2, 3])
    expect([...HashSet.from([1, 2, 3]).intersection([2, 3, 4])].sort()).toEqual([2, 3])
    expect([...HashSet.from([1, 2, 3]).difference([2])].sort()).toEqual([1, 3])
    expect(HashSet.from([1, 2]).isSubsetOf([0, 1, 2, 3])).toBe(true)
  })

  it('has a sealed bulk builder', () => {
    const builder = HashSet.builder<number>()
    builder.addAll([1, 2, 2, 3])
    expect(builder.remove(2)).toBe(true)
    const output = builder.build()
    expect(output.toSet()).toEqual(new Set([1, 3]))
    expect(() => builder.add(4)).toThrow(/sealed/)
    expect(() => builder.addAll([])).toThrow(/sealed/)
    expect(() => builder.clear()).toThrow(/sealed/)
  })
})
