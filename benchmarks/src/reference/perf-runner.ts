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

export const INTERLEAVED_PAIRED_SAMPLER_ID = 'stopcock-interleaved-paired-microbatch-ab-ba-v1'
export const INTERLEAVED_PAIRED_SAMPLER_ORDER =
  'AB/BA alternating by micro-batch pair and paired sample'

export interface InterleavedPairedSampling {
  readonly id: typeof INTERLEAVED_PAIRED_SAMPLER_ID
  readonly order: typeof INTERLEAVED_PAIRED_SAMPLER_ORDER
  readonly batchIterationsPerSide: number
  readonly microBatchIterations: number
  readonly microBatchesPerSide: number
}

export interface InterleavedPairedRunResult extends PairedRunResult {
  readonly sampling: InterleavedPairedSampling
}

export const SYMMETRIC_PAIRED_SAMPLER_ID =
  'stopcock-symmetric-two-orientation-interleaved-paired-v1'
export const SYMMETRIC_PAIRED_SAMPLER_ORDER =
  'fresh-process candidate@A/reference@B + reference@A/candidate@B'
export const SYMMETRIC_PAIRED_COMBINATION =
  'candidate=sqrt(candidateAtA*candidateAtB); reference=sqrt(referenceAtB*referenceAtA)'
export const SYMMETRIC_PAIRED_ORIENTATION_ISOLATION = 'fresh-process'

export interface SymmetricPairedSampling {
  readonly id: typeof SYMMETRIC_PAIRED_SAMPLER_ID
  readonly order: typeof SYMMETRIC_PAIRED_SAMPLER_ORDER
  readonly combination: typeof SYMMETRIC_PAIRED_COMBINATION
  readonly orientationIsolation: typeof SYMMETRIC_PAIRED_ORIENTATION_ISOLATION
  readonly baseSamplerId: typeof INTERLEAVED_PAIRED_SAMPLER_ID
  readonly orientations: 2
  readonly batchIterationsPerSide: number
  readonly microBatchIterations: number
  readonly microBatchesPerSide: number
}

export interface SymmetricOrientationSamples {
  readonly candidateAtA: {
    readonly candidateSamples: readonly number[]
    readonly referenceSamples: readonly number[]
  }
  readonly candidateAtB: {
    readonly candidateSamples: readonly number[]
    readonly referenceSamples: readonly number[]
  }
}

export interface SymmetricPairedRunResult extends PairedRunResult {
  readonly sampling: SymmetricPairedSampling
  readonly orientationSamples: SymmetricOrientationSamples
}

export interface SymmetricPairedCombineOptions {
  readonly batchIterations: number
  readonly microBatchIterations: number
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
export function bootstrapMedianCI(
  xs: readonly number[],
  b = 2000,
  alpha = 0.05,
): { low: number; high: number } {
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

export interface InterleavedPairedRunOptions extends PairedRunOptions {
  readonly batchIterations: number
  readonly microBatchIterations: number
  /** Observes the last value from each side outside the timed regions. */
  readonly observe?: (aLast: unknown, bLast: unknown) => void
}

const summarizePairedSamples = (
  aSamples: readonly number[],
  bSamples: readonly number[],
  pairedRatios: readonly number[],
): PairedRunResult => {
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

  return summarizePairedSamples(aSamples, bSamples, pairedRatios)
}

/**
 * Runs one invocation from each side in bounded, timed micro-batches. Every
 * paired sample still executes exactly `batchIterations` invocations per side,
 * but neither side owns an entire optimizer, GC, or frequency plateau.
 *
 * The first side alternates AB/BA both between successive micro-batch pairs
 * and between paired samples. Each side's micro-batch timings are summed into
 * the raw per-side sample retained in the report.
 */
export function runInterleavedPaired(
  a: () => unknown,
  b: () => unknown,
  opts: InterleavedPairedRunOptions,
): InterleavedPairedRunResult {
  const { batchIterations, microBatchIterations } = opts
  if (!Number.isSafeInteger(opts.rounds) || opts.rounds <= 0) {
    throw new Error('rounds must be a positive integer')
  }
  if (!Number.isSafeInteger(batchIterations) || batchIterations <= 0) {
    throw new Error('batchIterations must be a positive integer')
  }
  if (!Number.isSafeInteger(microBatchIterations) || microBatchIterations <= 0) {
    throw new Error('microBatchIterations must be a positive integer')
  }

  const warmup = opts.warmupRounds ?? 5
  if (!Number.isSafeInteger(warmup) || warmup < 0) {
    throw new Error('warmupRounds must be a non-negative integer')
  }

  // Keep distinct lexical call sites for each side. Passing both runners
  // through one `fn()` call site makes V8's inline cache polymorphic and can
  // itself trigger the tier transition this sampler is meant to observe.
  let aMicroBatchLast: unknown
  let bMicroBatchLast: unknown
  const runAMicroBatch = (iterations: number): number => {
    let last: unknown
    const t0 = process.hrtime.bigint()
    for (let index = 0; index < iterations; index++) last = a()
    const t1 = process.hrtime.bigint()
    aMicroBatchLast = last
    return Number(t1 - t0)
  }
  const runBMicroBatch = (iterations: number): number => {
    let last: unknown
    const t0 = process.hrtime.bigint()
    for (let index = 0; index < iterations; index++) last = b()
    const t1 = process.hrtime.bigint()
    bMicroBatchLast = last
    return Number(t1 - t0)
  }

  let sampleANs = 0
  let sampleBNs = 0
  const runSample = (sampleIndex: number, timed: boolean): void => {
    let aNs = 0
    let bNs = 0
    let completed = 0
    let pairIndex = 0
    while (completed < batchIterations) {
      const iterations = Math.min(microBatchIterations, batchIterations - completed)
      const aFirst = (sampleIndex + pairIndex) % 2 === 0
      if (aFirst) {
        aNs += runAMicroBatch(iterations)
        bNs += runBMicroBatch(iterations)
      } else {
        bNs += runBMicroBatch(iterations)
        aNs += runAMicroBatch(iterations)
      }
      completed += iterations
      pairIndex++
    }
    opts.observe?.(aMicroBatchLast, bMicroBatchLast)
    sampleANs = timed ? aNs : 0
    sampleBNs = timed ? bNs : 0
  }

  for (let index = 0; index < warmup; index++) runSample(index, false)

  const aSamples: number[] = new Array(opts.rounds)
  const bSamples: number[] = new Array(opts.rounds)
  const pairedRatios: number[] = new Array(opts.rounds)
  for (let index = 0; index < opts.rounds; index++) {
    // Measurement order starts from AB regardless of warmup count.
    runSample(index, true)
    aSamples[index] = sampleANs
    bSamples[index] = sampleBNs
    pairedRatios[index] = sampleBNs / sampleANs
  }

  return {
    ...summarizePairedSamples(aSamples, bSamples, pairedRatios),
    sampling: {
      id: INTERLEAVED_PAIRED_SAMPLER_ID,
      order: INTERLEAVED_PAIRED_SAMPLER_ORDER,
      batchIterationsPerSide: batchIterations,
      microBatchIterations,
      microBatchesPerSide: Math.ceil(batchIterations / microBatchIterations),
    },
  }
}

/**
 * Combines two independently measured call-site orientations. The caller must
 * collect each orientation in a fresh process: running the reverse orientation
 * after the forward orientation in one VM can contaminate inline-cache and JIT
 * state. Keeping all four timed arrays makes the correction fully auditable.
 */
export function combineSymmetricPairedSamples(
  orientationSamples: SymmetricOrientationSamples,
  opts: SymmetricPairedCombineOptions,
): SymmetricPairedRunResult {
  const { candidateAtA, candidateAtB } = orientationSamples
  const rounds = candidateAtA.candidateSamples.length
  const arrays = [
    candidateAtA.candidateSamples,
    candidateAtA.referenceSamples,
    candidateAtB.candidateSamples,
    candidateAtB.referenceSamples,
  ]
  if (rounds === 0 || arrays.some((samples) => samples.length !== rounds)) {
    throw new Error('symmetric orientations must contain the same positive sample count')
  }
  if (arrays.some((samples) => samples.some((sample) => !Number.isFinite(sample) || sample <= 0))) {
    throw new Error('symmetric orientation samples must be finite and positive')
  }
  const candidateSamples = candidateAtA.candidateSamples.map(
    (sample, index) => Math.sqrt(sample) * Math.sqrt(candidateAtB.candidateSamples[index]),
  )
  const referenceSamples = candidateAtA.referenceSamples.map(
    (sample, index) => Math.sqrt(sample) * Math.sqrt(candidateAtB.referenceSamples[index]),
  )
  const pairedRatios = referenceSamples.map((sample, index) => sample / candidateSamples[index])
  return {
    ...summarizePairedSamples(candidateSamples, referenceSamples, pairedRatios),
    sampling: {
      id: SYMMETRIC_PAIRED_SAMPLER_ID,
      order: SYMMETRIC_PAIRED_SAMPLER_ORDER,
      combination: SYMMETRIC_PAIRED_COMBINATION,
      orientationIsolation: SYMMETRIC_PAIRED_ORIENTATION_ISOLATION,
      baseSamplerId: INTERLEAVED_PAIRED_SAMPLER_ID,
      orientations: 2,
      batchIterationsPerSide: opts.batchIterations,
      microBatchIterations: opts.microBatchIterations,
      microBatchesPerSide: Math.ceil(opts.batchIterations / opts.microBatchIterations),
    },
    orientationSamples,
  }
}

/**
 * Selects a bounded micro-batch containing roughly `targetConsumedItems`
 * source reads, without ever exceeding the total per-side batch.
 */
export function consumedItemsMicroBatchIterations(
  consumedInputItems: number,
  batchIterations: number,
  targetConsumedItems = 10_000,
): number {
  if (
    !Number.isSafeInteger(consumedInputItems) ||
    consumedInputItems <= 0 ||
    !Number.isSafeInteger(batchIterations) ||
    batchIterations <= 0 ||
    !Number.isSafeInteger(targetConsumedItems) ||
    targetConsumedItems <= 0
  ) {
    return 0
  }
  return Math.min(batchIterations, Math.max(1, Math.ceil(targetConsumedItems / consumedInputItems)))
}

/** Geometric mean of a set of positive ratios (per-case medians, typically). */
export function geomean(xs: readonly number[]): number {
  const finite = xs.filter((x) => Number.isFinite(x) && x > 0)
  if (finite.length === 0) return NaN
  const logSum = finite.reduce((acc, x) => acc + Math.log(x), 0)
  return Math.exp(logSum / finite.length)
}
