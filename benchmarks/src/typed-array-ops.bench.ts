import { bench, describe } from 'vite-plus/test'
import * as TypedArray from '@stopcock/fp/typed-array'

const sizes = [64, 4_096, 65_536] as const

const oldClone = (source: Float64Array): Float64Array => {
  const result = new Float64Array(source.length)
  for (let index = 0; index < source.length; index++) result[index] = source[index]!
  return result
}

const oldCopyInto = (
  source: Float64Array,
  target: Float64Array,
  targetOffset: number,
): Float64Array => {
  for (let index = 0; index < source.length; index++) {
    target[targetOffset + index] = source[index]!
  }
  return target
}

const oldFilter = (
  source: Float64Array,
  predicate: (value: number, index: number) => boolean,
): Float64Array => {
  const values: number[] = []
  for (let index = 0; index < source.length; index++) {
    const value = source[index]!
    if (predicate(value, index)) values.push(value)
  }
  const result = new Float64Array(values.length)
  for (let index = 0; index < values.length; index++) result[index] = values[index]!
  return result
}

const oldConcat = (source: Float64Array, other: Float64Array): Float64Array => {
  const result = new Float64Array(source.length + other.length)
  let offset = 0
  for (const current of [source, other]) {
    for (let index = 0; index < current.length; index++) result[offset++] = current[index]!
  }
  return result
}

const oldSlice = (source: Float64Array, start: number, end: number): Float64Array => {
  const result = new Float64Array(end - start)
  for (let index = start; index < end; index++) result[index - start] = source[index]!
  return result
}

const oldReverse = (source: Float64Array): Float64Array => {
  const result = new Float64Array(source.length)
  for (let index = 0; index < source.length; index++) {
    result[index] = source[source.length - index - 1]!
  }
  return result
}

const oldIncludes = (source: Float64Array, search: number): boolean => {
  for (let index = 0; index < source.length; index++) {
    const value = source[index]!
    if (value === search || (value !== value && search !== search)) return true
  }
  return false
}

const oldSort = (source: Float64Array): Float64Array => {
  const values = Array.from(source, (value, index) => ({ value, index }))
  values.sort((left, right) => {
    const order = left.value < right.value ? -1 : left.value > right.value ? 1 : 0
    return order === 0 ? left.index - right.index : order
  })
  const result = new Float64Array(values.length)
  for (let index = 0; index < values.length; index++) result[index] = values[index]!.value
  return result
}

for (const size of sizes) {
  const source = Float64Array.from({ length: size }, (_, index) => (index * 17) % 997)
  const other = Float64Array.from({ length: size }, (_, index) => (index * 31) % 991)
  const target = new Float64Array(size + 8)
  const predicate = (value: number): boolean => (value & 3) === 0
  const missing = -1

  describe(`typed-array clone — n=${size}`, () => {
    bench('stopcock', () => TypedArray.clone(source))
    bench('before (element loop)', () => oldClone(source))
    bench('native slice', () => source.slice())
  })

  describe(`typed-array copyInto — n=${size}`, () => {
    bench('stopcock', () => TypedArray.copyInto(source, target, 4))
    bench('before (element loop)', () => oldCopyInto(source, target, 4))
    bench('native set', () => target.set(source, 4))
  })

  describe(`typed-array filter 25% — n=${size}`, () => {
    bench('stopcock', () => TypedArray.filter(source, predicate))
    bench('before (JS array staging)', () => oldFilter(source, predicate))
    bench('native filter', () => source.filter(predicate))
  })

  describe(`typed-array concat — n=${size * 2}`, () => {
    bench('stopcock', () => TypedArray.concat(source, other))
    bench('before (element loop)', () => oldConcat(source, other))
    bench('native set equivalent', () => {
      const result = new Float64Array(size * 2)
      result.set(source)
      result.set(other, size)
      return result
    })
  })

  describe(`typed-array middle slice — n=${size}`, () => {
    const start = size >> 2
    const end = size - start
    bench('stopcock', () => TypedArray.slice(source, start, end))
    bench('before (element loop)', () => oldSlice(source, start, end))
    bench('native slice', () => source.slice(start, end))
  })

  describe(`typed-array immutable reverse — n=${size}`, () => {
    bench('stopcock', () => TypedArray.reverse(source))
    bench('before (element loop)', () => oldReverse(source))
    bench('native copy + reverse', () => source.slice().reverse())
  })

  describe(`typed-array includes miss — n=${size}`, () => {
    bench('stopcock', () => TypedArray.includes(source, missing))
    bench('before (SameValueZero loop)', () => oldIncludes(source, missing))
    bench('native includes', () => source.includes(missing))
  })

  describe(`typed-array sort — n=${size}`, () => {
    bench('stopcock', () => TypedArray.sort(source))
    bench('before (decorated JS objects)', () => oldSort(source))
    bench('native copy + sort', () => source.slice().sort())
  })
}

describe('typed-array Uint8 hot paths — n=4096', () => {
  const source = Uint8Array.from({ length: 4_096 }, (_, index) => (index * 17) & 0xff)
  const predicate = (value: number): boolean => (value & 3) === 0

  bench('clone stopcock', () => TypedArray.clone(source))
  bench('clone native', () => source.slice())
  bench('filter stopcock', () => TypedArray.filter(source, predicate))
  bench('filter native', () => source.filter(predicate))
  bench('includes stopcock', () => TypedArray.includes(source, 255))
  bench('includes native', () => source.includes(255))
  bench('sort stopcock', () => TypedArray.sort(source))
  bench('sort native immutable', () => source.slice().sort())
})

describe('typed-array BigInt64 hot paths — n=4096', () => {
  const source = BigInt64Array.from(
    { length: 4_096 },
    (_, index) => BigInt(((index * 17) % 997) - 498),
  )
  const predicate = (value: bigint): boolean => (value & 3n) === 0n

  bench('clone stopcock', () => TypedArray.clone(source))
  bench('clone native', () => source.slice())
  bench('filter stopcock', () => TypedArray.filter(source, predicate))
  bench('filter native', () => source.filter(predicate))
  bench('includes stopcock', () => TypedArray.includes(source, -999n))
  bench('includes native', () => source.includes(-999n))
  bench('sort stopcock', () => TypedArray.sort(source))
  bench('sort native immutable', () => source.slice().sort())
})
