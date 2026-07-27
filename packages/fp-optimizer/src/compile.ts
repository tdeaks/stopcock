import {
  OP_FILTER,
  OP_FILTER_MAP,
  OP_FIND,
  OP_FLAT_MAP,
  OP_LENGTH,
  OP_MAP,
  OP_REDUCE,
  OP_TAKE,
} from '@stopcock/fp/abi'
import { IncompatibleOptimizerError, runExactFallback, vetOperator } from '@stopcock/fp/abi'
import { recordSelection } from './selection-trace'
import { findElidableMapBeforeLength, pureRewrites, type PureRewrite } from '@stopcock/fp/abi'
import { none as optionNone, some as optionSome } from '@stopcock/fp/option'
import { lowerShape, type PortableRunner } from './lower'
import {
  buildOptimizerPlan,
  compatibilityCandidateForPlan,
  evaluatePlanCompatibility,
  type OptimizerBoundPlanV1,
  evaluateOptimizerCompatibility,
  type OptimizerCompatibilityCandidateV1,
} from './abi-compatibility'
import { planShapeKey, type PlanShape, type SegmentShape, type StepBinding } from '@stopcock/fp/abi'
import { type OpCode, type OpDomain } from '@stopcock/fp/abi'
import {
  entryCount,
  evictionStats,
  getOrCreateEntry,
  resetEvictionStats,
  type SemanticMode,
  type ShapeEntry,
} from './shape-entry'

const IS_BUN_RUNTIME = typeof (globalThis as { readonly Bun?: unknown }).Bun !== 'undefined'

type AnyUnary = (input: never) => unknown

type FirstInput<Steps extends readonly AnyUnary[]> = Steps extends readonly [
  infer First extends AnyUnary,
  ...(readonly AnyUnary[]),
]
  ? Parameters<First>[0]
  : unknown

type LastOutput<Steps extends readonly AnyUnary[]> = Steps extends readonly [
  ...(readonly AnyUnary[]),
  infer Last extends AnyUnary,
]
  ? ReturnType<Last>
  : unknown

type ValidChain<Steps extends readonly AnyUnary[]> = Steps extends readonly [
  infer First extends AnyUnary,
  infer Second extends AnyUnary,
  ...infer Rest extends readonly AnyUnary[],
]
  ? ReturnType<First> extends Parameters<Second>[0]
    ? readonly [First, ...ValidChain<readonly [Second, ...Rest]>]
    : never
  : Steps

export type Runner<Input = unknown, Output = unknown> = (input: Input) => Output

export type { PureRewrite }

export interface OptimizerStats {
  readonly plansBuilt: number
  readonly lowerings: number
  readonly shapeCacheHits: number
  readonly shapeCacheMisses: number
  readonly shapeCacheSize: number
  readonly cacheEvictions: number
}

let plansBuilt = 0
let lowerings = 0
let shapeCacheHits = 0
let shapeCacheMisses = 0
const exactFallbackEntries = new WeakSet<ShapeEntry>()

export function getOptimizerStats(): Readonly<OptimizerStats> {
  return Object.freeze({
    plansBuilt,
    lowerings,
    shapeCacheHits,
    shapeCacheMisses,
    shapeCacheSize: entryCount(),
    cacheEvictions: evictionStats().evictions,
  })
}

export function resetOptimizerStats(): void {
  plansBuilt = 0
  lowerings = 0
  shapeCacheHits = 0
  shapeCacheMisses = 0
  resetEvictionStats()
}

function shapeEntryFor(
  shape: PlanShape,
  mode: SemanticMode,
  rewriteSignature: string,
  createPortableRun?: () => PortableRunner,
): ShapeEntry {
  const { entry, hit } = getOrCreateEntry(planShapeKey(shape), mode, rewriteSignature, () => {
    lowerings++
    return createPortableRun ? createPortableRun() : lowerShape(shape)
  })
  if (hit) shapeCacheHits++
  else shapeCacheMisses++
  return entry
}

/**
 * Portable dispatch is deliberately boring: the build compiler is the only
 * component allowed to generate code. Keeping this function as the shared
 * dispatch seam lets pipe and compile continue to share the bounded shape
 * cache without a hidden warm-up tier.
 */
export function dispatchAndTrack(
  entry: ShapeEntry,
  data: unknown,
  bindings: readonly StepBinding[],
): unknown {
  if (exactFallbackEntries.has(entry)) return entry.run(data, bindings)
  entry.execCount++
  recordSelection('executed', 'shared', entry.shapeKey)
  return entry.run(data, bindings)
}

/**
 * A physical ABI mismatch still has to fit the fusion engine's existing
 * shape-entry call seam. This entry is deliberately outside the specialized
 * shape cache and selection trace: it delegates only to FP's exact fallback,
 * using the call-local bindings supplied by the fusion cache.
 */
function exactFallbackEntry(plan: OptimizerBoundPlanV1): ShapeEntry {
  const template = Object.freeze({
    instanceToken: plan.instanceToken,
    identity: plan.identity,
    codes: plan.codes,
    segments: plan.segments,
    mode: plan.mode,
    layout: plan.layout,
    fullyTrusted: plan.fullyTrusted,
  })
  const entry: ShapeEntry = {
    execCount: 0,
    shapeKey: `exact-fallback:${planShapeKey(plan.shape)}`,
    run: (input, bindings) => runExactFallback({ ...template, bindings }, input),
  }
  exactFallbackEntries.add(entry)
  return entry
}

const bindEntryRunner = (entry: ShapeEntry, bindings: readonly StepBinding[]): Runner => {
  // Keep the entry callsite local to this compiled binding set. Besides
  // removing a shared dispatch hop, this lets V8/JSC keep the shape runner
  // and callback-bearing bindings monomorphic for tiny early-exit pipelines.
  return (input) => {
    entry.execCount++
    recordSelection('executed', 'shared', entry.shapeKey)
    return entry.run(input, bindings)
  }
}

/**
 * Bind tiny callback-heavy sentinel shapes directly. The shared shape entry
 * remains the cache/statistics identity, but a compiled runner should not pay
 * generic dispatch layers or share one callback callsite with unrelated
 * binding sets.
 */
const bindCriticalRunner = (
  entry: ShapeEntry,
  shape: PlanShape,
  bindings: readonly StepBinding[],
  shapeKey: string,
): Runner | undefined => {
  if (
    shape.segments.length !== 1 ||
    shape.segments[0].kind !== 'stream' ||
    shape.segments[0].startIndex !== 0
  ) {
    return undefined
  }

  const fallback = bindEntryRunner(entry, bindings)

  if (shape.codes.length === 2 && shape.codes[0] === OP_MAP && shape.codes[1] === OP_FILTER) {
    const map = bindings[0].fn as (value: unknown) => unknown
    const filter = bindings[1].fn as (value: unknown) => boolean
    return (input) => {
      const source = input as readonly unknown[]
      // JSC is more stable through the generated lane for large allocating
      // collectors; V8 optimizes the callback-bound loop substantially better.
      if (IS_BUN_RUNTIME && source.length >= 512) return fallback(input)
      entry.execCount++
      recordSelection('executed', 'bound', entry.shapeKey)
      const output: unknown[] = []
      let outputLength = 0
      const sourceLength = source.length
      for (let index = 0; index < sourceLength; index++) {
        const value = map(source[index])
        if (filter(value)) output[outputLength++] = value
      }
      return output
    }
  }

  if (
    shape.codes.length === 5 &&
    shape.codes[0] === OP_MAP &&
    shape.codes[1] === OP_FLAT_MAP &&
    shape.codes[2] === OP_FILTER &&
    shape.codes[3] === OP_FILTER_MAP &&
    shape.codes[4] === OP_REDUCE
  ) {
    const map = bindings[0].fn as (value: unknown) => unknown
    const flatMap = bindings[1].fn as (value: unknown) => Iterable<unknown>
    const filter = bindings[2].fn as (value: unknown) => boolean
    const filterMap = bindings[3].fn as (value: unknown) => unknown
    const reduce = bindings[4].fn as (state: unknown, value: unknown) => unknown
    const initial = bindings[4].a1
    return (input) => {
      const source = input as readonly unknown[]
      entry.execCount++
      recordSelection('executed', 'bound', entry.shapeKey)
      let state = initial
      for (let index = 0; index < source.length; index++) {
        const items = flatMap(map(source[index]))
        if (Array.isArray(items)) {
          for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const item = items[itemIndex]
            if (!filter(item)) continue
            const value = filterMap(item)
            if (value != null) state = reduce(state, value)
          }
        } else {
          for (const item of items) {
            if (!filter(item)) continue
            const value = filterMap(item)
            if (value != null) state = reduce(state, value)
          }
        }
      }
      return state
    }
  }

  if (shape.codes.length !== 3 || shape.codes[0] !== OP_MAP || shape.codes[1] !== OP_FILTER) {
    return undefined
  }

  const map = bindings[0].fn as (value: unknown) => unknown
  const filter = bindings[1].fn as (value: unknown) => boolean

  if (shape.codes[2] === OP_REDUCE) {
    const reduce = bindings[2].fn as (state: unknown, value: unknown) => unknown
    const initial = bindings[2].a1
    return (input) => {
      const source = input as readonly unknown[]
      if (source.length >= 512) return fallback(input)
      entry.execCount++
      recordSelection('executed', 'bound', entry.shapeKey)
      let state = initial
      for (let index = 0; index < source.length; index++) {
        const value = map(source[index])
        if (filter(value)) state = reduce(state, value)
      }
      return state
    }
  }

  if (shape.codes[2] === OP_FIND) {
    const find = bindings[2].fn as (value: unknown) => boolean
    return (input) => {
      const source = input as readonly unknown[]
      if (source.length >= 512) return fallback(input)
      entry.execCount++
      recordSelection('executed', 'bound', entry.shapeKey)
      for (let index = 0; index < source.length; index++) {
        const value = map(source[index])
        if (filter(value) && find(value)) return optionSome(value)
      }
      return optionNone
    }
  }

  return undefined
}

export function planAndLowerFast(steps: readonly unknown[]): {
  readonly entry: ShapeEntry
  readonly bindings: readonly StepBinding[]
} {
  const plan = buildOptimizerPlan(steps, 'exact')
  const compatibility = evaluatePlanCompatibility(plan, 'exact')
  if (!compatibility.eligible) {
    return { entry: exactFallbackEntry(plan), bindings: plan.bindings }
  }
  plansBuilt++
  // `pipe` never reaches bindCriticalRunner, so its selection is always the
  // shared runner. Recording it here rather than inferring it from the cache
  // keeps the trace honest about which path the value actually took.
  const entry = shapeEntryFor(plan.shape, 'exact', 'none')
  recordSelection('selected', 'shared', entry.shapeKey)
  return { entry, bindings: plan.bindings }
}

export function __shapeEntryForSteps(
  steps: readonly unknown[],
  mode: SemanticMode = 'exact',
): ShapeEntry {
  const plan = buildOptimizerPlan(steps, mode)
  const compatibility = evaluatePlanCompatibility(plan, mode)
  if (!compatibility.eligible) throw new IncompatibleOptimizerError(compatibility.reason)
  return shapeEntryFor(plan.shape, mode, 'none')
}

function readDenseLength(data: readonly unknown[]): number {
  const length = data.length
  for (let index = 0; index < length; index++) void data[index]
  return length
}

function buildPortable(
  shape: PlanShape,
  bindings: readonly StepBinding[],
  pure: boolean,
): {
  readonly run: Runner
  readonly rewrites: readonly PureRewrite[]
  readonly entry: ShapeEntry
} {
  if (pure) {
    const elidable = findElidableMapBeforeLength(shape.codes, shape.segments)
    if (elidable !== undefined) {
      const before = shape.segments
        .slice(0, elidable)
        .map((segment) => lowerShape({ codes: shape.codes, segments: [segment] }))
      const after = shape.segments
        .slice(elidable + 2)
        .map((segment) => lowerShape({ codes: shape.codes, segments: [segment] }))
      const portable: PortableRunner = (input, currentBindings): unknown => {
        let value = input
        for (const run of before) value = run(value, currentBindings)
        value = readDenseLength(value as readonly unknown[])
        for (const run of after) value = run(value, currentBindings)
        return value
      }
      const entry = shapeEntryFor(shape, 'pure', 'elide-unused-map', () => portable)
      recordSelection('selected', 'shared', entry.shapeKey)
      return {
        run: bindEntryRunner(entry, bindings),
        rewrites: pureRewrites(shape),
        entry,
      }
    }
  }

  const entry = shapeEntryFor(shape, pure ? 'pure' : 'exact', 'none')
  // `selected` comes from this branch — the one that resolves the canonical
  // runner — and nowhere else. A hand-bound runner can still hand control back
  // to the shared one at its size threshold, so what actually ran is recorded
  // separately, inside the runner.
  const bound = bindCriticalRunner(entry, shape, bindings, entry.shapeKey)
  recordSelection('selected', bound === undefined ? 'shared' : 'bound', entry.shapeKey)
  return {
    run: bound ?? bindEntryRunner(entry, bindings),
    rewrites: Object.freeze([]),
    entry,
  }
}

interface RunnerRecord {
  readonly entry: ShapeEntry
  readonly bindings: readonly StepBinding[]
  readonly semanticMode: 'exact' | 'pure'
  readonly rewrites: readonly PureRewrite[]
}

const runnerEntries = new WeakMap<Runner, RunnerRecord>()

function compileVettedPlan(
  pure: boolean,
  plan: OptimizerBoundPlanV1,
  steps?: readonly unknown[],
  compatibilityCandidate?: OptimizerCompatibilityCandidateV1,
): Runner {
  const semanticMode: SemanticMode = pure ? 'pure' : 'exact'
  const compatibility =
    compatibilityCandidate === undefined
      ? evaluatePlanCompatibility(plan, semanticMode)
      : evaluateOptimizerCompatibility(compatibilityCandidate)
  // A foreign/opaque plan is semantically valid but ineligible for the bank.
  // Run FP's interpreter directly so it cannot populate a runner cache, emit a
  // specialized selection event, or accidentally reach a bound fast path.
  if (!compatibility.eligible) return (input) => runExactFallback(plan, input)
  if (steps?.length === 1) {
    const step = steps[0] as Runner
    // A data-last filter closure shares one callback callsite across every
    // predicate identity. Route it through the checked-in callback-lane
    // template below; other single operations retain the cheaper direct call.
    if (vetOperator(step)?.op !== OP_FILTER) {
      plansBuilt++
      return (input) => step(input)
    }
  }
  plansBuilt++
  const built = buildPortable(plan.shape, plan.bindings, pure)
  // buildPortable already returns a runner bound to this compile's callback
  // bindings. Preserve that call shape instead of adding another forwarding
  // closure to every hot invocation.
  const runner: Runner = built.run
  runnerEntries.set(runner, {
    entry: built.entry,
    bindings: plan.bindings,
    semanticMode: pure ? 'pure' : 'exact',
    rewrites: built.rewrites,
  })
  return runner
}

function compileInternal(pure: boolean, steps: readonly unknown[]): Runner {
  if (steps.length === 0) return (input) => input
  const semanticMode: SemanticMode = pure ? 'pure' : 'exact'
  return compileVettedPlan(pure, buildOptimizerPlan(steps, semanticMode), steps)
}

/**
 * Internal boundary probe for the extracted-package qualification matrix. It
 * shares the production execution gate; it is intentionally not re-exported
 * from the optimizer package root.
 */
export function __compileVettedPlanForTest(
  plan: OptimizerBoundPlanV1,
  mode: SemanticMode,
  candidate: OptimizerCompatibilityCandidateV1 = compatibilityCandidateForPlan(plan, mode),
): Runner {
  return compileVettedPlan(mode === 'pure', plan, undefined, candidate)
}

export function compile(): Runner
export function compile<const Steps extends readonly [AnyUnary, ...AnyUnary[]]>(
  ...steps: Steps & ValidChain<Steps>
): Runner<FirstInput<Steps>, LastOutput<Steps>>
export function compile(...steps: readonly Runner[]): Runner
export function compile(...steps: readonly unknown[]): Runner {
  return compileInternal(false, steps)
}

export function compilePure(): Runner
export function compilePure<const Steps extends readonly [AnyUnary, ...AnyUnary[]]>(
  ...steps: Steps & ValidChain<Steps>
): Runner<FirstInput<Steps>, LastOutput<Steps>>
export function compilePure(...steps: readonly Runner[]): Runner
export function compilePure(...steps: readonly unknown[]): Runner {
  return compileInternal(true, steps)
}

export interface RunnerExplanation {
  readonly version: 1
  readonly executor: 'portable'
  readonly semanticMode: 'exact' | 'pure'
  readonly executions: number
  readonly rewrites: readonly PureRewrite[]
  readonly runtimeCodeGeneration: false
}

export function explainRunner(runner: Runner): RunnerExplanation {
  const record = runnerEntries.get(runner)
  if (!record) throw new TypeError('explainRunner: expected a runner returned by compile')
  return Object.freeze({
    version: 1,
    executor: 'portable',
    semanticMode: record.semanticMode,
    executions: record.entry.execCount,
    rewrites: record.rewrites,
    runtimeCodeGeneration: false,
  })
}
