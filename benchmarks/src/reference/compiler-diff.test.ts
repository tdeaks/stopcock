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
      expect(transformedLog.length).toBe(originalLog.length)
      expect(emittedLog.length).toBe(originalLog.length)
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
// `@stopcock/fp/fusion`'s compact engine (`interpret.ts#runScalarSegment`)
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
