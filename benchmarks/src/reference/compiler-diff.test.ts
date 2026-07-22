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
import { pipe } from '../../../packages/fp/src/pipe'
import { compile } from '../../../packages/fp/src/compile'
import { flow } from '../../../packages/fp/src/flow'
import * as A from '../../../packages/fp/src/array'
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
}

function probeSource(source: string): string {
  return `import { pipe, A } from '@stopcock/fp'\nfunction __fixture(input, track) {\n${source}\n}\nexport { __fixture };`
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
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  const call = `${stripped}\nreturn __fixture(input, track);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'pipe', 'A', call)
  return fn(input.slice(), (x: number) => log.push(x), pipe, A)
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
      expect(result.code, `${fixture.name}: expected the compiler to transform this pipeline`).not.toBe(probe)
      const transformedValue = runTransformed(fixture.source, input, transformedLog)

      const emittedLog: number[] = []
      const trackedIndex = fixture.trackedStepIndex ?? 0
      const trackedBindings = fixture.bindings.map((b, i) => {
        if (i !== trackedIndex || typeof b.fn !== 'function') return b
        const raw = b.fn as (...args: unknown[]) => unknown
        return { ...b, fn: (...args: unknown[]) => (emittedLog.push(args[args.length - 1] as number), raw(...args)) }
      })
      const emittedValue = compileEmittedPipeline(fixture.desc)(input.slice(), trackedBindings)

      expect(transformedValue).toEqual(originalValue)
      expect(emittedValue).toEqual(originalValue)
      expect(transformedLog.length).toBe(originalLog.length)
      expect(emittedLog.length).toBe(originalLog.length)
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
    source: `return pipe(
      input,
      A.flatMap((x) => (track(x), [x, x + 1, x + 2])),
      A.filter((x) => x % 2 === 0),
      A.take(5),
    );`,
    desc: { steps: [{ kind: 'flatMap' }, { kind: 'filter' }, { kind: 'take' }] },
    bindings: [{ fn: (x: number) => [x, x + 1, x + 2] }, { fn: (x: number) => x % 2 === 0 }, { fn: 5 }],
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
      expect(result.code, `${fixture.name}: expected the compiler to transform this pipeline`).not.toBe(probe)
      const transformedValue = runTransformed(fixture.source, input, transformedLog)

      const emittedLog: number[] = []
      const trackedIndex = fixture.trackedStepIndex ?? 0
      const trackedBindings = fixture.bindings.map((b, i) => {
        if (i !== trackedIndex || typeof b.fn !== 'function') return b
        const raw = b.fn as (...args: unknown[]) => unknown
        return { ...b, fn: (...args: unknown[]) => (emittedLog.push(args[args.length - 1] as number), raw(...args)) }
      })
      const emittedValue = compileEmittedPipeline(fixture.desc)(input.slice(), trackedBindings)

      expect(transformedValue).toEqual(originalValue)
      expect(emittedValue).toEqual(originalValue)
      expect(transformedLog.length).toBe(originalLog.length)
      expect(emittedLog.length).toBe(originalLog.length)
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
  return `import { compile, flow, A } from '@stopcock/fp'\nfunction __fixture(input, track) {\n${source}\n}\nexport { __fixture };`
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
  const stripped = result.code
    .replace(/^\s*import\s+.*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '')
  const call = `${stripped}\nreturn __fixture(input, track);`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('input', 'track', 'compile', 'flow', 'A', call)
  return fn(input.slice(), (x: number) => log.push(x), compile, flow, A)
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
      expect(result.code, `${fixture.name}: expected the compiler to transform this flow()/compile() call`).not.toBe(probe)
      const transformedValue = runTransformedDeferred(fixture.source, input, transformedLog)

      const emittedLog: number[] = []
      const trackedIndex = fixture.trackedStepIndex ?? 0
      const trackedBindings = fixture.bindings.map((b, i) => {
        if (i !== trackedIndex || typeof b.fn !== 'function') return b
        const raw = b.fn as (...args: unknown[]) => unknown
        return { ...b, fn: (...args: unknown[]) => (emittedLog.push(args[args.length - 1] as number), raw(...args)) }
      })
      // compileEmittedPipeline models one call of the pipeline; the "reused
      // runner" fixture calls run(input) twice, so run the emitted pipeline
      // twice too and shape the result the same way the source does.
      const runEmitted = () => compileEmittedPipeline(fixture.desc)(input.slice(), trackedBindings)
      const emittedValue = fixture.name.includes('reused') ? [runEmitted(), runEmitted()] : runEmitted()

      expect(transformedValue).toEqual(originalValue)
      expect(emittedValue).toEqual(originalValue)
      expect(transformedLog.length).toBe(originalLog.length)
      expect(emittedLog.length).toBe(originalLog.length)
    })
  }
})

// --- diagnose cases: grammar members that must be left untransformed ---

describe('W6: unsupported/unregistered ops diagnose cleanly (no transform)', () => {
  it('scan is diagnosed, not transformed (registered in the registry, but not fuseable this wave)', () => {
    const source = probeSource(`return pipe(input, A.scan((acc, x) => acc + x, 0));`)
    const result = transformStopcockPipelines(source, 'scan.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unsupported op: scan')
  })

  it('without is diagnosed, not transformed (registered in the registry, but not fuseable this wave)', () => {
    const source = probeSource(`return pipe(input, A.without(1, 2));`)
    const result = transformStopcockPipelines(source, 'without.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unsupported op: without')
  })

  it('toArray (not a real op) is diagnosed, not transformed', () => {
    const source = probeSource(`return pipe(input, A.map((x) => x), A.toArray());`)
    const result = transformStopcockPipelines(source, 'toarray.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unknown op: toArray')
  })

  it('compile() with a single step is diagnosed, not transformed (single-step semantics diverge from flow())', () => {
    const source = probeSourceDeferred(`const run = compile(A.map((x) => x * 2)); return run(input);`)
    const result = transformStopcockPipelines(source, 'compile-single.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('deferred')
  })

  it('flow() containing an unsupported op stays deferred', () => {
    const source = probeSourceDeferred(
      `const run = flow(A.map((x) => x * 2), A.scan((acc, x) => acc + x, 0)); return run(input);`,
    )
    const result = transformStopcockPipelines(source, 'flow-scan.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('deferred')
  })
})
