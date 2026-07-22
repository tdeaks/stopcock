// W0a correctness fuzzing: seeded pipelines run through the reference
// interpreter, the real pipe() engine, and the frozen reference emitter.
// Outputs and callback invocation logs (order, argument, step index) must
// agree across all three. On failure the pipeline shrinks automatically
// (drop trailing ops, then halve input) to a minimal repro, which gets
// appended to pinned-corpus.json so it never regresses silently again.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import { buildPlan } from '../../../packages/fp/src/plan'
import { interpret } from '../../../packages/fp/src/interpret'
import { pipe } from '../../../packages/fp/src/pipe'
import { compileJit } from '../../../packages/fp/src/compile'
import { compileEmittedPipeline } from './emitter'
import {
  generateSerializedPipeline,
  resolvePipeline,
  type CallbackWrapper,
  type SerializedPipeline,
} from './generate'

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

interface CallLogEntry {
  readonly step: number
  readonly args: readonly unknown[]
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
  return Object.is(a, b) || a === b
}

interface RunOutcome {
  readonly value?: unknown
  readonly error?: string
  readonly log: readonly CallLogEntry[]
}

function loggingWrapper(log: CallLogEntry[]): CallbackWrapper {
  return (fn, stepIndex) => {
    if (typeof fn !== 'function') return fn
    return (...args: unknown[]) => {
      log.push({ step: stepIndex, args })
      return (fn as (...a: unknown[]) => unknown)(...args)
    }
  }
}

function runInterpret(sp: SerializedPipeline): RunOutcome {
  const log: CallLogEntry[] = []
  const g = resolvePipeline(sp, loggingWrapper(log))
  try {
    const value = interpret(buildPlan(g.realSteps), g.input)
    return { value, log }
  } catch (e) {
    return { error: (e as Error).message, log }
  }
}

function runPipe(sp: SerializedPipeline): RunOutcome {
  const log: CallLogEntry[] = []
  const g = resolvePipeline(sp, loggingWrapper(log))
  try {
    const value = (pipe as (a: unknown, ...fns: unknown[]) => unknown)(g.input, ...g.realSteps)
    return { value, log }
  } catch (e) {
    return { error: (e as Error).message, log }
  }
}

function runEmitted(sp: SerializedPipeline): RunOutcome {
  const log: CallLogEntry[] = []
  const g = resolvePipeline(sp, loggingWrapper(log))
  try {
    const value = compileEmittedPipeline(g.desc)(g.input, g.bindings)
    return { value, log }
  } catch (e) {
    return { error: (e as Error).message, log }
  }
}

/**
 * Runs the pipeline through compileJit (tier 1/2, awaited so generation is
 * deterministic rather than threshold-gated). Single-step and empty
 * pipelines are skipped: compileJit's single-op collapse dispatches to the
 * same eager kernel pipe() and interpret() already use, so it can never
 * diverge and adds no tier coverage.
 */
async function runJit(sp: SerializedPipeline): Promise<RunOutcome | undefined> {
  const log: CallLogEntry[] = []
  const g = resolvePipeline(sp, loggingWrapper(log))
  if (g.realSteps.length < 2) return undefined
  try {
    const runner = await compileJit(...(g.realSteps as unknown[]))
    const value = runner(g.input)
    return { value, log }
  } catch (e) {
    return { error: (e as Error).message, log }
  }
}

interface CompareFailure {
  readonly reason: string
}

function compareOutcomes(a: RunOutcome, b: RunOutcome, aName: string, bName: string): CompareFailure | undefined {
  if (!!a.error !== !!b.error) {
    return { reason: `${aName} ${a.error ? `threw: ${a.error}` : 'did not throw'}, ${bName} ${b.error ? `threw: ${b.error}` : 'did not throw'}` }
  }
  if (a.error) return undefined
  if (!semanticEqual(a.value, b.value)) {
    return { reason: `${aName}=${JSON.stringify(a.value)} !== ${bName}=${JSON.stringify(b.value)}` }
  }
  if (a.log.length !== b.log.length) {
    return { reason: `${aName} called callbacks ${a.log.length} times, ${bName} ${b.log.length} times` }
  }
  for (let i = 0; i < a.log.length; i++) {
    if (a.log[i].step !== b.log[i].step || !semanticEqual(a.log[i].args, b.log[i].args)) {
      return {
        reason: `callback log diverges at call ${i}: ${aName}=${JSON.stringify(a.log[i])} ${bName}=${JSON.stringify(b.log[i])}`,
      }
    }
  }
  return undefined
}

async function checkPipeline(sp: SerializedPipeline): Promise<CompareFailure | undefined> {
  const fromInterpret = runInterpret(sp)
  const fromPipe = runPipe(sp)
  const fromEmitted = runEmitted(sp)
  const fromJit = await runJit(sp)
  const base =
    compareOutcomes(fromInterpret, fromPipe, 'interpret', 'pipe') ??
    compareOutcomes(fromInterpret, fromEmitted, 'interpret', 'emitted') ??
    compareOutcomes(fromPipe, fromEmitted, 'pipe', 'emitted')
  if (base) return base
  if (!fromJit) return undefined
  return (
    compareOutcomes(fromInterpret, fromJit, 'interpret', 'jit') ??
    compareOutcomes(fromPipe, fromJit, 'pipe', 'jit')
  )
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
    `all ${FUZZ_COUNT} seeded pipelines agree across interpret/pipe/emitter/jit`,
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
