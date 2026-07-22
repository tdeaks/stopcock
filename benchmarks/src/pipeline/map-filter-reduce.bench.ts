import { bench, describe } from 'vite-plus/test'
import { pipe, A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB, pipe as tbPipe } from '@mobily/ts-belt'

function xorshift32(seed: number) {
  let state = seed
  return () => {
    state ^= state << 13
    state ^= state >> 17
    state ^= state << 5
    return (state >>> 0) / 0xffffffff
  }
}

const sizes = [100, 1_000, 8_000, 100_000]

function makeData(n: number): number[] {
  const rand = xorshift32(n * 7 + 1)
  const out: number[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = rand()
  return out
}

const double = (x: number) => x * 2
const isOver = (x: number) => x > 0.6
const sum = (acc: number, x: number) => acc + x

const doubleOp = A.map(double)
const isOverOp = A.filter(isOver)
const sumOp = A.reduce(sum, 0)

function nativeFusedLoop(data: readonly number[]): number {
  let acc = 0
  for (let i = 0; i < data.length; i++) {
    const mapped = double(data[i]!)
    if (mapped > 0.6) acc += mapped
  }
  return acc
}

for (const n of sizes) {
  const data = makeData(n)

  const expected = data.map(double).filter(isOver).reduce(sum, 0)
  const results = [
    pipe(data, A.map(double), A.filter(isOver), A.reduce(sum, 0)),
    pipe(data, doubleOp, isOverOp, sumOp),
    tbPipe(data, TB.map(double), TB.filter(isOver), TB.reduce(0, sum)),
    R.pipe(data, R.map(double), R.filter(isOver), R.reduce(sum, 0)),
    Rb.pipe(data, Rb.map(double), Rb.filter(isOver), Rb.reduce(sum, 0) as any),
    Ra.pipe(Ra.map(double), Ra.filter(isOver), Ra.reduce(sum, 0))(data),
    _.flow([
      (d: number[]) => _.map(d, double),
      (d: number[]) => _.filter(d, isOver),
      (d: number[]) => _.reduce(d, sum, 0),
    ])(data),
    data.map(double).filter(isOver).reduce(sum, 0),
    nativeFusedLoop(data),
  ]
  for (const r of results) {
    if (Math.abs((r as number) - expected) > 1e-6) {
      throw new Error(`map-filter-reduce mismatch at n=${n}: ${r} vs ${expected}`)
    }
  }
}

describe.each(sizes)('map->filter->reduce — n=%i', (n) => {
  const data = makeData(n)

  bench('stopcock inline', () => pipe(data, A.map(double), A.filter(isOver), A.reduce(sum, 0)))
  bench('stopcock hoisted', () => pipe(data, doubleOp, isOverOp, sumOp))
  bench('ts-belt', () => tbPipe(data, TB.map(double), TB.filter(isOver), TB.reduce(0, sum)))
  bench('remeda', () => R.pipe(data, R.map(double), R.filter(isOver), R.reduce(sum, 0)))
  bench('rambda', () => Rb.pipe(data, Rb.map(double), Rb.filter(isOver), Rb.reduce(sum, 0) as any))
  bench('ramda', () => Ra.pipe(Ra.map(double), Ra.filter(isOver), Ra.reduce(sum, 0))(data))
  bench('lodash', () =>
    _.flow([
      (d: number[]) => _.map(d, double),
      (d: number[]) => _.filter(d, isOver),
      (d: number[]) => _.reduce(d, sum, 0),
    ])(data))
  bench('native chain map -> filter -> reduce', () => data.map(double).filter(isOver).reduce(sum, 0))
  bench('native loop fused map+filter+reduce', () => nativeFusedLoop(data))
})
