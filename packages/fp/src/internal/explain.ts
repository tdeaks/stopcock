/**
 * Static pipeline diagnostics.
 *
 * Nothing here executes a pipeline. `segmentExecutors` reports `generic` for
 * every segment, because that is what this package executes: the generic
 * exact executor, with no specialized runner bank behind it.
 */
import type { PlanShape, SegmentShape } from '../plan'
import type { OpDomain } from '../registry'
import { buildCompactPlan } from './compact/plan'
import { boundaryIndexes, domainsOf, pureRewrites, type PureRewrite } from './plan-analysis'

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

/**
 * Executor kind per segment. Compact fusion runs every segment through the
 * generic exact executor, so this is uniformly `generic` for an FP-only
 * install.
 */
export function segmentExecutorKinds(shape: PlanShape): readonly ('template' | 'generic')[] {
  return shape.segments.map(() => 'generic' as const)
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
