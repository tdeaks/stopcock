import { parse } from '@babel/parser'
import { describe, expect, it } from 'vite-plus/test'
import { buildCompilerReceipt, type ReceiptContext } from '../receipt-emit'
import {
  COMPILER_EMITTER_ABI_V1_HASH,
  OPERATOR_MANIFEST_V1_HASH,
} from '../ops-table'
import { renderCheckReportV1 } from '../receipt-report'
import { validateReceiptV1 } from '../receipt-schema.generated'
import { transformStopcockPipelines } from '../transform'
import { runFixture, type Fixture } from './harness'

const IMPORTS = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'`
const LOCALS = { pipe: 'pipe', A: 'A' }

const fixture = (
  name: string,
  body: string,
  expectTransformed = true,
): Fixture => ({
  name,
  imports: IMPORTS,
  locals: LOCALS,
  body,
  expectTransformed,
})

describe('static-prefix residual lowering', () => {
  it('compiles a known prefix and directly invokes one opaque unary tail', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-basic',
        `const finish = (xs) => xs.join(':')
         return pipe([1,2,3], A.map((x) => x * 2), finish)`,
      ),
    )
    expect(result.transformed).toBe(true)
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual(result.original.value)
  })

  it('captures source, operator bindings, and the opaque tail before executing the prefix', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-order',
        `const source = () => { log.push('source'); return [1,2] }
         const makeCallback = () => {
           log.push('callback-binding')
           return (x) => { log.push('callback-' + x); return x * 2 }
         }
         const makeTail = () => {
           log.push('opaque-binding')
           return (xs) => { log.push('opaque-call'); return xs.join(':') }
         }
         const value = pipe(source(), A.map(makeCallback()), makeTail())
         return [value, log.join(',')]`,
      ),
      () => ({ log: [] as string[] }),
    )
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual(result.original.value)
    expect((result.compiled.value as readonly unknown[])[1]).toBe(
      'source,callback-binding,opaque-binding,callback-1,callback-2,opaque-call',
    )
  })

  it('does not run prefix callbacks when opaque-tail construction throws', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-throw-order',
        `const makeTail = () => { log.push('opaque-binding'); throw new Error('stop') }
         try {
           pipe([1,2], A.map((x) => { log.push('callback-' + x); return x }), makeTail())
         } catch (error) {
           return [error.message, log.join(',')]
         }`,
      ),
      () => ({ log: [] as string[] }),
    )
    expect(result.compiled.value).toEqual(result.original.value)
    expect(result.compiled.value).toEqual(['stop', 'opaque-binding'])
  })

  it('does not evaluate later bindings after the source or a prefix binding throws', () => {
    for (const body of [
      `const source = () => { log.push('source'); throw new Error('source') }
       const makeCallback = () => { log.push('callback-binding'); return Number }
       const makeTail = () => { log.push('opaque-binding'); return (xs) => xs }
       try { pipe(source(), A.map(makeCallback()), makeTail()) } catch (error) {
         return [error.message, log.join(',')]
       }`,
      `const makeCallback = () => { log.push('callback-binding'); throw new Error('callback') }
       const makeTail = () => { log.push('opaque-binding'); return (xs) => xs }
       try { pipe([1], A.map(makeCallback()), makeTail()) } catch (error) {
         return [error.message, log.join(',')]
       }`,
    ]) {
      const result = runFixture(
        fixture('prefix-residual-binding-throw', body),
        () => ({ log: [] as string[] }),
      )
      expect(result.compiled.value).toEqual(result.original.value)
    }
  })

  it('allows a scalar terminal to end the compiled prefix', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-terminal',
        `return pipe([1,2,3], A.sum, String)`,
      ),
    )
    expect(result.transformed).toBe(true)
    expect(result.compiled.value).toBe(result.original.value)
    expect(result.compiled.value).toBe('6')
  })

  it('preserves the root runtime step-vector receiver for an opaque tail', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-step-vector',
        `function tail(xs) {
           const before = [
             Array.isArray(this),
             this.length,
             this[1] === tail,
             typeof this[0],
             typeof this[0]._op,
           ]
           this.marker = 'seen'
           return [...before, this.marker, xs.join(':')]
         }
         return pipe([1,2], A.map((x) => x + 1), tail)`,
      ),
    )
    expect(result.compiled.value).toEqual(result.original.value)
    expect(result.compiled.value).toEqual([
      true,
      2,
      true,
      'function',
      'number',
      'seen',
      '2:3',
    ])
  })

  it('evaluates a member getter once but invokes its result through the step vector', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-member-getter',
        `const receiver = {
           get tail() {
             log.push('getter')
             return function (xs) {
               return [this === receiver, Array.isArray(this), this.length, xs.join(':')]
             }
           }
         }
         const value = pipe([1,2], A.map((x) => x + 1), receiver.tail)
         return [value, log.join(',')]`,
      ),
      () => ({ log: [] as string[] }),
    )
    expect(result.compiled.value).toEqual(result.original.value)
    expect(result.compiled.value).toEqual([[false, true, 2, '2:3'], 'getter'])
  })

  it('retains a bound opaque tail receiver', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-bound-tail',
        `const receiver = { tag: 'bound' }
         function tail(xs) { return [this.tag, xs.join(':')] }
         return pipe([1,2], A.map((x) => x + 1), tail.bind(receiver))`,
      ),
    )
    expect(result.compiled.value).toEqual(result.original.value)
    expect(result.compiled.value).toEqual(['bound', '2:3'])
  })

  it('does not trust a whole step public binding after later argument evaluation mutates it', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-forged-public-binding',
        `let constructed
         const previous = Object.getOwnPropertyDescriptor(Function.prototype, '_op')
         Object.defineProperty(Function.prototype, '_op', {
           configurable: true,
           set(value) {
             constructed = this
             Object.defineProperty(this, '_op', {
               configurable: true,
               writable: true,
               value,
             })
           },
         })
         try {
           const makeTail = () => {
             constructed._fn = () => 1000
             return (xs) => xs
           }
           return pipe([1,2], A.map((x) => x + 1), makeTail())
         } finally {
           if (previous === undefined) delete Function.prototype._op
           else Object.defineProperty(Function.prototype, '_op', previous)
         }`,
      ),
    )
    expect(result.compiled.value).toEqual(result.original.value)
    expect(result.compiled.value).toEqual([2, 3])
  })

  it('keeps this and arguments in the original lexical function', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-lexical-runtime',
        `const object = {
           tail: (xs) => xs.join(':'),
           run() { return pipe([1,2], A.map((x) => x + 1), this.tail) }
         }
         function withArguments(tail) {
           return pipe([3,4], A.map((x) => x + 1), arguments[0])
         }
         return [object.run(), withArguments((xs) => xs.join(':'))]`,
      ),
    )
    expect(result.compiled.value).toEqual(result.original.value)
    expect(result.compiled.value).toEqual(['2:3', '4:5'])
  })

  it('preserves reduce callback-before-seed construction order', () => {
    const result = runFixture(
      fixture(
        'reduce-construction-order',
        `const makeCallback = () => {
           log.push('callback')
           return (acc, value) => acc + value
         }
         const makeSeed = () => { log.push('seed'); return 0 }
         const value = pipe([1,2], A.reduce(makeCallback(), makeSeed()))
         return [value, log.join(',')]`,
      ),
      () => ({ log: [] as string[] }),
    )
    expect(result.compiled.value).toEqual(result.original.value)
    expect(result.compiled.value).toEqual([3, 'callback,seed'])
  })

  it.each([
    [
      'opaque middle step',
      `const tail = (xs) => xs
       return pipe([1,2], A.map((x) => x), tail, A.filter(Boolean))`,
    ],
    [
      'dynamic-only pipeline',
      `const tail = (xs) => xs
       return pipe([1,2], tail)`,
    ],
    [
      'spread steps',
      `const steps = [A.map((x) => x), (xs) => xs]
       return pipe([1,2], ...steps)`,
    ],
  ])('leaves %s on the original runtime tier', (_name, body) => {
    const result = runFixture(fixture('prefix-residual-decline', body, false))
    expect(result.transformed).toBe(false)
    expect(result.compiled.value).toEqual(result.original.value)
  })

  it.each([
    ['conditional', `const tail = (xs) => xs; return true ? pipe([1], A.map(Number), tail) : []`],
    ['call argument', `const id = (x) => x; const tail = (xs) => xs; return id(pipe([1], A.map(Number), tail))`],
    ['class field', `const tail = (xs) => xs; class C { value = pipe([1], A.map(Number), tail) }; return new C().value`],
    ['default parameter', `const tail = (xs) => xs; const f = (value = pipe([1], A.map(Number), tail)) => value; return f()`],
  ])('declines the unsafe %s expression context', (_name, body) => {
    const result = runFixture(fixture('prefix-residual-context', body, false))
    expect(result.transformed).toBe(false)
    expect(result.reason).toContain('requires a declaration')
    expect(result.compiled.value).toEqual(result.original.value)
  })

  it('declines rather than colliding with an existing generated local', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-hygiene',
        `const _src = 'user'
         const tail = (xs) => [_src, xs]
         return pipe([1], A.map(Number), tail)`,
        false,
      ),
    )
    expect(result.transformed).toBe(false)
    expect(result.reason).toContain('not hygienic')
    expect(result.compiled.value).toEqual(result.original.value)
  })

  it('keeps multiple residual sites independent', () => {
    const result = runFixture(
      fixture(
        'prefix-residual-multiple',
        `const tail = (xs) => xs.join(':')
         const first = pipe([1,2], A.map((x) => x + 1), tail)
         const second = pipe([3,4], A.map((x) => x * 2), tail)
         return [first, second]`,
      ),
    )
    expect(result.compiled.value).toEqual(result.original.value)
    expect(result.compiled.value).toEqual(['2:3', '6:8'])
  })

  it('diagnostics error mode rejects an unsafe residual host', () => {
    const source = `${IMPORTS}
const id = (x) => x
const tail = (xs) => xs
export const result = id(pipe([1], A.map(Number), tail))
`
    expect(() =>
      transformStopcockPipelines(source, 'unsafe-residual.ts', {
        diagnostics: 'error',
      }),
    ).toThrow('prefix residual lowering requires')
  })

  it('emits lexical await, yield, new.target, and super expressions without an IIFE', () => {
    const source = `${IMPORTS}
async function asyncTail(xs) {
  return pipe(xs, A.map(Number), await Promise.resolve((ys) => ys))
}
function* generatorTail(xs) {
  return pipe(xs, A.map(Number), yield ((ys) => ys))
}
function Construct(xs) {
  return pipe(xs, A.map(Number), new.target ? (ys) => ys : (ys) => ys.slice())
}
class Base { make() { return (ys) => ys } }
class Child extends Base {
  run(xs) { return pipe(xs, A.map(Number), super.make()) }
}`
    const result = transformStopcockPipelines(source, 'lexical-residual.ts', {
      diagnostics: 'verbose',
    })
    expect(result.diagnostics).toHaveLength(4)
    expect(result.diagnostics.every((site) => site.transformed)).toBe(true)
    expect(result.code).not.toContain('(function () {')
    expect(() =>
      parse(result.code, { sourceType: 'module', plugins: ['typescript'] }),
    ).not.toThrow()
  })
})

describe('residual imports, receipts, and fallback tiers', () => {
  it('accepts current semantic and lowering pins', () => {
    const source = `${IMPORTS}
export const result = pipe([1,2], A.map((x) => x + 1))
`
    const result = transformStopcockPipelines(source, 'current-pins.ts', {
      diagnostics: 'verbose',
      expectedSemanticManifestHash: OPERATOR_MANIFEST_V1_HASH,
      expectedLoweringAbiHash: COMPILER_EMITTER_ABI_V1_HASH,
    })
    expect(result.code).not.toBe(source)
    expect(result.diagnostics[0].transformed).toBe(true)
  })

  it.each([
    ['semantic', 'expectedSemanticManifestHash', 'stale-semantic-hash'],
    ['lowering', 'expectedLoweringAbiHash', 'stale-lowering-hash'],
  ] as const)('fails closed when the %s selection pin is stale', (
    _name,
    option,
    reasonCode,
  ) => {
    const source = `${IMPORTS}
export const result = pipe([1,2], A.map((x) => x + 1))
`
    const result = transformStopcockPipelines(source, '/repo/src/stale-pin.ts', {
      diagnostics: 'verbose',
      [option]: `sha256:${'0'.repeat(64)}`,
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0]).toMatchObject({
      transformed: false,
      fallbackTier: 'sequential',
      reasonCodes: [reasonCode],
    })
    const receipt = buildCompilerReceipt(result.diagnostics[0], source, {
      root: '/repo',
      configHash: `sha256:${'1'.repeat(64)}`,
      emittedCode: null,
      sourceMap: null,
    })
    expect(receipt).toMatchObject({
      disposition: 'fallback',
      fallbackTier: 'sequential',
      reasonCodes: [reasonCode],
    })
  })

  it('fails a stale lowering pin closed for deferred runners too', () => {
    const source = `import { flow } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
export const run = flow(A.map(Number), A.filter(Boolean))
`
    const result = transformStopcockPipelines(source, 'stale-runner.ts', {
      diagnostics: 'verbose',
      expectedLoweringAbiHash: `sha256:${'f'.repeat(64)}`,
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0]).toMatchObject({
      transformed: false,
      fallbackTier: 'sequential',
      reasonCodes: ['stale-lowering-hash'],
    })
  })

  it('retains operator imports when the root step vector must contain actual step values', () => {
    const source = `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
const tail = (values) => values
export const result = pipe([1,2], map((x) => x + 1), tail)
`
    const result = transformStopcockPipelines(source, 'residual-import.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toContain("import { map } from '@stopcock/fp/array'")
    expect(result.code).not.toContain("from '@stopcock/fp'")
  })

  it('compiles a receiver-insensitive arrow residual on the compact facade', () => {
    const source = `import { pipe } from '@stopcock/fp/fusion'
import { map } from '@stopcock/fp/array'
export const result = pipe([1,2], map((x) => x + 1), (xs) => xs.join(':'))
`
    const result = transformStopcockPipelines(source, 'compact-arrow-residual.ts', {
      diagnostics: 'verbose',
    })
    expect(result.diagnostics[0]).toMatchObject({
      transformed: true,
      reasonCodes: ['opaque-callback'],
    })
    expect(result.code).toContain('@stopcock/fp/array')
  })

  it('declines an ordinary-function residual on a facade with a path-dependent receiver', () => {
    const source = `import { pipe } from '@stopcock/fp/fusion'
import { map } from '@stopcock/fp/array'
function tail(xs) { return [this, xs] }
export const result = pipe([1,2], map(Number), tail)
`
    const result = transformStopcockPipelines(source, 'compact-function-residual.ts', {
      diagnostics: 'verbose',
    })
    expect(result.code).toBe(source)
    expect(result.diagnostics[0]).toMatchObject({
      transformed: false,
      fallbackTier: 'compact',
      reasonCodes: ['opaque-callback', 'unsupported-layout'],
    })
    expect(result.diagnostics[0].reason).toContain('receiver ABI')
  })

  it('retains a managed namespace referenced from re-emitted JSX', () => {
    const source = `import * as FP from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const result = FP.pipe([1,2], map(Number), (xs) => <FP.Widget xs={xs} />)
`
    const result = transformStopcockPipelines(source, 'residual-import.tsx', {
      diagnostics: 'verbose',
    })
    expect(result.code).toContain("import * as FP from '@stopcock/fp'")
    expect(result.code).toContain('<FP.Widget')
    expect(result.code).toContain("import { map }")
  })

  it('emits a schema-valid opaque-segment receipt with a lowering identity', () => {
    const source = `${IMPORTS}
const tail = (xs) => xs
export const result = pipe([1,2], A.map(Number), tail)
`
    const result = transformStopcockPipelines(source, '/repo/src/residual.ts', {
      diagnostics: 'verbose',
    })
    const context: ReceiptContext = {
      root: '/repo',
      configHash: `sha256:${'0'.repeat(64)}`,
      emittedCode: result.code,
      sourceMap: JSON.stringify(result.map),
    }
    const receipt = buildCompilerReceipt(result.diagnostics[0], source, context)
    expect(receipt?.segmentKinds).toEqual(['stream', 'opaque'])
    expect(receipt?.reasonCodes).toEqual(['opaque-callback'])
    expect(receipt?.fallbackTier).toBe('none')
    expect(receipt?.loweringHash).toMatch(/^sha256:[a-f0-9]{64}$/u)
    const validation = validateReceiptV1(receipt)
    expect(validation.ok ? [] : validation.errors).toEqual([])

    const unsupported = renderCheckReportV1({
      receipts: [receipt!],
      plans: [],
      profiles: [],
      evidence: [],
      policies: ['unsupported'],
    })
    expect(unsupported.status).toBe('failed')
    const strict = renderCheckReportV1({
      receipts: [receipt!],
      plans: [],
      profiles: [],
      evidence: [],
      policies: [
        {
          kind: 'stopcock.check-policy',
          schemaVersion: 1,
          policyId: 'fully-static',
          forbidReasonCodes: ['opaque-callback'],
        },
      ],
    })
    expect(strict.status).toBe('failed')
  })

  it.each([
    ['@stopcock/fp', '@stopcock/fp/array', 'sequential'],
    ['@stopcock/fp/fusion', '@stopcock/fp/array', 'compact'],
  ] as const)('records the %s runtime tier when an unsafe residual is declined', (
    rootSource,
    arraySource,
    tier,
  ) => {
    const source = `import { pipe } from '${rootSource}'
import * as A from '${arraySource}'
const id = (x) => x
const tail = (xs) => xs
export const result = id(pipe([1], A.map(Number), tail))
`
    const result = transformStopcockPipelines(source, '/repo/fallback-tier.ts', {
      diagnostics: 'verbose',
    })
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].fallbackTier).toBe(tier)
    const receipt = buildCompilerReceipt(result.diagnostics[0], source, {
      root: '/repo',
      configHash: `sha256:${'0'.repeat(64)}`,
      emittedCode: null,
      sourceMap: null,
    })
    expect(receipt?.disposition).toBe('fallback')
    expect(receipt?.fallbackTier).toBe(tier)
  })

  it('records the compatibility compile entry as compact', () => {
    const source = `import { compile } from '@stopcock/fp/compile'
import * as A from '@stopcock/fp/array'
const tail = (xs) => xs
export const run = compile(A.map(Number), tail)
`
    const result = transformStopcockPipelines(source, 'compile-tier.ts', {
      diagnostics: 'verbose',
    })
    expect(result.diagnostics[0].transformed).toBe(false)
    expect(result.diagnostics[0].fallbackTier).toBe('compact')
  })

  it('does not infer a custom wrapper tier from its spelling', () => {
    const root = '@acme/fp-compact-proxy'
    const source = `import { pipe } from '${root}'
import * as A from '${root}/array'
const id = (x) => x
const tail = (xs) => xs
export const result = id(pipe([1], A.map(Number), tail))
`
    const baseOptions = {
      diagnostics: 'verbose' as const,
      importSources: [root],
      arrayImportSources: [`${root}/array`],
    }
    const conservative = transformStopcockPipelines(source, 'custom-tier.ts', baseOptions)
    expect(conservative.diagnostics[0].fallbackTier).toBe('compiler')
    const declared = transformStopcockPipelines(source, 'custom-tier.ts', {
      ...baseOptions,
      fallbackTiers: { [root]: 'compact' },
    })
    expect(declared.diagnostics[0].fallbackTier).toBe('compact')
  })
})
