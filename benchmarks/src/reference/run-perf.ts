// W0b CLI: node --import=tsx run-perf.ts, or bun run-perf.ts (bun is the
// primary supported runner here -- generate.ts and friends use extensionless
// relative imports into packages/fp/src, which node's native ESM resolver
// rejects even under --experimental-strip-types; bun and tsx both resolve
// them fine). Flags: --tier 0|1|all, --cases <substring>, --rounds N, --quick.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, compileJit, JitUnavailableError, __getJitRunnerState, type Runner } from '../../../packages/fp/src/compile'
import { compileEmittedPipeline, type PipelineDesc } from './emitter'
import { generateInputArray, resolvePipeline, type SerializedPipeline, type SerializedStep } from './generate'
import { geomean, runPaired, type PairedRunResult } from './perf-runner'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface PerfCaseFile {
  readonly name: string
  readonly strata: Record<string, unknown>
  readonly inputSeed: number
  readonly size: number
  readonly steps: readonly SerializedStep[]
}

interface Args {
  tier: '0' | '1' | 'all'
  casesFilter?: string
  rounds: number
  quick: boolean
  out?: string
  corpusPath: string
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { tier: 'all', rounds: 40, quick: false, corpusPath: join(__dirname, 'perf-corpus.json') }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tier') args.tier = argv[++i] as Args['tier']
    else if (a === '--cases') args.casesFilter = argv[++i]
    else if (a === '--rounds') args.rounds = Number(argv[++i])
    else if (a === '--quick') args.quick = true
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--corpus') args.corpusPath = argv[++i]
  }
  if (args.quick) {
    args.rounds = Math.min(args.rounds, 8)
  }
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

/** Forces tier-1 promotion deterministically: JIT_PROMOTE_EXECUTIONS is 8 regardless of input size, so 8 warm calls always cross that threshold. Verified afterward via __getJitRunnerState rather than assumed. */
async function buildTier1Runner(
  realSteps: readonly unknown[],
  input: readonly number[],
): Promise<{ runner: Runner; promoted: boolean; note?: string } | undefined> {
  let runner: Runner
  try {
    runner = await compileJit({ onUnavailable: 'throw' }, ...realSteps)
  } catch (e) {
    if (e instanceof JitUnavailableError) return undefined
    return { runner: (() => undefined) as Runner, promoted: false, note: `compileJit threw: ${(e as Error).message}` }
  }
  for (let i = 0; i < 8; i++) runner(input)
  const state = __getJitRunnerState(runner)
  return { runner, promoted: state?.promoted ?? false }
}

interface CaseReport {
  readonly name: string
  readonly strata: Record<string, unknown>
  readonly tier: 0 | 1
  readonly tierAttribution: 'construction' | 'explainRunner'
  readonly promoted: boolean | null
  readonly correctnessOk: boolean
  readonly rounds: number
  readonly medianRatio: number
  readonly meanRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly signTestP: number
  readonly note?: string
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const corpusRaw = await (await import('node:fs/promises')).readFile(args.corpusPath, 'utf8')
  const corpus = JSON.parse(corpusRaw) as { version: number; comment: string; cases: readonly PerfCaseFile[] }

  let cases = corpus.cases
  if (args.casesFilter) cases = cases.filter((c) => c.name.includes(args.casesFilter!))
  if (args.quick) cases = cases.filter((c) => c.size <= 10_000)

  // explainRunner does not exist yet in packages/fp/src as of this run (checked
  // at the top of main so a late-landing export is picked up on the next
  // invocation without code changes here). Until then tier attribution is by
  // construction: compile() is tier 0, an awaited compileJit() forced to
  // state.promoted is tier 1.
  let explainRunner: ((r: Runner) => { tier: number }) | undefined
  try {
    const mod = (await import('../../../packages/fp/src/compile')) as { explainRunner?: (r: Runner) => { tier: number } }
    explainRunner = mod.explainRunner
  } catch {
    explainRunner = undefined
  }

  const reports: CaseReport[] = []
  const skipped: string[] = []

  for (const c of cases) {
    const serialized: SerializedPipeline = { input: generateInputArray(c.inputSeed, c.size), steps: c.steps }
    let g: ReturnType<typeof resolvePipeline>
    try {
      g = resolvePipeline(serialized)
    } catch (e) {
      skipped.push(`${c.name}: resolvePipeline threw: ${(e as Error).message}`)
      continue
    }

    const referenceCompiled = compileEmittedPipeline(g.desc as PipelineDesc)
    const refFn = (): unknown => referenceCompiled(g.input, g.bindings)
    const referenceOnce = refFn()

    const wantTiers: Array<0 | 1> = args.tier === 'all' ? [0, 1] : [Number(args.tier) as 0 | 1]

    for (const tier of wantTiers) {
      try {
        if (tier === 0) {
          const tier0Runner = compile(...g.realSteps)
          const tier0Once = tier0Runner(g.input)
          const correctnessOk = deepEqual(tier0Once, referenceOnce)
          const stopcockFn = (): void => {
            tier0Runner(g.input)
          }
          const result: PairedRunResult = runPaired(stopcockFn, () => {
            refFn()
          }, { rounds: args.rounds })
          reports.push({
            name: c.name,
            strata: c.strata,
            tier: 0,
            tierAttribution: 'construction',
            promoted: null,
            correctnessOk,
            rounds: result.pairedRatios.length,
            medianRatio: result.medianRatio,
            meanRatio: result.meanRatio,
            ciLow: result.ciLow,
            ciHigh: result.ciHigh,
            signTestP: result.signTestP,
          })
        } else {
          const built = await buildTier1Runner(g.realSteps, g.input)
          if (!built) {
            skipped.push(`${c.name} (tier 1): JIT unavailable in this environment (probeDynamicCode false or chunk load failed)`)
            continue
          }
          if (built.note) {
            skipped.push(`${c.name} (tier 1): ${built.note}`)
            continue
          }
          const tier1Once = built.runner(g.input)
          const correctnessOk = deepEqual(tier1Once, referenceOnce)
          const attribution = explainRunner ? explainRunner(built.runner) : undefined
          const stopcockFn = (): void => {
            built.runner(g.input)
          }
          const result: PairedRunResult = runPaired(stopcockFn, () => {
            refFn()
          }, { rounds: args.rounds })
          reports.push({
            name: c.name,
            strata: c.strata,
            tier: 1,
            tierAttribution: attribution ? 'explainRunner' : 'construction',
            promoted: built.promoted,
            correctnessOk,
            rounds: result.pairedRatios.length,
            medianRatio: result.medianRatio,
            meanRatio: result.meanRatio,
            ciLow: result.ciLow,
            ciHigh: result.ciHigh,
            signTestP: result.signTestP,
          })
        }
      } catch (e) {
        skipped.push(`${c.name} (tier ${tier}): threw during run: ${(e as Error).message}`)
      }
    }
  }

  const byTier = (t: 0 | 1): CaseReport[] => reports.filter((r) => r.tier === t)
  const summary = {
    tier0: {
      count: byTier(0).length,
      geomeanRatio: geomean(byTier(0).map((r) => r.medianRatio)),
      minRatio: Math.min(...byTier(0).map((r) => r.medianRatio), Infinity),
      allCorrect: byTier(0).every((r) => r.correctnessOk),
    },
    tier1: {
      count: byTier(1).length,
      geomeanRatio: geomean(byTier(1).map((r) => r.medianRatio)),
      minRatio: Math.min(...byTier(1).map((r) => r.medianRatio), Infinity),
      allCorrect: byTier(1).every((r) => r.correctnessOk),
    },
  }

  const report = {
    generatedAt: new Date().toISOString(),
    corpusVersion: corpus.version,
    args,
    summary,
    cases: reports,
    skipped,
  }

  const outPath = args.out ?? join(__dirname, '..', '..', 'reports', `tiered-perf-${new Date().toISOString().slice(0, 10)}.json`)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(report, null, 2) + '\n')

  printTable(reports, summary, skipped, outPath)
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : String(n)
}

function printTable(
  reports: readonly CaseReport[],
  summary: { tier0: { count: number; geomeanRatio: number; allCorrect: boolean }; tier1: { count: number; geomeanRatio: number; allCorrect: boolean } },
  skipped: readonly string[],
  outPath: string,
): void {
  console.log(`\nW0b perf report (ratio = referenceNs / stopcockNs; >1 == stopcock faster than the frozen reference)\n`)
  const header = ['tier', 'case', 'n', 'median', 'mean', 'CI95', 'signP', 'correct'].join('\t')
  console.log(header)
  for (const r of reports) {
    console.log(
      [
        `t${r.tier}`,
        r.name.length > 48 ? r.name.slice(0, 45) + '...' : r.name,
        r.rounds,
        fmt(r.medianRatio),
        fmt(r.meanRatio),
        `[${fmt(r.ciLow)},${fmt(r.ciHigh)}]`,
        fmt(r.signTestP),
        r.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(`\nsummary:`)
  console.log(`  tier0: n=${summary.tier0.count} geomean=${fmt(summary.tier0.geomeanRatio)} allCorrect=${summary.tier0.allCorrect}`)
  console.log(`  tier1: n=${summary.tier1.count} geomean=${fmt(summary.tier1.geomeanRatio)} allCorrect=${summary.tier1.allCorrect}`)
  if (skipped.length > 0) {
    console.log(`\nskipped/notes (${skipped.length}):`)
    for (const s of skipped) console.log(`  - ${s}`)
  }
  console.log(`\nfull report: ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
