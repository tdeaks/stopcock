/**
 * Shape analysis over a built plan.
 *
 * Pure reads of the plan IR: no runner bank, no registry, no lowering. Both
 * the optimized engine and the diagnostics surface answer the same questions
 * from here, so a rewrite that `compile` performs and `explain` reports can
 * only ever be described by one piece of code.
 */
import {
  OP_LENGTH,
  OP_MAP,
  OP_SORT,
  OP_SORT_ASC,
  OP_SORT_BY,
  OP_SORT_DESC,
  OP_SORT_INLINE,
  OP_TAKE,
} from '../opcodes'
import type { PlanShape, SegmentShape } from '../plan'
import type { OpCode, OpDomain } from '../registry'

export interface PureRewrite {
  readonly kind: 'top-k' | 'elide-unused-map'
  readonly description: string
}

export function domainsOf(shape: PlanShape): readonly OpDomain[] {
  return shape.segments.map((segment) => segment.domain)
}

export function boundaryIndexes(shape: PlanShape): readonly number[] {
  const indexes: number[] = []
  for (const segment of shape.segments) {
    if (segment.kind === 'boundary') indexes.push(segment.startIndex)
  }
  return indexes
}

export function findSortThenTake(
  codes: readonly OpCode[],
  segments: readonly SegmentShape[],
): { readonly sortSegment: number; readonly takeSegment: number } | undefined {
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index]
    const next = segments[index + 1]
    if (segment.kind !== 'boundary' || next.kind !== 'stream' || next.length !== 1) continue
    const op = codes[segment.startIndex]
    if (
      op !== OP_SORT &&
      op !== OP_SORT_ASC &&
      op !== OP_SORT_DESC &&
      op !== OP_SORT_BY &&
      op !== OP_SORT_INLINE
    ) {
      continue
    }
    if (codes[next.startIndex] === OP_TAKE) {
      return { sortSegment: index, takeSegment: index + 1 }
    }
  }
  return undefined
}

export function findElidableMapBeforeLength(
  codes: readonly OpCode[],
  segments: readonly SegmentShape[],
): number | undefined {
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index]
    const next = segments[index + 1]
    if (segment.kind !== 'stream' || next.kind !== 'boundary') continue
    if (codes[next.startIndex] !== OP_LENGTH) continue
    let onlyMaps = true
    for (let offset = 0; offset < segment.length; offset++) {
      if (codes[segment.startIndex + offset] !== OP_MAP) {
        onlyMaps = false
        break
      }
    }
    if (onlyMaps) return index
  }
  return undefined
}

export function pureRewrites(shape: PlanShape): readonly PureRewrite[] {
  if (findSortThenTake(shape.codes, shape.segments)) {
    return Object.freeze([
      {
        kind: 'top-k',
        description: 'sort followed by take uses a bounded stable top-k',
      } as const,
    ])
  }
  if (findElidableMapBeforeLength(shape.codes, shape.segments) !== undefined) {
    return Object.freeze([
      {
        kind: 'elide-unused-map',
        description: 'map callbacks are elided when only downstream length observes the segment',
      } as const,
    ])
  }
  return Object.freeze([])
}
