import { describe, expect, it, vi } from 'vite-plus/test'
import { none, some } from '../option'
import * as TypedArray from '../typed-array'

const optionalFloat16ArrayConstructor = Reflect.get(globalThis, 'Float16Array') as
  | typeof Float32Array
  | undefined

const numberConstructors = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  ...(optionalFloat16ArrayConstructor === undefined ? [] : [optionalFloat16ArrayConstructor]),
  Float32Array,
  Float64Array,
] as const

const bigIntConstructors = [BigInt64Array, BigUint64Array] as const

describe('TypedArray number families', () => {
  for (const Constructor of numberConstructors) {
    it(`preserves ${Constructor.name} across allocating operations`, () => {
      const source = new Constructor([3, 1, 2, 4])

      expect(TypedArray.from(Constructor, [1, 2, 3])).toBeInstanceOf(Constructor)
      expect(TypedArray.clone(source)).toBeInstanceOf(Constructor)
      expect(TypedArray.map(source, (value) => value + 1)).toBeInstanceOf(Constructor)
      expect(TypedArray.filter(source, (value) => value % 2 === 0)).toBeInstanceOf(Constructor)
      expect(TypedArray.slice(source, 1, 3)).toBeInstanceOf(Constructor)
      expect(TypedArray.concat(source, new Constructor([5, 6]))).toBeInstanceOf(Constructor)
      expect(TypedArray.reverse(source)).toBeInstanceOf(Constructor)
      expect(TypedArray.sort(source)).toBeInstanceOf(Constructor)

      expect(Array.from(TypedArray.clone(source))).toEqual([3, 1, 2, 4])
      expect(Array.from(TypedArray.map(source, (value, index) => value + index))).toEqual([
        3, 2, 4, 7,
      ])
      expect(Array.from(TypedArray.filter(source, (value) => value % 2 === 0))).toEqual([2, 4])
      expect(Array.from(TypedArray.slice(source, 1, 3))).toEqual([1, 2])
      expect(Array.from(TypedArray.concat(source, new Constructor([5, 6])))).toEqual([
        3, 1, 2, 4, 5, 6,
      ])
      expect(Array.from(TypedArray.reverse(source))).toEqual([4, 2, 1, 3])
      expect(Array.from(TypedArray.sort(source))).toEqual([1, 2, 3, 4])
      expect(Array.from(source)).toEqual([3, 1, 2, 4])
    })
  }

  it('preserves NaN, signed zero, SameValueZero lookup, and stable sort ties', () => {
    const source = new Float64Array([3, Number.NaN, -0, 0, 1, Number.NaN])
    const filtered = TypedArray.filter(source, () => true)
    const sorted = TypedArray.sort(source)

    expect(Number.isNaN(filtered[1])).toBe(true)
    expect(Object.is(filtered[2], -0)).toBe(true)
    expect(TypedArray.includes(source, Number.NaN)).toBe(true)
    expect(TypedArray.indexOfOrUndefined(source, Number.NaN)).toBe(1)
    expect(TypedArray.indexOf(source, -0)).toEqual(some(2))
    expect(TypedArray.indexOf(source, 99)).toBe(none)

    const expected = Array.from(source)
      .map((value, index) => ({ value, index }))
      .sort((left, right) => {
        const order =
          left.value < right.value ? -1 : left.value > right.value ? 1 : left.index - right.index
        return order
      })
      .map(({ value }) => value)
    expect(Array.from(sorted)).toEqual(expected)
    expect(Object.is(sorted[2], -0)).toBe(Object.is(expected[2], -0))
  })

  it('performs compatible numeric conversion without staging values in JS objects', () => {
    const target = new Uint8ClampedArray(6)
    expect(
      TypedArray.copyInto(new Float64Array([-20, 1.6, 300, Number.NaN]), target, 1),
    ).toBe(target)
    expect(Array.from(target)).toEqual([0, 0, 2, 255, 0, 0])

    const mapped = new Int16Array(4)
    expect(
      TypedArray.mapInto(new Float64Array([1.9, -2.2]), mapped, (value) => value * 10, 1),
    ).toBe(mapped)
    expect(Array.from(mapped)).toEqual([0, 19, -22, 0])
  })

  it('rebinds shared views to ArrayBuffer while preserving custom constructors', () => {
    const shared = new Uint8Array(new SharedArrayBuffer(4))
    shared.set([3, 1, 2, 4])
    const allocated = [
      TypedArray.clone(shared),
      TypedArray.map(shared, (value) => value),
      TypedArray.filter(shared, () => true),
      TypedArray.slice(shared),
      TypedArray.concat(shared),
      TypedArray.reverse(shared),
      TypedArray.sort(shared),
    ]

    for (const result of allocated) {
      expect(result.buffer).toBeInstanceOf(ArrayBuffer)
      expect(result.buffer).not.toBeInstanceOf(SharedArrayBuffer)
    }

    class CustomBytes extends Uint8Array {
      readonly marker = 'custom'
    }
    const custom = new CustomBytes(4)
    expect(TypedArray.clone(custom)).toBeInstanceOf(CustomBytes)
    expect(TypedArray.map(custom, (value) => value)).toBeInstanceOf(CustomBytes)
  })
})

describe('TypedArray bigint families', () => {
  for (const Constructor of bigIntConstructors) {
    it(`preserves ${Constructor.name} values and constructor`, () => {
      const source = new Constructor([3n, 1n, 2n, 4n])

      expect(Array.from(TypedArray.clone(source))).toEqual([3n, 1n, 2n, 4n])
      expect(Array.from(TypedArray.filter(source, (value) => value % 2n === 0n))).toEqual([2n, 4n])
      expect(Array.from(TypedArray.sort(source))).toEqual([1n, 2n, 3n, 4n])
      expect(Array.from(TypedArray.reverse(source))).toEqual([4n, 2n, 1n, 3n])
      expect(TypedArray.includes(source, 2n)).toBe(true)
      expect(TypedArray.indexOfOrUndefined(source, 4n)).toBe(3)

      expect(TypedArray.clone(source)).toBeInstanceOf(Constructor)
      expect(TypedArray.filter(source, () => true)).toBeInstanceOf(Constructor)
      expect(TypedArray.sort(source)).toBeInstanceOf(Constructor)
    })
  }

  it('round-trips the complete signed and unsigned 64-bit domains through filter and sort', () => {
    const signed = new BigInt64Array([-(2n ** 63n), -1n, 0n, 2n ** 63n - 1n])
    const unsigned = new BigUint64Array([2n ** 64n - 1n, 0n, 2n ** 63n, 1n])

    expect(Array.from(TypedArray.filter(signed, () => true))).toEqual(Array.from(signed))
    expect(Array.from(TypedArray.filter(unsigned, () => true))).toEqual(Array.from(unsigned))
    expect(Array.from(TypedArray.sort(signed))).toEqual([
      -(2n ** 63n),
      -1n,
      0n,
      2n ** 63n - 1n,
    ])
    expect(Array.from(TypedArray.sort(unsigned))).toEqual([
      0n,
      1n,
      2n ** 63n,
      2n ** 64n - 1n,
    ])
  })

  it('uses the large BigInt filter path without changing values or constructor', () => {
    const source = BigInt64Array.from({ length: 256 }, (_, index) => BigInt(index - 128))
    const result = TypedArray.filter(source, (value) => (value & 1n) === 0n)

    expect(result).toBeInstanceOf(BigInt64Array)
    expect(Array.from(result)).toEqual(
      Array.from(source).filter((value) => (value & 1n) === 0n),
    )
  })
})

describe('TypedArray bulk copy semantics', () => {
  it('copies as-if through a temporary value list for forward-overlapping views', () => {
    const values = new Uint8Array([1, 2, 3, 4, 5, 6])
    const source = new Uint8Array(values.buffer, 0, 4)
    const target = new Uint8Array(values.buffer)

    expect(TypedArray.copyInto(source, target, 1)).toBe(target)
    expect(Array.from(values)).toEqual([1, 1, 2, 3, 4, 6])
  })

  it('copies as-if through a temporary value list for backward-overlapping views', () => {
    const values = new Uint8Array([1, 2, 3, 4, 5, 6])
    const source = new Uint8Array(values.buffer, 2, 4)
    const target = new Uint8Array(values.buffer)

    expect(TypedArray.copyInto(source, target, 0)).toBe(target)
    expect(Array.from(values)).toEqual([3, 4, 5, 6, 5, 6])
  })

  it('validates bounds before writing and rejects detached storage', () => {
    const target = new Uint8Array([9, 9, 9])
    expect(() => TypedArray.copyInto(new Uint8Array([1, 2]), target, 2)).toThrow(RangeError)
    expect(Array.from(target)).toEqual([9, 9, 9])

    const detached = new Uint8Array([1, 2, 3])
    structuredClone(detached.buffer, { transfer: [detached.buffer] })
    expect(() => TypedArray.clone(detached)).toThrow(TypeError)
    expect(() => TypedArray.copyInto(detached, new Uint8Array(0))).toThrow(TypeError)
    expect(() => TypedArray.includes(detached, 1)).toThrow(TypeError)
    expect(() => TypedArray.indexOfOrUndefined(detached, 1)).toThrow(TypeError)
  })
})

describe('TypedArray callback and subclass contracts', () => {
  class SpeciesChangingUint8Array extends Uint8Array {}

  Object.defineProperty(SpeciesChangingUint8Array, Symbol.species, {
    configurable: true,
    value: Uint16Array,
  })

  it('uses the concrete source constructor rather than Symbol.species', () => {
    const source = new SpeciesChangingUint8Array([3, 1, 2])
    const results = [
      TypedArray.clone(source),
      TypedArray.map(source, (value) => value + 1),
      TypedArray.filter(source, () => true),
      TypedArray.slice(source),
      TypedArray.concat(source, new SpeciesChangingUint8Array([4])),
      TypedArray.reverse(source),
      TypedArray.sort(source),
    ]

    for (const result of results) {
      expect(result).toBeInstanceOf(SpeciesChangingUint8Array)
      expect(result).not.toBeInstanceOf(Uint16Array)
    }
  })

  it('invokes filter predicates exactly once and allocates after callback effects', () => {
    const events: string[] = []
    let observeConstruction = false
    class ObservedUint8Array extends Uint8Array {
      constructor(values: number | ArrayLike<number>) {
        super(values)
        if (observeConstruction) events.push('construct')
      }
    }

    const source = new ObservedUint8Array([1, 2, 3, 4])
    observeConstruction = true
    const predicate = vi.fn((value: number, index: number) => {
      events.push(`predicate:${index}`)
      return value % 2 === 0
    })
    const result = TypedArray.filter(source, predicate)

    expect(Array.from(result)).toEqual([2, 4])
    expect(predicate).toHaveBeenCalledTimes(4)
    expect(events).toEqual(['predicate:0', 'predicate:1', 'predicate:2', 'predicate:3', 'construct'])
  })

  it('sorts stably and allocates the public result after comparisons', () => {
    const events: string[] = []
    let observeConstruction = false
    class ObservedUint8Array extends Uint8Array {
      constructor(values: number | ArrayLike<number>) {
        super(values)
        if (observeConstruction) events.push('construct')
      }
    }

    const source = new ObservedUint8Array([4, 1, 3, 2])
    observeConstruction = true
    const result = TypedArray.sort(source, (left, right) => {
      events.push('compare')
      return (left % 2) - (right % 2)
    })

    expect(Array.from(result)).toEqual([4, 2, 1, 3])
    expect(events.at(-1)).toBe('construct')
    expect(events.slice(0, -1).every((event) => event === 'compare')).toBe(true)
  })

  it('does not observe own or monkeypatched prototype slice/sort methods', () => {
    const ownMethods = new Float64Array([3, 1, 2])
    Object.defineProperties(ownMethods, {
      slice: {
        configurable: true,
        value: () => {
          throw new Error('own slice must not be called')
        },
      },
      sort: {
        configurable: true,
        value: () => {
          throw new Error('own sort must not be called')
        },
      },
    })
    expect(Array.from(TypedArray.sort(ownMethods))).toEqual([1, 2, 3])

    const sliceDescriptor = Object.getOwnPropertyDescriptor(Float64Array.prototype, 'slice')
    const sortDescriptor = Object.getOwnPropertyDescriptor(Float64Array.prototype, 'sort')
    try {
      Object.defineProperties(Float64Array.prototype, {
        slice: {
          configurable: true,
          value: () => {
            throw new Error('patched slice must not be called')
          },
        },
        sort: {
          configurable: true,
          value: () => {
            throw new Error('patched sort must not be called')
          },
        },
      })
      expect(Array.from(TypedArray.sort(new Float64Array([4, 2, 3, 1])))).toEqual([1, 2, 3, 4])
    } finally {
      if (sliceDescriptor !== undefined) {
        Object.defineProperty(Float64Array.prototype, 'slice', sliceDescriptor)
      } else {
        delete (Float64Array.prototype as { slice?: unknown }).slice
      }
      if (sortDescriptor !== undefined) {
        Object.defineProperty(Float64Array.prototype, 'sort', sortDescriptor)
      } else {
        delete (Float64Array.prototype as { sort?: unknown }).sort
      }
    }
  })

  it('grows typed scratch storage with a length-tracking resizable source', () => {
    if (typeof ArrayBuffer.prototype.resize !== 'function') return

    const buffer = new ArrayBuffer(128, { maxByteLength: 256 })
    const source = new Uint8Array(buffer)
    source.fill(1)
    let grew = false
    const result = TypedArray.filter(source, (_value, index) => {
      if (index === 0) {
        buffer.resize(256)
        source.fill(2, 128)
        grew = true
      }
      return true
    })

    expect(grew).toBe(true)
    expect(result.length).toBe(256)
    expect(result[0]).toBe(1)
    expect(result[255]).toBe(2)
  })

  it('fully consumes from iterables before allocating the result', () => {
    const events: string[] = []
    class ObservedUint8Array extends Uint8Array {
      constructor(length: number) {
        events.push(`construct:${length}`)
        super(length)
      }
    }
    function* values(): Generator<number> {
      events.push('yield:1')
      yield 1
      events.push('yield:2')
      yield 2
    }

    expect(Array.from(TypedArray.from(ObservedUint8Array, values()))).toEqual([1, 2])
    expect(events).toEqual(['yield:1', 'yield:2', 'construct:2'])
  })
})
