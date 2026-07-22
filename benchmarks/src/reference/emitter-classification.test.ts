// Asserts the frozen emitter's grammar classification (stream/sink/boundary)
// mirrors the registry's cardinality for every op it supports. This is what
// catches drift like uniq (a registry materializer, not a stream op) or sum
// (a registry materializer despite reading like a natural fused sink).
import { describe, expect, it } from 'vite-plus/test'
import { getOpMeta } from '../../../packages/fp/src/registry'
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

describe('emitter grammar classification matches registry cardinality', () => {
  it('every stream-kind op is registry stream-cardinality (one-to-one/filtering/expanding/stateful)', () => {
    for (const kind of ALL_KINDS) {
      if (!isStreamKind(kind)) continue
      const op = EMITTER_OPCODES[kind]
      expect(op).not.toBeNull()
      const meta = getOpMeta(op!)
      expect(meta, `no registry entry for ${kind}`).toBeDefined()
      expect(
        ['one-to-one', 'filtering', 'expanding', 'stateful'].includes(meta!.cardinality),
        `${kind} is registry cardinality '${meta!.cardinality}', expected a stream cardinality`,
      ).toBe(true)
    }
  })

  it('every sink-kind op (except toArray, which has no opcode) is registry cardinality "sink"', () => {
    for (const kind of ALL_KINDS) {
      if (!isSinkKind(kind)) continue
      const op = EMITTER_OPCODES[kind]
      if (kind === 'toArray') {
        expect(op).toBeNull()
        continue
      }
      const meta = getOpMeta(op!)
      expect(meta, `no registry entry for ${kind}`).toBeDefined()
      expect(meta!.cardinality, `${kind} should be registry cardinality 'sink'`).toBe('sink')
    }
  })

  it('every boundary-kind op is registry cardinality "materializer", including sum and uniq', () => {
    for (const kind of ALL_KINDS) {
      if (!isBoundaryKind(kind)) continue
      const op = EMITTER_OPCODES[kind]
      const meta = getOpMeta(op!)
      expect(meta, `no registry entry for ${kind}`).toBeDefined()
      expect(meta!.cardinality, `${kind} should be registry cardinality 'materializer'`).toBe('materializer')
      expect(meta!.isMaterializationBoundary).toBe(true)
    }
  })

  it('classifies every grammar kind into exactly one of stream/sink/boundary', () => {
    for (const kind of ALL_KINDS) {
      const classes = [isStreamKind(kind), isSinkKind(kind), isBoundaryKind(kind)].filter(Boolean)
      expect(classes.length, `${kind} classified as ${classes.length} categories`).toBe(1)
    }
  })
})
