import { describe, expect, it } from 'vite-plus/test'
import { makeHashEq } from '../hash'
import { OrderedMap } from '../ordered-map'
import { OrderedSet } from '../ordered-set'

describe('OrderedMap', () => {
  it('preserves insertion order across updates, removals, and re-insertion', () => {
    const original = OrderedMap.from<string, number | undefined>([
      ['one', 1],
      ['two', undefined],
      ['three', 3],
    ])
    const updated = original.set('two', 20)
    const reinserted = updated.remove('one').set('one', 10)

    expect([...original]).toEqual([
      ['one', 1],
      ['two', undefined],
      ['three', 3],
    ])
    expect(original.has('two')).toBe(true)
    expect(original.getEntry('two')).toEqual({ found: true, value: undefined })
    expect([...updated]).toEqual([
      ['one', 1],
      ['two', 20],
      ['three', 3],
    ])
    expect([...reinserted]).toEqual([
      ['two', 20],
      ['three', 3],
      ['one', 10],
    ])
    expect(updated.set('two', 20)).toBe(updated)
  })

  it('compacts tombstones without changing visible order', () => {
    const entries = Array.from({ length: 200 }, (_, index) => [`key:${index}`, index] as const)
    let map = OrderedMap.from(entries)
    for (let index = 0; index < 150; index += 1) map = map.remove(`key:${index}`)

    expect(map.size).toBe(50)
    expect([...map.keys()]).toEqual(Array.from({ length: 50 }, (_, index) => `key:${index + 150}`))
  })

  it('supports custom key semantics and ordered transformations', () => {
    const byId = makeHashEq<{ id: number }>(
      ({ id }) => id,
      (left, right) => left.id === right.id,
    )
    const map = OrderedMap.empty<{ id: number }, string>(byId)
      .set({ id: 1 }, 'first')
      .set({ id: 2 }, 'second')
      .set({ id: 1 }, 'updated')

    expect(map.size).toBe(2)
    expect(map.get({ id: 1 })).toBe('updated')
    expect([...map.values()]).toEqual(['updated', 'second'])
    expect([...map.mapValues((value) => value.length).values()]).toEqual([7, 6])
    expect([...map.filter((_, key) => key.id === 2).values()]).toEqual(['second'])
  })

  it('builds in mutable order and seals the builder', () => {
    const builder = OrderedMap.builder<string, number>()
    builder.set('one', 1).set('two', 2).set('one', 10)
    expect(builder.remove('two')).toBe(true)
    builder.set('two', 20)

    const output = builder.build()
    expect([...output]).toEqual([
      ['one', 10],
      ['two', 20],
    ])
    expect(() => builder.set('three', 3)).toThrow(/sealed/)
    expect(() => builder.remove('one')).toThrow(/sealed/)
    expect(() => builder.build()).toThrow(/sealed/)
  })
})

describe('OrderedSet', () => {
  it('preserves insertion order and set algebra order', () => {
    const original = OrderedSet.from([3, 1, 2, 1])
    expect([...original]).toEqual([3, 1, 2])
    expect([...original.add(4).remove(1)]).toEqual([3, 2, 4])
    expect([...OrderedSet.from([3, 1]).union([1, 2])]).toEqual([3, 1, 2])
    expect([...OrderedSet.from([3, 1, 2]).intersection([2, 3])]).toEqual([3, 2])
    expect([...OrderedSet.from([3, 1, 2]).difference([3])]).toEqual([1, 2])
  })

  it('has a sealed ordered builder', () => {
    const builder = OrderedSet.builder<number>()
    builder.addAll([3, 1, 2, 1])
    builder.remove(1)
    builder.add(1)
    const output = builder.build()
    expect([...output]).toEqual([3, 2, 1])
    expect(() => builder.add(4)).toThrow(/sealed/)
    expect(() => builder.addAll([])).toThrow(/sealed/)
  })
})
