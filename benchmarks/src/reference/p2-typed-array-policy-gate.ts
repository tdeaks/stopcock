/**
 * P2 typed-array policy characterization.
 *
 * The production code has to choose, per operation, between calling a stashed
 * engine intrinsic and running an element loop. That choice is not obvious: the
 * intrinsic wins on bulk work and loses on short views where the call itself is
 * most of the cost, and the crossover is not the same on every engine or for
 * every element family. This lab measures the candidates so the choice is made
 * from evidence rather than from a guess about what engines do.
 *
 * Every strategy is timed against a hand-written native reference measured in
 * the same process, and each row's number is the median of per-session ratios.
 * A cross-process denominator was already rejected in S4: it moves every row
 * together when the machine drifts and reports regressions that are not there.
 *
 * Nothing here selects a production strategy on its own, and this ranking is
 * not on its own sufficient to change one. A lab kernel is not the production
 * kernel: the lab put the element loop at 0.81x the intrinsic for a short
 * slice, and swapping the production code to match measured a 20% loss. Any
 * candidate that ranks well here still has to win an A/B of the real exported
 * functions before it may ship. `P2_DISPOSITIONS` records the outcome for
 * every row, and the accompanying test checks that record against the policy
 * that `packages/fp/src/typed-array.ts` actually carries.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import {
  inspectCanonicalView,
  type TypedArrayFamily,
} from '../../../packages/fp/src/internal/typed-array-view'
import { PERF_PROFILE_ENV } from './perf-profile-contract'
import { describeHost, resolveProfile } from './perf-profile-gate'
import { consumedItemsMicroBatchIterations, runInterleavedPaired } from './perf-runner'

export const GATE_ID = 'stopcock-p2-typed-array-policy-v1'

/**
 * Coarse size bands. The policy may only key on a band, never on an exact
 * length: a per-length rule is unfalsifiable with this much corpus and would
 * put a comparison the engine cannot predict in front of every call.
 */
export const SIZE_BANDS = Object.freeze([
  Object.freeze({ id: 'tiny', size: 32 } as const),
  Object.freeze({ id: 'small', size: 1_024 } as const),
  Object.freeze({ id: 'bulk', size: 65_536 } as const),
])
export type SizeBandId = (typeof SIZE_BANDS)[number]['id']

export const OPERATIONS = Object.freeze([
  'clone',
  'slice',
  'reverse',
  'sort',
  'filter',
  'copyInto',
  'concat',
] as const)
export type OperationId = (typeof OPERATIONS)[number]

/**
 * Strategies actually available to the production code. `native` is the
 * reference, not a candidate: the public operations may not return an engine
 * result whose constructor came from `Symbol.species`.
 */
export const STRATEGIES = Object.freeze({
  clone: Object.freeze(['intrinsic-slice', 'element-loop', 'bulk-set'] as const),
  slice: Object.freeze(['intrinsic-slice', 'element-loop'] as const),
  reverse: Object.freeze(['intrinsic-slice-reverse', 'element-loop'] as const),
  sort: Object.freeze(['intrinsic-slice-sort', 'scratch-sort'] as const),
  filter: Object.freeze(['array-staging', 'typed-scratch'] as const),
  copyInto: Object.freeze(['intrinsic-set', 'element-loop'] as const),
  concat: Object.freeze(['intrinsic-set', 'element-loop'] as const),
})
export type StrategyId = (typeof STRATEGIES)[OperationId][number]

/** Predicate selectivity is characterized, never used to select. See the manifest. */
export const SELECTIVITIES = Object.freeze([0, 0.25, 0.5, 0.75, 1] as const)
export type Selectivity = (typeof SELECTIVITIES)[number]

interface FamilyDescriptor {
  readonly family: TypedArrayFamily
  readonly bigint: boolean
  readonly construct: (length: number) => AnyView
}

type AnyView = {
  readonly length: number
  readonly constructor: unknown
  [index: number]: number | bigint
}

const optionalFloat16 = Reflect.get(globalThis, 'Float16Array') as
  | (new (length: number) => AnyView)
  | undefined

const numberFamily = (
  family: TypedArrayFamily,
  Constructor: new (length: number) => AnyView,
): FamilyDescriptor => ({
  family,
  bigint: false,
  construct: (length) => {
    const view = new Constructor(length)
    for (let index = 0; index < length; index++) view[index] = ((index * 17) % 97) - 48
    return view
  },
})

const bigIntFamily = (
  family: TypedArrayFamily,
  Constructor: new (length: number) => AnyView,
): FamilyDescriptor => ({
  family,
  bigint: true,
  construct: (length) => {
    const view = new Constructor(length)
    for (let index = 0; index < length; index++) view[index] = BigInt(((index * 17) % 97) - 48)
    return view
  },
})

/** Only families this realm has. Float16Array is probed, never assumed. */
export const FAMILIES: readonly FamilyDescriptor[] = Object.freeze([
  numberFamily('int8', Int8Array as never),
  numberFamily('uint8', Uint8Array as never),
  numberFamily('uint8clamped', Uint8ClampedArray as never),
  numberFamily('int16', Int16Array as never),
  numberFamily('uint16', Uint16Array as never),
  numberFamily('int32', Int32Array as never),
  numberFamily('uint32', Uint32Array as never),
  ...(optionalFloat16 === undefined ? [] : [numberFamily('float16', optionalFloat16)]),
  numberFamily('float32', Float32Array as never),
  numberFamily('float64', Float64Array as never),
  bigIntFamily('bigint64', BigInt64Array as never),
  bigIntFamily('biguint64', BigUint64Array as never),
])

export const FAMILY_IDS: readonly TypedArrayFamily[] = Object.freeze(
  FAMILIES.map((entry) => entry.family),
)

// --- view kinds -------------------------------------------------------------

/**
 * Every view shape the public operations can be handed. Only `canonical`
 * may take an intrinsic strategy; the rest are here so the fallback is
 * characterized rather than assumed.
 */
export const VIEW_KINDS = Object.freeze([
  'canonical',
  'subclass',
  'own-constructor',
  'shared-buffer',
  'resizable',
  'length-tracking',
  'detached',
  'cross-realm',
  'proxy',
] as const)
export type ViewKindId = (typeof VIEW_KINDS)[number]

export interface ViewKindFact {
  readonly kind: ViewKindId
  readonly available: boolean
  /** Whether the inspection seam admits it as a canonical view. */
  readonly canonical: boolean
  readonly note: string
}

const crossRealmUint8 = (): AnyView | undefined => {
  try {
    // A real second realm. The only fact needed is a typed array whose
    // prototype is not this realm's.
    return runInNewContext('new Uint8Array([1,2,3,4])') as AnyView
  } catch {
    return undefined
  }
}

/**
 * Observes the inspection seam against every view shape. This is a semantic
 * fact, not a timing one, so it runs in the coordinator process.
 */
export const inspectViewKinds = (): readonly ViewKindFact[] => {
  const fact = (
    kind: ViewKindId,
    value: object | undefined,
    note: string,
    override?: boolean,
  ): ViewKindFact => ({
    kind,
    available: value !== undefined,
    canonical:
      override ?? (value === undefined ? false : inspectCanonicalView(value) !== undefined),
    note,
  })

  class Subclassed extends Uint8Array {}
  const ownConstructor = new Uint8Array([1, 2, 3])
  Object.defineProperty(ownConstructor, 'constructor', { configurable: true, value: Uint8Array })

  const shared = new Uint8Array(new SharedArrayBuffer(8))

  // Probed, not assumed: resizable buffers are absent on older engines and on
  // TypeScript libs that predate them, so neither the method nor the second
  // constructor argument may be referenced through the static types.
  const resizableSupported = typeof Reflect.get(ArrayBuffer.prototype, 'resize') === 'function'
  const ResizableArrayBuffer = ArrayBuffer as unknown as new (
    byteLength: number,
    options: { maxByteLength: number },
  ) => ArrayBuffer
  const resizableBuffer = resizableSupported
    ? new ResizableArrayBuffer(8, { maxByteLength: 16 })
    : undefined
  const resizable =
    resizableBuffer === undefined ? undefined : new Uint8Array(resizableBuffer, 0, 8)
  const lengthTracking = resizableBuffer === undefined ? undefined : new Uint8Array(resizableBuffer)

  const detached = new Uint8Array([1, 2, 3])
  structuredClone(detached.buffer, { transfer: [detached.buffer] })

  const proxied = new Proxy(new Uint8Array([1, 2, 3]), {})

  return Object.freeze([
    fact('canonical', new Uint8Array(4), 'plain current-realm view; intrinsic strategies allowed'),
    fact('subclass', new Subclassed(4), 'foreign prototype; concrete constructor preserved'),
    fact(
      'own-constructor',
      ownConstructor,
      'own constructor is honoured, so the intrinsic result would be wrong',
    ),
    fact(
      'shared-buffer',
      shared,
      'canonical view, but allocation reallocates onto a plain ArrayBuffer',
    ),
    fact('resizable', resizable, 'fixed-length view over a resizable buffer'),
    fact('length-tracking', lengthTracking, 'length is re-read every iteration'),
    fact('detached', detached, 'length reads as 0; intrinsics throw exactly as native does'),
    fact('cross-realm', crossRealmUint8(), 'foreign prototype; never canonical'),
    fact(
      'proxy',
      proxied,
      'prototype is forwarded, but the intrinsic throws TypeError exactly as native does',
    ),
  ])
}

// --- timing -----------------------------------------------------------------

const medianOf = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((l, r) => l - r)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

let sink = 0
const observe = (candidate: unknown, reference: unknown): void => {
  for (const value of [candidate, reference]) {
    sink = (sink + (typeof value === 'boolean' ? 1 : (value as AnyView).length)) | 0
  }
}

/**
 * One operation on a short view is well under this machine's clock resolution
 * (~41 ns), so every sample batches and the result is reported per operation.
 */
const batchFor = (size: number): number => (size >= 65_536 ? 8 : size >= 1_024 ? 64 : 1_024)

// --- strategy kernels -------------------------------------------------------

const slice = Reflect.get(Uint8Array.prototype, 'slice') as (
  this: unknown,
  start?: number,
  end?: number,
) => AnyView
const setInto = Reflect.get(Uint8Array.prototype, 'set') as (
  this: unknown,
  source: unknown,
  offset?: number,
) => void
const reverseIn = Reflect.get(Uint8Array.prototype, 'reverse') as (this: unknown) => AnyView
const sortIn = Reflect.get(Uint8Array.prototype, 'sort') as (this: unknown) => AnyView

/**
 * Mirrors `allocateLike` in the production module: one shared function that
 * dispatches on constructor identity and then constructs concretely. Reaching
 * straight through `source.constructor` instead would measure a kernel the
 * production code does not run and would flatter every intrinsic strategy.
 */
const allocate = (source: AnyView, length: number): AnyView => {
  const Constructor: unknown = source.constructor
  if (Constructor === Float64Array) return new Float64Array(length) as never
  if (optionalFloat16 !== undefined && Constructor === optionalFloat16) {
    return new optionalFloat16(length)
  }
  if (Constructor === Float32Array) return new Float32Array(length) as never
  if (Constructor === Uint32Array) return new Uint32Array(length) as never
  if (Constructor === Int32Array) return new Int32Array(length) as never
  if (Constructor === Uint16Array) return new Uint16Array(length) as never
  if (Constructor === Int16Array) return new Int16Array(length) as never
  if (Constructor === Uint8ClampedArray) return new Uint8ClampedArray(length) as never
  if (Constructor === Uint8Array) return new Uint8Array(length) as never
  if (Constructor === Int8Array) return new Int8Array(length) as never
  if (Constructor === BigInt64Array) return new BigInt64Array(length) as never
  if (Constructor === BigUint64Array) return new BigUint64Array(length) as never
  return new (Constructor as new (length: number) => AnyView)(length)
}

type KernelSet = Readonly<Record<string, () => unknown>>

/**
 * Builds every strategy for one row at once. Where a strategy is literally the
 * native kernel, both names get the same function object: two identical
 * closures tier up independently and report that as double-digit noise, which
 * is exactly the mistake the profile gate warns about.
 */
const makeKernels = (
  operation: OperationId,
  descriptor: FamilyDescriptor,
  size: number,
  selectivity: Selectivity,
): KernelSet => {
  const source = descriptor.construct(size)
  const other = descriptor.construct(size)
  const target = allocate(source, size + 4)
  const start = size >> 2
  const end = size - start
  const threshold = descriptor.bigint
    ? BigInt(Math.round(-48 + 97 * selectivity))
    : -48 + 97 * selectivity
  const predicate = (value: number | bigint): boolean => (value as number) < (threshold as number)

  switch (operation) {
    case 'clone': {
      const intrinsic = () => slice.call(source)
      return {
        native: intrinsic,
        'intrinsic-slice': intrinsic,
        'element-loop': () => {
          const result = allocate(source, size)
          for (let index = 0; index < size; index++) result[index] = source[index] as number
          return result
        },
        'bulk-set': () => {
          const result = allocate(source, size)
          setInto.call(result, source)
          return result
        },
      }
    }
    case 'slice': {
      const intrinsic = () => slice.call(source, start, end)
      return {
        native: intrinsic,
        'intrinsic-slice': intrinsic,
        'element-loop': () => {
          const length = end - start
          const result = allocate(source, length)
          for (let index = 0; index < length; index++) {
            result[index] = source[start + index] as number
          }
          return result
        },
      }
    }
    case 'reverse': {
      const intrinsic = () => {
        const result = slice.call(source)
        reverseIn.call(result)
        return result
      }
      return {
        native: intrinsic,
        'intrinsic-slice-reverse': intrinsic,
        'element-loop': () => {
          const result = allocate(source, size)
          for (let index = 0; index < size; index++) {
            result[index] = source[size - index - 1] as number
          }
          return result
        },
      }
    }
    case 'sort': {
      const intrinsic = () => {
        const result = slice.call(source)
        sortIn.call(result)
        return result
      }
      return {
        native: intrinsic,
        'intrinsic-slice-sort': intrinsic,
        'scratch-sort': () => {
          const scratch = allocate(source, size)
          setInto.call(scratch, source)
          sortIn.call(scratch)
          const result = allocate(source, size)
          setInto.call(result, scratch)
          return result
        },
      }
    }
    case 'filter':
      return {
        native: () => (source as unknown as number[]).filter(predicate as never),
        'array-staging': () => {
          const values: (number | bigint)[] = []
          for (let index = 0; index < size; index++) {
            const value = source[index] as number
            if (predicate(value)) values.push(value)
          }
          const result = allocate(source, values.length)
          for (let index = 0; index < values.length; index++) {
            result[index] = values[index] as number
          }
          return result
        },
        'typed-scratch': () => {
          const scratch = allocate(source, size)
          let written = 0
          for (let index = 0; index < size; index++) {
            const value = source[index] as number
            if (predicate(value)) scratch[written++] = value
          }
          const result = allocate(source, written)
          setInto.call(result, (scratch as unknown as Uint8Array).subarray(0, written))
          return result
        },
      }
    case 'copyInto': {
      const intrinsic = () => {
        setInto.call(target, source, 2)
        return target
      }
      return {
        native: intrinsic,
        'intrinsic-set': intrinsic,
        'element-loop': () => {
          for (let index = 0; index < size; index++) {
            target[index + 2] = source[index] as number
          }
          return target
        },
      }
    }
    case 'concat': {
      const intrinsic = () => {
        const result = allocate(source, size * 2)
        setInto.call(result, source)
        setInto.call(result, other, size)
        return result
      }
      return {
        native: intrinsic,
        'intrinsic-set': intrinsic,
        'element-loop': () => {
          const result = allocate(source, size * 2)
          let written = 0
          for (let index = 0; index < size; index++) result[written++] = source[index] as number
          for (let index = 0; index < size; index++) result[written++] = other[index] as number
          return result
        },
      }
    }
  }
}

// --- corpus -----------------------------------------------------------------

export interface CharacterizationKey {
  readonly family: TypedArrayFamily
  readonly band: SizeBandId
  readonly operation: OperationId
  readonly selectivity: Selectivity
}

export const keyId = (key: CharacterizationKey): string =>
  `${key.family}/${key.band}/${key.operation}/${key.selectivity}`

/**
 * Selectivity only varies for `filter`. Every other operation records the
 * single sentinel value so the corpus stays a clean product and every row
 * appears exactly once.
 */
export const makeCorpus = (
  families: readonly TypedArrayFamily[] = FAMILY_IDS,
): readonly CharacterizationKey[] => {
  const rows: CharacterizationKey[] = []
  for (const family of families) {
    for (const band of SIZE_BANDS) {
      for (const operation of OPERATIONS) {
        const selectivities = operation === 'filter' ? SELECTIVITIES : ([0.5] as const)
        for (const selectivity of selectivities) {
          rows.push({ family, band: band.id, operation, selectivity })
        }
      }
    }
  }
  return Object.freeze(rows)
}

export interface StrategyRow {
  readonly strategy: StrategyId
  /** Native cost divided by strategy cost, measured in one process. Higher is faster. */
  readonly ratioToNative: number
  readonly perOperationNs: number
  readonly ciLow: number
  readonly ciHigh: number
}

export interface CharacterizationRow extends CharacterizationKey {
  readonly nativeNs: number
  readonly strategies: readonly StrategyRow[]
  readonly best: StrategyId
}

const sizeOf = (band: SizeBandId): number =>
  (SIZE_BANDS.find((entry) => entry.id === band) as { size: number }).size

export const measureRow = (key: CharacterizationKey, rounds: number): CharacterizationRow => {
  const descriptor = FAMILIES.find((entry) => entry.family === key.family)
  if (descriptor === undefined) throw new Error(`unknown family ${key.family}`)
  const size = sizeOf(key.band)
  const kernels = makeKernels(key.operation, descriptor, size, key.selectivity)
  const native = kernels['native'] as () => unknown
  const batchIterations = batchFor(size)
  const microBatchIterations = consumedItemsMicroBatchIterations(size, batchIterations)

  let nativeNs = 0
  const strategies: StrategyRow[] = []
  for (const strategy of STRATEGIES[key.operation]) {
    const kernel = kernels[strategy]
    if (kernel === undefined) continue
    // Every candidate is paired against a freshly measured native reference in
    // ABBA micro-batches, so machine drift and CPU ramp divide out inside the
    // ratio instead of ranking whichever strategy happened to run second.
    const measured = runInterleavedPaired(kernel, native, {
      rounds,
      warmupRounds: Math.max(8, rounds),
      batchIterations,
      microBatchIterations,
      observe,
    })
    nativeNs = medianOf(measured.bSamples) / batchIterations
    strategies.push({
      strategy,
      perOperationNs: medianOf(measured.aSamples) / batchIterations,
      ratioToNative: measured.medianRatio,
      ciLow: measured.ciLow,
      ciHigh: measured.ciHigh,
    })
  }
  const best = strategies.reduce((left, right) =>
    right.ratioToNative > left.ratioToNative ? right : left,
  )
  return { ...key, nativeNs, strategies: Object.freeze(strategies), best: best.strategy }
}

// --- dispositions -----------------------------------------------------------

export type Decision = 'shipped' | 'generic-fallback' | 'stopped'

export interface Disposition {
  readonly id: string
  readonly decision: Decision
  readonly reason: string
}

/**
 * A rule covers a rectangle of the corpus. Selectivity is deliberately not a
 * rule axis: it is not knowable before a one-pass filter runs, so it may
 * characterize a row but may never select one.
 */
export interface DispositionRule {
  readonly operations: readonly OperationId[]
  readonly bands: readonly SizeBandId[]
  readonly families: 'all' | 'number' | 'bigint'
  readonly decision: Decision
  readonly reason: string
}

const BIGINT_FAMILIES: readonly TypedArrayFamily[] = Object.freeze(['bigint64', 'biguint64'])

const coversFamily = (rule: DispositionRule, family: TypedArrayFamily): boolean =>
  rule.families === 'all' || (rule.families === 'bigint') === BIGINT_FAMILIES.includes(family)

export const covers = (rule: DispositionRule, key: CharacterizationKey): boolean =>
  rule.operations.includes(key.operation) &&
  rule.bands.includes(key.band) &&
  coversFamily(rule, key.family)

const ALL_BANDS: readonly SizeBandId[] = Object.freeze(['tiny', 'small', 'bulk'])
const BULKY: readonly SizeBandId[] = Object.freeze(['small', 'bulk'])

const rule = (value: DispositionRule): DispositionRule => Object.freeze(value)

/**
 * The complete P2 record. Ratios are medians of per-session ratios against a
 * hand-written native reference measured in the same process, with the family
 * isolated to its own process; JSC is Bun 1.3.14 and V8 is Node 24.18.0, whose
 * numbers are canary and cannot carry a release claim.
 *
 * The measured noise floor for this corpus is the spread of the rows where the
 * candidate *is* the native reference: 0.83-1.21 on JSC and 0.85-1.16 on V8.
 * No claim below that spread is acted on.
 */
export const P2_DISPOSITION_RULES: readonly DispositionRule[] = Object.freeze([
  rule({
    operations: ['clone'],
    bands: ALL_BANDS,
    families: 'all',
    decision: 'generic-fallback',
    reason:
      'a canonical view already takes the stashed slice intrinsic at 0.98-1.01x native at every band, so there is nothing to change there. Dropping the size band from the non-canonical fallback was measured and rejected: against the pre-change module it ran 0.82-0.86x on a Float64Array subclass and 2.0-3.8x on a Uint8Array subclass in the same session, which is a family-keyed rule that this measurement quality cannot justify',
  }),
  rule({
    operations: ['slice', 'reverse'],
    bands: ALL_BANDS,
    families: 'all',
    decision: 'stopped',
    reason:
      'dropping the size band so a short canonical view always takes the intrinsic is rejected on measurement. The lab ranked the element loop at 0.81x (slice) and 0.63x (reverse) of the intrinsic, but the production A/B on Bun 1.3.14 moved a 64-element Float64Array from 0.98x to 0.78x its frozen baseline for slice and 1.10x to 0.93x for reverse, reproducibly across three runs each. The lab kernel allocates through a shared helper and is not the production kernel; where they disagree the production A/B is what counts',
  }),
  rule({
    operations: ['copyInto'],
    bands: ALL_BANDS,
    families: 'all',
    decision: 'generic-fallback',
    reason:
      'already the set intrinsic at every band and family, measured at 0.96-1.00x native; the element loop alternative runs 0.28x/0.08x/0.05x and there is no second candidate to weigh',
  }),
  rule({
    operations: ['concat'],
    bands: ALL_BANDS,
    families: 'all',
    decision: 'stopped',
    reason:
      'removing the sub-128-element loop is rejected on measurement. Against the pre-change module in one session it ran 2.4x for Uint8Array and 0.82-0.87x for Float64Array, and the per-session values for a single float64 row spanned 0.71-1.09. Splitting the policy by element width on that evidence would be an over-fit',
  }),
  rule({
    operations: ['sort'],
    bands: ALL_BANDS,
    families: 'all',
    decision: 'generic-fallback',
    reason:
      'the intrinsic already wins at every band (a scratch copy measures 0.84x/0.95x/0.98x), and the NaN and signed-zero pre-scan in front of it is a semantic requirement rather than a strategy P2 may replace',
  }),
  rule({
    operations: ['filter'],
    bands: ['tiny'],
    families: 'number',
    decision: 'generic-fallback',
    reason:
      'array staging is the measured winner at 32 elements for every numeric family on both engines; typed scratch loses 4-82% and never has a confidence interval above it',
  }),
  rule({
    operations: ['filter'],
    bands: BULKY,
    families: 'number',
    decision: 'generic-fallback',
    reason:
      'typed scratch is already the shipped strategy above 128 elements and is the measured winner for every numeric family on JSC by 55-82%; the three V8 rows that prefer array staging (uint8, uint16, uint32 at 1024) are canary and reverse sign on JSC',
  }),
  rule({
    operations: ['filter'],
    bands: ALL_BANDS,
    families: 'bigint',
    decision: 'stopped',
    reason:
      'no available strategy reaches the 0.85x native target on JSC: bigint64 measures 0.86x/0.83x/0.83x at half selectivity and 0.71x/0.72x/0.73x when every element passes. The Bun BigInt replacement is rejected on its own bar, measuring -11.8%/+1.2%/+1.8% against the 10%-improvement-with-confidence-interval-above-parity requirement. Native filter keeps each element unboxed across the predicate call, which no userland one-pass predicate can do; closing this needs an API that P2 does not have',
  }),
])

export const dispositionFor = (
  key: CharacterizationKey,
  rules: readonly DispositionRule[] = P2_DISPOSITION_RULES,
): Disposition | undefined => {
  const matched = rules.filter((rule) => covers(rule, key))
  if (matched.length !== 1) return undefined
  const rule = matched[0] as DispositionRule
  return { id: keyId(key), decision: rule.decision, reason: rule.reason }
}

/** The manifest itself: one explicit row per characterization key. */
export const P2_DISPOSITIONS: readonly Disposition[] = Object.freeze(
  makeCorpus()
    .map((key) => dispositionFor(key))
    .filter((row): row is Disposition => row !== undefined),
)

/**
 * Runtime bands the production policy knows about. Everything else — an older
 * Bun, a newer Node, a browser, a runtime that does not exist yet — resolves to
 * `generic`, which is the behaviour that shipped before this stage.
 */
export const RUNTIME_BANDS = Object.freeze(['bun-1.3', 'node-24', 'generic'] as const)
export type RuntimeBandId = (typeof RUNTIME_BANDS)[number]

/**
 * A Bun BigInt replacement has to clear 10% improvement with its confidence
 * interval wholly above parity before it may ship. This is that bar, not a
 * hopeful target.
 */
export const BIGINT_REPLACEMENT_MINIMUM_IMPROVEMENT = 0.1

export const evaluateDispositions = (
  dispositions: readonly Disposition[],
  corpus: readonly CharacterizationKey[],
): string[] => {
  const failures: string[] = []
  const byId = new Map(dispositions.map((row) => [row.id, row]))

  if (byId.size !== dispositions.length) failures.push('dispositions contain a duplicate id')

  // Exactly one rule must claim each row: zero leaves a row undecided, more
  // than one makes the manifest ambiguous about which reason applies.
  for (const key of corpus) {
    const matched = P2_DISPOSITION_RULES.filter((rule) => covers(rule, key))
    if (matched.length !== 1) {
      failures.push(`${keyId(key)} is covered by ${matched.length} rules, expected exactly 1`)
    }
  }

  for (const key of corpus) {
    const id = keyId(key)
    const row = byId.get(id)
    if (row === undefined) {
      failures.push(`characterization row ${id} has no recorded disposition`)
      continue
    }
    if (row.reason.trim().length === 0) failures.push(`${id} has an empty reason`)
  }
  for (const row of dispositions) {
    if (!corpus.some((key) => keyId(key) === row.id)) {
      failures.push(`disposition ${row.id} is not a characterization row`)
    }
  }

  // Selectivity is not knowable before a one-pass filter runs, so it may not
  // change the strategy. Every selectivity row under one production key has to
  // land on the same decision.
  const bySelectivityKey = new Map<string, Set<Decision>>()
  for (const key of corpus) {
    const row = byId.get(keyId(key))
    if (row === undefined) continue
    const productionKey = `${key.family}/${key.band}/${key.operation}`
    const decisions = bySelectivityKey.get(productionKey) ?? new Set<Decision>()
    decisions.add(row.decision)
    bySelectivityKey.set(productionKey, decisions)
  }
  for (const [productionKey, decisions] of bySelectivityKey) {
    if (decisions.size > 1) {
      failures.push(
        `${productionKey} resolves ${decisions.size} different decisions across selectivity`,
      )
    }
  }

  return failures
}

/** The strategy name that means "keep what shipped before". */
export const CONSERVATIVE_STRATEGY = 'size-banded'

/**
 * P2 shipped no strategy, so no disposition may claim it did. The production
 * module carries no policy table to parse: parsing source for this was brittle
 * enough that the formatter broke it once. If a strategy ever ships, the
 * production constant and this check flip together.
 */
export const evaluateShippedClaims = (
  dispositions: readonly Disposition[] = P2_DISPOSITIONS,
): string[] =>
  dispositions
    .filter((row) => row.decision === 'shipped')
    .map((row) => `${row.id} claims shipped while no typed-array strategy is enabled`)

// --- runner -----------------------------------------------------------------

/**
 * One process per family, never one process for the whole corpus.
 *
 * The allocator and the predicate are shared call sites. Measuring twelve
 * families through them in one process leaves those sites megamorphic, and the
 * filter rows then report engine deoptimization instead of strategy cost: the
 * same float32 row measured 0.65x that way and 1.84x with the family isolated.
 * Real callers work in one or two families, so the isolated number is both the
 * honest one and the representative one.
 */
const SESSION_ENV = 'STOPCOCK_P2_FAMILY'
const self = fileURLToPath(import.meta.url)
const childArgv = (): string[] =>
  typeof process.versions.bun === 'string' ? [self] : ['--import=tsx', self]

export const SESSIONS = 3
const ROUNDS_PER_ROW = 9

interface SessionResult {
  readonly rows: readonly CharacterizationRow[]
}

/**
 * The opening rows in a fresh process measure tier-up and the CPU ramping, not
 * throughput: the very first row was reproducibly reporting an element loop at
 * 1.3x the same-closure native reference. Discard a fixed prelude rather than
 * widen anything downstream to hide it.
 */
const PRELUDE: CharacterizationKey = {
  family: 'uint8',
  band: 'small',
  operation: 'clone',
  selectivity: 0.5,
}

const runSession = (corpus: readonly CharacterizationKey[]): SessionResult => {
  measureRow(PRELUDE, ROUNDS_PER_ROW)
  measureRow(PRELUDE, ROUNDS_PER_ROW)
  return { rows: corpus.map((key) => measureRow(key, ROUNDS_PER_ROW)) }
}

/**
 * For most operations one candidate strategy *is* the native reference, run
 * through the same function object. Its ratio can only be 1 plus measurement
 * error, so the worst such row is this run's noise floor, and no strategy
 * claim smaller than it means anything.
 */
export const IDENTITY_STRATEGIES: Readonly<Partial<Record<OperationId, StrategyId>>> =
  Object.freeze({
    clone: 'intrinsic-slice',
    slice: 'intrinsic-slice',
    reverse: 'intrinsic-slice-reverse',
    sort: 'intrinsic-slice-sort',
    copyInto: 'intrinsic-set',
    concat: 'intrinsic-set',
  })

export const noiseFloor = (rows: readonly CharacterizationRow[]): number => {
  let worst = 0
  for (const row of rows) {
    const identity = IDENTITY_STRATEGIES[row.operation]
    if (identity === undefined) continue
    const measured = row.strategies.find((entry) => entry.strategy === identity)
    if (measured === undefined) continue
    worst = Math.max(worst, Math.abs(measured.ratioToNative - 1))
  }
  return worst
}

const runSessions = (family: TypedArrayFamily): CharacterizationRow[] => {
  const corpus = makeCorpus([family])
  const perSession: SessionResult[] = []
  for (let session = 0; session < SESSIONS; session++) {
    const child = spawnSync(process.execPath, childArgv(), {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, [SESSION_ENV]: family },
    })
    if (child.status !== 0) throw new Error(`${family} session ${session} failed: ${child.stderr}`)
    perSession.push(JSON.parse(child.stdout) as SessionResult)
  }

  return corpus.map((key, index) => {
    const samples = perSession.map((session) => session.rows[index] as CharacterizationRow)
    const strategies = STRATEGIES[key.operation].map((strategy) => {
      // Median of per-session ratios, never a ratio of pooled medians: each
      // ratio comes from one process, so machine drift divides out inside it.
      const ratios = samples.map(
        (row) =>
          (row.strategies.find((entry) => entry.strategy === strategy) as StrategyRow)
            .ratioToNative,
      )
      const ns = samples.map(
        (row) =>
          (row.strategies.find((entry) => entry.strategy === strategy) as StrategyRow)
            .perOperationNs,
      )
      const of = (pick: (row: StrategyRow) => number): number[] =>
        samples.map((row) =>
          pick(row.strategies.find((entry) => entry.strategy === strategy) as StrategyRow),
        )
      return {
        strategy,
        ratioToNative: medianOf(ratios),
        perOperationNs: medianOf(ns),
        // The most pessimistic session bound, so a claim of "wholly above
        // parity" cannot be carried by one lucky process.
        ciLow: Math.min(...of((row) => row.ciLow)),
        ciHigh: Math.max(...of((row) => row.ciHigh)),
      }
    })
    const best = strategies.reduce((left, right) =>
      right.ratioToNative > left.ratioToNative ? right : left,
    )
    return {
      ...key,
      nativeNs: medianOf(samples.map((row) => row.nativeNs)),
      strategies: Object.freeze(strategies),
      best: best.strategy,
    }
  })
}

const main = (): void => {
  const requested = process.env[SESSION_ENV]
  if (requested !== undefined) {
    process.stdout.write(JSON.stringify(runSession(makeCorpus([requested as TypedArrayFamily]))))
    return
  }

  const corpus = makeCorpus()
  const rows = FAMILY_IDS.flatMap(runSessions)
  console.log(`noise floor (identity rows): ${(noiseFloor(rows) * 100).toFixed(1)}%`)
  for (const row of rows) {
    console.log(
      [
        keyId(row),
        `native ${row.nativeNs.toFixed(1)} ns`,
        ...row.strategies.map((entry) => `${entry.strategy} ${entry.ratioToNative.toFixed(3)}x`),
        `best ${row.best}`,
      ].join('\t'),
    )
  }
  for (const fact of inspectViewKinds()) {
    console.log(
      `view\t${fact.kind}\t${fact.available ? 'available' : 'unavailable'}\t${
        fact.canonical ? 'canonical' : 'generic'
      }\t${fact.note}`,
    )
  }

  const failures = [...evaluateDispositions(P2_DISPOSITIONS, corpus), ...evaluateShippedClaims()]
  const resolution = resolveProfile(describeHost(), process.env[PERF_PROFILE_ENV])
  const label = resolution.releaseEvidenceEligible ? 'FAIL' : 'CANARY'
  for (const failure of failures) console.error(`${label}\t${failure}`)
  console.log(`sink=${sink}`)
  if (failures.length > 0 && resolution.releaseEvidenceEligible) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === self) main()
