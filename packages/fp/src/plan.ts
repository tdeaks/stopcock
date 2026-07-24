// Plan IR: the shared representation portable compile, JIT, and the
// reference interpreter all lower from. See docs/superpowers/plans/
// 2026-07-21-stopcock-fp-absolute-performance-implementation.md,
// "Canonical optimizer architecture".
import { OP_NON_FUSEABLE } from './opcodes'
import { type OpCode, type OpDomain, requireOpMeta } from './registry'

export type SegmentKind = 'stream' | 'boundary' | 'opaque'

export interface SegmentShape {
  readonly kind: SegmentKind
  readonly domain: OpDomain
  readonly startIndex: number
  readonly length: number
}

export interface PlanShape {
  readonly codes: readonly OpCode[]
  readonly segments: readonly SegmentShape[]
}

/** Per-step captured runtime values. Never inspected by the shape key. */
export interface StepBinding {
  readonly fn?: unknown
  readonly a1?: unknown
  readonly a2?: unknown
  /** Present only for opaque (untagged) steps: the whole-domain function itself. */
  readonly opaqueFn?: (value: unknown) => unknown
}

export interface BoundPlan {
  readonly shape: PlanShape
  readonly bindings: readonly StepBinding[]
}

/**
 * Optional per-call accounting sink: the caller passes a fresh { consumed: 0 }
 * object and reads back how many elements the FIRST segment actually read
 * from the true source (not its length) once the call returns. take(1) over
 * a million elements reports consumed: 1. Shared by lower.ts's runners and
 * portable-templates.ts's generated templates (both need it, and defining
 * it here — the IR module both already depend on — avoids a circular
 * import between them).
 */
export interface ConsumeMeta {
  consumed: number
}

/** One already-resolved operation/binding pair used during plan construction. */
interface BoundStep {
  readonly op: OpCode
  readonly binding: StepBinding
}

interface TaggedFn {
  readonly _op?: number
  readonly _fn?: unknown
  readonly _a1?: unknown
  readonly _a2?: unknown
}

function isTaggedStep(fn: unknown): fn is TaggedFn & ((value: unknown) => unknown) {
  if (typeof fn !== 'function') return false
  const op = (fn as TaggedFn)._op
  return typeof op === 'number' && op > 0
}

export function extractBinding(step: TaggedFn): StepBinding {
  const binding: { fn?: unknown; a1?: unknown; a2?: unknown } = {}
  if (step._fn !== undefined) binding.fn = step._fn
  if (step._a1 !== undefined) binding.a1 = step._a1
  if (step._a2 !== undefined) binding.a2 = step._a2
  return binding
}

/**
 * Segments a list of already-resolved (op, binding) entries into a Plan.
 * `buildPlan` first normalizes tagged and opaque steps into these entries.
 *
 * Segments at every real domain transition and every materialization
 * boundary. Sinks (reduce, forEach, every, some, find, ...) end their
 * stream segment but do not force a boundary by themselves: they run in
 * the same single left-to-right pass as the stream ops preceding them, so
 * callback counts and early termination match a fused implementation.
 * Materializer ops (reverse, sort, join, uniq, sum, ...) require the fully
 * streamed array first and always get their own segment.
 */
function segmentBoundSteps(entries: readonly BoundStep[]): BoundPlan {
  const codes: OpCode[] = []
  const bindings: StepBinding[] = []
  const segments: SegmentShape[] = []

  let segStart = 0
  let segDomain: OpDomain | null = null

  const closeStream = (endIndex: number): void => {
    if (endIndex > segStart) {
      segments.push({
        kind: 'stream',
        domain: segDomain ?? 'array',
        startIndex: segStart,
        length: endIndex - segStart,
      })
    }
    segStart = endIndex
    segDomain = null
  }

  for (let i = 0; i < entries.length; i++) {
    const { op, binding } = entries[i]

    if (op === OP_NON_FUSEABLE) {
      closeStream(i)
      codes.push(OP_NON_FUSEABLE)
      bindings.push(binding)
      segments.push({ kind: 'opaque', domain: 'array', startIndex: i, length: 1 })
      segStart = i + 1
      continue
    }

    const opMeta = requireOpMeta(op)

    if (opMeta.cardinality === 'materializer') {
      closeStream(i)
      codes.push(opMeta.op)
      bindings.push(binding)
      segments.push({ kind: 'boundary', domain: opMeta.inputDomain, startIndex: i, length: 1 })
      segStart = i + 1
      continue
    }

    if (segDomain !== null && segDomain !== opMeta.inputDomain) {
      closeStream(i)
    }
    segDomain = opMeta.inputDomain
    codes.push(opMeta.op)
    bindings.push(binding)

    if (opMeta.cardinality === 'sink') {
      closeStream(i + 1)
    }
  }

  closeStream(entries.length)

  return {
    shape: { codes: Object.freeze(codes), segments: Object.freeze(segments) },
    bindings: Object.freeze(bindings),
  }
}

/**
 * Builds a Plan from a list of pipeline steps: tagged functions carrying
 * _op/_fn/_a1/_a2 (as produced by array.ts's data-last operators), or plain
 * untagged functions, treated as opaque whole-domain transforms.
 */
export function buildPlan(steps: readonly unknown[]): BoundPlan {
  const entries: BoundStep[] = steps.map((step) => {
    if (!isTaggedStep(step)) {
      return { op: OP_NON_FUSEABLE, binding: { opaqueFn: step as (value: unknown) => unknown } }
    }
    const opMeta = requireOpMeta(step._op as number)
    return { op: opMeta.op, binding: extractBinding(step) }
  })
  return segmentBoundSteps(entries)
}

/**
 * Collision-free structural key for a Plan shape: codes plus segment
 * boundaries only. Bound callback values, constants, and reducer initial
 * values never enter the key — only opcodes and structural positions.
 */
export function planShapeKey(shape: PlanShape): string {
  const codesPart = shape.codes.join(',')
  const segmentsPart = shape.segments
    .map((s) => `${s.kind[0]}${s.domain[0]}:${s.startIndex}:${s.length}`)
    .join(',')
  return codesPart + '|' + segmentsPart
}
