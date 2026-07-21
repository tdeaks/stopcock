import { bench, describe } from 'vite-plus/test'
import { A, pipe } from '@stopcock/fp'
import { getData } from '../setup'

const sizes = [1_000, 10_000, 100_000]
const takeLimit = 25

const isPresent = <T>(value: T | undefined): value is T => value !== undefined
const double = (x: number) => x * 2
const filterMapEvenBucket = (x: number) => {
  const bucket = Math.floor(x * 1_000)
  return bucket % 2 === 0 ? bucket * 2 : undefined
}
const findLargeBucket = (x: number) => {
  const bucket = Math.floor(x * 1_000)
  return bucket > 990 ? bucket : undefined
}
const mapUntilRareHigh = (x: number) => (x < 0.995 ? x * 2 : undefined)
const doubledOverThreshold = (x: number) => x > 1.9

const filterMapEvenBucketOp = A.filterMap(filterMapEvenBucket)
const takeLimitOp = A.take(takeLimit)
const findLargeBucketOp = A.findMap(findLargeBucket)
const mapUntilRareHighOp = A.mapWhile(mapUntilRareHigh)
const doubleOp = A.map(double)
const takeUntilDoubledOverThresholdOp = A.takeUntil(doubledOverThreshold)

function nativeFilterMapLoopTake(data: readonly number[], limit: number) {
  const out: number[] = []
  for (let i = 0; i < data.length && out.length < limit; i++) {
    const mapped = filterMapEvenBucket(data[i]!)
    if (mapped !== undefined) out.push(mapped)
  }
  return out
}

function nativeFindMapLoop(data: readonly number[]) {
  for (let i = 0; i < data.length; i++) {
    const mapped = findLargeBucket(data[i]!)
    if (mapped !== undefined) return mapped
  }
  return undefined
}

function nativeMapWhileLoop(data: readonly number[]) {
  const out: number[] = []
  for (let i = 0; i < data.length; i++) {
    const mapped = mapUntilRareHigh(data[i]!)
    if (mapped === undefined) break
    out.push(mapped)
  }
  return out
}

function nativeMapTakeUntilLoop(data: readonly number[]) {
  const out: number[] = []
  for (let i = 0; i < data.length; i++) {
    const mapped = double(data[i]!)
    if (doubledOverThreshold(mapped)) break
    out.push(mapped)
  }
  return out
}

describe.each(sizes)('filterMap -> take(25), native chain vs native loop n=%i', (n) => {
  const data = getData<number>('numbers', n)

  bench('stopcock fused filterMap -> take(25) inline', () =>
    pipe(data, A.filterMap(filterMapEvenBucket), A.take(takeLimit)))
  bench('stopcock fused filterMap -> take(25) hoisted', () =>
    pipe(data, filterMapEvenBucketOp, takeLimitOp))
  bench('native chain map -> filter -> slice(0, 25)', () =>
    data.map(filterMapEvenBucket).filter(isPresent).slice(0, takeLimit))
  bench('native loop filterMap -> take(25)', () => nativeFilterMapLoopTake(data, takeLimit))
})

describe.each(sizes)('findMap first bucket > 990, native chain vs native loop n=%i', (n) => {
  const data = getData<number>('numbers', n)

  bench('stopcock fused findMap inline', () => A.findMap(data, findLargeBucket))
  bench('stopcock fused findMap hoisted', () => findLargeBucketOp(data))
  bench('native chain map -> find(isPresent)', () => data.map(findLargeBucket).find(isPresent))
  bench('native loop findMap with early exit', () => nativeFindMapLoop(data))
})

describe.each(sizes)('mapWhile until x >= 0.995, native chain vs native loop n=%i', (n) => {
  const data = getData<number>('numbers', n)

  bench('stopcock fused mapWhile inline', () => A.mapWhile(data, mapUntilRareHigh))
  bench('stopcock fused mapWhile hoisted', () => mapUntilRareHighOp(data))
  bench('native chain findIndex -> slice -> map', () => {
    const stopAt = data.findIndex((x) => mapUntilRareHigh(x) === undefined)
    const prefix = stopAt === -1 ? data : data.slice(0, stopAt)
    return prefix.map(double)
  })
  bench('native loop mapWhile early exit', () => nativeMapWhileLoop(data))
})

describe.each(sizes)('map -> takeUntil(mapped > 1.9), native chain vs native loop n=%i', (n) => {
  const data = getData<number>('numbers', n)

  bench('stopcock fused map -> takeUntil inline', () =>
    pipe(data, A.map(double), A.takeUntil(doubledOverThreshold)))
  bench('stopcock fused map -> takeUntil hoisted', () =>
    pipe(data, doubleOp, takeUntilDoubledOverThresholdOp))
  bench('native chain map -> findIndex -> slice', () => {
    const mapped = data.map(double)
    const stopAt = mapped.findIndex(doubledOverThreshold)
    return stopAt === -1 ? mapped : mapped.slice(0, stopAt)
  })
  bench('native loop map -> takeUntil with early exit', () => nativeMapTakeUntilLoop(data))
})
