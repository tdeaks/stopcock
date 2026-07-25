/**
 * P3A bounded throughput worker.
 *
 * The counterpart to the memory worker and deliberately a separate entry
 * module: nothing here installs a GC observer, forces a collection, or holds
 * an output past the sample that produced it. A row measured in a process that
 * did any of those is not a throughput baseline, and keeping the two lanes in
 * one file is exactly how they end up sharing one.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { currentPerfEngine } from './perf-engine'
import {
  INTERLEAVED_PAIRED_SAMPLER_ID,
  INTERLEAVED_PAIRED_SAMPLER_ORDER,
  runInterleavedPaired,
} from './perf-runner'
import { ALLOCATION_TARGETS, CORPUS_ID, checksumOf } from './allocation-perf-corpus'

export const THROUGHPUT_WORKER_ENTRY = 'allocation-perf-throughput-worker.ts'
const SESSION_ENV = 'STOPCOCK_P3A_THROUGHPUT_SESSION'
const ROUNDS_ENV = 'STOPCOCK_P3A_THROUGHPUT_ROUNDS'
const WARMUP_ENV = 'STOPCOCK_P3A_THROUGHPUT_WARMUP'

export interface ThroughputRow {
  readonly targetId: string
  readonly sessionIndex: number
  readonly samplerId: string
  readonly samplerOrder: string
  readonly checksum: string
  readonly subjectSamplesNs: readonly number[]
  readonly referenceSamplesNs: readonly number[]
  readonly pairedRatios: readonly number[]
  readonly medianRatio: number
}

export interface ThroughputWorkerResult {
  readonly corpusId: string
  readonly workerKind: 'throughput'
  readonly entry: string
  readonly pid: number
  readonly engineId: string
  readonly sessionIndex: number
  readonly rows: readonly ThroughputRow[]
}

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((l, r) => l - r)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export const runThroughputSession = (
  sessionIndex: number,
  rounds: number,
  warmupRounds: number,
): ThroughputWorkerResult => {
  const rows: ThroughputRow[] = ALLOCATION_TARGETS.map((target) => {
    // Outside the timed region: the checksum traversal is evidence, not work
    // under test.
    const checksum = checksumOf(target.subject())
    const run = runInterleavedPaired(target.subject, target.reference, {
      rounds,
      batchIterations: 4,
      microBatchIterations: 1,
      warmupRounds,
    })
    return {
      targetId: target.id,
      sessionIndex,
      samplerId: INTERLEAVED_PAIRED_SAMPLER_ID,
      samplerOrder: INTERLEAVED_PAIRED_SAMPLER_ORDER,
      checksum,
      subjectSamplesNs: run.aSamples,
      referenceSamplesNs: run.bSamples,
      pairedRatios: run.pairedRatios,
      medianRatio: median(run.pairedRatios),
    }
  })

  return {
    corpusId: CORPUS_ID,
    workerKind: 'throughput',
    entry: THROUGHPUT_WORKER_ENTRY,
    pid: process.pid,
    engineId: currentPerfEngine().id,
    sessionIndex,
    rows,
  }
}

const main = (): void => {
  const sessionIndex = Number(process.env[SESSION_ENV] ?? '0')
  const rounds = Number(process.env[ROUNDS_ENV] ?? '12')
  const warmupRounds = Number(process.env[WARMUP_ENV] ?? '8')
  console.log(JSON.stringify(runThroughputSession(sessionIndex, rounds, warmupRounds)))
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()
