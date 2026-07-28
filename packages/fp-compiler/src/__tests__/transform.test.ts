import { describe, expect, it } from 'vitest'
import { parse } from '@babel/parser'
import { none } from '@stopcock/fp'
import { transformStopcockPipelines } from '../transform'
import { type Fixture, runFixture } from './harness'

const STD_IMPORTS = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'`

function expectSame(name: string, fixture: Fixture, makeExtra?: () => Record<string, unknown>) {
  it(name, () => {
    const result = runFixture(fixture, makeExtra)
    expect(result.transformed).toBe(fixture.expectTransformed)
    if (fixture.reasonIncludes) {
      expect(result.reason).toContain(fixture.reasonIncludes)
    }
    if (result.original.error) {
      expect(result.compiled.error).toBeDefined()
      expect((result.compiled.error as Error).message).toBe(
        (result.original.error as Error).message,
      )
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

  expectSame('map preserves reassignment of its callback parameter', {
    name: 'map-parameter-assignment',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2], A.map((x) => (x += 1)));`,
    expectTransformed: true,
  })

  expectSame('some preserves update of its callback parameter', {
    name: 'some-parameter-update',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2], A.some((x) => ++x > 2));`,
    expectTransformed: true,
  })

  expectSame('tail substitution preserves a bare callback-parameter receiver', {
    name: 'some-parameter-call-receiver',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const f = function () { 'use strict'; return this === undefined };
      return pipe([f], A.some((x) => x()));
    `,
    expectTransformed: true,
  })

  expectSame('reduce preserves reassignment of both callback parameters', {
    name: 'reduce-parameter-assignment',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3], A.reduce((acc, x) => ((acc += x), (x += 10), acc), 0));`,
    expectTransformed: true,
  })

  it('preallocates a single map and writes directly by index', () => {
    const source = `
${STD_IMPORTS}
export const run = (input) => pipe(input, A.map((x) => x * 3 + 1))
`
    const result = transformStopcockPipelines(source, 'map-collector.ts')
    expect(result.code).toContain('var _len0 = _src.length;')
    expect(result.code).toContain('var _d0 = new Array(_len0);')
    expect(result.code).toContain('_d0[_i] = (_v0 * 3 + 1);')
    expect(result.code).not.toContain('_d0.push(')
    expect(result.code).not.toContain('const x =')
  })

  expectSame('map allocation ignores a lexical globalThis binding', {
    name: 'map-shadowed-global-this',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const globalThis = {
        Array: function PoisonedArray() {
          throw new Error('must not use a shadowed globalThis')
        },
      };
      return pipe([1, 2, 3], A.map((x) => x + 1));
    `,
    expectTransformed: true,
  })

  expectSame('map lowering declines a lexical Array binding', {
    name: 'map-shadowed-array',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const Array = function PoisonedArray() {
        throw new Error('must not use a shadowed Array')
      };
      return pipe([1, 2, 3], A.map((x) => x + 1));
    `,
    expectTransformed: false,
    reasonIncludes: 'lexical Array',
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

  expectSame('reject preserves getter read order and cardinality', {
    name: 'reject-getter-cardinality',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      let reads = 0;
      const source = [];
      Object.defineProperty(source, 0, {
        configurable: true,
        get() { return ++reads },
      });
      source.length = 1;
      return [pipe(source, A.reject(() => false)), reads];
    `,
    expectTransformed: true,
  })

  expectSame('filterMap drops nullish', {
    name: 'filterMap',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.filterMap((x) => (x % 2 === 0 ? x * 10 : null)));`,
    expectTransformed: true,
  })

  it('simplifies a definitely-present conditional filterMap', () => {
    const source = `
${STD_IMPORTS}
export const run = (input) =>
  pipe(input, A.filterMap((x) => x % 3 === 1 ? x * 2 + 1 : undefined))
`
    const result = transformStopcockPipelines(source, 'filter-map-direct.ts')
    expect(result.code).toContain('_d0.push((_v0 * 2 + 1));')
    expect(result.code).not.toContain('var _m0')
    // This site is fully lowered, so the factory call is elided entirely;
    // the ternary only ever appears once, specialized away by the loop.
    expect(result.code.match(/\?/gu)).toBeNull()
  })

  expectSame('filterMap respects a lexical undefined binding', {
    name: 'filter-map-shadowed-undefined',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const undefined = 99;
      return pipe(
        [1, 2, 3],
        A.filterMap((x) => x % 2 === 0 ? x * 10 : undefined),
      );
    `,
    expectTransformed: true,
  })

  expectSame('take', {
    name: 'take',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4, 5], A.take(2));`,
    expectTransformed: true,
  })

  expectSame('take preserves fractional slice coercion', {
    name: 'take-fractional',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.take(2.75));`,
    expectTransformed: true,
  })

  expectSame('sequential filter -> take preserves fractional slice coercion', {
    name: 'filter-take-fractional',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.filter((x) => x > 0), A.take(2.75));`,
    expectTransformed: true,
  })

  expectSame('drop', {
    name: 'drop',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4, 5], A.drop(2));`,
    expectTransformed: true,
  })

  expectSame('drop preserves fractional slice coercion', {
    name: 'drop-fractional',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.drop(2.75));`,
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

  expectSame('dropWhile preserves sparse suffixes through slice', {
    name: 'drop-while-sparse',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const values = [];
      values.length = 3;
      values[1] = -1;
      values[2] = 2;
      const out = pipe(values, A.dropWhile((x) => x < 0));
      return { out, hasFirst: 0 in out };
    `,
    expectTransformed: true,
  })

  expectSame('sum', {
    name: 'sum',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.sum);`,
    expectTransformed: true,
  })

  it.each([
    ['head', 'A.head', 1],
    ['last', 'A.last', 1],
    ['length', 'A.length', 0],
    ['isEmpty', 'A.isEmpty', 0],
  ] as const)(
    'the %s terminal preserves indexed getter reads',
    (_name, terminal, expectedReads) => {
      const result = runFixture({
        name: `terminal-getter-${_name}`,
        imports: STD_IMPORTS,
        locals: { pipe: 'pipe', A: 'A' },
        body: `
        let reads = 0;
        const source = [];
        for (let index = 0; index < 3; index++) {
          Object.defineProperty(source, index, {
            configurable: true,
            get() { reads++; return index + 1 },
          });
        }
        const value = pipe(source, ${terminal});
        return [value, reads];
      `,
        expectTransformed: true,
      })
      expect(result.compiled.value).toEqual(result.original.value)
      expect((result.compiled.value as readonly unknown[])[1]).toBe(expectedReads)
    },
  )

  expectSame('takeWhile preserves getter read order and cardinality', {
    name: 'take-while-getter-cardinality',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      let reads = 0;
      const source = [];
      Object.defineProperty(source, 0, {
        configurable: true,
        get() { return ++reads },
      });
      source.length = 1;
      return [pipe(source, A.takeWhile(() => true)), reads];
    `,
    expectTransformed: true,
  })

  it('emits an exact-capacity direct tail-position scan loop', () => {
    const source = `
${STD_IMPORTS}
export function run(input) {
  return pipe(input, A.scan((acc, x) => acc + x, 7))
}
`
    const result = transformStopcockPipelines(source, 'scan-tail.ts')
    expect(result.code).toContain('const _scanOut0 = new Array(_len0 + 1);')
    expect(result.code).toContain('_scanAcc0 = (_scanAcc0 + input[_i]);')
    expect(result.code).toContain('_scanOut0[_i + 1] = _scanAcc0;')
    expect(result.code).toContain('return _scanOut0;')
    expect(result.code).not.toContain('_boundary0')
    expect(result.code).toContain('A.scan(')
    expect(result.code).not.toContain('(function ()')
  })

  expectSame('direct scan preserves source, callback, seed, and iteration order', {
    name: 'scan-tail-evaluation-order',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
        const order = []
        const source = () => {
          order.push('source')
          return [1, 2, 3]
        }
        const callback = () => {
          order.push('callback')
          return (acc, value) => {
            order.push('item:' + value)
            return acc + '|item:' + value
          }
        }
        const seed = () => {
          order.push('seed')
          return order.join('|')
        }
        return pipe(source(), A.scan(callback(), seed()))
      `,
    expectTransformed: true,
  })

  expectSame('direct scan declines a lexical Array binding', {
    name: 'scan-shadowed-array',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const Array = function PoisonedArray() {
        throw new Error('must not use a shadowed Array')
      }
      return pipe([1, 2, 3], A.scan((acc, x) => acc + x, 0))
    `,
    expectTransformed: false,
    reasonIncludes: 'lexical Array',
  })

  it('emits a direct tail-position sum loop', () => {
    const source = `
${STD_IMPORTS}
export function run(input) {
  return pipe(input, A.sum)
}
`
    const result = transformStopcockPipelines(source, 'sum-tail.ts')
    expect(result.code).toContain('for (let _i = 0, _len0 = input.length; _i < _len0; _i++) {')
    expect(result.code).toContain('_sum0 += input[_i];')
    expect(result.code).toContain('return _sum0;')
    expect(result.code).not.toContain('var _d0')
    expect(result.code).not.toContain('break _outer')
    expect(result.code).not.toContain('{\n{\n')
  })

  it('count() with no predicate is left unchanged (matches runtime: requires a predicate)', () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const out = pipe([1, 2, 3, 4], A.count());
    `
    const result = transformStopcockPipelines(source, 'count-no-pred.ts', {
      diagnostics: 'verbose',
    })
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

  it('emits a direct tail-position reduce loop', () => {
    const source = `
${STD_IMPORTS}
export const run = (input) =>
  pipe(input, A.reduce((acc, x) => acc + x, 7))
`
    const result = transformStopcockPipelines(source, 'reduce-direct.ts')
    expect(result.code).toContain('for (let _i = 0, _len0 = input.length; _i < _len0; _i++) {')
    expect(result.code).toContain('_reduceAcc0 = (_reduceAcc0 + input[_i]);')
    expect(result.code).toContain('return _reduceAcc0;')
    expect(result.code).not.toContain('var _d0')
    expect(result.code).not.toContain('break _outer')
    expect(result.code).not.toContain('const acc =')
    expect(result.code).not.toContain('const x =')
  })

  expectSame('direct reduce preserves source, callback, seed, and iteration order', {
    name: 'reduce-tail-evaluation-order',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
        const order = []
        const source = () => {
          order.push('source')
          return [1, 2, 3]
        }
        const callback = () => {
          order.push('callback')
          return (acc, value) => {
            order.push('item:' + value)
            return acc + '|item:' + value
          }
        }
        const seed = () => {
          order.push('seed')
          return order.join('|')
        }
        return pipe(source(), A.reduce(callback(), seed()))
      `,
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

  it('keeps a variable-initializer terminal loop in its caller', () => {
    const source = `
${STD_IMPORTS}
export function run(input) {
  let observation = 0
  const value = pipe(input, A.forEach((x) => (observation += x)))
  return { value, observation }
}
`
    const result = transformStopcockPipelines(source, 'foreach-declaration.ts')
    expect(result.code).toContain('const value = _d0')
    expect(result.code).toContain('(observation += _v0);')
    expect(result.code).not.toContain('(function ()')
    expect(result.code).not.toContain('const x =')
  })

  expectSame('direct callback lowering retains per-item closure bindings', {
    name: 'map-nested-closure',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const callbacks = pipe([1, 2, 3], A.map((x) => () => x));
      return callbacks.map((callback) => callback());
    `,
    expectTransformed: true,
  })

  expectSame('direct callback lowering preserves shorthand property names', {
    name: 'map-shorthand-property',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3], A.map((x) => ({ x })));`,
    expectTransformed: true,
  })

  expectSame('find', {
    name: 'find',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.find((x) => x > 2));`,
    expectTransformed: true,
  })

  it('find not-found preserves the canonical None singleton', () => {
    const result = runFixture({
      name: 'find-none-singleton',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `return pipe([1, 2, 3], A.find((x) => x > 10));`,
      expectTransformed: true,
    })
    expect(result.transformed).toBe(true)
    expect(result.original.value).toBe(none)
    expect(result.compiled.value).toBe(none)
  })

  expectSame('find preserves Some(undefined) for a matched undefined element', {
    name: 'find-some-undefined',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, undefined, 3], A.find((x) => x === undefined));`,
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

  it('returns directly from a tail-position some terminal', () => {
    const source = `
${STD_IMPORTS}
export function run(input) {
  return pipe(input, A.some((x) => x > 10))
}
`
    const result = transformStopcockPipelines(source, 'some-tail.ts')
    expect(result.code).toContain('if ((input[_i] > 10)) return true;')
    expect(result.code).toContain('return false;')
    expect(result.code).not.toContain('var _d0')
    expect(result.code).not.toContain('break _outer')
    expect(result.code).not.toContain('{\n{\n')
  })

  expectSame('findIndex (found, returns Some(index))', {
    name: 'findIndex-found',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([10, 20, 30, 40], A.findIndex((x) => x === 30));`,
    expectTransformed: true,
  })

  expectSame('findIndex (not found, returns None)', {
    name: 'findIndex-not-found',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([10, 20, 30], A.findIndex((x) => x > 100));`,
    expectTransformed: true,
  })

  it('returns a direct loop index from a tail-position findIndex', () => {
    const source = `
${STD_IMPORTS}
export function run(input) {
  return pipe(input, A.findIndex((x) => x > 10))
}
`
    const result = transformStopcockPipelines(source, 'find-index-tail.ts')
    expect(result.code).toContain('return { _tag: 1, value: _i };')
    expect(result.code).toContain('return __stopcock_fp_none;')
    expect(result.code).not.toContain('var _pos0')
    expect(result.code).not.toContain('var _d0')
    expect(result.code).not.toContain('break _outer')
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

  it('simplifies a definitely-present conditional findMap', () => {
    const source = `
${STD_IMPORTS}
export const run = (input) =>
  pipe(input, A.findMap((x) => x > 10 ? x * 2 + 1 : undefined))
`
    const result = transformStopcockPipelines(source, 'find-map-direct.ts')
    expect(result.code).toContain('value: (_v0 * 2 + 1) }; break _outer;')
    expect(result.code).not.toContain('var _fmv0')
    // Fully lowered: the factory call is elided, so the ternary never appears.
    expect(result.code.match(/\?/gu)).toBeNull()
  })

  expectSame('none true (no element matches)', {
    name: 'none-true',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 3, 5], A.none((x) => x % 2 === 0));`,
    expectTransformed: true,
  })

  expectSame(
    'none false stops early',
    {
      name: 'none-false',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `return pipe([1, 3, 4, 5], A.none((x) => { log.push(x); return x % 2 === 0; }));`,
      expectTransformed: true,
    },
    () => ({ log: [] }),
  )

  expectSame('flatMap', {
    name: 'flatMap',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3], A.flatMap((x) => [x, x * 10]));`,
    expectTransformed: true,
  })

  it('retains the literal flatMap allocation and evaluation barrier in exact mode', () => {
    const source = `
${STD_IMPORTS}
export const run = (input) => pipe(input, A.flatMap((x) => [x, x + 1]))
`
    const result = transformStopcockPipelines(source, 'flat-map-literal.ts')
    expect(result.code).toContain('var _d0 = [];')
    expect(result.code).toContain('var _fm0 = ([_v0, _v0 + 1]);')
    expect(result.code).toContain('_rlen0 = _fm0.length')
    expect(result.code).toContain('_d0.push(_v1);')
  })

  expectSame(
    'literal flatMap direct writes preserve element evaluation order',
    {
      name: 'flatMap-literal-order',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        const values = pipe(
          [1, 2],
          A.flatMap((x) => [
            (log.push('left:' + x), x),
            (log.push('right:' + x), x + 10),
          ]),
        )
        return { values, log }
      `,
      expectTransformed: true,
    },
    () => ({ log: [] }),
  )

  expectSame('literal flatMap evaluates the whole result before output setters', {
    name: 'flatMap-literal-prototype-setter-order',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      let log = 0;
      Object.defineProperty(Array.prototype, '0', {
        configurable: true,
        set() { log = log * 10 + 3; },
      });
      try {
        const out = pipe(
          [1],
          A.flatMap((x) => [
            (log = log * 10 + 1, x),
            (log = log * 10 + 2, x),
          ]),
        );
        return { log, length: out.length, ownZero: Object.hasOwn(out, 0) };
      } finally {
        delete Array.prototype[0];
      }
    `,
    expectTransformed: true,
  })

  expectSame('literal flatMap retains literal output allocation semantics', {
    name: 'flatMap-literal-global-array',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const NativeArray = globalThis.Array;
      function CustomArray(length) {
        const out = new NativeArray(length);
        out.marker = 888;
        return out;
      }
      try {
        globalThis.Array = CustomArray;
        const out = pipe([1, 2], A.flatMap((x) => [x, x]));
        return { marker: out.marker ?? 0, values: [...out] };
      } finally {
        globalThis.Array = NativeArray;
      }
    `,
    expectTransformed: true,
  })

  it('keeps dynamic flatMap callbacks on the generic nested-loop path', () => {
    const source = `
${STD_IMPORTS}
const expand = (x) => [x, x + 1]
export const run = (input) => pipe(input, A.flatMap(expand))
`
    const result = transformStopcockPipelines(source, 'flat-map-dynamic.ts')
    expect(result.code).toContain('var _fm0 = _cb0(_v0);')
    expect(result.code).toContain('_d0.push(_v1);')
  })

  expectSame('flatMap -> filter -> take (break exits both loops)', {
    name: 'flatMap-filter-take',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.flatMap((x) => [x, x + 1, x + 2]), A.filter((x) => x % 2 === 0), A.take(2));`,
    expectTransformed: true,
  })

  expectSame('mapWhile fuses and stops the whole pipeline', {
    name: 'map-while',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.mapWhile((x) => x < 4 ? x * 10 : null), A.map((x) => x + 1));`,
    expectTransformed: true,
  })

  it('simplifies a definitely-present conditional mapWhile', () => {
    const source = `
${STD_IMPORTS}
export const run = (input) =>
  pipe(input, A.mapWhile((x) => x < 10 ? x * 2 + 1 : undefined))
`
    const result = transformStopcockPipelines(source, 'map-while-direct.ts')
    expect(result.code).toContain('if (!((_v0 < 10))) break;')
    expect(result.code).toContain('_d0.push((_v0 * 2 + 1));')
    expect(result.code).not.toContain('var _mw0')
    // Fully lowered: the factory call is elided, so the ternary never appears.
    expect(result.code.match(/\?/gu)).toBeNull()
  })

  expectSame('takeUntil fuses and excludes the matching element', {
    name: 'take-until',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.map((x) => x * 2), A.takeUntil((x) => x >= 6));`,
    expectTransformed: true,
  })

  it('emits a direct tail-position takeUntil loop', () => {
    const source = `
${STD_IMPORTS}
export function run(input) {
  return pipe(input, A.takeUntil((x) => x >= 6))
}
`
    const result = transformStopcockPipelines(source, 'take-until-tail.ts')
    expect(result.code).toContain('for (let _i = 0, _len0 = input.length; _i < _len0; _i++) {')
    expect(result.code).toContain('if ((_v0 >= 6)) break;')
    expect(result.code).toContain('_takeUntilOut0.push(_v0);')
    expect(result.code).not.toContain('break _outer')
    expect(result.code).not.toContain('var _d0')
  })

  it('retains a source capture for non-parameter bindings', () => {
    const source = `
${STD_IMPORTS}
const values = [1, 2, 3]
export function run() {
  return pipe(values, A.some((x) => x > 1))
}
`
    const result = transformStopcockPipelines(source, 'tail-outer-binding.ts')
    expect(result.code).toContain('var _src = (values);')
    expect(result.code).toContain('_src[_i]')
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

  expectSame(
    'sortBy preserves argument timing, stable order, and comparator trace',
    {
      name: 'sortBy-semantics',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        const comparator = () => {
          log.push('comparator-created')
          return (left, right) => {
            log.push('compare:' + left.id + ':' + right.id)
            return left.rank - right.rank
          }
        }
        const values = [
          { id: 'a', rank: 2 },
          { id: 'b', rank: 1 },
          { id: 'c', rank: 2 },
          { id: 'd', rank: 1 },
        ]
        const sorted = pipe(
          values,
          A.map((value) => {
            log.push('map:' + value.id)
            return value
          }),
          A.sortBy(comparator()),
        )
        return { ids: sorted.map((value) => value.id), log }
      `,
      expectTransformed: true,
    },
    () => ({ log: [] }),
  )

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

  expectSame('compact AOT reverse preserves the frozen forward source-read order', {
    name: 'compact-reverse-source-read-order',
    imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compile: 'compile', A: 'A' },
    body: `
      const reads = [];
      const source = new Proxy([1, 2, 3], {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\\d+$/.test(property)) reads.push(property);
          return Reflect.get(target, property, receiver);
        },
      });
      return [compile(A.reverse)(source), reads];
    `,
    expectTransformed: true,
  })

  expectSame('compact AOT init preserves the frozen slice endpoint', {
    name: 'compact-init-slice-endpoint',
    imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compile: 'compile', A: 'A' },
    body: `
      const calls = [];
      const source = new Proxy([], {
        get(target, property, receiver) {
          if (property === 'length') return 4294967297;
          if (property === 'slice') {
            return (...args) => {
              calls.push(args);
              return ['sliced'];
            };
          }
          return Reflect.get(target, property, receiver);
        },
      });
      return [compile(A.init)(source), calls];
    `,
    expectTransformed: true,
  })

  expectSame('compact AOT flatten preserves native sparse flattening', {
    name: 'compact-flatten-sparse-inner',
    imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compile: 'compile', A: 'A' },
    body: `
      const inner = Array(2);
      inner[1] = 2;
      const out = compile(A.flatten)([inner]);
      return [out, out.length, 0 in out, 1 in out];
    `,
    expectTransformed: true,
  })

  expectSame('compact AOT without preserves native sparse filter semantics', {
    name: 'compact-without-sparse-source',
    imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compile: 'compile', A: 'A' },
    body: `
      const source = Array(2);
      source[1] = 2;
      const out = compile(A.without([]))(source);
      return [out, out.length, 0 in out, 1 in out];
    `,
    expectTransformed: true,
  })

  expectSame('compact AOT without declines a lexical Set binding', {
    name: 'compact-without-lexical-set',
    imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compile: 'compile', A: 'A' },
    body: `
      const Set = function PoisonedSet() {
        throw new Error('must not resolve the caller lexical Set');
      };
      const run = compile(A.without([]));
      return run([1, 2, 3]);
    `,
    expectTransformed: false,
    reasonIncludes: 'lexical Set',
  })

  for (const operation of ['sum', 'min', 'max'] as const) {
    expectSame(`compact AOT ${operation} preserves live materializer length reads`, {
      name: `compact-${operation}-live-length`,
      imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
      locals: { compile: 'compile', A: 'A' },
      body: `
        let lengthReads = 0;
        const source = new Proxy([10, 20], {
          get(target, property, receiver) {
            if (property === 'length') return ++lengthReads === 1 ? 2 : 0;
            return Reflect.get(target, property, receiver);
          },
        });
        return [compile(A.${operation})(source), lengthReads];
      `,
      expectTransformed: true,
    })
  }

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

  expectSame('registered materializers can split a fused pipeline', {
    name: 'materializer-boundaries',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([1, 2, 3, 4], A.scan((acc, x) => acc + x, 0), A.without([0, 3]), A.tail, A.init, A.map((x) => x * 2));`,
    expectTransformed: true,
  })

  expectSame('flatten boundary can feed another fused segment', {
    name: 'flatten-boundary',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `return pipe([[1, 2], [3], [4, 5]], A.flatten, A.filter((x) => x % 2 === 1));`,
    expectTransformed: true,
  })

  it('keeps a root map and flatten in separate sequential stages', () => {
    const source = `
${STD_IMPORTS}
export const run = (input) =>
  pipe(input, A.map((x) => [x, x + 1]), A.flatten)
`
    const result = transformStopcockPipelines(source, 'map-flatten.ts')
    expect(result.code).toContain('var _d0 = new Array(_len0);')
    expect(result.code).toContain('_d0[_i] = ([_v0, _v0 + 1]);')
    expect(result.code).toContain('var _boundary1')
    expect(result.code).toContain('var _d1 = _boundary1(_d0);')
  })

  it('retains the exact map-to-flatten allocation boundary on the fusion facade', () => {
    const source = `
import { pipe } from '@stopcock/fp/fusion'
import * as A from '@stopcock/fp/array'
export const run = (input) =>
  pipe(input, A.map((x) => [x, x + 1]), A.flatten)
`
    const result = transformStopcockPipelines(source, 'fusion-map-flatten.ts')
    expect(result.code).toContain('var _d0 = new Array(_len0);')
    expect(result.code).toContain('_d0[_i] = ([_v0, _v0 + 1]);')
    expect(result.code).toContain('var _d1 = _d0.flat();')
    expect(result.code).not.toContain('var _boundary1')
  })

  for (const [name, terminal] of [
    ['head', 'A.head'],
    ['last', 'A.last'],
    ['length', 'A.length'],
    ['isEmpty', 'A.isEmpty'],
    ['join', "A.join('-')"],
    ['min', 'A.min'],
    ['max', 'A.max'],
  ] as const) {
    expectSame(`${name} full-array terminal`, {
      name: `${name}-terminal`,
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `return pipe([3, 1, 2], A.map((x) => x * 2), ${terminal});`,
      expectTransformed: true,
    })
  }

  for (const [name, expected] of [
    ['length', 'return input.length;'],
    ['isEmpty', 'return input.length === 0;'],
  ] as const) {
    it(`directly lowers the bare ${name} terminal`, () => {
      const source = `
${STD_IMPORTS}
export const run = (input) => pipe(input, A.${name})
`
      const result = transformStopcockPipelines(source, `${name}-direct.ts`)
      expect(result.code).toContain(expected)
      expect(result.code).not.toContain('_boundary0')
      expect(result.code).not.toContain('return (input)')
    })
  }

  it('splices scalar terminal returns without a nested block', () => {
    const source = `
${STD_IMPORTS}
function __run(input) {
  return pipe(input, A.isEmpty)
}
`
    const result = transformStopcockPipelines(source, 'is-empty-return-shape.ts')
    expect(result.code).toMatch(
      /function __run\(input\) \{\n\s+A\.isEmpty;\nreturn input\.length === 0;\n\}/u,
    )
    expect(result.code).not.toContain('{\n{\nreturn')
  })

  it('scalar full-array terminals must remain last', () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
const out = pipe([1, 2, 3], A.length, A.map((x) => x + 1))
`
    const result = transformStopcockPipelines(source, 'scalar-terminal-mid.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].reason).toContain('length: terminal op must be the last step')
  })

  expectSame('compile() with 2 steps fuses into a runner', {
    name: 'compile-2-steps',
    imports: `import { pipe, flow } from '@stopcock/fp'
import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { pipe: 'pipe', A: 'A', compile: 'compile', flow: 'flow' },
    body: `
      const run = compile(A.map((x) => x * 2), A.filter((x) => x > 4));
      return run([1, 2, 3, 4]);
    `,
    expectTransformed: true,
  })

  expectSame('flow() with 3 steps fuses into a runner', {
    name: 'flow-3-steps',
    imports: `import { pipe, flow } from '@stopcock/fp'
import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { pipe: 'pipe', A: 'A', compile: 'compile', flow: 'flow' },
    body: `
      const run = flow(A.map((x) => x + 1), A.filter((x) => x % 2 === 0), A.reduce((acc, x) => acc + x, 0));
      return run([1, 2, 3, 4, 5]);
    `,
    expectTransformed: true,
  })

  expectSame('flow runners preserve lexical this, arguments, super, and new.target', {
    name: 'flow-lexical-construction-context',
    imports: `import { flow } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'`,
    locals: { flow: 'flow', A: 'A' },
    body: `
      const owner = {
        factor: 3,
        make(multiplier) {
          const byThis = flow(A.map((x) => x * this.factor), A.filter(Boolean));
          const byArguments = flow(A.map((x) => x * arguments[0]), A.filter(Boolean));
          return [byThis([1, 2]), byArguments([1, 2])];
        },
      };
      class Base { get factor() { return 4; } }
      class Child extends Base {
        make() {
          const run = flow(A.map((x) => x * super.factor), A.filter(Boolean));
          return run([1, 2]);
        }
      }
      function Factory() {
        const run = flow(
          A.map((x) => new.target === Factory ? x + 5 : x),
          A.filter(Boolean),
        );
        this.value = run([1, 2]);
      }
      return [owner.make(5), new Child().make(), new Factory().value];
    `,
    expectTransformed: true,
  })

  it('reports segment kinds and op names for a deferred-runner plan', () => {
    const source = `import { flow } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
export const run = flow(A.map(Number), A.filter(Boolean), A.sum)
`
    const result = transformStopcockPipelines(source, '/repo/src/runner.ts', {
      diagnostics: 'verbose',
    })
    expect(result.diagnostics[0]).toMatchObject({
      transformed: true,
      segmentKinds: ['stream', 'stream', 'boundary'],
      semantics: 'exact',
      opNames: ['map', 'filter', 'sum'],
    })
  })

  expectSame('compile() captures factories and bound values once', {
    name: 'compile-construction-timing',
    imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compile: 'compile', A: 'A' },
    body: `
      let callbackConstructions = 0;
      const makeCallback = () => {
        callbackConstructions++;
        return (x) => x * 2;
      };
      const seed = [];
      const run = compile(
        A.map(makeCallback()),
        A.reduce((acc, x) => { acc.push(x); return acc; }, seed),
      );
      const first = run([1, 2]);
      const second = run([3]);
      return { callbackConstructions, sameSeed: first === second && second === seed, values: second };
    `,
    expectTransformed: true,
  })

  it('fully static lowering never lets a hostile inherited factory setter observe construction', () => {
    const result = runFixture({
      name: 'full-static-factory-observability',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        let writes = 0;
        const previous = Object.getOwnPropertyDescriptor(Function.prototype, '_op');
        Object.defineProperty(Function.prototype, '_op', {
          configurable: true,
          set(value) {
            writes++;
            Object.defineProperty(this, '_op', {
              configurable: true,
              writable: true,
              value,
            });
          },
        });
        try {
          const result = pipe(
            [1, 2, 3],
            A.map((x) => x + 1),
            A.filter((x) => x > 2),
          );
          return [result, writes];
        } finally {
          if (previous === undefined) delete Function.prototype._op;
          else Object.defineProperty(Function.prototype, '_op', previous);
        }
      `,
      expectTransformed: true,
    })
    expect(result.transformed).toBe(true)
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    const [originalValue, originalWrites] = result.original.value as [unknown, number]
    const [compiledValue, compiledWrites] = result.compiled.value as [unknown, number]
    // The map/filter data pipeline is unaffected either way.
    expect(compiledValue).toEqual(originalValue)
    // The interpreted path really constructs both operators; the fully
    // lowered compiled path never calls either factory, so pollution planted
    // on Function.prototype is simply never observed.
    expect(originalWrites).toBeGreaterThan(0)
    expect(compiledWrites).toBe(0)
  })

  it('fully static lowering never triggers a throwing inherited factory setter', () => {
    const result = runFixture({
      name: 'full-static-factory-throw',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        const previous = Object.getOwnPropertyDescriptor(Function.prototype, '_op');
        Object.defineProperty(Function.prototype, '_op', {
          configurable: true,
          set() { throw new Error('factory tag rejected') },
        });
        try {
          return pipe([1, 2], A.map((x) => x + 1));
        } finally {
          if (previous === undefined) delete Function.prototype._op;
          else Object.defineProperty(Function.prototype, '_op', previous);
        }
      `,
      expectTransformed: true,
    })
    expect(result.transformed).toBe(true)
    // Interpreted: the real factory call runs and the setter throws.
    expect(result.original.error).toBeDefined()
    expect((result.original.error as Error).message).toBe('factory tag rejected')
    // Compiled: construction is elided, so the setter never runs.
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual([2, 3])
  })

  it('fully static lowering never retains an operator leaf for later use', () => {
    const result = runFixture({
      name: 'full-static-retained-operator-leaf',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        let retained;
        const previous = Object.getOwnPropertyDescriptor(Function.prototype, '_op');
        Object.defineProperty(Function.prototype, '_op', {
          configurable: true,
          set(value) {
            retained = this;
            Object.defineProperty(this, '_op', {
              configurable: true,
              writable: true,
              value,
            });
          },
        });
        try {
          const compiledResult = pipe([1, 2, 3], A.map((x) => x + 1));
          const retainedResult = retained([10, 20]);
          return [compiledResult, retainedResult];
        } finally {
          if (previous === undefined) delete Function.prototype._op;
          else Object.defineProperty(Function.prototype, '_op', previous);
        }
      `,
      expectTransformed: true,
    })
    expect(result.transformed).toBe(true)
    // Interpreted: the real map operator gets constructed and tagged, so a
    // side channel that captures `this` off the setter can call it again.
    expect(result.original.error).toBeUndefined()
    expect(result.original.value).toEqual([[2, 3, 4], [11, 21]])
    // Compiled: nothing is ever constructed, so `retained` stays undefined
    // and calling it throws instead of quietly returning a stale operator.
    expect(result.compiled.error).toBeDefined()
    expect((result.compiled.error as Error).message).toMatch(/retained is not a function/u)
  })

  it('elides construction but still evaluates argument expressions once, in order', () => {
    const result = runFixture({
      name: 'full-static-argument-evaluation-order',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        const log = [];
        const computeK = () => { log.push('k'); return 2; };
        const logAndReturnFn = () => { log.push('fn'); return (x) => x + 1; };
        const result = pipe(
          [1, 2, 3],
          A.map(logAndReturnFn()),
          A.take(computeK()),
        );
        return [result, log];
      `,
      expectTransformed: true,
    })
    expect(result.transformed).toBe(true)
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    // Both argument expressions still run, exactly once each, in their
    // original left-to-right order. Only the discarded factory calls that
    // would have wrapped them are gone.
    expect(result.compiled.value).toEqual(result.original.value)
    expect(result.compiled.value).toEqual([[2, 3], ['fn', 'k']])
  })

  expectSame('boundary lowering never trusts later mutations of public binding fields', {
    name: 'boundary-public-binding-forgery',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      let constructed;
      const previous = Object.getOwnPropertyDescriptor(Function.prototype, '_op');
      Object.defineProperty(Function.prototype, '_op', {
        configurable: true,
        set(value) {
          constructed = this;
          Object.defineProperty(this, '_op', {
            configurable: true,
            writable: true,
            value,
          });
        },
      });
      try {
        const makePredicate = () => {
          constructed._fn = () => 1000;
          constructed._a1 = 1000;
          return Boolean;
        };
        return pipe(
          [1, 2],
          A.scan((acc, value) => acc + value, 0),
          A.filter(makePredicate()),
        );
      } finally {
        if (previous === undefined) delete Function.prototype._op;
        else Object.defineProperty(Function.prototype, '_op', previous);
      }
    `,
    expectTransformed: true,
  })

  expectSame('compilePure from the specialist entry fuses', {
    name: 'compile-pure-specialist',
    imports: `import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compilePure: 'compilePure', A: 'A' },
    body: `
      const run = compilePure(A.map((x) => x + 1), A.sum);
      return run([1, 2, 3]);
    `,
    expectTransformed: true,
  })

  it('compiled take preserves one-item lookahead at its lexical position', () => {
    const result = runFixture({
      name: 'compile-take-lookahead',
      imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
      locals: { compile: 'compile', A: 'A' },
      body: `
        const reads = [];
        const calls = [];
        const source = new Proxy([1, 2, 3], {
          get(target, property, receiver) {
            if (typeof property === 'string' && /^\\d+$/.test(property)) reads.push(property);
            return Reflect.get(target, property, receiver);
          },
        });
        const run = compile(
          A.map((value) => { calls.push(value); return value; }),
          A.take(1),
          A.filter(() => false),
        );
        return [run(source), reads, calls];
      `,
      expectTransformed: true,
    })
    const expected = [[], ['0', '1'], [1, 2]]
    expect(result.transformed).toBe(true)
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.original.value).toEqual(expected)
    expect(result.compiled.value).toEqual(expected)
  })

  it('compiled take(0) preserves the frozen initial lookahead', () => {
    const result = runFixture({
      name: 'compile-take-zero-lookahead',
      imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
      locals: { compile: 'compile', A: 'A' },
      body: `
        const reads = [];
        const calls = [];
        const source = new Proxy([1, 2, 3], {
          get(target, property, receiver) {
            if (typeof property === 'string' && /^\\d+$/.test(property)) reads.push(property);
            return Reflect.get(target, property, receiver);
          },
        });
        const run = compile(
          A.map((value) => { calls.push(value); return value; }),
          A.take(0),
        );
        return [run(source), reads, calls];
      `,
      expectTransformed: true,
    })
    const expected = [[], ['0'], [1]]
    expect(result.transformed).toBe(true)
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.original.value).toEqual(expected)
    expect(result.compiled.value).toEqual(expected)
  })

  it('compiled take inside flatMap preserves inner lookahead without advancing the outer source', () => {
    const result = runFixture({
      name: 'compile-flatmap-take-lookahead',
      imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
      locals: { compile: 'compile', A: 'A' },
      body: `
        const innerReads = [];
        const outerCalls = [];
        const suffixCalls = [];
        const inner = new Proxy([10, 20, 30], {
          get(target, property, receiver) {
            if (typeof property === 'string' && /^\\d+$/.test(property)) innerReads.push(property);
            return Reflect.get(target, property, receiver);
          },
        });
        const run = compile(
          A.flatMap((value) => { outerCalls.push(value); return inner; }),
          A.take(1),
          A.filter((value) => { suffixCalls.push(value); return false; }),
        );
        return [run([1, 2, 3]), innerReads, outerCalls, suffixCalls];
      `,
      expectTransformed: true,
    })
    const expected = [[], ['0', '1'], [1], [10]]
    expect(result.transformed).toBe(true)
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.original.value).toEqual(expected)
    expect(result.compiled.value).toEqual(expected)
  })

  expectSame('compiled take completes final retained flatMap expansion before halting', {
    name: 'compile-take-flatmap-suffix-completion',
    imports: `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compile: 'compile', A: 'A' },
    body: `
      const reads = [];
      const suffixCalls = [];
      const source = new Proxy([1, 2, 3], {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\\d+$/.test(property)) reads.push(property);
          return Reflect.get(target, property, receiver);
        },
      });
      const run = compile(
        A.take(1),
        A.flatMap((value) => [value, value + 10]),
        A.map((value) => { suffixCalls.push(value); return value; }),
      );
      return [run(source), reads, suffixCalls];
    `,
    expectTransformed: true,
  })

  it('compilePure elides map construction along with its per-element execution', () => {
    const result = runFixture({
      name: 'compile-pure-construction-observable',
      imports: `import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
      locals: { compilePure: 'compilePure', A: 'A' },
      body: `
        let writes = 0;
        const previous = Object.getOwnPropertyDescriptor(Function.prototype, '_op');
        Object.defineProperty(Function.prototype, '_op', {
          configurable: true,
          set(value) {
            writes++;
            Object.defineProperty(this, '_op', {
              configurable: true,
              writable: true,
              value,
            });
          },
        });
        try {
          const run = compilePure(
            A.map((x) => x + 1),
            A.length,
          );
          return [run([1, 2, 3]), writes];
        } finally {
          if (previous === undefined) delete Function.prototype._op;
          else Object.defineProperty(Function.prototype, '_op', previous);
        }
      `,
      expectTransformed: true,
    })
    expect(result.transformed).toBe(true)
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    // Interpreted: A.map really constructs (one write); A.length is a bare
    // accessor reference, never a call, so it never triggers the setter.
    expect(result.original.value).toEqual([3, 1])
    // Compiled: this site is fully lowered (map -> length elides the
    // per-element callback already), and the map factory call is now elided
    // too, so the setter is never triggered at all.
    expect(result.compiled.value).toEqual([3, 0])
  })

  it('compiles pure sort/take as an exact boundary followed by a fused stream', () => {
    const source = `
import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
const run = compilePure(A.sort, A.take(2))
`
    const result = transformStopcockPipelines(source, 'compile-pure-sort-take.ts', {
      diagnostics: 'verbose',
    })
    expect(result.diagnostics[0]).toMatchObject({
      transformed: true,
      semantics: 'pure',
      opNames: ['sort', 'take'],
      segmentKinds: ['boundary', 'stream'],
    })
    expect(result.code).not.toBe(source)
  })

  expectSame('AOT compilePure sort/take preserves a changing-length snapshot', {
    name: 'compile-pure-sort-take-changing-length',
    imports: `import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compilePure: 'compilePure', A: 'A' },
    body: `
      const events = [];
      let lengthReads = 0;
      const source = new Proxy([4, 3, 2, 1], {
        get(target, property, receiver) {
          if (property === 'length') {
            const length = ++lengthReads === 1 ? 2 : 4;
            events.push('length:' + length);
            return length;
          }
          if (typeof property === 'string' && /^\\d+$/.test(property)) {
            events.push('get:' + property);
          }
          return Reflect.get(target, property, receiver);
        },
        has(target, property) {
          if (typeof property === 'string' && /^\\d+$/.test(property)) {
            events.push('has:' + property);
          }
          return Reflect.has(target, property);
        },
      });
      const run = compilePure(A.sort, A.take(2));
      return [run(source), events];
    `,
    expectTransformed: true,
  })

  expectSame('AOT compilePure sort/take preserves final Array ownership', {
    name: 'compile-pure-sort-take-array-owner',
    imports: `import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compilePure: 'compilePure', A: 'A' },
    body: `
      class Values extends Array {}
      const run = compilePure(A.sort, A.take(2));
      const result = run(new Values(3, 1, 2));
      return [result instanceof Values, result];
    `,
    expectTransformed: true,
  })

  for (const [operation, countCases] of [
    [
      'take',
      [
        ['negative zero', '-0'],
        ['fractional', '2.9'],
        ['infinity', '+Number.POSITIVE_INFINITY'],
        ['nan', '+(0 / 0)'],
      ],
    ],
    [
      'drop',
      [
        ['negative zero', '-0'],
        ['fractional', '2.9'],
        ['infinity', '+Number.POSITIVE_INFINITY'],
        ['nan', '+(0 / 0)'],
      ],
    ],
  ] as const) {
    for (const [label, countExpression] of countCases) {
      expectSame(`AOT fused ${operation} normalizes ${label}`, {
        name: `compile-pure-${operation}-${label.replaceAll(' ', '-')}`,
        imports: `import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
        locals: { compilePure: 'compilePure', A: 'A' },
        body: `
          const run = compilePure(
            A.map((value) => value * 2),
            A.${operation}(${countExpression}),
          );
          return run([1, 2, 3, 4]);
        `,
        expectTransformed: true,
      })
    }
  }

  expectSame('AOT fused drop retains a coercible count on the compact runtime tier', {
    name: 'compile-pure-object-drop-fallback',
    imports: `import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compilePure: 'compilePure', A: 'A' },
    body: `
      const events = [];
      const count = {
        valueOf() {
          events.push('count:valueOf');
          return 1.75;
        },
      };
      const run = compilePure(
        A.map((value) => { events.push('prefix:' + value); return value * 2; }),
        A.drop(count),
      );
      return [run([1, 2, 3]), events];
    `,
    expectTransformed: false,
    reasonIncludes: 'statically primitive-number count',
  })

  it('AOT-elides pure map callbacks whose values are consumed only by length', () => {
    const source = `
import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
const run = compilePure(A.map((x) => x + 1), A.length)
export const out = run([1, 2, 3])
`
    const result = transformStopcockPipelines(source, 'compile-pure-map-length.ts', {
      diagnostics: 'verbose',
    })
    expect(result.diagnostics[0]).toMatchObject({
      transformed: true,
      semantics: 'pure',
      opNames: ['map', 'length'],
    })
    expect(result.code).toContain('var _pureLength1 = _src.length;')
    expect(result.code).toContain('var _d0 = _pureLength1;')
    // Fully lowered: map's factory call is elided along with its callback,
    // so neither the call nor the callback body survives in the output.
    expect(result.code).not.toContain('A.map')
    expect(result.code).not.toContain('x + 1')
    expect(result.code).toContain('for (var _i = 0; _i < _pureLength1; _i++)')
    expect(result.code).toContain('void _src[_i];')
  })

  expectSame('compilePure map-length elision preserves dense source reads', {
    name: 'compile-pure-map-length-source-reads',
    imports: `import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
    locals: { compilePure: 'compilePure', A: 'A' },
    body: `
      const reads = [];
      const source = new Proxy([1, 2, 3], {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\\d+$/.test(property)) reads.push(property);
          return Reflect.get(target, property, receiver);
        },
      });
      const run = compilePure(A.map((value) => value * 2), A.length);
      return [run(source), reads];
    `,
    expectTransformed: true,
  })

  it('compilePure elides map-to-length after a preceding boundary', () => {
    const result = runFixture({
      name: 'compile-pure-boundary-map-length',
      imports: `import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
      locals: { compilePure: 'compilePure', A: 'A' },
      body: `
        const calls = [];
        const run = compilePure(
          A.reverse,
          A.map((value) => { calls.push(value); return value * 2; }),
          A.length,
        );
        return [run([1, 2, 3]), calls];
      `,
      expectTransformed: true,
    })
    const expected = [3, []]
    expect(result.transformed).toBe(true)
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.original.value).toEqual(expected)
    expect(result.compiled.value).toEqual(expected)
  })

  it('compilePure does not elide a map sharing a stream with filter', () => {
    const result = runFixture({
      name: 'compile-pure-filter-map-length',
      imports: `import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`,
      locals: { compilePure: 'compilePure', A: 'A' },
      body: `
        const calls = [];
        const run = compilePure(
          A.filter((value) => value > 1),
          A.map((value) => { calls.push(value); return value * 2; }),
          A.length,
        );
        return [run([1, 2, 3]), calls];
      `,
      expectTransformed: true,
    })
    const expected = [2, [2, 3]]
    expect(result.transformed).toBe(true)
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.original.value).toEqual(expected)
    expect(result.compiled.value).toEqual(expected)
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

  it('hoists callbacks when a pipeline exceeds the cross-engine inline budget', () => {
    const source = `
      ${STD_IMPORTS}
      export const run = (values) => pipe(
        values,
        A.map((x) => x + 1),
        A.filter((x) => x % 2 === 0),
        A.map((x) => x * 3),
        A.reduce((acc, x) => acc + x, 0),
      )
    `
    const result = transformStopcockPipelines(source, 'callback-budget.ts', {
      diagnostics: false,
    })
    expect(result.code).toContain('var _cb0 =')
    expect(result.code).toContain('var _cb1 =')
    expect(result.code).toContain('var _cb2 =')
    expect(result.code).toContain('var _cbT3 =')
  })

  expectSame('closure mutating outer variable', {
    name: 'closure-mutation',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
        let total = 0;
        const out = pipe([1, 2, 3], A.map((x) => { total += x; return total; }));
        return { out, total };
      `,
    expectTransformed: true,
  })

  expectSame(
    'root take(n) preserves its sequential source tier',
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
    'root take(+n) preserves its sequential source tier',
    {
      name: 'take-normalized-side-effect',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        function n() { log.push('n'); return '2'; }
        const out = pipe([1, 2, 3, 4], A.take(+n()));
        return { out, log };
      `,
      expectTransformed: true,
    },
    () => ({ log: [] }),
  )

  for (const facade of ['pipe', 'compile', 'compilePure'] as const) {
    const imports =
      facade === 'pipe'
        ? STD_IMPORTS
        : `import { ${facade} } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'`
    const execute =
      facade === 'pipe'
        ? `pipe(
            source,
            A.map((value) => {
              events.push('prefix:' + value);
              return value * 2;
            }),
            A.take(count),
            A.map((value) => {
              events.push('suffix:' + value);
              return value + 1;
            }),
          )`
        : `${facade}(
            A.map((value) => {
              events.push('prefix:' + value);
              return value * 2;
            }),
            A.take(count),
            A.map((value) => {
              events.push('suffix:' + value);
              return value + 1;
            }),
          )(source)`

    expectSame(`${facade} retains effectful object take coercions on its source tier`, {
      name: `${facade}-object-take-fallback`,
      imports,
      locals: { [facade]: facade, A: 'A' },
      body: `
        const events = [];
        const source = new Proxy([1, 2, 3], {
          get(target, property, receiver) {
            if (property === 'length') events.push('source:length');
            if (typeof property === 'string' && /^\\d+$/.test(property)) {
              events.push('source:get:' + property);
            }
            return Reflect.get(target, property, receiver);
          },
        });
        const count = {
          valueOf() {
            events.push('count:valueOf');
            return 2.75;
          },
        };
        return [${execute}, events];
      `,
      expectTransformed: facade === 'pipe',
      reasonIncludes: facade === 'pipe' ? undefined : 'statically primitive-number count',
    })
  }

  expectSame('third take coercion error remains at its source-tier evaluation point', {
    name: 'take-third-coercion-fallback',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const events = [];
      const sentinel = new Error('third take coercion');
      let coercions = 0;
      const count = {
        valueOf() {
          events.push('count:' + ++coercions);
          if (coercions === 3) throw sentinel;
          return 2.75;
        },
      };
      try {
        pipe(
          [1, 2, 3],
          A.map((value) => { events.push('prefix:' + value); return value; }),
          A.take(count),
        );
      } catch (error) {
        return [error === sentinel, events];
      }
      return [false, events];
    `,
    expectTransformed: true,
  })

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
    imports: `import { pipe as p } from '@stopcock/fp'
import * as Arr from '@stopcock/fp/array'`,
    locals: { p: 'pipe', Arr: 'A' },
    body: `return p([1, 2, 3], Arr.map((x) => x + 1));`,
    expectTransformed: true,
  })

  expectSame('namespace import', {
    name: 'namespace-import',
    imports: `import * as FP from '@stopcock/fp'
import * as A from '@stopcock/fp/array'`,
    locals: { FP: 'FP', A: 'A' },
    body: `return FP.pipe([1, 2, 3], A.map((x) => x + 1));`,
    expectTransformed: true,
  })

  it.each([
    [
      'named fusedPipe',
      `import { fusedPipe } from '@stopcock/fp/fusion'
import * as A from '@stopcock/fp/array'
export const out = fusedPipe([1, 2], A.map((x) => x + 1))`,
    ],
    [
      'namespace fusedPipe',
      `import * as FP from '@stopcock/fp/fusion'
import * as A from '@stopcock/fp/array'
export const out = FP.fusedPipe([1, 2], A.map((x) => x + 1))`,
    ],
    [
      'named fusedFlow',
      `import { fusedFlow } from '@stopcock/fp/fusion'
import * as A from '@stopcock/fp/array'
export const run = fusedFlow(A.map((x) => x + 1), A.filter((x) => x > 1))`,
    ],
    [
      'namespace fusedFlow',
      `import * as FP from '@stopcock/fp/fusion'
import * as A from '@stopcock/fp/array'
export const run = FP.fusedFlow(A.map((x) => x + 1), A.filter((x) => x > 1))`,
    ],
  ])('recognizes the public fusion alias surface: %s', (_name, source) => {
    const result = transformStopcockPipelines(source, 'fusion-alias.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it('declines a lexical Array binding instead of changing realm allocation', () => {
    const source = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
export function run() {
  const NativeArray = globalThis.Array
  function CustomArray(length) {
    const out = new NativeArray(length)
    out.marker = 777
    return out
  }
  const Array = class LocalArray {}
  try {
    globalThis.Array = CustomArray
    return pipe([1, 2], A.map((x) => x))
  } finally {
    globalThis.Array = NativeArray
  }
}`
    const result = transformStopcockPipelines(source, 'lexical-array.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0]).toMatchObject({
      transformed: false,
      reasonCodes: ['strict-scope-exclusion'],
    })
    expect(result.diagnostics[0].reason).toContain('lexical Array')
  })

  expectSame('named array operator imports and aliases', {
    name: 'named-array-imports',
    imports: `import { pipe } from '@stopcock/fp'
import { map as mapArray, sum as total } from '@stopcock/fp/array'`,
    locals: { pipe: 'pipe', mapArray: 'map', total: 'sum' },
    body: `return pipe([1, 2, 3], mapArray((x) => x + 1), total);`,
    expectTransformed: true,
  })

  expectSame('array source is derived from a custom package root', {
    name: 'custom-derived-array-source',
    imports: `import { pipe as p } from '@acme/fp'
import { map as mapArray, sum as total } from '@acme/fp/array'`,
    locals: { p: 'pipe', mapArray: 'map', total: 'sum' },
    body: `return p([1, 2, 3], mapArray((x) => x + 1), total);`,
    expectTransformed: true,
    options: { importSources: ['@acme/fp'] },
  })

  expectSame('array source can be configured independently', {
    name: 'custom-explicit-array-source',
    imports: `import { pipe as p } from '@acme/fp'
import { map as mapArray, sum as total } from '@acme/collections'`,
    locals: { p: 'pipe', mapArray: 'map', total: 'sum' },
    body: `return p([1, 2, 3], mapArray((x) => x + 1), total);`,
    expectTransformed: true,
    options: {
      importSources: ['@acme/fp'],
      arrayImportSources: ['@acme/collections'],
    },
  })

  it('legacy root A imports are not treated as the v2 array surface', () => {
    const source = `
      import { pipe, A } from '@stopcock/fp'
      const out = pipe([1, 2, 3], A.map((x) => x * 2));
    `
    const result = transformStopcockPipelines(source, 'legacy-root-array.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].reason).toContain('unrecognized step')
  })

  it('does not mistake a shadowed function parameter for the imported pipe', () => {
    const source = `
      import { pipe } from '@stopcock/fp'
      import * as A from '@stopcock/fp/array'
      function run(pipe) {
        return pipe([1, 2, 3], A.map((x) => x * 2));
      }
    `
    const result = transformStopcockPipelines(source, 'shadowed-pipe.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics).toEqual([])
  })

  it('does not mistake shadowed named or namespace bindings for array imports', () => {
    const namespaceSource = `
      import { pipe } from '@stopcock/fp'
      import * as A from '@stopcock/fp/array'
      function run(A) {
        return pipe([1, 2, 3], A.map((x) => x * 2));
      }
    `
    const namedSource = `
      import { pipe } from '@stopcock/fp'
      import { map, sum } from '@stopcock/fp/array'
      function run(map) {
        return pipe([1, 2, 3], map((x) => x * 2), sum);
      }
    `

    for (const [id, source] of [
      ['shadowed-array-namespace.ts', namespaceSource],
      ['shadowed-array-operator.ts', namedSource],
    ] as const) {
      const result = transformStopcockPipelines(source, id, {
        diagnostics: 'verbose',
      })
      expect(result.code).toBe(source)
      expect(result.diagnostics[0].reason).toContain('unrecognized step')
    }
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
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const steps = [A.map((x) => x * 2)];
      const out = pipe([1, 2, 3], ...steps);
    `
    const result = transformStopcockPipelines(source, 'spread.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('spread')
  })

  it('dynamic step factories are left unchanged', () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      function getStep() { return A.map((x) => x * 2); }
      const out = pipe([1, 2, 3], getStep());
    `
    const result = transformStopcockPipelines(source, 'dynamic.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unrecognized step')
  })

  it('compile() with one static step is transformed', () => {
    const source = `
import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
      const run = compile(A.map((x) => x * 2));
    `
    const result = transformStopcockPipelines(source, 'compile.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it.each([
    ['source expression', `const out = pipe(eval('_d0'), A.map((x) => x));`],
    ['inlined callback', `const out = pipe([1], A.map((x) => eval('_d0')));`],
  ])('declines unshadowed direct eval in a %s', (_name, body) => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
${body}
`
    const result = transformStopcockPipelines(source, 'direct-eval.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0]).toMatchObject({
      transformed: false,
      reasonCodes: ['strict-scope-exclusion'],
    })
    expect(result.diagnostics[0].reason).toContain('direct eval')
  })

  it.each([
    [
      'before a pipeline in the same function',
      `export function run() {
  const observed = eval('typeof _src')
  return [observed, pipe([1], A.map((x) => x))]
}`,
    ],
    [
      'after a pipeline in the same function',
      `export function run() {
  const out = pipe([1], A.map((x) => x))
  return [out, eval('typeof _src')]
}`,
    ],
    [
      'inside a closure elsewhere in the module',
      `const inspect = () => eval('typeof _src')
export const out = pipe([1], A.map((x) => x))
export { inspect }`,
    ],
  ])('declines every transform when direct eval appears %s', (_name, body) => {
    const source = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
${body}
`
    const result = transformStopcockPipelines(source, 'file-direct-eval.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatchObject({
      transformed: false,
      reasonCodes: ['strict-scope-exclusion'],
    })
  })

  it('still transforms when the only eval call is indirect', () => {
    const source = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
globalThis.eval('typeof _src')
export const out = pipe([1], A.map((x) => x))
`
    const result = transformStopcockPipelines(source, 'indirect-eval.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it.each([
    [
      '_src declaration',
      `const _src = 'user'
export const out = pipe([1], A.map((x) => x))`,
    ],
    [
      '_d0 callback capture',
      `const _d0 = 10
export const out = pipe([1], A.map((x) => x + _d0))`,
    ],
    [
      '_c0 tail capture',
      `const _c0 = 10
const makePredicate = () => (x) => x > _c0
export function run(input) { return pipe(input, A.some(makePredicate())) }`,
    ],
  ])('declines a non-hygienic generated-local collision: %s', (_name, body) => {
    const source = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
${body}
`
    const result = transformStopcockPipelines(source, 'local-collision.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0]).toMatchObject({
      transformed: false,
      reasonCodes: ['strict-scope-exclusion'],
    })
    expect(result.diagnostics[0].reason).toContain('not hygienic')
  })

  expectSame('a colliding tail-only local falls back to the hygienic general emitter', {
    name: 'tail-only-local-collision',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const _reduceAcc0 = 100;
      const run = (items) =>
        pipe(items, A.reduce((acc, value) => acc + value + _reduceAcc0, 0));
      return run([1, 2]);
    `,
    expectTransformed: true,
  })

  it('selects a fresh loop label when an escaped outer label is active', () => {
    const source = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
export function run() {
  \\u005fouter: {
    const out = pipe([1,2], A.map((x) => x), A.some((x) => x > 1))
    break \\u005fouter
  }
}
`
    const result = transformStopcockPipelines(source, 'escaped-label.ts', {
      diagnostics: 'verbose',
    })
    expect(result.diagnostics[0].transformed).toBe(true)
    expect(result.code).toContain('_outer1:')
    expect(() =>
      parse(result.code, { sourceType: 'module', plugins: ['typescript'] }),
    ).not.toThrow()
  })

  it('detects an escaped spelling of a generated identifier', () => {
    const source = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
const \\u005fsrc = 10
export const out = pipe([1], A.map((x) => x + \\u005fsrc))
`
    const result = transformStopcockPipelines(source, 'escaped-identifier.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0]).toMatchObject({
      transformed: false,
      reasonCodes: ['strict-scope-exclusion'],
    })
    expect(result.diagnostics[0].reason).toContain('_src')
  })

  it('flow() is left untransformed and noted as deferred', () => {
    const source = `
import { flow } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const run = flow(A.map((x) => x * 2));
    `
    const result = transformStopcockPipelines(source, 'flow.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].reason).toContain('deferred')
  })

  it('scan is lowered as an exact full-array boundary', () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const out = pipe([1, 2, 3], A.scan((acc, x) => acc + x, 0));
    `
    const result = transformStopcockPipelines(source, 'scan.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it('without is lowered as an exact full-array boundary', () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const out = pipe([1, 2, 3], A.without([2]));
    `
    const result = transformStopcockPipelines(source, 'without.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it('toArray (synthetic sink, no real op) is left unchanged', () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const out = pipe([1, 2, 3], A.map((x) => x), A.toArray());
    `
    const result = transformStopcockPipelines(source, 'toarray.ts', { diagnostics: 'verbose' })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('unknown op: toArray')
  })

  it('compile() with a single step is transformed without changing flow() identity semantics', () => {
    const source = `
import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
      const run = compile(A.map((x) => x * 2));
      const out = run([1, 2, 3]);
    `
    const result = transformStopcockPipelines(source, 'compile-single.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it('flow() containing scan lowers through a full-array boundary', () => {
    const source = `
import { flow } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const run = flow(A.map((x) => x * 2), A.scan((acc, x) => acc + x, 0));
      const out = run([1, 2, 3]);
    `
    const result = transformStopcockPipelines(source, 'flow-scan.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it('compile() with spread arguments stays deferred', () => {
    const source = `
import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
      const steps = [A.map((x) => x * 2), A.filter((x) => x > 0)];
      const run = compile(...steps);
      const out = run([1, 2, 3]);
    `
    const result = transformStopcockPipelines(source, 'compile-spread.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].reason).toContain('spread')
  })

  it('findIndex() invoked with too many args is left unchanged', () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const out = pipe([1, 2, 3], A.findIndex((x) => x > 1, 2));
    `
    const result = transformStopcockPipelines(source, 'findindex-arity.ts', {
      diagnostics: 'verbose',
    })
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
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
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
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const a = pipe([1, 2], A.map((x) => x + 1));
      const b = pipe([3, 4], A.sum);
    `
    const result = transformStopcockPipelines(source, 'multi.ts', { diagnostics: 'verbose' })
    expect(result.diagnostics.filter((d) => d.transformed)).toHaveLength(2)
  })
})

describe('transformStopcockPipelines: diagnostics', () => {
  it('keeps a parser-failed candidate visible and fails closed in error mode', () => {
    const source = `import { pipe } from '@stopcock/fp'
export const result = pipe([1, 2],`
    const verbose = transformStopcockPipelines(source, 'parse-failure.ts', {
      diagnostics: 'verbose',
    })

    expect(verbose.code).toBe(source)
    expect(verbose.diagnostics[0]).toMatchObject({
      transformed: false,
      fallbackTier: 'sequential',
      reasonCodes: ['compiler-defect'],
      opNames: [],
    })
    expect(verbose.diagnostics[0].reason).toContain('could not be parsed')
    expect(() =>
      transformStopcockPipelines(source, 'parse-failure.ts', {
        diagnostics: 'error',
      }),
    ).toThrow('could not be parsed')
  })

  it('diagnostics: false returns no diagnostics', () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const out = pipe([1, 2, 3], A.map((x) => x * 2));
    `
    const result = transformStopcockPipelines(source, 'diag-false.ts', { diagnostics: false })
    expect(result.diagnostics).toEqual([])
  })

  it('diagnostics: "error" throws on a skipped recognized pipeline', () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const out = pipe([1, 2, 3], ...[A.map((x) => x * 2)]);
    `
    expect(() =>
      transformStopcockPipelines(source, 'diag-error.ts', { diagnostics: 'error' }),
    ).toThrow()
  })

  it('diagnostics: "error" also fails deferred compile/flow sites', () => {
    const source = `
import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
const steps = [A.map((x) => x * 2)]
const run = compile(...steps)
`
    expect(() =>
      transformStopcockPipelines(source, 'diag-compile-error.ts', {
        diagnostics: 'error',
      }),
    ).toThrow(/skipped compile/u)
  })

  it('records exact semantics by default and explicit pure assumptions', () => {
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const out = pipe([1, 2, 3], A.map((x) => x * 2), A.sum);
    `
    const exact = transformStopcockPipelines(source, 'exact.ts', {
      diagnostics: 'verbose',
    })
    const pure = transformStopcockPipelines(source, 'pure.ts', {
      assumePure: true,
      diagnostics: 'verbose',
    })

    expect(exact.semantics).toBe('exact')
    expect(exact.diagnostics[0].semantics).toBe('exact')
    expect(pure.semantics).toBe('pure')
    expect(pure.diagnostics[0].semantics).toBe('pure')
  })

  it('does not emit hidden generic-iterable materialization', () => {
    const source = `
import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
      const run = compile(A.map((x) => x * 2), A.sum);
    `
    const result = transformStopcockPipelines(source, 'array-runner.ts', {
      diagnostics: 'verbose',
    })

    expect(result.code).not.toContain('Array.from')
    expect(result.code).not.toContain('Symbol.iterator')
  })
})

describe('transformStopcockPipelines: source maps', () => {
  it('generates a map pointing back at the original source for a transformed site', () => {
    const source = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
const out = pipe([1, 2, 3], A.map((x) => x * 2), A.sum);`
    const result = transformStopcockPipelines(source, 'sourcemap.ts', { diagnostics: 'summary' })
    expect(result.map).toBeTruthy()
    expect(result.map!.mappings.length).toBeGreaterThan(0)
    const original = JSON.parse(result.map!.toString()).sourcesContent[0]
    expect(original).toBe(source)
  })
})

describe('dead import pruning', () => {
  const run = (source: string) =>
    transformStopcockPipelines(source, '/repo/src/a.ts', { diagnostics: 'summary' }).code

  it('removes both the consumed facade import and the elided factory import', () => {
    const out = run(`import { pipe } from '@stopcock/fp'
import { filter, map } from '@stopcock/fp/array'
export const r = pipe([1,2,3], map((x) => x * 2), filter((x) => x > 2))
`)
    // Fully lowered: neither factory call survives, so the array import is
    // dead code too.
    expect(out).not.toContain('@stopcock/fp/array')
    expect(out).not.toContain("from '@stopcock/fp'")
  })

  it('prunes the factory import from full and receiver-insensitive residual sites alike', () => {
    const out = run(`import { pipe } from '@stopcock/fp'
import { filter, map } from '@stopcock/fp/array'
export const a = pipe([1,2,3], map((x) => x * 2), filter((x) => x > 2))
export const b = pipe([1,2,3], map((x) => x * 2), (xs) => xs)
`)
    // `b`'s arrow tail is receiver-insensitive, not a step-vector residual,
    // so it does not retain map's construction either. Both sites are
    // fully elided and the array import has nothing left to reference.
    expect(out).not.toContain('@stopcock/fp/array')
    expect(out).not.toContain("from '@stopcock/fp'")
    expect(out).not.toContain('filter')
  })

  it('retains the factory import a step-vector residual genuinely constructs', () => {
    const out = run(`import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
function tail(xs) { return xs }
export const r = pipe([1,2,3], map((x) => x * 2), tail)
`)
    // A plain function residual on the root facade takes the step-vector
    // ABI, which genuinely consumes the constructed map operator. Its
    // construction is observable, so the import must stay.
    expect(out).toContain("import { map } from '@stopcock/fp/array'")
    expect(out).toContain('_c1 = (map((x) => x * 2))')
  })

  it('leaves a type-only import alone', () => {
    const out = run(`import type { Option } from '@stopcock/fp/option'
import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const r = pipe([1,2,3], map((x) => x * 2))
export type T = Option<number>
`)
    expect(out).toContain("import type { Option } from '@stopcock/fp/option'")
  })

  it('leaves a side-effect import alone', () => {
    const out = run(`import '@stopcock/fp'
import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const r = pipe([1,2,3], map((x) => x * 2))
`)
    expect(out).toContain("import '@stopcock/fp'")
  })

  it('keeps an alias that is still referenced elsewhere', () => {
    const out = run(`import { pipe } from '@stopcock/fp'
import { map as m } from '@stopcock/fp/array'
export const r = pipe([1,2,3], m((x) => x * 2))
export const other = m((x) => x + 1)
`)
    expect(out).toContain("import { map as m } from '@stopcock/fp/array'")
  })

  it('leaves a file with nothing transformed untouched', () => {
    const source = `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const r = pipe([1,2,3], (xs) => xs, map((x) => x * 2))
`
    expect(run(source)).toBe(source)
  })

  it.each([
    [
      'compile from the root facade',
      `import { compile } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const run = compile(map(Number))
`,
    ],
    [
      'operators from a nonexistent fusion subpath',
      `import { pipe } from '@stopcock/fp/fusion'
import { map } from '@stopcock/fp/fusion/array'
export const result = pipe([1,2,3], map(Number))
`,
    ],
  ])('never turns an invalid public import into working output: %s', (_name, source) => {
    const result = transformStopcockPipelines(source, '/repo/src/invalid-surface.ts', {
      diagnostics: 'summary',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics.every((site) => site.transformed === false)).toBe(true)
  })
})
