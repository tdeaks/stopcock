/**
 * Static pipeline diagnostics.
 *
 * S9 made `/fusion` compact, which left the debug facade adding 8,905 B to a
 * compact consumer instead of the 288 B it added to an optimized one: `explain`
 * lived in `compile.ts` and dragged the whole optimized engine behind it.
 *
 * Nothing here executes a pipeline.
 *
 * Since S10X extracted the optimizer, `segmentExecutors` reports `generic` for
 * every segment, and that is the truth rather than a loss of detail: what this
 * package executes is the generic exact executor. The fused runner bank lives
 * in `@stopcock/fp-optimizer`, which may not be installed, and claiming a
 * segment runs on a template FP cannot see would be a guess. The optimizer
 * reports its own selection through its own trace.
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
