import { describe, expect, it } from 'vitest'
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

  expectSame('map allocation falls back for a lexical Array binding', {
    name: 'map-shadowed-array',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const Array = function PoisonedArray() {
        throw new Error('must not use a shadowed Array')
      };
      return pipe([1, 2, 3], A.map((x) => x + 1));
    `,
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

  it('simplifies a definitely-present conditional filterMap', () => {
    const source = `
${STD_IMPORTS}
export const run = (input) =>
  pipe(input, A.filterMap((x) => x % 3 === 1 ? x * 2 + 1 : undefined))
`
    const result = transformStopcockPipelines(source, 'filter-map-direct.ts')
    expect(result.code).toContain('_d0.push((_v0 * 2 + 1));')
    expect(result.code).not.toContain('var _m0')
    expect(result.code).not.toContain('?')
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
    expect(result.code).not.toContain('A.scan(')
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

  expectSame('direct scan ignores a lexical Array binding', {
    name: 'scan-shadowed-array',
    imports: STD_IMPORTS,
    locals: { pipe: 'pipe', A: 'A' },
    body: `
      const Array = function PoisonedArray() {
        throw new Error('must not use a shadowed Array')
      }
      return pipe([1, 2, 3], A.scan((acc, x) => acc + x, 0))
    `,
    expectTransformed: true,
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
    expect(result.code).not.toContain('?')
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

  it('direct-writes a fixed-width literal flatMap without per-item arrays', () => {
    const source = `
${STD_IMPORTS}
export const run = (input) => pipe(input, A.flatMap((x) => [x, x + 1]))
`
    const result = transformStopcockPipelines(source, 'flat-map-literal.ts')
    expect(result.code).toContain('var _fmLen0 = _src.length;')
    expect(result.code).toContain('var _d0 = new Array(_fmLen0 * 2);')
    expect(result.code).toContain('_d0[_i * 2 + 0] = (_v0);')
    expect(result.code).toContain('_d0[_i * 2 + 1] = (_v0 + 1);')
    expect(result.code).not.toContain('var _fm0 =')
    expect(result.code).not.toContain('_d0.push(')
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
    expect(result.code).not.toContain('?')
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
    expect(result.code).toContain('const _src = (values);')
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

  it('fuses a fixed-width literal map directly through flatten', () => {
    const source = `
${STD_IMPORTS}
export const run = (input) =>
  pipe(input, A.map((x) => [x, x + 1]), A.flatten)
`
    const result = transformStopcockPipelines(source, 'map-flatten.ts')
    expect(result.code).toContain('var _d0 = new Array(_fmLen0 * 2);')
    expect(result.code).toContain('_d0[_i * 2 + 0] = (_v0);')
    expect(result.code).toContain('_d0[_i * 2 + 1] = (_v0 + 1);')
    expect(result.code).not.toContain('_boundary1')
    expect(result.code).not.toContain('var _d1')
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
    expect(result.code).toContain('function __run(input) {\n  return input.length === 0;\n}')
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
    imports: `import { pipe, compile, flow } from '@stopcock/fp'
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
    imports: `import { pipe, compile, flow } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'`,
    locals: { pipe: 'pipe', A: 'A', compile: 'compile', flow: 'flow' },
    body: `
      const run = flow(A.map((x) => x + 1), A.filter((x) => x % 2 === 0), A.reduce((acc, x) => acc + x, 0));
      return run([1, 2, 3, 4, 5]);
    `,
    expectTransformed: true,
  })

  expectSame('compile() captures factories and bound values once', {
    name: 'compile-construction-timing',
    imports: `import { compile } from '@stopcock/fp'
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

  it('retains compilePure runtime rewrites until equivalent AOT templates exist', () => {
    for (const [name, steps] of [
      ['top-k', 'A.sort, A.take(2)'],
      ['map-length', 'A.map((x) => x + 1), A.length'],
    ] as const) {
      const source = `
import { compilePure } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
const run = compilePure(${steps})
`
      const result = transformStopcockPipelines(source, `compile-pure-${name}.ts`, {
        diagnostics: 'verbose',
      })
      expect(result.code).toBe(source)
      expect(result.diagnostics[0].reason).toContain('retained portable compilePure optimization')
    }
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
import { compile } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
      const run = compile(A.map((x) => x * 2));
    `
    const result = transformStopcockPipelines(source, 'compile.ts', { diagnostics: 'verbose' })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
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
import { compile } from '@stopcock/fp'
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
import { compile } from '@stopcock/fp'
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
import { compile } from '@stopcock/fp'
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
import { compile } from '@stopcock/fp'
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

  it('removes imports a fused site consumed entirely', () => {
    const out = run(`import { pipe } from '@stopcock/fp'
import { filter, map } from '@stopcock/fp/array'
export const r = pipe([1,2,3], map((x) => x * 2), filter((x) => x > 2))
`)
    expect(out).not.toContain('@stopcock/fp/array')
    expect(out).not.toContain("from '@stopcock/fp'")
  })

  it('retains exactly what a fallback site still needs', () => {
    const out = run(`import { pipe } from '@stopcock/fp'
import { filter, map } from '@stopcock/fp/array'
export const a = pipe([1,2,3], map((x) => x * 2), filter((x) => x > 2))
export const b = pipe([1,2,3], map((x) => x * 2), (xs) => xs)
`)
    expect(out).toContain("import { map } from '@stopcock/fp/array'")
    expect(out).toContain("import { pipe } from '@stopcock/fp'")
    expect(out).not.toContain('filter')
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
export const r = pipe([1,2,3], map((x) => x * 2), (xs) => xs)
`
    expect(run(source)).toBe(source)
  })
})
