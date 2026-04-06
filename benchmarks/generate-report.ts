/**
 * Runs vitest bench and generates a ts-belt-style markdown report.
 * Usage: bun run benchmarks/generate-report.ts > docs/benchmarks.md
 */

const MAX_BAR = 68

type Result = { name: string; hz: number; rme: string; samples: number }
type Suite = { title: string; results: Result[] }

function parseVitestOutput(raw: string): Suite[] {
  const suites: Suite[] = []
  let current: Suite | null = null

  for (const line of raw.split('\n')) {
    // Suite header: " ✓ src/array-map.bench.ts > map — n=100 5541ms"
    const suiteMatch = line.match(/[✓×]\s+\S+\s+>\s+(.+?)\s+\d+ms/)
    if (suiteMatch) {
      current = { title: suiteMatch[1].trim(), results: [] }
      suites.push(current)
      continue
    }

    // Result line: "   · stopcock  9,744,697.30  0.0000  0.1571  0.0001  0.0001  0.0001  0.0002  0.0003  ±0.42%  4872349"
    const resultMatch = line.match(/·\s+(.+?)\s{2,}([\d,]+\.\d+)\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+(±[\d.]+%)\s+(\d+)/)
    if (resultMatch && current) {
      current.results.push({
        name: resultMatch[1].trim(),
        hz: parseFloat(resultMatch[2].replace(/,/g, '')),
        rme: resultMatch[3],
        samples: parseInt(resultMatch[4]),
      })
    }
  }

  return suites
}

function formatHz(hz: number): string {
  return hz.toFixed(2).replace(/\B(?=(\d{3})+\.)/g, ',')
}

function renderSuite(suite: Suite): string {
  const { results } = suite
  if (results.length === 0) return ''

  const fastest = Math.max(...results.map(r => r.hz))
  const nameWidth = Math.max(...results.map(r => r.name.length))
  const hzWidth = Math.max(...results.map(r => formatHz(r.hz).length))
  const rmeWidth = Math.max(...results.map(r => r.rme.length))
  const samplesWidth = Math.max(...results.map(r => `(${r.samples} runs)`.length))

  const diffs = results.map(r => {
    const fraction = r.hz / fastest
    return r.hz === fastest ? 'fastest' : `-${((1.0 - fraction) * 100).toFixed(2)}%`
  })
  const diffWidth = Math.max(...diffs.map(d => d.length))

  const lines: string[] = []

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const fraction = r.hz / fastest
    const bar = '█'.repeat(Math.max(1, Math.round(fraction * MAX_BAR)))
    const samplesStr = `(${r.samples} runs)`

    lines.push(
      `✔  ${r.name.padEnd(nameWidth)}  ${formatHz(r.hz).padStart(hzWidth)}  ops/sec  ${r.rme.padEnd(rmeWidth)}  ${samplesStr.padEnd(samplesWidth)}  ${diffs[i].padStart(diffWidth)}`
    )
    lines.push(bar)
  }

  const fastestName = results.find(r => r.hz === fastest)!.name
  const slowestHz = Math.min(...results.map(r => r.hz))
  const speedup = (fastest / slowestHz).toFixed(1)
  const trophy = fastest === results[0].hz ? ' 👑' : ''
  return '```bash\n' + lines.join('\n') + '\n```\n\n→ Fastest is **' + fastestName + '**' + trophy + ' · ' + speedup + 'x spread\n'
}

function groupSuites(suites: Suite[]): Map<string, Suite[]> {
  const groups = new Map<string, Suite[]>()
  for (const suite of suites) {
    const match = suite.title.match(/^(.+?)\s*—/)
    const group = match ? match[1].trim() : suite.title
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(suite)
  }
  return groups
}

type BenchmarkEntry = {
  library: string
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

function toStructuredJSON(groups: Map<string, Suite[]>): BenchmarkSuite[] {
  const out: BenchmarkSuite[] = []
  for (const [group, groupSuites] of groups) {
    for (const suite of groupSuites) {
      const paramMatch = suite.title.match(/n=([\d,_]+)/)
      const arraySize = paramMatch
        ? parseInt(paramMatch[1].replace(/[,_]/g, ''))
        : null
      const fastest = Math.max(...suite.results.map(r => r.hz))
      out.push({
        category: group,
        arraySize,
        entries: suite.results.map(r => ({
          library: r.name,
          opsPerSec: r.hz,
          margin: r.rme,
          runs: r.samples,
          diff: r.hz === fastest ? 'fastest' : `-${((1 - r.hz / fastest) * 100).toFixed(2)}%`,
        })),
      })
    }
  }
  return out
}

// Read from stdin or run benchmarks
const raw = await Bun.stdin.text()

if (!raw.trim()) {
  console.error('Pipe vitest bench output: bunx vitest bench 2>&1 | bun run benchmarks/generate-report.ts')
  process.exit(1)
}

const suites = parseVitestOutput(raw)
const groups = groupSuites(suites)

const runtime = process.argv[2] || 'Bun'
const jsonFlag = process.argv.includes('--json')
const runtimeSlug = runtime.toLowerCase().replace(/[^a-z0-9]+/g, '-')

if (jsonFlag) {
  const structured = toStructuredJSON(groups)
  const jsonOut = { runtime, suites: structured }
  const jsonPath = `../docs/benchmarks-${runtimeSlug}.json`
  await Bun.write(jsonPath, JSON.stringify(jsonOut, null, 2))
  console.error(`Wrote docs/benchmarks-${runtimeSlug}.json`)
}

// Tally wins per library across suites that compare multiple libraries
const wins = new Map<string, number>()
let totalSuites = 0

for (const [, groupSuites] of groups) {
  for (const suite of groupSuites) {
    if (suite.results.length < 2) continue
    // Only count suites that are library comparisons (contain a stopcock entry)
    const isComparison = suite.results.some(r => r.name.startsWith('stopcock'))
    if (!isComparison) continue
    totalSuites++
    const fastest = Math.max(...suite.results.map(r => r.hz))
    const winner = suite.results.find(r => r.hz === fastest)!.name
    wins.set(winner, (wins.get(winner) || 0) + 1)
  }
}

const sortedWins = [...wins.entries()].sort((a, b) => b[1] - a[1])
const pkgName = sortedWins[0]?.[0] || 'stopcock'
const pkgWins = sortedWins[0]?.[1] || 0
const winPct = ((pkgWins / totalSuites) * 100).toFixed(0)

const out: string[] = [
  '# Benchmarks',
  '',
  `> **${pkgName}** wins **${pkgWins}/${totalSuites}** benchmarks (${winPct}%) on ${runtime}`,
  '',
  `All numbers in ops/sec (higher is better). Measured with vitest bench on **${runtime}**, Apple Silicon.`,
  '',
]

for (const [group, groupSuites] of groups) {
  out.push(`### ${group}`)
  out.push('')
  for (const suite of groupSuites) {
    const paramMatch = suite.title.match(/n=([\d,_]+)/)
    if (paramMatch) {
      out.push(`_n = ${paramMatch[1].replace(/_/g, ',')}_`)
    } else {
      out.push(`_${suite.title}_`)
    }
    out.push('')
    out.push(renderSuite(suite))
  }
}

// Win summary at the end
out.push('---')
out.push('')
out.push('## Scoreboard')
out.push('')
out.push('| Library | Wins |')
out.push('|---|---|')
for (const [lib, count] of sortedWins) {
  const bar = '🏆'.repeat(Math.ceil(count / 3))
  out.push(`| **${lib}** | ${count} ${bar} |`)
}
out.push(`| _Total benchmarks_ | _${totalSuites}_ |`)
out.push('')

console.log(out.join('\n'))
