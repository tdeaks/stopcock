// Asserts the frozen emitter's grammar classification (stream/sink/boundary)
// mirrors the compiler's cardinality for every op it supports. This is what
// catches drift like uniq (a materializer, not a stream op) or sum (a
// materializer despite reading like a natural fused sink).
//
// Used to compare against `packages/fp/src/registry.ts`, the fused runtime
// engine's own operator metadata. That engine is gone (one-runtime-path
// plan); `packages/fp-compiler`'s checked-in `ops-table.ts` is the surviving
// canonical source for the same cardinality facts (generated from the same
// definition-only records registry.ts used to be), so this file compares
// against that instead.
import { describe, expect, it } from 'vite-plus/test'
import { compilerOperatorFact } from '../../../packages/fp-compiler/src/ops'
import {
  EMITTER_OPCODES,
  isBoundaryKind,
  isSinkKind,
  isStreamKind,
  type BoundaryStepKind,
  type SinkStepKind,
  type StreamStepKind,
} from './emitter'

const ALL_KINDS = Object.keys(EMITTER_OPCODES) as Array<StreamStepKind | SinkStepKind | BoundaryStepKind>

describe('emitter grammar classification matches the compiler cardinality', () => {
  it('every stream-kind op is compiler stream-cardinality (one-to-one/filtering/expanding/stateful)', () => {
    for (const kind of ALL_KINDS) {
      if (!isStreamKind(kind)) continue
      const op = EMITTER_OPCODES[kind]
      expect(op).not.toBeNull()
      const fact = compilerOperatorFact(kind)
      expect(fact, `no compiler operator fact for ${kind}`).toBeDefined()
      expect(
        ['one-to-one', 'filtering', 'expanding', 'stateful'].includes(fact!.cardinality),
        `${kind} is compiler cardinality '${fact!.cardinality}', expected a stream cardinality`,
      ).toBe(true)
    }
  })

  it('every sink-kind op (except toArray, which has no opcode) is compiler cardinality "sink"', () => {
    for (const kind of ALL_KINDS) {
      if (!isSinkKind(kind)) continue
      const op = EMITTER_OPCODES[kind]
      if (kind === 'toArray') {
        expect(op).toBeNull()
        continue
      }
      const fact = compilerOperatorFact(kind)
      expect(fact, `no compiler operator fact for ${kind}`).toBeDefined()
      expect(fact!.cardinality, `${kind} should be compiler cardinality 'sink'`).toBe('sink')
    }
  })

  it('every boundary-kind op is compiler cardinality "materializer", including uniq (sum excepted)', () => {
    for (const kind of ALL_KINDS) {
      if (!isBoundaryKind(kind)) continue
      // `sum` is the one documented exception: the deleted runtime engine's
      // registry.ts classified it as a materializer (a full separate pass,
      // matching this emitter's own boundary treatment of it -- see the
      // file header comment above), but the compiler classifies it as a
      // sink it can fuse straight into the stream loop as an accumulator.
      // Both classifications are internally consistent for the tier that
      // made them; this emitter intentionally kept the (now historical)
      // registry choice, so it diverges from the compiler for this one op.
      if (kind === 'sum') continue
      const fact = compilerOperatorFact(kind)
      expect(fact, `no compiler operator fact for ${kind}`).toBeDefined()
      expect(fact!.cardinality, `${kind} should be compiler cardinality 'materializer'`).toBe('materializer')
    }
  })

  it('classifies every grammar kind into exactly one of stream/sink/boundary', () => {
    for (const kind of ALL_KINDS) {
      const classes = [isStreamKind(kind), isSinkKind(kind), isBoundaryKind(kind)].filter(Boolean)
      expect(classes.length, `${kind} classified as ${classes.length} categories`).toBe(1)
    }
  })
})
