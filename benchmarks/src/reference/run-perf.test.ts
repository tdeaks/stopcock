import { describe, expect, test } from 'vite-plus/test'
import type { PerfEngine } from './perf-engine'
import {
  consumedItemsMicroBatchIterations,
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
} from './perf-runner'
import {
  parsePortablePerfWorkerOutput,
  PORTABLE_PERF_WORKER_MARKER,
  type PortableWorkerCaseReport,
} from './run-perf'

const engine: PerfEngine = {
  id: 'node-v8',
  name: 'Node/V8',
  runtime: 'node',
  runtimeVersion: '24.18.0',
  v8: '13.6.233.17-node.50',
  platform: 'darwin',
  architecture: 'arm64',
}

const makeResult = (): PortableWorkerCaseReport => {
  const rounds = 60
  const inputSize = 10_000
  const batchIterations = 50
  const microBatchIterations = consumedItemsMicroBatchIterations(
    inputSize,
    batchIterations,
    10_000,
  )
  return {
    name: 'single-op filter (arithmetic, n=10000)',
    strata: {
      opCountBucket: '1',
      sinkKind: 'none',
      boundary: 'none',
      size: inputSize,
      callbackClass: 'arithmetic',
    },
    inputSize,
    consumedInputItems: inputSize,
    correctnessOk: true,
    workerEngine: engine,
    rounds,
    batchIterations,
    sampling: {
      id: INTERLEAVED_PAIRED_SAMPLER_ID,
      order: INTERLEAVED_PAIRED_SAMPLER_ORDER,
      batchIterationsPerSide: batchIterations,
      microBatchIterations,
      microBatchesPerSide: Math.ceil(batchIterations / microBatchIterations),
      targetConsumedItemsPerMicroBatch: 10_000,
      nominalConsumedItemsPerMicroBatch: microBatchIterations * inputSize,
    },
    medianRatio: 1,
    meanRatio: 1,
    ciLow: 1,
    ciHigh: 1,
    signTestP: 1,
    relativeMarginOfError: 0,
    stopcockSamplesNs: Array.from({ length: rounds }, () => 100),
    referenceSamplesNs: Array.from({ length: rounds }, () => 100),
    pairedRatios: Array.from({ length: rounds }, () => 1),
  }
}

describe('portable performance fresh-worker envelope', () => {
  test('accepts one exact result and rejects marker, case, exit, and runtime substitution', () => {
    const result = makeResult()
    const caseSha256 = 'a'.repeat(64)
    const success = {
      ok: true as const,
      workerCaseIndex: 1,
      workerCaseName: result.name,
      workerCaseSha256: caseSha256,
      workerEngine: engine,
      result,
    }
    const expected = {
      caseIndex: 1,
      caseName: result.name,
      caseSha256,
      inputSize: result.inputSize,
      engine,
    }
    const marker = `${PORTABLE_PERF_WORKER_MARKER}${JSON.stringify(success)}\n`

    expect(parsePortablePerfWorkerOutput(marker, 0, null, expected)).toEqual(success)

    const rejected = [
      parsePortablePerfWorkerOutput('', 1, null, expected),
      parsePortablePerfWorkerOutput(`${marker}${marker}`, 0, null, expected),
      parsePortablePerfWorkerOutput(marker, 1, null, expected),
      parsePortablePerfWorkerOutput(marker, 0, 'SIGTERM', expected),
      parsePortablePerfWorkerOutput(
        `${PORTABLE_PERF_WORKER_MARKER}${JSON.stringify({
          ...success,
          workerCaseIndex: 2,
        })}\n`,
        0,
        null,
        expected,
      ),
      parsePortablePerfWorkerOutput(
        `${PORTABLE_PERF_WORKER_MARKER}${JSON.stringify({
          ...success,
          workerCaseSha256: 'b'.repeat(64),
        })}\n`,
        0,
        null,
        expected,
      ),
      parsePortablePerfWorkerOutput(
        `${PORTABLE_PERF_WORKER_MARKER}${JSON.stringify({
          ...success,
          workerEngine: { ...engine, runtimeVersion: 'substitute' },
        })}\n`,
        0,
        null,
        expected,
      ),
      parsePortablePerfWorkerOutput(
        `${PORTABLE_PERF_WORKER_MARKER}${JSON.stringify({
          ...success,
          result: { ...result, name: 'substitute' },
        })}\n`,
        0,
        null,
        expected,
      ),
    ]
    for (const outcome of rejected) expect(outcome.ok).toBe(false)
  })
})
