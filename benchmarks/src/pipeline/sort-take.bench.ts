import { bench, describe } from 'vite-plus/test'
import { pipe, A, compilePure } from '@stopcock/fp'
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
const TOP_K = 10

function makeData(n: number): number[] {
  const rand = xorshift32(n * 11 + 3)
  const out: number[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.floor(rand() * n)
  return out
}

const cmp = (a: number, b: number) => a - b

function nativePartialSelection(data: readonly number[], k: number): number[] {
  // Bounded top-k without a full sort: maintain a sorted buffer of size k.
  const out: number[] = []
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!
    if (out.length < k) {
      let j = out.length - 1
      out.push(v)
      while (j >= 0 && out[j]! > v) {
        out[j + 1] = out[j]!
        j--
      }
      out[j + 1] = v
    } else if (v < out[k - 1]!) {
      let j = k - 2
      while (j >= 0 && out[j]! > v) {
        out[j + 1] = out[j]!
        j--
      }
      out[j + 1] = v
    }
  }
  return out
}

for (const n of sizes) {
  const data = makeData(n)
  const runner = compilePure(A.sortBy(cmp), A.take(TOP_K))

  const expected = data.slice().sort(cmp).slice(0, TOP_K)
  const results: Array<{ name: string; value: number[] }> = [
    { name: 'stopcock inline', value: pipe(data, A.sortBy(cmp), A.take(TOP_K)) },
    { name: 'stopcock compilePure', value: runner(data) as number[] },
    { name: 'ts-belt', value: tbPipe(data, TB.sort(cmp), TB.take(TOP_K)) },
    { name: 'remeda', value: R.pipe(data, R.sort(cmp), R.take(TOP_K)) },
    { name: 'rambda', value: Rb.pipe(data, Rb.sort(cmp), Rb.take(TOP_K) as any) },
    { name: 'ramda', value: Ra.pipe(Ra.sort(cmp), Ra.take(TOP_K))(data) },
    {
      name: 'lodash',
      value: _.flow([
        (d: number[]) => _.sortBy(d),
        (d: number[]) => _.take(d, TOP_K),
      ])(data),
    },
    { name: 'native chain slice->sort->slice', value: data.slice().sort(cmp).slice(0, TOP_K) },
    { name: 'native partial-selection loop', value: nativePartialSelection(data, TOP_K) },
  ]
  for (const { name, value } of results) {
    if (JSON.stringify(value) !== JSON.stringify(expected)) {
      throw new Error(`sort-take mismatch at n=${n} (${name}): ${JSON.stringify(value)} vs ${JSON.stringify(expected)}`)
    }
  }
}

describe.each(sizes)('sortBy -> take(10) — n=%i', (n) => {
  const data = makeData(n)
  const runner = compilePure(A.sortBy(cmp), A.take(TOP_K))

  bench('stopcock inline', () => pipe(data, A.sortBy(cmp), A.take(TOP_K)))
  bench('stopcock compilePure', () => runner(data))
  bench('ts-belt', () => tbPipe(data, TB.sort(cmp), TB.take(TOP_K)))
  bench('remeda', () => R.pipe(data, R.sort(cmp), R.take(TOP_K)))
  bench('rambda', () => Rb.pipe(data, Rb.sort(cmp), Rb.take(TOP_K) as any))
  bench('ramda', () => Ra.pipe(Ra.sort(cmp), Ra.take(TOP_K))(data))
  bench('lodash', () =>
    _.flow([
      (d: number[]) => _.sortBy(d),
      (d: number[]) => _.take(d, TOP_K),
    ])(data))
  bench('native chain slice->sort->slice', () => data.slice().sort(cmp).slice(0, TOP_K))
  bench('native partial-selection loop', () => nativePartialSelection(data, TOP_K))
})
