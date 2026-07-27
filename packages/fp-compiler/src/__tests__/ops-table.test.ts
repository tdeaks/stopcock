import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OPERATOR_DEFINITION_RECORDS_V1 } from '../../../fp/codegen/protocol/operator-definitions'
import {
  COMPILER_EMITTER_ABI_V1_HASH as LIVE_COMPILER_EMITTER_ABI_V1_HASH,
  OPERATOR_MANIFEST_V1_HASH as LIVE_OPERATOR_MANIFEST_V1_HASH,
  OPERATOR_SEMANTIC_FACTS_V1_HASH,
  RETAINED_COMPILER_OPERATION_CORPUS_V1,
} from '../../../fp/codegen/protocol/generate-protocol'
import {
  COMPILER_OPERATION_CORPUS_ID,
  compilerOperationCorpusProjection,
} from '../../../../benchmarks/src/reference/compiler-operation-corpus'
import { EXPECTED_COMPILER_OPERATION_CORPUS } from '../../../../benchmarks/src/reference/compiler-operation-perf-contract'
import {
  BOUNDARY_OP_NAMES,
  COMPILER_EMITTER_ABI_V1_HASH,
  ELEMENT_OP_NAMES,
  FINAL_BOUNDARY_OP_NAMES,
  OPERATOR_MANIFEST_V1_HASH,
  OPS_TABLE,
  TERMINAL_OP_NAMES,
} from '../ops-table'

describe('ops-table snapshot', () => {
  it('is the exact compiler projection of definition-only semantic lowerings', () => {
    const expected = OPERATOR_DEFINITION_RECORDS_V1.filter((record) => record.publicArrayExport)
      .map((record) => {
        const lowering = record.lowerings.find((candidate) => candidate.targetTier === 'compiler')!
        return {
          name: record.semantic.publicName,
          callbackArity: record.semantic.callback.arity,
          bindings: record.semantic.bindings.map(({ slot }) => slot),
          semanticId: record.semantic.semanticId,
          semanticRevision: record.semantic.semanticRevision,
          semanticHash: record.semantic.semanticHash,
          inputDomain: record.semantic.inputDomain,
          outputDomain: record.semantic.outputDomain,
          cardinality: record.semantic.cardinality,
          streamTermination: record.semantic.termination.streamTermination,
          fullMaterialization: record.semantic.termination.fullMaterialization,
          domainTransition: record.semantic.termination.domainTransition,
          loweringId: lowering.loweringId,
          loweringRevision: lowering.loweringRevision,
          loweringAbiVersion: lowering.loweringAbiVersion,
          loweringHash: lowering.loweringHash,
          runnerId: lowering.runnerId,
          compilerPipelineRole: lowering.compilerPipelineRole,
          compilerFinalBoundary: lowering.compilerFinalBoundary,
        }
      })
      .sort((left, right) => left.semanticId.localeCompare(right.semanticId))

    expect(OPS_TABLE).toEqual(expected)
    expect(OPS_TABLE).toHaveLength(133)
    const generatedSource = readFileSync(
      fileURLToPath(new URL('../ops-table.ts', import.meta.url)),
      'utf8',
    )
    expect(generatedSource).toContain(`// Semantic facts hash: ${OPERATOR_SEMANTIC_FACTS_V1_HASH}`)
    expect(generatedSource).toContain(
      `// Complete semantic manifest hash: ${LIVE_OPERATOR_MANIFEST_V1_HASH}`,
    )
    expect(generatedSource).toContain(
      `// Compiler emitter ABI hash: ${LIVE_COMPILER_EMITTER_ABI_V1_HASH}`,
    )
    expect(OPERATOR_MANIFEST_V1_HASH).toBe(LIVE_OPERATOR_MANIFEST_V1_HASH)
    expect(OPERATOR_MANIFEST_V1_HASH).not.toBe(OPERATOR_SEMANTIC_FACTS_V1_HASH)
    expect(COMPILER_EMITTER_ABI_V1_HASH).toBe(LIVE_COMPILER_EMITTER_ABI_V1_HASH)
  })

  it('derives compiler classifications from accepted lowerings', () => {
    const names = (role: 'element' | 'terminal' | 'boundary') =>
      OPS_TABLE.filter((entry) => entry.compilerPipelineRole === role).map((entry) => entry.name)
    expect(ELEMENT_OP_NAMES).toEqual(names('element'))
    expect(TERMINAL_OP_NAMES).toEqual(names('terminal'))
    expect(BOUNDARY_OP_NAMES).toEqual(names('boundary'))
    expect(FINAL_BOUNDARY_OP_NAMES).toEqual(
      OPS_TABLE.filter((entry) => entry.compilerFinalBoundary).map((entry) => entry.name),
    )
  })

  it('keeps canonical comparator arity authoritative over legacy runtime metadata', () => {
    const definition = OPERATOR_DEFINITION_RECORDS_V1.find(
      (record) => record.legacyRuntime.name === 'sortBy',
    )!
    const compilerEntry = OPS_TABLE.find((entry) => entry.name === 'sortBy')!

    expect(definition.semantic.callback.arity).toBe(2)
    expect(compilerEntry.callbackArity).toBe(2)
    expect(definition.legacyRuntime.callbackArity).toBe(1)
    expect(definition.legacyRuntime.callbackArityDisposition).toBe(
      'legacy-comparator-metadata-preserved',
    )
  })

  it('binds declared evidence to the retained complete compiler corpus', () => {
    const corpusHash = `sha256:${createHash('sha256')
      .update(JSON.stringify(compilerOperationCorpusProjection()))
      .digest('hex')}`
    expect(RETAINED_COMPILER_OPERATION_CORPUS_V1).toEqual({
      corpusId: COMPILER_OPERATION_CORPUS_ID,
      corpusHash,
    })
    expect(corpusHash).toBe(`sha256:${EXPECTED_COMPILER_OPERATION_CORPUS.sha256}`)
    expect(OPS_TABLE).toHaveLength(EXPECTED_COMPILER_OPERATION_CORPUS.totalCaseCount)
  })

  it('does not discover facts through generated or runtime FP modules', () => {
    const generator = readFileSync(
      fileURLToPath(new URL('../../scripts/gen-ops-table.ts', import.meta.url)),
      'utf8',
    )
    expect(generator).not.toMatch(/fp\/src\/(?:array|registry|opcodes)/u)
    expect(generator).not.toMatch(/from\s+['"]@stopcock\/fp/u)
    expect(generator).toContain('fp/codegen/protocol/generate-protocol')
  })

  it('does not treat a numeric opcode as semantic identity or authority', () => {
    for (const entry of OPS_TABLE) {
      expect(entry).not.toHaveProperty('opcode')
      expect(entry.semanticId).toMatch(/^@stopcock\/fp\/array\//u)
      expect(entry.semanticHash).toMatch(/^sha256:[a-f0-9]{64}$/u)
      expect(entry.loweringHash).toMatch(/^sha256:[a-f0-9]{64}$/u)
    }
  })
})
