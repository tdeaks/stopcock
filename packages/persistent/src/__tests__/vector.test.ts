import { describe, expect, it } from 'vite-plus/test'
import { Vector, vector } from '../vector'

describe('Vector', () => {
  it('supports indexed access across chunk boundaries', () => {
    const value = Vector.from(Array.from({ length: 100 }, (_, index) => index))

    expect(value.length).toBe(100)
    expect(value.size).toBe(100)
    expect(value.get(0)).toBe(0)
    expect(value.get(31)).toBe(31)
    expect(value.get(32)).toBe(32)
    expect(value.get(99)).toBe(99)
    expect(value.get(-1)).toBeUndefined()
    expect(value.get(100)).toBeUndefined()
    expect(() => value.getOrThrow(100)).toThrow(RangeError)
  })

  it('performs immutable point updates, pushes, and pops', () => {
    const original = Vector.from(Array.from({ length: 40 }, (_, index) => index))
    const updated = original.set(32, 999).push(40)

    expect(original.get(32)).toBe(32)
    expect(original.length).toBe(40)
    expect(updated.get(32)).toBe(999)
    expect(updated.last()).toBe(40)
    expect(updated.pop().toArray()).toEqual([
      ...Array.from({ length: 32 }, (_, index) => index),
      999,
      ...Array.from({ length: 7 }, (_, index) => index + 33),
    ])
    expect(original.set(10, 10)).toBe(original)
    expect(Vector.empty<number>().pop().isEmpty).toBe(true)
    expect(Vector.empty<number>().unappend()).toBeUndefined()
    expect(vector(1, 2, 3).unappend()).toEqual([vector(1, 2), 3])
  })

  it('slices, concatenates, maps, filters, and reduces', () => {
    const input = Vector.from(Array.from({ length: 70 }, (_, index) => index))

    expect(input.slice(30, 36).toArray()).toEqual([30, 31, 32, 33, 34, 35])
    expect(input.slice(-4).toArray()).toEqual([66, 67, 68, 69])
    expect(input.slice(8, -58).toArray()).toEqual([8, 9, 10, 11])
    expect(input.slice(10, 10).isEmpty).toBe(true)
    expect(input.slice()).toBe(input)

    const concatenated = input.slice(0, 64).concat(vector(70, 71))
    expect(concatenated.length).toBe(66)
    expect(concatenated.last()).toBe(71)
    expect(vector(1, 2).concat([3, 4]).toArray()).toEqual([1, 2, 3, 4])
    expect(
      vector(1, 2, 3)
        .map((value, index) => value + index)
        .toArray(),
    ).toEqual([1, 3, 5])
    expect(
      vector(1, 2, 3, 4)
        .filter((value) => value % 2 === 0)
        .toArray(),
    ).toEqual([2, 4])
    expect(vector(1, 2, 3).reduce(0, (total, value) => total + value)).toBe(6)
  })

  it('uses a sealed transient builder for bulk construction', () => {
    const builder = Vector.builder<number>()
    for (let index = 0; index < 1_000; index += 1) builder.push(index)
    builder.set(500, -1)
    expect(builder.pop()).toBe(999)

    const output = builder.build()
    expect(output.length).toBe(999)
    expect(output.get(500)).toBe(-1)
    expect(builder.isSealed).toBe(true)
    expect(() => builder.push(1_000)).toThrow(/sealed/)
    expect(() => builder.set(0, 1)).toThrow(/sealed/)
    expect(() => builder.build()).toThrow(/sealed/)

    const transient = vector(1, 2).transient()
    const changed = transient.push(3).build()
    expect(changed.toArray()).toEqual([1, 2, 3])
  })

  it('grows and shrinks through multiple trie depths', () => {
    const values = Array.from({ length: 5_000 }, (_, index) => index)
    const original = Vector.from(values)
    const updated = original.set(0, -1).set(1_055, -2).set(1_056, -3).set(4_999, -4)

    expect(original.toArray()).toEqual(values)
    expect(updated.get(0)).toBe(-1)
    expect(updated.get(1_055)).toBe(-2)
    expect(updated.get(1_056)).toBe(-3)
    expect(updated.get(4_999)).toBe(-4)

    let shortened = original
    for (let index = 0; index < 4_500; index += 1) shortened = shortened.pop()
    expect(shortened.length).toBe(500)
    expect(shortened.toArray()).toEqual(values.slice(0, 500))
  })
})
