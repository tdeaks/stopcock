import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vite-plus/test'
import {
  createFpPackageFileEvidence,
  createFpPackageFileSetIdentity,
  createFpPackageProjectionEvidence,
  createFpPackageSizeReport,
  deriveFpPackageTopology,
  evaluateFpPackageSizeReport,
  type FpPackageArtifactReceipts,
  type FpPackageRawFile,
  type FpPackageSizeReport,
} from './fp-package-size-gate'

const HASH_A = `sha256:${'a'.repeat(64)}`
const HASH_B = `sha256:${'b'.repeat(64)}`

const manifest = (exports: Readonly<Record<string, unknown>>): FpPackageRawFile => ({
  path: 'package.json',
  content: `${JSON.stringify(
    {
      name: '@stopcock/fp',
      version: '2.0.0-next.0',
      type: 'module',
      sideEffects: false,
      files: ['dist', 'README.md', 'LICENSE'],
      exports,
    },
    null,
    2,
  )}\n`,
})

const publicEntry = (name: string): Readonly<{ types: string; import: string }> =>
  Object.freeze({
    types: `./dist/${name}.d.ts`,
    import: `./dist/${name}.js`,
  })

const commonFiles = (): readonly FpPackageRawFile[] => [
  { path: 'README.md', content: '# Stopcock\n' },
  { path: 'LICENSE', content: 'MIT\n' },
  {
    path: 'dist/index.d.ts',
    content: "export type { PublicValue } from './types.js'\n",
  },
  {
    path: 'dist/compile.d.ts',
    content:
      "import type { PublicValue } from './types.js'\nexport declare const compile: PublicValue\n",
  },
  { path: 'dist/array.d.ts', content: 'export declare const map: unknown\n' },
  { path: 'dist/types.d.ts', content: 'export interface PublicValue { readonly id: number }\n' },
  { path: 'dist/orphan.d.ts', content: 'export interface InternalOnly {}\n' },
]

const legacyFiles = (
  engineContent = "export const engine = 'renamed'\n",
): readonly FpPackageRawFile[] => [
  manifest({
    '.': publicEntry('index'),
    './compile': publicEntry('compile'),
    './array': publicEntry('array'),
    './package.json': './package.json',
  }),
  ...commonFiles(),
  {
    path: 'dist/index.js',
    content:
      "import { engine } from './engine-renamed.js'\nimport './root-only.js'\nexport { engine }\n",
  },
  {
    path: 'dist/compile.js',
    content: "export { engine as compile } from './engine-renamed.js'\n",
  },
  { path: 'dist/array.js', content: 'export const map = (value) => value\n' },
  { path: 'dist/root-only.js', content: 'export const root = true\n' },
  { path: 'dist/engine-renamed.js', content: engineContent },
]

const tieredFiles = (
  options: Readonly<{
    rootImportsOptimized?: boolean
    duplicateInternalRuntime?: boolean
    duplicateExportTargetRuntime?: boolean
    duplicatePublicRuntimeTargets?: boolean
    orphanJavascript?: boolean
  }> = {},
): readonly FpPackageRawFile[] => {
  const sharedTierContent = options.duplicateInternalRuntime
    ? "export const tier = 'duplicated'\n"
    : undefined
  const duplicatePublicContent = options.duplicatePublicRuntimeTargets
    ? "export { sequential } from './sequential.js'\n"
    : undefined
  return [
    manifest({
      '.': publicEntry('index'),
      './compile': publicEntry('compile'),
      './array': publicEntry('array'),
      './fusion': {
        types: './dist/compile.d.ts',
        import: './dist/fusion.js',
      },
      './fusion/optimized': {
        types: './dist/compile.d.ts',
        import: './dist/fusion-optimized.js',
      },
      './fusion/debug': {
        types: './dist/compile.d.ts',
        import: './dist/fusion-debug.js',
      },
      './package.json': './package.json',
    }),
    ...commonFiles(),
    {
      path: 'dist/index.js',
      content:
        duplicatePublicContent ??
        (options.rootImportsOptimized
          ? "export { optimized as pipe } from './optimized-engine.js'\n"
          : "export { sequential as pipe } from './sequential.js'\n"),
    },
    {
      path: 'dist/compile.js',
      content: "export { optimized as compile } from './optimized-engine.js'\n",
    },
    {
      path: 'dist/array.js',
      content:
        duplicatePublicContent ??
        (options.duplicateExportTargetRuntime
          ? "export const optimized = 'optimized'\n"
          : 'export const map = (value) => value\n'),
    },
    {
      path: 'dist/fusion.js',
      content: "export { compact as pipeFused } from './compact-engine.js'\n",
    },
    {
      path: 'dist/fusion-optimized.js',
      content:
        "export { compact } from './compact-engine.js'\nexport { optimized } from './optimized-engine.js'\n",
    },
    {
      path: 'dist/fusion-debug.js',
      content:
        "export { compact } from './compact-engine.js'\nexport { debug } from './debug-engine.js'\n",
    },
    { path: 'dist/sequential.js', content: 'export const sequential = (value) => value\n' },
    { path: 'dist/compact-engine.js', content: "export const compact = 'compact'\n" },
    {
      path: 'dist/optimized-engine.js',
      content: sharedTierContent ?? "export const optimized = 'optimized'\n",
    },
    {
      path: 'dist/debug-engine.js',
      content: sharedTierContent ?? "export const debug = 'debug'\n",
    },
    ...(options.orphanJavascript
      ? [{ path: 'dist/orphan.js', content: 'export const orphan = true\n' }]
      : []),
  ]
}

const makeReport = (
  rawFiles: readonly FpPackageRawFile[],
  options: Readonly<{
    sourceTarballBytes?: number
    projectionTarballBytes?: number
  }> = {},
): FpPackageSizeReport => {
  const files = createFpPackageFileEvidence(rawFiles)
  const topology = deriveFpPackageTopology(files)
  const sourceTarball = {
    path: '/tmp/stopcock-fp-source.tgz',
    sha256: HASH_A,
    bytes: options.sourceTarballBytes ?? 124_807,
    ...createFpPackageFileSetIdentity(files),
  } as const
  const projection = createFpPackageProjectionEvidence(topology, files, sourceTarball.sha256, {
    path: '/tmp/stopcock-fp-projection.tgz',
    sha256: HASH_B,
    bytes: options.projectionTarballBytes ?? 61_174,
    fileCount: 99,
    fileSetSha256: HASH_A,
  })
  return createFpPackageSizeReport({
    generatedAt: '2026-07-24T12:00:00.000Z',
    files,
    tarball: sourceTarball,
    topology,
    projection,
  })
}

const artifactReceiptsFor = (report: FpPackageSizeReport): FpPackageArtifactReceipts =>
  Object.freeze({
    sourceTarball: Object.freeze({ ...report.tarball }),
    projectionTarball: Object.freeze({ ...report.projection.packedTarball }),
  })

const evaluate = (report: FpPackageSizeReport, artifactReceipts = artifactReceiptsFor(report)) =>
  evaluateFpPackageSizeReport(report, artifactReceipts)

describe('@stopcock/fp topology-neutral package-size policy', () => {
  test('accepts the current legacy shape without depending on a chunk filename', () => {
    const report = makeReport(legacyFiles())
    expect(report.topology.mode).toBe('legacy')
    expect(report.topology.legacy?.sharedDirectArtifacts).toEqual(['dist/engine-renamed.js'])
    expect(report.topology.declarations.unreachable).toEqual(['dist/orphan.d.ts'])
    expect(evaluate(report)).toEqual({ passed: true, failures: [] })
  })

  test('retains the legacy-only shared-runtime and tarball ceilings', () => {
    const entropy = Array.from({ length: 2_000 }, (_, index) =>
      createHash('sha256').update(String(index)).digest('hex'),
    ).join('')
    const oversizedRuntime = makeReport(
      legacyFiles(`export const engine = ${JSON.stringify(entropy)}\n`),
    )
    expect(
      evaluate(oversizedRuntime).failures.some((failure) =>
        failure.includes('legacy shared runtime gzip is'),
      ),
    ).toBe(true)

    const oversizedTarball = makeReport(legacyFiles(), { sourceTarballBytes: 150_001 })
    expect(evaluate(oversizedTarball).failures).toContain(
      'legacy packed @stopcock/fp tarball is 150001 bytes; budget is 150000',
    )
  })

  test('accepts a clean tiered graph and does not apply the legacy tarball ceiling', () => {
    const report = makeReport(tieredFiles(), { sourceTarballBytes: 175_000 })
    expect(report.topology.mode).toBe('tiered')
    expect(report.topology.tiered?.optimizedExclusiveArtifacts).toContain(
      'dist/optimized-engine.js',
    )
    expect(report.topology.tiered?.debugExclusiveArtifacts).toContain('dist/debug-engine.js')
    expect(evaluate(report)).toEqual({ passed: true, failures: [] })
  })

  test('rejects partial tier exports and import paths that escape the package', () => {
    const partial = tieredFiles().map((file) => {
      if (file.path !== 'package.json') return file
      const parsed = JSON.parse(file.content) as { exports: Record<string, unknown> }
      delete parsed.exports['./fusion/optimized']
      delete parsed.exports['./fusion/debug']
      return { path: file.path, content: `${JSON.stringify(parsed, null, 2)}\n` }
    })
    expect(() => deriveFpPackageTopology(createFpPackageFileEvidence(partial))).toThrow(
      'partial fusion export topology is forbidden',
    )

    const escaped = legacyFiles().map((file) =>
      file.path === 'dist/array.js'
        ? { ...file, content: "export * from '../../outside.js'\n" }
        : file,
    )
    expect(() => createFpPackageFileEvidence(escaped)).toThrow('non-canonical packed path')

    const computedImport = legacyFiles().map((file) =>
      file.path === 'dist/array.js'
        ? {
            ...file,
            content: "const target = './engine-renamed.js'\nexport { target }\nimport(target)\n",
          }
        : file,
    )
    expect(() => createFpPackageFileEvidence(computedImport)).toThrow(
      'unsupported non-literal dynamic import',
    )

    const commonJsEdge = legacyFiles().map((file) =>
      file.path === 'dist/array.js'
        ? { ...file, content: "export const engine = require('./engine-renamed.js')\n" }
        : file,
    )
    expect(() => createFpPackageFileEvidence(commonJsEdge)).toThrow(
      'unsupported CommonJS require edge',
    )
  })

  test('rejects optimized/debug reachability from root and direct entries', () => {
    const report = makeReport(tieredFiles({ rootImportsOptimized: true }))
    const evaluation = evaluate(report)
    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures).toContain(
      'root or direct specialist entry reaches optimized/debug-only runtime artifacts',
    )
  })

  test('enforces mode-specific duplicate policy and rejects unreachable runtime artifacts', () => {
    const duplicates = makeReport(tieredFiles({ duplicateInternalRuntime: true }))
    expect(evaluate(duplicates).failures).toContain(
      'tiered package contains duplicate runtime artifacts',
    )

    const exportTargetDuplicate = makeReport(tieredFiles({ duplicateExportTargetRuntime: true }))
    expect(evaluate(exportTargetDuplicate).failures).toContain(
      'tiered package contains duplicate runtime artifacts',
    )

    const publicTargetDuplicates = makeReport(tieredFiles({ duplicatePublicRuntimeTargets: true }))
    expect(evaluate(publicTargetDuplicates).failures).toContain(
      'tiered package contains duplicate runtime artifacts',
    )

    const unexpectedLegacyDuplicate = makeReport(
      legacyFiles().map((file) =>
        file.path === 'dist/root-only.js'
          ? { ...file, content: 'export const map = (value) => value\n' }
          : file,
      ),
    )
    expect(evaluate(unexpectedLegacyDuplicate).failures).toContain(
      'legacy package contains unexpected duplicate runtime artifacts',
    )

    const allowedLegacyFiles = legacyFiles()
      .map((file) => {
        if (file.path !== 'package.json') return file
        const parsed = JSON.parse(file.content) as { exports: Record<string, unknown> }
        parsed.exports['./readonly-array'] = publicEntry('readonly-array')
        return { path: file.path, content: `${JSON.stringify(parsed, null, 2)}\n` }
      })
      .concat([
        { path: 'dist/readonly-array.d.ts', content: 'export declare const map: unknown\n' },
        { path: 'dist/readonly-array.js', content: 'export const map = (value) => value\n' },
      ])
    const allowedLegacyDuplicate = makeReport(allowedLegacyFiles)
    expect(allowedLegacyDuplicate.topology.duplicateRuntimeArtifacts).toHaveLength(1)
    expect(allowedLegacyDuplicate.topology.duplicateRuntimeArtifacts[0]?.paths).toEqual([
      'dist/array.js',
      'dist/readonly-array.js',
    ])
    expect(evaluate(allowedLegacyDuplicate)).toEqual({ passed: true, failures: [] })

    const orphan = makeReport(tieredFiles({ orphanJavascript: true }))
    expect(evaluate(orphan).failures).toContain(
      'package contains JavaScript unreachable from public exports',
    )

    const legacyOrphan = makeReport([
      ...legacyFiles(),
      { path: 'dist/orphan.js', content: 'export const orphan = true\n' },
    ])
    expect(evaluate(legacyOrphan).failures).toContain(
      'package contains JavaScript unreachable from public exports',
    )
  })

  test('fails an already-impossible same-package lower-bound projection', () => {
    const report = makeReport(legacyFiles(), { projectionTarballBytes: 100_000 })
    const evaluation = evaluate(report)
    expect(evaluation.passed).toBe(false)
    expect(evaluation.failures).toContain(
      'same-package lower-bound projection is 100000 bytes; stable maximum is strictly below 100000',
    )
  })

  test('recomputes file, topology, and projection identities', () => {
    const file = structuredClone(makeReport(legacyFiles()))
    file.files[0].sha256 = HASH_B
    expect(evaluate(file).failures).toContain(
      'packed file identity, compression, or import graph is inconsistent',
    )

    const topology = structuredClone(makeReport(legacyFiles()))
    topology.topology.entries[0].closure = []
    expect(evaluate(topology).failures).toContain(
      'reported package topology does not match the packed export/import graph',
    )

    const projection = structuredClone(makeReport(legacyFiles()))
    projection.projection.optimizedClosureSha256 = HASH_B
    expect(evaluate(projection).failures).toContain(
      'lower-bound projection is not bound to the source graph and packed evidence',
    )

    const sourceGraph = structuredClone(makeReport(legacyFiles()))
    sourceGraph.tarball.fileSetSha256 = HASH_B
    expect(evaluate(sourceGraph).failures).toContain(
      'source packed tarball receipt is not bound to the reported file graph',
    )
  })

  test('rejects self-consistent source and projection tarball substitution', () => {
    const report = makeReport(legacyFiles())
    const artifactReceipts = artifactReceiptsFor(report)
    const substituted = structuredClone(report)
    substituted.tarball = {
      path: '/tmp/substituted-source.tgz',
      sha256: `sha256:${'c'.repeat(64)}`,
      bytes: 120_000,
      fileCount: report.tarball.fileCount,
      fileSetSha256: report.tarball.fileSetSha256,
    }
    substituted.projection.sourceTarballSha256 = substituted.tarball.sha256
    substituted.projection.packedTarball = {
      path: '/tmp/substituted-projection.tgz',
      sha256: `sha256:${'d'.repeat(64)}`,
      bytes: 60_000,
      fileCount: 99,
      fileSetSha256: `sha256:${'e'.repeat(64)}`,
    }
    substituted.projection.plausibleBelowStableMaximum = true

    const evaluation = evaluate(substituted, artifactReceipts)
    expect(evaluation.failures).toContain(
      'source packed tarball evidence does not match the independently read artifact',
    )
    expect(evaluation.failures).toContain(
      'lower-bound projected tarball evidence does not match the independently read artifact',
    )
  })
})
