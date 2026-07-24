import { bench, describe } from 'vite-plus/test'
import { pipe } from '@stopcock/fp'
import * as Iter from '@stopcock/fp/iter'
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

describe.each(sizes)(
  'Iter.from -> map -> filter -> take(100) -> toArray, iterator bridge n=%i',
  (n) => {
    const data = getData<number>('numbers', n)

    bench('stopcock Iter.from map/filter/take/toArray', () =>
      pipe(
        Iter.from(data),
        Iter.map(double),
        Iter.filter(keepMappedValue),
        Iter.take(takeCount),
        Iter.toArray,
      ))

    bench('native generator iterator map/filter/take -> Array.from', () =>
      Array.from(nativeGeneratorMapFilterTake(data, takeCount)))

    bench('native array chain map -> filter -> slice', () =>
      data.map(double).filter(keepMappedValue).slice(0, takeCount))

    bench('native loop map/filter/take with early exit', () =>
      nativeLoopMapFilterTake(data, takeCount))
  },
)
