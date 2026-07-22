/**
 * Turns a vitest bench --outputJson file into a markdown report.
 * Usage: bun run generate-report.ts --lane bun --results /tmp/bench-bun.json --identity /tmp/bench-bun-identity.json --json
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_BAR = 68

export type Result = { name: string; hz: number; rme: string; samples: number }
export type Suite = { title: string; results: Result[] }
export type BenchmarkRowKind =
  | 'stopcock'
  | 'library'
  | 'native-chain'
  | 'native-loop'
  | 'manual-js'
  | 'projection'

type BaselineKind = Exclude<BenchmarkRowKind, 'stopcock' | 'projection'>

export type WinRate = {
  wins: number
  total: number
  percentage: number
}

export type LossLedgerEntry = {
  suiteTitle: string
  stopcockName: string
  baselineName: string
  baselineKind: BaselineKind
  stopcockHz: number
  baselineHz: number
  ratio: number
  actionable: boolean
  reason: string | null
}

export type LossLedgerSummary = {
  winRates: {
    libraryOnly: WinRate
    allBaselines: WinRate
  }
  entries: LossLedgerEntry[]
  actionableLosses: LossLedgerEntry[]
  projectionRowsExcluded: number
}

type BenchmarkEntry = {
  library: string
  kind: BenchmarkRowKind
  opsPerSec: number
  margin: string
  runs: number
  diff: string
}

type BenchmarkSuite = {
  category: string
  arraySize: number | null
  entries: BenchmarkEntry[]
}

export type EngineIdentity = {
  runtime: 'bun' | 'node' | 'deno' | 'unknown'
  versions: { bun?: string; node?: string; deno?: string }
  execPath: string
  recordedAt: string
}

type BenchmarkMetadata = {
  benchmarkRuntimeLabel: string
  generatedAt: string
  benchmarkEngine: EngineIdentity
  generator: {
    runtime: 'bun' | 'node' | 'deno' | 'unknown'
    versions: {
      bun?: string
      node?: string
      deno?: string
    }
    platform: string
    arch: string
  }
  dependencies: Record<string, string>
  sourceVsDist: 'source' | 'dist' | 'unknown'
  winRateDenominators: {
    libraryOnly: number
    allBaselines: number
  }
  includesNativeManualBaselines: boolean
  projectionRowsExcluded: number
}

type VitestJsonBenchmark = {
  name?: unknown
  hz?: unknown
  rme?: unknown
  sampleCount?: unknown
  samples?: unknown
}

type VitestJsonGroup = {
  fullName?: unknown
  name?: unknown
  benchmarks?: unknown
}

type VitestJsonOutput = {
  files?: Array<{
    filepath?: unknown
    groups?: unknown
  }>
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const competitorPackages = [
  'moment',
  'luxon',
  'date-fns',
  'remeda',
  'lodash-es',
  'ramda',
  'rambda',
  '@mobily/ts-belt',
]

type LaneConfig = {
  engine: 'bun' | 'node' | 'deno'
  label: string
  sourceVsDist: 'source' | 'dist'
}

const LANES: Record<string, LaneConfig> = {
  bun: { engine: 'bun', label: 'Bun', sourceVsDist: 'source' },
  node: { engine: 'node', label: 'Node.js', sourceVsDist: 'source' },
  deno: { engine: 'deno', label: 'Deno', sourceVsDist: 'source' },
  'bun-dist': { engine: 'bun', label: 'Bun (dist)', sourceVsDist: 'dist' },
  'node-dist': { engine: 'node', label: 'Node.js (dist)', sourceVsDist: 'dist' },
  'deno-dist': { engine: 'deno', label: 'Deno (dist)', sourceVsDist: 'dist' },
}

class ReportError extends Error {}

function fail(message: string): never {
  throw new ReportError(message)
}

/** Validates and converts raw `vitest bench --outputJson` output. Throws on anything
 * that would silently misrepresent the run: missing rows, duplicate names, non-finite hz. */
export function parseVitestJsonOutput(raw: string): Suite[] {
  let parsed: VitestJsonOutput
  try {
    parsed = JSON.parse(raw) as VitestJsonOutput
  } catch (error) {
    return fail(`results file is not valid JSON: ${(error as Error).message}`)
  }

  if (!Array.isArray(parsed.files) || parsed.files.length === 0) {
    return fail('results JSON has no files — the bench run produced no output')
  }

  const suites: Suite[] = []

  for (const file of parsed.files) {
    const filepath = typeof file.filepath === 'string' ? file.filepath : '(unknown file)'
    if (!Array.isArray(file.groups) || file.groups.length === 0) {
      fail(`${filepath}: no benchmark groups — run may have failed or been filtered out`)
    }

    for (const group of file.groups as VitestJsonGroup[]) {
      const rawTitle = group.fullName ?? group.name
      if (typeof rawTitle !== 'string' || rawTitle.trim() === '') {
        fail(`${filepath}: benchmark group missing a name`)
      }
      const title = normalizeJsonSuiteTitle(rawTitle)

      if (!Array.isArray(group.benchmarks) || group.benchmarks.length === 0) {
        fail(`${filepath} > ${title}: no benchmark rows — the group ran but produced nothing`)
      }

      const seenNames = new Set<string>()
      const results: Result[] = []

      for (const benchmark of group.benchmarks as VitestJsonBenchmark[]) {
        if (typeof benchmark.name !== 'string' || benchmark.name.trim() === '') {
          fail(`${filepath} > ${title}: benchmark row missing a name`)
        }
        if (seenNames.has(benchmark.name)) {
          fail(`${filepath} > ${title}: duplicate benchmark row "${benchmark.name}"`)
        }
        seenNames.add(benchmark.name)

        if (typeof benchmark.hz !== 'number' || !Number.isFinite(benchmark.hz)) {
          fail(
            `${filepath} > ${title} > ${benchmark.name}: hz is ${String(benchmark.hz)} — the benchmark did not complete cleanly`,
          )
        }

        const rme = typeof benchmark.rme === 'number' ? benchmark.rme : undefined
        const sampleCount =
          typeof benchmark.sampleCount === 'number'
            ? benchmark.sampleCount
            : Array.isArray(benchmark.samples)
              ? benchmark.samples.length
              : 0

        results.push({
          name: benchmark.name,
          hz: benchmark.hz,
          rme: rme == null ? '' : `±${rme.toFixed(2)}%`,
          samples: sampleCount,
        })
      }

      suites.push({ title, results })
    }
  }

  return suites
}

export function parseIdentity(raw: string): EngineIdentity {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return fail(`identity file is not valid JSON: ${(error as Error).message}`)
  }

  const identity = parsed as Partial<EngineIdentity>
  if (
    identity == null ||
    typeof identity.runtime !== 'string' ||
    typeof identity.execPath !== 'string' ||
    typeof identity.versions !== 'object'
  ) {
    return fail('identity file is malformed — missing runtime/execPath/versions')
  }

  return identity as EngineIdentity
}

export function classifyBenchmarkRow(name: string): BenchmarkRowKind {
  const lower = name.toLowerCase()

  if (lower.includes('projected') || lower.includes('extrapolat')) return 'projection'
  if (lower.startsWith('stopcock')) return 'stopcock'
  if (lower.includes('native chain')) return 'native-chain'
  if (lower.includes('native loop')) return 'native-loop'
  if (
    lower.includes('manual') ||
    lower.includes('immutable spread') ||
    lower.includes('native spread') ||
    lower.includes('spread baseline') ||
    lower.includes('hand-written')
  ) {
    return 'manual-js'
  }

  return 'library'
}

export function summarizeLossLedger(suites: Suite[]): LossLedgerSummary {
  let libraryWins = 0
  let libraryTotal = 0
  let allWins = 0
  let allTotal = 0
  let projectionRowsExcluded = 0
  const entries: LossLedgerEntry[] = []

  for (const suite of suites) {
    const nonProjectionResults = suite.results.filter((row) => {
      const isProjection = classifyBenchmarkRow(row.name) === 'projection'
      if (isProjection) projectionRowsExcluded += 1
      return !isProjection
    })

    const stopcockRows = nonProjectionResults.filter(
      (row) => classifyBenchmarkRow(row.name) === 'stopcock',
    )
    if (stopcockRows.length === 0) continue

    const stopcock = fastestRow(stopcockRows)
    const baselines = nonProjectionResults.filter((row) => !stopcockRows.includes(row))
    if (baselines.length === 0) continue

    allTotal += 1
    if (stopcock.hz >= fastestRow(nonProjectionResults).hz) {
      allWins += 1
    }

    const libraryRows = baselines.filter((row) => classifyBenchmarkRow(row.name) === 'library')
    if (libraryRows.length > 0) {
      libraryTotal += 1
      if (stopcock.hz >= fastestRow(libraryRows).hz) {
        libraryWins += 1
      }
    }

    for (const baseline of baselines) {
      const baselineKind = classifyBenchmarkRow(baseline.name) as BaselineKind
      const ratio = roundRatio(baseline.hz / stopcock.hz)
      const reason = actionableReason(baselineKind, ratio)

      entries.push({
        suiteTitle: suite.title,
        stopcockName: stopcock.name,
        baselineName: baseline.name,
        baselineKind,
        stopcockHz: stopcock.hz,
        baselineHz: baseline.hz,
        ratio,
        actionable: reason != null,
        reason,
      })
    }
  }

  return {
    winRates: {
      libraryOnly: toWinRate(libraryWins, libraryTotal),
      allBaselines: toWinRate(allWins, allTotal),
    },
    entries,
    actionableLosses: entries.filter((entry) => entry.actionable),
    projectionRowsExcluded,
  }
}

function normalizeJsonSuiteTitle(fullName: string): string {
  const marker = ' > '
  const markerIndex = fullName.indexOf(marker)
  if (markerIndex === -1) return fullName
  return fullName.slice(markerIndex + marker.length)
}

function fastestRow<T extends { hz: number }>(rows: T[]): T {
  return rows.reduce((fastest, row) => (row.hz > fastest.hz ? row : fastest))
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100
}

function actionableReason(kind: BaselineKind, ratio: number): string | null {
  if ((kind === 'native-loop' || kind === 'manual-js') && ratio > 2) {
    return 'stopcock is more than 2x behind a native-loop/manual-js baseline'
  }

  if (kind === 'library' && ratio > 1.05) {
    return 'stopcock is more than 5% behind a library peer'
  }

  return null
}

function toWinRate(wins: number, total: number): WinRate {
  return {
    wins,
    total,
    percentage: total === 0 ? 0 : Math.round((wins / total) * 100),
  }
}

function formatHz(hz: number): string {
  return hz.toFixed(2).replace(/\B(?=(\d{3})+\.)/g, ',')
}

function renderSuite(suite: Suite): string {
  const { results } = suite
  if (results.length === 0) return ''

  const fastest = Math.max(...results.map((result) => result.hz))
  const nameWidth = Math.max(...results.map((result) => result.name.length), 8)
  const hzWidth = Math.max(...results.map((result) => formatHz(result.hz).length), 9)
  const rmeWidth = Math.max(...results.map((result) => result.rme.length), 6)
  const samplesWidth = Math.max(...results.map((result) => String(result.samples).length), 7)

  const lines = results.map((result) => {
    const kind = classifyBenchmarkRow(result.name)
    const diff =
      result.hz === fastest
        ? 'fastest'
        : `-${((1 - result.hz / fastest) * 100).toFixed(2)}%${kind === 'projection' ? ' (projection)' : ''}`
    const barWidth = Math.max(1, Math.round((result.hz / fastest) * MAX_BAR))
    const bar = '#'.repeat(barWidth)

    return [
      result.name.padEnd(nameWidth),
      formatHz(result.hz).padStart(hzWidth),
      'ops/sec',
      result.rme.padEnd(rmeWidth),
      String(result.samples).padEnd(samplesWidth),
      diff.padStart(9),
      bar,
    ].join(' ')
  })

  const fastestResult = results.find((result) => result.hz === fastest)
  const slowest = Math.min(...results.map((result) => result.hz))
  const fastestName = fastestResult?.name ?? 'unknown'
  const speedup = (fastest / slowest).toFixed(1)

  return [
    '```text',
    ...lines,
    '```',
    '',
    `Fastest is **${fastestName}** (${speedup}x spread)`,
    '',
  ].join('\n')
}

function groupSuites(suites: Suite[]): Map<string, Suite[]> {
  const groups = new Map<string, Suite[]>()

  for (const suite of suites) {
    const match = suite.title.match(/^(.+?)\s*[—-]\s+/)
    const group = match ? match[1].trim() : suite.title
    const groupSuites = groups.get(group) ?? []
    groupSuites.push(suite)
    groups.set(group, groupSuites)
  }

  return groups
}

function toStructuredJSON(groups: Map<string, Suite[]>): BenchmarkSuite[] {
  const out: BenchmarkSuite[] = []

  for (const [group, groupSuites] of groups) {
    for (const suite of groupSuites) {
      const paramMatch = suite.title.match(/n=([\d,_]+)/)
      const arraySize = paramMatch ? Number.parseInt(paramMatch[1].replace(/[,_]/g, ''), 10) : null
      const fastest = Math.max(...suite.results.map((result) => result.hz))

      out.push({
        category: group,
        arraySize,
        entries: suite.results.map((result) => ({
          library: result.name,
          kind: classifyBenchmarkRow(result.name),
          opsPerSec: result.hz,
          margin: result.rme,
          runs: result.samples,
          diff:
            result.hz === fastest ? 'fastest' : `-${((1 - result.hz / fastest) * 100).toFixed(2)}%`,
        })),
      })
    }
  }

  return out
}

async function readBenchmarkDependencyVersions(): Promise<Record<string, string>> {
  const pkgRaw = await readFile(path.join(__dirname, 'package.json'), 'utf8')
  const pkg = JSON.parse(pkgRaw) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const versions: Record<string, string> = {}

  for (const name of competitorPackages) {
    const version = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]
    if (version) versions[name] = version
  }

  return versions
}

function formatEngineLabel(lane: LaneConfig, identity: EngineIdentity): string {
  const version = identity.versions[identity.runtime as 'bun' | 'node' | 'deno']
  return version ? `${lane.label} ${version}` : lane.label
}

async function createMetadata(
  lane: LaneConfig,
  identity: EngineIdentity,
  summary: LossLedgerSummary,
): Promise<BenchmarkMetadata> {
  const versions = process.versions as NodeJS.ProcessVersions & { bun?: string; deno?: string }
  const runtimeName = versions.bun
    ? 'bun'
    : versions.deno
      ? 'deno'
      : versions.node
        ? 'node'
        : 'unknown'

  return {
    benchmarkRuntimeLabel: formatEngineLabel(lane, identity),
    generatedAt: new Date().toISOString(),
    benchmarkEngine: identity,
    generator: {
      runtime: runtimeName,
      versions: {
        bun: versions.bun,
        node: versions.node,
        deno: versions.deno,
      },
      platform: process.platform,
      arch: process.arch,
    },
    dependencies: await readBenchmarkDependencyVersions(),
    sourceVsDist: lane.sourceVsDist,
    winRateDenominators: {
      libraryOnly: summary.winRates.libraryOnly.total,
      allBaselines: summary.winRates.allBaselines.total,
    },
    includesNativeManualBaselines: true,
    projectionRowsExcluded: summary.projectionRowsExcluded,
  }
}

function renderMarkdown(
  groups: Map<string, Suite[]>,
  summary: LossLedgerSummary,
  metadata: BenchmarkMetadata,
): string {
  const out: string[] = [
    '# Benchmarks',
    '',
    `> **stopcock** wins **${summary.winRates.libraryOnly.wins}/${summary.winRates.libraryOnly.total}** comparisons against library peers only (${summary.winRates.libraryOnly.percentage}%), and **${summary.winRates.allBaselines.wins}/${summary.winRates.allBaselines.total}** comparisons counting every baseline including native-loop/manual-js ceiling rows (${summary.winRates.allBaselines.percentage}%), on ${metadata.benchmarkRuntimeLabel}.`,
    '',
    'All numbers in ops/sec (higher is better). Native loops and manual JavaScript rows are ceiling baselines, not peer FP-library competitors, and are only counted in the all-baselines denominator.',
    '',
  ]

  if (metadata.projectionRowsExcluded > 0) {
    out.push(
      `${metadata.projectionRowsExcluded} projected/extrapolated row(s) were found and excluded from every win-rate number above; they still appear in the per-suite tables below, labeled "(projection)".`,
      '',
    )
  }

  out.push(
    '## Metadata',
    '',
    `- Runtime: ${metadata.benchmarkRuntimeLabel}`,
    `- Bench engine (recorded from inside the worker process): ${metadata.benchmarkEngine.runtime} ${
      metadata.benchmarkEngine.versions[
        metadata.benchmarkEngine.runtime as 'bun' | 'node' | 'deno'
      ] ?? ''
    } (execPath: ${metadata.benchmarkEngine.execPath})`,
    `- Report generated by: ${metadata.generator.runtime} (${Object.entries(metadata.generator.versions)
      .filter(([, version]) => version != null)
      .map(([name, version]) => `${name} ${version}`)
      .join(', ')})`,
    `- Source/dist config: ${metadata.sourceVsDist}`,
    `- Competitor versions: ${Object.entries(metadata.dependencies)
      .map(([name, version]) => `${name}@${version}`)
      .join(', ')}`,
    `- Win-rate denominator "library-only" (${summary.winRates.libraryOnly.total}): counts only suites where stopcock has at least one library-peer baseline in the same suite.`,
    `- Win-rate denominator "all-baselines" (${summary.winRates.allBaselines.total}): counts every suite with a stopcock row, against every baseline present including native-loop/manual-js ceiling rows.`,
    `- Projection rows excluded from both denominators: ${metadata.projectionRowsExcluded}`,
    '',
  )

  if (summary.actionableLosses.length > 0) {
    out.push('## Actionable Losses')
    out.push('')
    out.push('| Suite | Baseline | Kind | Ratio | Reason |')
    out.push('|---|---|---:|---:|---|')
    for (const loss of summary.actionableLosses) {
      out.push(
        `| ${loss.suiteTitle} | ${loss.baselineName} | ${loss.baselineKind} | ${loss.ratio.toFixed(2)}x | ${loss.reason} |`,
      )
    }
    out.push('')
  }

  for (const [group, groupSuites] of groups) {
    out.push(`### ${group}`)
    out.push('')

    for (const suite of groupSuites) {
      const paramMatch = suite.title.match(/n=([\d,_]+)/)
      out.push(paramMatch ? `_n = ${paramMatch[1].replace(/_/g, ',')}_` : `_${suite.title}_`)
      out.push('')
      out.push(renderSuite(suite))
    }
  }

  out.push('---')
  out.push('')
  out.push('## Scoreboard')
  out.push('')
  out.push('| Denominator | Wins | Total | Win Rate | What it counts |')
  out.push('|---|---:|---:|---:|---|')
  out.push(
    `| Library peers only | ${summary.winRates.libraryOnly.wins} | ${summary.winRates.libraryOnly.total} | ${summary.winRates.libraryOnly.percentage}% | Suites with at least one library-peer baseline (ramda, lodash-es, etc). Excludes native-loop/manual-js and projection rows. |`,
  )
  out.push(
    `| All baselines | ${summary.winRates.allBaselines.wins} | ${summary.winRates.allBaselines.total} | ${summary.winRates.allBaselines.percentage}% | Every suite with a stopcock row, against every baseline present including native-loop/manual-js ceiling rows. Excludes projection rows. |`,
  )
  out.push('')

  return out.join('\n')
}

function runtimeSlug(runtime: string): string {
  return runtime
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseArgs(argv: string[]): { lane: string; results: string; identity?: string; json: boolean } {
  let lane: string | undefined
  let results: string | undefined
  let identity: string | undefined
  let json = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--lane') lane = argv[++i]
    else if (arg === '--results') results = argv[++i]
    else if (arg === '--identity') identity = argv[++i]
    else if (arg === '--json') json = true
  }

  if (!lane) fail('missing --lane <bun|node|deno|bun-dist|node-dist|deno-dist>')
  if (!results) fail('missing --results <path to vitest --outputJson file>')

  return { lane: lane!, results: results!, identity, json }
}

async function main(): Promise<void> {
  const { lane: laneName, results: resultsPath, identity: identityPath, json } = parseArgs(
    process.argv.slice(2),
  )

  const lane = LANES[laneName]
  if (!lane) fail(`unknown lane "${laneName}" — expected one of: ${Object.keys(LANES).join(', ')}`)

  const resultsRaw = await readFile(resultsPath, 'utf8').catch((error: NodeJS.ErrnoException) =>
    fail(`could not read results file ${resultsPath}: ${error.message}`),
  )
  const suites = parseVitestJsonOutput(resultsRaw)

  if (!identityPath) {
    fail(
      `missing --identity <path> — cannot verify the "${laneName}" lane actually ran under ${lane.engine} without the recorded engine identity`,
    )
  }
  const identityRaw = await readFile(identityPath, 'utf8').catch((error: NodeJS.ErrnoException) =>
    fail(`could not read identity file ${identityPath}: ${error.message}`),
  )
  const identity = parseIdentity(identityRaw)

  if (identity.runtime !== lane.engine) {
    fail(
      `lane "${laneName}" expects the bench worker to run under ${lane.engine}, but the recorded identity says it ran under ${identity.runtime} (execPath: ${identity.execPath}). Refusing to mislabel the report.`,
    )
  }

  const groups = groupSuites(suites)
  const summary = summarizeLossLedger(suites)
  const metadata = await createMetadata(lane, identity, summary)

  if (json) {
    const jsonOut = {
      metadata,
      suites: toStructuredJSON(groups),
      lossLedger: summary,
    }
    const jsonPath = path.resolve(__dirname, '../docs', `benchmarks-${runtimeSlug(laneName)}.json`)
    await writeFile(jsonPath, `${JSON.stringify(jsonOut, null, 2)}\n`)
    console.error(`Wrote docs/benchmarks-${runtimeSlug(laneName)}.json`)
  }

  console.log(renderMarkdown(groups, summary, metadata))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error: unknown) => {
    console.error(error instanceof ReportError ? `generate-report: ${error.message}` : error)
    process.exit(1)
  })
}
