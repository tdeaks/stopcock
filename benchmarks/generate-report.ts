/**
 * Runs vitest bench and generates a markdown report.
 * Usage: bun run benchmarks/generate-report.ts "Bun 1.3 (dist)" --json
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stdin } from 'node:process'
import { fileURLToPath } from 'node:url'

const MAX_BAR = 68

export type Result = { name: string; hz: number; rme: string; samples: number }
export type Suite = { title: string; results: Result[] }
export type BenchmarkRowKind = 'stopcock' | 'library' | 'native-chain' | 'native-loop' | 'manual-js'

type BaselineKind = Exclude<BenchmarkRowKind, 'stopcock'>

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

type BenchmarkMetadata = {
  benchmarkRuntimeLabel: string
  generatedAt: string
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
}

type VitestJsonBenchmark = {
  name: string
  hz: number
  rme?: number
  sampleCount?: number
  samples?: unknown[]
}

type VitestJsonGroup = {
  fullName?: string
  name?: string
  benchmarks?: VitestJsonBenchmark[]
}

type VitestJsonOutput = {
  files?: Array<{
    filepath?: string
    groups?: VitestJsonGroup[]
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

export function parseVitestTextOutput(raw: string): Suite[] {
  const suites: Suite[] = []
  let current: Suite | null = null

  for (const line of raw.split('\n')) {
    const suiteMatch = line.match(/[✓×]\s+\S+\s+>\s+(.+?)\s+\d+ms/)
    if (suiteMatch) {
      current = { title: suiteMatch[1].trim(), results: [] }
      suites.push(current)
      continue
    }

    const resultMatch = line.match(
      /·\s+(.+?)\s{2,}([\d,]+\.\d+)\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+(±[\d.]+%)\s+(\d+)/,
    )
    if (resultMatch && current) {
      current.results.push({
        name: resultMatch[1].trim(),
        hz: Number.parseFloat(resultMatch[2].replace(/,/g, '')),
        rme: resultMatch[3],
        samples: Number.parseInt(resultMatch[4], 10),
      })
    }
  }

  return suites
}

export function parseVitestJsonOutput(raw: string): Suite[] {
  const parsed = JSON.parse(raw) as VitestJsonOutput
  const suites: Suite[] = []

  for (const file of parsed.files ?? []) {
    for (const group of file.groups ?? []) {
      const title = normalizeJsonSuiteTitle(
        group.fullName ?? group.name ?? file.filepath ?? 'benchmarks',
      )
      const results = (group.benchmarks ?? [])
        .filter((benchmark) => Number.isFinite(benchmark.hz))
        .map((benchmark) => ({
          name: benchmark.name,
          hz: benchmark.hz,
          rme: benchmark.rme == null ? '' : `±${benchmark.rme.toFixed(2)}%`,
          samples: benchmark.sampleCount ?? benchmark.samples?.length ?? 0,
        }))
      suites.push({ title, results })
    }
  }

  return suites
}

export function parseBenchmarkInput(raw: string): Suite[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('{')) {
    return parseVitestJsonOutput(trimmed)
  }

  return parseVitestTextOutput(raw)
}

export function classifyBenchmarkRow(name: string): BenchmarkRowKind {
  const lower = name.toLowerCase()

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
  const entries: LossLedgerEntry[] = []

  for (const suite of suites) {
    const stopcockRows = suite.results.filter(
      (row) => classifyBenchmarkRow(row.name) === 'stopcock',
    )
    if (stopcockRows.length === 0) continue

    const stopcock = fastestRow(stopcockRows)
    const baselines = suite.results.filter((row) => !stopcockRows.includes(row))
    if (baselines.length === 0) continue

    allTotal += 1
    if (stopcock.hz >= fastestRow(suite.results).hz) {
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

  const summary: LossLedgerSummary = {
    winRates: {
      libraryOnly: toWinRate(libraryWins, libraryTotal),
      allBaselines: toWinRate(allWins, allTotal),
    },
    entries,
    actionableLosses: entries.filter((entry) => entry.actionable),
  }

  return summary
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
  const slowest = Math.min(...results.map((result) => result.hz))
  const nameWidth = Math.max(...results.map((result) => result.name.length), 8)
  const hzWidth = Math.max(...results.map((result) => formatHz(result.hz).length), 9)
  const rmeWidth = Math.max(...results.map((result) => result.rme.length), 6)
  const samplesWidth = Math.max(...results.map((result) => String(result.samples).length), 7)

  const lines = results.map((result) => {
    const diff =
      result.hz === fastest ? 'fastest' : `-${((1 - result.hz / fastest) * 100).toFixed(2)}%`
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

  const fastestName = results.find((result) => result.hz === fastest)?.name ?? 'unknown'
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

async function createMetadata(
  runtime: string,
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
    benchmarkRuntimeLabel: runtime,
    generatedAt: new Date().toISOString(),
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
    sourceVsDist: /dist/i.test(runtime) ? 'dist' : /source/i.test(runtime) ? 'source' : 'unknown',
    winRateDenominators: {
      libraryOnly: summary.winRates.libraryOnly.total,
      allBaselines: summary.winRates.allBaselines.total,
    },
    includesNativeManualBaselines: true,
  }
}

function renderMarkdown(
  groups: Map<string, Suite[]>,
  runtime: string,
  summary: LossLedgerSummary,
  metadata: BenchmarkMetadata,
): string {
  const out: string[] = [
    '# Benchmarks',
    '',
    `> **stopcock** wins **${summary.winRates.libraryOnly.wins}/${summary.winRates.libraryOnly.total}** library-only comparisons (${summary.winRates.libraryOnly.percentage}%) and **${summary.winRates.allBaselines.wins}/${summary.winRates.allBaselines.total}** comparisons including native/manual baselines (${summary.winRates.allBaselines.percentage}%) on ${runtime}.`,
    '',
    'All numbers in ops/sec (higher is better). Native loops and manual JavaScript rows are ceiling baselines, not peer FP-library competitors.',
    '',
    '## Metadata',
    '',
    `- Runtime: ${metadata.benchmarkRuntimeLabel}`,
    `- Generated by: ${metadata.generator.runtime} (${Object.entries(metadata.generator.versions)
      .filter(([, version]) => version != null)
      .map(([name, version]) => `${name} ${version}`)
      .join(', ')})`,
    `- Source/dist config: ${metadata.sourceVsDist}`,
    `- Competitor versions: ${Object.entries(metadata.dependencies)
      .map(([name, version]) => `${name}@${version}`)
      .join(', ')}`,
    `- Win-rate denominator: library-only ${summary.winRates.libraryOnly.total}; all-baselines ${summary.winRates.allBaselines.total}`,
    `- Native/manual baselines included: ${metadata.includesNativeManualBaselines ? 'yes' : 'no'}`,
    '',
  ]

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
  out.push('| Denominator | Wins | Total | Win Rate |')
  out.push('|---|---:|---:|---:|')
  out.push(
    `| Library peers only | ${summary.winRates.libraryOnly.wins} | ${summary.winRates.libraryOnly.total} | ${summary.winRates.libraryOnly.percentage}% |`,
  )
  out.push(
    `| All baselines | ${summary.winRates.allBaselines.wins} | ${summary.winRates.allBaselines.total} | ${summary.winRates.allBaselines.percentage}% |`,
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []

  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

async function main(): Promise<void> {
  const raw = await readStdin()

  if (!raw.trim()) {
    console.error(
      'Pipe vitest bench output: bunx vitest bench 2>&1 | bun run benchmarks/generate-report.ts',
    )
    process.exit(1)
  }

  const runtime = process.argv[2] ?? 'current runtime'
  const suites = parseBenchmarkInput(raw)
  const groups = groupSuites(suites)
  const summary = summarizeLossLedger(suites)
  const metadata = await createMetadata(runtime, summary)

  if (process.argv.includes('--json')) {
    const jsonOut = {
      metadata,
      suites: toStructuredJSON(groups),
      lossLedger: summary,
    }
    const jsonPath = path.resolve(__dirname, '../docs', `benchmarks-${runtimeSlug(runtime)}.json`)
    await writeFile(jsonPath, `${JSON.stringify(jsonOut, null, 2)}\n`)
    console.error(`Wrote docs/benchmarks-${runtimeSlug(runtime)}.json`)
  }

  console.log(renderMarkdown(groups, runtime, summary, metadata))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await main()
}
