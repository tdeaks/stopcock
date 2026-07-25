/**
 * Static pipeline diagnostics.
 *
 * S9 made `/fusion` compact, which left the debug facade adding 8,905 B to a
 * compact consumer instead of the 288 B it added to an optimized one: `explain`
 * lived in `compile.ts` and dragged the whole optimized engine behind it.
 *
 * Nothing here executes a pipeline. Whether a segment runs on a fused runner is
 * a question about which shapes the bank covers, so it is answered from the
 * generated key set; cardinality comes from the compact fact table rather than
 * the 20 KB operation registry. Compact facts cover all 65 registered opcodes,
 * so the segmentation reported here is the segmentation that runs.
 */
import { OP_SCAN, OP_SUM, OP_TAKE } from '../opcodes'
import type { PlanShape, SegmentShape } from '../plan'
import type { OpCode, OpDomain } from '../registry'
import { buildCompactPlan } from './compact/plan'
import { CARD_SINK, compactCardinality } from './compact/facts.generated'
import { boundaryIndexes, domainsOf, pureRewrites, type PureRewrite } from './plan-analysis'
import { ARRAY_RUNNER_KEYS, SINK_RUNNER_KEYS } from './runner-keys.generated'

const ARRAY_KEYS = new Set(ARRAY_RUNNER_KEYS)
const SINK_KEYS = new Set(SINK_RUNNER_KEYS)

export interface PipelineExplanation {
  readonly version: 1
  readonly domains: readonly OpDomain[]
  readonly segments: readonly SegmentShape[]
  readonly materializationBoundaries: readonly number[]
  readonly semanticMode: 'exact' | 'pure'
  readonly executor: 'portable'
  readonly segmentExecutors: readonly ('template' | 'generic')[]
  readonly rewrites: readonly PureRewrite[]
  readonly runtimeCodeGeneration: false
  readonly aotRecommended: true
}

function isBareSingleOpSegment(codes: readonly OpCode[], segment: SegmentShape): boolean {
  if (segment.kind !== 'stream' || segment.length !== 1) return false
  const op = codes[segment.startIndex]
  return compactCardinality(op) !== CARD_SINK && op !== OP_TAKE && op !== OP_SCAN
}

/**
 * Executor kind per segment, or per fused pair. Mirrors the lookup performed by
 * `lowerShape`, including the stream+SUM boundary fusion that collapses two
 * segments into one pass.
 */
export function segmentExecutorKinds(shape: PlanShape): readonly ('template' | 'generic')[] {
  const { codes, segments } = shape
  const kinds: ('template' | 'generic')[] = []
  let index = 0
  while (index < segments.length) {
    const segment = segments[index]
    const next = segments[index + 1]
    if (
      next &&
      isBareSingleOpSegment(codes, segment) &&
      next.kind === 'boundary' &&
      codes[next.startIndex] === OP_SUM &&
      SINK_KEYS.has(`${codes[segment.startIndex]}>SUM`)
    ) {
      kinds.push('template', 'template')
      index += 2
      continue
    }
    if (segment.kind === 'stream') {
      const key = codes.slice(segment.startIndex, segment.startIndex + segment.length).join(',')
      kinds.push(ARRAY_KEYS.has(key) || SINK_KEYS.has(key) ? 'template' : 'generic')
    } else {
      kinds.push('generic')
    }
    index++
  }
  return kinds
}

function explainInternal(pure: boolean, steps: readonly unknown[]): PipelineExplanation {
  const plan = buildCompactPlan(steps)
  return Object.freeze({
    version: 1,
    domains: Object.freeze([...domainsOf(plan.shape)]),
    segments: Object.freeze([...plan.shape.segments]),
    materializationBoundaries: Object.freeze(boundaryIndexes(plan.shape)),
    semanticMode: pure ? 'pure' : 'exact',
    executor: 'portable',
    segmentExecutors: Object.freeze(segmentExecutorKinds(plan.shape)),
    rewrites: pure ? pureRewrites(plan.shape) : Object.freeze([]),
    runtimeCodeGeneration: false,
    aotRecommended: true,
  } as const)
}

export function explain(...steps: readonly unknown[]): PipelineExplanation {
  return explainInternal(false, steps)
}

export function explainPure(...steps: readonly unknown[]): PipelineExplanation {
  return explainInternal(true, steps)
}

export type { PureRewrite }
