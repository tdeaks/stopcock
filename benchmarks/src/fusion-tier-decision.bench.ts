/**
 * Fusion-tier decision suite.
 *
 * Question: is the compact runtime fusion engine (`@stopcock/fp/fusion`)
 * worth keeping as the uncompiled fallback, or does plain sequential
 * execution (untagged closures, intermediate arrays) beat it on real
 * pipeline shapes? Five executors per shape:
 *
 *   fused    - tagged ops (A.map/A.filter/...) through the real compact
 *              fusion pipe.
 *   naive    - untagged closures (no _op tag) through the same pipe, so the
 *              engine falls back to opaque per-step calls: same call site,
 *              no fusion. Verified via buildCompactPlan below.
 *   hand     - a hand-written loop: the ceiling.
 *   compiled - build-time output via @stopcock/fp-compiler's
 *              transformStopcockPipelines, new Function'd (compiled-
 *              pipelines.bench.ts's compileFixture pattern).
 *   select   - packages/fp/src/internal/__prototype__selective-pipe.ts's
 *              `selectivePipe`: classifies the tagged op chain once (cached),
 *              routes take/find-class winning shapes through the real fused
 *              engine once n clears its threshold, everything else through
 *              plain sequential closure calls. Prototype, not wired into any
 *              public entry point.
 *
 * Plus, per shape, one competitor row per external library that can express
 * the shape idiomatically: ramda (Ra, composition-style `pipe(...fns)(xs)`),
 * rambda (Rb, data-first `pipe(xs, ...fns)`), remeda (Re, data-first
 * `pipe(xs, ...fns)`), ts-belt (Bt, data-first `pipe(xs, ...fns)`), and
 * lodash-es (Ld, `chain(xs)....value()`). A shape that a library cannot
 * express idiomatically (no native `scan` anywhere but ramda) skips that
 * row rather than faking it with a contorted equivalent -- noted at the
 * shape, not silently omitted.
 *
 * Startup: every executor and every competitor row is asserted identical
 * per shape/size before any bench runs (Option-returning shapes -- find,
 * head -- compare against each competitor's raw value/undefined via
 * `unwrapOption`, since none of the five libraries have an Option type).
 * Early-exit shapes also count callback invocations for the original four
 * executors plus `select`, printed once via console.table at collection
 * time -- fused/naive/select counts legitimately differ (that's the point);
 * only output identity is a bar. Competitor libraries are not in the count
 * table: the brief only asks output identity of them, and several (lodash's
 * chain, in particular) have their own internal, undocumented short-circuit
 * behaviour that a raw call count would not represent fairly.
 */
import { afterAll, bench, describe } from 'vite-plus/test'
import { pipe } from '@stopcock/fp/fusion'
import * as A from '@stopcock/fp/array'
import { none, some } from '@stopcock/fp/option'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import * as Re from 'remeda'
import * as Bt from '@mobily/ts-belt'
import * as Ld from 'lodash-es'
import { transformStopcockPipelines } from '../../packages/fp-compiler/src/transform'
import { buildCompactPlan } from '../../packages/fp/src/internal/compact/plan'
import { selectivePipe } from '../../packages/fp/src/internal/__prototype__selective-pipe'

const SIZES = [10, 1_000, 100_000] as const

// ---------------------------------------------------------------------------
// data generation (self-contained: n=10 isn't in setup.ts's fixed size list)
// ---------------------------------------------------------------------------

function xorshift32(seed: number) {
  let state = seed
  return () => {
    state ^= state << 13
    state ^= state >> 17
    state ^= state << 5
    return (state >>> 0) / 0xffffffff
  }
}

function floats(n: number, seed: number): number[] {
  const rand = xorshift32(seed)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = rand()
  return out
}

function ints(n: number, seed: number, mod: number): number[] {
  const rand = xorshift32(seed)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = Math.floor(rand() * mod)
  return out
}

function dupeInts(n: number, seed: number): number[] {
  const rand = xorshift32(seed)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++)
    out[i] = rand() < 0.3 && i > 0 ? out[Math.floor(rand() * i)]! : Math.floor(rand() * n)
  return out
}

const PATH_SEGMENTS = ['usr', 'local', 'bin', 'share', 'lib', 'opt', 'data', 'var', 'etc', 'home']

function paths(n: number, seed: number): string[] {
  const rand = xorshift32(seed)
  const out = new Array<string>(n)
  for (let i = 0; i < n; i++) {
    const depth = 1 + Math.floor(rand() * 6)
    const parts: string[] = []
    for (let j = 0; j < depth; j++) parts.push(PATH_SEGMENTS[Math.floor(rand() * PATH_SEGMENTS.length)]!)
    out[i] = '/' + parts.join('/')
  }
  return out
}

function withSentinel(xs: readonly number[], index: number, value: number): number[] {
  const out = xs.slice()
  out[index] = value
  return out
}

// ---------------------------------------------------------------------------
// compileFixture (compiled-pipelines.bench.ts's pattern)
// ---------------------------------------------------------------------------

interface CompileModule {
  readonly source: string
  readonly value: unknown
}

function compileFixture(
  modules: Readonly<Record<string, CompileModule>>,
  source: string,
  fixtureName: string,
): (input: unknown) => unknown {
  const aliases = Object.keys(modules)
  const importLines = aliases
    .map((alias) => `import * as ${alias} from '${modules[alias]!.source}'`)
    .join('\n')
  const wrapped = `import { pipe } from '@stopcock/fp/fusion'\n${importLines}\nfunction run(input) {\n${source}\n}\nexport { run };`
  const result = transformStopcockPipelines(wrapped, fixtureName, { diagnostics: 'error' })
  if (result.code === wrapped) {
    throw new Error(`fusion-tier-decision: expected the compiler to transform: ${source}`)
  }
  if (result.diagnostics.length === 0 || result.diagnostics.some((site) => !site.transformed)) {
    throw new Error(
      `fusion-tier-decision: not every site compiled cleanly for ${fixtureName}: ${JSON.stringify(
        result.diagnostics,
      )}`,
    )
  }
  const noneAlias = result.code.match(/import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u)?.[1]
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gmu, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, '')
  const body = `${stripped}\nreturn run;`
  const argNames = ['pipe', ...aliases, ...(noneAlias ? [noneAlias] : [])]
  const argValues: unknown[] = [
    pipe,
    ...aliases.map((alias) => modules[alias]!.value),
    ...(noneAlias ? [none] : []),
  ]
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function(...argNames, body) as (...args: unknown[]) => (input: unknown) => unknown
  return factory(...argValues)
}

const A_MODULE: Readonly<Record<string, CompileModule>> = {
  A: { source: '@stopcock/fp/array', value: A },
}

// ---------------------------------------------------------------------------
// assertions
// ---------------------------------------------------------------------------

function assertSame(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    throw new Error(`fusion-tier-decision: ${label} mismatch\nactual:   ${a}\nexpected: ${e}`)
  }
}

/** Option -> raw value-or-undefined, for comparing against competitor libraries. */
function unwrapOption(option: unknown): unknown {
  return (option as { _tag: number; value?: unknown })._tag === 1
    ? (option as { value: unknown }).value
    : undefined
}

interface Competitor {
  readonly name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- five external
  // libraries, five incompatible generic signatures; `any` is the pragmatic
  // boundary here, not a type-safety hole in stopcock itself.
  readonly run: (xs: any) => unknown
}

/** Asserts + benches every competitor row available for a shape. */
function competitorSuite(
  label: string,
  n: number,
  xs: readonly unknown[],
  expected: unknown,
  rows: readonly Competitor[],
  normalize: (v: unknown) => unknown = (v) => v,
): void {
  for (const row of rows) {
    assertSame(`${label} ${row.name} n=${n}`, normalize(row.run(xs)), expected)
    bench(row.name, () => row.run(xs))
  }
}

function assertFuses(label: string, steps: readonly unknown[]): void {
  const plan = buildCompactPlan(steps)
  if (plan.shape.segments.every((s) => s.kind === 'opaque')) {
    throw new Error(`fusion-tier-decision: ${label} did not fuse: ${JSON.stringify(plan.shape)}`)
  }
}

function assertOpaque(label: string, steps: readonly unknown[]): void {
  const plan = buildCompactPlan(steps)
  const ok =
    plan.shape.segments.length === steps.length && plan.shape.segments.every((s) => s.kind === 'opaque')
  if (!ok) {
    throw new Error(`fusion-tier-decision: ${label} unexpectedly fused: ${JSON.stringify(plan.shape)}`)
  }
}

// ---------------------------------------------------------------------------
// untagged closure factories -- no _op, so fusionPipe cannot fuse them
// ---------------------------------------------------------------------------

const naiveMap =
  <A, B>(f: (a: A) => B) =>
  (xs: readonly A[]): B[] =>
    xs.map(f)
const naiveFilter =
  <A>(pred: (a: A) => boolean) =>
  (xs: readonly A[]): A[] =>
    xs.filter(pred)
const naiveReduce =
  <A, B>(f: (acc: B, a: A) => B, init: B) =>
  (xs: readonly A[]): B =>
    xs.reduce(f, init)
const naiveFind =
  <A>(pred: (a: A) => boolean) =>
  (xs: readonly A[]): unknown => {
    for (let i = 0; i < xs.length; i++) if (pred(xs[i]!)) return some(xs[i])
    return none
  }
const naiveTake =
  (n: number) =>
  <A>(xs: readonly A[]): A[] =>
    xs.slice(0, n)
const naiveSortBy =
  <A>(cmp: (a: A, b: A) => number) =>
  (xs: readonly A[]): A[] =>
    xs.slice().sort(cmp)
const naiveUniq = <A>(xs: readonly A[]): A[] => Array.from(new Set(xs))
const naiveScan =
  <A, B>(f: (acc: B, a: A) => B, init: B) =>
  (xs: readonly A[]): B[] => {
    const out = new Array<B>(xs.length + 1)
    let acc = init
    out[0] = init
    for (let i = 0; i < xs.length; i++) {
      acc = f(acc, xs[i]!)
      out[i + 1] = acc
    }
    return out
  }
const naiveFlatMap =
  <A, B>(f: (a: A) => B[]) =>
  (xs: readonly A[]): B[] =>
    xs.flatMap(f)
const naiveTakeWhile =
  <A>(pred: (a: A) => boolean) =>
  (xs: readonly A[]): A[] => {
    const out: A[] = []
    for (let i = 0; i < xs.length; i++) {
      if (!pred(xs[i]!)) break
      out.push(xs[i]!)
    }
    return out
  }
const naiveHead = <A>(xs: readonly A[]): unknown => (xs.length === 0 ? none : some(xs[0]))

// ---------------------------------------------------------------------------
// callback-count table (early-exit shapes) -- printed once at collection time
// ---------------------------------------------------------------------------

interface CountRow {
  readonly shape: string
  readonly n: number
  readonly executor: string
  readonly calls: number
}
const countRows: CountRow[] = []
function recordCounts(shape: string, n: number, counts: Record<string, number>): void {
  for (const executor of ['fused', 'naive', 'hand', 'compiled', 'select']) {
    countRows.push({ shape, n, executor, calls: counts[executor]! })
  }
}

// shared cheap callbacks
const double = (x: number): number => x * 2
const keepMod3 = (x: number): boolean => x % 3 !== 0
const addOp = (a: number, b: number): number => a + b

// =============================================================================
// 1. map (single op)
// =============================================================================

const map1Data = (n: number) => floats(n, 101)
const map1FusedMap = A.map(double)
const map1NaiveMap = naiveMap(double)
function map1Hand(xs: readonly number[]): number[] {
  const out = new Array<number>(xs.length)
  for (let i = 0; i < xs.length; i++) out[i] = xs[i]! * 2
  return out
}
const map1Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.map((x) => x * 2));`,
  'fusion-tier-map1.ts',
)
assertFuses('1. map', [map1FusedMap])
assertOpaque('1. map (naive)', [map1NaiveMap])

const map1Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.map(double)) },
  { name: 'rambda', run: (xs) => Rb.pipe(xs, Rb.map(double)) },
  { name: 'remeda', run: (xs) => Re.pipe(xs, Re.map(double)) },
  { name: 'ts-belt', run: (xs) => Bt.pipe(xs, Bt.A.map(double)) },
  { name: 'lodash', run: (xs) => Ld.chain(xs).map(double).value() },
]

describe.each(SIZES)('1. map — n=%i', (n) => {
  const xs = map1Data(n)
  const expected = pipe(xs, map1FusedMap)
  assertSame(`1. map naive n=${n}`, pipe(xs, map1NaiveMap), expected)
  assertSame(`1. map hand n=${n}`, map1Hand(xs), expected)
  assertSame(`1. map compiled n=${n}`, map1Compiled(xs), expected)
  assertSame(`1. map select n=${n}`, selectivePipe(xs, map1FusedMap), expected)

  bench('fused', () => pipe(xs, map1FusedMap))
  bench('naive', () => pipe(xs, map1NaiveMap))
  bench('hand', () => map1Hand(xs))
  bench('compiled', () => map1Compiled(xs))
  bench('select', () => selectivePipe(xs, map1FusedMap))
  competitorSuite('1. map', n, xs, expected, map1Competitors)
})

// =============================================================================
// 2. map -> filter
// =============================================================================

const map2Data = (n: number) => floats(n, 102)
const map2FusedMap = A.map(double)
const map2FusedFilter = A.filter(keepMod3)
const map2NaiveMap = naiveMap(double)
const map2NaiveFilter = naiveFilter(keepMod3)
function map2Hand(xs: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i]! * 2
    if (v % 3 !== 0) out.push(v)
  }
  return out
}
const map2Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.map((x) => x * 2), A.filter((x) => x % 3 !== 0));`,
  'fusion-tier-map2.ts',
)
assertFuses('2. map->filter', [map2FusedMap, map2FusedFilter])
assertOpaque('2. map->filter (naive)', [map2NaiveMap, map2NaiveFilter])

const map2Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.map(double), Ra.filter(keepMod3)) },
  { name: 'rambda', run: (xs) => Rb.pipe(xs, Rb.map(double), Rb.filter(keepMod3)) },
  { name: 'remeda', run: (xs) => Re.pipe(xs, Re.map(double), Re.filter(keepMod3)) },
  { name: 'ts-belt', run: (xs) => Bt.pipe(xs, Bt.A.map(double), Bt.A.filter(keepMod3)) },
  { name: 'lodash', run: (xs) => Ld.chain(xs).map(double).filter(keepMod3).value() },
]

describe.each(SIZES)('2. map->filter — n=%i', (n) => {
  const xs = map2Data(n)
  const expected = pipe(xs, map2FusedMap, map2FusedFilter)
  assertSame(`2. naive n=${n}`, pipe(xs, map2NaiveMap, map2NaiveFilter), expected)
  assertSame(`2. hand n=${n}`, map2Hand(xs), expected)
  assertSame(`2. compiled n=${n}`, map2Compiled(xs), expected)
  assertSame(`2. select n=${n}`, selectivePipe(xs, map2FusedMap, map2FusedFilter), expected)

  bench('fused', () => pipe(xs, map2FusedMap, map2FusedFilter))
  bench('naive', () => pipe(xs, map2NaiveMap, map2NaiveFilter))
  bench('hand', () => map2Hand(xs))
  bench('compiled', () => map2Compiled(xs))
  bench('select', () => selectivePipe(xs, map2FusedMap, map2FusedFilter))
  competitorSuite('2. map->filter', n, xs, expected, map2Competitors)
})

// =============================================================================
// 3. map -> filter -> reduce (the known case)
// =============================================================================

const chain3Data = (n: number) => floats(n, 103)
const chain3FusedReduce = A.reduce(addOp, 0)
const chain3NaiveReduce = naiveReduce(addOp, 0)
function chain3Hand(xs: readonly number[]): number {
  let acc = 0
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i]! * 2
    if (v % 3 !== 0) acc += v
  }
  return acc
}
const chain3Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.map((x) => x * 2), A.filter((x) => x % 3 !== 0), A.reduce((a, b) => a + b, 0));`,
  'fusion-tier-chain3.ts',
)
assertFuses('3. map->filter->reduce', [A.map(double), A.filter(keepMod3), chain3FusedReduce])
assertOpaque('3. map->filter->reduce (naive)', [
  naiveMap(double),
  naiveFilter(keepMod3),
  chain3NaiveReduce,
])

const chain3Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.map(double), Ra.filter(keepMod3), Ra.reduce(addOp, 0)) },
  { name: 'rambda', run: (xs) => Rb.pipe(xs, Rb.map(double), Rb.filter(keepMod3), Rb.reduce(addOp, 0)) },
  { name: 'remeda', run: (xs) => Re.pipe(xs, Re.map(double), Re.filter(keepMod3), Re.reduce(addOp, 0)) },
  {
    name: 'ts-belt',
    run: (xs) => Bt.pipe(xs, Bt.A.map(double), Bt.A.filter(keepMod3), Bt.A.reduce(0, addOp)),
  },
  { name: 'lodash', run: (xs) => Ld.chain(xs).map(double).filter(keepMod3).reduce(addOp, 0).value() },
]

describe.each(SIZES)('3. map->filter->reduce — n=%i', (n) => {
  const xs = chain3Data(n)
  const expected = pipe(xs, A.map(double), A.filter(keepMod3), chain3FusedReduce)
  assertSame(
    `3. naive n=${n}`,
    pipe(xs, naiveMap(double), naiveFilter(keepMod3), chain3NaiveReduce),
    expected,
  )
  assertSame(`3. hand n=${n}`, chain3Hand(xs), expected)
  assertSame(`3. compiled n=${n}`, chain3Compiled(xs), expected)
  assertSame(
    `3. select n=${n}`,
    selectivePipe(xs, A.map(double), A.filter(keepMod3), chain3FusedReduce),
    expected,
  )

  bench('fused', () => pipe(xs, A.map(double), A.filter(keepMod3), chain3FusedReduce))
  bench('naive', () => pipe(xs, naiveMap(double), naiveFilter(keepMod3), chain3NaiveReduce))
  bench('hand', () => chain3Hand(xs))
  bench('compiled', () => chain3Compiled(xs))
  bench('select', () => selectivePipe(xs, A.map(double), A.filter(keepMod3), chain3FusedReduce))
  competitorSuite('3. map->filter->reduce', n, xs, expected, chain3Competitors)
})

// =============================================================================
// 4. map -> filter -> map -> filter (4 ops, array output)
// =============================================================================

const chain4Data = (n: number) => floats(n, 104)
function chain4Hand(xs: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < xs.length; i++) {
    const v1 = xs[i]! * 2
    if (v1 % 3 === 0) continue
    const v2 = v1 * 2
    if (v2 % 3 !== 0) out.push(v2)
  }
  return out
}
const chain4Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.map((x) => x * 2), A.filter((x) => x % 3 !== 0), A.map((x) => x * 2), A.filter((x) => x % 3 !== 0));`,
  'fusion-tier-chain4.ts',
)
assertFuses('4. map->filter->map->filter', [
  A.map(double),
  A.filter(keepMod3),
  A.map(double),
  A.filter(keepMod3),
])
assertOpaque('4. map->filter->map->filter (naive)', [
  naiveMap(double),
  naiveFilter(keepMod3),
  naiveMap(double),
  naiveFilter(keepMod3),
])

const chain4Competitors: readonly Competitor[] = [
  {
    name: 'ramda',
    run: Ra.pipe(Ra.map(double), Ra.filter(keepMod3), Ra.map(double), Ra.filter(keepMod3)),
  },
  {
    name: 'rambda',
    run: (xs) => Rb.pipe(xs, Rb.map(double), Rb.filter(keepMod3), Rb.map(double), Rb.filter(keepMod3)),
  },
  {
    name: 'remeda',
    run: (xs) => Re.pipe(xs, Re.map(double), Re.filter(keepMod3), Re.map(double), Re.filter(keepMod3)),
  },
  {
    name: 'ts-belt',
    run: (xs) =>
      Bt.pipe(xs, Bt.A.map(double), Bt.A.filter(keepMod3), Bt.A.map(double), Bt.A.filter(keepMod3)),
  },
  {
    name: 'lodash',
    run: (xs) => Ld.chain(xs).map(double).filter(keepMod3).map(double).filter(keepMod3).value(),
  },
]

describe.each(SIZES)('4. map->filter->map->filter — n=%i', (n) => {
  const xs = chain4Data(n)
  const expected = pipe(xs, A.map(double), A.filter(keepMod3), A.map(double), A.filter(keepMod3))
  assertSame(
    `4. naive n=${n}`,
    pipe(xs, naiveMap(double), naiveFilter(keepMod3), naiveMap(double), naiveFilter(keepMod3)),
    expected,
  )
  assertSame(`4. hand n=${n}`, chain4Hand(xs), expected)
  assertSame(`4. compiled n=${n}`, chain4Compiled(xs), expected)
  assertSame(
    `4. select n=${n}`,
    selectivePipe(xs, A.map(double), A.filter(keepMod3), A.map(double), A.filter(keepMod3)),
    expected,
  )

  bench('fused', () => pipe(xs, A.map(double), A.filter(keepMod3), A.map(double), A.filter(keepMod3)))
  bench('naive', () =>
    pipe(xs, naiveMap(double), naiveFilter(keepMod3), naiveMap(double), naiveFilter(keepMod3)))
  bench('hand', () => chain4Hand(xs))
  bench('compiled', () => chain4Compiled(xs))
  bench('select', () =>
    selectivePipe(xs, A.map(double), A.filter(keepMod3), A.map(double), A.filter(keepMod3)))
  competitorSuite('4. map->filter->map->filter', n, xs, expected, chain4Competitors)
})

// =============================================================================
// 5. 8-op chain: map->filter->map->filter->map->filter->map->reduce
// =============================================================================

const chain8Data = (n: number) => floats(n, 105)
const chain8FusedReduce = A.reduce(addOp, 0)
const chain8NaiveReduce = naiveReduce(addOp, 0)
function chain8Hand(xs: readonly number[]): number {
  let acc = 0
  for (let i = 0; i < xs.length; i++) {
    let v = xs[i]! * 2
    if (v % 3 === 0) continue
    v = v * 2
    if (v % 3 === 0) continue
    v = v * 2
    if (v % 3 === 0) continue
    v = v * 2
    acc += v
  }
  return acc
}
const chain8Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.map((x) => x * 2), A.filter((x) => x % 3 !== 0), A.map((x) => x * 2), A.filter((x) => x % 3 !== 0), A.map((x) => x * 2), A.filter((x) => x % 3 !== 0), A.map((x) => x * 2), A.reduce((a, b) => a + b, 0));`,
  'fusion-tier-chain8.ts',
)
assertFuses('5. 8-op chain', [
  A.map(double),
  A.filter(keepMod3),
  A.map(double),
  A.filter(keepMod3),
  A.map(double),
  A.filter(keepMod3),
  A.map(double),
  chain8FusedReduce,
])
assertOpaque('5. 8-op chain (naive)', [
  naiveMap(double),
  naiveFilter(keepMod3),
  naiveMap(double),
  naiveFilter(keepMod3),
  naiveMap(double),
  naiveFilter(keepMod3),
  naiveMap(double),
  chain8NaiveReduce,
])

const chain8Competitors: readonly Competitor[] = [
  {
    name: 'ramda',
    run: Ra.pipe(
      Ra.map(double),
      Ra.filter(keepMod3),
      Ra.map(double),
      Ra.filter(keepMod3),
      Ra.map(double),
      Ra.filter(keepMod3),
      Ra.map(double),
      Ra.reduce(addOp, 0),
    ),
  },
  {
    name: 'rambda',
    run: (xs) =>
      Rb.pipe(
        xs,
        Rb.map(double),
        Rb.filter(keepMod3),
        Rb.map(double),
        Rb.filter(keepMod3),
        Rb.map(double),
        Rb.filter(keepMod3),
        Rb.map(double),
        Rb.reduce(addOp, 0),
      ),
  },
  {
    name: 'remeda',
    run: (xs) =>
      Re.pipe(
        xs,
        Re.map(double),
        Re.filter(keepMod3),
        Re.map(double),
        Re.filter(keepMod3),
        Re.map(double),
        Re.filter(keepMod3),
        Re.map(double),
        Re.reduce(addOp, 0),
      ),
  },
  {
    name: 'ts-belt',
    run: (xs) =>
      Bt.pipe(
        xs,
        Bt.A.map(double),
        Bt.A.filter(keepMod3),
        Bt.A.map(double),
        Bt.A.filter(keepMod3),
        Bt.A.map(double),
        Bt.A.filter(keepMod3),
        Bt.A.map(double),
        Bt.A.reduce(0, addOp),
      ),
  },
  {
    name: 'lodash',
    run: (xs) =>
      Ld.chain(xs)
        .map(double)
        .filter(keepMod3)
        .map(double)
        .filter(keepMod3)
        .map(double)
        .filter(keepMod3)
        .map(double)
        .reduce(addOp, 0)
        .value(),
  },
]

describe.each(SIZES)('5. 8-op chain — n=%i', (n) => {
  const xs = chain8Data(n)
  const expected = pipe(
    xs,
    A.map(double),
    A.filter(keepMod3),
    A.map(double),
    A.filter(keepMod3),
    A.map(double),
    A.filter(keepMod3),
    A.map(double),
    chain8FusedReduce,
  )
  assertSame(
    `5. naive n=${n}`,
    pipe(
      xs,
      naiveMap(double),
      naiveFilter(keepMod3),
      naiveMap(double),
      naiveFilter(keepMod3),
      naiveMap(double),
      naiveFilter(keepMod3),
      naiveMap(double),
      chain8NaiveReduce,
    ),
    expected,
  )
  assertSame(`5. hand n=${n}`, chain8Hand(xs), expected)
  assertSame(`5. compiled n=${n}`, chain8Compiled(xs), expected)
  assertSame(
    `5. select n=${n}`,
    selectivePipe(
      xs,
      A.map(double),
      A.filter(keepMod3),
      A.map(double),
      A.filter(keepMod3),
      A.map(double),
      A.filter(keepMod3),
      A.map(double),
      chain8FusedReduce,
    ),
    expected,
  )

  bench('fused', () =>
    pipe(
      xs,
      A.map(double),
      A.filter(keepMod3),
      A.map(double),
      A.filter(keepMod3),
      A.map(double),
      A.filter(keepMod3),
      A.map(double),
      chain8FusedReduce,
    ))
  bench('naive', () =>
    pipe(
      xs,
      naiveMap(double),
      naiveFilter(keepMod3),
      naiveMap(double),
      naiveFilter(keepMod3),
      naiveMap(double),
      naiveFilter(keepMod3),
      naiveMap(double),
      chain8NaiveReduce,
    ))
  bench('hand', () => chain8Hand(xs))
  bench('compiled', () => chain8Compiled(xs))
  bench('select', () =>
    selectivePipe(
      xs,
      A.map(double),
      A.filter(keepMod3),
      A.map(double),
      A.filter(keepMod3),
      A.map(double),
      A.filter(keepMod3),
      A.map(double),
      chain8FusedReduce,
    ))
  competitorSuite('5. 8-op chain', n, xs, expected, chain8Competitors)
})

// =============================================================================
// 6 & 7. map -> filter -> find, sentinel early (~1%) vs late (last element)
// =============================================================================

const EARLY_EXIT_SENTINEL = 1_000
const findFilterPred = (v: number): boolean => v > 0.1
const findPred = (v: number): boolean => v > 100

function findEarlyData(n: number): number[] {
  const index = Math.max(0, Math.floor(n * 0.01))
  return withSentinel(floats(n, 106), index, EARLY_EXIT_SENTINEL)
}
function findLateData(n: number): number[] {
  return withSentinel(floats(n, 107), n - 1, EARLY_EXIT_SENTINEL)
}

const findFusedMap = A.map(double)
const findFusedFilter = A.filter(findFilterPred)
const findFusedFind = A.find(findPred)
const findNaiveMap = naiveMap(double)
const findNaiveFilter = naiveFilter(findFilterPred)
const findNaiveFind = naiveFind(findPred)

function findHand(xs: readonly number[]): unknown {
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i]! * 2
    if (v > 0.1 && v > 100) return some(v)
  }
  return none
}
const findCompiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.map((x) => x * 2), A.filter((x) => x > 0.1), A.find((x) => x > 100));`,
  'fusion-tier-find.ts',
)

assertFuses('6/7. map->filter->find', [findFusedMap, findFusedFilter, findFusedFind])
assertOpaque('6/7. map->filter->find (naive)', [findNaiveMap, findNaiveFilter, findNaiveFind])

const findCompetitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.map(double), Ra.filter(findFilterPred), Ra.find(findPred)) },
  {
    name: 'rambda',
    run: (xs) => Rb.pipe(xs, Rb.map(double), Rb.filter(findFilterPred), Rb.find(findPred)),
  },
  {
    name: 'remeda',
    run: (xs) => Re.pipe(xs, Re.map(double), Re.filter(findFilterPred), Re.find(findPred)),
  },
  {
    name: 'ts-belt',
    run: (xs) => Bt.pipe(xs, Bt.A.map(double), Bt.A.filter(findFilterPred), Bt.A.find(findPred)),
  },
  {
    name: 'lodash',
    run: (xs) => Ld.chain(xs).map(double).filter(findFilterPred).find(findPred).value(),
  },
]

function findCounts(xs: readonly number[]): Record<string, number> {
  let fusedN = 0
  pipe(
    xs,
    A.map((x: number) => {
      fusedN++
      return x * 2
    }),
    findFusedFilter,
    findFusedFind,
  )

  let naiveN = 0
  pipe(
    xs,
    naiveMap((x: number) => {
      naiveN++
      return x * 2
    }),
    findNaiveFilter,
    findNaiveFind,
  )

  let handN = 0
  for (let i = 0; i < xs.length; i++) {
    handN++
    const v = xs[i]! * 2
    if (v > 0.1 && v > 100) break
  }

  const c = { n: 0 }
  const CNT = { tick: () => c.n++ }
  const compiledCounting = compileFixture(
    { ...A_MODULE, CNT: { source: 'virtual:counter', value: CNT } },
    `return pipe(input, A.map((x) => { CNT.tick(); return x * 2 }), A.filter((x) => x > 0.1), A.find((x) => x > 100));`,
    'fusion-tier-count-find.ts',
  )
  compiledCounting(xs)

  let selectN = 0
  selectivePipe(
    xs,
    A.map((x: number) => {
      selectN++
      return x * 2
    }),
    findFusedFilter,
    findFusedFind,
  )

  return { fused: fusedN, naive: naiveN, hand: handN, compiled: c.n, select: selectN }
}

describe.each(SIZES)('6. map->filter->find (early exit near start) — n=%i', (n) => {
  const xs = findEarlyData(n)
  const expected = pipe(xs, findFusedMap, findFusedFilter, findFusedFind)
  assertSame(`6. naive n=${n}`, pipe(xs, findNaiveMap, findNaiveFilter, findNaiveFind), expected)
  assertSame(`6. hand n=${n}`, findHand(xs), expected)
  assertSame(`6. compiled n=${n}`, findCompiled(xs), expected)
  assertSame(
    `6. select n=${n}`,
    selectivePipe(xs, findFusedMap, findFusedFilter, findFusedFind),
    expected,
  )

  recordCounts('6. find (early)', n, findCounts(xs))

  bench('fused', () => pipe(xs, findFusedMap, findFusedFilter, findFusedFind))
  bench('naive', () => pipe(xs, findNaiveMap, findNaiveFilter, findNaiveFind))
  bench('hand', () => findHand(xs))
  bench('compiled', () => findCompiled(xs))
  bench('select', () => selectivePipe(xs, findFusedMap, findFusedFilter, findFusedFind))
  competitorSuite('6. find (early)', n, xs, unwrapOption(expected), findCompetitors)
})

describe.each(SIZES)('7. map->filter->find (early exit late) — n=%i', (n) => {
  const xs = findLateData(n)
  const expected = pipe(xs, findFusedMap, findFusedFilter, findFusedFind)
  assertSame(`7. naive n=${n}`, pipe(xs, findNaiveMap, findNaiveFilter, findNaiveFind), expected)
  assertSame(`7. hand n=${n}`, findHand(xs), expected)
  assertSame(`7. compiled n=${n}`, findCompiled(xs), expected)
  assertSame(
    `7. select n=${n}`,
    selectivePipe(xs, findFusedMap, findFusedFilter, findFusedFind),
    expected,
  )

  recordCounts('7. find (late)', n, findCounts(xs))

  bench('fused', () => pipe(xs, findFusedMap, findFusedFilter, findFusedFind))
  bench('naive', () => pipe(xs, findNaiveMap, findNaiveFilter, findNaiveFind))
  bench('hand', () => findHand(xs))
  bench('compiled', () => findCompiled(xs))
  bench('select', () => selectivePipe(xs, findFusedMap, findFusedFilter, findFusedFind))
  competitorSuite('7. find (late)', n, xs, unwrapOption(expected), findCompetitors)
})

// =============================================================================
// 8. map -> filter -> take(10) over the full n (allocation-avoidance case)
// =============================================================================

const take8Data = (n: number) => floats(n, 108)
const take8FusedMap = A.map(double)
const take8FusedFilter = A.filter(findFilterPred)
const take8FusedTake = A.take(10)
const take8NaiveMap = naiveMap(double)
const take8NaiveFilter = naiveFilter(findFilterPred)
const take8NaiveTake = naiveTake(10)

function take8Hand(xs: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < xs.length && out.length < 10; i++) {
    const v = xs[i]! * 2
    if (v > 0.1) out.push(v)
  }
  return out
}
const take8Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.map((x) => x * 2), A.filter((x) => x > 0.1), A.take(10));`,
  'fusion-tier-take8.ts',
)
assertFuses('8. map->filter->take(10)', [take8FusedMap, take8FusedFilter, take8FusedTake])
assertOpaque('8. map->filter->take(10) (naive)', [take8NaiveMap, take8NaiveFilter, take8NaiveTake])

const take8Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.map(double), Ra.filter(findFilterPred), Ra.take(10)) },
  {
    name: 'rambda',
    run: (xs) => Rb.pipe(xs, Rb.map(double), Rb.filter(findFilterPred), Rb.take(10)),
  },
  {
    name: 'remeda',
    run: (xs) => Re.pipe(xs, Re.map(double), Re.filter(findFilterPred), Re.take(10)),
  },
  {
    name: 'ts-belt',
    run: (xs) => Bt.pipe(xs, Bt.A.map(double), Bt.A.filter(findFilterPred), Bt.A.take(10)),
  },
  { name: 'lodash', run: (xs) => Ld.chain(xs).map(double).filter(findFilterPred).take(10).value() },
]

function take8Counts(xs: readonly number[]): Record<string, number> {
  let fusedN = 0
  pipe(
    xs,
    A.map((x: number) => {
      fusedN++
      return x * 2
    }),
    take8FusedFilter,
    take8FusedTake,
  )

  let naiveN = 0
  pipe(
    xs,
    naiveMap((x: number) => {
      naiveN++
      return x * 2
    }),
    take8NaiveFilter,
    take8NaiveTake,
  )

  let handN = 0
  const out: number[] = []
  for (let i = 0; i < xs.length && out.length < 10; i++) {
    handN++
    const v = xs[i]! * 2
    if (v > 0.1) out.push(v)
  }

  const c = { n: 0 }
  const CNT = { tick: () => c.n++ }
  const compiledCounting = compileFixture(
    { ...A_MODULE, CNT: { source: 'virtual:counter', value: CNT } },
    `return pipe(input, A.map((x) => { CNT.tick(); return x * 2 }), A.filter((x) => x > 0.1), A.take(10));`,
    'fusion-tier-count-take8.ts',
  )
  compiledCounting(xs)

  let selectN = 0
  selectivePipe(
    xs,
    A.map((x: number) => {
      selectN++
      return x * 2
    }),
    take8FusedFilter,
    take8FusedTake,
  )

  return { fused: fusedN, naive: naiveN, hand: handN, compiled: c.n, select: selectN }
}

describe.each(SIZES)('8. map->filter->take(10) — n=%i', (n) => {
  const xs = take8Data(n)
  const expected = pipe(xs, take8FusedMap, take8FusedFilter, take8FusedTake)
  assertSame(`8. naive n=${n}`, pipe(xs, take8NaiveMap, take8NaiveFilter, take8NaiveTake), expected)
  assertSame(`8. hand n=${n}`, take8Hand(xs), expected)
  assertSame(`8. compiled n=${n}`, take8Compiled(xs), expected)
  assertSame(
    `8. select n=${n}`,
    selectivePipe(xs, take8FusedMap, take8FusedFilter, take8FusedTake),
    expected,
  )

  recordCounts('8. take(10)', n, take8Counts(xs))

  bench('fused', () => pipe(xs, take8FusedMap, take8FusedFilter, take8FusedTake))
  bench('naive', () => pipe(xs, take8NaiveMap, take8NaiveFilter, take8NaiveTake))
  bench('hand', () => take8Hand(xs))
  bench('compiled', () => take8Compiled(xs))
  bench('select', () => selectivePipe(xs, take8FusedMap, take8FusedFilter, take8FusedTake))
  competitorSuite('8. take(10)', n, xs, expected, take8Competitors)
})

// =============================================================================
// 9. takeWhile -> map (early exit mid-chain)
// =============================================================================

function takeWhileData(n: number): number[] {
  const rand = xorshift32(109)
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = rand() * 0.85
  out[Math.floor(n / 2)] = 0.95
  return out
}
const takeWhilePred = (x: number): boolean => x < 0.9
const s9FusedTakeWhile = A.takeWhile(takeWhilePred)
const s9FusedMap = A.map(double)
const s9NaiveTakeWhile = naiveTakeWhile(takeWhilePred)
const s9NaiveMap = naiveMap(double)

function s9Hand(xs: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < xs.length; i++) {
    if (!(xs[i]! < 0.9)) break
    out.push(xs[i]! * 2)
  }
  return out
}
const s9Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.takeWhile((x) => x < 0.9), A.map((x) => x * 2));`,
  'fusion-tier-s9.ts',
)
assertFuses('9. takeWhile->map', [s9FusedTakeWhile, s9FusedMap])
assertOpaque('9. takeWhile->map (naive)', [s9NaiveTakeWhile, s9NaiveMap])

// ts-belt's A.takeWhile does not short-circuit at the first failing element
// -- verified directly: takeWhile(x => x < 5)([1,2,3,10,4,5]) returns
// [1,2,3,4], not [1,2,3]. It filters, keeping predicate-satisfying elements
// past the first break, rather than stopping there. That is a different
// operation, not this library's idiom for the same shape, so it is skipped
// here rather than given a row that would fail on data with any match past
// the break point.
const s9Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.takeWhile(takeWhilePred), Ra.map(double)) },
  { name: 'rambda', run: (xs) => Rb.pipe(xs, Rb.takeWhile(takeWhilePred), Rb.map(double)) },
  { name: 'remeda', run: (xs) => Re.pipe(xs, Re.takeWhile(takeWhilePred), Re.map(double)) },
  { name: 'lodash', run: (xs) => Ld.chain(xs).takeWhile(takeWhilePred).map(double).value() },
]

function s9Counts(xs: readonly number[]): Record<string, number> {
  let fusedN = 0
  pipe(
    xs,
    A.takeWhile((x: number) => {
      fusedN++
      return x < 0.9
    }),
    s9FusedMap,
  )

  let naiveN = 0
  pipe(
    xs,
    naiveTakeWhile((x: number) => {
      naiveN++
      return x < 0.9
    }),
    s9NaiveMap,
  )

  let handN = 0
  for (let i = 0; i < xs.length; i++) {
    handN++
    if (!(xs[i]! < 0.9)) break
  }

  const c = { n: 0 }
  const CNT = { tick: () => c.n++ }
  const compiledCounting = compileFixture(
    { ...A_MODULE, CNT: { source: 'virtual:counter', value: CNT } },
    `return pipe(input, A.takeWhile((x) => { CNT.tick(); return x < 0.9 }), A.map((x) => x * 2));`,
    'fusion-tier-count-s9.ts',
  )
  compiledCounting(xs)

  let selectN = 0
  selectivePipe(
    xs,
    A.takeWhile((x: number) => {
      selectN++
      return x < 0.9
    }),
    s9FusedMap,
  )

  return { fused: fusedN, naive: naiveN, hand: handN, compiled: c.n, select: selectN }
}

describe.each(SIZES)('9. takeWhile->map — n=%i', (n) => {
  const xs = takeWhileData(n)
  const expected = pipe(xs, s9FusedTakeWhile, s9FusedMap)
  assertSame(`9. naive n=${n}`, pipe(xs, s9NaiveTakeWhile, s9NaiveMap), expected)
  assertSame(`9. hand n=${n}`, s9Hand(xs), expected)
  assertSame(`9. compiled n=${n}`, s9Compiled(xs), expected)
  assertSame(`9. select n=${n}`, selectivePipe(xs, s9FusedTakeWhile, s9FusedMap), expected)

  recordCounts('9. takeWhile->map', n, s9Counts(xs))

  bench('fused', () => pipe(xs, s9FusedTakeWhile, s9FusedMap))
  bench('naive', () => pipe(xs, s9NaiveTakeWhile, s9NaiveMap))
  bench('hand', () => s9Hand(xs))
  bench('compiled', () => s9Compiled(xs))
  bench('select', () => selectivePipe(xs, s9FusedTakeWhile, s9FusedMap))
  competitorSuite('9. takeWhile->map', n, xs, expected, s9Competitors)
})

// =============================================================================
// 10. flatMap(x => [x, x+1]) -> filter (expanding)
// =============================================================================

const s10Data = (n: number) => ints(n, 110, 1_000)
const s10FlatMapFn = (x: number): number[] => [x, x + 1]
const s10FilterPred = (v: number): boolean => v % 2 === 0
const s10FusedFlatMap = A.flatMap(s10FlatMapFn)
const s10FusedFilter = A.filter(s10FilterPred)
const s10NaiveFlatMap = naiveFlatMap(s10FlatMapFn)
const s10NaiveFilter = naiveFilter(s10FilterPred)

function s10Hand(xs: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i]!
    const b = a + 1
    if (a % 2 === 0) out.push(a)
    if (b % 2 === 0) out.push(b)
  }
  return out
}
const s10Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.flatMap((x) => [x, x + 1]), A.filter((x) => x % 2 === 0));`,
  'fusion-tier-s10.ts',
)
assertFuses('10. flatMap->filter', [s10FusedFlatMap, s10FusedFilter])
assertOpaque('10. flatMap->filter (naive)', [s10NaiveFlatMap, s10NaiveFilter])

// ramda has no flatMap alias, chain is its flatMap; ts-belt has neither, so
// map-then-flat is the idiomatic equivalent there (both still express the
// shape natively, not a contorted one).
const s10Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.chain(s10FlatMapFn), Ra.filter(s10FilterPred)) },
  { name: 'rambda', run: (xs) => Rb.pipe(xs, Rb.flatMap(s10FlatMapFn), Rb.filter(s10FilterPred)) },
  { name: 'remeda', run: (xs) => Re.pipe(xs, Re.flatMap(s10FlatMapFn), Re.filter(s10FilterPred)) },
  {
    name: 'ts-belt (map+flat)',
    run: (xs) => Bt.pipe(xs, Bt.A.map(s10FlatMapFn), Bt.A.flat, Bt.A.filter(s10FilterPred)),
  },
  { name: 'lodash', run: (xs) => Ld.chain(xs).flatMap(s10FlatMapFn).filter(s10FilterPred).value() },
]

describe.each(SIZES)('10. flatMap->filter — n=%i', (n) => {
  const xs = s10Data(n)
  const expected = pipe(xs, s10FusedFlatMap, s10FusedFilter)
  assertSame(`10. naive n=${n}`, pipe(xs, s10NaiveFlatMap, s10NaiveFilter), expected)
  assertSame(`10. hand n=${n}`, s10Hand(xs), expected)
  assertSame(`10. compiled n=${n}`, s10Compiled(xs), expected)
  assertSame(`10. select n=${n}`, selectivePipe(xs, s10FusedFlatMap, s10FusedFilter), expected)

  bench('fused', () => pipe(xs, s10FusedFlatMap, s10FusedFilter))
  bench('naive', () => pipe(xs, s10NaiveFlatMap, s10NaiveFilter))
  bench('hand', () => s10Hand(xs))
  bench('compiled', () => s10Compiled(xs))
  bench('select', () => selectivePipe(xs, s10FusedFlatMap, s10FusedFilter))
  competitorSuite('10. flatMap->filter', n, xs, expected, s10Competitors)
})

// =============================================================================
// 11. map -> sortBy -> take(10) (boundary op mid-chain)
// =============================================================================

const s11Data = (n: number) => floats(n, 111)
const s11Cmp = (a: number, b: number): number => a - b
const s11FusedMap = A.map(double)
const s11FusedSort = A.sortBy(s11Cmp)
const s11FusedTake = A.take(10)
const s11NaiveMap = naiveMap(double)
const s11NaiveSort = naiveSortBy(s11Cmp)
const s11NaiveTake = naiveTake(10)

function s11Hand(xs: readonly number[]): number[] {
  const mapped = new Array<number>(xs.length)
  for (let i = 0; i < xs.length; i++) mapped[i] = xs[i]! * 2
  mapped.sort(s11Cmp)
  return mapped.slice(0, 10)
}
const s11Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.map((x) => x * 2), A.sortBy((a, b) => a - b), A.take(10));`,
  'fusion-tier-s11.ts',
)
assertFuses('11. map->sortBy->take', [s11FusedMap, s11FusedSort, s11FusedTake])
assertOpaque('11. map->sortBy->take (naive)', [s11NaiveMap, s11NaiveSort, s11NaiveTake])

// Custom-comparator sort: ramda/rambda/remeda/ts-belt's idiomatic entry
// point is `sort(comparator)`, not `sortBy` (which takes a key selector).
const s11Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.map(double), Ra.sort(s11Cmp), Ra.take(10)) },
  { name: 'rambda', run: (xs) => Rb.pipe(xs, Rb.map(double), Rb.sort(s11Cmp), Rb.take(10)) },
  { name: 'remeda', run: (xs) => Re.pipe(xs, Re.map(double), Re.sort(s11Cmp), Re.take(10)) },
  { name: 'ts-belt', run: (xs) => Bt.pipe(xs, Bt.A.map(double), Bt.A.sort(s11Cmp), Bt.A.take(10)) },
  { name: 'lodash', run: (xs) => Ld.chain(xs).map(double).sort(s11Cmp).take(10).value() },
]

describe.each(SIZES)('11. map->sortBy->take(10) — n=%i', (n) => {
  const xs = s11Data(n)
  const expected = pipe(xs, s11FusedMap, s11FusedSort, s11FusedTake)
  assertSame(`11. naive n=${n}`, pipe(xs, s11NaiveMap, s11NaiveSort, s11NaiveTake), expected)
  assertSame(`11. hand n=${n}`, s11Hand(xs), expected)
  assertSame(`11. compiled n=${n}`, s11Compiled(xs), expected)
  assertSame(`11. select n=${n}`, selectivePipe(xs, s11FusedMap, s11FusedSort, s11FusedTake), expected)

  bench('fused', () => pipe(xs, s11FusedMap, s11FusedSort, s11FusedTake))
  bench('naive', () => pipe(xs, s11NaiveMap, s11NaiveSort, s11NaiveTake))
  bench('hand', () => s11Hand(xs))
  bench('compiled', () => s11Compiled(xs))
  bench('select', () => selectivePipe(xs, s11FusedMap, s11FusedSort, s11FusedTake))
  competitorSuite('11. map->sortBy->take(10)', n, xs, expected, s11Competitors)
})

// =============================================================================
// 12. map -> uniq -> filter (boundary middle)
// =============================================================================

const s12Data = (n: number) => dupeInts(n, 112)
const s12FusedMap = A.map(double)
const s12FusedUniq = A.uniq
const s12FusedFilter = A.filter(keepMod3)
const s12NaiveMap = naiveMap(double)
const s12NaiveFilter = naiveFilter(keepMod3)

function s12Hand(xs: readonly number[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i]! * 2
    if (seen.has(v)) continue
    seen.add(v)
    if (v % 3 !== 0) out.push(v)
  }
  return out
}
const s12Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.map((x) => x * 2), A.uniq, A.filter((x) => x % 3 !== 0));`,
  'fusion-tier-s12.ts',
)
assertFuses('12. map->uniq->filter', [s12FusedMap, s12FusedUniq, s12FusedFilter])
assertOpaque('12. map->uniq->filter (naive)', [s12NaiveMap, naiveUniq, s12NaiveFilter])

const s12Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.map(double), Ra.uniq, Ra.filter(keepMod3)) },
  { name: 'rambda', run: (xs) => Rb.pipe(xs, Rb.map(double), Rb.uniq, Rb.filter(keepMod3)) },
  { name: 'remeda', run: (xs) => Re.pipe(xs, Re.map(double), Re.unique(), Re.filter(keepMod3)) },
  { name: 'ts-belt', run: (xs) => Bt.pipe(xs, Bt.A.map(double), Bt.A.uniq, Bt.A.filter(keepMod3)) },
  { name: 'lodash', run: (xs) => Ld.chain(xs).map(double).uniq().filter(keepMod3).value() },
]

describe.each(SIZES)('12. map->uniq->filter — n=%i', (n) => {
  const xs = s12Data(n)
  const expected = pipe(xs, s12FusedMap, s12FusedUniq, s12FusedFilter)
  assertSame(`12. naive n=${n}`, pipe(xs, s12NaiveMap, naiveUniq, s12NaiveFilter), expected)
  assertSame(`12. hand n=${n}`, s12Hand(xs), expected)
  assertSame(`12. compiled n=${n}`, s12Compiled(xs), expected)
  assertSame(`12. select n=${n}`, selectivePipe(xs, s12FusedMap, s12FusedUniq, s12FusedFilter), expected)

  bench('fused', () => pipe(xs, s12FusedMap, s12FusedUniq, s12FusedFilter))
  bench('naive', () => pipe(xs, s12NaiveMap, naiveUniq, s12NaiveFilter))
  bench('hand', () => s12Hand(xs))
  bench('compiled', () => s12Compiled(xs))
  bench('select', () => selectivePipe(xs, s12FusedMap, s12FusedUniq, s12FusedFilter))
  competitorSuite('12. map->uniq->filter', n, xs, expected, s12Competitors)
})

// =============================================================================
// 13. scan -> map (stateful)
// =============================================================================

const s13Data = (n: number) => floats(n, 113)
const s13FusedScan = A.scan(addOp, 0)
const s13FusedMap = A.map(double)
const s13NaiveScan = naiveScan(addOp, 0)
const s13NaiveMap = naiveMap(double)

function s13Hand(xs: readonly number[]): number[] {
  const out = new Array<number>(xs.length + 1)
  let acc = 0
  out[0] = acc * 2
  for (let i = 0; i < xs.length; i++) {
    acc = acc + xs[i]!
    out[i + 1] = acc * 2
  }
  return out
}
const s13Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.scan((a, b) => a + b, 0), A.map((x) => x * 2));`,
  'fusion-tier-s13.ts',
)
assertFuses('13. scan->map', [s13FusedScan, s13FusedMap])
assertOpaque('13. scan->map (naive)', [s13NaiveScan, s13NaiveMap])

// Only ramda has a native scan; rambda/remeda/ts-belt/lodash have no
// equivalent (a manual reduce-into-array stand-in would not be their
// idiomatic form), so this shape gets one competitor row, not five.
const s13Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.scan(addOp, 0), Ra.map(double)) },
]

describe.each(SIZES)('13. scan->map — n=%i', (n) => {
  const xs = s13Data(n)
  const expected = pipe(xs, s13FusedScan, s13FusedMap)
  assertSame(`13. naive n=${n}`, pipe(xs, s13NaiveScan, s13NaiveMap), expected)
  assertSame(`13. hand n=${n}`, s13Hand(xs), expected)
  assertSame(`13. compiled n=${n}`, s13Compiled(xs), expected)
  assertSame(`13. select n=${n}`, selectivePipe(xs, s13FusedScan, s13FusedMap), expected)

  bench('fused', () => pipe(xs, s13FusedScan, s13FusedMap))
  bench('naive', () => pipe(xs, s13NaiveScan, s13NaiveMap))
  bench('hand', () => s13Hand(xs))
  bench('compiled', () => s13Compiled(xs))
  bench('select', () => selectivePipe(xs, s13FusedScan, s13FusedMap))
  competitorSuite('13. scan->map', n, xs, expected, s13Competitors)
})

// =============================================================================
// 14. map -> filter -> reduce, HEAVY callback (string parsing)
// =============================================================================

const s14Data = (n: number) => paths(n, 114)
const heavyMap = (s: string): number => s.split('/').length
const heavyKeep = (v: number): boolean => v > 2
const s14FusedMap = A.map(heavyMap)
const s14FusedFilter = A.filter(heavyKeep)
const s14FusedReduce = A.reduce(addOp, 0)
const s14NaiveMap = naiveMap(heavyMap)
const s14NaiveFilter = naiveFilter(heavyKeep)
const s14NaiveReduce = naiveReduce(addOp, 0)

function s14Hand(xs: readonly string[]): number {
  let acc = 0
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i]!.split('/').length
    if (v > 2) acc += v
  }
  return acc
}
const s14Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.map((s) => s.split('/').length), A.filter((v) => v > 2), A.reduce((a, b) => a + b, 0));`,
  'fusion-tier-s14.ts',
)
assertFuses('14. heavy map->filter->reduce', [s14FusedMap, s14FusedFilter, s14FusedReduce])
assertOpaque('14. heavy map->filter->reduce (naive)', [s14NaiveMap, s14NaiveFilter, s14NaiveReduce])

const s14Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.map(heavyMap), Ra.filter(heavyKeep), Ra.reduce(addOp, 0)) },
  {
    name: 'rambda',
    run: (xs) => Rb.pipe(xs, Rb.map(heavyMap), Rb.filter(heavyKeep), Rb.reduce(addOp, 0)),
  },
  {
    name: 'remeda',
    run: (xs) => Re.pipe(xs, Re.map(heavyMap), Re.filter(heavyKeep), Re.reduce(addOp, 0)),
  },
  {
    name: 'ts-belt',
    run: (xs) => Bt.pipe(xs, Bt.A.map(heavyMap), Bt.A.filter(heavyKeep), Bt.A.reduce(0, addOp)),
  },
  { name: 'lodash', run: (xs) => Ld.chain(xs).map(heavyMap).filter(heavyKeep).reduce(addOp, 0).value() },
]

describe.each(SIZES)('14. heavy map->filter->reduce — n=%i', (n) => {
  const xs = s14Data(n)
  const expected = pipe(xs, s14FusedMap, s14FusedFilter, s14FusedReduce)
  assertSame(`14. naive n=${n}`, pipe(xs, s14NaiveMap, s14NaiveFilter, s14NaiveReduce), expected)
  assertSame(`14. hand n=${n}`, s14Hand(xs), expected)
  assertSame(`14. compiled n=${n}`, s14Compiled(xs), expected)
  assertSame(
    `14. select n=${n}`,
    selectivePipe(xs, s14FusedMap, s14FusedFilter, s14FusedReduce),
    expected,
  )

  bench('fused', () => pipe(xs, s14FusedMap, s14FusedFilter, s14FusedReduce))
  bench('naive', () => pipe(xs, s14NaiveMap, s14NaiveFilter, s14NaiveReduce))
  bench('hand', () => s14Hand(xs))
  bench('compiled', () => s14Compiled(xs))
  bench('select', () => selectivePipe(xs, s14FusedMap, s14FusedFilter, s14FusedReduce))
  competitorSuite('14. heavy map->filter->reduce', n, xs, expected, s14Competitors)
})

// =============================================================================
// 15. head after filter (option-producing terminal; head is a materialising
// boundary in the compact plan, not part of the stream -- see probe below,
// so it can't halt the preceding filter early. Only `hand` actually does.)
// =============================================================================

function s15Data(n: number): number[] {
  return withSentinel(floats(n, 115), 0, EARLY_EXIT_SENTINEL)
}
const s15FilterPred = (x: number): boolean => x > 100
const s15FusedFilter = A.filter(s15FilterPred)
const s15FusedHead = A.head
const s15NaiveFilter = naiveFilter(s15FilterPred)

function s15Hand(xs: readonly number[]): unknown {
  for (let i = 0; i < xs.length; i++) {
    if (xs[i]! > 100) return some(xs[i])
  }
  return none
}
const s15Compiled = compileFixture(
  A_MODULE,
  `return pipe(input, A.filter((x) => x > 100), A.head);`,
  'fusion-tier-s15.ts',
)
assertFuses('15. filter->head', [s15FusedFilter, s15FusedHead])
assertOpaque('15. filter->head (naive)', [s15NaiveFilter, naiveHead])

const s15Competitors: readonly Competitor[] = [
  { name: 'ramda', run: Ra.pipe(Ra.filter(s15FilterPred), Ra.head) },
  { name: 'rambda', run: (xs) => Rb.pipe(xs, Rb.filter(s15FilterPred), Rb.head) },
  { name: 'remeda', run: (xs) => Re.pipe(xs, Re.filter(s15FilterPred), Re.first()) },
  { name: 'ts-belt', run: (xs) => Bt.pipe(xs, Bt.A.filter(s15FilterPred), Bt.A.head) },
  { name: 'lodash', run: (xs) => Ld.chain(xs).filter(s15FilterPred).head().value() },
]

function s15Counts(xs: readonly number[]): Record<string, number> {
  let fusedN = 0
  pipe(
    xs,
    A.filter((x: number) => {
      fusedN++
      return x > 100
    }),
    s15FusedHead,
  )

  let naiveN = 0
  pipe(
    xs,
    naiveFilter((x: number) => {
      naiveN++
      return x > 100
    }),
    naiveHead,
  )

  let handN = 0
  for (let i = 0; i < xs.length; i++) {
    handN++
    if (xs[i]! > 100) break
  }

  const c = { n: 0 }
  const CNT = { tick: () => c.n++ }
  const compiledCounting = compileFixture(
    { ...A_MODULE, CNT: { source: 'virtual:counter', value: CNT } },
    `return pipe(input, A.filter((x) => { CNT.tick(); return x > 100 }), A.head);`,
    'fusion-tier-count-s15.ts',
  )
  compiledCounting(xs)

  let selectN = 0
  selectivePipe(
    xs,
    A.filter((x: number) => {
      selectN++
      return x > 100
    }),
    s15FusedHead,
  )

  return { fused: fusedN, naive: naiveN, hand: handN, compiled: c.n, select: selectN }
}

describe.each(SIZES)('15. filter->head — n=%i', (n) => {
  const xs = s15Data(n)
  const expected = pipe(xs, s15FusedFilter, s15FusedHead)
  assertSame(`15. naive n=${n}`, pipe(xs, s15NaiveFilter, naiveHead), expected)
  assertSame(`15. hand n=${n}`, s15Hand(xs), expected)
  assertSame(`15. compiled n=${n}`, s15Compiled(xs), expected)
  assertSame(`15. select n=${n}`, selectivePipe(xs, s15FusedFilter, s15FusedHead), expected)

  recordCounts('15. filter->head', n, s15Counts(xs))

  bench('fused', () => pipe(xs, s15FusedFilter, s15FusedHead))
  bench('naive', () => pipe(xs, s15NaiveFilter, naiveHead))
  bench('hand', () => s15Hand(xs))
  bench('compiled', () => s15Compiled(xs))
  bench('select', () => selectivePipe(xs, s15FusedFilter, s15FusedHead))
  competitorSuite('15. filter->head', n, xs, unwrapOption(expected), s15Competitors)
})

// =============================================================================
// 16. selector overhead in isolation: selectivePipe's classify+cache+length
// check vs calling the same tagged closures directly, on a naive-routed
// chain (no take/find sink, so it always takes the plain-sequential branch).
//
// Two n values, deliberately: selectivePipe's own condition order is
// `Array.isArray(input) && input.length >= THRESHOLD && classifyCached(ops)`
// -- cheapest check first, so at n=10 (below THRESHOLD) the length check
// short-circuits before classify() ever runs, and this row measures just
// that comparison. At n=1_000 (at THRESHOLD) the length check passes, so
// classify()'s cache lookup actually executes -- and still resolves to the
// plain-sequential branch, since this chain has no take/find sink. That is
// the fuller "classify + cache + length check" number the shape's own name
// promises; n=10 alone would have understated it.
// =============================================================================

const overheadMap = A.map(double)
const overheadFilter = A.filter(keepMod3)
const overheadReduce = A.reduce(addOp, 0)

// This chain has no take/find-class sink, so selectivePipe's classifier
// marks it not-winning at every n -- confirmed the same way shape 1-5/9-15
// are (assertFuses proves the ops themselves fuse fine through the real
// engine; classify()'s decision not to route them there is a selector
// policy choice, not a fusability question, so there is nothing to assert
// against buildCompactPlan here).
assertFuses('16. selector overhead chain (still fuseable, just not routed)', [
  overheadMap,
  overheadFilter,
  overheadReduce,
])

describe.each([10, 1_000] as const)(
  '16. selector overhead (map->filter->reduce, naive-routed) — n=%i',
  (n) => {
    const xs = floats(n, 116)
    const expected = overheadReduce(overheadFilter(overheadMap(xs)))
    assertSame(
      `16. select n=${n}`,
      selectivePipe(xs, overheadMap, overheadFilter, overheadReduce),
      expected,
    )

    bench('selectivePipe (classify + cache + length check)', () =>
      selectivePipe(xs, overheadMap, overheadFilter, overheadReduce))
    bench('direct calls (no selector)', () => overheadReduce(overheadFilter(overheadMap(xs))))
  },
)

// ---------------------------------------------------------------------------
// print the callback-count table once, after collection
// ---------------------------------------------------------------------------

afterAll(() => {
  console.table(countRows)
}, 30_000)
