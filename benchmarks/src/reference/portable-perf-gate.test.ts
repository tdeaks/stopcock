import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vite-plus/test'
import {
  evaluatePortablePerfReport,
  PORTABLE_PERF_POLICIES,
  type PortablePerfCase,
  type PortablePerfReport,
} from './portable-perf-gate'
import {
  EXPECTED_FROZEN_EMITTER,
  EXPECTED_PORTABLE_CORPUS,
  EXPECTED_PORTABLE_SUBJECT,
  minimumPortableBatchIterations,
} from './portable-perf-contract'
import type { PerfEngine, PerfEngineId } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
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
    runtimeVersion: '22.19.0',
    v8: '12.4.254.21-node.29',
    platform: 'darwin',
    architecture: 'arm64',
  },
}

const OP_BUCKETS = [
  ...Array.from({ length: 6 }, () => '1'),
  ...Array.from({ length: 20 }, () => '2-3'),
  ...Array.from({ length: 18 }, () => '4+'),
] as const

const SINK_KINDS = [
  ...Array.from({ length: 7 }, () => 'none'),
  ...Array.from({ length: 12 }, () => 'collect'),
  ...Array.from({ length: 13 }, () => 'reduce-like'),
  ...Array.from({ length: 12 }, () => 'short-circuit'),
] as const

const makeCases = (ratio = 3): PortablePerfCase[] =>
  OP_BUCKETS.map((opCountBucket, index) => {
    const inputSize = [100, 10_000, 100_000][index % 3] as number
    const strata = {
      opCountBucket,
      sinkKind: SINK_KINDS[index],
      boundary: 'none',
    } as const
    const rounds = 60
    const batchIterations = minimumPortableBatchIterations(
      inputSize,
      PORTABLE_PERF_POLICIES['bun-jsc'],
    )
    const targetConsumedItemsPerMicroBatch = 10_000
    const microBatchIterations = consumedItemsMicroBatchIterations(
      inputSize,
      batchIterations,
      targetConsumedItemsPerMicroBatch,
    )
    const stopcockSamplesNs = Array.from({ length: rounds }, () => 100)
    const referenceSamplesNs = Array.from({ length: rounds }, () => 100 * ratio)
    const pairedRatios = Array.from({ length: rounds }, () => ratio)
    return {
      name: `case-${index}`,
      strata,
      inputSize,
      consumedInputItems: inputSize,
      correctnessOk: true,
      workerEngine: ENGINES['bun-jsc'],
      rounds,
      batchIterations,
      sampling: {
        id: INTERLEAVED_PAIRED_SAMPLER_ID,
        order: INTERLEAVED_PAIRED_SAMPLER_ORDER,
        batchIterationsPerSide: batchIterations,
        microBatchIterations,
        microBatchesPerSide: Math.ceil(batchIterations / microBatchIterations),
        targetConsumedItemsPerMicroBatch,
        nominalConsumedItemsPerMicroBatch: microBatchIterations * inputSize,
      },
      medianRatio: ratio,
      meanRatio: ratio,
      ciLow: ratio,
      ciHigh: ratio,
      signTestP: 1,
      relativeMarginOfError: 0,
      stopcockSamplesNs,
      referenceSamplesNs,
      pairedRatios,
    }
  })

const geomean = (values: readonly number[]): number =>
  Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length)

const makeReport = (
  cases: readonly PortablePerfCase[],
  overrides: Partial<PortablePerfReport> = {},
  engineId: PerfEngineId = 'bun-jsc',
): PortablePerfReport => {
  const engine = ENGINES[engineId]
  const engineCases = cases.map((item) => ({ ...item, workerEngine: engine }))
  const ratios = engineCases.map((item) => item.medianRatio)
  return {
    generatedAt: '2026-07-23T12:00:00.000Z',
    engine,
    subject: EXPECTED_PORTABLE_SUBJECT,
    corpus: EXPECTED_PORTABLE_CORPUS,
    reference: EXPECTED_FROZEN_EMITTER,
    args: {
      rounds: 60,
      quick: false,
      corpusPath: '/workspace/benchmarks/src/reference/perf-corpus.json',
      minimumBatchInputItems: 100_000,
      warmupRounds: engineId === 'bun-jsc' ? 10 : 100,
    },
    summary: {
      count: cases.length,
      expectedCount: EXPECTED_PORTABLE_CORPUS.caseCount,
      geomeanRatio: geomean(ratios),
      minRatio: Math.min(...ratios),
      maxRelativeMarginOfError: Math.max(
        ...engineCases.map((item) => item.relativeMarginOfError),
      ),
      allCorrect: true,
      complete: true,
    },
    cases: engineCases,
    skipped: [],
    ...overrides,
  }
}

describe('portable performance release policy', () => {
  test('keeps the checked-in corpus, emitter, and candidate runtime bytes pinned', async () => {
    const corpusBytes = await readFile(new URL('./perf-corpus.json', import.meta.url))
    const emitterBytes = await readFile(new URL('./emitter.ts', import.meta.url))
    const corpus = JSON.parse(corpusBytes.toString('utf8')) as {
      readonly id: string
      readonly version: number
      readonly cases: readonly unknown[]
    }
    const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

    expect(corpus).toMatchObject({
      id: EXPECTED_PORTABLE_CORPUS.id,
      version: EXPECTED_PORTABLE_CORPUS.version,
    })
    expect(corpus.cases).toHaveLength(EXPECTED_PORTABLE_CORPUS.caseCount)
    expect(digest(corpusBytes)).toBe(EXPECTED_PORTABLE_CORPUS.sha256)
    expect(digest(emitterBytes)).toBe(EXPECTED_FROZEN_EMITTER.sha256)

    const subjectHash = createHash('sha256')
    for (const relativePath of EXPECTED_PORTABLE_SUBJECT.files) {
      subjectHash.update(relativePath)
      subjectHash.update('\0')
      subjectHash.update(
        await readFile(new URL(`../../../${relativePath}`, import.meta.url)),
      )
      subjectHash.update('\0')
    }
    expect(subjectHash.digest('hex')).toBe(EXPECTED_PORTABLE_SUBJECT.sha256)
  })

  test('accepts a complete, correct report under both characterized engines', () => {
    for (const engineId of ['bun-jsc', 'node-v8'] as const) {
      const evaluation = evaluatePortablePerfReport(makeReport(makeCases(), {}, engineId))

      expect(evaluation.passed).toBe(true)
      expect(evaluation.failures).toEqual([])
      expect(evaluation.measurements).toHaveLength(9)
    }
  })

  test('fails closed on a quick, incomplete, or incorrect report', () => {
    const cases = makeCases()
    cases[0] = { ...cases[0], correctnessOk: false }
    const base = makeReport(cases)
    const report = makeReport(cases, {
      args: { ...base.args, rounds: 8, quick: true },
      summary: { ...base.summary, allCorrect: false, complete: false },
      skipped: ['missing case'],
    })

    const evaluation = evaluatePortablePerfReport(report)

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('full corpus')
    expect(evaluation.failures.join('\n')).toContain('incorrect')
    expect(evaluation.failures.join('\n')).toContain('skipped')
  })

  test('rejects malformed truthy flags and invalid statistical rows', () => {
    const cases = makeCases()
    const base = makeReport(cases)
    const malformed = {
      ...base,
      summary: { ...base.summary, allCorrect: 'true', complete: 'true' },
      cases: [
        {
          ...cases[0],
          correctnessOk: 'true',
          rounds: 40.5,
          strata: { opCountBucket: 'unknown', sinkKind: 'none' },
          ciLow: 3,
          ciHigh: 2,
          signTestP: 2,
        },
        ...cases.slice(1),
      ],
    } as unknown as PortablePerfReport

    const evaluation = evaluatePortablePerfReport(malformed)
    const failures = evaluation.failures.join('\n')

    expect(evaluation.passed).toBe(false)
    expect(failures).toContain('summary is incorrect')
    expect(failures).toContain('produced incorrect output')
    expect(failures).toContain('used 40.5 rounds')
    expect(failures).toContain('invalid confidence interval')
    expect(failures).toContain('invalid sign-test p-value')
    expect(failures).toContain('unrecognized opCountBucket stratum')
  })

  test('prevents fast single operations from hiding a long-pipeline regression', () => {
    const cases = makeCases()
    for (let index = 26; index < cases.length; index++) {
      cases[index] = {
        ...cases[index],
        medianRatio: 0.3,
        meanRatio: 0.3,
        ciLow: 0.3,
        ciHigh: 0.3,
      }
    }

    const evaluation = evaluatePortablePerfReport(makeReport(cases))
    const longPipelines = evaluation.measurements.find(
      (measurement) => measurement.label === 'opCountBucket=4+',
    )

    expect(evaluation.passed).toBe(false)
    expect(longPipelines).toMatchObject({ passed: false })
    expect(longPipelines?.actual).toBeCloseTo(0.3)
  })

  test('applies the separately characterized Node/V8 worst-case floor', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      medianRatio: 0.84,
      meanRatio: 0.84,
      ciLow: 0.84,
      ciHigh: 0.84,
      stopcockSamplesNs: Array.from({ length: 60 }, () => 100),
      referenceSamplesNs: Array.from({ length: 60 }, () => 84),
      pairedRatios: Array.from({ length: 60 }, () => 0.84),
    }

    const evaluation = evaluatePortablePerfReport(makeReport(cases, {}, 'node-v8'))

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('worst case: 0.840 is below 0.850')
  })

  test('rejects silently reduced or internally inconsistent corpora', () => {
    const report = makeReport(makeCases().slice(0, -1))
    const inconsistent = {
      ...report,
      summary: { ...report.summary, geomeanRatio: 99 },
    }

    const evaluation = evaluatePortablePerfReport(inconsistent)

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain('expected 44')
    expect(evaluation.failures.join('\n')).toContain('does not match the case rows')
  })

  test('pins the exact subject, corpus, and frozen reference-emitter identities', () => {
    const base = makeReport(makeCases())
    const report = {
      ...base,
      corpus: {
        id: `${EXPECTED_PORTABLE_CORPUS.id}-changed`,
        version: EXPECTED_PORTABLE_CORPUS.version + 1,
        sha256: '0'.repeat(64),
      },
      reference: {
        id: `${EXPECTED_FROZEN_EMITTER.id}-changed`,
        sha256: 'f'.repeat(64),
      },
      subject: {
        id: `${EXPECTED_PORTABLE_SUBJECT.id}-changed`,
        files: EXPECTED_PORTABLE_SUBJECT.files.slice(1),
        sha256: '1'.repeat(64),
      },
    }

    const failures = evaluatePortablePerfReport(report).failures.join('\n')

    expect(failures).toContain('unexpected portable corpus identity')
    expect(failures).toContain('unexpected portable corpus version')
    expect(failures).toContain('portable corpus SHA-256 does not match')
    expect(failures).toContain('unexpected frozen-emitter identity')
    expect(failures).toContain('frozen-emitter SHA-256 does not match')
    expect(failures).toContain('unexpected portable subject identity')
    expect(failures).toContain('portable subject files do not match')
    expect(failures).toContain('portable subject SHA-256 does not match')
  })

  test('rejects a case measured by a different worker runtime', () => {
    const report = makeReport(makeCases(), {}, 'node-v8')
    const cases = report.cases.slice()
    cases[0] = { ...cases[0], workerEngine: ENGINES['bun-jsc'] }

    const failures = evaluatePortablePerfReport({ ...report, cases }).failures.join('\n')
    expect(failures).toContain('worker runtime identity does not match report')
  })

  test('rejects unbatched tiny and unmaterialized early-exit samples', () => {
    const cases = makeCases()
    cases[0] = { ...cases[0], batchIterations: 999 }
    const earlyExitIndex = cases.findIndex(
      (item) =>
        item.inputSize === 100_000 &&
        item.strata.sinkKind === 'short-circuit' &&
        item.strata.boundary === 'none',
    )
    expect(earlyExitIndex).toBeGreaterThanOrEqual(0)
    cases[earlyExitIndex] = {
      ...cases[earlyExitIndex],
      consumedInputItems: 100,
      batchIterations: 999,
    }

    const failures = evaluatePortablePerfReport(makeReport(cases)).failures.join('\n')

    expect(failures).toContain('case-0: used batch size 999; minimum is 1000')
    expect(failures).toContain(`case-${earlyExitIndex}: used batch size 999; minimum is 1000`)
    expect(minimumPortableBatchIterations(10_000, PORTABLE_PERF_POLICIES['bun-jsc'])).toBe(50)
  })

  test('accepts wide intervals only above the throughput floor and verifies reported RME', () => {
    const safelyNoisyCases = makeCases()
    const safeCiLow = 2.82
    const safeCiHigh = 3.18
    const safeRme = ((safeCiHigh - safeCiLow) / (2 * 3)) * 100
    const safeRatios = [
      ...Array.from({ length: 29 }, () => safeCiLow),
      3,
      3,
      ...Array.from({ length: 29 }, () => safeCiHigh),
    ]
    safelyNoisyCases[0] = {
      ...safelyNoisyCases[0],
      ciLow: safeCiLow,
      ciHigh: safeCiHigh,
      relativeMarginOfError: safeRme,
      stopcockSamplesNs: Array.from({ length: 60 }, () => 100),
      referenceSamplesNs: safeRatios.map((ratio) => ratio * 100),
      pairedRatios: safeRatios,
    }

    const safelyNoisyEvaluation = evaluatePortablePerfReport(
      makeReport(safelyNoisyCases, {}, 'node-v8'),
    )
    expect(safelyNoisyEvaluation.passed).toBe(true)

    const unsafelyNoisyCases = makeCases()
    const unsafeCiLow = 0.5
    const unsafeCiHigh = 5.5
    const unsafeRme = ((unsafeCiHigh - unsafeCiLow) / (2 * 3)) * 100
    const unsafeRatios = [
      ...Array.from({ length: 29 }, () => unsafeCiLow),
      3,
      3,
      ...Array.from({ length: 29 }, () => unsafeCiHigh),
    ]
    unsafelyNoisyCases[0] = {
      ...unsafelyNoisyCases[0],
      ciLow: unsafeCiLow,
      ciHigh: unsafeCiHigh,
      relativeMarginOfError: unsafeRme,
      stopcockSamplesNs: Array.from({ length: 60 }, () => 100),
      referenceSamplesNs: unsafeRatios.map((ratio) => ratio * 100),
      pairedRatios: unsafeRatios,
    }
    const unsafelyNoisyFailures = evaluatePortablePerfReport(
      makeReport(unsafelyNoisyCases, {}, 'node-v8'),
    ).failures.join('\n')
    expect(unsafelyNoisyFailures).toContain('relative margin of error')
    expect(unsafelyNoisyFailures).toContain('exceeds 5%')

    const forgedCiCases = [...unsafelyNoisyCases]
    forgedCiCases[0] = {
      ...forgedCiCases[0],
      ciLow: 0.6,
      relativeMarginOfError: ((unsafeCiHigh - 0.6) / (2 * 3)) * 100,
    }
    const forgedCiFailures = evaluatePortablePerfReport(
      makeReport(forgedCiCases, {}, 'node-v8'),
    ).failures.join('\n')
    expect(forgedCiFailures).toContain('invalid confidence interval')
    expect(forgedCiFailures).toContain('relative margin of error')

    const forgedCases = makeCases()
    forgedCases[0] = {
      ...forgedCases[0],
      ciLow: safeCiLow,
      ciHigh: safeCiHigh,
      relativeMarginOfError: 1,
    }
    const forgedFailures = evaluatePortablePerfReport(
      makeReport(forgedCases, {}, 'node-v8'),
    ).failures.join('\n')
    expect(forgedFailures).toContain(
      'reported relative margin of error does not match its confidence interval',
    )
  })

  test('rejects weakened batch and warmup arguments', () => {
    const base = makeReport(makeCases(), {}, 'node-v8')
    const report = {
      ...base,
      args: {
        ...base.args,
        minimumBatchInputItems: 99_999,
        warmupRounds: 99,
      },
    }

    const failures = evaluatePortablePerfReport(report).failures.join('\n')

    expect(failures).toContain('input batch target')
    expect(failures).toContain('warmup rounds')
  })

  test('pins the interleaved sampler and consumed-item micro-batch shape', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      sampling: {
        ...cases[0].sampling,
        id: 'forged-sampler' as typeof INTERLEAVED_PAIRED_SAMPLER_ID,
        order: 'forged-order' as typeof INTERLEAVED_PAIRED_SAMPLER_ORDER,
        microBatchIterations: 1,
      },
    }

    const failures = evaluatePortablePerfReport(makeReport(cases)).failures.join('\n')

    expect(failures).toContain('unexpected sampler identity')
    expect(failures).toContain('unexpected sampler order')
    expect(failures).toContain('micro-batch iterations')
  })

  test('rejects forged or incomplete raw paired samples', () => {
    const cases = makeCases()
    cases[0] = {
      ...cases[0],
      stopcockSamplesNs: [0, ...cases[0].stopcockSamplesNs.slice(1)],
      referenceSamplesNs: cases[0].referenceSamplesNs.slice(1),
      pairedRatios: [99, ...cases[0].pairedRatios.slice(1).map((ratio) => ratio + 0.25)],
      medianRatio: 99,
      meanRatio: 99,
    }

    const failures = evaluatePortablePerfReport(makeReport(cases)).failures.join('\n')

    expect(failures).toContain('raw sample count')
    expect(failures).toContain('finite and positive')
    expect(failures).toContain('paired ratios do not match')
    expect(failures).toContain('invalid median ratio')
    expect(failures).toContain('invalid mean ratio')
  })
})
