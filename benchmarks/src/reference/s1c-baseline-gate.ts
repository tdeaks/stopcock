import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PerfEngine, PerfEngineId } from './perf-engine'
import { INTERLEAVED_PAIRED_SAMPLER_ID, INTERLEAVED_PAIRED_SAMPLER_ORDER } from './perf-runner'
import {
  MEMORY_METRIC_CAPABILITIES,
  S1C_BASELINE_KIND,
  S1C_BASELINE_SCHEMA_VERSION,
  S1C_LANES,
  S1C_PACKAGE_CONTRACT,
  S1C_RUN_BUDGET,
  type BaselineLane,
} from './s1c-baseline-contract'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(localDirectory, '..', '..', '..')
const fpDirectory = join(repositoryRoot, 'packages', 'fp')

export interface BaselineIdentity {
  /** Digest of the candidate source tree the rows were measured from. */
  readonly source: string
  /** Digest of the built distribution, or null when nothing is built. */
  readonly dist: string | null
  /** Digest of the exact packed tarball contents, or null when unpacked. */
  readonly packed: string | null
}

export interface TimingRow {
  readonly caseId: string
  readonly sessionIndex: number
  readonly samplerId: string
  readonly samplerOrder: string
  readonly subjectSamplesNs: readonly number[]
  readonly referenceSamplesNs: readonly number[]
  readonly pairedRatios: readonly number[]
  readonly medianRatio: number
}

export interface ScalarRow {
  readonly caseId: string
  readonly sessionIndex: number
  readonly samples: readonly number[]
  readonly median: number
  readonly unit: 'nanoseconds' | 'bytes'
}

export interface BaselineLaneReport {
  readonly laneId: string
  readonly status: BaselineLane['status']
  readonly timingRows: readonly TimingRow[]
  readonly scalarRows: readonly ScalarRow[]
}

export interface MemoryCapabilityObservation {
  readonly metric: string
  readonly supported: boolean
  readonly detail: string
}

export interface BaselineManifest {
  readonly kind: string
  readonly schemaVersion: number
  readonly generatedAt: string
  readonly profileId: string
  readonly budget: 'quick' | 'release'
  readonly engine: PerfEngine
  readonly workerId: string
  readonly identity: BaselineIdentity
  readonly lanes: readonly BaselineLaneReport[]
  readonly memoryCapabilities: readonly MemoryCapabilityObservation[]
  readonly packageContract: { readonly package: string; readonly sideEffects: boolean }
}

const sha256 = (value: string | Uint8Array): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

const walkFiles = (root: string, skip: (path: string) => boolean): string[] => {
  const out: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((l, r) =>
      l.name < r.name ? -1 : l.name > r.name ? 1 : 0,
    )) {
      const path = join(directory, entry.name)
      if (skip(path)) continue
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) out.push(path)
    }
  }
  visit(root)
  return out
}

/**
 * Digests a file set as `<repo-relative path>\0<bytes>\0` in sorted order, the
 * same construction the portable subject pin uses.
 */
const digestFiles = (paths: readonly string[]): string => {
  const hash = createHash('sha256')
  for (const path of paths) {
    hash.update(relative(repositoryRoot, path).split('\\').join('/'))
    hash.update('\0')
    hash.update(readFileSync(path))
    hash.update('\0')
  }
  return `sha256:${hash.digest('hex')}`
}

const exists = (path: string): boolean => {
  try {
    statSync(path)
    return true
  } catch {
    return false
  }
}

export const computeSourceIdentity = (): string =>
  digestFiles(
    walkFiles(join(fpDirectory, 'src'), (path) => path.includes('__tests__')).filter((path) =>
      path.endsWith('.ts'),
    ),
  )

export const computeDistIdentity = (): string | null => {
  const dist = join(fpDirectory, 'dist')
  if (!exists(dist)) return null
  return digestFiles(walkFiles(dist, () => false))
}

/** Packs the real tarball so a manifest is bound to shipped bytes, not a tree. */
export const computePackedIdentity = (): string | null => {
  const destination = mkdtempSync(join(tmpdir(), 'stopcock-s1c-pack-'))
  try {
    const packed = spawnSync(
      'bun',
      ['pm', 'pack', '--destination', destination, '--ignore-scripts', '--quiet'],
      { cwd: fpDirectory, encoding: 'utf8' },
    )
    if (packed.status !== 0) return null
    const tarballs = readdirSync(destination).filter((name) => name.endsWith('.tgz'))
    if (tarballs.length !== 1) return null
    return sha256(readFileSync(join(destination, tarballs[0])))
  } finally {
    rmSync(destination, { recursive: true, force: true })
  }
}

export const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((l, r) => l - r)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface BaselineExpectations {
  readonly identity: BaselineIdentity
  readonly engineId: PerfEngineId
  readonly profileId: string
}

/**
 * Fail-closed manifest validation. Anything that would let a later candidate
 * compare itself against a different tree, a different engine, a different
 * sampler, or a statistic that its own raw samples do not support is an
 * explicit failure.
 */
export const validateBaselineManifest = (
  manifest: BaselineManifest,
  expected: BaselineExpectations,
): string[] => {
  const failures: string[] = []

  if (manifest.kind !== S1C_BASELINE_KIND)
    failures.push(`unexpected manifest kind ${manifest.kind}`)
  if (manifest.schemaVersion !== S1C_BASELINE_SCHEMA_VERSION) {
    failures.push(`unexpected schema version ${manifest.schemaVersion}`)
  }
  if (manifest.profileId !== expected.profileId) {
    failures.push(`manifest profile ${manifest.profileId} does not match ${expected.profileId}`)
  }
  if (manifest.engine.id !== expected.engineId) {
    failures.push(`manifest engine ${manifest.engine.id} does not match ${expected.engineId}`)
  }
  if (manifest.workerId.length === 0) failures.push('manifest has no worker identity')

  for (const field of ['source', 'dist', 'packed'] as const) {
    if (manifest.identity[field] !== expected.identity[field]) {
      failures.push(`${field} identity does not match the live tree`)
    }
    if (manifest.budget === 'release' && manifest.identity[field] === null) {
      failures.push(`a release manifest requires a ${field} identity`)
    }
  }

  if (manifest.packageContract.package !== S1C_PACKAGE_CONTRACT.package) {
    failures.push('manifest package contract names the wrong package')
  }
  if (manifest.packageContract.sideEffects !== S1C_PACKAGE_CONTRACT.sideEffects) {
    failures.push('frozen "sideEffects": false was not preserved')
  }

  const requiredSessions = S1C_RUN_BUDGET[manifest.budget].sessions
  const seen = new Set<string>()

  for (const lane of S1C_LANES) {
    const report = manifest.lanes.find((candidate) => candidate.laneId === lane.id)
    if (report === undefined) {
      failures.push(`manifest omits lane ${lane.id}`)
      continue
    }
    if (report.status !== lane.status) {
      failures.push(`lane ${lane.id} reports status ${report.status}, expected ${lane.status}`)
    }
    const rowCount = report.timingRows.length + report.scalarRows.length
    if (lane.status === 'inactive') {
      if (rowCount !== 0) failures.push(`inactive lane ${lane.id} carries ${rowCount} rows`)
      continue
    }
    if (rowCount === 0) failures.push(`frozen lane ${lane.id} carries no rows`)

    const sessions = new Set<number>()
    for (const row of report.timingRows) {
      const key = `${lane.id}/${row.caseId}/${row.sessionIndex}`
      if (seen.has(key)) failures.push(`duplicate row ${key}`)
      seen.add(key)
      sessions.add(row.sessionIndex)

      if (row.samplerId !== INTERLEAVED_PAIRED_SAMPLER_ID) {
        failures.push(`${key} used sampler ${row.samplerId}`)
      }
      if (row.samplerOrder !== INTERLEAVED_PAIRED_SAMPLER_ORDER) {
        failures.push(`${key} used orientation ${row.samplerOrder}`)
      }
      if (
        row.subjectSamplesNs.length !== row.referenceSamplesNs.length ||
        row.subjectSamplesNs.length !== row.pairedRatios.length
      ) {
        failures.push(`${key} has unpaired raw samples`)
        continue
      }
      if (row.pairedRatios.length === 0) failures.push(`${key} has no samples`)
      const recomputed = row.subjectSamplesNs.map(
        (subject, index) => row.referenceSamplesNs[index] / subject,
      )
      if (recomputed.some((ratio, index) => ratio !== row.pairedRatios[index])) {
        failures.push(`${key} paired ratios do not reproduce from raw samples`)
      }
      if (row.medianRatio !== median(row.pairedRatios)) {
        failures.push(`${key} median does not reproduce from raw samples`)
      }
    }

    for (const row of report.scalarRows) {
      const key = `${lane.id}/${row.caseId}/${row.sessionIndex}`
      if (seen.has(key)) failures.push(`duplicate row ${key}`)
      seen.add(key)
      sessions.add(row.sessionIndex)
      if (row.samples.length === 0) failures.push(`${key} has no samples`)
      else if (row.median !== median(row.samples)) {
        failures.push(`${key} median does not reproduce from raw samples`)
      }
    }

    if (sessions.size < requiredSessions) {
      failures.push(
        `lane ${lane.id} has ${sessions.size} sessions, below the ${manifest.budget} budget of ${requiredSessions}`,
      )
    }
  }

  for (const capability of MEMORY_METRIC_CAPABILITIES) {
    const observed = manifest.memoryCapabilities.find((row) => row.metric === capability.metric)
    if (observed === undefined) {
      failures.push(`manifest omits memory metric ${capability.metric}`)
      continue
    }
    const declared = capability.collection[manifest.engine.id]
    if (declared === null && observed.supported) {
      failures.push(`${capability.metric} is declared unsupported on ${manifest.engine.id}`)
    }
    if (capability.required && declared !== null && !observed.supported) {
      failures.push(`required memory metric ${capability.metric} is unavailable`)
    }
  }

  return failures
}
