// Seeded pipeline generator for the W0a fuzz corpus. Deterministic given a
// seed (mulberry32). Produces a SerializedPipeline (plain JSON: step kinds,
// CallbackSpecs, input) which resolvePipeline() turns into a PipelineDesc +
// bindings for the frozen emitter and a parallel array of tagged A.* steps
// for the real pipe()/interpret() paths, built from the same specs so both
// sides run literally the same callback logic (not just equal-by-identity,
// since a shrunk/pinned repro is re-resolved from scratch each run).
import * as A from '../../../packages/fp/src/array'
import { buildCallback, type CallbackSpec } from './binding-specs'
import type { BoundaryStepKind, EmitterBinding, PipelineDesc, SinkStepKind, StreamStepKind } from './emitter'

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = () => number

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]
}

function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export type CallbackClass = 'trivial' | 'arithmetic' | 'allocating'

function randomClass(rng: Rng): CallbackClass {
  return pick(rng, ['trivial', 'arithmetic', 'allocating'])
}

/** Exported for perf-corpus construction (W0b), which needs class-controlled specs without going through the full random pipeline shape. */
export function mapSpec(rng: Rng, cls: CallbackClass): CallbackSpec {
  if (cls === 'trivial') return { kind: 'identity' }
  if (cls === 'allocating') return { kind: 'allocLinear', a: int(rng, 1, 3) }
  return { kind: 'linear', a: int(rng, 1, 5), b: int(rng, -5, 5) }
}

export function predicateSpec(rng: Rng, cls: CallbackClass): CallbackSpec {
  const m = int(rng, 2, 5)
  const r = int(rng, 0, m - 1)
  return cls === 'allocating' ? { kind: 'allocMod', m, r } : { kind: 'mod', m, r }
}

export function filterMapSpec(rng: Rng): CallbackSpec {
  const m = int(rng, 2, 5)
  return { kind: 'filterMapMod', m, r: int(rng, 0, m - 1), a: int(rng, 1, 5), b: int(rng, -5, 5) }
}

export function flatMapSpec(rng: Rng, maxFactor: number): CallbackSpec {
  return { kind: 'flatMapRange', factor: int(rng, 0, Math.max(0, maxFactor)), a: int(rng, 1, 3), b: int(rng, -2, 2) }
}

export function reducerSpec(rng: Rng, cls: CallbackClass): CallbackSpec {
  if (cls === 'allocating') return { kind: 'allocReduceAdd' }
  return pick(rng, [{ kind: 'reduceAdd' } as const, { kind: 'reduceSub' } as const])
}

/** Deterministic input array generation, factored out so perf-corpus.json can store (seed, size) instead of literal arrays. */
export function generateInputArray(seed: number, size: number): number[] {
  const rng = mulberry32(seed)
  const input: number[] = new Array(size)
  for (let i = 0; i < size; i++) input[i] = Math.floor(rng() * 1000) - 500
  return input
}

const STREAM_KINDS: readonly StreamStepKind[] = [
  'map',
  'filter',
  'reject',
  'filterMap',
  'flatMap',
  'take',
  'drop',
  'takeWhile',
  'dropWhile',
  'scan',
]
const BOUNDARY_KINDS: readonly BoundaryStepKind[] = [
  'sort',
  'sortBy',
  'sortAsc',
  'sortDesc',
  'reverse',
  'uniq',
  'sum',
  'without',
]
// sum is scalar-producing (registry materializer, but unlike sort/reverse/uniq it can't
// feed a further stream op or sink) so it's only valid as the pipeline's last step.
const MID_BOUNDARY_KINDS: readonly BoundaryStepKind[] = [
  'sort',
  'sortBy',
  'sortAsc',
  'sortDesc',
  'reverse',
  'uniq',
  'without',
]
const SINK_KINDS: readonly SinkStepKind[] = ['count', 'reduce', 'forEach', 'find', 'every', 'some', 'toArray']

/** A step as plain JSON: opcode kind plus, where relevant, a CallbackSpec or numeric literal. */
export interface SerializedStep {
  readonly kind: StreamStepKind | SinkStepKind | BoundaryStepKind
  readonly spec?: CallbackSpec
  readonly n?: number
  readonly a1?: number
  /** without's excluded values -- the one boundary op whose bound argument is an array, not a callback or scalar. */
  readonly values?: readonly number[]
}

/** A whole pipeline as plain JSON: safe to write to pinned-corpus.json and diff in source control. */
export interface SerializedPipeline {
  readonly input: readonly number[]
  readonly holeIndices?: readonly number[]
  readonly steps: readonly SerializedStep[]
}

export interface GeneratedPipeline {
  readonly serialized: SerializedPipeline
  readonly input: number[]
  readonly desc: PipelineDesc
  readonly bindings: readonly EmitterBinding[]
  readonly realSteps: readonly unknown[]
}

export interface GenerateOptions {
  readonly minSize?: number
  readonly maxSize?: number
  readonly minOps?: number
  readonly maxOps?: number
  readonly boundaryProbability?: number
  readonly sinkProbability?: number
  /** Hard cap on worst-case elements a stream segment can produce via flatMap expansion. */
  readonly maxExpansion?: number
}

/** Generates a deterministic SerializedPipeline (plain JSON) from a seed. */
export function generateSerializedPipeline(seed: number, opts: GenerateOptions = {}): SerializedPipeline {
  const rng = mulberry32(seed)
  const minSize = opts.minSize ?? 0
  const maxSize = opts.maxSize ?? 200
  const size = int(rng, minSize, maxSize)
  const maxExpansion = opts.maxExpansion ?? 64_000

  const input: number[] = new Array(size)
  for (let i = 0; i < size; i++) input[i] = Math.floor(rng() * 1000) - 500

  const opCount = int(rng, opts.minOps ?? 0, opts.maxOps ?? 4)
  const boundaryAt = rng() < (opts.boundaryProbability ?? 0.35) && opCount > 0 ? int(rng, 0, opCount) : -1

  const kinds: Array<StreamStepKind | BoundaryStepKind> = []
  let expansionBudget = Math.max(1, Math.floor(maxExpansion / Math.max(1, size)))
  for (let i = 0; i < opCount; i++) {
    if (i === boundaryAt) kinds.push(pick(rng, MID_BOUNDARY_KINDS))
    const kind = pick(rng, STREAM_KINDS)
    kinds.push(kind)
    if (kind === 'flatMap') expansionBudget = Math.max(0, expansionBudget - 1)
  }
  if (boundaryAt === opCount && opCount > 0) kinds.push(pick(rng, BOUNDARY_KINDS))

  const last = kinds[kinds.length - 1]
  const hasSink = last !== 'sum' && rng() < (opts.sinkProbability ?? 0.5)
  if (hasSink) kinds.push(pick(rng, SINK_KINDS))

  const steps: SerializedStep[] = kinds.map((kind) => {
    const cls = randomClass(rng)
    switch (kind) {
      case 'take':
      case 'drop':
        return { kind, n: int(rng, 0, Math.max(1, Math.floor(size * 1.2))) }
      case 'map':
        return { kind, spec: mapSpec(rng, cls) }
      case 'filter':
      case 'reject':
      case 'takeWhile':
      case 'dropWhile':
      case 'count':
      case 'find':
      case 'every':
      case 'some':
        return { kind, spec: predicateSpec(rng, cls) }
      case 'filterMap':
        return { kind, spec: filterMapSpec(rng) }
      case 'flatMap':
        return { kind, spec: flatMapSpec(rng, Math.min(3, expansionBudget)) }
      case 'reduce':
      case 'scan':
        return { kind, spec: reducerSpec(rng, cls), a1: int(rng, -10, 10) }
      case 'forEach':
        return { kind, spec: { kind: 'noop' } }
      case 'sortBy':
        return { kind, spec: rng() < 0.5 ? { kind: 'sortCmpAsc' } : { kind: 'sortCmpDesc' } }
      case 'without': {
        const count = int(rng, 0, 5)
        const values: number[] = new Array(count)
        for (let i = 0; i < count; i++) values[i] = Math.floor(rng() * 1000) - 500
        return { kind, values }
      }
      default:
        return { kind }
    }
  })

  return { input, steps }
}

const REAL_STEP_BUILDERS: Record<StreamStepKind, (b: EmitterBinding) => unknown> = {
  map: (b) => A.map(b.fn as (x: number) => number),
  filter: (b) => A.filter(b.fn as (x: number) => boolean),
  reject: (b) => A.reject(b.fn as (x: number) => boolean),
  filterMap: (b) => A.filterMap(b.fn as (x: number) => number | undefined),
  flatMap: (b) => A.flatMap(b.fn as (x: number) => number[]),
  take: (b) => A.take(b.fn as number),
  drop: (b) => A.drop(b.fn as number),
  takeWhile: (b) => A.takeWhile(b.fn as (x: number) => boolean),
  dropWhile: (b) => A.dropWhile(b.fn as (x: number) => boolean),
  scan: (b) => A.scan(b.fn as (acc: number, x: number) => number, b.a1 as number),
}
const REAL_SINK_BUILDERS: Record<Exclude<SinkStepKind, 'toArray'>, (b: EmitterBinding) => unknown> = {
  count: (b) => A.count(b.fn as (x: number) => boolean),
  reduce: (b) => A.reduce(b.fn as (acc: number, x: number) => number, b.a1 as number),
  forEach: (b) => A.forEach(b.fn as (x: number) => void),
  find: (b) => A.find(b.fn as (x: number) => boolean),
  every: (b) => A.every(b.fn as (x: number) => boolean),
  some: (b) => A.some(b.fn as (x: number) => boolean),
}
const REAL_BOUNDARY_BUILDERS: Record<BoundaryStepKind, (b: EmitterBinding) => unknown> = {
  sort: () => A.sort,
  sortBy: (b) => A.sortBy(b.fn as (a: number, b: number) => number),
  sortAsc: () => A.sortAsc,
  sortDesc: () => A.sortDesc,
  reverse: () => A.reverse,
  uniq: () => A.uniq,
  sum: () => A.sum,
  without: (b) => A.without(b.fn as readonly number[]),
}

function isBoundaryOnlyNoArg(
  kind: StreamStepKind | BoundaryStepKind | SinkStepKind,
): kind is 'sort' | 'sortAsc' | 'sortDesc' | 'reverse' | 'uniq' | 'sum' {
  return kind === 'sort' || kind === 'sortAsc' || kind === 'sortDesc' || kind === 'reverse' || kind === 'uniq' || kind === 'sum'
}

/** Wraps a raw callback before it's bound into a step, e.g. to log invocation order for the fuzz test. */
export type CallbackWrapper = (fn: unknown, stepIndex: number, kind: SerializedStep['kind']) => unknown

/** Resolves a SerializedPipeline (plain JSON) into concrete bindings + real tagged steps. */
export function resolvePipeline(serialized: SerializedPipeline, wrap?: CallbackWrapper): GeneratedPipeline {
  const input = serialized.input.slice()
  if (serialized.holeIndices) {
    for (const i of serialized.holeIndices) delete input[i]
  }

  const steps: PipelineDesc['steps'] = []
  const bindings: EmitterBinding[] = []
  const realSteps: unknown[] = []

  serialized.steps.forEach((s, stepIndex) => {
    const wrapFn = (fn: unknown): unknown => (wrap ? wrap(fn, stepIndex, s.kind) : fn)
    let binding: EmitterBinding
    if (s.kind === 'take' || s.kind === 'drop') {
      binding = { fn: s.n }
    } else if (s.kind === 'reduce' || s.kind === 'scan') {
      binding = { fn: wrapFn(buildCallback(s.spec!)), a1: s.a1 }
    } else if (s.kind === 'without') {
      binding = { fn: s.values ?? [] }
    } else if (s.spec) {
      binding = { fn: wrapFn(buildCallback(s.spec)) }
    } else {
      binding = {}
    }

    steps.push({ kind: s.kind })
    bindings.push(binding)

    if (s.kind === 'toArray') return
    if (isBoundaryOnlyNoArg(s.kind)) realSteps.push(REAL_BOUNDARY_BUILDERS[s.kind](binding))
    else if (s.kind === 'sortBy' || s.kind === 'without') realSteps.push(REAL_BOUNDARY_BUILDERS[s.kind](binding))
    else if (s.kind === 'reduce' || s.kind === 'forEach' || s.kind === 'count' || s.kind === 'find' || s.kind === 'every' || s.kind === 'some')
      realSteps.push(REAL_SINK_BUILDERS[s.kind](binding))
    else realSteps.push(REAL_STEP_BUILDERS[s.kind as StreamStepKind](binding))
  })

  return { serialized, input, desc: { steps }, bindings, realSteps }
}

/** Generates a full resolved pipeline directly from a seed. */
export function generatePipeline(seed: number, opts: GenerateOptions = {}): GeneratedPipeline {
  return resolvePipeline(generateSerializedPipeline(seed, opts))
}
