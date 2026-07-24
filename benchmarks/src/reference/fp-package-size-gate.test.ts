import { describe, expect, test } from 'vite-plus/test'
import { evaluateFpPackageSizeReport, type FpPackageSizeReport } from './fp-package-size-gate'

const makeReport = (overrides: Partial<FpPackageSizeReport> = {}): FpPackageSizeReport => ({
  generatedAt: '2026-07-23T12:00:00.000Z',
  package: { name: '@stopcock/fp', version: '1.0.0' },
  build: {
    compileFacade: 'compile.js',
    rootFacade: 'index.js',
    sharedChunk: 'compile-ABC_123.js',
  },
  measurements: {
    sharedChunkBytes: 175_000,
    sharedChunkGzipBytes: 15_690,
    packedTarballBytes: 139_210,
  },
  tarball: '/tmp/stopcock-fp-1.0.0.tgz',
  ...overrides,
})

describe('@stopcock/fp package-size release policy', () => {
  test('accepts the characterized build with documented headroom', () => {
    expect(evaluateFpPackageSizeReport(makeReport())).toEqual({
      passed: true,
      failures: [],
    })
  })

  test('fails closed when the shared chunk crosses its gzip budget', () => {
    const report = makeReport({
      measurements: {
        sharedChunkBytes: 200_000,
        sharedChunkGzipBytes: 18_001,
        packedTarballBytes: 139_210,
      },
    })

    const evaluation = evaluateFpPackageSizeReport(report)

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain(
      'shared compile/runtime chunk gzip is 18001 bytes; budget is 18000',
    )
  })

  test('fails closed when the tarball crosses its packed budget', () => {
    const report = makeReport({
      measurements: {
        sharedChunkBytes: 175_000,
        sharedChunkGzipBytes: 15_690,
        packedTarballBytes: 150_001,
      },
    })

    const evaluation = evaluateFpPackageSizeReport(report)

    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures.join('\n')).toContain(
      'packed @stopcock/fp tarball is 150001 bytes; budget is 150000',
    )
  })

  test('rejects malformed topology and measurements', () => {
    const report = makeReport({
      build: {
        compileFacade: 'compile.js',
        rootFacade: 'index.js',
        sharedChunk: 'runtime.js',
      },
      measurements: {
        sharedChunkBytes: 0,
        sharedChunkGzipBytes: Number.NaN,
        packedTarballBytes: -1,
      },
      tarball: 'not-a-tarball',
    })

    const evaluation = evaluateFpPackageSizeReport(report)
    const failures = evaluation.failures.join('\n')

    expect(evaluation.passed).toBe(false)
    expect(failures).toContain('does not identify the shared compile/runtime chunk')
    expect(failures).toContain('not a positive safe integer')
    expect(failures).toContain('no packed tarball path')
  })
})
