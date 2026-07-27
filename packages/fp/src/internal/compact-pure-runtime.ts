/**
 * Pure compact compilation.
 *
 * Kept outside compact-runtime.ts so importing exact `/fusion` cannot retain
 * pure analysis or rewrite code. `/compile` opts into this module explicitly.
 */
import { interpret } from '../interpret'
import type { BoundPlan, SegmentShape } from '../plan'
import { findElidableMapBeforeLength } from './plan-analysis'
import { buildCompactPlan } from './compact/plan'

const runSegment = (plan: BoundPlan, segment: SegmentShape, input: unknown): unknown => {
  return interpret(
    {
      shape: {
        codes: plan.shape.codes,
        segments: [segment],
      },
      bindings: plan.bindings,
    },
    input,
  )
}

const runSegmentRange = (
  plan: BoundPlan,
  start: number,
  end: number,
  input: unknown,
): unknown => {
  let value = input
  for (let index = start; index < end; index++) {
    value = runSegment(plan, plan.shape.segments[index], value)
  }
  return value
}

const readDenseLength = (data: readonly unknown[]): number => {
  // Pure mode may elide the map callback, but the public array contract still
  // snapshots length and observes every dense source slot in order.
  const length = data.length
  for (let index = 0; index < length; index++) void data[index]
  return length
}

export function compactCompilePure(...steps: readonly unknown[]): (input: unknown) => unknown {
  if (steps.length === 0) return (input: unknown) => input
  const plan = buildCompactPlan(steps)
  const { shape } = plan

  const elidableMap = findElidableMapBeforeLength(shape.codes, shape.segments)
  if (elidableMap !== undefined) {
    return (input: unknown): unknown => {
      const before = runSegmentRange(plan, 0, elidableMap, input)
      const length = readDenseLength(before as readonly unknown[])
      return runSegmentRange(plan, elidableMap + 2, shape.segments.length, length)
    }
  }

  // Pure mode selected no applicable rewrite. The generic compact interpreter
  // remains the semantic implementation; no optimizer package is consulted.
  return (input: unknown): unknown => interpret(plan, input)
}
