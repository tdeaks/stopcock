// W0b: paired per-case non-regression harness vs the 0.0.3 baseline.
//
// Baseline location: the tag @stopcock/fp@0.0.3 exists in this repo's git
// history (`git tag` confirms it) and its commit is main's current tip, i.e.
// exactly where fp-absolute-performance diverged. A worktree of that tag is
// the baseline tree. `bun install` at the worktree root fails on an
// unrelated postinstall step (puppeteer trying to download a Chrome
// binary, blocked by this sandbox's network policy) -- that's irrelevant
// here: @stopcock/fp's own source has no runtime dependency on node_modules,
// so importing packages/fp/src/{pipe,array}.ts directly from the worktree
// works with no install at all, confirmed by hand before writing this file.
//
// Comparison surface: bare `pipe(input, ...ops)` on both sides, not
// compile()/compileJit -- the 0.0.3 API only has pipe/flow, so pipe is the
// only apples-to-apples surface across versions, and it's also the default
// hot path most callers hit.
import { pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCallback, type CallbackSpec } from './binding-specs'
import { generateInputArray, type SerializedStep } from './generate'
import { geomean, runPaired } from './perf-runner'
import { pipe as currentPipe } from '../../../packages/fp/src/fusion'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface PerfCaseFile {
  readonly name: string
  readonly strata: Record<string, unknown>
  readonly inputSeed: number
  readonly size: number
  readonly steps: readonly SerializedStep[]
}

/** Minimal structural type for the subset of A.* this harness drives; satisfied by both the current tree's array.ts and 0.0.3's. */
interface ArrayModule {
  map: (f: (x: number) => unknown) => unknown
  filter: (f: (x: number) => boolean) => unknown
  reject: (f: (x: number) => boolean) => unknown
  filterMap: (f: (x: number) => unknown) => unknown
  flatMap: (f: (x: number) => number[]) => unknown
  take: (n: number) => unknown
  drop: (n: number) => unknown
  takeWhile: (f: (x: number) => boolean) => unknown
  dropWhile: (f: (x: number) => boolean) => unknown
  count: (f: (x: number) => boolean) => unknown
  reduce: (f: (acc: number, x: number) => number, a1: number) => unknown
  forEach: (f: (x: number) => void) => unknown
  find: (f: (x: number) => boolean) => unknown
  every: (f: (x: number) => boolean) => unknown
  some: (f: (x: number) => boolean) => unknown
  sort: unknown
  sortBy: (f: (a: number, b: number) => number) => unknown
  sortAsc: unknown
  sortDesc: unknown
  reverse: unknown
  uniq: unknown
  sum: unknown
}

/** Builds the same real op sequence generate.ts's REAL_*_BUILDERS build, against whichever ArrayModule is passed in. */
function buildRealSteps(steps: readonly SerializedStep[], A: ArrayModule): unknown[] {
  const out: unknown[] = []
  for (const s of steps) {
    switch (s.kind) {
      case 'map':
        out.push(A.map(buildCallback(s.spec as CallbackSpec) as (x: number) => unknown))
        break
      case 'filter':
        out.push(A.filter(buildCallback(s.spec as CallbackSpec) as (x: number) => boolean))
        break
      case 'reject':
        out.push(A.reject(buildCallback(s.spec as CallbackSpec) as (x: number) => boolean))
        break
      case 'filterMap':
        out.push(A.filterMap(buildCallback(s.spec as CallbackSpec) as (x: number) => unknown))
        break
      case 'flatMap':
        out.push(A.flatMap(buildCallback(s.spec as CallbackSpec) as (x: number) => number[]))
        break
      case 'take':
        out.push(A.take(s.n!))
        break
      case 'drop':
        out.push(A.drop(s.n!))
        break
      case 'takeWhile':
        out.push(A.takeWhile(buildCallback(s.spec as CallbackSpec) as (x: number) => boolean))
        break
      case 'dropWhile':
        out.push(A.dropWhile(buildCallback(s.spec as CallbackSpec) as (x: number) => boolean))
        break
      case 'count':
        out.push(A.count(buildCallback(s.spec as CallbackSpec) as (x: number) => boolean))
        break
      case 'reduce':
        out.push(A.reduce(buildCallback(s.spec as CallbackSpec) as (acc: number, x: number) => number, s.a1 as number))
        break
      case 'forEach':
        out.push(A.forEach(buildCallback(s.spec as CallbackSpec) as (x: number) => void))
        break
      case 'find':
        out.push(A.find(buildCallback(s.spec as CallbackSpec) as (x: number) => boolean))
        break
      case 'every':
        out.push(A.every(buildCallback(s.spec as CallbackSpec) as (x: number) => boolean))
        break
      case 'some':
        out.push(A.some(buildCallback(s.spec as CallbackSpec) as (x: number) => boolean))
        break
      case 'sort':
        out.push(A.sort)
        break
      case 'sortBy':
        out.push(A.sortBy(buildCallback(s.spec as CallbackSpec) as (a: number, b: number) => number))
        break
      case 'sortAsc':
        out.push(A.sortAsc)
        break
      case 'sortDesc':
        out.push(A.sortDesc)
        break
      case 'reverse':
        out.push(A.reverse)
        break
      case 'uniq':
        out.push(A.uniq)
        break
      case 'sum':
        out.push(A.sum)
        break
      case 'toArray':
        break
      default:
        throw new Error(`baseline-compare: unsupported op kind for 0.0.3: ${s.kind}`)
    }
  }
  return out
}

interface Args {
  baselinePath: string
  rounds: number
  casesFilter?: string
  quick: boolean
  out?: string
  corpusPath: string
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    baselinePath: join(
      '/private/tmp/claude-501/-Users-tomdeakin-IdeaProjects-lay-some-pipe/5bc8621a-36b8-4907-ae38-7441eacb078b/scratchpad',
      'baseline-003',
    ),
    rounds: 40,
    quick: false,
    corpusPath: join(__dirname, 'perf-corpus.json'),
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--baseline-path') args.baselinePath = argv[++i]
    else if (a === '--rounds') args.rounds = Number(argv[++i])
    else if (a === '--cases') args.casesFilter = argv[++i]
    else if (a === '--quick') args.quick = true
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--corpus') args.corpusPath = argv[++i]
  }
  if (args.quick) args.rounds = Math.min(args.rounds, 8)
  return args
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return true
    return Object.is(a, b)
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false
    return true
  }
  return Object.is(a, b)
}

interface CaseResult {
  name: string
  rounds: number
  medianRatio: number
  ciLow: number
  ciHigh: number
  signTestP: number
  correctnessOk: boolean
  regression: boolean
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const baselineArrayUrl = pathToFileURL(join(args.baselinePath, 'packages/fp/src/array.ts')).href
  const baselinePipeUrl = pathToFileURL(join(args.baselinePath, 'packages/fp/src/pipe.ts')).href

  let baselineA: ArrayModule
  let baselinePipe: (input: unknown, ...fns: unknown[]) => unknown
  try {
    baselineA = (await import(baselineArrayUrl)) as unknown as ArrayModule
    const pipeMod = (await import(baselinePipeUrl)) as { pipe: (input: unknown, ...fns: unknown[]) => unknown }
    baselinePipe = pipeMod.pipe
  } catch (e) {
    console.error(
      `baseline-compare: could not import the 0.0.3 baseline from ${args.baselinePath}.\n` +
        `Expected a git worktree checked out at the @stopcock/fp@0.0.3 tag (see the module comment in this file for how it was set up).\n` +
        `Pass --baseline-path <dir> to point at a different worktree.\n` +
        `Underlying error: ${(e as Error).message}`,
    )
    process.exitCode = 1
    return
  }

  const corpusRaw = await (await import('node:fs/promises')).readFile(args.corpusPath, 'utf8')
  const corpus = JSON.parse(corpusRaw) as { version: number; cases: readonly PerfCaseFile[] }
  let cases = corpus.cases
  if (args.casesFilter) cases = cases.filter((c) => c.name.includes(args.casesFilter!))
  if (args.quick) cases = cases.filter((c) => c.size <= 10_000)

  const results: CaseResult[] = []
  const skipped: string[] = []

  for (const c of cases) {
    const input = generateInputArray(c.inputSeed, c.size)
    let newSteps: unknown[]
    let oldSteps: unknown[]
    try {
      newSteps = buildRealSteps(c.steps, (await import('../../../packages/fp/src/array')) as unknown as ArrayModule)
      oldSteps = buildRealSteps(c.steps, baselineA)
    } catch (e) {
      skipped.push(`${c.name}: ${(e as Error).message}`)
      continue
    }

    const newFn = (): unknown => currentPipe(input, ...newSteps)
    const oldFn = (): unknown => baselinePipe(input, ...oldSteps)

    let newOnce: unknown
    let oldOnce: unknown
    try {
      newOnce = newFn()
      oldOnce = oldFn()
    } catch (e) {
      skipped.push(`${c.name}: threw during correctness check: ${(e as Error).message}`)
      continue
    }
    const correctnessOk = deepEqual(newOnce, oldOnce)

    const result = runPaired(
      () => {
        newFn()
      },
      () => {
        oldFn()
      },
      { rounds: args.rounds },
    )
    // ratio here is old/new via runPaired's b/a convention (a=new/"stopcock", b=old/"reference"): >1 means new is faster.
    const regression = result.ciHigh < 1 && result.signTestP < 0.05
    results.push({
      name: c.name,
      rounds: result.pairedRatios.length,
      medianRatio: result.medianRatio,
      ciLow: result.ciLow,
      ciHigh: result.ciHigh,
      signTestP: result.signTestP,
      correctnessOk,
      regression,
    })
  }

  const regressions = results.filter((r) => r.regression)
  const report = {
    generatedAt: new Date().toISOString(),
    baselinePath: args.baselinePath,
    baselineTag: '@stopcock/fp@0.0.3',
    corpusVersion: corpus.version,
    geomeanRatio: geomean(results.map((r) => r.medianRatio)),
    regressionCount: regressions.length,
    results,
    skipped,
  }

  const outPath = args.out ?? join(__dirname, '..', '..', 'reports', `baseline-compare-${new Date().toISOString().slice(0, 10)}.json`)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(report, null, 2) + '\n')

  console.log(`\nbaseline-compare (0.0.3): ratio = oldNs/newNs; >1 == current tree is faster than 0.0.3\n`)
  for (const r of results) {
    console.log(
      `${r.regression ? 'REGRESSION' : '          '}\t${r.name}\tmedian=${r.medianRatio.toFixed(3)}\tCI=[${r.ciLow.toFixed(3)},${r.ciHigh.toFixed(3)}]\tp=${r.signTestP.toFixed(3)}\t${r.correctnessOk ? 'ok' : 'MISMATCH'}`,
    )
  }
  console.log(`\ngeomean ratio: ${report.geomeanRatio.toFixed(3)}`)
  console.log(`regressions flagged (CI entirely below 1.0, p<0.05): ${regressions.length} / ${results.length}`)
  if (skipped.length > 0) {
    console.log(`\nskipped (${skipped.length}):`)
    for (const s of skipped) console.log(`  - ${s}`)
  }
  console.log(`\nfull report: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
