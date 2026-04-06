import { bench, describe } from 'vitest'
import { pipe, A } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB, pipe as tbPipe } from '@mobily/ts-belt'

// 10M elements — generated once, deterministic seed
function xorshift32(seed: number) {
  let state = seed
  return () => {
    state ^= state << 13
    state ^= state >> 17
    state ^= state << 5
    return (state >>> 0) / 0xFFFFFFFF
  }
}

const rand = xorshift32(42)
const N = 10_000_000
const data: number[] = new Array(N)
for (let i = 0; i < N; i++) data[i] = rand()

// Shared predicates — same references used by all libraries
const gt50 = (x: number) => x > 0.5
const gt80 = (x: number) => x > 0.8
const lt20 = (x: number) => x < 0.2
const lt5 = (x: number) => x < 5
const gt10 = (x: number) => x > 10
const isEven = (x: number) => x % 2 === 0
const gt190 = (x: number) => x > 190
const is999 = (x: number) => x === 999
const rare = (x: number) => x > 0.99
const dbl = (x: number) => x * 2
const inc = (x: number) => x + 1
const times10 = (x: number) => x * 10
const round = (x: number) => Math.round(x)
const floor = (x: number) => Math.floor(x * 1000)
const sum = (a: number, x: number) => a + x

// ── 1. filter→map→take — early termination ─────────────────────────

describe('filter→map→take(100) — n=10M', () => {
  bench('stopcock', () => pipe(data, A.filter(gt50), A.map(dbl), A.take(100)))
  bench('ts-belt', () => tbPipe(data, TB.filter(gt50), TB.map(dbl), TB.take(100)))
  bench('remeda', () => R.pipe(data, R.filter(gt50), R.map(dbl), R.take(100)))
  bench('rambda', () => Rb.pipe(data, Rb.filter(gt50), Rb.map(dbl), Rb.take(100)))
  bench('ramda', () => Ra.pipe(Ra.filter(gt50), Ra.map(dbl), Ra.take(100))(data))
  bench('lodash', () => _.flow([
    (d: number[]) => _.filter(d, gt50),
    (d: number[]) => _.map(d, dbl),
    (d: number[]) => _.take(d, 100),
  ])(data))
  bench('native', () => data.filter(gt50).map(dbl).slice(0, 100))
})

// ── 2. Deep pipeline — many fused stages ────────────────────────────

describe('deep 10-step filter+map→take(50) — n=10M', () => {
  bench('stopcock', () =>
    pipe(data,
      A.filter(gt50), A.map(dbl), A.filter(gt80), A.map(inc), A.filter(lt5),
      A.map(times10), A.filter(gt10), A.map(round), A.filter(isEven), A.take(50),
    ),
  )
  bench('remeda', () =>
    R.pipe(data,
      R.filter(gt50), R.map(dbl), R.filter(gt80), R.map(inc), R.filter(lt5),
      R.map(times10), R.filter(gt10), R.map(round), R.filter(isEven), R.take(50),
    ),
  )
  bench('rambda', () =>
    Rb.pipe(data,
      Rb.filter(gt50), Rb.map(dbl), Rb.filter(gt80), Rb.map(inc), Rb.filter(lt5),
      Rb.map(times10), Rb.filter(gt10), Rb.map(round), Rb.filter(isEven), Rb.take(50),
    ),
  )
  bench('ramda', () =>
    Ra.pipe(
      Ra.filter(gt50), Ra.map(dbl), Ra.filter(gt80), Ra.map(inc), Ra.filter(lt5),
      Ra.map(times10), Ra.filter(gt10), Ra.map(round), Ra.filter(isEven), Ra.take(50),
    )(data),
  )
  bench('lodash', () => _.flow([
    (d: number[]) => _.filter(d, gt50), (d: number[]) => _.map(d, dbl),
    (d: number[]) => _.filter(d, gt80), (d: number[]) => _.map(d, inc),
    (d: number[]) => _.filter(d, lt5), (d: number[]) => _.map(d, times10),
    (d: number[]) => _.filter(d, gt10), (d: number[]) => _.map(d, round),
    (d: number[]) => _.filter(d, isEven), (d: number[]) => _.take(d, 50),
  ])(data))
  bench('native', () =>
    data.filter(gt50).map(dbl).filter(gt80).map(inc).filter(lt5)
      .map(times10).filter(gt10).map(round).filter(isEven).slice(0, 50),
  )
})

// ── 3. filter→map→reduce — terminal fusion ──────────────────────────

describe('filter→map→reduce (sum) — n=10M', () => {
  bench('stopcock', () => pipe(data, A.filter(gt50), A.map(dbl), A.reduce(sum, 0)))
  bench('ts-belt', () => tbPipe(data, TB.filter(gt50), TB.map(dbl), TB.reduce(0, sum)))
  bench('remeda', () => R.pipe(data, R.filter(gt50), R.map(dbl), R.reduce(sum, 0)))
  bench('rambda', () => Rb.pipe(data, Rb.filter(gt50), Rb.map(dbl), Rb.reduce(sum, 0)))
  bench('ramda', () => Ra.pipe(Ra.filter(gt50), Ra.map(dbl), Ra.reduce(sum, 0))(data))
  bench('lodash', () => _.flow([
    (d: number[]) => _.filter(d, gt50),
    (d: number[]) => _.map(d, dbl),
    (d: number[]) => _.reduce(d, sum, 0),
  ])(data))
  bench('native', () => data.filter(gt50).map(dbl).reduce(sum, 0))
})

// ── 4. filter→map→find — terminal with early exit ───────────────────

// floor maps 0-1 → 0-999; matching 999 requires scanning ~1000 input elements
describe('filter→map→find (rare match) — n=10M', () => {
  bench('stopcock', () => pipe(data, A.filter(gt50), A.map(floor), A.find(is999)))
  bench('ts-belt', () => tbPipe(data, TB.filter(gt50), TB.map(floor), TB.find(is999)))
  bench('remeda', () => R.pipe(data, R.filter(gt50), R.map(floor), R.find(is999)))
  bench('rambda', () => Rb.pipe(data, Rb.filter(gt50), Rb.map(floor), Rb.find(is999)))
  bench('ramda', () => Ra.pipe(Ra.filter(gt50), Ra.map(floor), Ra.find(is999))(data))
  bench('lodash', () => _.flow([
    (d: number[]) => _.filter(d, gt50),
    (d: number[]) => _.map(d, floor),
    (d: number[]) => _.find(d, is999),
  ])(data))
  bench('native', () => data.filter(gt50).map(floor).find(is999))
})

// ── 5. filter→map→some — short-circuit terminal ─────────────────────

// remeda has no pipe-compatible `some`, so it uses the same eager pattern as others
describe('filter→map→some — n=10M', () => {
  bench('stopcock', () => pipe(data, A.filter(lt20), A.map(floor), A.some(gt190)))
  bench('ts-belt', () => tbPipe(data, TB.filter(lt20), TB.map(floor), TB.some(gt190)))
  bench('rambda', () => Rb.pipe(data, Rb.filter(lt20), Rb.map(floor), Rb.any(gt190)))
  bench('ramda', () => Ra.pipe(Ra.filter(lt20), Ra.map(floor), Ra.any(gt190))(data))
  bench('lodash', () => _.flow([
    (d: number[]) => _.filter(d, lt20),
    (d: number[]) => _.map(d, floor),
    (d: number[]) => _.some(d, gt190),
  ])(data))
  bench('native', () => data.filter(lt20).map(floor).some(gt190))
})

// ── 6. Narrow filter → take — worst case for non-fused ──────────────

describe('narrow filter(x>0.99)→map→take(10) — n=10M', () => {
  bench('stopcock', () => pipe(data, A.filter(rare), A.map(dbl), A.take(10)))
  bench('ts-belt', () => tbPipe(data, TB.filter(rare), TB.map(dbl), TB.take(10)))
  bench('remeda', () => R.pipe(data, R.filter(rare), R.map(dbl), R.take(10)))
  bench('rambda', () => Rb.pipe(data, Rb.filter(rare), Rb.map(dbl), Rb.take(10)))
  bench('ramda', () => Ra.pipe(Ra.filter(rare), Ra.map(dbl), Ra.take(10))(data))
  bench('lodash', () => _.flow([
    (d: number[]) => _.filter(d, rare),
    (d: number[]) => _.map(d, dbl),
    (d: number[]) => _.take(d, 10),
  ])(data))
  bench('native', () => data.filter(rare).map(dbl).slice(0, 10))
})
