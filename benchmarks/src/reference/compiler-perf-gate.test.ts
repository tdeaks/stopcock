import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vite-plus/test'
import { SUPPORTED_OP_NAMES } from '../../../packages/fp-compiler/src/ops'
import { evaluateCompilerPerfReport, type CompilerPerfEvaluation } from './compiler-perf-gate'
import {
  COMPILER_PERF_POLICIES,
  EXPECTED_COMPILER_COVERAGE,
  EXPECTED_COMPILER_IMPLEMENTATION_FILES,
  EXPECTED_COMPILER_SUBJECT_ID,
  EXPECTED_COMPILER_SUPPORTED_CASE_NAMES,
  EXPECTED_COMPILER_SUPPORTED_OP_NAMES,
  EXPECTED_COMPILER_SUPPORTED_OPS_SHA256,
  minimumCompilerBatchIterations,
} from './compiler-perf-contract'
import type { CompilerPerfCase, CompilerPerfCorpusCase, CompilerPerfReport } from './compiler-perf'
import type { PerfEngine, PerfEngineId } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'
import { EXPECTED_FROZEN_EMITTER, EXPECTED_PORTABLE_CORPUS } from './portable-perf-contract'

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
    runtimeVersion: '22.19.0',
    v8: '12.4.254.21-node.29',
    platform: 'darwin',
    architecture: 'arm64',
  },
}

const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex')

const jsonSha256 = (value: unknown): string => sha256(JSON.stringify(value))

const corpusBytes = await readFile(new URL('./perf-corpus.json', import.meta.url))
const corpus = JSON.parse(corpusBytes.toString('utf8')) as {
  readonly id: string
  readonly version: number
  readonly cases: readonly CompilerPerfCorpusCase[]
}

const makeCase = (
  item: CompilerPerfCorpusCase,
  engineId: PerfEngineId,
  ratio = 1,
): CompilerPerfCase => {
  const policy = COMPILER_PERF_POLICIES[engineId]
  const rounds = policy.minimumRounds
  const batchIterations = minimumCompilerBatchIterations(item.size, policy)
  const microBatchIterations = consumedItemsMicroBatchIterations(
    item.size,
    batchIterations,
    policy.targetConsumedItemsPerMicroBatch,
  )
  return {
    name: item.name,
    stepKinds: item.steps.map((step) => step.kind),
    strata: item.strata,
    inputSize: item.size,
    consumedInputItems: item.size,
    correctnessOk: true,
    transformedSiteCount: 1,
    workerEngine: ENGINES[engineId],
    rounds,
    batchIterations,
    sampling: {
      id: INTERLEAVED_PAIRED_SAMPLER_ID,
      order: INTERLEAVED_PAIRED_SAMPLER_ORDER,
      batchIterationsPerSide: batchIterations,
      microBatchIterations,
      microBatchesPerSide: Math.ceil(batchIterations / microBatchIterations),
      targetConsumedItemsPerMicroBatch: policy.targetConsumedItemsPerMicroBatch,
      nominalConsumedItemsPerMicroBatch: microBatchIterations * item.size,
    },
    medianRatio: ratio,
    meanRatio: ratio,
    ciLow: ratio,
    ciHigh: ratio,
    signTestP: ratio === 1 ? 1 : 1.8189894035458565e-12,
    relativeMarginOfError: 0,
    compilerSamplesNs: Array.from({ length: rounds }, () => 100),
    referenceSamplesNs: Array.from({ length: rounds }, () => 100 * ratio),
    pairedRatios: Array.from({ length: rounds }, () => ratio),
  }
}

const makeCases = (engineId: PerfEngineId = 'bun-jsc'): CompilerPerfCase[] =>
  corpus.cases.map((item) => makeCase(item, engineId))

const geomean = (values: readonly number[]): number =>
  Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)

const makeReport = (
  cases: readonly CompilerPerfCase[],
  engineId: PerfEngineId = 'bun-jsc',
  overrides: Partial<CompilerPerfReport> = {},
): CompilerPerfReport => {
  const policy = COMPILER_PERF_POLICIES[engineId]
  const ratios = cases.map((item) => item.medianRatio)
  return {
    version: 1,
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine: ENGINES[engineId],
    corpus: {
      ...EXPECTED_PORTABLE_CORPUS,
      totalCaseCount: EXPECTED_COMPILER_COVERAGE.corpusCaseCount,
    },
    reference: EXPECTED_FROZEN_EMITTER,
    compiler: {
      id: EXPECTED_COMPILER_SUBJECT_ID,
      implementationFiles: EXPECTED_COMPILER_IMPLEMENTATION_FILES,
      implementationSha256: 'a'.repeat(64),
      supportedOps: EXPECTED_COMPILER_SUPPORTED_OP_NAMES,
      supportedOpsSha256: EXPECTED_COMPILER_SUPPORTED_OPS_SHA256,
    },
    coverage: {
      corpusCaseCount: EXPECTED_COMPILER_COVERAGE.corpusCaseCount,
      supportedCaseCount: EXPECTED_COMPILER_COVERAGE.supportedCaseCount,
      gapCount: EXPECTED_COMPILER_COVERAGE.gapCount,
      supportedCaseNamesSha256: EXPECTED_COMPILER_COVERAGE.supportedCaseNamesSha256,
      projectionSha256: EXPECTED_COMPILER_COVERAGE.projectionSha256,
      gaps: [],
    },
    args: {
      rounds: policy.minimumRounds,
      warmupRounds: policy.minimumWarmupRounds,
      minimumBatchInputItems: policy.minimumBatchInputItems,
      targetConsumedItemsPerMicroBatch: policy.targetConsumedItemsPerMicroBatch,
      quick: false,
      corpusPath: '/workspace/benchmarks/src/reference/perf-corpus.json',
    },
    summary: {
      count: cases.length,
      expectedSupportedCount: EXPECTED_COMPILER_COVERAGE.supportedCaseCount,
      corpusCaseCount: EXPECTED_COMPILER_COVERAGE.corpusCaseCount,
      gapCount: EXPECTED_COMPILER_COVERAGE.gapCount,
      geomeanRatio: geomean(ratios),
      minRatio: Math.min(...ratios),
      maxRelativeMarginOfError: Math.max(...cases.map((item) => item.relativeMarginOfError)),
      allCorrect: true,
      complete: true,
    },
    cases,
    skipped: [],
    ...overrides,
  }
}

const failures = (evaluation: CompilerPerfEvaluation): string => evaluation.failures.join('\n')

describe('fp-compiler performance release policy', () => {
  test('pins corpus, emitter, capability set, and exact 44-case projection', async () => {
    const emitterBytes = await readFile(new URL('./emitter.ts', import.meta.url))
    const supportedOps = [...SUPPORTED_OP_NAMES].sort()
    const supportedCases = corpus.cases.filter((item) =>
      item.steps.every((step) => step.kind === 'toArray' || SUPPORTED_OP_NAMES.has(step.kind)),
    )
    const gaps = corpus.cases
      .filter((item) => !supportedCases.includes(item))
      .map((item) => ({
        name: item.name,
        steps: item.steps.map((step) => step.kind),
        unsupportedOps: [
          ...new Set(
            item.steps
              .map((step) => step.kind)
              .filter((kind) => kind !== 'toArray' && !SUPPORTED_OP_NAMES.has(kind)),
          ),
        ].sort(),
        reason: 'unsupported compiler ops',
      }))
    const projection = {
      supportedCases: supportedCases.map((item) => ({
        name: item.name,
        steps: item.steps.map((step) => step.kind),
      })),
      gaps,
    }

    expect(corpus).toMatchObject({
      id: EXPECTED_PORTABLE_CORPUS.id,
      version: EXPECTED_PORTABLE_CORPUS.version,
    })
    expect(corpus.cases).toHaveLength(EXPECTED_COMPILER_COVERAGE.corpusCaseCount)
    expect(sha256(corpusBytes)).toBe(EXPECTED_PORTABLE_CORPUS.sha256)
    expect(sha256(emitterBytes)).toBe(EXPECTED_FROZEN_EMITTER.sha256)
    expect(supportedOps).toEqual(EXPECTED_COMPILER_SUPPORTED_OP_NAMES)
    expect(jsonSha256(supportedOps)).toBe(EXPECTED_COMPILER_SUPPORTED_OPS_SHA256)
    expect(supportedCases.map((item) => item.name)).toEqual(EXPECTED_COMPILER_SUPPORTED_CASE_NAMES)
    expect(jsonSha256(supportedCases.map((item) => item.name))).toBe(
      EXPECTED_COMPILER_COVERAGE.supportedCaseNamesSha256,
    )
    expect(gaps).toEqual([])
    expect(jsonSha256(projection)).toBe(EXPECTED_COMPILER_COVERAGE.projectionSha256)
  })

  test('accepts a complete auditable report on both supported engines', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      const evaluation = evaluateCompilerPerfReport(makeReport(makeCases(engineId), engineId))

      expect(evaluation.passed).toBe(true)
      expect(evaluation.failures).toEqual([])
      expect(evaluation.measurements).toHaveLength(2)
    }
  })

  test('retains the historical throughput floors exactly', () => {
    expect(COMPILER_PERF_POLICIES['bun-jsc']).toMatchObject({
      minimumGeomean: 0.9,
      minimumCaseRatio: 0.8,
    })
    expect(COMPILER_PERF_POLICIES['node-v8']).toMatchObject({
      minimumGeomean: 0.9,
      minimumCaseRatio: 0.7,
    })
  })

  test('fails closed on quick, filtered, incomplete, skipped, or incorrect runs', () => {
    const cases = makeCases()
    cases[0] = { ...cases[0], correctnessOk: false }
    const base = makeReport(cases)
    const report = makeReport(cases.slice(0, -1), 'bun-jsc', {
      args: { ...base.args, rounds: 8, quick: true, casesFilter: 'single-op' },
      summary: { ...base.summary, count: cases.length - 1, complete: false, allCorrect: false },
      skipped: ['one case failed'],
    })

    const output = failures(evaluateCompilerPerfReport(report))
    expect(output).toContain('full corpus')
    expect(output).toContain('cannot filter')
    expect(output).toContain('incomplete')
    expect(output).toContain('skipped')
    expect(output).toContain('incorrect')
    expect(output).toContain('expected 44')
  })

  test('rejects identity, capability, case-population, projection, and gap drift', () => {
    const cases = makeCases()
    const base = makeReport(cases)
    const report = {
      ...base,
      corpus: { ...base.corpus, sha256: '0'.repeat(64) },
      reference: { ...base.reference, sha256: 'f'.repeat(64) },
      compiler: {
        ...base.compiler,
        id: 'changed-compiler',
        supportedOps: base.compiler.supportedOps.slice(1),
      },
      coverage: {
        ...base.coverage,
        gapCount: 1,
        gaps: [
          {
            name: 'hidden',
            steps: ['unknown'],
            unsupportedOps: ['unknown'],
            reason: 'unsupported compiler ops: unknown',
          },
        ],
      },
      cases: [cases[1], cases[0], ...cases.slice(2)],
    } as CompilerPerfReport

    const output = failures(evaluateCompilerPerfReport(report))
    expect(output).toContain('corpus SHA-256')
    expect(output).toContain('frozen-emitter SHA-256')
    expect(output).toContain('compiler subject identity')
    expect(output).toContain('supported-op capability set')
    expect(output).toContain('compiler gaps')
    expect(output).toContain('ordered case list')
    expect(output).toContain('coverage projection SHA-256')
  })

  test('rejects worker runtime substitution and untransformed compiler rows', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      workerEngine: ENGINES['node-v8'],
      transformedSiteCount: 0,
    }

    const output = failures(evaluateCompilerPerfReport(makeReport(cases)))
    expect(output).toContain('expected one compiler-transformed site')
    expect(output).toContain('worker runtime identity does not match')
  })

  test('pins the allocation-free interleaved sampler and consumed-item batch shape', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      batchIterations: 1,
      sampling: {
        ...cases[0].sampling,
        id: 'forged-sampler' as typeof INTERLEAVED_PAIRED_SAMPLER_ID,
        order: 'forged-order' as typeof INTERLEAVED_PAIRED_SAMPLER_ORDER,
        microBatchIterations: 2,
      },
    }

    const output = failures(evaluateCompilerPerfReport(makeReport(cases)))
    expect(output).toContain('used batch size')
    expect(output).toContain('unexpected sampler identity')
    expect(output).toContain('unexpected sampler order')
    expect(output).toContain('micro-batch iterations')
  })

  test('recomputes raw ratios, aggregate statistics, confidence interval, sign test, and RME', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      compilerSamplesNs: [0, ...cases[0].compilerSamplesNs.slice(1)],
      referenceSamplesNs: cases[0].referenceSamplesNs.slice(1),
      pairedRatios: [2, ...cases[0].pairedRatios.slice(1)],
      medianRatio: 2,
      meanRatio: 2,
      ciLow: 0.5,
      ciHigh: 2.5,
      signTestP: 0,
      relativeMarginOfError: 1,
    }

    const output = failures(evaluateCompilerPerfReport(makeReport(cases)))
    expect(output).toContain('raw sample count')
    expect(output).toContain('finite and positive')
    expect(output).toContain('paired ratios do not match')
    expect(output).toContain('invalid median ratio')
    expect(output).toContain('invalid mean ratio')
    expect(output).toContain('confidence interval does not match')
    expect(output).toContain('sign-test p-value does not match')
    expect(output).toContain('relative margin of error does not match')
  })

  test('enforces RME, round, warmup, and batch-strength requirements', () => {
    const cases = makeCases('node-v8')
    const base = makeReport(cases, 'node-v8')
    const pairedRatios = Array.from({ length: cases[0].rounds }, (_, index) =>
      index < cases[0].rounds / 2 ? 0.6 : 1.4,
    )
    cases[0] = {
      ...cases[0],
      compilerSamplesNs: pairedRatios.map(() => 100),
      referenceSamplesNs: pairedRatios.map((ratio) => ratio * 100),
      pairedRatios,
      ciLow: 0.6,
      ciHigh: 1.4,
      relativeMarginOfError: 40,
    }
    const report = makeReport(cases, 'node-v8', {
      args: {
        ...base.args,
        rounds: 39,
        warmupRounds: 99,
        minimumBatchInputItems: 99_999,
        targetConsumedItemsPerMicroBatch: 9_999,
      },
    })

    const output = failures(evaluateCompilerPerfReport(report))
    expect(output).toContain('minimum is 40')
    expect(output).toContain('warmup rounds')
    expect(output).toContain('batch target')
    expect(output).toContain('micro-batch target')
    expect(output).toContain('exceeds 5%')
  })

  test('accepts noisy samples only when their raw confidence interval clears the case floor', () => {
    const makeNoisyCase = (low: number, high: number): CompilerPerfCase => {
      const base = makeCase(corpus.cases[0], 'node-v8')
      const pairedRatios = Array.from({ length: base.rounds }, (_, index) =>
        index < base.rounds / 2 ? low : high,
      )
      return {
        ...base,
        compilerSamplesNs: pairedRatios.map(() => 100),
        referenceSamplesNs: pairedRatios.map((ratio) => ratio * 100),
        pairedRatios,
        medianRatio: (low + high) / 2,
        meanRatio: (low + high) / 2,
        ciLow: low,
        ciHigh: high,
        signTestP: 1,
        relativeMarginOfError: ((high - low) / (low + high)) * 100,
      }
    }

    const safeCases = makeCases('node-v8')
    safeCases[0] = makeNoisyCase(0.9, 1.1)
    expect(evaluateCompilerPerfReport(makeReport(safeCases, 'node-v8')).passed).toBe(true)

    const unsafeCases = makeCases('node-v8')
    unsafeCases[0] = makeNoisyCase(0.6, 1.4)
    const unsafe = evaluateCompilerPerfReport(makeReport(unsafeCases, 'node-v8'))
    expect(unsafe.passed).toBe(false)
    expect(failures(unsafe)).toContain('confidence-interval lower bound 0.6 is below 0.7')
  })

  test('enforces engine-specific worst-case floors without aggregate masking', () => {
    for (const [engineId, ratio] of [
      ['bun-jsc', 0.79],
      ['node-v8', 0.69],
    ] as const) {
      const cases = makeCases(engineId)
      cases[0] = makeCase(corpus.cases[0], engineId, ratio)
      const evaluation = evaluateCompilerPerfReport(makeReport(cases, engineId))

      expect(evaluation.passed).toBe(false)
      expect(failures(evaluation)).toContain('worst case')
      expect(evaluation.measurements[0].passed).toBe(true)
      expect(evaluation.measurements[1].passed).toBe(false)
    }
  })

  test('rejects forged summaries and malformed report shapes instead of throwing', () => {
    const base = makeReport(makeCases())
    const forged = {
      ...base,
      summary: {
        ...base.summary,
        count: 1,
        geomeanRatio: 99,
        minRatio: 99,
        maxRelativeMarginOfError: 99,
      },
    }
    expect(failures(evaluateCompilerPerfReport(forged))).toContain(
      'does not match the measured rows',
    )

    const malformed = evaluateCompilerPerfReport(null as unknown as CompilerPerfReport)
    expect(malformed.passed).toBe(false)
    expect(failures(malformed)).toContain('malformed')
  })
})
