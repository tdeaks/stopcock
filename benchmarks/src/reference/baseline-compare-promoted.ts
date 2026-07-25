// Verification-pass addendum to baseline-compare.ts: the plan's own caveat
// is that "an uninterrupted synchronous hot loop stays tier 0 until the
// stack yields" -- and runPaired's measurement loop (perf-runner.ts) is
// fully synchronous, with no await between rounds. That means the original
// baseline-compare.ts run can NEVER observe bare pipe's adaptive tier-1/2
// promotion: it structurally cannot yield for the chunk import's microtask
// to resolve. This script forces a real yield during warm-up (explicit
// awaits calling the SAME execution identity bare pipe() would use), checks
// promotion via explainSteps, then hands off to the existing synchronous
// runPaired for the actual paired measurement, now against an
// already-promoted entry. Per-case tier reached during warm-up is recorded
// alongside the ratio so a flip vs the un-promoted run is visible.
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateInputArray, type SerializedStep } from './generate'
import { runPaired } from './perf-runner'
import { pipe as currentPipe } from '../../../packages/fp/src/internal/fusion-engine'
import { explainSteps } from '../../../packages/fp/src/compile'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface PerfCaseFile {
  readonly name: string
  readonly strata: Record<string, unknown>
  readonly inputSeed: number
  readonly size: number
  readonly steps: readonly SerializedStep[]
}

interface ArrayModule {
  map: (f: (x: number) => unknown) => unknown
  filter: (f: (x: number) => boolean) => unknown
  reject: (f: (x: number) => boolean) => unknown
  filterMap: (f: (x: number) => unknown) => unknown
  flatMap: (f: (x: number) => unknown) => unknown
  take: (n: number) => unknown
  drop: (n: number) => unknown
  takeWhile: (f: (x: number) => boolean) => unknown
  dropWhile: (f: (x: number) => boolean) => unknown
  count: (f: (x: number) => boolean) => unknown
  reduce: (f: (acc: number, x: number) => number, seed: number) => unknown
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
  scan: (f: (acc: number, x: number) => number, seed: number) => unknown
  without: (values: readonly number[]) => unknown
}

function buildRealSteps(steps: readonly SerializedStep[], A: ArrayModule): unknown[] {
  const out: unknown[] = []
  let seed = 0
  for (const s of steps) {
    seed++
    const trivial = (x: number): number => x
    const pred = (x: number): boolean => x % 3 === 0
    switch (s.kind) {
      case 'map':
        out.push(A.map(trivial))
        break
      case 'filter':
        out.push(A.filter(pred))
        break
      case 'reject':
        out.push(A.reject(pred))
        break
      case 'filterMap':
        out.push(A.filterMap((x: number) => (x % 2 === 0 ? x : undefined)))
        break
      case 'flatMap':
        out.push(A.flatMap((x: number) => [x, x + 1]))
        break
      case 'take':
        out.push(A.take(s.n ?? 10))
        break
      case 'drop':
        out.push(A.drop(s.n ?? 10))
        break
      case 'takeWhile':
        out.push(A.takeWhile(pred))
        break
      case 'dropWhile':
        out.push(A.dropWhile(pred))
        break
      case 'count':
        out.push(A.count(pred))
        break
      case 'reduce':
        out.push(A.reduce((a: number, b: number) => a + b, 0))
        break
      case 'forEach':
        out.push(A.forEach(() => {}))
        break
      case 'find':
        out.push(A.find(pred))
        break
      case 'every':
        out.push(A.every(pred))
        break
      case 'some':
        out.push(A.some(pred))
        break
      case 'sort':
        out.push(A.sort)
        break
      case 'sortBy':
        out.push(A.sortBy((a: number, b: number) => a - b))
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
      case 'scan':
        out.push(A.scan((a: number, b: number) => a + b, 0))
        break
      case 'without':
        out.push(A.without(s.values ?? []))
        break
      case 'toArray':
        break
      default:
        throw new Error(`unhandled step kind ${s.kind satisfies never}`)
    }
  }
  return out
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
  return Object.is(a, b) || a === b
}

function yieldToMicrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Forces the chunk import's microtask to actually resolve between calls
 * (unlike runPaired's synchronous loop), so bare pipe's adaptive promotion
 * gets a real chance. Bounded attempts, not a busy-wait: PROMOTE_EXECUTIONS
 * is 8, so 16 yields is generous headroom. */
async function warmToPromotion(
  run: () => unknown,
  steps: readonly unknown[],
): Promise<{ tier: number; crashed?: string }> {
  for (let i = 0; i < 16; i++) {
    try {
      run()
    } catch (e) {
      return { tier: explainSteps(...steps).tier, crashed: (e as Error).message }
    }
    await yieldToMicrotask()
    const state = explainSteps(...steps)
    if (state.tier >= 1) return { tier: state.tier }
  }
  return { tier: explainSteps(...steps).tier }
}

interface CaseResult {
  readonly name: string
  readonly rounds: number
  readonly warmTier: number
  readonly crashed?: string
  readonly medianRatio: number
  readonly ciLow: number
  readonly ciHigh: number
  readonly signTestP: number
  readonly correctnessOk: boolean
  readonly regression: boolean
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const baselinePath =
    argv.includes('--baseline-path') ? argv[argv.indexOf('--baseline-path') + 1] : join(__dirname, '..', '..', '..', '..', 'baseline-003')
  const rounds = argv.includes('--rounds') ? Number(argv[argv.indexOf('--rounds') + 1]) : 40
  const outArg = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : undefined

  const baselineArrayUrl = pathToFileURL(join(baselinePath, 'packages/fp/src/array.ts')).href
  const baselinePipeUrl = pathToFileURL(join(baselinePath, 'packages/fp/src/pipe.ts')).href
  const baselineA = (await import(baselineArrayUrl)) as unknown as ArrayModule
  const pipeMod = (await import(baselinePipeUrl)) as { pipe: (input: unknown, ...fns: unknown[]) => unknown }
  const baselinePipe = pipeMod.pipe

  const currentA = (await import('../../../packages/fp/src/array')) as unknown as ArrayModule

  const corpusRaw = await (await import('node:fs/promises')).readFile(join(__dirname, 'perf-corpus.json'), 'utf8')
  const corpus = JSON.parse(corpusRaw) as { version: number; cases: readonly PerfCaseFile[] }

  const results: CaseResult[] = []
  const skipped: string[] = []

  for (const c of corpus.cases) {
    const input = generateInputArray(c.inputSeed, c.size)
    let newSteps: unknown[]
    let oldSteps: unknown[]
    try {
      newSteps = buildRealSteps(c.steps, currentA)
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

    const warm = await warmToPromotion(newFn, newSteps)
    if (warm.crashed) {
      skipped.push(`${c.name}: crashed during promotion warm-up at tier ${warm.tier}: ${warm.crashed}`)
      continue
    }

    let result
    try {
      result = runPaired(
        () => {
          newFn()
        },
        () => {
          oldFn()
        },
        { rounds },
      )
    } catch (e) {
      skipped.push(`${c.name}: crashed during measurement (warm tier ${warm.tier}): ${(e as Error).message}`)
      continue
    }

    const regression = result.ciHigh < 1 && result.signTestP < 0.05
    results.push({
      name: c.name,
      rounds: result.pairedRatios.length,
      warmTier: warm.tier,
      medianRatio: result.medianRatio,
      ciLow: result.ciLow,
      ciHigh: result.ciHigh,
      signTestP: result.signTestP,
      correctnessOk,
      regression,
    })
  }

  const geomean = (xs: readonly number[]): number => Math.exp(xs.reduce((a, b) => a + Math.log(b), 0) / xs.length)
  const regressions = results.filter((r) => r.regression)

  console.log('baseline-compare-promoted (0.0.3): ratio = oldNs/newNs; >1 == current tree is faster than 0.0.3')
  console.log('warmTier: tier bare pipe reached after up to 16 yielded warm-up calls (explainSteps), before the paired measurement\n')
  for (const r of results) {
    const flag = r.regression ? 'REGRESSION' : '          '
    console.log(
      `${flag}\tt${r.warmTier}\t${r.name}\tmedian=${r.medianRatio.toFixed(3)}\tCI=[${r.ciLow.toFixed(3)},${r.ciHigh.toFixed(3)}]\tp=${r.signTestP.toFixed(3)}\t${r.correctnessOk ? 'ok' : 'MISMATCH'}`,
    )
  }
  console.log(`\ngeomean ratio: ${geomean(results.map((r) => r.medianRatio)).toFixed(3)}`)
  console.log(`regressions flagged (CI entirely below 1.0, p<0.05): ${regressions.length} / ${results.length}`)
  if (skipped.length) {
    console.log(`\nskipped (${skipped.length}):`)
    for (const s of skipped) console.log(`  - ${s}`)
  }

  const outPath = outArg ?? join(__dirname, '..', '..', 'reports', 'baseline-compare-promoted-2026-07-21.json')
  await writeFile(outPath, JSON.stringify({ results, skipped }, null, 2) + '\n')
  console.log(`\nfull report: ${outPath}`)
}

main()
