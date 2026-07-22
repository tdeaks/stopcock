import { describe, expect, it } from 'vitest'
import { transformStopcockPipelines } from '../transform'
import { type Fixture, runFixture } from './harness'

const STD_IMPORTS = `import { pipe, A } from '@stopcock/fp'`

function expectSame(name: string, fixture: Fixture, makeExtra?: () => Record<string, unknown>) {
  it(name, () => {
    const result = runFixture(fixture, makeExtra)
    expect(result.transformed).toBe(fixture.expectTransformed)
    if (fixture.reasonIncludes) {
      expect(result.reason).toContain(fixture.reasonIncludes)
    }
    if (result.original.error) {
      expect(result.compiled.error).toBeDefined()
      expect((result.compiled.error as Error).message).toBe((result.original.error as Error).message)
    } else {
      expect(result.compiled.error).toBeUndefined()
      expect(result.compiled.value).toEqual(result.original.value)
    }
  })
}

describe('transformStopcockPipelines: semantic fixture corpus', () => {
  expectSame('map', {
    name: 'map',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3], A.map((x) => x * 2));`,
    expectTransformed: true,
  })

  expectSame('filter', {
    name: 'filter',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4, 5], A.filter((x) => x % 2 === 0));`,
    expectTransformed: true,
  })

  expectSame('reject', {
    name: 'reject',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4, 5], A.reject((x) => x % 2 === 0));`,
    expectTransformed: true,
  })

  expectSame('filterMap drops nullish', {
    name: 'filterMap',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.filterMap((x) => (x % 2 === 0 ? x * 10 : null)));`,
    expectTransformed: true,
  })

  expectSame('take', {
    name: 'take',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4, 5], A.take(2));`,
    expectTransformed: true,
  })

  expectSame('drop', {
    name: 'drop',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4, 5], A.drop(2));`,
    expectTransformed: true,
  })

  expectSame('takeWhile', {
    name: 'takeWhile',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 10, 1], A.takeWhile((x) => x < 5));`,
    expectTransformed: true,
  })

  expectSame('dropWhile', {
    name: 'dropWhile',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 10, 1], A.dropWhile((x) => x < 5));`,
    expectTransformed: true,
  })

  expectSame('sum', {
    name: 'sum',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.sum);`,
    expectTransformed: true,
  })

  it('count() with no predicate is left unchanged (matches runtime: requires a predicate)', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const out = pipe([1, 2, 3, 4], A.count());
    `
    const result = transformStopcockPipelines(source, 'count-no-pred.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
  })

  expectSame('count with predicate', {
    name: 'count-pred',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.count((x) => x % 2 === 0));`,
    expectTransformed: true,
  })

  expectSame('reduce', {
    name: 'reduce',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.reduce((acc, x) => acc + x, 0));`,
    expectTransformed: true,
  })

  expectSame(
    'forEach records side effects',
    {
      name: 'forEach',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `pipe([1, 2, 3], A.forEach((x) => log.push(x))); return log;`,
      expectTransformed: true,
    },
    () => ({ log: [] }),
  )

  expectSame('find', {
    name: 'find',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.find((x) => x > 2));`,
    expectTransformed: true,
  })

  expectSame('every true', {
    name: 'every-true',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([2, 4, 6], A.every((x) => x % 2 === 0));`,
    expectTransformed: true,
  })

  expectSame(
    'every false stops early',
    {
      name: 'every-false',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `return pipe([2, 3, 4], A.every((x) => { log.push(x); return x % 2 === 0; }));`,
      expectTransformed: true,
    },
    () => ({ log: [] }),
  )

  expectSame('some true stops early', {
    name: 'some-true',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 3, 4, 5], A.some((x) => x % 2 === 0));`,
    expectTransformed: true,
  })

  expectSame('some false', {
    name: 'some-false',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 3, 5], A.some((x) => x % 2 === 0));`,
    expectTransformed: true,
  })

  expectSame('findIndex (found, returns the index not the value)', {
    name: 'findIndex-found',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([10, 20, 30, 40], A.findIndex((x) => x === 30));`,
    expectTransformed: true,
  })

  expectSame('findIndex (not found, returns undefined not -1)', {
    name: 'findIndex-not-found',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([10, 20, 30], A.findIndex((x) => x > 100));`,
    expectTransformed: true,
  })

  expectSame('findIndex counts position within a filtered upstream, not the original array', {
    name: 'findIndex-post-filter',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4, 5, 6, 7, 8], A.filter((x) => x % 2 === 0), A.findIndex((x) => x === 6));`,
    expectTransformed: true,
  })

  expectSame('findMap', {
    name: 'findMap',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.findMap((x) => (x % 2 === 0 ? x * 10 : undefined)));`,
    expectTransformed: true,
  })

  expectSame('none true (no element matches)', {
    name: 'none-true',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 3, 5], A.none((x) => x % 2 === 0));`,
    expectTransformed: true,
  })

  expectSame('none false stops early', {
    name: 'none-false',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 3, 4, 5], A.none((x) => { log.push(x); return x % 2 === 0; }));`,
    expectTransformed: true,
  }, () => ({ log: [] }))

  expectSame('flatMap', {
    name: 'flatMap',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3], A.flatMap((x) => [x, x * 10]));`,
    expectTransformed: true,
  })

  expectSame('flatMap -> filter -> take (break exits both loops)', {
    name: 'flatMap-filter-take',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.flatMap((x) => [x, x + 1, x + 2]), A.filter((x) => x % 2 === 0), A.take(2));`,
    expectTransformed: true,
  })

  expectSame('sort boundary', {
    name: 'sort-boundary',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([5, 3, 8, 1], A.map((x) => x), A.sort);`,
    expectTransformed: true,
  })

  expectSame('sortBy boundary', {
    name: 'sortBy-boundary',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([5, 3, 8, 1], A.sortBy((a, b) => b - a));`,
    expectTransformed: true,
  })

  expectSame('sortAsc boundary', {
    name: 'sortAsc-boundary',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([5, 3, 8, 1, -2], A.sortAsc);`,
    expectTransformed: true,
  })

  expectSame('sortDesc boundary', {
    name: 'sortDesc-boundary',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([5, 3, 8, 1, -2], A.sortDesc);`,
    expectTransformed: true,
  })

  expectSame('reverse boundary', {
    name: 'reverse-boundary',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3], A.reverse);`,
    expectTransformed: true,
  })

  expectSame('uniq boundary', {
    name: 'uniq-boundary',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 2, 3, 1, 4], A.uniq);`,
    expectTransformed: true,
  })

  expectSame('boundary mid-pipeline: filter -> sort -> take', {
    name: 'boundary-mid',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([5, 3, 8, 1, 9, 2, 7], A.filter((x) => x % 2 === 1), A.sort, A.take(2));`,
    expectTransformed: true,
  })

  expectSame('compile() with 2 steps fuses into a runner', {
    name: 'compile-2-steps',
    imports: `import { pipe, A, compile, flow } from '@stopcock/fp'`,
    locals: { pipe: 'pipe', A: 'A', compile: 'compile', flow: 'flow' },
    body: `
      const run = compile(A.map((x) => x * 2), A.filter((x) => x > 4));
      return run([1, 2, 3, 4]);
    `,
    expectTransformed: true,
  })

  expectSame('compile() runner works over a non-array iterable via toArrayInput coercion', {
    name: 'compile-iterable-input',
    imports: `import { pipe, A, compile, flow } from '@stopcock/fp'`,
    locals: { pipe: 'pipe', A: 'A', compile: 'compile', flow: 'flow' },
    body: `
      const run = compile(A.map((x) => x * 2), A.sum);
      function* gen() { yield 1; yield 2; yield 3; }
      return run(gen());
    `,
    expectTransformed: true,
  })

  expectSame('flow() with 3 steps fuses into a runner', {
    name: 'flow-3-steps',
    imports: `import { pipe, A, compile, flow } from '@stopcock/fp'`,
    locals: { pipe: 'pipe', A: 'A', compile: 'compile', flow: 'flow' },
    body: `
      const run = flow(A.map((x) => x + 1), A.filter((x) => x % 2 === 0), A.reduce((acc, x) => acc + x, 0));
      return run([1, 2, 3, 4, 5]);
    `,
    expectTransformed: true,
  })

  expectSame('map + filter + sum', {
    name: 'combined-1',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4, 5], A.map((x) => x * 2), A.filter((x) => x > 4), A.sum);`,
    expectTransformed: true,
  })

  expectSame('filter + take', {
    name: 'combined-2',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4, 5, 6], A.filter((x) => x % 2 === 0), A.take(2));`,
    expectTransformed: true,
  })

  expectSame('non-inlinable block-body arrow still transforms', {
    name: 'block-body',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3], A.map((x) => { const y = x * 2; return y + 1; }));`,
    expectTransformed: true,
  })

  expectSame('this-using function callback still transforms (hoisted call)', {
    name: 'this-callback',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const ctx = { factor: 3, apply: function (x) { return x * this.factor; } };
      return pipe([1, 2, 3], A.map(ctx.apply.bind(ctx)));
    `,
    expectTransformed: true,
  })

  expectSame('destructured-param arrow still transforms (hoisted call)', {
    name: 'destructure-param',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([{ x: 1 }, { x: 2 }], A.map(({ x }) => x * 10));`,
    expectTransformed: true,
  })

  expectSame('hoisted named callback reference', {
    name: 'hoisted-callback',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const double = (x) => x * 2;
      return pipe([1, 2, 3], A.map(double));
    `,
    expectTransformed: true,
  })

  expectSame(
    'closure mutating outer variable',
    {
      name: 'closure-mutation',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        let total = 0;
        const out = pipe([1, 2, 3], A.map((x) => { total += x; return total; }));
        return { out, total };
      `,
      expectTransformed: true,
    },
  )

  expectSame(
    'take(n) evaluates bound expression exactly once',
    {
      name: 'take-side-effect',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        function n() { log.push('n'); return 2; }
        const out = pipe([1, 2, 3, 4], A.take(n()));
        return { out, log };
      `,
      expectTransformed: true,
    },
    () => ({ log: [] }),
  )

  expectSame(
    'drop(n) evaluates bound expression exactly once',
    {
      name: 'drop-side-effect',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        function n() { log.push('n'); return 1; }
        const out = pipe([1, 2, 3, 4], A.drop(n()));
        return { out, log };
      `,
      expectTransformed: true,
    },
    () => ({ log: [] }),
  )

  expectSame(
    'exception mid-pipeline propagates with same partial side effects',
    {
      name: 'exception-mid',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        return pipe(
          [1, 2, 3, 4],
          A.map((x) => { log.push(x); if (x === 3) throw new Error('boom at ' + x); return x; }),
        );
      `,
      expectTransformed: true,
    },
    () => ({ log: [] }),
  )

  expectSame('aliased pipe and namespace imports', {
    name: 'aliased-imports',
    imports: `import { pipe as p, A as Arr } from '@stopcock/fp'`,
    locals: { p: 'pipe', Arr: 'A' },
    body: `return p([1, 2, 3], Arr.map((x) => x + 1));`,
    expectTransformed: true,
  })

  expectSame('namespace import', {
    name: 'namespace-import',
    imports: `import * as FP from '@stopcock/fp'`,
    locals: { FP: 'FP' },
    body: `return FP.pipe([1, 2, 3], FP.A.map((x) => x + 1));`,
    expectTransformed: true,
  })

  it('non-stopcock pipe import is not transformed', () => {
    const source = `
      import { pipe } from 'some-other-lib'
      const out = pipe([1, 2, 3], A.map((x) => x * 2));
    `
    const result = transformStopcockPipelines(source, 'other-lib.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics).toEqual([])
  })

  it('spread steps are left unchanged', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const steps = [A.map((x) => x * 2)];
      const out = pipe([1, 2, 3], ...steps);
    `
    const result = transformStopcockPipelines(source, 'spread.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('spread')
  })

  it('dynamic (non-namespace-call) step is left unchanged', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      function getStep() { return A.map((x) => x * 2); }
      const out = pipe([1, 2, 3], getStep());
    `
    const result = transformStopcockPipelines(source, 'dynamic.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unrecognized step')
  })

  it('compile() is left untransformed and noted as deferred', () => {
    const source = `
      import { compile, A } from '@stopcock/fp'
      const run = compile(A.map((x) => x * 2));
    `
    const result = transformStopcockPipelines(source, 'compile.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].reason).toContain('deferred')
  })

  it('flow() is left untransformed and noted as deferred', () => {
    const source = `
      import { flow, A } from '@stopcock/fp'
      const run = flow(A.map((x) => x * 2));
    `
    const result = transformStopcockPipelines(source, 'flow.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].reason).toContain('deferred')
  })

  it('scan is left unchanged (registered in the registry, but not a fuseable op this wave)', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const out = pipe([1, 2, 3], A.scan((acc, x) => acc + x, 0));
    `
    const result = transformStopcockPipelines(source, 'scan.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unsupported op: scan')
  })

  it('without is left unchanged (registered in the registry, but not a fuseable op this wave)', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const out = pipe([1, 2, 3], A.without(2));
    `
    const result = transformStopcockPipelines(source, 'without.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unsupported op: without')
  })

  it('toArray (synthetic sink, no real op) is left unchanged', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const out = pipe([1, 2, 3], A.map((x) => x), A.toArray());
    `
    const result = transformStopcockPipelines(source, 'toarray.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unknown op: toArray')
  })

  it('compile() with a single step is left untransformed (single-step semantics diverge from flow())', () => {
    const source = `
      import { compile, A } from '@stopcock/fp'
      const run = compile(A.map((x) => x * 2));
      const out = run([1, 2, 3]);
    `
    const result = transformStopcockPipelines(source, 'compile-single.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('deferred')
  })

  it('flow() containing an unsupported op (scan) stays deferred, not partially transformed', () => {
    const source = `
      import { flow, A } from '@stopcock/fp'
      const run = flow(A.map((x) => x * 2), A.scan((acc, x) => acc + x, 0));
      const out = run([1, 2, 3]);
    `
    const result = transformStopcockPipelines(source, 'flow-scan.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('deferred')
  })

  it('compile() with spread arguments stays deferred', () => {
    const source = `
      import { compile, A } from '@stopcock/fp'
      const steps = [A.map((x) => x * 2), A.filter((x) => x > 0)];
      const run = compile(...steps);
      const out = run([1, 2, 3]);
    `
    const result = transformStopcockPipelines(source, 'compile-spread.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('spread')
  })

  it('findIndex() invoked with too many args is left unchanged', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const out = pipe([1, 2, 3], A.findIndex((x) => x > 1, 2));
    `
    const result = transformStopcockPipelines(source, 'findindex-arity.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unexpected arg count')
  })

  expectSame('empty input array', {
    name: 'empty-input',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([], A.map((x) => x * 2), A.filter((x) => x > 0), A.sum);`,
    expectTransformed: true,
  })

  expectSame('large input', {
    name: 'large-input',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const data = Array.from({ length: 10000 }, (_, i) => i);
      return pipe(data, A.map((x) => x * 2), A.filter((x) => x % 3 === 0), A.sum);
    `,
    expectTransformed: true,
  })

  it('A.sum() invoked is left unchanged (matches runtime: bare-only op, invoking it throws)', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const out = pipe([1, 2, 3], A.sum());
    `
    const result = transformStopcockPipelines(source, 'sum-invoked.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('must be used bare')
  })

  expectSame('reduce with non-arrow function callback', {
    name: 'reduce-function-callback',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.reduce(function (acc, x) { return acc + x * x; }, 0));`,
    expectTransformed: true,
  })

  it('multiple independent pipe calls in one file are each recorded', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const a = pipe([1, 2], A.map((x) => x + 1));
      const b = pipe([3, 4], A.sum);
    `
    const result = transformStopcockPipelines(source, 'multi.ts', { diagnostics: 'verbose' })
    expect(result.diagnostics.filter((d) => d.transformed)).toHaveLength(2)
  })
})

describe('transformStopcockPipelines: diagnostics', () => {
  it('diagnostics: false returns no diagnostics', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const out = pipe([1, 2, 3], A.map((x) => x * 2));
    `
    const result = transformStopcockPipelines(source, 'diag-false.ts', { diagnostics: false })
    expect(result.diagnostics).toEqual([])
  })

  it('diagnostics: "error" throws on a skipped recognized pipeline', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const out = pipe([1, 2, 3], ...[A.map((x) => x * 2)]);
    `
    expect(() => transformStopcockPipelines(source, 'diag-error.ts', { diagnostics: 'error' })).toThrow()
  })
})

describe('transformStopcockPipelines: source maps', () => {
  it('generates a map pointing back at the original source for a transformed site', () => {
    const source = `import { pipe, A } from '@stopcock/fp'
const out = pipe([1, 2, 3], A.map((x) => x * 2), A.sum);`
    const result = transformStopcockPipelines(source, 'sourcemap.ts', { diagnostics: 'summary' })
    expect(result.map).toBeTruthy()
    expect(result.map!.mappings.length).toBeGreaterThan(0)
    const original = JSON.parse(result.map!.toString()).sourcesContent[0]
    expect(original).toBe(source)
  })
})
