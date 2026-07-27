/**
 * Compact plan construction.
 *
 * Structurally identical to `../../plan`, but it reads the compact fact table
 * instead of the operation registry. The registry exists for diagnostics and
 * costs 20 KB of strings; compact needs cardinality and domain, which are one
 * byte per opcode.
 *
 * Authority is unchanged: only an operator this package constructed reaches a
 * fused plan, and bindings come from the private provenance entry rather than
 * from any public field.
 */
import { OP_NON_FUSEABLE } from '../../opcodes'
import type { BoundPlan, SegmentShape, StepBinding } from '../../plan'
import { trustedOperatorEntry } from '../provenance'
import {
  CARD_MATERIALIZER,
  CARD_SINK,
  compactCardinality,
  compactDomain,
  isCompactRegistered,
} from './facts.generated'

const DOMAIN_NAMES = ['array', 'scalar', 'iterable'] as const

interface BoundStep {
  readonly op: number
  readonly binding: StepBinding
}

const bindingOf = (entry: { fn?: unknown; a1?: unknown; a2?: unknown }): StepBinding => {
  const binding: { fn?: unknown; a1?: unknown; a2?: unknown } = {}
  if (entry.fn !== undefined) binding.fn = entry.fn
  if (entry.a1 !== undefined) binding.a1 = entry.a1
  if (entry.a2 !== undefined) binding.a2 = entry.a2
  return binding
}

const segment = (entries: readonly BoundStep[]): BoundPlan => {
  const codes: number[] = []
  const bindings: StepBinding[] = []
  const segments: SegmentShape[] = []

  let start = 0
  let domain: number | null = null

  const closeStream = (endIndex: number): void => {
    if (endIndex > start) {
      segments.push({
        kind: 'stream',
        domain: DOMAIN_NAMES[domain ?? 0],
        startIndex: start,
        length: endIndex - start,
      })
    }
    start = endIndex
    domain = null
  }

  for (let index = 0; index < entries.length; index++) {
    const { op, binding } = entries[index]

    if (op === OP_NON_FUSEABLE) {
      closeStream(index)
      codes.push(OP_NON_FUSEABLE)
      bindings.push(binding)
      segments.push({ kind: 'opaque', domain: 'array', startIndex: index, length: 1 })
      start = index + 1
      continue
    }

    const cardinality = compactCardinality(op)
    const inputDomain = compactDomain(op)

    if (cardinality === CARD_MATERIALIZER) {
      closeStream(index)
      codes.push(op)
      bindings.push(binding)
      segments.push({
        kind: 'boundary',
        domain: DOMAIN_NAMES[inputDomain],
        startIndex: index,
        length: 1,
      })
      start = index + 1
      continue
    }

    if (domain !== null && domain !== inputDomain) closeStream(index)
    domain = inputDomain
    codes.push(op)
    bindings.push(binding)

    if (cardinality === CARD_SINK) closeStream(index + 1)
  }

  closeStream(entries.length)

  return {
    shape: { codes: Object.freeze(codes), segments: Object.freeze(segments) },
    bindings: Object.freeze(bindings),
  }
}

export const buildCompactPlan = (steps: readonly unknown[]): BoundPlan =>
  segment(
    steps.map((step) => {
      const entry = trustedOperatorEntry(step)
      if (entry === undefined || !isCompactRegistered(entry.op)) {
        return {
          op: OP_NON_FUSEABLE,
          binding: { opaqueFn: step as (value: unknown) => unknown },
        }
      }
      if (compactCardinality(entry.op) === CARD_MATERIALIZER) {
        return {
          op: entry.op,
          binding: { ...bindingOf(entry), boundaryFn: step as (value: unknown) => unknown },
        }
      }
      return { op: entry.op, binding: bindingOf(entry) }
    }),
  )
