import { describe, expectTypeOf, it } from 'vitest'
import {
  callbackArity,
  stopcockFp,
  transformStopcockPipelines,
  type CompilerSemantics,
  type DiagnosticSite,
  type StopcockCompilerOptions,
  type TransformResult,
} from '../index'
import { stopcockFp as esbuildStopcockFp } from '../esbuild'
import { stopcockFp as rollupStopcockFp } from '../rollup'
import { stopcockFp as viteStopcockFp } from '../vite'

describe('public compiler types', () => {
  it('exposes semantic mode in options and diagnostics', () => {
    const options = {
      assumePure: true,
      importSources: ['@stopcock/fp'],
      arrayImportSources: ['@stopcock/fp/array'],
      compileImportSources: ['@stopcock/fp/compile'],
      fallbackTiers: {
        '@stopcock/fp': 'sequential',
      },
      diagnostics: 'verbose',
    } satisfies StopcockCompilerOptions
    const result = transformStopcockPipelines('', 'fixture.ts', options)

    expectTypeOf(result).toEqualTypeOf<TransformResult>()
    expectTypeOf(result.semantics).toEqualTypeOf<CompilerSemantics>()
    expectTypeOf(result.diagnostics).toEqualTypeOf<readonly DiagnosticSite[]>()
    expectTypeOf(stopcockFp.vite(options)).toBeObject()
    expectTypeOf(viteStopcockFp(options)).toBeObject()
    expectTypeOf(rollupStopcockFp(options)).toBeObject()
    expectTypeOf(esbuildStopcockFp(options)).toBeObject()
    expectTypeOf(callbackArity('map')).toEqualTypeOf<
      0 | 1 | 2 | undefined
    >()
  })
})
