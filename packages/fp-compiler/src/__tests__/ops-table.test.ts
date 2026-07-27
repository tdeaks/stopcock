import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OPERATOR_DEFINITION_RECORDS_V1 } from '../../../fp/codegen/protocol/operator-definitions'
import { RETAINED_COMPILER_OPERATION_CORPUS_V1 } from '../../../fp/codegen/protocol/generate-protocol'
import {
  COMPILER_OPERATION_CORPUS_ID,
  compilerOperationCorpusProjection,
} from '../../../../benchmarks/src/reference/compiler-operation-corpus'
import { EXPECTED_COMPILER_OPERATION_CORPUS } from '../../../../benchmarks/src/reference/compiler-operation-perf-contract'
import {
  BOUNDARY_OP_NAMES,
  ELEMENT_OP_NAMES,
  FINAL_BOUNDARY_OP_NAMES,
  OPS_TABLE,
  TERMINAL_OP_NAMES,
} from '../ops-table'

describe('ops-table snapshot', () => {
  it('is the exact compiler projection of definition-only semantic lowerings', () => {
    const expected = OPERATOR_DEFINITION_RECORDS_V1.filter(
      (record) => record.compilerPipelineRole !== 'none',
    )
      .map((record) => {
        const lowering = record.lowerings.find((candidate) => candidate.targetTier === 'compiler')!
        return {
          // `compilerName`, not `semantic.publicName`: see the comment on
          // this same field in `generate-protocol.ts#compilerEntriesV1`.
          name: record.compilerName,
          callbackArity: record.semantic.callback.arity,
          bindings: record.semantic.bindings.map(({ slot }) => slot),
          semanticId: record.semantic.semanticId,
          semanticRevision: record.semantic.semanticRevision,
          inputDomain: record.semantic.inputDomain,
          outputDomain: record.semantic.outputDomain,
          cardinality: record.semantic.cardinality,
          streamTermination: record.semantic.termination.streamTermination,
          fullMaterialization: record.semantic.termination.fullMaterialization,
          domainTransition: record.semantic.termination.domainTransition,
          loweringId: lowering.loweringId,
          loweringRevision: lowering.loweringRevision,
          runnerId: lowering.runnerId,
          compilerPipelineRole: lowering.compilerPipelineRole,
          compilerFinalBoundary: lowering.compilerFinalBoundary,
          emitKind: record.emit?.kind,
          emitIndexed: record.emit && record.emit.kind !== 'boundary' ? !!record.emit.indexed : false,
        }
      })
      .sort((left, right) => left.semanticId.localeCompare(right.semanticId))

    // `emit.render` is a fresh function object every time ops-table.ts is
    // loaded (it's spliced source, not a shared reference), so it compares
    // by shape (kind, indexed) plus "is actually a function", not identity.
    const actual = OPS_TABLE.map(({ emit, ...rest }) => ({
      ...rest,
      emitKind: emit.kind,
      emitIndexed: emit.kind !== 'boundary' && !!emit.indexed,
    }))

    expect(actual).toEqual(expected)
    expect(
      OPS_TABLE.every((entry) => entry.emit.kind === 'boundary' || typeof entry.emit.render === 'function'),
    ).toBe(true)
    // 140 public array exports plus the phase 1.4 stragglers: 7 math, 8
    // string, 3 object, 7 guard, 1 array (sortInline) = 26, plus phase 2's
    // 12 option ops and 7 result ops = 19, plus phase 3's dict domain: 9
    // record, 13 map, 11 set, 3 object (pick/omit/mapValues) = 36, plus
    // phase 4's iterable domain: 10 element (map/filter/flatMap/take/drop/
    // takeWhile/dropWhile/scan/enumerate/chunk), 10 terminal (toArray/
    // reduce/forEach/find/findOrUndefined/some/every/count/first/
    // firstOrUndefined) = 20.
    expect(OPS_TABLE).toHaveLength(241)
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
      (record) => record.legacyRuntime?.name === 'sortBy',
    )!
    const compilerEntry = OPS_TABLE.find((entry) => entry.name === 'sortBy')!

    expect(definition.semantic.callback.arity).toBe(2)
    expect(compilerEntry.callbackArity).toBe(2)
    expect(definition.legacyRuntime!.callbackArity).toBe(1)
    expect(definition.legacyRuntime!.callbackArityDisposition).toBe(
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
    // The perf corpus in `compiler-operation-corpus.ts` is scoped to public
    // array exports only (its own header: "Data-last @stopcock/fp/array
    // expressions"); it does not cover the phase 1.4 scalar stragglers (nor
    // `sortInline`, an array-namespace op with no public array export of its
    // own). Compare against that same `publicArrayExport` set, not the whole
    // table.
    const publicArrayExportNames = new Set(
      OPERATOR_DEFINITION_RECORDS_V1.filter((record) => record.publicArrayExport).map(
        (record) => record.legacyRuntime!.name,
      ),
    )
    const arrayEntries = OPS_TABLE.filter((entry) => publicArrayExportNames.has(entry.name))
    expect(arrayEntries).toHaveLength(EXPECTED_COMPILER_OPERATION_CORPUS.totalCaseCount)
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
      expect(entry.semanticId).toMatch(
        /^@stopcock\/fp\/(?:array|string|object|math|guard|option|result|record|map|set|iter)\//u,
      )
    }
  })
})
