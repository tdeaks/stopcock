// W0a correctness fuzzing.
//
// One-runtime-path plan (Phase 3 re-oracle). This used to run seeded
// pipelines through three lanes -- the compact engine's generic executor,
// the real fused pipe() engine (reaching that same executor via the plan
// cache), and the frozen reference emitter -- and required all three to
// agree. The compact fusion engine is gone: `pipe` (root and
// `@stopcock/fp/fusion`) is now plain left-to-right sequential application
// (see pipe.ts, internal/sequential.ts).
//
// This suite now compares two lanes: the frozen reference emitter (still
// deliberately fused-style codegen, one pass per stream segment with real
// early exit -- see emitter.ts's header) against `sequentialPipe` applied
// to the same steps built from the real, current `@stopcock/fp/array`
// operators (resolvePipeline's `realSteps`).
//
// D1 (one-runtime-path plan): callback interleaving across tiers is
// unspecified. A fused segment and a materializing sequential pass over the
// same ops can call an upstream callback a different number of times for an
// early-exit shape (e.g. `map` then `take`) -- the emitter stops the source
// loop as soon as `take`'s cap is hit, sequential `A.map` runs over the
// whole array first -- and that is by design, not a bug. What must agree,
// and is asserted below, is the *result*: for every combinator in this
// grammar, early-exit position (find/every/some/take/takeWhile/dropWhile,
// scan's n+1 output) is determined by prefix order, which both lanes visit
// identically, so the two lanes must always compute the same value even
// though they may call back a different number of times reaching it.
// Callback counts/order are therefore not compared, cross-tier or
// per-tier -- there is nothing here to pin, since neither lane's own count
// is asserted as a golden value in the first place (unlike
// compiler-diff.test.ts's hand-curated `originalLogLength` fixtures, this
// corpus is generated, not authored, so there's no per-case count to write
// down by hand).
//
// pinned-corpus.json's shape (input/holeIndices/steps) needed no change for
// this: both lanes are rebuilt from those same fields via resolvePipeline,
// once each, with fresh input copies.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import { sequentialPipe } from '../../../packages/fp/src/internal/sequential'
import { compileEmittedPipeline } from './emitter'
import { generateSerializedPipeline, resolvePipeline, type SerializedPipeline } from './generate'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CORPUS_PATH = join(__dirname, 'pinned-corpus.json')

interface PinnedCase {
  readonly name: string
  readonly input: readonly number[]
  readonly holeIndices?: readonly number[]
  readonly steps: SerializedPipeline['steps']
}

function loadPinnedCorpus(): readonly PinnedCase[] {
  return JSON.parse(readFileSync(CORPUS_PATH, 'utf8'))
}

/** NaN-equal, -0-distinguishing deep comparator. */
function semanticEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true
    return Object.is(a, b)
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!semanticEqual(a[i], b[i])) return false
    return true
  }
  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object'
  ) {
    const left = a as Record<PropertyKey, unknown>
    const right = b as Record<PropertyKey, unknown>
    const leftKeys = Reflect.ownKeys(left)
    const rightKeys = Reflect.ownKeys(right)
    if (leftKeys.length !== rightKeys.length) return false
    for (const key of leftKeys) {
      if (
        !Object.prototype.hasOwnProperty.call(right, key) ||
        !semanticEqual(left[key], right[key])
      ) {
        return false
      }
    }
    return true
  }
  return Object.is(a, b) || a === b
}

interface RunOutcome {
  readonly value?: unknown
  readonly error?: string
}

/** Compiled lane: the frozen, deliberately fused-style reference emitter. */
function runEmitted(sp: SerializedPipeline): RunOutcome {
  const g = resolvePipeline(sp)
  try {
    return { value: compileEmittedPipeline(g.desc)(g.input, g.bindings) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

/** Sequential lane: the real, current @stopcock/fp/array operators, applied one step at a time. */
function runSequential(sp: SerializedPipeline): RunOutcome {
  const g = resolvePipeline(sp)
  try {
    return { value: sequentialPipe(g.input, ...(g.realSteps as ReadonlyArray<(v: unknown) => unknown>)) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

interface CompareFailure {
  readonly reason: string
}

/** Compares compiled (emitter) against sequential (real ops) on result only -- see the D1 note above. */
function compareOutcomes(compiled: RunOutcome, sequential: RunOutcome): CompareFailure | undefined {
  if (!!compiled.error !== !!sequential.error) {
    return {
      reason: `compiled ${compiled.error ? `threw: ${compiled.error}` : 'did not throw'}, sequential ${sequential.error ? `threw: ${sequential.error}` : 'did not throw'}`,
    }
  }
  if (compiled.error) return undefined
  if (!semanticEqual(compiled.value, sequential.value)) {
    return { reason: `compiled=${JSON.stringify(compiled.value)} !== sequential=${JSON.stringify(sequential.value)}` }
  }
  return undefined
}

async function checkPipeline(sp: SerializedPipeline): Promise<CompareFailure | undefined> {
  return compareOutcomes(runEmitted(sp), runSequential(sp))
}

function truncated(sp: SerializedPipeline, stepCount: number, inputLength: number): SerializedPipeline {
  return {
    input: sp.input.slice(0, inputLength),
    holeIndices: sp.holeIndices?.filter((i) => i < inputLength),
    steps: sp.steps.slice(0, stepCount),
  }
}

/** Drops trailing ops, then halves the input, greedily, while the failure still reproduces. */
async function shrink(sp: SerializedPipeline): Promise<SerializedPipeline> {
  let current = sp
  let stepCount = sp.steps.length
  while (stepCount > 0) {
    const candidate = truncated(current, stepCount - 1, current.input.length)
    if (await checkPipeline(candidate)) {
      current = candidate
      stepCount = candidate.steps.length
    } else {
      break
    }
  }
  let inputLength = current.input.length
  while (inputLength > 0) {
    const candidate = truncated(current, current.steps.length, Math.floor(inputLength / 2))
    if (await checkPipeline(candidate)) {
      current = candidate
      inputLength = candidate.input.length
    } else {
      break
    }
  }
  return current
}

function appendToPinnedCorpus(name: string, sp: SerializedPipeline): void {
  const corpus = existsSync(CORPUS_PATH) ? (JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as PinnedCase[]) : []
  corpus.push({ name, input: sp.input, holeIndices: sp.holeIndices, steps: sp.steps })
  writeFileSync(CORPUS_PATH, JSON.stringify(corpus, null, 2) + '\n')
}

const FUZZ_COUNT = Number(process.env.STOPCOCK_FUZZ_COUNT ?? 500)
const FUZZ_SEED_OFFSET = Number(process.env.STOPCOCK_FUZZ_SEED_OFFSET ?? 1)

describe('W0a pinned corpus (runs every time, before the fuzz loop)', () => {
  for (const pinned of loadPinnedCorpus()) {
    it(pinned.name, async () => {
      const sp: SerializedPipeline = { input: pinned.input, holeIndices: pinned.holeIndices, steps: pinned.steps }
      const failure = await checkPipeline(sp)
      expect(failure?.reason).toBeUndefined()
    })
  }
})

describe(`W0a seeded fuzz correctness (${FUZZ_COUNT} pipelines)`, () => {
  it(
    `all ${FUZZ_COUNT} seeded pipelines agree across emitter/sequential`,
    async () => {
      const failures: string[] = []
      for (let i = 0; i < FUZZ_COUNT; i++) {
        const seed = FUZZ_SEED_OFFSET + i
        const sp = generateSerializedPipeline(seed)
        const failure = await checkPipeline(sp)
        if (!failure) continue

        const minimal = await shrink(sp)
        const name = `shrunk from seed ${seed}: ${failure.reason}`
        appendToPinnedCorpus(name, minimal)
        failures.push(`seed ${seed}: ${failure.reason}\nminimal repro: ${JSON.stringify(minimal)}`)
      }
      expect(failures).toEqual([])
    },
    120_000,
  )
})
