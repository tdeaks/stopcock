import {
  OP_FILTER,
  OP_FILTER_MAP,
  OP_FIND,
  OP_FLAT_MAP,
  OP_LENGTH,
  OP_MAP,
  OP_REDUCE,
  OP_SORT,
  OP_SORT_ASC,
  OP_SORT_BY,
  OP_SORT_DESC,
  OP_SORT_INLINE,
  OP_TAKE,
} from '@stopcock/fp/abi'
import { vetOperator } from '@stopcock/fp/abi'
import { recordSelection } from './selection-trace'
import {
  findElidableMapBeforeLength,
  findSortThenTake,
  pureRewrites,
  type PureRewrite,
} from '@stopcock/fp/abi'
import { none as optionNone, some as optionSome } from '@stopcock/fp/option'
import { lowerShape, type PortableRunner } from './lower'
import { buildPlan } from './plan-bridge'
import {
  planShapeKey,
  type PlanShape,
  type SegmentShape,
  type StepBinding,
} from '@stopcock/fp/abi'
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
  entry.execCount++
  recordSelection('executed', 'shared', entry.shapeKey)
  return entry.run(data, bindings)
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
  const plan = buildPlan(steps)
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
  const plan = buildPlan(steps)
  return shapeEntryFor(plan.shape, mode, 'none')
}






function stableTopK(
  data: readonly unknown[],
  compare: (left: unknown, right: unknown) => number,
  count: number,
): unknown[] {
  const limit = Math.max(0, Math.trunc(count))
  if (limit === 0) return []
  const output: unknown[] = []
  for (let index = 0; index < data.length; index++) {
    const value = data[index]
    if (output.length === limit && compare(value, output[limit - 1]) >= 0) continue
    let low = 0
    let high = output.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (compare(output[middle], value) <= 0) low = middle + 1
      else high = middle
    }
    output.splice(low, 0, value)
    if (output.length > limit) output.pop()
  }
  return output
}

function numericCompare(left: unknown, right: unknown): number {
  return (left as number) - (right as number)
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
    const sortTake = findSortThenTake(shape.codes, shape.segments)
    if (sortTake) {
      const sortSegment = shape.segments[sortTake.sortSegment]
      const takeSegment = shape.segments[sortTake.takeSegment]
      const sortOp = shape.codes[sortSegment.startIndex]
      const sortBinding = bindings[sortSegment.startIndex]
      const takeBinding = bindings[takeSegment.startIndex]
      const before = shape.segments
        .slice(0, sortTake.sortSegment)
        .map((segment) => lowerShape({ codes: shape.codes, segments: [segment] }))
      const after = shape.segments
        .slice(sortTake.takeSegment + 1)
        .map((segment) => lowerShape({ codes: shape.codes, segments: [segment] }))
      const portable = (input: unknown): unknown => {
        let value = input
        for (const run of before) value = run(value, bindings)
        const compare =
          sortOp === OP_SORT_BY || sortOp === OP_SORT_INLINE
            ? (sortBinding.fn as (left: unknown, right: unknown) => number)
            : sortOp === OP_SORT_DESC
              ? (left: unknown, right: unknown) => numericCompare(right, left)
              : numericCompare
        value = stableTopK(value as readonly unknown[], compare, takeBinding.fn as number)
        for (const run of after) value = run(value, bindings)
        return value
      }
      const entry = shapeEntryFor(shape, 'pure', 'top-k', () => (input) => portable(input))
      recordSelection('selected', 'shared', entry.shapeKey)
      return {
        run: bindEntryRunner(entry, bindings),
        rewrites: pureRewrites(shape),
        entry,
      }
    }

    const elidable = findElidableMapBeforeLength(shape.codes, shape.segments)
    if (elidable !== undefined) {
      const before = shape.segments
        .slice(0, elidable)
        .map((segment) => lowerShape({ codes: shape.codes, segments: [segment] }))
      const after = shape.segments
        .slice(elidable + 2)
        .map((segment) => lowerShape({ codes: shape.codes, segments: [segment] }))
      const portable = (input: unknown): unknown => {
        let value = input
        for (const run of before) value = run(value, bindings)
        value = (value as readonly unknown[]).length
        for (const run of after) value = run(value, bindings)
        return value
      }
      const entry = shapeEntryFor(
        shape,
        'pure',
        'elide-unused-map',
        () => (input) => portable(input),
      )
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

function compileInternal(pure: boolean, steps: readonly unknown[]): Runner {
  if (steps.length === 0) return (input) => input
  if (steps.length === 1) {
    const step = steps[0] as Runner
    // A data-last filter closure shares one callback callsite across every
    // predicate identity. Route it through the checked-in callback-lane
    // template below; other single operations retain the cheaper direct call.
    if (vetOperator(step)?.op !== OP_FILTER) {
      plansBuilt++
      return (input) => step(input)
    }
  }
  const plan = buildPlan(steps)
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
