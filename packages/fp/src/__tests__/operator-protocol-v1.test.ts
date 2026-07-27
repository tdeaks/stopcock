import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import {
  FUSION_RUNNER_DESCRIPTORS_V1,
  OPERATOR_DEFINITION_RECORDS_V1,
  OPERATOR_LOWERINGS_V1,
  OPERATOR_SEMANTICS_V1,
  assertRuntimeEncodingCatalogueV1,
  requireOperatorDefinitionByNameV1,
  runtimeOpcodeByNameV1,
  runtimeRecordsInOpcodeOrderV1,
  type OperatorDefinitionRecordV1,
} from '../../codegen/protocol/operator-definitions'
import {
  OPERATOR_SEMANTIC_FACTS_V1_HASH,
  RETAINED_COMPILER_OPERATION_CORPUS_V1,
  emitAfterProtocolCatalogueValidationV1,
} from '../../codegen/protocol/generate-protocol'
import {
  assertEvidenceJoinsCurrentV1,
  assertLoweringRefinesSemanticV1,
  assertOperatorCatalogueV1,
  assertRunnerDescriptorProjectsLoweringV1,
  defineLoweringV1,
  defineOperatorV1,
  hashCanonical,
  projectRunnerDescriptorV1,
  type OperatorEvidenceV1,
  type OperatorLoweringInputV1,
  type OperatorSemanticInputV1,
} from '../../codegen/protocol/operator-v1'
import {
  RECEIPT_SCHEMA_V1_HASH as DEBUG_RECEIPT_SCHEMA_HASH,
  validateReceiptJoinV1 as validateDebugJoin,
  validateReceiptV1 as validateDebugReceipt,
} from '../internal/fusion-debug-receipt-schema.generated'
import {
  RECEIPT_SCHEMA_V1_HASH as COMPILER_RECEIPT_SCHEMA_HASH,
  validateReceiptJoinV1 as validateCompilerJoin,
  validateReceiptV1 as validateCompilerReceipt,
} from '../../../fp-compiler/src/receipt-schema.generated'
import { map } from '../array'

function generatedSemanticFactsHash(path: string): string {
  const source = readFileSync(path, 'utf8')
  const match = source.match(/^\/\/ Semantic facts hash: (sha256:[a-f0-9]{64})$/mu)
  if (!match) throw new Error(`missing generated semantic facts hash in ${path}`)
  return match[1]
}

function semanticInput(
  semantic = requireOperatorDefinitionByNameV1('map').semantic,
): OperatorSemanticInputV1 {
  const { semanticHash: _semanticHash, ...input } = structuredClone(semantic)
  return input
}

function loweringInput(
  lowering = requireOperatorDefinitionByNameV1('map').lowerings[0],
): OperatorLoweringInputV1 {
  const { loweringHash: _loweringHash, ...input } = structuredClone(lowering)
  return input
}

describe('OperatorSemanticV1 authoring', () => {
  it('copies and deeply freezes definition-only plain data', () => {
    const input = semanticInput()
    const authored = defineOperatorV1(input)
    const mutableInput = input as unknown as {
      acceptedLayouts: string[]
      links: { lawIds: string[] }
    }
    mutableInput.acceptedLayouts.push('js-scalar')
    mutableInput.links.lawIds[0] = '@stopcock/fp/law/mutated'

    expect(authored.acceptedLayouts).not.toContain('js-scalar')
    expect(authored.links.lawIds[0]).not.toBe('@stopcock/fp/law/mutated')
    expect(Object.isFrozen(authored)).toBe(true)
    expect(Object.isFrozen(authored.bindings)).toBe(true)
    expect(Object.isFrozen(authored.ownership)).toBe(true)
    expect(Object.isFrozen(authored.links.lawIds)).toBe(true)
  })

  it('rejects unknown fields, omitted capabilities, unknown versions, and non-plain data', () => {
    expect(() =>
      defineOperatorV1({
        ...semanticInput(),
        surprise: true,
      } as unknown as OperatorSemanticInputV1),
    ).toThrow(/keys must be exactly/u)

    const { capabilities: _capabilities, ...withoutCapabilities } = semanticInput()
    expect(() =>
      defineOperatorV1(withoutCapabilities as unknown as OperatorSemanticInputV1),
    ).toThrow(/keys must be exactly/u)

    expect(() =>
      defineOperatorV1({
        ...semanticInput(),
        protocolVersion: 2,
      } as unknown as OperatorSemanticInputV1),
    ).toThrow(/unsupported operator protocol version/u)

    expect(() =>
      defineOperatorV1({
        ...semanticInput(),
        links: {
          ...semanticInput().links,
          lawIds: [() => true],
        },
      } as unknown as OperatorSemanticInputV1),
    ).toThrow(/finite plain data/u)

    const accessorInput = semanticInput() as unknown as Record<string, unknown>
    Object.defineProperty(accessorInput, 'publicName', {
      enumerable: true,
      get: () => 'map',
    })
    expect(() => defineOperatorV1(accessorInput as unknown as OperatorSemanticInputV1)).toThrow(
      /enumerable plain-data field/u,
    )

    const sparseLaws = Array<string>(1)
    expect(() =>
      defineOperatorV1({
        ...semanticInput(),
        links: {
          ...semanticInput().links,
          lawIds: sparseLaws,
        },
      }),
    ).toThrow(/dense plain-data array/u)

    expect(() =>
      defineOperatorV1({
        ...semanticInput(),
        diagnosticTag: {
          ...semanticInput().diagnosticTag,
          bindingFields: ['_a1'],
        },
      }),
    ).toThrow(/exactly project the public tagged-function slots/u)
  })

  it('requires package-qualified semantic identities', () => {
    for (const semanticId of [
      'map',
      'stopcock/fp/array/map',
      '@stopcock/fp',
      '@Stopcock/fp/array/map',
    ]) {
      expect(() =>
        defineOperatorV1({
          ...semanticInput(),
          semanticId,
        }),
      ).toThrow(/package-qualified semantic ID/u)
    }
  })

  it('keeps the canonical catalogue immutable through every generated projection', () => {
    const record = OPERATOR_DEFINITION_RECORDS_V1[0]
    const recordsByOpcode = runtimeRecordsInOpcodeOrderV1()

    expect(Object.isFrozen(OPERATOR_DEFINITION_RECORDS_V1)).toBe(true)
    expect(Object.isFrozen(OPERATOR_SEMANTICS_V1)).toBe(true)
    expect(Object.isFrozen(OPERATOR_LOWERINGS_V1)).toBe(true)
    expect(Object.isFrozen(FUSION_RUNNER_DESCRIPTORS_V1)).toBe(true)
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.semantic)).toBe(true)
    expect(Object.isFrozen(record.lowerings)).toBe(true)
    expect(Object.isFrozen(record.legacyRuntime)).toBe(true)
    expect(Object.isFrozen(record.legacyRuntime.bindings)).toBe(true)
    expect(Object.isFrozen(record.previousCapabilityDeclarations)).toBe(true)
    expect(Object.isFrozen(recordsByOpcode)).toBe(true)

    expect(() =>
      (OPERATOR_DEFINITION_RECORDS_V1 as OperatorDefinitionRecordV1[]).splice(0, 1),
    ).toThrow()
    expect(() => (record.legacyRuntime.bindings as string[]).push('_mutated')).toThrow()
    expect(() => (recordsByOpcode as OperatorDefinitionRecordV1[]).reverse()).toThrow()
  })

  it('writes nothing when pre-emission catalogue validation finds stale semantics', () => {
    const staleSemantics = OPERATOR_SEMANTICS_V1.map((semantic, index) =>
      index === 0
        ? {
            ...semantic,
            semanticHash: `sha256:${'0'.repeat(64)}`,
          }
        : semantic,
    )
    const writes: string[] = []

    expect(() =>
      emitAfterProtocolCatalogueValidationV1(
        {
          definitions: OPERATOR_DEFINITION_RECORDS_V1,
          semantics: staleSemantics,
          lowerings: OPERATOR_LOWERINGS_V1,
          runnerDescriptors: FUSION_RUNNER_DESCRIPTORS_V1,
        },
        () => writes.push('partial-output'),
      ),
    ).toThrow(/semantic hash drift/u)
    expect(writes).toEqual([])
  })

  it('requires every undeveloped backend capability to be explicit unsupported', () => {
    for (const semantic of OPERATOR_SEMANTICS_V1) {
      expect(semantic.capabilities).toEqual({
        worker: 'unsupported',
        simd: 'unsupported',
        wasm: 'unsupported',
        incremental: 'unsupported',
      })
    }
  })

  it('records the exact stable comparator schedule separately from element callbacks', () => {
    for (const name of ['sortBy', 'sortInline']) {
      const record = requireOperatorDefinitionByNameV1(name)
      expect(record.semantic.callback).toEqual({
        arity: 2,
        arguments: ['left', 'right'],
        index: 'not-passed',
        count: 'once-per-stable-merge-comparison',
        order: 'stable-merge-sort-order',
        evaluationPoint: 'during-full-materialization',
      })
      expect(record.legacyRuntime.callbackArity).toBe(1)
      expect(record.legacyRuntime.callbackArityDisposition).toBe(
        'legacy-comparator-metadata-preserved',
      )
    }
    expect(requireOperatorDefinitionByNameV1('reduce').semantic.callback).toMatchObject({
      arity: 2,
      arguments: ['accumulator', 'value'],
      count: 'once-per-consumed-value',
      order: 'left-to-right',
      evaluationPoint: 'during-element-consumption',
    })
  })

  it('hashes normative semantics while excluding evidence links', () => {
    const base = semanticInput()
    const original = defineOperatorV1(base)
    const linksOnly = defineOperatorV1({
      ...base,
      links: {
        referenceImplementationId: '@stopcock/fp/reference/alternate/v1',
        lawIds: ['@stopcock/fp/law/alternate/v1'],
        differentialCorpusIds: ['@stopcock/fp/corpus/alternate/v1'],
      },
    })
    const normativeChange = defineOperatorV1({
      ...base,
      termination: {
        ...base.termination,
        earlyTermination: !base.termination.earlyTermination,
      },
    })

    expect(linksOnly.semanticHash).toBe(original.semanticHash)
    expect(normativeChange.semanticHash).not.toBe(original.semanticHash)
  })

  it('rejects duplicate package-qualified identities', () => {
    const semantic = defineOperatorV1(semanticInput())
    expect(() => assertOperatorCatalogueV1([semantic, semantic], [], [])).toThrow(
      /duplicate semantic identity/u,
    )
  })

  it('rejects duplicate generated runtime encodings before emission', () => {
    const [first, second] = OPERATOR_DEFINITION_RECORDS_V1
    expect(() =>
      assertRuntimeEncodingCatalogueV1([
        first,
        {
          ...second,
          legacyRuntime: {
            ...second.legacyRuntime,
            opcode: first.legacyRuntime.opcode,
          },
        },
      ]),
    ).toThrow(/duplicate opcode/u)
  })

  it('rejects a legacy runtime name that diverges from semantic authority', () => {
    const record = requireOperatorDefinitionByNameV1('map')
    expect(() =>
      assertRuntimeEncodingCatalogueV1([
        {
          ...record,
          legacyRuntime: {
            ...record.legacyRuntime,
            name: 'legacyMap',
          },
        },
      ]),
    ).toThrow(/runtime name contradicts/u)
  })

  it('allows only the declared byte-compatible comparator callback projection', () => {
    const comparator = requireOperatorDefinitionByNameV1('sortBy')
    expect(() =>
      assertRuntimeEncodingCatalogueV1([
        {
          ...comparator,
          legacyRuntime: {
            ...comparator.legacyRuntime,
            callbackArityDisposition: 'matches-semantic',
          },
        },
      ]),
    ).toThrow(/runtime callback disposition contradicts/u)

    const mapRecord = requireOperatorDefinitionByNameV1('map')
    expect(() =>
      assertRuntimeEncodingCatalogueV1([
        {
          ...mapRecord,
          legacyRuntime: {
            ...mapRecord.legacyRuntime,
            callbackArity: 0,
            callbackArityDisposition: 'legacy-comparator-metadata-preserved',
          },
        },
      ]),
    ).toThrow(/undeclared runtime callback contradiction/u)
  })

  it('rejects legacy runtime binding or capability projection drift', () => {
    const comparator = requireOperatorDefinitionByNameV1('sortBy')
    expect(() =>
      assertRuntimeEncodingCatalogueV1([
        {
          ...comparator,
          legacyRuntime: {
            ...comparator.legacyRuntime,
            bindings: [],
          },
        },
      ]),
    ).toThrow(/runtime bindings contradict/u)

    const sumRecord = requireOperatorDefinitionByNameV1('sum')
    expect(sumRecord.previousCapabilityDeclarations).toMatchObject({
      simd: true,
      worker: true,
      disposition: 'unsupported-without-owned-implementation-and-corpus',
    })
    expect(sumRecord.semantic.capabilities).toEqual({
      worker: 'unsupported',
      simd: 'unsupported',
      wasm: 'unsupported',
      incremental: 'unsupported',
    })
    expect(() =>
      assertRuntimeEncodingCatalogueV1([
        {
          ...sumRecord,
          legacyRuntime: {
            ...sumRecord.legacyRuntime,
            simdEligible: false,
          },
        },
      ]),
    ).toThrow(/legacy capability projection drifted/u)
  })

  it('keeps numeric opcode outside semantic identity and authority', () => {
    const mapRecord = requireOperatorDefinitionByNameV1('map')
    expect(runtimeOpcodeByNameV1('map')).toBe(1)
    expect(mapRecord.semantic).not.toHaveProperty('opcode')
    expect(mapRecord.semantic.semanticId).toBe('@stopcock/fp/array/map')
    expect(mapRecord.semantic.diagnosticTag.authority).toBe('diagnostic-only')
    expect(mapRecord.semantic.diagnosticTag.bindingFields).toEqual(['_fn'])

    const callback = (value: number) => value * 2
    const tagged = map(callback) as unknown as Record<string, unknown>
    expect(tagged._fn).toBe(callback)
    expect(tagged).not.toHaveProperty('fn')
  })

  it('records one non-runtime semantic fact hash in both generated projections', () => {
    const runtimePath = fileURLToPath(new URL('../registry.ts', import.meta.url))
    const compilerPath = fileURLToPath(
      new URL('../../../fp-compiler/src/ops-table.ts', import.meta.url),
    )
    expect(generatedSemanticFactsHash(runtimePath)).toBe(OPERATOR_SEMANTIC_FACTS_V1_HASH)
    expect(generatedSemanticFactsHash(compilerPath)).toBe(OPERATOR_SEMANTIC_FACTS_V1_HASH)
    expect(readFileSync(runtimePath, 'utf8')).not.toContain('OPERATOR_MANIFEST_HASH')
    expect(readFileSync(compilerPath, 'utf8')).not.toContain('OPERATOR_MANIFEST_HASH')
  })
})

describe('OperatorLoweringV1 refinement', () => {
  const record = requireOperatorDefinitionByNameV1('map')
  const semantic = record.semantic
  const valid = record.lowerings[0]

  it('accepts every canonical lowering and lossless runner projection', () => {
    expect(() =>
      assertOperatorCatalogueV1(
        OPERATOR_SEMANTICS_V1,
        OPERATOR_LOWERINGS_V1,
        FUSION_RUNNER_DESCRIPTORS_V1,
      ),
    ).not.toThrow()
    expect(() => assertLoweringRefinesSemanticV1(semantic, valid)).not.toThrow()
    expect(() =>
      assertRunnerDescriptorProjectsLoweringV1(valid, projectRunnerDescriptorV1(valid)),
    ).not.toThrow()
  })

  it('fails widened layout, changed termination, and foreign fallback before emission', () => {
    const widenedLayout = defineLoweringV1({
      ...loweringInput(valid),
      acceptedLayouts: [...valid.acceptedLayouts, 'js-scalar'],
    })
    expect(() => assertLoweringRefinesSemanticV1(semantic, widenedLayout)).toThrow(
      /widens accepted physical layouts/u,
    )

    const changedTermination = defineLoweringV1({
      ...loweringInput(valid),
      termination: {
        ...valid.termination,
        fullMaterialization: !valid.termination.fullMaterialization,
      },
    })
    expect(() => assertLoweringRefinesSemanticV1(semantic, changedTermination)).toThrow(
      /changes termination/u,
    )

    const filter = requireOperatorDefinitionByNameV1('filter').semantic
    const foreignFallback = defineLoweringV1({
      ...loweringInput(valid),
      exactFallback: {
        semanticId: filter.semanticId,
        semanticRevision: filter.semanticRevision,
        semanticHash: filter.semanticHash,
      },
    })
    expect(() => assertLoweringRefinesSemanticV1(semantic, foreignFallback)).toThrow(
      /exact fallback/u,
    )
  })

  it('fails changed shape, cardinality, modes, ownership, and attempted behavior overrides', () => {
    const changedShape = defineLoweringV1({
      ...loweringInput(valid),
      outputShapeFunction: '@stopcock/fp/shape/contradictory-v1',
    })
    expect(() => assertLoweringRefinesSemanticV1(semantic, changedShape)).toThrow(
      /changes output shape/u,
    )

    const changedCardinality = defineLoweringV1({
      ...loweringInput(valid),
      cardinality: 'filtering',
    })
    expect(() => assertLoweringRefinesSemanticV1(semantic, changedCardinality)).toThrow(
      /changes semantic cardinality/u,
    )

    const reduce = requireOperatorDefinitionByNameV1('reduce')
    const widenedModes = defineLoweringV1({
      ...loweringInput(reduce.lowerings[0]),
      acceptedSemanticModes: ['exact', 'pure'],
    })
    expect(() => assertLoweringRefinesSemanticV1(reduce.semantic, widenedModes)).toThrow(
      /widens accepted semantic modes/u,
    )

    const weakenedAliasing = defineLoweringV1({
      ...loweringInput(valid),
      ownership: {
        ...valid.ownership,
        aliasing: 'borrowed-element-only',
      },
    })
    expect(() => assertLoweringRefinesSemanticV1(semantic, weakenedAliasing)).toThrow(
      /weakens alias restrictions/u,
    )

    const widenedStorage = defineLoweringV1({
      ...loweringInput(valid),
      ownership: {
        ...valid.ownership,
        resultStorage: [...valid.ownership.resultStorage, 'js-scalar'],
      },
    })
    expect(() => assertLoweringRefinesSemanticV1(semantic, widenedStorage)).toThrow(
      /widens result storage/u,
    )

    expect(() =>
      defineLoweringV1({
        ...loweringInput(valid),
        evaluation: semantic.evaluation,
      } as unknown as OperatorLoweringInputV1),
    ).toThrow(/keys must be exactly/u)

    const contradictorySemantic = structuredClone(semantic) as unknown as {
      evaluation: { thrownErrorTiming: string }
    }
    contradictorySemantic.evaluation.thrownErrorTiming = 'changed-by-lowering'
    expect(() =>
      assertLoweringRefinesSemanticV1(contradictorySemantic as unknown as typeof semantic, valid),
    ).toThrow(/evaluation\.thrownErrorTiming/u)
  })

  it('fails a runner descriptor that overrides its lowering', () => {
    const descriptor = projectRunnerDescriptorV1(valid)
    const contradictory = {
      ...descriptor,
      runnerId: '@stopcock/fp/runner/contradictory/v1',
    }
    expect(() => assertRunnerDescriptorProjectsLoweringV1(valid, contradictory)).toThrow(
      /lossless lowering projection/u,
    )
  })

  it('distinguishes early exit, stream termination, and full materialization', () => {
    const take = requireOperatorDefinitionByNameV1('take').semantic.termination
    const reduce = requireOperatorDefinitionByNameV1('reduce').semantic.termination
    const sort = requireOperatorDefinitionByNameV1('sort').semantic.termination

    expect(take).toEqual({
      earlyTermination: true,
      streamTermination: false,
      fullMaterialization: false,
      domainTransition: false,
    })
    expect(reduce.streamTermination).toBe(true)
    expect(reduce.fullMaterialization).toBe(false)
    expect(sort.streamTermination).toBe(false)
    expect(sort.fullMaterialization).toBe(true)
  })
})

describe('OperatorEvidenceV1 joins', () => {
  it('invalidates old semantic, lowering, and descriptor hashes without feeding evidence back', () => {
    const record = requireOperatorDefinitionByNameV1('map')
    const lowering = record.lowerings.find(({ targetTier }) => targetTier === 'compiler')!
    const descriptor = projectRunnerDescriptorV1(lowering)
    const external = {
      emittedArtifactHash: `sha256:${'1'.repeat(64)}`,
      corpora: [RETAINED_COMPILER_OPERATION_CORPUS_V1],
    } as const
    const evidenceInput = {
      protocol: 'stopcock.operator-evidence',
      protocolVersion: 1,
      status: 'declared',
      semantic: lowering.semantic,
      loweringId: lowering.loweringId,
      loweringHash: lowering.loweringHash,
      descriptorId: descriptor.descriptorId,
      descriptorHash: descriptor.descriptorHash,
      emittedArtifactHash: external.emittedArtifactHash,
      corpora: external.corpora,
    } as const
    const evidence: OperatorEvidenceV1 = {
      ...evidenceInput,
      evidenceId: `@stopcock/evidence/${hashCanonical(evidenceInput).slice('sha256:'.length)}`,
    }

    expect(() =>
      assertEvidenceJoinsCurrentV1(
        evidence,
        OPERATOR_SEMANTICS_V1,
        OPERATOR_LOWERINGS_V1,
        FUSION_RUNNER_DESCRIPTORS_V1,
        external,
      ),
    ).not.toThrow()
    expect(() =>
      assertEvidenceJoinsCurrentV1(
        {
          ...evidence,
          semantic: {
            ...evidence.semantic,
            semanticHash: `sha256:${'2'.repeat(64)}`,
          },
        },
        OPERATOR_SEMANTICS_V1,
        OPERATOR_LOWERINGS_V1,
        FUSION_RUNNER_DESCRIPTORS_V1,
        external,
      ),
    ).toThrow(/stale semantic hash/u)
    expect(() =>
      assertEvidenceJoinsCurrentV1(
        {
          ...evidence,
          loweringHash: `sha256:${'3'.repeat(64)}`,
        },
        OPERATOR_SEMANTICS_V1,
        OPERATOR_LOWERINGS_V1,
        FUSION_RUNNER_DESCRIPTORS_V1,
        external,
      ),
    ).toThrow(/stale lowering hash/u)
    expect(() =>
      assertEvidenceJoinsCurrentV1(
        {
          ...evidence,
          descriptorHash: `sha256:${'4'.repeat(64)}`,
        },
        OPERATOR_SEMANTICS_V1,
        OPERATOR_LOWERINGS_V1,
        FUSION_RUNNER_DESCRIPTORS_V1,
        external,
      ),
    ).toThrow(/stale runner descriptor hash/u)
    expect(() =>
      assertEvidenceJoinsCurrentV1(
        {
          ...evidence,
          emittedArtifactHash: `sha256:${'5'.repeat(64)}`,
        },
        OPERATOR_SEMANTICS_V1,
        OPERATOR_LOWERINGS_V1,
        FUSION_RUNNER_DESCRIPTORS_V1,
        external,
      ),
    ).toThrow(/stale emitted artifact hash/u)
    expect(() =>
      assertEvidenceJoinsCurrentV1(
        {
          ...evidence,
          corpora: [
            {
              ...RETAINED_COMPILER_OPERATION_CORPUS_V1,
              corpusHash: `sha256:${'6'.repeat(64)}`,
            },
          ],
        },
        OPERATOR_SEMANTICS_V1,
        OPERATOR_LOWERINGS_V1,
        FUSION_RUNNER_DESCRIPTORS_V1,
        external,
      ),
    ).toThrow(/stale corpus hash/u)
    expect(() =>
      assertEvidenceJoinsCurrentV1(
        {
          ...evidence,
          evidenceId: '@stopcock/evidence/not-the-current-identity',
        },
        OPERATOR_SEMANTICS_V1,
        OPERATOR_LOWERINGS_V1,
        FUSION_RUNNER_DESCRIPTORS_V1,
        external,
      ),
    ).toThrow(/evidence identity hash drift/u)
    expect(record.semantic).not.toHaveProperty('evidence')
    expect(lowering).not.toHaveProperty('evidence')
    expect(descriptor).not.toHaveProperty('evidence')
  })

  it('emits only declared corpus-bound compiler evidence', () => {
    const index = JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL('../../codegen/generated/operator-evidence-v1.json', import.meta.url),
        ),
        'utf8',
      ),
    ) as {
      retainedCorpora: readonly unknown[]
      entries: readonly OperatorEvidenceV1[]
    }
    expect(index.retainedCorpora).toEqual([RETAINED_COMPILER_OPERATION_CORPUS_V1])
    expect(index.entries).toHaveLength(59)
    for (const evidence of index.entries) {
      expect(evidence.status).toBe('declared')
      expect(evidence.loweringId).toContain('/lowering/compiler-aot')
      expect(evidence.corpora).toEqual([RETAINED_COMPILER_OPERATION_CORPUS_V1])
      const { evidenceId, ...identityInput } = evidence
      expect(evidenceId).toBe(
        `@stopcock/evidence/${hashCanonical(identityInput).slice('sha256:'.length)}`,
      )
    }
  })
})

describe('ReceiptSchemaV1 generated view parity', () => {
  const hash = `sha256:${'a'.repeat(64)}`
  const compilerReceipt = {
    kind: 'stopcock.compiler-receipt',
    schemaVersion: 1,
    receiptId: hash,
    sourcePath: 'src/example.ts',
    sourceHash: hash,
    sourceSpecifier: '@stopcock/fp',
    sourceExport: 'pipe',
    sourceSpan: {
      startLine: 1,
      startColumn: 0,
      endLine: 1,
      endColumn: 42,
    },
    siteFingerprint: hash,
    compilerHash: hash,
    configHash: hash,
    semanticManifestHash: hash,
    semanticIds: [
      {
        semanticId: '@stopcock/fp/array/map',
        semanticRevision: 1,
        semanticHash: hash,
        mode: 'exact',
      },
    ],
    semanticMode: 'exact',
    segmentKinds: ['stream'],
    disposition: 'transformed',
    loweringHash: hash,
    fallbackTier: 'sequential',
    reasonCodes: [],
    emittedCodeHash: hash,
    sourceMapHash: null,
    artifactContext: {
      fpArtifactHash: hash,
      compilerArtifactHash: hash,
      optimizerArtifactHash: null,
      fpAbiHash: hash,
      optimizerBankHash: null,
    },
    evidenceRefs: [hash],
  }
  const planReceipt = {
    kind: 'stopcock.plan-receipt',
    schemaVersion: 1,
    receiptId: hash,
    planHash: hash,
    semanticManifestHash: hash,
    semanticIds: compilerReceipt.semanticIds,
    segmentKinds: ['stream'],
    selectedLoweringHashes: [hash],
    fallbackTier: 'sequential',
    reasonCodes: [],
    evidenceRefs: [hash],
  }
  const runtimeProfile = {
    kind: 'stopcock.runtime-profile',
    schemaVersion: 1,
    profileId: hash,
    receiptId: hash,
    planHash: hash,
    artifactHash: hash,
    runtimeHash: hash,
    executions: 1,
    inputSizeBucket: 'small',
    consumedItems: 3,
    selectedRunnerId: '@stopcock/fp/runner/portable/v1',
    executedRunnerId: '@stopcock/fp/runner/portable/v1',
    hotness: 1,
    timingNanoseconds: 100,
    allocations: [
      {
        scope: 'fusion-runner-result',
        count: 1,
        bytes: 24,
      },
    ],
    privacy: {
      inputValues: false,
      callbackCaptures: false,
      resultValues: false,
    },
  }
  const evidenceRef = {
    kind: 'stopcock.release-evidence-ref',
    schemaVersion: 1,
    evidenceRefId: hash,
    evidenceKind: 'semantic-differential',
    artifactHash: hash,
    semanticHash: hash,
    loweringHash: hash,
    corpusHash: hash,
    status: 'corpus-verified',
  }

  it('uses one schema hash and accepts the same fixture in debug and compiler views', () => {
    expect(DEBUG_RECEIPT_SCHEMA_HASH).toBe(COMPILER_RECEIPT_SCHEMA_HASH)
    for (const fixture of [
      compilerReceipt,
      planReceipt,
      runtimeProfile,
      evidenceRef,
      { ...evidenceRef, status: 'stale' },
      { ...evidenceRef, status: 'unavailable' },
      { ...compilerReceipt, sourcePath: `external/sha256-${'a'.repeat(64)}` },
    ]) {
      expect(validateDebugReceipt(fixture)).toEqual(validateCompilerReceipt(fixture))
      expect(validateDebugReceipt(fixture).ok).toBe(true)
    }
  })

  it('rejects unknown versions, fields, vocabulary, hashes, and mismatched joins identically', () => {
    const invalidFixtures = [
      { ...compilerReceipt, schemaVersion: 2 },
      { ...compilerReceipt, surprise: true },
      { ...compilerReceipt, reasonCodes: ['made-up-reason'] },
      { ...compilerReceipt, sourceHash: 'not-a-hash' },
      { ...compilerReceipt, sourcePath: '../outside.ts' },
      { ...compilerReceipt, sourcePath: 'external/foo.ts' },
      { ...compilerReceipt, sourcePath: 'external/sha256-not-a-hash' },
      { ...evidenceRef, status: 'verified' },
      {
        ...runtimeProfile,
        privacy: { ...runtimeProfile.privacy, inputValues: true },
      },
    ]
    for (const fixture of invalidFixtures) {
      expect(validateDebugReceipt(fixture)).toEqual(validateCompilerReceipt(fixture))
      expect(validateDebugReceipt(fixture).ok).toBe(false)
    }
    const mismatched = `sha256:${'b'.repeat(64)}`
    expect(validateDebugJoin(compilerReceipt as never, { sourceHash: mismatched })).toEqual(
      validateCompilerJoin(compilerReceipt as never, { sourceHash: mismatched }),
    )
    expect(validateDebugJoin(compilerReceipt as never, { sourceHash: mismatched }).ok).toBe(false)
    expect(validateDebugJoin(compilerReceipt as never, { semanticHash: hash }).ok).toBe(true)
    expect(validateCompilerJoin(planReceipt as never, { loweringHash: hash }).ok).toBe(true)
    expect(validateDebugJoin(compilerReceipt as never, { artifactHash: hash })).toEqual(
      validateCompilerJoin(compilerReceipt as never, { artifactHash: hash }),
    )
    expect(validateDebugJoin(compilerReceipt as never, { artifactHash: hash }).ok).toBe(false)
  })

  it('keeps both generated validators dependency-free and emits no premature optimizer view', () => {
    const debugPath = fileURLToPath(
      new URL('../internal/fusion-debug-receipt-schema.generated.ts', import.meta.url),
    )
    const compilerPath = fileURLToPath(
      new URL('../../../fp-compiler/src/receipt-schema.generated.ts', import.meta.url),
    )
    expect(readFileSync(debugPath, 'utf8')).not.toMatch(/^import\s/mu)
    expect(readFileSync(compilerPath, 'utf8')).not.toMatch(/^import\s/mu)
    expect(
      existsSync(
        fileURLToPath(
          new URL('../../../fp-optimizer/src/receipt-schema.generated.ts', import.meta.url),
        ),
      ),
    ).toBe(false)
  })
})
