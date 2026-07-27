import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vite-plus/test'
import { SUPPORTED_OP_NAMES } from '../../../packages/fp-compiler/src/ops'
import {
  COMPILER_PERF_POLICIES,
  EXPECTED_COMPILER_IMPLEMENTATION_FILES,
  EXPECTED_COMPILER_SUBJECT_ID,
  EXPECTED_COMPILER_SUPPORTED_OP_NAMES,
  EXPECTED_COMPILER_SUPPORTED_OPS_SHA256,
  minimumCompilerBatchIterations,
} from './compiler-perf-contract'
import {
  COMPILER_OPERATION_CASES,
  compilerOperationCorpusProjection,
  type CompilerOperationCorpusCase,
} from './compiler-operation-corpus'
import {
  EXPECTED_COMPILER_OPERATION_CASE_NAMES,
  EXPECTED_COMPILER_OPERATION_CORPUS,
  EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS,
  EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT,
  EXPECTED_COMPILER_OPERATION_REFERENCE,
  isCompilerOperationOptimizerCanary,
} from './compiler-operation-perf-contract'
import {
  evaluateCompilerOperationPerfReport,
  type CompilerOperationPerfEvaluation,
} from './compiler-operation-perf-gate'
import {
  expectedOperationConsumedItems,
  validateCompilerOperationCase,
  type CompilerOperationPerfCase,
  type CompilerOperationPerfReport,
} from './compiler-operation-perf'
import { generateInputArray } from './generate'
import type { PerfEngine, PerfEngineId } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
  SYMMETRIC_PAIRED_COMBINATION,
  SYMMETRIC_PAIRED_ORIENTATION_ISOLATION,
  SYMMETRIC_PAIRED_SAMPLER_ID,
  SYMMETRIC_PAIRED_SAMPLER_ORDER,
} from './perf-runner'

const ENGINES: Readonly<Record<PerfEngineId, PerfEngine>> = {
  'bun-jsc': {
    id: 'bun-jsc',
    name: 'Bun/JavaScriptCore',
    runtime: 'bun',
    runtimeVersion: '1.3.14',
    nodeCompatibility: '24.3.0',
    platform: 'darwin',
    architecture: 'arm64',
  },
  'node-v8': {
    id: 'node-v8',
    name: 'Node/V8',
    runtime: 'node',
    runtimeVersion: '24.18.0',
    v8: '13.6.233.17-node.50',
    platform: 'darwin',
    architecture: 'arm64',
  },
}

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

const makeCase = (
  item: CompilerOperationCorpusCase,
  engineId: PerfEngineId,
  ratio = 1,
): CompilerOperationPerfCase => {
  const policy = COMPILER_PERF_POLICIES[engineId]
  const input = generateInputArray(item.inputSeed, item.size)
  const consumedInputItems = expectedOperationConsumedItems(item, input)
  const batchIterations = minimumCompilerBatchIterations(consumedInputItems, policy)
  const microBatchIterations = consumedItemsMicroBatchIterations(
    consumedInputItems,
    batchIterations,
    policy.targetConsumedItemsPerMicroBatch,
  )
  const rounds = policy.minimumRounds
  const baseSampling = {
    id: INTERLEAVED_PAIRED_SAMPLER_ID,
    order: INTERLEAVED_PAIRED_SAMPLER_ORDER,
    batchIterationsPerSide: batchIterations,
    microBatchIterations,
    microBatchesPerSide: Math.ceil(batchIterations / microBatchIterations),
  } as const
  // Deliberately inject a 4x A/B lexical-site multiplier. The symmetric
  // products cancel it while retaining the requested candidate ratio.
  const candidateAtACandidateSamples = Array.from({ length: rounds }, () => 200)
  const candidateAtAReferenceSamples = Array.from({ length: rounds }, () => 50 * ratio)
  const candidateAtBCandidateSamples = Array.from({ length: rounds }, () => 50)
  const candidateAtBReferenceSamples = Array.from({ length: rounds }, () => 200 * ratio)
  const compilerSamplesNs = candidateAtACandidateSamples.map(
    (sample, index) => Math.sqrt(sample) * Math.sqrt(candidateAtBCandidateSamples[index]),
  )
  const referenceSamplesNs = candidateAtAReferenceSamples.map(
    (sample, index) => Math.sqrt(sample) * Math.sqrt(candidateAtBReferenceSamples[index]),
  )
  const pairedRatios = compilerSamplesNs.map((sample, index) => referenceSamplesNs[index] / sample)
  const measuredRatio = pairedRatios[0]
  return {
    name: item.name,
    targetOp: item.targetOp,
    optimizerCanary: isCompilerOperationOptimizerCanary(item.targetOp),
    opcode: item.opcode,
    category: item.category,
    sourceSteps: item.sourceSteps,
    inputSize: item.size,
    consumedInputItems,
    correctnessOk: true,
    transformedSiteCount: 1,
    workerEngine: ENGINES[engineId],
    rounds,
    batchIterations,
    sampling: {
      id: SYMMETRIC_PAIRED_SAMPLER_ID,
      order: SYMMETRIC_PAIRED_SAMPLER_ORDER,
      combination: SYMMETRIC_PAIRED_COMBINATION,
      orientationIsolation: SYMMETRIC_PAIRED_ORIENTATION_ISOLATION,
      baseSamplerId: INTERLEAVED_PAIRED_SAMPLER_ID,
      orientations: 2,
      batchIterationsPerSide: batchIterations,
      microBatchIterations,
      microBatchesPerSide: Math.ceil(batchIterations / microBatchIterations),
      targetConsumedItemsPerMicroBatch: policy.targetConsumedItemsPerMicroBatch,
      nominalConsumedItemsPerMicroBatch: microBatchIterations * consumedInputItems,
    },
    orientationSamples: {
      candidateAtA: {
        orientation: 'candidate-at-a',
        aRole: 'candidate',
        bRole: 'reference',
        caseName: item.name,
        targetOp: item.targetOp,
        inputSize: item.size,
        consumedInputItems,
        correctnessOk: true,
        transformedSiteCount: 1,
        workerEngine: ENGINES[engineId],
        rounds,
        batchIterations,
        sampling: baseSampling,
        candidateSamplesNs: candidateAtACandidateSamples,
        referenceSamplesNs: candidateAtAReferenceSamples,
      },
      candidateAtB: {
        orientation: 'candidate-at-b',
        aRole: 'reference',
        bRole: 'candidate',
        caseName: item.name,
        targetOp: item.targetOp,
        inputSize: item.size,
        consumedInputItems,
        correctnessOk: true,
        transformedSiteCount: 1,
        workerEngine: ENGINES[engineId],
        rounds,
        batchIterations,
        sampling: baseSampling,
        candidateSamplesNs: candidateAtBCandidateSamples,
        referenceSamplesNs: candidateAtBReferenceSamples,
      },
    },
    medianRatio: measuredRatio,
    meanRatio: measuredRatio,
    ciLow: measuredRatio,
    ciHigh: measuredRatio,
    signTestP: measuredRatio === 1 ? 1 : 1.8189894035458565e-12,
    relativeMarginOfError: 0,
    compilerSamplesNs,
    referenceSamplesNs,
    pairedRatios,
  }
}

const makeCases = (engineId: PerfEngineId = 'bun-jsc'): CompilerOperationPerfCase[] =>
  COMPILER_OPERATION_CASES.map((item) => makeCase(item, engineId))

const geomean = (values: readonly number[]): number =>
  Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)

const makeReport = (
  cases: readonly CompilerOperationPerfCase[],
  engineId: PerfEngineId = 'bun-jsc',
  overrides: Partial<CompilerOperationPerfReport> = {},
): CompilerOperationPerfReport => {
  const policy = COMPILER_PERF_POLICIES[engineId]
  const performanceCases = cases.filter((item) => !item.optimizerCanary)
  const ratios = performanceCases.map((item) => item.medianRatio)
  return {
    version: 3,
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine: ENGINES[engineId],
    optimizerCanaryOps: EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS,
    corpus: EXPECTED_COMPILER_OPERATION_CORPUS,
    reference: EXPECTED_COMPILER_OPERATION_REFERENCE,
    compiler: {
      id: EXPECTED_COMPILER_SUBJECT_ID,
      implementationFiles: EXPECTED_COMPILER_IMPLEMENTATION_FILES,
      implementationSha256: 'a'.repeat(64),
      supportedOps: EXPECTED_COMPILER_SUPPORTED_OP_NAMES,
      supportedOpsSha256: EXPECTED_COMPILER_SUPPORTED_OPS_SHA256,
    },
    args: {
      rounds: policy.minimumRounds,
      warmupRounds: policy.minimumWarmupRounds,
      minimumBatchInputItems: policy.minimumBatchInputItems,
      targetConsumedItemsPerMicroBatch: policy.targetConsumedItemsPerMicroBatch,
      quick: false,
    },
    summary: {
      count: cases.length,
      expectedCount: EXPECTED_COMPILER_OPERATION_CORPUS.totalCaseCount,
      performanceCount: performanceCases.length,
      optimizerCanaryCount: cases.length - performanceCases.length,
      geomeanRatio: geomean(ratios),
      minRatio: Math.min(...ratios),
      maxRelativeMarginOfError: Math.max(
        ...performanceCases.map((item) => item.relativeMarginOfError),
      ),
      allCorrect: true,
      complete: true,
    },
    cases,
    skipped: [],
    ...overrides,
  }
}

const failures = (evaluation: CompilerOperationPerfEvaluation): string =>
  evaluation.failures.join('\n')

describe('fp-compiler operation-complete performance policy', () => {
  test('pins one ordered case per supported operation and a separate frozen reference', async () => {
    const projection = compilerOperationCorpusProjection()
    const referenceBytes = await readFile(
      new URL('./compiler-operation-emitter.ts', import.meta.url),
    )
    const supportedOps = [...SUPPORTED_OP_NAMES].sort()

    expect(COMPILER_OPERATION_CASES).toHaveLength(140)
    expect(EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS).toEqual(['isEmpty', 'length'])
    expect(EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT).toBe(138)
    expect(
      COMPILER_OPERATION_CASES.filter((item) =>
        isCompilerOperationOptimizerCanary(item.targetOp),
      ).map((item) => item.name),
    ).toEqual(['operation/isEmpty', 'operation/length'])
    expect(COMPILER_OPERATION_CASES.map((item) => item.name)).toEqual(
      EXPECTED_COMPILER_OPERATION_CASE_NAMES,
    )
    expect(COMPILER_OPERATION_CASES.map((item) => item.targetOp)).toEqual(supportedOps)
    expect(new Set(COMPILER_OPERATION_CASES.map((item) => item.targetOp)).size).toBe(
      supportedOps.length,
    )
    expect(new Set(COMPILER_OPERATION_CASES.map((item) => item.opcode)).size).toBe(
      supportedOps.length,
    )
    expect(
      COMPILER_OPERATION_CASES.every((item) =>
        item.sourceSteps.some((step) => step.startsWith(`A.${item.targetOp}`)),
      ),
    ).toBe(true)
    expect(supportedOps).toEqual(EXPECTED_COMPILER_SUPPORTED_OP_NAMES)
    expect(jsonSha256(projection)).toBe(EXPECTED_COMPILER_OPERATION_CORPUS.sha256)
    expect(jsonSha256(projection.map((item) => item.name))).toBe(
      EXPECTED_COMPILER_OPERATION_CORPUS.caseNamesSha256,
    )
    expect(jsonSha256(projection.map((item) => item.targetOp))).toBe(
      EXPECTED_COMPILER_OPERATION_CORPUS.targetOpsSha256,
    )
    expect(jsonSha256(projection.map((item) => [item.targetOp, item.opcode]))).toBe(
      EXPECTED_COMPILER_OPERATION_CORPUS.opcodesSha256,
    )
    expect(sha256(referenceBytes)).toBe(EXPECTED_COMPILER_OPERATION_REFERENCE.sha256)
  })

  test('semantically matches the independent reference and transforms exactly one site for all 140 operations', () => {
    const failures: string[] = []
    for (const item of COMPILER_OPERATION_CASES) {
      const result = validateCompilerOperationCase(item)
      if (!result.correctnessOk || result.transformedSiteCount !== 1) {
        failures.push(
          `${item.name}: correct=${result.correctnessOk}, transformed=${result.transformedSiteCount}, compiler=${JSON.stringify(result.compilerValue)}, reference=${JSON.stringify(result.referenceValue)}`,
        )
      }
    }
    expect(failures).toEqual([])
  })

  test('checks empty and singleton edge semantics for the complete operation surface', () => {
    const failures: string[] = []
    for (const item of COMPILER_OPERATION_CASES) {
      for (const input of [[], [3]] as const) {
        const result = validateCompilerOperationCase(item, input)
        if (!result.correctnessOk || result.transformedSiteCount !== 1) {
          failures.push(
            `${item.name}/${input.length}: correct=${result.correctnessOk}, transformed=${result.transformedSiteCount}`,
          )
        }
      }
    }
    expect(failures).toEqual([])
  })

  test('accepts a complete process-isolated symmetric report on Bun and Node', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      const evaluation = evaluateCompilerOperationPerfReport(
        makeReport(makeCases(engineId), engineId),
      )
      expect(evaluation.passed).toBe(true)
      expect(evaluation.failures).toEqual([])
      expect(evaluation.measurements).toHaveLength(2)
      expect(evaluation.measurements.map((item) => item.count)).toEqual([
        EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT,
        EXPECTED_COMPILER_OPERATION_PERFORMANCE_COUNT,
      ])
    }
  })

  test('cancels reciprocal lexical-site bias while preserving a real implementation ratio', () => {
    const cases = makeCases()
    const symmetric = makeCase(COMPILER_OPERATION_CASES[0], 'bun-jsc', 1.2)
    cases[0] = symmetric
    const forwardRatio =
      symmetric.orientationSamples.candidateAtA.referenceSamplesNs[0] /
      symmetric.orientationSamples.candidateAtA.candidateSamplesNs[0]
    const reverseRatio =
      symmetric.orientationSamples.candidateAtB.referenceSamplesNs[0] /
      symmetric.orientationSamples.candidateAtB.candidateSamplesNs[0]

    expect(forwardRatio).toBeCloseTo(0.3)
    expect(reverseRatio).toBeCloseTo(4.8)
    expect(Math.sqrt(forwardRatio * reverseRatio)).toBeCloseTo(1.2)
    expect(symmetric.compilerSamplesNs[0]).toBeCloseTo(100)
    expect(symmetric.referenceSamplesNs[0]).toBeCloseTo(120)
    expect(evaluateCompilerOperationPerfReport(makeReport(cases)).passed).toBe(true)
  })

  test('fails closed on legacy v1 and v2 reports', () => {
    const report = makeReport(makeCases())
    for (const version of [1, 2] as const) {
      const legacy = {
        ...report,
        version,
      } as unknown as CompilerOperationPerfReport
      const evaluation = evaluateCompilerOperationPerfReport(legacy)
      expect(evaluation.passed).toBe(false)
      expect(failures(evaluation)).toContain('unexpected operation report version')
    }
  })

  test('retains both optimizer canaries but excludes them from performance policy', () => {
    const cases = makeCases()
    for (const targetOp of EXPECTED_COMPILER_OPERATION_OPTIMIZER_CANARY_OPS) {
      const index = COMPILER_OPERATION_CASES.findIndex((item) => item.targetOp === targetOp)
      cases[index] = makeCase(COMPILER_OPERATION_CASES[index], 'bun-jsc', 0.01)
    }
    const report = makeReport(cases)
    const evaluation = evaluateCompilerOperationPerfReport(report)

    expect(report.cases).toHaveLength(140)
    expect(report.summary.performanceCount).toBe(138)
    expect(report.summary.optimizerCanaryCount).toBe(2)
    expect(evaluation.passed).toBe(true)
    expect(evaluation.measurements).toEqual([
      expect.objectContaining({ count: 138, actual: 1 }),
      expect.objectContaining({ count: 138, actual: 1 }),
    ])
  })

  test('still validates optimizer-canary classification and raw evidence', () => {
    const cases = makeCases()
    const canaryIndex = COMPILER_OPERATION_CASES.findIndex((item) => item.targetOp === 'isEmpty')
    const canary = cases[canaryIndex]
    cases[canaryIndex] = {
      ...canary,
      optimizerCanary: false,
      orientationSamples: {
        ...canary.orientationSamples,
        candidateAtA: {
          ...canary.orientationSamples.candidateAtA,
          candidateSamplesNs: [
            Number.NaN,
            ...canary.orientationSamples.candidateAtA.candidateSamplesNs.slice(1),
          ],
        },
      },
    }
    const report = makeReport(cases, 'bun-jsc', {
      optimizerCanaryOps: ['length'],
    } as Partial<CompilerOperationPerfReport>)
    const output = failures(evaluateCompilerOperationPerfReport(report))

    expect(output).toContain('operation optimizer-canary set does not match the pinned contract')
    expect(output).toContain('optimizer-canary classification does not match the pinned contract')
    expect(output).toContain('all four orientation raw samples must be finite and positive')
  })

  test('keeps the existing compiler floors unchanged for the additive operation lane', () => {
    expect(COMPILER_PERF_POLICIES['bun-jsc']).toMatchObject({
      minimumGeomean: 0.9,
      minimumCaseRatio: 0.8,
    })
    expect(COMPILER_PERF_POLICIES['node-v8']).toMatchObject({
      minimumGeomean: 0.9,
      minimumCaseRatio: 0.7,
    })
  })

  test('budgets short-circuit and constant-time rows by deterministic visited items', () => {
    const consumed = Object.fromEntries(
      COMPILER_OPERATION_CASES.map((item) => [
        item.targetOp,
        expectedOperationConsumedItems(item, generateInputArray(item.inputSeed, item.size)),
      ]),
    )
    expect(consumed.head).toBe(1)
    expect(consumed.last).toBe(1)
    expect(consumed.length).toBe(1)
    expect(consumed.isEmpty).toBe(1)
    expect(consumed.take).toBe(512)
    expect(consumed.mapWhile).toBeLessThan(1_024)
    expect(consumed.takeUntil).toBeLessThan(1_024)
    expect(consumed.takeWhile).toBeLessThan(1_024)
    expect(consumed.map).toBe(1_024)
  })

  test('fails closed on filtering, missing operations, opcode drift, incorrect semantics, and untransformed rows', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      targetOp: 'map',
      correctnessOk: false,
      transformedSiteCount: 0,
    }
    const base = makeReport(cases)
    const report = makeReport(cases.slice(0, -1), 'bun-jsc', {
      args: {
        ...base.args,
        quick: true,
        casesFilter: 'operation/map',
      },
      summary: {
        ...base.summary,
        count: cases.length - 1,
        complete: false,
        allCorrect: false,
      },
      skipped: ['operation/without failed'],
    })
    const output = failures(evaluateCompilerOperationPerfReport(report))
    expect(output).toContain('must not use --quick')
    expect(output).toContain('cannot filter')
    expect(output).toContain('every supported opcode exactly once')
    expect(output).toContain('expected 140 rows')
    expect(output).toContain('incorrect')
    expect(output).toContain('expected one compiler-transformed site')
    expect(output).toContain('skipped')
  })

  test('pins both worker orientations, roles, provenance, runtime, and base sampling', () => {
    const cases = makeCases()
    const base = cases[0]
    cases[0] = {
      ...base,
      sampling: {
        ...base.sampling,
        order: 'forged-symmetric-order',
        combination: 'forged-combination',
        baseSamplerId: 'forged-base-sampler',
        orientations: 1,
        orientationIsolation: 'same-process',
      },
      orientationSamples: {
        candidateAtA: {
          ...base.orientationSamples.candidateAtA,
          orientation: 'candidate-at-b',
          aRole: 'reference',
          bRole: 'candidate',
          workerEngine: ENGINES['node-v8'],
          rounds: base.rounds - 1,
          batchIterations: base.batchIterations - 1,
          sampling: {
            ...base.orientationSamples.candidateAtA.sampling,
            id: 'forged-base-sampler',
          },
        },
        candidateAtB: {
          ...base.orientationSamples.candidateAtB,
          caseName: 'operation/not-the-row',
          targetOp: 'map',
          inputSize: base.inputSize + 1,
          consumedInputItems: base.consumedInputItems + 1,
          correctnessOk: false,
          transformedSiteCount: 0,
        },
      },
    } as unknown as CompilerOperationPerfCase
    const output = failures(evaluateCompilerOperationPerfReport(makeReport(cases)))

    expect(output).toContain('symmetric orientations were not measured in fresh processes')
    expect(output).toContain('unexpected sampler order')
    expect(output).toContain('candidate-at-a: orientation roles are invalid')
    expect(output).toContain('candidate-at-a: worker runtime identity does not match')
    expect(output).toContain('candidate-at-a: worker rounds or batch size do not match')
    expect(output).toContain('candidate-at-a: unexpected base sampler identity or order')
    expect(output).toContain('candidate-at-b: worker case provenance does not match')
    expect(output).toContain('candidate-at-b: compiler/reference semantics are incorrect')
    expect(output).toContain('candidate-at-b: expected one compiler-transformed site')
  })

  test('rejects a report that omits either raw orientation', () => {
    const cases = makeCases()
    const base = cases[0]
    cases[0] = {
      ...base,
      orientationSamples: {
        candidateAtA: base.orientationSamples.candidateAtA,
      },
    } as unknown as CompilerOperationPerfCase
    const output = failures(evaluateCompilerOperationPerfReport(makeReport(cases)))
    expect(output).toContain('both symmetric orientation reports are required')
    expect(output).toContain('symmetric raw or derived sample count is incomplete')
  })

  test('recomputes symmetric samples, ratios, aggregate statistics, interval, sign test, and RME', () => {
    const malformedRawCases = makeCases()
    malformedRawCases[0] = {
      ...malformedRawCases[0],
      orientationSamples: {
        ...malformedRawCases[0].orientationSamples,
        candidateAtA: {
          ...malformedRawCases[0].orientationSamples.candidateAtA,
          candidateSamplesNs: [
            0,
            ...malformedRawCases[0].orientationSamples.candidateAtA.candidateSamplesNs.slice(1),
          ],
        },
        candidateAtB: {
          ...malformedRawCases[0].orientationSamples.candidateAtB,
          referenceSamplesNs:
            malformedRawCases[0].orientationSamples.candidateAtB.referenceSamplesNs.slice(1),
        },
      },
    }
    const malformedRawOutput = failures(
      evaluateCompilerOperationPerfReport(makeReport(malformedRawCases)),
    )
    expect(malformedRawOutput).toContain('symmetric raw or derived sample count')
    expect(malformedRawOutput).toContain(
      'all four orientation raw samples must be finite and positive',
    )

    const forgedStatisticsCases = makeCases()
    forgedStatisticsCases[0] = {
      ...forgedStatisticsCases[0],
      compilerSamplesNs: [999, ...forgedStatisticsCases[0].compilerSamplesNs.slice(1)],
      referenceSamplesNs: [999, ...forgedStatisticsCases[0].referenceSamplesNs.slice(1)],
      pairedRatios: [2, ...forgedStatisticsCases[0].pairedRatios.slice(1)],
      medianRatio: 2,
      meanRatio: 2,
      ciLow: 0.5,
      ciHigh: 2.5,
      signTestP: 0,
      relativeMarginOfError: 1,
    }
    const forgedStatisticsOutput = failures(
      evaluateCompilerOperationPerfReport(makeReport(forgedStatisticsCases)),
    )
    expect(forgedStatisticsOutput).toContain(
      'derived samples do not match symmetric orientation raw samples',
    )
    expect(forgedStatisticsOutput).toContain(
      'paired ratios do not match symmetric orientation raw samples',
    )
    expect(forgedStatisticsOutput).toContain('invalid median ratio')
    expect(forgedStatisticsOutput).toContain('invalid mean ratio')
    expect(forgedStatisticsOutput).toContain('confidence interval does not match')
    expect(forgedStatisticsOutput).toContain('sign-test p-value does not match')
    expect(forgedStatisticsOutput).toContain('relative margin of error does not match')
  })

  test('enforces the per-operation worst-case floor without geomean masking', () => {
    for (const [engineId, ratio] of [
      ['bun-jsc', 0.79],
      ['node-v8', 0.69],
    ] as const) {
      const cases = makeCases(engineId)
      cases[0] = makeCase(COMPILER_OPERATION_CASES[0], engineId, ratio)
      const evaluation = evaluateCompilerOperationPerfReport(makeReport(cases, engineId))
      expect(evaluation.passed).toBe(false)
      expect(failures(evaluation)).toContain('operation/adjust: median ratio')
      expect(failures(evaluation)).toContain('operation worst case')
      expect(evaluation.measurements[0].passed).toBe(true)
      expect(evaluation.measurements[1].passed).toBe(false)
    }
  })

  test('accepts noisy rows only when their recomputed interval clears the case floor', () => {
    const makeNoisyCase = (low: number, high: number): CompilerOperationPerfCase => {
      const base = makeCase(COMPILER_OPERATION_CASES[0], 'bun-jsc')
      const pairedRatios = Array.from({ length: base.rounds }, (_, index) =>
        index < base.rounds / 2 ? low : high,
      )
      const candidateAtACandidateSamples = pairedRatios.map(() => 200)
      const candidateAtAReferenceSamples = pairedRatios.map((ratio) => 50 * ratio)
      const candidateAtBCandidateSamples = pairedRatios.map(() => 50)
      const candidateAtBReferenceSamples = pairedRatios.map((ratio) => 200 * ratio)
      const compilerSamplesNs = candidateAtACandidateSamples.map(
        (sample, index) => Math.sqrt(sample) * Math.sqrt(candidateAtBCandidateSamples[index]),
      )
      const referenceSamplesNs = candidateAtAReferenceSamples.map(
        (sample, index) => Math.sqrt(sample) * Math.sqrt(candidateAtBReferenceSamples[index]),
      )
      const recomputedRatios = compilerSamplesNs.map(
        (sample, index) => referenceSamplesNs[index] / sample,
      )
      return {
        ...base,
        orientationSamples: {
          candidateAtA: {
            ...base.orientationSamples.candidateAtA,
            candidateSamplesNs: candidateAtACandidateSamples,
            referenceSamplesNs: candidateAtAReferenceSamples,
          },
          candidateAtB: {
            ...base.orientationSamples.candidateAtB,
            candidateSamplesNs: candidateAtBCandidateSamples,
            referenceSamplesNs: candidateAtBReferenceSamples,
          },
        },
        compilerSamplesNs,
        referenceSamplesNs,
        pairedRatios: recomputedRatios,
        medianRatio: (low + high) / 2,
        meanRatio: (low + high) / 2,
        ciLow: low,
        ciHigh: high,
        signTestP: 1,
        relativeMarginOfError: ((high - low) / (low + high)) * 100,
      }
    }

    const safeCases = makeCases()
    safeCases[0] = makeNoisyCase(0.9, 1.1)
    expect(evaluateCompilerOperationPerfReport(makeReport(safeCases)).passed).toBe(true)

    const unsafeCases = makeCases()
    unsafeCases[0] = makeNoisyCase(0.7, 1.3)
    const unsafe = evaluateCompilerOperationPerfReport(makeReport(unsafeCases))
    expect(unsafe.passed).toBe(false)
    expect(failures(unsafe)).toContain('confidence-interval lower bound 0.700 is below 0.800')
  })

  test('rejects forged summaries and malformed shapes instead of throwing', () => {
    const base = makeReport(makeCases())
    const forged = {
      ...base,
      summary: {
        ...base.summary,
        geomeanRatio: 99,
        minRatio: 99,
      },
    }
    expect(failures(evaluateCompilerOperationPerfReport(forged))).toContain('summary statistics')

    const malformed = evaluateCompilerOperationPerfReport(
      null as unknown as CompilerOperationPerfReport,
    )
    expect(malformed.passed).toBe(false)
    expect(failures(malformed)).toContain('malformed')
  })
})
