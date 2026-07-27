import { describe, expect, it } from 'vite-plus/test'
import { transformStopcockPipelines } from '../transform'
import { runFixture, type Fixture } from './harness'

/**
 * S11 expression-context corpus.
 *
 * The compiler splices a fused loop into the position the `pipe()` call
 * occupied. Where that position owns a whole statement it emits statements
 * directly; everywhere else it has to keep an IIFE or decline. Both are fine.
 * What is not fine is changing what the program means, and the positions where
 * that could happen quietly are the awkward ones: a conditional that must not
 * evaluate the untaken branch, a logical operator that must short-circuit, an
 * argument list with a fixed evaluation order, a loop body, a `try` block,
 * `this` inside a method, `arguments`, a shadowed binding, a TDZ window.
 *
 * Every fixture runs twice — once as written, once compiled — and the two must
 * agree on the value, on any thrown error, and on the order of recorded side
 * effects.
 */

const IMPORTS = `import { pipe } from '@stopcock/fp'
import { filter, map, reduce, find, some, every } from '@stopcock/fp/array'`

const LOCALS = {
  pipe: 'pipe',
  filter: 'filter',
  map: 'map',
  reduce: 'reduce',
  find: 'find',
  some: 'some',
  every: 'every',
}

const fixture = (name: string, body: string): Fixture => ({
  name,
  imports: IMPORTS,
  locals: LOCALS,
  body,
  expectTransformed: true,
})

/** Contexts where the result is a value and nothing else is observable. */
const VALUE_CONTEXTS: readonly (readonly [string, string])[] = [
  ['variable declarator', `const r = pipe([1,2,3], map((x) => x * 2)); return r`],
  ['return statement', `return pipe([1,2,3], map((x) => x * 2))`],
  ['arrow expression body', `const f = () => pipe([1,2,3], map((x) => x * 2)); return f()`],
  ['conditional consequent', `return true ? pipe([1,2,3], map((x) => x * 2)) : []`],
  ['conditional alternate', `return false ? [] : pipe([1,2,3], map((x) => x * 2))`],
  ['logical or right', `return null ?? pipe([1,2,3], map((x) => x * 2))`],
  ['logical and right', `return 1 && pipe([1,2,3], map((x) => x * 2))`],
  ['call argument', `const id = (v) => v; return id(pipe([1,2,3], map((x) => x * 2)))`],
  ['array literal element', `return [pipe([1,2,3], map((x) => x * 2))][0]`],
  ['object literal value', `return { v: pipe([1,2,3], map((x) => x * 2)) }.v`],
  ['template literal', `return \`\${pipe([1,2,3], map((x) => x * 2))}\``],
  ['spread element', `return [...pipe([1,2,3], map((x) => x * 2))]`],
  ['member callee receiver', `return pipe([1,2,3], map((x) => x * 2)).length`],
  ['nested pipe as source', `return pipe(pipe([1,2,3], map((x) => x * 2)), filter((x) => x > 2))`],
  ['loop body', `let t = 0; for (let i = 0; i < 2; i++) { t += pipe([1,2,3], map((x) => x * 2)).length } return t`],
  ['while body', `let n = 0; let t = 0; while (n < 2) { t += pipe([1,2], map((x) => x)).length; n++ } return t`],
  ['try block', `try { return pipe([1,2,3], map((x) => x * 2)) } catch { return 'caught' }`],
  ['catch block', `try { throw new Error('x') } catch { return pipe([1,2,3], map((x) => x * 2)) }`],
  ['finally block', `let r; try { r = 1 } finally { r = pipe([1,2,3], map((x) => x * 2)) } return r`],
  ['switch case', `switch (1) { case 1: return pipe([1,2,3], map((x) => x * 2)); default: return [] }`],
  ['class method', `class C { m() { return pipe([1,2,3], map((x) => x * 2)) } } return new C().m()`],
  ['class field initializer', `class C { v = pipe([1,2,3], map((x) => x * 2)) } return new C().v`],
  ['static block', `class C { static v; static { C.v = pipe([1,2,3], map((x) => x * 2)) } } return C.v`],
  ['getter', `const o = { get v() { return pipe([1,2,3], map((x) => x * 2)) } }; return o.v`],
  ['default parameter', `const f = (a = pipe([1,2,3], map((x) => x * 2))) => a; return f()`],
  ['comma expression', `return (0, pipe([1,2,3], map((x) => x * 2)))`],
  ['sink: reduce', `return pipe([1,2,3], map((x) => x * 2), reduce((a, b) => a + b, 0))`],
  ['sink: find', `return pipe([1,2,3], map((x) => x * 2), find((x) => x > 2))`],
  ['shadowed callback param', `const x = 100; return pipe([1,2,3], map((x) => x + 1))`],
  ['shadowed outer binding', `const map2 = 1; return pipe([1,2,3], map((x) => x + map2))`],
  ['this inside a method', `const o = { k: 10, m() { return pipe([1,2,3], map((x) => x * this.k)) } }; return o.m()`],
  ['arguments of the enclosing function', `function outer() { return pipe([1,2], map((x) => x + arguments.length)) } return outer(9)`],
  ['empty source', `return pipe([], map((x) => x * 2))`],
  ['for-of body', `let t = 0; for (const n of [1,2]) { t += pipe([1,2,3], map((x) => x * n)).length } return t`],
  ['for-in body', `let t = 0; for (const k in { a: 1 }) { t += pipe([1,2,3], map((x) => x * 2)).length + k.length } return t`],
  ['do-while body', `let n = 0; let t = 0; do { t += pipe([1,2], map((x) => x)).length; n++ } while (n < 2) return t`],
  ['labeled loop containing a pipeline', `let t = 0; outer: for (let i = 0; i < 2; i++) { t += pipe([1,2], map((x) => x)).length; if (t > 3) break outer } return t`],
  ['generator body in statement position', `function* g() { const r = pipe([1,2,3], map((x) => x * 2)); yield r.length } return [...g()]`],
  ['async arrow expression body', `const f = async () => pipe([1,2,3], map((x) => x * 2)); return f() instanceof Promise`],
  ['setter body', `const seen = []; const o = { set v(next) { seen.push(pipe(next, map((x) => x * 2)).length) } }; o.v = [1,2,3]; return seen`],
  ['unary operand', `return !pipe([1,2,3], map((x) => x * 2)).length`],
  ['typeof operand', `return typeof pipe([1,2,3], map((x) => x * 2))`],
  ['optional call on the result', `return pipe([1,2,3], map((x) => x * 2))?.length`],
  ['for-statement initializer', `let t = 0; for (let i = pipe([1,2,3], map((x) => x * 2)).length; i > 0; i--) { t++ } return t`],
]

describe('compiled pipelines preserve meaning in every expression context', () => {
  it.each(VALUE_CONTEXTS)('%s', (name, body) => {
    const result = runFixture(fixture(name.replace(/\W+/gu, '-'), body))
    expect(result.map).not.toBeNull()
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual(result.original.value)
  })

  it('reports a nested source pipeline separately instead of hiding it in an outer rewrite', () => {
    const source = `${IMPORTS}
export const result = pipe(
  pipe([1,2,3], map((x) => x * 2)),
  filter((x) => x > 2),
)
`
    const transformed = transformStopcockPipelines(source, 'nested-pipe.ts', {
      diagnostics: 'verbose',
    })

    expect(transformed.code).not.toBe(source)
    expect(transformed.diagnostics).toHaveLength(2)
    expect(transformed.diagnostics[0]).toMatchObject({
      transformed: false,
      fallbackTier: 'sequential',
      reasonCodes: ['unsupported-layout'],
    })
    expect(transformed.diagnostics[0].reason).toContain('nested managed pipeline')
    expect(transformed.diagnostics[1]).toMatchObject({ transformed: true })
    expect(transformed.code).toContain('pipe(')
  })
})

/**
 * Short-circuiting and evaluation order are where a spliced statement could
 * silently change behaviour: hoisting a loop out of an untaken branch runs work
 * the program said not to run.
 */
const ORDER_CONTEXTS: readonly (readonly [string, string])[] = [
  [
    'untaken conditional branch does not run the pipeline',
    `const r = false ? pipe([1,2,3], map((x) => { log.push(x); return x })) : 'skipped'; return [r, log.join(',')]`,
  ],
  [
    'short-circuited && does not run the pipeline',
    `const r = false && pipe([1,2,3], map((x) => { log.push(x); return x })); return [r, log.join(',')]`,
  ],
  [
    'short-circuited || does not run the pipeline',
    `const r = true || pipe([1,2,3], map((x) => { log.push(x); return x })); return [r, log.join(',')]`,
  ],
  [
    'nullish short-circuit does not run the pipeline',
    `const r = 'set' ?? pipe([1,2,3], map((x) => { log.push(x); return x })); return [r, log.join(',')]`,
  ],
  [
    'argument evaluation order is left to right',
    `const f = (a, b) => [a, b]; const r = f((log.push('a'), 1), pipe([1], map((x) => { log.push('b'); return x }))); return [r, log.join(',')]`,
  ],
  [
    'the source expression is evaluated exactly once',
    `const src = () => { log.push('src'); return [1,2] }; const r = pipe(src(), map((x) => x)); return [r, log.join(',')]`,
  ],
  [
    'a throwing callback propagates and stops the loop',
    `try { pipe([1,2,3], map((x) => { log.push(x); if (x === 2) throw new Error('boom'); return x })) } catch (e) { return [e.message, log.join(',')] }`,
  ],
  [
    'a short-circuited optional call does not run the pipeline',
    `const o = null; const r = o?.m(pipe([1,2,3], map((x) => { log.push(x); return x }))); return [r, log.join(',')]`,
  ],
  [
    'a short-circuited optional computed member does not run the pipeline',
    `const o = null; const r = o?.[pipe([1], map((x) => { log.push(x); return x }))]; return [r, log.join(',')]`,
  ],
  [
    'logical-or assignment short-circuits away from the pipeline',
    `let v = 'set'; v ||= pipe([1,2,3], map((x) => { log.push(x); return x })); return [v, log.join(',')]`,
  ],
  [
    'logical-and assignment short-circuits away from the pipeline',
    `let v = 0; v &&= pipe([1,2,3], map((x) => { log.push(x); return x })); return [v, log.join(',')]`,
  ],
  [
    'nullish assignment short-circuits away from the pipeline',
    `let v = 'set'; v ??= pipe([1,2,3], map((x) => { log.push(x); return x })); return [v, log.join(',')]`,
  ],
]

describe('compiled pipelines preserve evaluation order and short-circuiting', () => {
  it.each(ORDER_CONTEXTS)('%s', (name, body) => {
    const makeExtra = () => ({ log: [] as unknown[] })
    const result = runFixture(fixture(name.replace(/\W+/gu, '-'), body), makeExtra)
    expect(result.map).not.toBeNull()
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual(result.original.value)
  })
})

describe('expression wrappers preserve lexical function state', () => {
  it.each([
    [
      'this in a call argument',
      `const id = (value) => value
       const object = {
         values: [1,2],
         run() { return id(pipe(this.values, map((x) => x + 1))) }
       }
       return object.run()`,
    ],
    [
      'arguments in a call argument',
      `const id = (value) => value
       function outer() { return id(pipe(arguments[0], map((x) => x + 1))) }
       return outer([1,2])`,
    ],
    [
      'new.target in a call argument',
      `const id = (value) => value
       function Construct(values) {
         return id(pipe(new.target === Construct ? values : [], map((x) => x + 1)))
       }
       return new Construct([1,2])`,
    ],
    [
      'super in a call argument',
      `const id = (value) => value
       class Base { values() { return [1,2] } }
       class Child extends Base {
         run() { return id(pipe(super.values(), map((x) => x + 1))) }
       }
       return new Child().run()`,
    ],
    [
      'an arrow callback capturing this in a call argument',
      `const id = (value) => value
       const object = {
         factor: 3,
         run() { return id(pipe([1,2], map((x) => x * this.factor))) }
       }
       return object.run()`,
    ],
  ] as const)('%s', (_name, body) => {
    const result = runFixture(fixture('lexical-expression-wrapper', body))
    expect(result.transformed).toBe(true)
    expect(result.map).not.toBeNull()
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual(result.original.value)
  })

  it.each([
    [
      'await',
      `async function run() {
         const id = (value) => value
         return id(pipe(await Promise.resolve([1,2]), map(Number)))
       }`,
    ],
    [
      'yield',
      `function* run() {
         const id = (value) => value
         return id(pipe(yield [1,2], map(Number)))
       }`,
    ],
  ] as const)('declines outer %s inside a generated expression wrapper', (_name, body) => {
    const source = `${IMPORTS}
${body}
`
    const result = transformStopcockPipelines(source, 'outer-suspension.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].reason).toContain('outer await or yield')
  })

  it('keeps direct await in its owning async function', () => {
    const source = `${IMPORTS}
async function run() {
  return pipe(await Promise.resolve([1,2]), map(Number))
}
`
    const result = transformStopcockPipelines(source, 'direct-await.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it.each([
    [
      'class extends expression',
      `async function run() {
         const id = (value) => value
         return id(pipe(
           [1],
           map(class extends (await Promise.resolve(class {})) {}),
         ))
       }`,
    ],
    [
      'computed class method key',
      `async function run() {
         const id = (value) => value
         return id(pipe(
           [1],
           map(class { [await Promise.resolve('method')]() {} }),
         ))
       }`,
    ],
  ] as const)('declines outer await in a %s', (_name, body) => {
    const source = `${IMPORTS}
${body}
`
    const result = transformStopcockPipelines(source, 'class-outer-await.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0].reason).toContain('outer await or yield')
  })
})

describe('compiling root pipe preserves sequential callback order and count', () => {
  const run = (body: string) =>
    runFixture(fixture('divergence', body), () => ({ log: [] as unknown[] }))

  it('runs callbacks stage by stage', () => {
    const result = run(
      `const r = pipe([1,2,3], map((x) => { log.push('m' + x); return x * 2 }), filter((x) => { log.push('f' + x); return x > 2 })); return [r, log.join(',')]`,
    )
    expect(result.compiled.value).toEqual(result.original.value)
    expect((result.compiled.value as unknown[])[1]).toBe('m1,m2,m3,f2,f4,f6')
  })

  it('completes the upstream stage before an early-exit terminal', () => {
    const result = run(
      `const r = pipe([1,2,3,4], map((x) => { log.push('m' + x); return x }), find((x) => x === 2)); return [String(r && r.value), log.join(',')]`,
    )
    expect(result.compiled.value).toEqual(result.original.value)
    expect((result.compiled.value as unknown[])[1]).toBe('m1,m2,m3,m4')
  })
})

/**
 * The fused loop replaces N sequential passes with one. Everything above is
 * about where the loop is spliced; this is about whether the loop itself still
 * observes the source the way the sequential tiers do. These are the divergences
 * that would not show up as a wrong shape, only as a wrong answer: a source read
 * twice, a callback built per element, a hole treated as a value, a live length,
 * or an early exit that consumed the wrong number of items.
 */
const ITERATION_SEMANTICS: readonly (readonly [string, string])[] = [
  [
    'the source getter is read exactly once',
    `const o = { get values() { log.push('get'); return [1,2,3] } }; const r = pipe(o.values, map((x) => x * 2)); return [r, log.join(',')]`,
  ],
  [
    'a callback factory runs once, not per element',
    `const make = () => { log.push('make'); return (x) => x * 2 }; const r = pipe([1,2,3], map(make())); return [r, log.join(',')]`,
  ],
  [
    'holes in a sparse source are observed the same way',
    `const src = [1,,3]; const r = pipe(src, map((x) => { log.push(String(x)); return x })); return [r, log.join(',')]`,
  ],
  [
    'appending to the source during iteration does not change the item count',
    `const src = [1,2,3]; const r = pipe(src, map((x) => { if (x === 1) src.push(99); log.push(x); return x })); return [r, log.join(','), src.length]`,
  ],
  [
    'truncating the source during iteration is observed the same way',
    `const src = [1,2,3,4]; const r = pipe(src, map((x) => { if (x === 1) src.length = 2; log.push(x); return x })); return [r, log.join(',')]`,
  ],
  [
    'mutating a later element during iteration is observed the same way',
    `const src = [1,2,3]; const r = pipe(src, map((x) => { if (x === 1) src[2] = 99; log.push(x); return x })); return [r, log.join(',')]`,
  ],
  [
    'find consumes only up to the match',
    `const r = pipe([1,2,3,4], map((x) => { log.push(x); return x }), find((x) => x === 2)); return [String(r && r.value), log.join(',')]`,
  ],
  [
    'some stops at the first true',
    `const r = pipe([1,2,3,4], map((x) => { log.push(x); return x }), some((x) => x === 2)); return [r, log.join(',')]`,
  ],
  [
    'every stops at the first false',
    `const r = pipe([1,2,3,4], map((x) => { log.push(x); return x }), every((x) => x < 2)); return [r, log.join(',')]`,
  ],
  [
    'a throwing predicate leaves the earlier callback log intact',
    `try { pipe([1,2,3], map((x) => { log.push('m' + x); return x }), filter((x) => { if (x === 2) throw new Error('p'); return true })) } catch (e) { return [e.message, log.join(',')] }`,
  ],
  [
    'NaN is matched by find the same way',
    `const r = pipe([1, NaN, 3], map((x) => x), find((x) => Number.isNaN(x))); return String(r && r.value)`,
  ],
  [
    'negative zero survives the fused loop',
    `const r = pipe([-0, 0], map((x) => x)); return [Object.is(r[0], -0), Object.is(r[1], 0)]`,
  ],
]

describe('the fused loop observes the source exactly as the sequential tiers do', () => {
  it.each(ITERATION_SEMANTICS)('%s', (name, body) => {
    const result = runFixture(fixture(name.replace(/\W+/gu, '-'), body), () => ({
      log: [] as unknown[],
    }))
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual(result.original.value)
  })
})

describe('temporal dead zone', () => {
  it('does not hoist a pipeline past a binding it reads', () => {
    // Splicing statements above the declaration would turn a ReferenceError
    // into a working program, which is still a behaviour change.
    const body = `try {
      const r = pipe([1,2,3], map((x) => x * factor))
      return String(r)
    } catch (e) { return e.constructor.name }
    // eslint-disable-next-line no-unused-vars
    `
    const result = runFixture(fixture('tdz', body))
    expect(result.compiled.value).toEqual(result.original.value)
  })
})

/**
 * S11 statement hoisting. Where the call owns a whole statement the compiler
 * emits statements directly instead of an IIFE, which keeps the loop in one
 * call frame. Module bodies host statements as well as function bodies do, and
 * `export const r = pipe(...)` is the most ordinary shape in a module.
 */
describe('module-level sites hoist instead of paying for an IIFE', () => {
  const transformOf = (source: string) =>
    transformStopcockPipelines(source, 'module-level.ts', { diagnostics: 'summary' })

  const PRELUDE = `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
`

  it.each([
    ['exported declaration', `${PRELUDE}export const r = pipe([1,2,3], map((x) => x * 2))`],
    ['plain declaration', `${PRELUDE}const r = pipe([1,2,3], map((x) => x * 2))\nexport { r }`],
    ['expression statement', `${PRELUDE}pipe([1,2,3], map((x) => x * 2))`],
  ])('%s emits no wrapper call', (_label, source) => {
    const out = transformOf(source)
    expect(out.diagnostics.every((site) => site.transformed)).toBe(true)
    expect(out.code).not.toContain('(function () {')
  })

  it('keeps several module-level sites independent', () => {
    // `var` declarations hoist to module scope, so repeated emission has to
    // stay correct rather than merely parse.
    const out = transformOf(`${PRELUDE}export const a = pipe([1,2,3], map((x) => x * 2))
export const b = pipe([4,5], map((x) => x + 1))`)
    expect(out.code).not.toContain('(function () {')
    expect(out.diagnostics.filter((site) => site.transformed)).toHaveLength(2)
  })

  it('does not splice between export and its declaration', () => {
    const out = transformOf(`${PRELUDE}export const r = pipe([1,2,3], map((x) => x * 2))`)
    expect(out.code).not.toMatch(/export\s+var\s+_src/u)
    expect(out.code).toMatch(/export const r = _d0|export const r = _out0/u)
  })
})

/**
 * Operators the compiler lowers as materialising boundaries. The generated
 * code calls the real operator between two loops rather than reimplementing
 * it, so what has to hold is that the surrounding pipeline still fuses, the
 * boundary argument is evaluated once at construction, and the callbacks that
 * do run stay in their original order relative to the neighbouring stages.
 */
const BOUNDARY_IMPORTS = `import { pipe } from '@stopcock/fp'
import { map, filter, sum, length, adjust, aperture, chunk, difference, dropRepeats, groupBy, includes, insert, intersection, intersperse, partition, remove, slidingWindow, symmetricDifference, union, uniqBy, update, xprod, zip, zipWith } from '@stopcock/fp/array'`

const BOUNDARY_LOCALS = Object.fromEntries(
  [
    'pipe', 'map', 'filter', 'sum', 'length', 'adjust', 'aperture', 'chunk',
    'difference', 'dropRepeats', 'groupBy', 'includes', 'insert', 'intersection',
    'intersperse', 'partition', 'remove', 'slidingWindow', 'symmetricDifference',
    'union', 'uniqBy', 'update', 'xprod', 'zip', 'zipWith',
  ].map((name) => [name, name]),
)

const boundaryFixture = (name: string, body: string): Fixture => ({
  name,
  imports: BOUNDARY_IMPORTS,
  locals: BOUNDARY_LOCALS,
  body,
  expectTransformed: true,
})

const SRC = '[3,1,1,4,1,5,9,2,6]'

const BOUNDARY_VALUES: readonly (readonly [string, string])[] = [
  ['adjust', `return pipe(${SRC}, map((x) => x + 1), adjust(2, (x) => x * 10))`],
  ['aperture', `return pipe(${SRC}, map((x) => x + 1), aperture(3))`],
  ['chunk', `return pipe(${SRC}, map((x) => x + 1), chunk(4))`],
  ['difference', `return pipe(${SRC}, map((x) => x + 1), difference([2,3]))`],
  ['dropRepeats', `return pipe(${SRC}, map((x) => x + 1), dropRepeats)`],
  ['groupBy', `return pipe(${SRC}, map((x) => x + 1), groupBy((x) => String(x % 3)))`],
  ['includes', `return pipe(${SRC}, map((x) => x + 1), includes(5))`],
  ['insert', `return pipe(${SRC}, map((x) => x + 1), insert(1, 99))`],
  ['intersection', `return pipe(${SRC}, map((x) => x + 1), intersection([2,5,7]))`],
  ['intersperse', `return pipe(${SRC}, map((x) => x + 1), intersperse(0))`],
  ['partition', `return pipe(${SRC}, map((x) => x + 1), partition((x) => x % 2 === 0))`],
  ['remove', `return pipe(${SRC}, map((x) => x + 1), remove(2, 3))`],
  ['slidingWindow', `return pipe(${SRC}, map((x) => x + 1), slidingWindow(2))`],
  ['symmetricDifference', `return pipe(${SRC}, map((x) => x + 1), symmetricDifference([2,42]))`],
  ['union', `return pipe(${SRC}, map((x) => x + 1), union([42,2]))`],
  ['uniqBy', `return pipe(${SRC}, map((x) => x + 1), uniqBy((x) => x % 4))`],
  ['update', `return pipe(${SRC}, map((x) => x + 1), update(0, 77))`],
  ['xprod', `return pipe(${SRC}, map((x) => x + 1), xprod(['a','b']))`],
  ['zip', `return pipe(${SRC}, map((x) => x + 1), zip(['a','b','c']))`],
  ['zipWith', `return pipe(${SRC}, map((x) => x + 1), zipWith([10,20,30], (a, b) => a + b))`],
  // The segment after a boundary has to fuse on its own.
  ['downstream fuses', `return pipe(${SRC}, chunk(3), map((c) => c.length), sum)`],
  ['two boundaries', `return pipe(${SRC}, dropRepeats, chunk(2), length)`],
  // An empty source still has to reach the boundary.
  ['empty source', `return pipe([], map((x) => x), chunk(2))`],
]

describe('boundary operators keep their runtime meaning inside a compiled pipeline', () => {
  it.each(BOUNDARY_VALUES)('%s', (name, body) => {
    const result = runFixture(boundaryFixture(name.replace(/\W+/gu, '-'), body))
    expect(result.map).not.toBeNull()
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual(result.original.value)
  })
})

const BOUNDARY_ORDER: readonly (readonly [string, string])[] = [
  [
    'the upstream stage completes before a boundary callback runs',
    `const r = pipe([1,2,3], map((x) => { log.push('m' + x); return x }), uniqBy((x) => { log.push('u' + x); return x })); return [r, log.join(',')]`,
  ],
  [
    'a boundary argument is evaluated once, before the loop',
    `const size = () => { log.push('arg'); return 2 }; const r = pipe([1,2,3], map((x) => { log.push('m' + x); return x }), chunk(size())); return [r, log.join(',')]`,
  ],
  [
    'a throwing boundary callback leaves the upstream log intact',
    `try { pipe([1,2,3], map((x) => { log.push('m' + x); return x }), groupBy((x) => { if (x === 2) throw new Error('g'); return String(x) })) } catch (e) { return [e.message, log.join(',')] }`,
  ],
  [
    'a stage after the boundary sees the boundary result',
    `const r = pipe([1,2,3,4], chunk(2), map((c) => { log.push(c.join('+')); return c.length })); return [r, log.join(',')]`,
  ],
]

describe('boundary operators preserve evaluation order', () => {
  it.each(BOUNDARY_ORDER)('%s', (name, body) => {
    const result = runFixture(boundaryFixture(name.replace(/\W+/gu, '-'), body), () => ({
      log: [] as unknown[],
    }))
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual(result.original.value)
  })
})
