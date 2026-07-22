// W0b: raw paired-sample perf runner. Not a vitest bench. Every sample is
// recorded raw (hrtime.bigint per round); nothing is aggregated then
// discarded before it reaches the report. Stopcock and reference rounds are
// interleaved ABBA within one process so both share warmup/GC/JIT-warmth
// conditions, then paired by time-adjacency. Per-tier rows are kept
// separate on purpose: a geomean across tiers would hide a slow tier behind
// a fast one, which is exactly what generate-report.ts's fastest-row
// selection does and why this file doesn't reuse it.
export interface RoundSample {
  readonly which: 'a' | 'b'
  readonly ns: number
}

export interface PairedRatio {
  /** referenceNs / stopcockNs for one adjacent A/B pair. >1 means stopcock is faster. */
  readonly ratio: number
}

export interface PairedRunResult {
  readonly aSamples: readonly number[]
  readonly bSamples: readonly number[]
  readonly pairedRatios: readonly number[]
  readonly medianRatio: number
  readonly meanRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly signTestP: number
}

function median(xs: readonly number[]): number {
  const s = xs.slice().sort((x, y) => x - y)
  const n = s.length
  if (n === 0) return NaN
  const mid = n >> 1
  return n % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Deterministic xorshift-ish PRNG for bootstrap resampling; a fixed seed keeps CI widths reproducible run to run. */
function bootstrapRng(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967296
  }
}

/** Percentile bootstrap CI on the median of paired ratios. B resamples, deterministic RNG. */
function bootstrapMedianCI(xs: readonly number[], b = 2000, alpha = 0.05): { low: number; high: number } {
  if (xs.length === 0) return { low: NaN, high: NaN }
  const rng = bootstrapRng(0x9e3779b9 ^ xs.length)
  const n = xs.length
  const medians: number[] = new Array(b)
  const resample: number[] = new Array(n)
  for (let i = 0; i < b; i++) {
    for (let j = 0; j < n; j++) resample[j] = xs[Math.floor(rng() * n)]
    medians[i] = median(resample)
  }
  medians.sort((a, c) => a - c)
  const loIdx = Math.floor((alpha / 2) * b)
  const hiIdx = Math.min(b - 1, Math.ceil((1 - alpha / 2) * b) - 1)
  return { low: medians[loIdx], high: medians[hiIdx] }
}

/** Two-sided exact binomial sign test against p=0.5: is "stopcock faster than reference" more/less common than chance? */
function signTestP(xs: readonly number[]): number {
  const nonTied = xs.filter((r) => r !== 1)
  const n = nonTied.length
  if (n === 0) return 1
  const k = nonTied.filter((r) => r > 1).length

  // log-space binomial pmf to avoid overflow for n up to a few hundred.
  const logChoose = (nn: number, kk: number): number => {
    let acc = 0
    for (let i = 0; i < kk; i++) acc += Math.log(nn - i) - Math.log(i + 1)
    return acc
  }
  const logPmf = (kk: number): number => logChoose(n, kk) - n * Math.log(2)
  let pAtK = 0
  for (let i = 0; i <= n; i++) {
    const p = Math.exp(logPmf(i))
    if (p <= Math.exp(logPmf(k)) + 1e-12) pAtK += p
  }
  return Math.min(1, pAtK)
}

export interface PairedRunOptions {
  readonly rounds: number
  readonly warmupRounds?: number
}

/**
 * Runs `a` (stopcock runner) and `b` (reference runner) interleaved in ABBA
 * blocks of 4 (A,B,B,A one block, B,A,A,B the next) so drift across the
 * whole run (GC pauses, thermal throttling, background noise) cancels
 * roughly evenly between the two sides instead of biasing whichever ran
 * first. Adjacent-in-time A/B samples are paired for the ratio series.
 */
export function runPaired(a: () => void, b: () => void, opts: PairedRunOptions): PairedRunResult {
  const warmup = opts.warmupRounds ?? 5
  for (let i = 0; i < warmup; i++) {
    a()
    b()
  }

  const aSamples: number[] = []
  const bSamples: number[] = []
  const pairedRatios: number[] = []

  const timeOf = (fn: () => void): number => {
    const t0 = process.hrtime.bigint()
    fn()
    const t1 = process.hrtime.bigint()
    return Number(t1 - t0)
  }

  const blocks = Math.ceil(opts.rounds / 2)
  for (let blk = 0; blk < blocks; blk++) {
    const swapped = blk % 2 === 1
    const order: Array<'a' | 'b'> = swapped ? ['b', 'a', 'a', 'b'] : ['a', 'b', 'b', 'a']
    const ns: number[] = order.map((which) => timeOf(which === 'a' ? a : b))
    // order[0..3] = X Y Y X. Pair (0,1) and (2,3): adjacent in time, one A one B each.
    for (const [i0, i1] of [
      [0, 1],
      [2, 3],
    ] as const) {
      const w0 = order[i0]
      const w1 = order[i1]
      const aNs = w0 === 'a' ? ns[i0] : ns[i1]
      const bNs = w0 === 'a' ? ns[i1] : ns[i0]
      aSamples.push(aNs)
      bSamples.push(bNs)
      pairedRatios.push(bNs / aNs)
    }
  }

  const ci = bootstrapMedianCI(pairedRatios)
  return {
    aSamples,
    bSamples,
    pairedRatios,
    medianRatio: median(pairedRatios),
    meanRatio: mean(pairedRatios),
    ciLow: ci.low,
    ciHigh: ci.high,
    signTestP: signTestP(pairedRatios),
  }
}

/** Geometric mean of a set of positive ratios (per-case medians, typically). */
export function geomean(xs: readonly number[]): number {
  const finite = xs.filter((x) => Number.isFinite(x) && x > 0)
  if (finite.length === 0) return NaN
  const logSum = finite.reduce((acc, x) => acc + Math.log(x), 0)
  return Math.exp(logSum / finite.length)
}
