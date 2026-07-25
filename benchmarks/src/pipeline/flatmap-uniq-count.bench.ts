import { bench, describe } from 'vite-plus/test'
import { pipe } from '@stopcock/fp'
import { pipe as fusedPipe } from '@stopcock/fp/fusion'
import { pipe as optPipe } from '@stopcock/fp-optimizer'
import * as A from '@stopcock/fp/array'
import * as R from 'remeda'
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
const EXPANSION = 3

function makeData(n: number): number[] {
  const rand = xorshift32(n * 13 + 5)
  const out: number[] = new Array(n)
  // small value range relative to n so the expansion produces heavy overlap
  const range = Math.max(1, Math.floor(n / 4))
  for (let i = 0; i < n; i++) out[i] = Math.floor(rand() * range)
  return out
}

// Expand each value into EXPANSION values that overlap with neighboring
// source elements' expansions, so uniq() has real duplicate collapsing to do.
const expand = (x: number): number[] => [x, x + 1, x + 2].slice(0, EXPANSION)
const isEven = (x: number) => x % 2 === 0

const expandOp = A.flatMap(expand)
const isEvenOp = A.count(isEven)

function nativeFusedLoop(data: readonly number[]): number {
  const seen = new Set<number>()
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!
    for (let j = 0; j < EXPANSION; j++) seen.add(v + j)
  }
  let c = 0
  for (const v of seen) if (isEven(v)) c++
  return c
}

for (const n of sizes) {
  const data = makeData(n)

  const expected = nativeFusedLoop(data)
  const results: Array<{ name: string; value: number }> = [
    { name: 'stopcock inline', value: pipe(data, A.flatMap(expand), A.uniq, A.count(isEven)) },
    { name: 'stopcock hoisted', value: pipe(data, expandOp, A.uniq, isEvenOp) },
    {
      name: 'ts-belt',
      value: tbPipe(data, TB.map(expand), TB.flat, TB.uniq, TB.filter(isEven)).length,
    },
    { name: 'remeda', value: R.pipe(data, R.flatMap(expand), R.unique(), R.filter(isEven)).length },
    { name: 'rambda', value: Rb.pipe(data, Rb.flatMap(expand) as any, Rb.uniq, Rb.count(isEven) as any) },
    {
      name: 'ramda',
      value: Ra.pipe(Ra.chain(expand), Ra.uniq, Ra.filter(isEven))(data).length,
    },
    { name: 'native chain flatMap->Set->filter', value: [...new Set(data.flatMap(expand))].filter(isEven).length },
    { name: 'native fused loop with Set', value: nativeFusedLoop(data) },
  ]
  for (const { name, value } of results) {
    if (value !== expected) {
      throw new Error(`flatmap-uniq-count mismatch at n=${n} (${name}): ${value} vs ${expected}`)
    }
  }
}

describe.each(sizes)('flatMap -> uniq -> count — n=%i', (n) => {
  const data = makeData(n)

  bench('stopcock inline', () => pipe(data, A.flatMap(expand), A.uniq, A.count(isEven)))
  bench('stopcock inline (fused)', () => fusedPipe(data, A.flatMap(expand), A.uniq, A.count(isEven)))
  bench('stopcock inline (optimizer)', () => optPipe(data, A.flatMap(expand), A.uniq, A.count(isEven)))
  bench('stopcock hoisted', () => pipe(data, expandOp, A.uniq, isEvenOp))
  bench('stopcock hoisted (fused)', () => fusedPipe(data, expandOp, A.uniq, isEvenOp))
  bench('stopcock hoisted (optimizer)', () => optPipe(data, expandOp, A.uniq, isEvenOp))
  bench('ts-belt', () => tbPipe(data, TB.map(expand), TB.flat, TB.uniq, TB.filter(isEven)).length)
  bench('remeda', () => R.pipe(data, R.flatMap(expand), R.unique(), R.filter(isEven)).length)
  bench('rambda', () => Rb.pipe(data, Rb.flatMap(expand) as any, Rb.uniq, Rb.count(isEven) as any))
  bench('ramda', () => Ra.pipe(Ra.chain(expand), Ra.uniq, Ra.filter(isEven))(data).length)
  bench('native chain flatMap->Set->filter', () => [...new Set(data.flatMap(expand))].filter(isEven).length)
  bench('native loop fused with Set', () => nativeFusedLoop(data))
})
