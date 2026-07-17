import { bench, describe } from 'vitest'
import { pipe, Stream } from '@stopcock/fp'
import { getData } from './setup'

const sizes = [1_000, 10_000, 100_000] as const
const takeCount = 100

const double = (x: number) => x * 2
const keepMappedValue = (x: number) => x > 1

function* nativeGeneratorMapFilterTake(data: Iterable<number>, limit: number) {
  let taken = 0

  for (const value of data) {
    const mapped = double(value)
    if (!keepMappedValue(mapped)) continue

    yield mapped
    taken++

    if (taken >= limit) return
  }
}

function nativeLoopMapFilterTake(data: readonly number[], limit: number) {
  const out: number[] = []

  for (let i = 0; i < data.length && out.length < limit; i++) {
    const mapped = double(data[i]!)
    if (keepMappedValue(mapped)) out.push(mapped)
  }

  return out
}

describe.each(sizes)('Stream.from -> map -> filter -> take(100) -> toArray, iterator bridge n=%i', (n) => {
  const data = getData<number>('numbers', n)

  bench('stopcock Stream.from map/filter/take/toArray', () => (
    pipe(
      Stream.from(data),
      Stream.map(double),
      Stream.filter(keepMappedValue),
      Stream.take(takeCount),
      Stream.toArray,
    )
  ))

  bench('native generator iterator map/filter/take -> Array.from', () => (
    Array.from(nativeGeneratorMapFilterTake(data, takeCount))
  ))

  bench('native array chain map -> filter -> slice', () => (
    data.map(double).filter(keepMappedValue).slice(0, takeCount)
  ))

  bench('native loop map/filter/take with early exit', () => nativeLoopMapFilterTake(data, takeCount))
})
