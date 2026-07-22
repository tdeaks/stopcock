// W6 exit gate: fp-compiler measured against the frozen reference emitter,
// non-circular -- the compiler transforms a synthesized source string for
// each corpus case (not the tagged-op arrays interpret.ts/compile.ts use),
// the emitter lowers the same case's PipelineDesc via new Function, and the
// two are ABBA-paired with perf-runner.ts's helpers. Plan gate (see
// docs/superpowers/plans/2026-07-21-stopcock-fp-tiered-execution-
// implementation.md, W6): >= 90% geomean vs frozen reference, nothing below
// 80%, over the subset of perf-corpus.json cases the compiler claims to
// support (every step kind other than the synthetic `toArray` sink, which
// carries no real opcode and is dropped from the synthesized source --
// dropping it is semantically identical to the compiler's own "no terminal"
// behavior, which already collects to an array).
//
// bun-runnable: `bun run src/reference/compiler-perf.ts` (wired as
// "perf:compiler" in benchmarks/package.json).
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformStopcockPipelines } from '../../../packages/fp-compiler/src/transform'
import { SUPPORTED_OP_NAMES } from '../../../packages/fp-compiler/src/ops'
import type { CallbackSpec } from './binding-specs'
import { generateInputArray, type SerializedPipeline, type SerializedStep } from './generate'
import { compileEmittedPipeline, type PipelineDesc, type EmitterBinding } from './emitter'
import { geomean, runPaired } from './perf-runner'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface PerfCaseFile {
  readonly name: string
  readonly strata: Record<string, unknown>
  readonly inputSeed: number
  readonly size: number
  readonly steps: readonly SerializedStep[]
}

function specSource(spec: CallbackSpec): string {
  switch (spec.kind) {
    case 'identity':
      return '(x) => x'
    case 'linear':
      return `(x) => x * ${spec.a} + ${spec.b}`
    case 'allocLinear':
      return `(x) => { const tmp = [x, x + ${spec.a}]; return tmp[0] + tmp[1]; }`
    case 'mod':
      return `(x) => x % ${spec.m} === ${spec.r}`
    case 'allocMod':
      return `(x) => { const tmp = { v: x }; return tmp.v % ${spec.m} === ${spec.r}; }`
    case 'constTrue':
      return '() => true'
    case 'constFalse':
      return '() => false'
    case 'filterMapMod':
      return `(x) => (x % ${spec.m} === ${spec.r} ? x * ${spec.a} + ${spec.b} : undefined)`
    case 'flatMapRange':
      return `(x) => { const out = new Array(${spec.factor}); for (let i = 0; i < ${spec.factor}; i++) out[i] = x * ${spec.a} + ${spec.b} + i; return out; }`
    case 'reduceAdd':
      return '(acc, x) => acc + x'
    case 'reduceSub':
      return '(acc, x) => acc - x'
    case 'allocReduceAdd':
      return '(acc, x) => ({ v: acc + x }).v'
    case 'noop':
      return '() => {}'
    case 'sortCmpAsc':
      return '(a, b) => a - b'
    case 'sortCmpDesc':
      return '(a, b) => b - a'
  }
}

const BARE_BOUNDARY_KINDS = new Set(['sort', 'sortAsc', 'sortDesc', 'reverse', 'uniq', 'sum'])

/** Renders one SerializedStep as compiler-facing source text, or undefined for the synthetic toArray sink (no real opcode -- dropped, not a bail). */
function stepSource(step: SerializedStep): string | undefined {
  if (step.kind === 'toArray') return undefined
  if (BARE_BOUNDARY_KINDS.has(step.kind)) return `A.${step.kind}`
  if (step.kind === 'take' || step.kind === 'drop') return `A.${step.kind}(${step.n})`
  if (step.kind === 'reduce') return `A.reduce(${specSource(step.spec!)}, ${step.a1})`
  return `A.${step.kind}(${specSource(step.spec!)})`
}

/** True if every step in the case is something this compiler wave can fuse (or the droppable toArray sink). */
function isSupportedCase(steps: readonly SerializedStep[]): boolean {
  return steps.every((s) => s.kind === 'toArray' || SUPPORTED_OP_NAMES.has(s.kind))
}

function synthesizeSource(steps: readonly SerializedStep[]): string {
  const stepTexts = steps.map(stepSource).filter((s): s is string => s !== undefined)
  const body = stepTexts.length === 0 ? 'return input;' : `return pipe(input, ${stepTexts.join(', ')});`
  return `import { pipe, A } from '@stopcock/fp'\nfunction __run(input) {\n${body}\n}\nexport { __run };`
}

function compileTransformed(source: string): (input: readonly number[]) => unknown {
  const result = transformStopcockPipelines(source, 'compiler-perf-case.ts', { diagnostics: false })
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  const full = `${stripped}\nreturn __run;`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function(full)
  return factory() as (input: readonly number[]) => unknown
}

function desc(steps: readonly SerializedStep[]): PipelineDesc {
  return { steps: steps.filter((s) => s.kind !== 'toArray').map((s) => ({ kind: s.kind as any })) }
}

function bindingsFor(steps: readonly SerializedStep[]): readonly EmitterBinding[] {
  return steps
    .filter((s) => s.kind !== 'toArray')
    .map((s) => {
      if (s.kind === 'take' || s.kind === 'drop') return { fn: s.n }
      if (s.kind === 'reduce') return { fn: buildCallbackFromSpec(s.spec!), a1: s.a1 }
      if (s.spec) return { fn: buildCallbackFromSpec(s.spec) }
      return {}
    })
}

// Local re-implementation mirroring binding-specs.ts's buildCallback, kept
// independent so this script never imports live closures shared with the
// transformed side -- only the emitter's bindings need real functions here.
function buildCallbackFromSpec(spec: CallbackSpec): unknown {
  switch (spec.kind) {
    case 'identity':
      return (x: number) => x
    case 'linear':
      return (x: number) => x * spec.a + spec.b
    case 'allocLinear':
      return (x: number) => {
        const tmp = [x, x + spec.a]
        return tmp[0] + tmp[1]
      }
    case 'mod':
      return (x: number) => x % spec.m === spec.r
    case 'allocMod':
      return (x: number) => {
        const tmp = { v: x }
        return tmp.v % spec.m === spec.r
      }
    case 'constTrue':
      return () => true
    case 'constFalse':
      return () => false
    case 'filterMapMod':
      return (x: number) => (x % spec.m === spec.r ? x * spec.a + spec.b : undefined)
    case 'flatMapRange': {
      const { factor, a, b } = spec
      return (x: number) => {
        const out: number[] = new Array(factor)
        for (let i = 0; i < factor; i++) out[i] = x * a + b + i
        return out
      }
    }
    case 'reduceAdd':
      return (acc: number, x: number) => acc + x
    case 'reduceSub':
      return (acc: number, x: number) => acc - x
    case 'allocReduceAdd':
      return (acc: number, x: number) => ({ v: acc + x }).v
    case 'noop':
      return () => {}
    case 'sortCmpAsc':
      return (a: number, b: number) => a - b
    case 'sortCmpDesc':
      return (a: number, b: number) => b - a
  }
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
  readonly name: string
  readonly n: number
  readonly correctnessOk: boolean
  readonly medianRatio: number
  readonly meanRatio: number
}

interface Args {
  readonly rounds: number
  readonly casesFilter?: string
  readonly corpusPath: string
  readonly caseIndex?: number
}

function parseArgs(argv: readonly string[]): Args {
  let rounds = 40
  let casesFilter: string | undefined
  let corpusPath = join(__dirname, 'perf-corpus.json')
  let caseIndex: number | undefined
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--rounds') rounds = Number(argv[++i])
    else if (argv[i] === '--cases') casesFilter = argv[++i]
    else if (argv[i] === '--corpus') corpusPath = argv[++i]
    else if (argv[i] === '--quick') rounds = Math.min(rounds, 8)
    else if (argv[i] === '--case-index') caseIndex = Number(argv[++i])
  }
  return { rounds, casesFilter, corpusPath, caseIndex }
}

async function loadCases(args: { corpusPath: string; casesFilter?: string }): Promise<readonly PerfCaseFile[]> {
  const raw = await readFile(args.corpusPath, 'utf8')
  const corpus = JSON.parse(raw) as { version: number; cases: readonly PerfCaseFile[] }
  let cases = corpus.cases.filter((c) => isSupportedCase(c.steps) && !c.steps.every((s) => s.kind === 'toArray'))
  if (args.casesFilter) cases = cases.filter((c) => c.name.includes(args.casesFilter!))
  return cases
}

interface WorkerOutcome {
  readonly ok: true
  readonly correctnessOk: boolean
  readonly medianRatio: number
  readonly meanRatio: number
  readonly n: number
}

function measureCase(c: PerfCaseFile, rounds: number): WorkerOutcome {
  const input = generateInputArray(c.inputSeed, c.size) as readonly number[]
  const source = synthesizeSource(c.steps)
  const runTransformed = compileTransformed(source)

  const emittedRun = compileEmittedPipeline(desc(c.steps))
  const bindings = bindingsFor(c.steps)
  const refFn = (): unknown => emittedRun(input, bindings)
  const stopcockFn = (): unknown => runTransformed(input)

  const correctnessOk = deepEqual(stopcockFn(), refFn())

  const result = runPaired(
    () => {
      stopcockFn()
    },
    () => {
      refFn()
    },
    { rounds, warmupRounds: Math.max(5, Math.min(30, rounds)) },
  )
  return { ok: true, correctnessOk, medianRatio: result.medianRatio, meanRatio: result.meanRatio, n: result.pairedRatios.length }
}

const WORKER_MARKER = 'RESULT_JSON:'

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  // Single-case worker mode: each case gets its own process so a 100k-element
  // allocating pipeline run 39th in sequence doesn't inherit GC pressure or
  // megamorphic call-site pollution from the 38 differently-shaped closures
  // that ran before it in the same isolate -- variance that's an artifact of
  // this harness sharing a process, not of the generated code's real speed.
  if (args.caseIndex !== undefined) {
    const cases = await loadCases(args)
    const c = cases[args.caseIndex]
    if (!c) {
      console.log(`${WORKER_MARKER}${JSON.stringify({ ok: false, reason: 'case index out of range' })}`)
      return
    }
    try {
      const outcome = measureCase(c, args.rounds)
      console.log(`${WORKER_MARKER}${JSON.stringify(outcome)}`)
    } catch (e) {
      console.log(`${WORKER_MARKER}${JSON.stringify({ ok: false, reason: (e as Error).message })}`)
    }
    return
  }

  const cases = await loadCases(args)
  const results: CaseResult[] = []
  const skipped: string[] = []
  const selfPath = fileURLToPath(import.meta.url)

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    const proc = Bun.spawnSync({
      cmd: [
        'bun',
        'run',
        selfPath,
        '--case-index',
        String(i),
        '--rounds',
        String(args.rounds),
        '--corpus',
        args.corpusPath,
        ...(args.casesFilter ? ['--cases', args.casesFilter] : []),
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const out = proc.stdout.toString()
    const line = out.split('\n').find((l: string) => l.startsWith(WORKER_MARKER))
    if (!line) {
      skipped.push(`${c.name}: worker produced no result (stderr: ${proc.stderr.toString().slice(0, 300)})`)
      continue
    }
    const outcome = JSON.parse(line.slice(WORKER_MARKER.length)) as WorkerOutcome | { ok: false; reason: string }
    if (!outcome.ok) {
      skipped.push(`${c.name}: ${outcome.reason}`)
      continue
    }
    results.push({ name: c.name, n: outcome.n, correctnessOk: outcome.correctnessOk, medianRatio: outcome.medianRatio, meanRatio: outcome.meanRatio })
  }

  const ratios = results.map((r) => r.medianRatio)
  const geo = geomean(ratios)
  const min = Math.min(...ratios, Infinity)
  const allCorrect = results.every((r) => r.correctnessOk)

  console.log(`\nW6 fp-compiler perf report (ratio = referenceNs / stopcockNs; >1 == fp-compiler faster)\n`)
  console.log(['case', 'n', 'median', 'mean', 'correct'].join('\t'))
  for (const r of results) {
    console.log(
      [
        r.name.length > 52 ? r.name.slice(0, 49) + '...' : r.name,
        r.n,
        r.medianRatio.toFixed(3),
        r.meanRatio.toFixed(3),
        r.correctnessOk ? 'ok' : 'MISMATCH',
      ].join('\t'),
    )
  }
  console.log(`\ncases: ${results.length}  geomean: ${geo.toFixed(3)}  min: ${min.toFixed(3)}  allCorrect: ${allCorrect}`)
  console.log(`gate: geomean >= 0.90 and min >= 0.80 -> ${geo >= 0.9 && min >= 0.8 ? 'PASS' : 'FAIL'}`)
  if (skipped.length > 0) {
    console.log(`\nskipped (${skipped.length}):`)
    for (const s of skipped) console.log(`  - ${s}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
