import { describe, it, expect } from 'vite-plus/test'
import {
  allSourceOpCodes,
  getOpMeta,
  isBoundary,
  isTerminal,
  REGISTERED_OP_CODES,
} from '../registry'

describe('operation registry', () => {
  it('has exactly one entry per opcode exported from opcodes.ts', () => {
    const source = allSourceOpCodes()
    const registered = REGISTERED_OP_CODES

    const missing = source.filter((op) => !registered.includes(op))
    expect(missing).toEqual([])

    const extra = registered.filter((op) => !source.includes(op))
    expect(extra).toEqual([])
  })

  it('never references an opcode absent from opcodes.ts', () => {
    const source = new Set(allSourceOpCodes())
    for (const op of REGISTERED_OP_CODES) {
      expect(source.has(op)).toBe(true)
    }
  })

  it('never marks a sink as constructor-preserving', () => {
    for (const op of REGISTERED_OP_CODES) {
      const entry = getOpMeta(op)!
      if (entry.cardinality === 'sink') {
        expect(entry.constructorPreserving).toBe(false)
      }
    }
  })

  it('marks every sink and materializer as a boundary op, and nothing else', () => {
    for (const op of REGISTERED_OP_CODES) {
      const entry = getOpMeta(op)!
      const shouldBeBoundary = entry.cardinality === 'sink' || entry.cardinality === 'materializer'
      expect(entry.isMaterializationBoundary).toBe(shouldBeBoundary)
      expect(isBoundary(op)).toBe(shouldBeBoundary)
      expect(isTerminal(op)).toBe(shouldBeBoundary)
    }
  })

  it('gives every stateful (early-exit-capable) op a reverse-unsafe or documented flag', () => {
    for (const op of REGISTERED_OP_CODES) {
      const entry = getOpMeta(op)!
      if (entry.cardinality === 'stateful') {
        // Stateful ops track position-dependent counters/predicates; running
        // them backwards over the same input is never equivalent unless the
        // registry explicitly says so.
        expect(entry.reverseSafe).toBe(false)
      }
    }
  })

  it('requires every op with a callback to declare at least one binding', () => {
    for (const op of REGISTERED_OP_CODES) {
      const entry = getOpMeta(op)!
      if (entry.callbackArity > 0) {
        expect(entry.bindings.length).toBeGreaterThan(0)
      }
    }
  })

  it('declares dense-hole and exact-lowering semantics uniformly', () => {
    for (const op of REGISTERED_OP_CODES) {
      const entry = getOpMeta(op)!
      expect(entry.denseHoles).toBe(true)
      expect(entry.exactLowering).toBe(true)
    }
  })
})
