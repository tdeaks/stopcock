import { describe, expect, it } from 'vite-plus/test'
import {
  CARD_MATERIALIZER,
  CARD_SINK,
  COMPACT_CARDINALITY,
  COMPACT_DOMAIN,
  compactCardinality,
  compactDomain,
  isCompactRegistered,
} from '../internal/compact/facts.generated'
import { buildCompactPlan } from '../internal/compact/plan'
import * as A from '../array'
import { OP_NON_FUSEABLE } from '../opcodes'
import { buildPlan } from '../plan'
import { REGISTERED_OP_CODES, requireOpMeta } from '../registry'

describe('compact facts', () => {
  it('agrees with the registry for every registered opcode', () => {
    // The whole point of the compact table is to drop 20 KB of registry
    // strings. It is only safe to drop them while these two cannot disagree.
    for (const op of REGISTERED_OP_CODES) {
      const meta = requireOpMeta(op)
      expect(COMPACT_CARDINALITY[compactCardinality(op)], `opcode ${op}`).toBe(meta.cardinality)
      expect(COMPACT_DOMAIN[compactDomain(op)], `opcode ${op}`).toBe(meta.inputDomain)
    }
  })

  it('recognises exactly the registered opcodes', () => {
    for (const op of REGISTERED_OP_CODES) expect(isCompactRegistered(op)).toBe(true)
    expect(isCompactRegistered(0)).toBe(false)
    expect(isCompactRegistered(9_999)).toBe(false)
    expect(isCompactRegistered(-1)).toBe(false)
  })

  it('carries no operation names', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(
      new URL('../internal/compact/facts.generated.ts', import.meta.url),
      'utf8',
    )
    for (const name of ['filterMap', 'takeWhile', 'sortBy', 'flatMap']) {
      expect(source).not.toContain(name)
    }
  })

  it('encodes sink and materializer distinctly', () => {
    const sink = REGISTERED_OP_CODES.find((op) => requireOpMeta(op).cardinality === 'sink')
    const materializer = REGISTERED_OP_CODES.find(
      (op) => requireOpMeta(op).cardinality === 'materializer',
    )
    expect(compactCardinality(sink as number)).toBe(CARD_SINK)
    expect(compactCardinality(materializer as number)).toBe(CARD_MATERIALIZER)
  })
})

describe('compact plan construction', () => {
  const steps = [
    A.map((x: number) => x * 2),
    A.filter((x: number) => x > 2),
    A.sum,
  ] as readonly unknown[]

  it('produces the same shape as the registry-backed planner', () => {
    const compact = buildCompactPlan(steps)
    const canonical = buildPlan(steps)
    expect(compact.shape.codes).toEqual(canonical.shape.codes)
    expect(compact.shape.segments).toEqual(canonical.shape.segments)
  })

  it('binds from provenance, matching the canonical planner', () => {
    expect(buildCompactPlan(steps).bindings).toEqual(buildPlan(steps).bindings)
  })

  it('treats an untrusted step as opaque', () => {
    const forged = Object.assign((value: unknown) => value, { _op: 1, _fn: () => 0 })
    expect(buildCompactPlan([forged]).shape.codes[0]).toBe(OP_NON_FUSEABLE)
  })

  it('treats an unregistered opcode as opaque', () => {
    const plan = buildCompactPlan([(value: unknown) => value])
    expect(plan.shape.codes[0]).toBe(OP_NON_FUSEABLE)
    expect(typeof plan.bindings[0].opaqueFn).toBe('function')
  })
})
