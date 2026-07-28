// W0a exit gate: "the emitter's output diffs clean against fp-compiler for
// the compiler's supported subset." For each fixture we run the same source
// pipeline two ways -- transformed by @stopcock/fp-compiler and evaluated
// via new Function (mirroring packages/fp-compiler/src/__tests__/harness.ts),
// and lowered by the frozen emitter from an equivalent PipelineDesc -- and
// assert identical outputs and callback counts.
//
// fp-compiler's supported subset (packages/fp-compiler/src/ops.ts): stream
// ops map/filter/reject/filterMap/flatMap/take/drop/takeWhile/dropWhile,
// boundary ops sort/sortBy/sortAsc/sortDesc/reverse/uniq, terminals sum/
// count/reduce/forEach/find/findIndex/findMap/every/some/none. Note
// fp-compiler fuses sum into the same loop as a terminal, while the
// registry classifies OP_SUM as a materializer/boundary (see emitter.ts's
// header comment) -- an architectural difference, not an output
// difference: sum is associative over the same left-to-right item sequence
// either way, so both compute the same value from the same per-item
// callback calls.
//
// findIndex/findMap/none aren't in the frozen emitter's grammar (W0a scoped
// it to the ops the fuzz corpus exercises), so they have no diff coverage
// here -- see packages/fp-compiler/src/__tests__/transform.test.ts for
// their correctness fixtures (transformed vs. real @stopcock/fp semantics).
import { describe, expect, it } from 'vite-plus/test'
import { pipe, flow } from '@stopcock/fp/fusion'
import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
import * as N from '@stopcock/fp/math'
import * as S from '@stopcock/fp/string'
import * as O from '@stopcock/fp/option'
import * as R from '@stopcock/fp/result'
import { none } from '@stopcock/fp/option'
import * as Rec from '@stopcock/fp/record'
import * as M from '@stopcock/fp/map'
import * as St from '@stopcock/fp/set'
import * as Obj from '@stopcock/fp/object'
import * as Iter from '@stopcock/fp/iter'
import { transformStopcockPipelines } from '../../../packages/fp-compiler/src/transform'
import { compileEmittedPipeline, type EmitterBinding, type PipelineDesc } from './emitter'

const INPUT = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0, -3, 12, 15, -8, 20]
const DUP_INPUT = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9]

interface Fixture {
  readonly name: string
  readonly source: string
  readonly desc: PipelineDesc
  readonly bindings: readonly EmitterBinding[]
  /** Index into bindings/desc.steps whose callback the source's track() calls come from. Defaults to 0. */
  readonly trackedStepIndex?: number
  /** Overrides INPUT, e.g. for uniq fixtures that need duplicates to be meaningful. */
  readonly input?: readonly number[]
  /**
   * D1 (one-runtime-path plan): callback interleaving across tiers is
   * unspecified. `pipe`/`flow` imported here from `@stopcock/fp/fusion` are
   * now the same sequential functions as root -- for a pipeline shaped so
   * an early-exit terminal (find/take/...) can stop mid-expansion, the
   * fused compiled/emitted tiers call fewer callbacks than a sequential
   * pass over the whole array does. Set only on fixtures where that's
   * true, to the sequential tier's own pinned count; omitted fixtures keep
   * asserting all three tiers call back the same number of times.
   */
  readonly originalLogLength?: number
}

function probeSource(source: string): string {
  return `import { pipe } from '@stopcock/fp/fusion'\nimport * as A from '@stopcock/fp/array'\nfunction __fixture(input, track) {\n${source}\n}\nexport { __fixture };`
}

function run(source: string, input: readonly number[], log: number[]): unknown {
  const full = `function __fixture(input, track, pipe, A) {\n${source}\n}\nreturn __fixture(input, track, pipe, A);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'pipe', 'A', full)
  return fn(input.slice(), (x: number) => log.push(x), pipe, A)
}

function runTransformed(source: string, input: readonly number[], log: number[]): unknown {
  const wrapped = probeSource(source)
  const result = transformStopcockPipelines(wrapped, 'fixture.ts', { diagnostics: false })
  const noneAlias = result.code.match(/import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u)?.[1]
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  const call = `${stripped}\nreturn __fixture(input, track);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'pipe', 'A', ...(noneAlias ? [noneAlias] : []), call)
  return fn(input.slice(), (x: number) => log.push(x), pipe, A, ...(noneAlias ? [none] : []))
}

const fixtures: Fixture[] = [
  {
    name: 'map',
    source: `return pipe(input, A.map((x) => (track(x), x * 2)));`,
    desc: { steps: [{ kind: 'map' }] },
    bindings: [{ fn: (x: number) => x * 2 }],
  },
  {
    name: 'filter',
    source: `return pipe(input, A.filter((x) => (track(x), x % 2 === 0)));`,
    desc: { steps: [{ kind: 'filter' }] },
    bindings: [{ fn: (x: number) => x % 2 === 0 }],
  },
  {
    name: 'reject',
    source: `return pipe(input, A.reject((x) => (track(x), x % 2 === 0)));`,
    desc: { steps: [{ kind: 'reject' }] },
    bindings: [{ fn: (x: number) => x % 2 === 0 }],
  },
  {
    name: 'filterMap',
    source: `return pipe(input, A.filterMap((x) => (track(x), x % 2 === 0 ? x * 10 : undefined)));`,
    desc: { steps: [{ kind: 'filterMap' }] },
    bindings: [{ fn: (x: number) => (x % 2 === 0 ? x * 10 : undefined) }],
  },
  {
    name: 'take',
    source: `return pipe(input, A.map((x) => (track(x), x)), A.take(4));`,
    desc: { steps: [{ kind: 'map' }, { kind: 'take' }] },
    bindings: [{ fn: (x: number) => x }, { fn: 4 }],
    // D1: sequential map runs over the whole INPUT before take ever sees a
    // value; the fused compiled/emitted tiers stop as soon as take's quota
    // is satisfied.
    originalLogLength: INPUT.length,
  },
  {
    name: 'drop',
    source: `return pipe(input, A.map((x) => (track(x), x)), A.drop(3));`,
    desc: { steps: [{ kind: 'map' }, { kind: 'drop' }] },
    bindings: [{ fn: (x: number) => x }, { fn: 3 }],
  },
  {
    name: 'takeWhile',
    source: `return pipe(input, A.takeWhile((x) => (track(x), x < 8)));`,
    desc: { steps: [{ kind: 'takeWhile' }] },
    bindings: [{ fn: (x: number) => x < 8 }],
  },
  {
    name: 'dropWhile',
    source: `return pipe(input, A.dropWhile((x) => (track(x), x > 1)));`,
    desc: { steps: [{ kind: 'dropWhile' }] },
    bindings: [{ fn: (x: number) => x > 1 }],
  },
  {
    name: 'sum',
    source: `return pipe(input, A.map((x) => (track(x), x * 2)), A.sum);`,
    desc: { steps: [{ kind: 'map' }, { kind: 'sum' }] },
    bindings: [{ fn: (x: number) => x * 2 }, {}],
  },
  {
    name: 'count',
    source: `return pipe(input, A.count((x) => (track(x), x % 2 === 0)));`,
    desc: { steps: [{ kind: 'count' }] },
    bindings: [{ fn: (x: number) => x % 2 === 0 }],
  },
  {
    name: 'reduce',
    source: `return pipe(input, A.reduce((acc, x) => (track(x), acc + x), 0));`,
    desc: { steps: [{ kind: 'reduce' }] },
    bindings: [{ fn: (acc: number, x: number) => acc + x, a1: 0 }],
  },
  {
    name: 'forEach',
    source: `return pipe(input, A.forEach((x) => { track(x); }));`,
    desc: { steps: [{ kind: 'forEach' }] },
    bindings: [{ fn: (_x: number) => {} }],
  },
  {
    name: 'find',
    source: `return pipe(input, A.find((x) => (track(x), x > 6)));`,
    desc: { steps: [{ kind: 'find' }] },
    bindings: [{ fn: (x: number) => x > 6 }],
  },
  {
    name: 'every',
    source: `return pipe(input, A.every((x) => (track(x), x > -100)));`,
    desc: { steps: [{ kind: 'every' }] },
    bindings: [{ fn: (x: number) => x > -100 }],
  },
  {
    name: 'some',
    source: `return pipe(input, A.some((x) => (track(x), x === 9)));`,
    desc: { steps: [{ kind: 'some' }] },
    bindings: [{ fn: (x: number) => x === 9 }],
  },
  {
    name: 'map -> filter -> take -> reduce',
    // D1: sequential map runs over the whole INPUT before filter/take/reduce
    // ever run; the fused compiled/emitted tiers stop once take's quota is
    // satisfied.
    originalLogLength: INPUT.length,
    source: `return pipe(
      input,
      A.map((x) => (track(x), x + 1)),
      A.filter((x) => x % 2 === 0),
      A.take(3),
      A.reduce((acc, x) => acc + x, 0),
    );`,
    desc: { steps: [{ kind: 'map' }, { kind: 'filter' }, { kind: 'take' }, { kind: 'reduce' }] },
    bindings: [
      { fn: (x: number) => x + 1 },
      { fn: (x: number) => x % 2 === 0 },
      { fn: 3 },
      { fn: (acc: number, x: number) => acc + x, a1: 0 },
    ],
  },
]

describe('W0a: emitter output diffs clean against fp-compiler (compiler-supported subset)', () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const input = fixture.input ?? INPUT
      const originalLog: number[] = []
      const originalValue = run(fixture.source, input, originalLog)

      const transformedLog: number[] = []
      const probe = probeSource(fixture.source)
      const result = transformStopcockPipelines(probe, `${fixture.name}.ts`, { diagnostics: false })
      expect(
        result.code,
        `${fixture.name}: expected the compiler to transform this pipeline`,
      ).not.toBe(probe)
      const transformedValue = runTransformed(fixture.source, input, transformedLog)

      const emittedLog: number[] = []
      const trackedIndex = fixture.trackedStepIndex ?? 0
      const trackedBindings = fixture.bindings.map((b, i) => {
        if (i !== trackedIndex || typeof b.fn !== 'function') return b
        const raw = b.fn as (...args: unknown[]) => unknown
        return {
          ...b,
          fn: (...args: unknown[]) => (
            emittedLog.push(args[args.length - 1] as number),
            raw(...args)
          ),
        }
      })
      const emittedValue = compileEmittedPipeline(fixture.desc)(input.slice(), trackedBindings)

      expect(transformedValue).toEqual(originalValue)
      expect(emittedValue).toEqual(originalValue)
      expect(originalLog.length).toBe(fixture.originalLogLength ?? transformedLog.length)
      expect(transformedLog.length).toBe(emittedLog.length)
    })
  }
})

// --- flatMap, boundaries: W6 grammar extension ---

const boundaryFixtures: Fixture[] = [
  {
    name: 'flatMap',
    source: `return pipe(input, A.flatMap((x) => (track(x), [x, x + 100])));`,
    desc: { steps: [{ kind: 'flatMap' }] },
    bindings: [{ fn: (x: number) => [x, x + 100] }],
  },
  {
    name: 'flatMap -> filter -> take (early exit through the inner loop)',
    // D1: sequential flatMap expands the whole INPUT before filter/take
    // ever run; the fused compiled/emitted tiers stop once take's quota is
    // satisfied, partway through one outer element's inner expansion.
    originalLogLength: INPUT.length,
    source: `return pipe(
      input,
      A.flatMap((x) => (track(x), [x, x + 1, x + 2])),
      A.filter((x) => x % 2 === 0),
      A.take(5),
    );`,
    desc: { steps: [{ kind: 'flatMap' }, { kind: 'filter' }, { kind: 'take' }] },
    bindings: [
      { fn: (x: number) => [x, x + 1, x + 2] },
      { fn: (x: number) => x % 2 === 0 },
      { fn: 5 },
    ],
  },
  {
    name: 'flatMap -> find (break through both loops)',
    source: `return pipe(
      input,
      A.flatMap((x) => (track(x), [x, x * 10])),
      A.find((x) => x > 50),
    );`,
    desc: { steps: [{ kind: 'flatMap' }, { kind: 'find' }] },
    bindings: [{ fn: (x: number) => [x, x * 10] }, { fn: (x: number) => x > 50 }],
    // Sequential flatMap expands the whole 15-element INPUT before find
    // ever runs (D1); the fused compiled/emitted tiers still stop as soon
    // as find matches, 3 outer calls in.
    originalLogLength: INPUT.length,
  },
  {
    name: 'sort boundary',
    source: `return pipe(input, A.map((x) => (track(x), x)), A.sort);`,
    desc: { steps: [{ kind: 'map' }, { kind: 'sort' }] },
    bindings: [{ fn: (x: number) => x }, {}],
  },
  {
    name: 'sortAsc boundary',
    source: `return pipe(input, A.map((x) => (track(x), x)), A.sortAsc);`,
    desc: { steps: [{ kind: 'map' }, { kind: 'sortAsc' }] },
    bindings: [{ fn: (x: number) => x }, {}],
  },
  {
    name: 'sortDesc boundary',
    source: `return pipe(input, A.map((x) => (track(x), x)), A.sortDesc);`,
    desc: { steps: [{ kind: 'map' }, { kind: 'sortDesc' }] },
    bindings: [{ fn: (x: number) => x }, {}],
  },
  {
    name: 'sortBy boundary',
    source: `return pipe(input, A.map((x) => (track(x), x)), A.sortBy((a, b) => b - a));`,
    desc: { steps: [{ kind: 'map' }, { kind: 'sortBy' }] },
    bindings: [{ fn: (x: number) => x }, { fn: (a: number, b: number) => b - a }],
  },
  {
    name: 'reverse boundary',
    source: `return pipe(input, A.map((x) => (track(x), x)), A.reverse);`,
    desc: { steps: [{ kind: 'map' }, { kind: 'reverse' }] },
    bindings: [{ fn: (x: number) => x }, {}],
  },
  {
    name: 'uniq boundary',
    source: `return pipe(input, A.map((x) => (track(x), x)), A.uniq);`,
    desc: { steps: [{ kind: 'map' }, { kind: 'uniq' }] },
    bindings: [{ fn: (x: number) => x }, {}],
    input: DUP_INPUT,
  },
  {
    name: 'boundary mid-pipeline: map -> uniq -> sum',
    source: `return pipe(input, A.map((x) => (track(x), x % 3)), A.uniq, A.sum);`,
    desc: { steps: [{ kind: 'map' }, { kind: 'uniq' }, { kind: 'sum' }] },
    bindings: [{ fn: (x: number) => x % 3 }, {}, {}],
    input: DUP_INPUT,
  },
]

describe('W6: flatMap and boundary ops diff clean against fp-compiler', () => {
  for (const fixture of boundaryFixtures) {
    it(fixture.name, () => {
      const input = fixture.input ?? INPUT
      const originalLog: number[] = []
      const originalValue = run(fixture.source, input, originalLog)

      const transformedLog: number[] = []
      const probe = probeSource(fixture.source)
      const result = transformStopcockPipelines(probe, `${fixture.name}.ts`, { diagnostics: false })
      expect(
        result.code,
        `${fixture.name}: expected the compiler to transform this pipeline`,
      ).not.toBe(probe)
      const transformedValue = runTransformed(fixture.source, input, transformedLog)

      const emittedLog: number[] = []
      const trackedIndex = fixture.trackedStepIndex ?? 0
      const trackedBindings = fixture.bindings.map((b, i) => {
        if (i !== trackedIndex || typeof b.fn !== 'function') return b
        const raw = b.fn as (...args: unknown[]) => unknown
        return {
          ...b,
          fn: (...args: unknown[]) => (
            emittedLog.push(args[args.length - 1] as number),
            raw(...args)
          ),
        }
      })
      const emittedValue = compileEmittedPipeline(fixture.desc)(input.slice(), trackedBindings)

      expect(transformedValue).toEqual(originalValue)
      expect(emittedValue).toEqual(originalValue)
      expect(originalLog.length).toBe(fixture.originalLogLength ?? transformedLog.length)
      expect(transformedLog.length).toBe(emittedLog.length)
    })
  }
})

// --- flow()/compile(): W6 grammar extension ---
//
// flow/compile fixtures wire steps as call arguments instead of pipe()'s
// (source, ...steps) shape, so they get their own probe/run helpers; the
// emitted-pipeline side reuses the same PipelineDesc/bindings machinery
// since compileEmittedPipeline is source-shape-agnostic (it's just
// `(input, bindings) => data`).

function probeSourceDeferred(source: string): string {
  return `import { compile, flow } from '@stopcock/fp/fusion'\nimport * as A from '@stopcock/fp/array'\nfunction __fixture(input, track) {\n${source}\n}\nexport { __fixture };`
}

function runDeferred(source: string, input: readonly number[], log: number[]): unknown {
  const full = `function __fixture(input, track, compile, flow, A) {\n${source}\n}\nreturn __fixture(input, track, compile, flow, A);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'compile', 'flow', 'A', full)
  return fn(input.slice(), (x: number) => log.push(x), compile, flow, A)
}

function runTransformedDeferred(source: string, input: readonly number[], log: number[]): unknown {
  const wrapped = probeSourceDeferred(source)
  const result = transformStopcockPipelines(wrapped, 'fixture.ts', { diagnostics: false })
  const noneAlias = result.code.match(/import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u)?.[1]
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  const call = `${stripped}\nreturn __fixture(input, track);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(
    'input',
    'track',
    'compile',
    'flow',
    'A',
    ...(noneAlias ? [noneAlias] : []),
    call,
  )
  return fn(
    input.slice(),
    (x: number) => log.push(x),
    compile,
    flow,
    A,
    ...(noneAlias ? [none] : []),
  )
}

const deferredFixtures: Fixture[] = [
  {
    name: 'compile() with 2 steps fuses to an arrow function runner',
    source: `const run = compile(A.map((x) => (track(x), x * 2)), A.filter((x) => x > 4)); return run(input);`,
    desc: { steps: [{ kind: 'map' }, { kind: 'filter' }] },
    bindings: [{ fn: (x: number) => x * 2 }, { fn: (x: number) => x > 4 }],
  },
  {
    name: 'flow() with 3 steps fuses to an arrow function runner',
    source: `const run = flow(A.map((x) => (track(x), x + 1)), A.filter((x) => x % 2 === 0), A.take(3)); return run(input);`,
    desc: { steps: [{ kind: 'map' }, { kind: 'filter' }, { kind: 'take' }] },
    bindings: [{ fn: (x: number) => x + 1 }, { fn: (x: number) => x % 2 === 0 }, { fn: 3 }],
    // Sequential flow() maps the whole 15-element INPUT before filter/take
    // ever run (D1); the fused compiled/emitted tiers stop 5 source
    // elements in, once take's quota of 3 accepted items is satisfied.
    originalLogLength: INPUT.length,
  },
  {
    name: 'compile() runner reused across multiple calls',
    source: `
      const run = compile(A.map((x) => (track(x), x * 3)), A.sum);
      return [run(input), run(input)];
    `,
    desc: { steps: [{ kind: 'map' }, { kind: 'sum' }] },
    bindings: [{ fn: (x: number) => x * 3 }, {}],
  },
]

describe('W6: flow()/compile() with >= 2 steps diff clean against fp-compiler', () => {
  for (const fixture of deferredFixtures) {
    it(fixture.name, () => {
      const input = fixture.input ?? INPUT
      const originalLog: number[] = []
      const originalValue = runDeferred(fixture.source, input, originalLog)

      const transformedLog: number[] = []
      const probe = probeSourceDeferred(fixture.source)
      const result = transformStopcockPipelines(probe, `${fixture.name}.ts`, { diagnostics: false })
      expect(
        result.code,
        `${fixture.name}: expected the compiler to transform this flow()/compile() call`,
      ).not.toBe(probe)
      const transformedValue = runTransformedDeferred(fixture.source, input, transformedLog)

      const emittedLog: number[] = []
      const trackedIndex = fixture.trackedStepIndex ?? 0
      const trackedBindings = fixture.bindings.map((b, i) => {
        if (i !== trackedIndex || typeof b.fn !== 'function') return b
        const raw = b.fn as (...args: unknown[]) => unknown
        return {
          ...b,
          fn: (...args: unknown[]) => (
            emittedLog.push(args[args.length - 1] as number),
            raw(...args)
          ),
        }
      })
      // compileEmittedPipeline models one call of the pipeline; the "reused
      // runner" fixture calls run(input) twice, so run the emitted pipeline
      // twice too and shape the result the same way the source does.
      const runEmitted = () => compileEmittedPipeline(fixture.desc)(input.slice(), trackedBindings)
      const emittedValue = fixture.name.includes('reused')
        ? [runEmitted(), runEmitted()]
        : runEmitted()

      expect(transformedValue).toEqual(originalValue)
      expect(emittedValue).toEqual(originalValue)
      expect(originalLog.length).toBe(fixture.originalLogLength ?? transformedLog.length)
      expect(transformedLog.length).toBe(emittedLog.length)
    })
  }
})

// --- transform and diagnose edges outside the generated differential corpus ---

describe('W6: expanded compiler coverage and clean unsupported diagnostics', () => {
  it('scan is transformed through its exact full-array boundary', () => {
    const source = probeSource(`return pipe(input, A.scan((acc, x) => acc + x, 0));`)
    const result = transformStopcockPipelines(source, 'scan.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it('without is transformed through its exact full-array boundary', () => {
    const source = probeSource(`return pipe(input, A.without([1, 2]));`)
    const result = transformStopcockPipelines(source, 'without.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it('without with an invalid data-last arity is diagnosed and left unchanged', () => {
    const source = probeSource(`return pipe(input, A.without(1, 2));`)
    const result = transformStopcockPipelines(source, 'without-invalid.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('without: unexpected arg count 2')
  })

  it('toArray (not a real op) is diagnosed, not transformed', () => {
    const source = probeSource(`return pipe(input, A.map((x) => x), A.toArray());`)
    const result = transformStopcockPipelines(source, 'toarray.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unknown op: toArray')
  })

  it('compile() with a single step is transformed', () => {
    const source = probeSourceDeferred(
      `const run = compile(A.map((x) => x * 2)); return run(input);`,
    )
    const result = transformStopcockPipelines(source, 'compile-single.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it('flow() containing scan transforms through its full-array boundary', () => {
    const source = probeSourceDeferred(
      `const run = flow(A.map((x) => x * 2), A.scan((acc, x) => acc + x, 0)); return run(input);`,
    )
    const result = transformStopcockPipelines(source, 'flow-scan.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })
})

// --- phase 1.4: scalar ops (math/string/object/guard) mid-pipeline ---
//
// `N.inc`/`S.trim`/... are `compilerPipelineRole: 'boundary'` (see
// operator-definitions.ts), same segmenting treatment as `uniq` in the W6
// "boundary mid-pipeline" fixture above, but registered `inputDomain:
// 'scalar'`, never `'array'`. Applied to whatever the pipe's current value
// actually is at that point -- which, sitting between two array stages, is
// the whole array the upstream stage produced, not one of its elements. Both
// reference executors agree: root `pipe`'s plain `step(current)` and
// `@stopcock/fp/fusion`'s compact engine (`internal/compact-runtime.ts#runScalarSegment`)
// apply a scalar op to the whole current value. A scalar function fed a
// whole array does whatever plain JS does with that (numeric coercion,
// `TypeError` for a missing method, ...): matching that exactly, including a
// thrown error, is the point of this corpus, not whether the chain is
// sensible user code.

function probeSourceScalar(source: string): string {
  return `import { pipe } from '@stopcock/fp/fusion'\nimport * as A from '@stopcock/fp/array'\nimport * as N from '@stopcock/fp/math'\nimport * as S from '@stopcock/fp/string'\nfunction __fixture(input, track) {\n${source}\n}\nexport { __fixture };`
}

function runScalar(source: string, input: readonly number[], log: number[]): unknown {
  const full = `function __fixture(input, track, pipe, A, N, S) {\n${source}\n}\nreturn __fixture(input, track, pipe, A, N, S);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'pipe', 'A', 'N', 'S', full)
  return fn(input.slice(), (x: number) => log.push(x), pipe, A, N, S)
}

function runTransformedScalar(source: string, input: readonly number[], log: number[]): unknown {
  const wrapped = probeSourceScalar(source)
  const result = transformStopcockPipelines(wrapped, 'fixture.ts', { diagnostics: false })
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  const call = `${stripped}\nreturn __fixture(input, track);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'pipe', 'A', 'N', 'S', call)
  return fn(input.slice(), (x: number) => log.push(x), pipe, A, N, S)
}

describe('phase 1.4: scalar op mid-pipeline compiles as one site', () => {
  it('map -> N.inc -> filter: one compiled site, identical output and callback count', () => {
    const source = `return pipe(
      input,
      A.map((x) => (track(x), x + 1)),
      N.inc,
      A.filter((x) => x % 2 === 0),
    );`
    const originalLog: number[] = []
    const originalValue = runScalar(source, INPUT, originalLog)

    const probe = probeSourceScalar(source)
    const result = transformStopcockPipelines(probe, 'inc-mid.ts', { diagnostics: 'verbose' })
    expect(result.code, 'expected the compiler to transform this pipeline').not.toBe(probe)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].transformed).toBe(true)
    expect(result.diagnostics[0].segmentKinds).toEqual(['stream', 'boundary', 'stream'])

    const transformedLog: number[] = []
    const transformedValue = runTransformedScalar(source, INPUT, transformedLog)

    expect(transformedValue).toEqual(originalValue)
    expect(transformedLog.length).toBe(originalLog.length)
  })

  it('map -> N.add(bound arg) -> filter: one compiled site, identical output', () => {
    const source = `return pipe(
      input,
      A.map((x) => (track(x), x + 1)),
      N.add(2),
      A.filter((x) => x % 2 === 0),
    );`
    const originalLog: number[] = []
    const originalValue = runScalar(source, INPUT, originalLog)

    const probe = probeSourceScalar(source)
    const result = transformStopcockPipelines(probe, 'add-mid.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(probe)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].transformed).toBe(true)

    const transformedLog: number[] = []
    const transformedValue = runTransformedScalar(source, INPUT, transformedLog)

    expect(transformedValue).toEqual(originalValue)
    expect(transformedLog.length).toBe(originalLog.length)
  })

  it('map -> S.trim -> reject: one compiled site, both throw the same TypeError', () => {
    // S.trim receives the mapped array (a whole-value boundary, not an
    // element), and arrays have no `.trim` method -- both the reference and
    // the compiled site must throw, not silently disagree.
    const source = `return pipe(
      input,
      A.map((x) => (track(x), x + 1)),
      S.trim,
      A.reject((x) => x % 2 === 0),
    );`
    const originalLog: number[] = []
    let originalError: unknown
    try {
      runScalar(source, INPUT, originalLog)
    } catch (error) {
      originalError = error
    }
    expect(originalError).toBeInstanceOf(TypeError)

    const probe = probeSourceScalar(source)
    const result = transformStopcockPipelines(probe, 'trim-mid.ts', { diagnostics: 'verbose' })
    expect(result.code, 'expected the compiler to transform this pipeline').not.toBe(probe)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].transformed).toBe(true)

    const transformedLog: number[] = []
    let transformedError: unknown
    try {
      runTransformedScalar(source, INPUT, transformedLog)
    } catch (error) {
      transformedError = error
    }
    expect(transformedError).toBeInstanceOf(TypeError)
  })

  it('an all-scalar pipe (no array step at all) compiles to straight-line code', () => {
    const source = `return pipe(5, N.inc, N.add(2), N.negate);`
    const originalValue = runScalar(source, INPUT, [])

    const probe = probeSourceScalar(source)
    const result = transformStopcockPipelines(probe, 'scalar-only.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(probe)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].transformed).toBe(true)
    expect(result.diagnostics[0].segmentKinds).toEqual(['boundary', 'boundary', 'boundary'])

    const transformedValue = runTransformedScalar(source, INPUT, [])
    expect(transformedValue).toEqual(originalValue)
    expect(transformedValue).toBe(-8)
  })
})

// --- phase 2: the option and result domains -------------------------------
//
// Option lowers to `(_ok, _v)`, Result to `(_ok, _v, _err)`: persistent
// locals mutated straight-line across every step, no loop. `pipe` here is
// `@stopcock/fp/fusion`'s (the fused tier), same as every other fixture in
// this file. `none` is the one frozen singleton the runtime ever builds
// (`packages/fp/src/option.ts`); a compiled site importing it needs the
// same aliasing dance `runTransformed` already does above.

function probeSourceOptionResult(source: string): string {
  return `import { pipe } from '@stopcock/fp/fusion'\nimport * as A from '@stopcock/fp/array'\nimport * as O from '@stopcock/fp/option'\nimport * as R from '@stopcock/fp/result'\nfunction __fixture(input, track) {\n${source}\n}\nexport { __fixture };`
}

function runOptionResult(source: string, input: unknown, log: unknown[]): unknown {
  const full = `function __fixture(input, track, pipe, A, O, R) {\n${source}\n}\nreturn __fixture(input, track, pipe, A, O, R);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'pipe', 'A', 'O', 'R', full)
  return fn(input, (x: unknown) => log.push(x), pipe, A, O, R)
}

function runTransformedOptionResult(source: string, input: unknown, log: unknown[]): unknown {
  const wrapped = probeSourceOptionResult(source)
  const result = transformStopcockPipelines(wrapped, 'fixture.ts', { diagnostics: false })
  const noneAlias = result.code.match(/import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u)?.[1]
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  const call = `${stripped}\nreturn __fixture(input, track);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(
    'input',
    'track',
    'pipe',
    'A',
    'O',
    'R',
    ...(noneAlias ? [noneAlias] : []),
    call,
  )
  return fn(input, (x: unknown) => log.push(x), pipe, A, O, R, ...(noneAlias ? [none] : []))
}

/** Runs one fixture both ways and asserts the compiler actually fused it. */
function expectCompiledMatch(name: string, source: string, input: unknown): void {
  const originalLog: unknown[] = []
  const originalValue = runOptionResult(source, input, originalLog)

  const probe = probeSourceOptionResult(source)
  const result = transformStopcockPipelines(probe, `${name}.ts`, { diagnostics: 'verbose' })
  expect(result.code, `${name}: expected the compiler to transform this pipeline`).not.toBe(probe)
  expect(result.diagnostics[0]?.transformed, `${name}: expected a compiled site`).toBe(true)

  const transformedLog: unknown[] = []
  const transformedValue = runTransformedOptionResult(source, input, transformedLog)

  expect(transformedValue, name).toEqual(originalValue)
  expect(transformedLog.length, `${name}: callback invocation count`).toBe(originalLog.length)
}

describe('phase 2: Option ops compile, agreeing with the real runtime', () => {
  it.each([
    ['map: Some', `return pipe(O.some(5), O.map((x) => (track(x), x * 2)));`],
    ['map: None', `return pipe(O.none, O.map((x) => (track(x), x * 2)));`],
    [
      'flatMap: Some -> Some',
      `return pipe(O.some(5), O.flatMap((x) => (track(x), O.some(x + 1))));`,
    ],
    ['flatMap: Some -> None', `return pipe(O.some(5), O.flatMap((x) => (track(x), O.none)));`],
    ['flatMap: None (callback not called)', `return pipe(O.none, O.flatMap((x) => (track(x), O.some(x))));`],
    ['filter: Some passes', `return pipe(O.some(4), O.filter((x) => (track(x), x % 2 === 0)));`],
    ['filter: Some fails', `return pipe(O.some(3), O.filter((x) => (track(x), x % 2 === 0)));`],
    ['filter: None (callback not called)', `return pipe(O.none, O.filter((x) => (track(x), true)));`],
    ['getOrElse: Some', `return pipe(O.some(9), O.getOrElse(() => (track(0), -1)));`],
    ['getOrElse: None calls onNone once', `return pipe(O.none, O.getOrElse(() => (track(0), -1)));`],
    ['orElse: Some unaffected', `return pipe(O.some(1), O.orElse(O.some(99)));`],
    ['orElse: None takes fallback', `return pipe(O.none, O.orElse(O.some(99)));`],
    ['orElse: None, fallback also None', `return pipe(O.none, O.orElse(O.none));`],
    [
      'match: Some branch',
      `return pipe(O.some(5), O.match({ none: () => (track(0), 'n'), some: (x) => (track(x), 'y:' + x) }));`,
    ],
    [
      'match: None branch',
      `return pipe(O.none, O.match({ none: () => (track(0), 'n'), some: (x) => (track(x), 'y:' + x) }));`,
    ],
    ['toUndefined: Some', `return pipe(O.some(5), O.toUndefined);`],
    ['toUndefined: None', `return pipe(O.none, O.toUndefined);`],
    ['toNullable: Some', `return pipe(O.some(5), O.toNullable);`],
    ['toNullable: None', `return pipe(O.none, O.toNullable);`],
    ['zip: both Some', `return pipe(O.some(1), O.zip(O.some(2)));`],
    ['zip: left None', `return pipe(O.none, O.zip(O.some(2)));`],
    ['zip: right None', `return pipe(O.some(1), O.zip(O.none));`],
    ['fromNullable: null', `return pipe(null, O.fromNullable, O.getOrElse(() => 'fallback'));`],
    [
      'fromNullable: undefined',
      `return pipe(undefined, O.fromNullable, O.getOrElse(() => 'fallback'));`,
    ],
    ['fromNullable: 0 is present', `return pipe(0, O.fromNullable, O.getOrElse(() => 'fallback'));`],
    [
      "fromNullable: '' is present",
      `return pipe('', O.fromNullable, O.getOrElse(() => 'fallback'));`,
    ],
    [
      'fromNullable: NaN is present',
      `return pipe(NaN, O.fromNullable, O.getOrElse(() => 'fallback'));`,
    ],
    [
      'fromPredicate: passes',
      `return pipe(4, O.fromPredicate((x) => x % 2 === 0), O.getOrElse(() => -1));`,
    ],
    [
      'fromPredicate: fails',
      `return pipe(3, O.fromPredicate((x) => x % 2 === 0), O.getOrElse(() => -1));`,
    ],
  ])('%s', (name, source) => {
    expectCompiledMatch(name, source, undefined)
  })

  it('tap fires exactly once and only when present (callback-order case)', () => {
    const order: string[] = []
    const source = `
      const before = O.some(5);
      const after = pipe(before, O.tap((x) => { track('tap:' + x); }), O.map((x) => (track('map:' + x), x * 2)));
      return after;
    `
    expectCompiledMatch('tap: Some fires once, before map', source, undefined)

    // The order matters, not just the count: tap must run before the
    // following map, and not at all when the option is None. `map` tracks
    // its input (5), not its output (10).
    const someLog: string[] = []
    runTransformedOptionResult(source, undefined, someLog)
    expect(someLog).toEqual(['tap:5', 'map:5'])

    const noneSource = `
      const before = O.none;
      return pipe(before, O.tap((x) => { track('tap:' + x); }), O.map((x) => (track('map:' + x), x * 2)));
    `
    const noneLog: unknown[] = []
    runTransformedOptionResult(noneSource, undefined, noneLog)
    expect(noneLog).toEqual([])
    void order
  })

  it('None results are the canonical singleton, not a fresh copy', () => {
    const source = `return pipe(5, O.fromPredicate((x) => x > 100)) === O.none;`
    const original = runOptionResult(source, undefined, [])
    expect(original).toBe(true)

    const probe = probeSourceOptionResult(source)
    const result = transformStopcockPipelines(probe, 'none-singleton.ts', { diagnostics: false })
    expect(result.code).not.toBe(probe)
    const transformed = runTransformedOptionResult(source, undefined, [])
    expect(transformed).toBe(true)
  })

  it('two separate compiled sites agree the singleton is identical', () => {
    const source = `
      const a = pipe(1, O.fromPredicate((x) => x > 100));
      const b = pipe(2, O.fromPredicate((x) => x > 100));
      return a === b;
    `
    expect(runOptionResult(source, undefined, [])).toBe(true)
    expect(runTransformedOptionResult(source, undefined, [])).toBe(true)
  })
})

describe('phase 2: Result ops compile, agreeing with the real runtime', () => {
  it.each([
    ['map: Ok', `return pipe(R.ok(5), R.map((x) => (track(x), x * 2)));`],
    ['map: Err unaffected', `return pipe(R.err('boom'), R.map((x) => (track(x), x * 2)));`],
    ['mapErr: Err', `return pipe(R.err('boom'), R.mapErr((e) => (track(e), e + '!')));`],
    ['mapErr: Ok unaffected', `return pipe(R.ok(5), R.mapErr((e) => (track(e), e + '!')));`],
    [
      'flatMap: Ok -> Ok',
      `return pipe(R.ok(5), R.flatMap((x) => (track(x), R.ok(x + 1))));`,
    ],
    [
      'flatMap: Ok -> Err',
      `return pipe(R.ok(5), R.flatMap((x) => (track(x), R.err('bad'))));`,
    ],
    [
      'flatMap: Err short-circuits (callback not called)',
      `return pipe(R.err('boom'), R.flatMap((x) => (track(x), R.ok(x))));`,
    ],
    ['getOrElse: Ok', `return pipe(R.ok(5), R.getOrElse((e) => (track(e), -1)));`],
    [
      'getOrElse: Err calls onErr with the error',
      `return pipe(R.err('boom'), R.getOrElse((e) => (track(e), -1)));`,
    ],
    [
      'match: Ok branch',
      `return pipe(R.ok(5), R.match({ err: (e) => (track(e), 'e:' + e), ok: (x) => (track(x), 'o:' + x) }));`,
    ],
    [
      'match: Err branch',
      `return pipe(R.err('boom'), R.match({ err: (e) => (track(e), 'e:' + e), ok: (x) => (track(x), 'o:' + x) }));`,
    ],
    ['toOption: Ok', `return pipe(R.ok(5), R.toOption);`],
    ['toOption: Err', `return pipe(R.err('boom'), R.toOption);`],
    [
      'fromThrowable: success',
      `return pipe(() => (track(0), 42), R.fromThrowable, R.getOrElse(() => -1));`,
    ],
    [
      'fromThrowable: throws',
      `return pipe(() => { track(0); throw new Error('bad'); }, R.fromThrowable, R.getOrElse((e) => e.message));`,
    ],
  ])('%s', (name, source) => {
    expectCompiledMatch(name, source, undefined)
  })

  it('R.map on Err returns the exact same reference (identity pin)', () => {
    const source = `
      const failure = R.err('boom');
      return pipe(failure, R.map((x) => x * 2)) === failure;
    `
    const original = runOptionResult(source, undefined, [])
    expect(original).toBe(true)

    const transformed = runTransformedOptionResult(source, undefined, [])
    expect(transformed).toBe(true)
  })

  it('R.mapErr on Ok returns the exact same reference', () => {
    const source = `
      const success = R.ok(5);
      return pipe(success, R.mapErr((e) => e + '!')) === success;
    `
    expect(runOptionResult(source, undefined, [])).toBe(true)
    expect(runTransformedOptionResult(source, undefined, [])).toBe(true)
  })

  it('R.toOption(Err) is the canonical None singleton', () => {
    const source = `return pipe(R.err('boom'), R.toOption) === O.none;`
    expect(runOptionResult(source, undefined, [])).toBe(true)
    expect(runTransformedOptionResult(source, undefined, [])).toBe(true)
  })
})

// --- phase 2: array-to-option boundary fusion -----------------------------
//
// A stream segment ending in an Option-producing array terminal
// (find/findIndex/findMap/head/last/min/max) flows straight into a
// following option segment: one fused loop, early exit, then the option
// block runs straight-line. This is the corpus's honesty check that the
// early exit actually happens: A.filter's predicate must not be called for
// elements after A.head's first match, even though A.head and O.map/
// O.getOrElse are now three separate steps in one pipe() call compiled as a
// single site.

describe('phase 2: A.filter -> A.head -> O.map -> O.getOrElse fuses as one site', () => {
  const source = `return pipe(
    input,
    A.filter((x) => (track('filter:' + x), x > 0)),
    A.head,
    O.map((x) => (track('map:' + x), x * 2)),
    O.getOrElse(() => -1),
  );`

  it('agrees with the real runtime on value (not callback count: the compiled site early-exits, the interpreted fusion tier does not fuse head at all)', () => {
    const input = [-2, -1, 5, 6, 7]
    const originalValue = runOptionResult(source, input, [])

    const probe = probeSourceOptionResult(source)
    const result = transformStopcockPipelines(probe, 'array-to-option-fusion.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).not.toBe(probe)
    expect(result.diagnostics[0]?.transformed).toBe(true)

    const transformedValue = runTransformedOptionResult(source, input, [])
    expect(transformedValue).toEqual(originalValue)
  })

  it('exits the source loop at the first match: A.filter is not called past it', () => {
    const log: string[] = []
    const value = runTransformedOptionResult(source, [-2, -1, 5, 6, 7], log)
    expect(value).toBe(10)
    // filter runs for every element up to and including the first match (5,
    // at index 2); head then breaks the loop, so 6 and 7 are never filtered
    // and O.map runs exactly once.
    expect(log).toEqual(['filter:-2', 'filter:-1', 'filter:5', 'map:5'])
  })

  it('returns the fallback when nothing matches', () => {
    const log: string[] = []
    const value = runTransformedOptionResult(source, [-2, -1, -5], log)
    expect(value).toBe(-1)
    expect(log).toEqual(['filter:-2', 'filter:-1', 'filter:-5'])
  })

  it('the compiled site reports exactly one array segment and one option segment', () => {
    const probe = probeSourceOptionResult(source)
    const result = transformStopcockPipelines(probe, 'array-to-option.ts', {
      diagnostics: 'verbose',
    })
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].transformed).toBe(true)
    expect(result.diagnostics[0].segmentKinds).toEqual(['stream', 'option'])
  })
})

// --- phase 3: the dict domain (Record/Map/Set/Object) ---------------------
//
// Record's loop is `for (const key of enumerableKeys(source))`, Map/Set are
// native `for...of`. `pipe` here is `@stopcock/fp/fusion`'s (the fused
// tier), same as every other fixture in this file.

function probeSourceDict(source: string): string {
  return `import { pipe } from '@stopcock/fp/fusion'\nimport * as Rec from '@stopcock/fp/record'\nimport * as M from '@stopcock/fp/map'\nimport * as St from '@stopcock/fp/set'\nimport * as Obj from '@stopcock/fp/object'\nfunction __fixture(input, track) {\n${source}\n}\nexport { __fixture };`
}

function runDict(source: string, input: unknown, log: unknown[]): unknown {
  const full = `function __fixture(input, track, pipe, Rec, M, St, Obj) {\n${source}\n}\nreturn __fixture(input, track, pipe, Rec, M, St, Obj);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'pipe', 'Rec', 'M', 'St', 'Obj', full)
  return fn(input, (x: unknown) => log.push(x), pipe, Rec, M, St, Obj)
}

function runTransformedDict(source: string, input: unknown, log: unknown[]): unknown {
  const wrapped = probeSourceDict(source)
  const result = transformStopcockPipelines(wrapped, 'fixture.ts', { diagnostics: false })
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gmu, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, '')
  const call = `${stripped}\nreturn __fixture(input, track);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'pipe', 'Rec', 'M', 'St', 'Obj', call)
  return fn(input, (x: unknown) => log.push(x), pipe, Rec, M, St, Obj)
}

function expectCompiledMatchDict(name: string, source: string, input: unknown): void {
  const originalLog: unknown[] = []
  const originalValue = runDict(source, input, originalLog)

  const probe = probeSourceDict(source)
  const result = transformStopcockPipelines(probe, `${name}.ts`, { diagnostics: 'verbose' })
  expect(result.code, `${name}: expected the compiler to transform this pipeline`).not.toBe(probe)
  expect(result.diagnostics[0]?.transformed, `${name}: expected a compiled site`).toBe(true)

  const transformedLog: unknown[] = []
  const transformedValue = runTransformedDict(source, input, transformedLog)

  expect(transformedValue, name).toEqual(originalValue)
  expect(transformedLog.length, `${name}: callback invocation count`).toBe(originalLog.length)
}

describe('phase 3: Record ops compile, agreeing with the real runtime', () => {
  const withSymbol = Symbol('tag')
  const record: Record<PropertyKey, number> = { b: 2, a: 1, '10': 100, '2': 20, [withSymbol]: 999 }
  Object.defineProperty(record, 'hidden', { value: -1, enumerable: false })

  it.each([
    ['map: value*key filter+map fuse as one loop', `return pipe(input, Rec.filter((v) => v > 0), Rec.map((v, k) => (track(k), v * 2)));`],
    ['filterMap: Option-shaped, not null-shaped', `return pipe(input, Rec.filterMap((v, k) => (track(k), v > 1 ? { _tag: 1, value: v * 10 } : { _tag: 0 })));`],
    ['mapKeys: rewrites the key, value untouched', `return pipe(input, Rec.mapKeys((k, v) => (track(v), String(k) + '_x')));`],
    ['partition: two records, same predicate', `return pipe(input, Rec.partition((v, k) => (track(k), v > 1)));`],
  ])('%s', (name, source) => {
    expectCompiledMatchDict(name, source, record)
  })

  it('key order: integer-like ascending, then insertion order, then symbols -- including the symbol key (reality, not the plan sketch)', () => {
    const compiled = runTransformedDict(`return pipe(input, Rec.map((v) => v));`, record, [])
    expect(Object.getOwnPropertyNames(compiled)).toEqual(['2', '10', 'b', 'a'])
    expect(Object.getOwnPropertySymbols(compiled)).toEqual([withSymbol])
    expect((compiled as Record<PropertyKey, number>)[withSymbol]).toBe(999)
  })

  it('a non-enumerable own key is excluded, matching enumerableKeys', () => {
    const compiled = runTransformedDict(`return pipe(input, Rec.map((v) => v));`, record, [])
    expect(Object.prototype.hasOwnProperty.call(compiled, 'hidden')).toBe(false)
  })

  it('an inherited (prototype-chain) key is excluded', () => {
    const base = { inherited: 1 }
    const child = Object.create(base) as Record<string, number>
    child.own = 2
    const compiled = runTransformedDict(`return pipe(input, Rec.map((v) => v));`, child, [])
    expect(compiled).toEqual({ own: 2 })
  })

  it('empty record input', () => {
    expectCompiledMatchDict('empty record', `return pipe(input, Rec.filter((v) => v > 0), Rec.map((v) => v * 2));`, {})
  })

  it('mapKeys collision is last-write-wins, matching record.ts#mapKeysImpl', () => {
    const compiled = runTransformedDict(`return pipe(input, Rec.mapKeys(() => 'same'));`, { a: 1, b: 2, c: 3 }, [])
    expect(compiled).toEqual({ same: 3 })
  })

  it('mapKeys writing __proto__ creates a safe own data property, no prototype pollution', () => {
    const compiled = runTransformedDict(`return pipe(input, Rec.mapKeys(() => '__proto__'));`, { a: 1 }, []) as Record<
      PropertyKey,
      unknown
    >
    expect(Object.getPrototypeOf(compiled)).toBe(null)
    expect(Object.prototype.hasOwnProperty.call(compiled, '__proto__')).toBe(true)
    expect(compiled.__proto__).toBe(1)
  })

  // Hybrid enumeration (`Object.keys` for strings, `getOwnPropertySymbols`
  // for symbols) trades the old single `Reflect.ownKeys` snapshot for two
  // native calls, so a stateful `ownKeys` trap now fires twice per
  // enumeration instead of once. Matches `record.ts#enumerableKeys` exactly,
  // and the runtime and compiled paths agree on the count.
  it('a stateful Proxy ownKeys trap is enumerated a fixed number of times per compiled call', () => {
    let ownKeysCalls = 0
    const target = { a: 1, b: 2 }
    const proxy = new Proxy(target, {
      ownKeys(t) {
        ownKeysCalls++
        return Reflect.ownKeys(t)
      },
    })
    const compiled = runTransformedDict(`return pipe(input, Rec.map((v) => v * 2));`, proxy, [])
    expect(compiled).toEqual({ a: 2, b: 4 })
    expect(ownKeysCalls).toBe(2)
  })

  it('dict -> array -> dict roundtrip (entries -> array ops -> fromEntries) compiles as one site', () => {
    const source = `return pipe(
      input,
      Rec.entries,
      Rec.fromEntries,
    );`
    const originalLog: number[] = []
    const originalValue = runDict(source, { a: 1, b: 2 }, originalLog)

    const probe = probeSourceDict(source)
    const result = transformStopcockPipelines(probe, 'dict-array-dict-roundtrip.ts', {
      diagnostics: 'verbose',
    })
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].transformed).toBe(true)

    const transformedValue = runTransformedDict(source, { a: 1, b: 2 }, [])
    expect(transformedValue).toEqual(originalValue)
  })
})

describe('phase 3: Map ops compile, agreeing with the real runtime', () => {
  const map = new Map([
    ['z', 1],
    ['a', 2],
    ['m', 3],
  ])

  it.each([
    ['map/filter fuse as one loop', `return [...pipe(input, M.filter((v) => v > 0), M.map((v, k) => (track(k), v * 10)))];`],
    ['filterMap: Option-shaped', `return [...pipe(input, M.filterMap((v) => v > 1 ? { _tag: 1, value: v * 100 } : { _tag: 0 }))];`],
    ['mapKeys: rewrites the key', `return [...pipe(input, M.mapKeys((k, v) => (track(v), k + '!')))];`],
    ['partition: two maps', `const [acc, rej] = pipe(input, M.partition((v) => v > 1)); return [[...acc], [...rej]];`],
    ['reduce fuses with a preceding filter', `return pipe(input, M.filter((v) => v > 0), M.reduce((acc, v, k) => (track(k), acc + v), 0));`],
  ])('%s', (name, source) => {
    expectCompiledMatchDict(name, source, map)
  })

  it('insertion order is preserved (native Map iteration, not sorted)', () => {
    const compiled = runTransformedDict(`return [...pipe(input, M.map((v) => v))];`, map, [])
    expect(compiled).toEqual([...map])
  })

  it('empty map input', () => {
    expectCompiledMatchDict('empty map', `return [...pipe(input, M.filter((v) => v > 0))];`, new Map())
  })

  it('mapKeys collision is last-write-wins (native Map.set semantics)', () => {
    const compiled = runTransformedDict(`return [...pipe(input, M.mapKeys(() => 'x'))];`, new Map([['a', 1], ['b', 2]]), [])
    expect(compiled).toEqual([['x', 2]])
  })
})

describe('phase 3: Set ops compile, agreeing with the real runtime', () => {
  const set = new Set([1, -1, 2, 3, -4])

  it.each([
    ['map/filter fuse as one loop', `return [...pipe(input, St.filter((v) => (track(v), v > 0)), St.map((v) => v * 10))];`],
    ['filterMap: Option-shaped', `return [...pipe(input, St.filterMap((v) => v % 2 === 0 ? { _tag: 1, value: v } : { _tag: 0 }))];`],
    ['flatMap expands per-element and fuses with a following filter', `return [...pipe(input, St.flatMap((v) => (track(v), [v, v * 100])), St.filter((v) => v > 0))];`],
    ['partition: two sets', `const [acc, rej] = pipe(input, St.partition((v) => v > 0)); return [[...acc], [...rej]];`],
    ['reduce fuses with a preceding map', `return pipe(input, St.map((v) => v * 2), St.reduce((acc, v) => (track(v), acc + v), 0));`],
  ])('%s', (name, source) => {
    expectCompiledMatchDict(name, source, set)
  })

  it('insertion order is preserved (native Set iteration)', () => {
    const compiled = runTransformedDict(`return [...pipe(input, St.map((v) => v))];`, set, [])
    expect(compiled).toEqual([...set])
  })

  it('empty set input', () => {
    expectCompiledMatchDict('empty set', `return [...pipe(input, St.filter((v) => v > 0))];`, new Set())
  })
})

describe('phase 3: Object pick/omit compile, agreeing with the real runtime', () => {
  const obj = { a: 1, b: 2, c: 3 }

  it.each([
    ['pick: static key array', `return pipe(input, Obj.pick(['a', 'c']));`],
    ['omit: static key array', `return pipe(input, Obj.omit(['b']));`],
    ['pick: dynamic key array still compiles (no unrolled literal, still one site)', `const keys = ['a']; return pipe(input, Obj.pick(keys));`],
    ['mapValues: value*key', `return pipe(input, Obj.mapValues((v, k) => (track(k), v * 2)));`],
  ])('%s', (name, source) => {
    expectCompiledMatchDict(name, source, obj)
  })

  it('pick skips an absent key and a non-enumerable own key', () => {
    const source = obj as Record<string, unknown>
    Object.defineProperty(source, 'hidden', { value: 99, enumerable: false })
    expectCompiledMatchDict('pick absent+non-enumerable', `return pipe(input, Obj.pick(['a', 'hidden', 'missing']));`, source)
  })

  it('pick with a statically dangerous key falls back (still compiles, no unrolled literal)', () => {
    expectCompiledMatchDict('pick dangerous key', `return pipe(input, Obj.pick(['a', '__proto__']));`, obj)
  })

  it('omit throws on an unexcluded dangerous own key, matching object.ts#define exactly (throw included)', () => {
    const dangerous: Record<string, unknown> = { a: 1 }
    Object.defineProperty(dangerous, 'constructor', {
      value: 5,
      enumerable: true,
      configurable: true,
      writable: true,
    })
    const source = `return pipe(input, Obj.omit(['a']));`

    let originalError: unknown
    try {
      runDict(source, dangerous, [])
    } catch (error) {
      originalError = error
    }
    expect(originalError).toBeInstanceOf(TypeError)

    let transformedError: unknown
    try {
      runTransformedDict(source, dangerous, [])
    } catch (error) {
      transformedError = error
    }
    expect(transformedError).toBeInstanceOf(TypeError)
  })
})

// --- phase 4: the iterable domain -------------------------------------------
//
// `Iter`'s loop is `for (const _v of _src)` (or an indexed array loop when
// the source is statically an Array). Every fixture below materializes with
// a terminal (`I.toArray`, `I.reduce`, ...) unless the fixture is
// specifically about the lazy, no-terminal, re-iterable result, which needs
// its own comparison shape (spreading a lazy Iter twice, not `toEqual`
// against a single materialization).

function probeSourceIter(source: string): string {
  return `import { pipe } from '@stopcock/fp/fusion'\nimport * as I from '@stopcock/fp/iter'\nfunction __fixture(input, track) {\n${source}\n}\nexport { __fixture };`
}

function runIter(source: string, input: unknown, log: unknown[]): unknown {
  const full = `function __fixture(input, track, pipe, I) {\n${source}\n}\nreturn __fixture(input, track, pipe, I);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'pipe', 'I', full)
  return fn(input, (x: unknown) => log.push(x), pipe, Iter)
}

function runTransformedIter(source: string, input: unknown, log: unknown[]): unknown {
  const wrapped = probeSourceIter(source)
  const result = transformStopcockPipelines(wrapped, 'fixture.ts', { diagnostics: false })
  const noneAlias = result.code.match(/import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u)?.[1]
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gmu, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, '')
  const call = `${stripped}\nreturn __fixture(input, track);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(
    'input',
    'track',
    'pipe',
    'I',
    ...(noneAlias ? [noneAlias] : []),
    call,
  )
  return fn(input, (x: unknown) => log.push(x), pipe, Iter, ...(noneAlias ? [none] : []))
}

function expectCompiledMatchIter(name: string, source: string, input: unknown): void {
  const originalLog: unknown[] = []
  const originalValue = runIter(source, input, originalLog)

  const probe = probeSourceIter(source)
  const result = transformStopcockPipelines(probe, `${name}.ts`, { diagnostics: 'verbose' })
  expect(result.code, `${name}: expected the compiler to transform this pipeline`).not.toBe(probe)
  expect(result.diagnostics[0]?.transformed, `${name}: expected a compiled site`).toBe(true)

  const transformedLog: unknown[] = []
  const transformedValue = runTransformedIter(source, input, transformedLog)

  expect(transformedValue, name).toEqual(originalValue)
  expect(transformedLog.length, `${name}: callback invocation count`).toBe(originalLog.length)
}

describe('phase 4: Iter element/terminal ops compile, agreeing with the real runtime', () => {
  const input = [5, 3, 8, 1, 9, 2, 7, 4, 6, 0]

  it.each([
    ['map', `return pipe(input, I.map((x) => (track(x), x * 2)), I.toArray);`],
    ['filter', `return pipe(input, I.filter((x) => (track(x), x % 2 === 0)), I.toArray);`],
    [
      'flatMap',
      `return pipe(input, I.flatMap((x) => (track(x), [x, x * 10])), I.toArray);`,
    ],
    ['take', `return pipe(input, I.map((x) => (track(x), x)), I.take(4), I.toArray);`],
    ['drop', `return pipe(input, I.map((x) => (track(x), x)), I.drop(3), I.toArray);`],
    [
      'takeWhile',
      `return pipe(input, I.takeWhile((x) => (track(x), x < 8)), I.toArray);`,
    ],
    [
      'dropWhile',
      `return pipe(input, I.dropWhile((x) => (track(x), x < 8)), I.toArray);`,
    ],
    [
      'scan',
      `return pipe(input, I.scan((acc, x) => (track(x), acc + x), 0), I.toArray);`,
    ],
    ['enumerate', `return pipe(input, I.enumerate, I.toArray);`],
    ['chunk', `return pipe(input, I.chunk(3), I.toArray);`],
    ['toArray', `return pipe(input, I.map((x) => (track(x), x)), I.toArray);`],
    [
      'reduce',
      `return pipe(input, I.reduce((acc, x) => (track(x), acc + x), 0));`,
    ],
    [
      'find: hit',
      `return pipe(input, I.find((x) => (track(x), x > 6)));`,
    ],
    [
      'find: miss',
      `return pipe(input, I.find((x) => (track(x), x > 99)));`,
    ],
    [
      'findOrUndefined: hit',
      `return pipe(input, I.findOrUndefined((x) => (track(x), x > 6)));`,
    ],
    ['some: hit', `return pipe(input, I.some((x) => (track(x), x > 6)));`],
    ['some: miss', `return pipe(input, I.some((x) => (track(x), x > 99)));`],
    ['every: passes', `return pipe(input, I.every((x) => (track(x), x >= 0)));`],
    ['every: fails', `return pipe(input, I.every((x) => (track(x), x > 6)));`],
    ['count', `return pipe(input, I.count);`],
    ['first: non-empty', `return pipe(input, I.first);`],
    ['first: empty', `return pipe([], I.first);`],
    ['firstOrUndefined', `return pipe(input, I.firstOrUndefined);`],
    [
      'forEach',
      `const out = []; pipe(input, I.forEach((x) => (track(x), out.push(x * 2)))); return out;`,
    ],
  ])('%s', (name, source) => {
    expectCompiledMatchIter(name, source, input)
  })
})

describe('phase 4: chunk boundary cases', () => {
  it('final partial chunk is flushed, matching the real runtime', () => {
    expectCompiledMatchIter(
      'chunk: trailing partial',
      `return pipe(input, I.chunk(3), I.toArray);`,
      [1, 2, 3, 4, 5, 6, 7],
    )
  })

  it('exact multiple leaves no partial chunk', () => {
    expectCompiledMatchIter(
      'chunk: exact multiple',
      `return pipe(input, I.chunk(3), I.toArray);`,
      [1, 2, 3, 4, 5, 6],
    )
  })

  it('empty source produces no chunks', () => {
    expectCompiledMatchIter('chunk: empty', `return pipe(input, I.chunk(3), I.toArray);`, [])
  })

  it('chunk(size) with an invalid size throws the same RangeError', () => {
    const source = `return pipe(input, I.chunk(0), I.toArray);`
    let originalError: unknown
    try {
      runIter(source, [1, 2, 3], [])
    } catch (error) {
      originalError = error
    }
    expect(originalError).toBeInstanceOf(RangeError)

    let transformedError: unknown
    try {
      runTransformedIter(source, [1, 2, 3], [])
    } catch (error) {
      transformedError = error
    }
    expect(transformedError).toBeInstanceOf(RangeError)
  })

  it('chunk followed by take early-exits with the same value (bounded, documented one-element over-read)', () => {
    // take's own exhaustion guard is hoisted to the front of the loop, so it
    // stops the fused loop from doing any further work -- but the
    // `for...of` has already pulled one raw source element to reach that
    // check at all, one more than a hand-chained lazy generator would. See
    // the comment on `emitIterSegment` in fp-compiler's codegen.ts. Bounded,
    // not unbounded: an infinite source still terminates.
    expectCompiledMatchIter(
      'chunk + take',
      `return pipe(input, I.chunk(3), I.take(2), I.toArray);`,
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    )
  })
})

describe('phase 4: take/drop edge cases and infinite sources', () => {
  it('take(0) never evaluates the upstream iterable', () => {
    let reads = 0
    function* countingSource() {
      while (true) {
        reads++
        yield reads
      }
    }
    const value = runTransformedIter(
      `return pipe(input, I.map((x) => x * 2), I.take(0), I.toArray);`,
      countingSource(),
      [],
    )
    expect(value).toEqual([])
    expect(reads).toBe(0)
  })

  it('take(N) on an infinite source terminates and matches the real runtime', () => {
    function* naturals() {
      let n = 0
      while (true) yield n++
    }
    const source = `return pipe(input, I.map((x) => x * 2), I.take(5), I.toArray);`
    const original = runIter(source, naturals(), [])
    const transformed = runTransformedIter(source, naturals(), [])
    expect(transformed).toEqual(original)
    expect(transformed).toEqual([0, 2, 4, 6, 8])
  })

  it('drop(N) beyond the source length yields empty, matching the real runtime', () => {
    expectCompiledMatchIter('drop past end', `return pipe(input, I.drop(100), I.toArray);`, [
      1, 2, 3,
    ])
  })

  it('take/drop with a negative or NaN count clamp to 0, matching iter.ts#natural', () => {
    expectCompiledMatchIter(
      'take negative',
      `return pipe(input, I.take(-3), I.toArray);`,
      [1, 2, 3],
    )
    expectCompiledMatchIter('drop NaN', `return pipe(input, I.drop(NaN), I.toArray);`, [1, 2, 3])
  })

  it('dropWhile/takeWhile edge transitions: predicate false immediately, true throughout, and mid-stream', () => {
    expectCompiledMatchIter(
      'dropWhile: never drops',
      `return pipe(input, I.dropWhile((x) => x > 100), I.toArray);`,
      [1, 2, 3],
    )
    expectCompiledMatchIter(
      'dropWhile: drops everything',
      `return pipe(input, I.dropWhile((x) => x < 100), I.toArray);`,
      [1, 2, 3],
    )
    expectCompiledMatchIter(
      'takeWhile: stops immediately',
      `return pipe(input, I.takeWhile((x) => x > 100), I.toArray);`,
      [1, 2, 3],
    )
    expectCompiledMatchIter(
      'takeWhile: takes everything',
      `return pipe(input, I.takeWhile((x) => x < 100), I.toArray);`,
      [1, 2, 3],
    )
    expectCompiledMatchIter(
      'dropWhile -> takeWhile mid-stream transition',
      `return pipe(input, I.dropWhile((x) => x < 5), I.takeWhile((x) => x < 20), I.toArray);`,
      [1, 2, 3, 10, 4, 5, 20, 6],
    )
  })
})

describe('phase 4: the lazy, no-terminal result is re-iterable exactly like iter.ts', () => {
  it('re-iterating over a re-iterable (Array) source re-runs it, matching the real runtime twice', () => {
    const source = `return pipe(input, I.map((x) => x + 1), I.filter((x) => x % 2 === 0));`
    const nativeIter = runIter(source, [1, 2, 3, 4], []) as Iterable<number>
    const nativeFirst = [...nativeIter]
    const nativeSecond = [...nativeIter]

    const compiledIter = runTransformedIter(source, [1, 2, 3, 4], []) as Iterable<number>
    const compiledFirst = [...compiledIter]
    const compiledSecond = [...compiledIter]

    expect(compiledFirst).toEqual(nativeFirst)
    expect(compiledSecond).toEqual(nativeSecond)
    expect(compiledFirst.length).toBeGreaterThan(0)
  })

  it('a one-shot generator source is consumed exactly once: the second pass is empty, matching the real runtime', () => {
    function* onceEach() {
      yield 1
      yield 2
      yield 3
    }
    const source = `return pipe(input, I.map((x) => x * 10));`

    const nativeIter = runIter(source, onceEach(), []) as Iterable<number>
    const nativeFirst = [...nativeIter]
    const nativeSecond = [...nativeIter]
    expect(nativeFirst).toEqual([10, 20, 30])
    expect(nativeSecond).toEqual([])

    const compiledIter = runTransformedIter(source, onceEach(), []) as Iterable<number>
    const compiledFirst = [...compiledIter]
    const compiledSecond = [...compiledIter]
    expect(compiledFirst).toEqual(nativeFirst)
    expect(compiledSecond).toEqual(nativeSecond)
  })
})

describe('phase 4: 3+ op chains, with a terminal and without', () => {
  it('a 4-op chain with a terminal compiles as one site and agrees with the real runtime', () => {
    expectCompiledMatchIter(
      'map -> filter -> take -> toArray',
      `return pipe(
        input,
        I.map((x) => (track('map:' + x), x * 2)),
        I.filter((x) => (track('filter:' + x), x % 4 === 0)),
        I.take(2),
        I.toArray,
      );`,
      [1, 2, 3, 4, 5, 6, 7, 8],
    )
  })

  it('a 3-op chain with no terminal compiles as one site and agrees with the real runtime', () => {
    const source = `return pipe(
      input,
      I.map((x) => x + 1),
      I.filter((x) => x % 2 === 0),
      I.take(3),
    );`
    const original = runIter(source, [1, 2, 3, 4, 5, 6, 7, 8], []) as Iterable<number>
    const transformed = runTransformedIter(source, [1, 2, 3, 4, 5, 6, 7, 8], []) as Iterable<number>
    expect([...transformed]).toEqual([...original])
  })
})

function probeSourceIterOption(source: string): string {
  return `import { pipe } from '@stopcock/fp/fusion'\nimport * as I from '@stopcock/fp/iter'\nimport * as O from '@stopcock/fp/option'\nfunction __fixture(input, track) {\n${source}\n}\nexport { __fixture };`
}

function runIterOption(source: string, input: unknown, log: unknown[]): unknown {
  const full = `function __fixture(input, track, pipe, I, O) {\n${source}\n}\nreturn __fixture(input, track, pipe, I, O);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'pipe', 'I', 'O', full)
  return fn(input, (x: unknown) => log.push(x), pipe, Iter, O)
}

function runTransformedIterOption(source: string, input: unknown, log: unknown[]): unknown {
  const wrapped = probeSourceIterOption(source)
  const result = transformStopcockPipelines(wrapped, 'fixture.ts', { diagnostics: false })
  const noneAlias = result.code.match(/import\s*\{\s*none\s+as\s+([A-Za-z_$][\w$]*)\s*\}/u)?.[1]
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gmu, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gmu, '')
  const call = `${stripped}\nreturn __fixture(input, track);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function(
    'input',
    'track',
    'pipe',
    'I',
    'O',
    ...(noneAlias ? [noneAlias] : []),
    call,
  )
  return fn(input, (x: unknown) => log.push(x), pipe, Iter, O, ...(noneAlias ? [none] : []))
}

describe('phase 4: Iter terminal -> Option boundary fusion', () => {
  const source = `return pipe(
    input,
    I.filter((x) => (track('filter:' + x), x > 0)),
    I.find((x) => (track('find:' + x), x > 4)),
    O.map((x) => (track('map:' + x), x * 2)),
    O.getOrElse(() => -1),
  );`

  it('fuses as one site (iterable segment then option segment) and agrees on value', () => {
    const input = [-2, -1, 5, 6, 7]
    const originalValue = runIterOption(source, input, [])

    const probe = probeSourceIterOption(source)
    const result = transformStopcockPipelines(probe, 'iter-to-option.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(probe)
    expect(result.diagnostics[0]?.transformed).toBe(true)
    expect(result.diagnostics[0]?.segmentKinds).toEqual(['iterable', 'option'])

    const transformedValue = runTransformedIterOption(source, input, [])
    expect(transformedValue).toEqual(originalValue)
    expect(transformedValue).toBe(10)
  })

  it('the source loop exits at the first match: filter is not called past it', () => {
    // 5 is the first element to pass both filter (>0) and find (>4), so the
    // search stops there -- 6 and 7 are never read.
    const nativeLog: string[] = []
    runIterOption(source, [-2, -1, 5, 6, 7], nativeLog)

    const log: string[] = []
    runTransformedIterOption(source, [-2, -1, 5, 6, 7], log)
    expect(log).toEqual(nativeLog)
    expect(log).toEqual(['filter:-2', 'filter:-1', 'filter:5', 'find:5', 'map:5'])
  })

  it('returns the fallback when nothing matches', () => {
    const value = runTransformedIterOption(source, [-2, -1, -5], [])
    expect(value).toBe(-1)
  })
})

describe('phase 4: zip/zipWith are multi-source and bail', () => {
  it('I.zip bails with reason code multi-source', () => {
    const source = probeSourceIter(
      `return pipe(input, I.zip(other), I.toArray);`,
    ).replace('function __fixture(input, track)', 'function __fixture(input, track, other)')
    const result = transformStopcockPipelines(source, 'zip-bail.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0]?.transformed).toBe(false)
    expect(result.diagnostics[0]?.reasonCodes).toContain('multi-source')
    expect(result.diagnostics[0]?.reason).toContain('multi-source')
  })

  it('I.zipWith bails with reason code multi-source', () => {
    const source = probeSourceIter(
      `return pipe(input, I.zipWith(other, (a, b) => a + b), I.toArray);`,
    ).replace('function __fixture(input, track)', 'function __fixture(input, track, other)')
    const result = transformStopcockPipelines(source, 'zipwith-bail.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0]?.transformed).toBe(false)
    expect(result.diagnostics[0]?.reasonCodes).toContain('multi-source')
  })
})

describe('phase 4: an async callback is out of scope and bails', () => {
  it('I.map with an async callback does not compile', () => {
    const source = probeSourceIter(`return pipe(input, I.map(async (x) => x), I.toArray);`)
    const result = transformStopcockPipelines(source, 'async-bail.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0]?.transformed).toBe(false)
    expect(result.diagnostics[0]?.reason).toContain('async')
  })
})
