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
import { filter, map, reduce, find } from '@stopcock/fp/array'`

const LOCALS = { pipe: 'pipe', filter: 'filter', map: 'map', reduce: 'reduce', find: 'find' }

const fixture = (name: string, body: string): Fixture => ({
  name,
  imports: IMPORTS,
  locals: LOCALS,
  body,
  expectTransformed: false,
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
]

describe('compiled pipelines preserve meaning in every expression context', () => {
  it.each(VALUE_CONTEXTS)('%s', (name, body) => {
    const result = runFixture(fixture(name.replace(/\W+/gu, '-'), body))
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual(result.original.value)
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
]

describe('compiled pipelines preserve evaluation order and short-circuiting', () => {
  it.each(ORDER_CONTEXTS)('%s', (name, body) => {
    const makeExtra = () => ({ log: [] as unknown[] })
    const result = runFixture(fixture(name.replace(/\W+/gu, '-'), body), makeExtra)
    expect(result.original.error).toBeUndefined()
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual(result.original.value)
  })
})

/**
 * A recorded divergence, not a passing guarantee.
 *
 * S8 made root `pipe` sequential and says so: "callbacks run stage by stage
 * rather than interleaved per element". The compiler lowers that same call into
 * a fused loop, so with the plugin enabled the callbacks interleave and an
 * early-exit terminal stops calling upstream ones.
 *
 * The values agree. What differs is the number of callback invocations and
 * their order, which is observable for any effectful callback — so whether a
 * program is correct can depend on whether the build plugin is on.
 *
 * These tests pin the current behaviour so the difference is measured rather
 * than assumed. They are not an endorsement of it.
 */
describe('KNOWN DIVERGENCE: compiling root pipe changes callback order and count', () => {
  const run = (body: string) =>
    runFixture(fixture('divergence', body), () => ({ log: [] as unknown[] }))

  it('interleaves callbacks that the sequential runtime runs stage by stage', () => {
    const result = run(
      `const r = pipe([1,2,3], map((x) => { log.push('m' + x); return x * 2 }), filter((x) => { log.push('f' + x); return x > 2 })); return [r, log.join(',')]`,
    )
    expect((result.original.value as unknown[])[0]).toEqual((result.compiled.value as unknown[])[0])
    expect((result.original.value as unknown[])[1]).toBe('m1,m2,m3,f2,f4,f6')
    expect((result.compiled.value as unknown[])[1]).toBe('m1,f2,m2,f4,m3,f6')
  })

  it('skips upstream callbacks on early exit that the runtime still runs', () => {
    const result = run(
      `const r = pipe([1,2,3,4], map((x) => { log.push('m' + x); return x }), find((x) => x === 2)); return [String(r && r.value), log.join(',')]`,
    )
    expect((result.original.value as unknown[])[0]).toEqual((result.compiled.value as unknown[])[0])
    expect((result.original.value as unknown[])[1]).toBe('m1,m2,m3,m4')
    expect((result.compiled.value as unknown[])[1]).toBe('m1,m2')
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
