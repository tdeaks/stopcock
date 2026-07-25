/**
 * Optimizer-tier diagnostics.
 *
 * `@stopcock/fp/fusion/debug` reports what FP alone executes, which after the
 * S10X extraction is the generic exact executor for every segment. That is
 * true for an FP-only install and would be a guess for anything else: FP cannot
 * see a runner bank that lives in a package it does not depend on.
 *
 * This is the same explanation with `segmentExecutors` answered against the
 * bank actually installed here.
 */
import {
  explain as explainCompact,
  explainPure as explainPureCompact,
  type PipelineExplanation,
  CARD_SINK,
  compactCardinality,
  OP_SCAN,
  OP_SUM,
  OP_TAKE,
  type OpCode,
  type PlanShape,
  type SegmentShape,
} from '@stopcock/fp/abi'
import { buildPlan } from './plan-bridge'
import { ARRAY_RUNNER_KEYS, SINK_RUNNER_KEYS } from './runner-keys.generated'

const ARRAY_KEYS = new Set(ARRAY_RUNNER_KEYS)
const SINK_KEYS = new Set(SINK_RUNNER_KEYS)

function isBareSingleOpSegment(codes: readonly OpCode[], segment: SegmentShape): boolean {
  if (segment.kind !== 'stream' || segment.length !== 1) return false
  const op = codes[segment.startIndex]
  return compactCardinality(op) !== CARD_SINK && op !== OP_TAKE && op !== OP_SCAN
}

/**
 * Mirrors the lookup `lowerShape` performs, including the stream+SUM boundary
 * fusion that collapses two segments into a single pass.
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

const withBankExecutors = (
  base: PipelineExplanation,
  steps: readonly unknown[],
): PipelineExplanation =>
  Object.freeze({
    ...base,
    segmentExecutors: Object.freeze(segmentExecutorKinds(buildPlan(steps).shape)),
  })

export function explain(...steps: readonly unknown[]): PipelineExplanation {
  return withBankExecutors(explainCompact(...steps), steps)
}

export function explainPure(...steps: readonly unknown[]): PipelineExplanation {
  return withBankExecutors(explainPureCompact(...steps), steps)
}

export type { PipelineExplanation }
