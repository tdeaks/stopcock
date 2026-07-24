import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { posix } from 'node:path'

export const FP_PACKAGE_TOPOLOGY_SCHEMA_VERSION = 3 as const
export const FP_PACKAGE_NAME = '@stopcock/fp' as const
export const FP_PACKAGE_LEGACY_SHARED_GZIP_MAXIMUM_BYTES = 18_000
export const FP_PACKAGE_LEGACY_TARBALL_MAXIMUM_BYTES = 150_000
export const FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES = 100_000
export const FP_PACKAGE_LEGACY_ALLOWED_DUPLICATE_RUNTIME_PATH_GROUPS = Object.freeze([
  Object.freeze(['dist/array.js', 'dist/readonly-array.js'] as const),
] as const)

export const FP_PACKAGE_PROJECTION_ASSUMPTIONS = Object.freeze([
  'Retain the complete currently observed optimized-engine JavaScript closure.',
  'Retain declarations reachable from every public export-map types target.',
  'Retain package metadata, README, and LICENSE.',
  'Model planned root, direct-subpath, compact-fusion, and debug JavaScript as isolated lower-bound stubs.',
  'Omit CHANGELOG because its final inclusion policy is deliberately unresolved.',
  'Treat this packed result only as an impossibility test, never as S12 release evidence.',
] as const)

const SHA256 = /^sha256:[0-9a-f]{64}$/u
const FUSION_SPECIFIERS = Object.freeze([
  './fusion',
  './fusion/optimized',
  './fusion/debug',
] as const)

export type FpPackageTopologyMode = 'legacy' | 'tiered'
export type FpPackageFileKind =
  | 'javascript'
  | 'declaration'
  | 'manifest'
  | 'documentation'
  | 'other'

export interface FpPackageRawFile {
  readonly path: string
  readonly content: string
}

export interface FpPackageFileEvidence extends FpPackageRawFile {
  readonly kind: FpPackageFileKind
  readonly sha256: string
  readonly bytes: number
  readonly gzipBytes: number
  readonly imports: readonly string[]
}

export interface FpPackageEntryEvidence {
  readonly specifier: string
  readonly javascript: string
  readonly types: string | null
  readonly closure: readonly string[]
  readonly closureSha256: string
  readonly rawBytes: number
  readonly gzipBytes: number
}

export interface FpPackageTopologyEvidence {
  readonly mode: FpPackageTopologyMode
  readonly entries: readonly FpPackageEntryEvidence[]
  readonly declarations: {
    readonly entryTargets: readonly string[]
    readonly reachable: readonly string[]
    readonly unreachable: readonly string[]
    readonly closureSha256: string
    readonly rawBytes: number
  }
  readonly unreachableJavascript: readonly string[]
  readonly duplicateRuntimeArtifacts: readonly {
    readonly sha256: string
    readonly paths: readonly string[]
  }[]
  readonly legacy: {
    readonly rootEntry: string
    readonly compileEntry: string
    readonly sharedDirectArtifacts: readonly string[]
  } | null
  readonly tiered: {
    readonly rootEntry: string
    readonly compactEntry: string
    readonly optimizedEntry: string
    readonly debugEntry: string
    readonly optimizedExclusiveArtifacts: readonly string[]
    readonly debugExclusiveArtifacts: readonly string[]
    readonly forbiddenTierArtifactsByEntry: readonly {
      readonly specifier: string
      readonly artifacts: readonly string[]
    }[]
  } | null
}

export interface FpPackageProjectionEvidence {
  readonly kind: 'same-package-lower-bound-feasibility-v1'
  readonly sourceTarballSha256: string
  readonly optimizedSourceEntry: string
  readonly optimizedClosure: readonly string[]
  readonly optimizedClosureSha256: string
  readonly optimizedClosureRawBytes: number
  readonly reachableDeclarations: readonly string[]
  readonly reachableDeclarationsSha256: string
  readonly reachableDeclarationRawBytes: number
  readonly assumptions: typeof FP_PACKAGE_PROJECTION_ASSUMPTIONS
  readonly packedTarball: FpPackageTarballEvidence
  readonly stableMaximumBytes: typeof FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES
  readonly plausibleBelowStableMaximum: boolean
}

export interface FpPackageTarballEvidence {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
  readonly fileCount: number
  readonly fileSetSha256: string
}

export interface FpPackageArtifactReceipts {
  readonly sourceTarball: FpPackageTarballEvidence
  readonly projectionTarball: FpPackageTarballEvidence
}

export interface FpPackageSizeReport {
  readonly schemaVersion: typeof FP_PACKAGE_TOPOLOGY_SCHEMA_VERSION
  readonly generatedAt: string
  readonly package: {
    readonly name: typeof FP_PACKAGE_NAME
    readonly version: string
    readonly manifestSha256: string
  }
  readonly tarball: FpPackageTarballEvidence
  readonly files: readonly FpPackageFileEvidence[]
  readonly topology: FpPackageTopologyEvidence
  readonly projection: FpPackageProjectionEvidence
}

export interface FpPackageSizeEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

type PackageExports = Readonly<Record<string, unknown>>

const sha256 = (value: string | Uint8Array): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const packagePath = (value: string): string => {
  if (value.length === 0 || value.includes('\\') || posix.isAbsolute(value)) {
    throw new Error(`unsafe packed path ${JSON.stringify(value)}`)
  }
  const withoutPrefix = value.startsWith('./') ? value.slice(2) : value
  const normalized = posix.normalize(withoutPrefix)
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized !== withoutPrefix
  ) {
    throw new Error(`non-canonical packed path ${JSON.stringify(value)}`)
  }
  return normalized
}

export const createFpPackageFileSetIdentity = (
  files: readonly FpPackageRawFile[],
): Readonly<{ fileCount: number; fileSetSha256: string }> => {
  const normalized = files
    .map(({ path, content }) => ({ path: packagePath(path), content }))
    .sort((left, right) => left.path.localeCompare(right.path))
  if (new Set(normalized.map(({ path }) => path)).size !== normalized.length) {
    throw new Error('packed file list contains duplicates')
  }
  return Object.freeze({
    fileCount: normalized.length,
    fileSetSha256: sha256(JSON.stringify(normalized)),
  })
}

const fileKind = (path: string): FpPackageFileKind => {
  if (path === 'package.json') return 'manifest'
  if (path.endsWith('.d.ts')) return 'declaration'
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'javascript'
  if (/^(?:README|LICENSE|CHANGELOG)(?:\.|$)/u.test(posix.basename(path))) {
    return 'documentation'
  }
  return 'other'
}

const moduleSpecifiers = (content: string, declaration: boolean): readonly string[] => {
  const specifiers = new Set<string>()
  const staticPattern = /\b(?:import|export)\s+(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/gu
  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu
  for (const match of content.matchAll(staticPattern)) {
    if (match[1] !== undefined) specifiers.add(match[1])
  }
  const dynamicMatches = [...content.matchAll(dynamicPattern)]
  for (const match of dynamicMatches) {
    if (match[1] !== undefined) specifiers.add(match[1])
  }
  const dynamicInvocationCount = [...content.matchAll(/\bimport\s*\(/gu)].length
  if (dynamicInvocationCount !== dynamicMatches.length) {
    throw new Error('packed module contains an unsupported non-literal dynamic import')
  }
  if (/\brequire\s*\(/u.test(content)) {
    throw new Error('packed module contains an unsupported CommonJS require edge')
  }
  if (declaration) {
    const referencePattern = /<reference\s+path=["']([^"']+)["']/gu
    for (const match of content.matchAll(referencePattern)) {
      if (match[1] !== undefined) specifiers.add(match[1])
    }
  }
  return Object.freeze([...specifiers].sort())
}

const resolveRelativeImport = (
  importer: string,
  specifier: string,
  paths: ReadonlySet<string>,
  declaration: boolean,
): string | null => {
  if (!specifier.startsWith('.')) return null
  if (specifier.includes('?') || specifier.includes('#') || specifier.includes('\\')) {
    throw new Error(`${importer} has a non-canonical relative import ${specifier}`)
  }
  const joined = packagePath(posix.join(posix.dirname(importer), specifier))
  const candidates = declaration
    ? [
        joined.endsWith('.d.ts')
          ? joined
          : joined.endsWith('.js')
            ? `${joined.slice(0, -3)}.d.ts`
            : `${joined}.d.ts`,
        posix.join(joined, 'index.d.ts'),
      ].filter(Boolean)
    : [joined]
  const resolved = candidates.find((candidate) => paths.has(candidate))
  if (resolved === undefined) {
    throw new Error(`${importer} imports missing packed file ${specifier}`)
  }
  return resolved
}

export const createFpPackageFileEvidence = (
  rawFiles: readonly FpPackageRawFile[],
): readonly FpPackageFileEvidence[] => {
  const normalized = rawFiles.map(({ path, content }) => ({
    path: packagePath(path),
    content,
  }))
  const pathSet = new Set(normalized.map(({ path }) => path))
  if (pathSet.size !== normalized.length) throw new Error('packed file list contains duplicates')
  return Object.freeze(
    normalized
      .map(({ path, content }): FpPackageFileEvidence => {
        const kind = fileKind(path)
        const imports =
          kind === 'javascript' || kind === 'declaration'
            ? moduleSpecifiers(content, kind === 'declaration')
                .map((specifier) =>
                  resolveRelativeImport(path, specifier, pathSet, kind === 'declaration'),
                )
                .filter((resolved): resolved is string => resolved !== null)
            : []
        return Object.freeze({
          path,
          content,
          kind,
          sha256: sha256(content),
          bytes: Buffer.byteLength(content),
          gzipBytes: gzipSync(content, { level: 9 }).byteLength,
          imports: Object.freeze([...new Set(imports)].sort()),
        })
      })
      .sort((left, right) => left.path.localeCompare(right.path)),
  )
}

const conditionTarget = (value: unknown, condition: 'import' | 'types'): string | null => {
  if (typeof value === 'string') return condition === 'import' ? value : null
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Readonly<Record<string, unknown>>
  const selected = record[condition] ?? (condition === 'import' ? record.default : undefined)
  if (typeof selected === 'string') return selected
  if (selected !== undefined) return conditionTarget(selected, condition)
  return null
}

const exportTarget = (
  exports: PackageExports,
  specifier: string,
  condition: 'import' | 'types',
): string | null => {
  const target = conditionTarget(exports[specifier], condition)
  if (target === null) return null
  if (!target.startsWith('./')) {
    throw new Error(`${specifier} ${condition} target must be package-relative`)
  }
  return packagePath(target)
}

const closure = (
  entry: string,
  fileByPath: ReadonlyMap<string, FpPackageFileEvidence>,
  expectedKind: 'javascript' | 'declaration',
): readonly string[] => {
  const visited = new Set<string>()
  const pending = [entry]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined || visited.has(current)) continue
    const file = fileByPath.get(current)
    if (file === undefined) throw new Error(`closure references missing packed file ${current}`)
    if (file.kind !== expectedKind) {
      throw new Error(`${current} is ${file.kind}, expected ${expectedKind}`)
    }
    visited.add(current)
    pending.push(...file.imports)
  }
  return Object.freeze([...visited].sort())
}

const closureSha256 = (
  paths: readonly string[],
  fileByPath: ReadonlyMap<string, FpPackageFileEvidence>,
): string =>
  sha256(
    JSON.stringify(
      [...paths]
        .sort()
        .map((path) => ({ path, sha256: fileByPath.get(path)?.sha256 ?? 'missing' })),
    ),
  )

const entryEvidence = (
  specifier: string,
  javascript: string,
  types: string | null,
  fileByPath: ReadonlyMap<string, FpPackageFileEvidence>,
): FpPackageEntryEvidence => {
  const paths = closure(javascript, fileByPath, 'javascript')
  const artifacts = paths.map((path) => fileByPath.get(path) as FpPackageFileEvidence)
  return Object.freeze({
    specifier,
    javascript,
    types,
    closure: paths,
    closureSha256: closureSha256(paths, fileByPath),
    rawBytes: artifacts.reduce((total, artifact) => total + artifact.bytes, 0),
    gzipBytes: artifacts.reduce((total, artifact) => total + artifact.gzipBytes, 0),
  })
}

const intersection = (left: readonly string[], right: ReadonlySet<string>): readonly string[] =>
  Object.freeze(left.filter((value) => right.has(value)).sort())

const difference = (left: readonly string[], right: ReadonlySet<string>): readonly string[] =>
  Object.freeze(left.filter((value) => !right.has(value)).sort())

const parseManifest = (
  files: readonly FpPackageFileEvidence[],
): {
  readonly content: string
  readonly manifest: Readonly<{
    name?: string
    version?: string
    exports?: PackageExports
  }>
} => {
  const manifestFile = files.find(({ path }) => path === 'package.json')
  if (manifestFile === undefined || manifestFile.kind !== 'manifest') {
    throw new Error('packed package has no package.json')
  }
  const manifest = JSON.parse(manifestFile.content) as Readonly<{
    name?: string
    version?: string
    exports?: PackageExports
  }>
  if (
    manifest.name !== FP_PACKAGE_NAME ||
    typeof manifest.version !== 'string' ||
    manifest.version.length === 0 ||
    manifest.exports === undefined
  ) {
    throw new Error('packed manifest does not identify an exported versioned @stopcock/fp')
  }
  return { content: manifestFile.content, manifest }
}

export const deriveFpPackageTopology = (
  files: readonly FpPackageFileEvidence[],
): FpPackageTopologyEvidence => {
  const { manifest } = parseManifest(files)
  const exports = manifest.exports as PackageExports
  const fileByPath = new Map(files.map((file) => [file.path, file]))
  const fusionCount = FUSION_SPECIFIERS.filter((specifier) =>
    Object.hasOwn(exports, specifier),
  ).length
  if (fusionCount !== 0 && fusionCount !== FUSION_SPECIFIERS.length) {
    throw new Error('partial fusion export topology is forbidden')
  }
  const mode: FpPackageTopologyMode = fusionCount === 0 ? 'legacy' : 'tiered'
  const entries = Object.keys(exports)
    .filter((specifier) => specifier !== './package.json')
    .map((specifier) => {
      const javascript = exportTarget(exports, specifier, 'import')
      if (javascript === null) throw new Error(`${specifier} has no import/default target`)
      const types = exportTarget(exports, specifier, 'types')
      return entryEvidence(specifier, javascript, types, fileByPath)
    })
    .sort((left, right) => left.specifier.localeCompare(right.specifier))

  const typeEntryTargets = Object.keys(exports)
    .map((specifier) => exportTarget(exports, specifier, 'types'))
    .filter((target): target is string => target !== null)
  const reachableDeclarations = new Set<string>()
  for (const target of typeEntryTargets) {
    for (const path of closure(target, fileByPath, 'declaration')) {
      reachableDeclarations.add(path)
    }
  }
  const reachableDeclarationPaths = Object.freeze([...reachableDeclarations].sort())
  const declarationArtifacts = reachableDeclarationPaths.map(
    (path) => fileByPath.get(path) as FpPackageFileEvidence,
  )
  const reachableJavascript = new Set(entries.flatMap((entry) => entry.closure))
  const unreachableJavascript = Object.freeze(
    files
      .filter(({ kind, path }) => kind === 'javascript' && !reachableJavascript.has(path))
      .map(({ path }) => path)
      .sort(),
  )
  const unreachableDeclarations = Object.freeze(
    files
      .filter(({ kind, path }) => kind === 'declaration' && !reachableDeclarations.has(path))
      .map(({ path }) => path)
      .sort(),
  )

  const root = entries.find(({ specifier }) => specifier === '.')
  const compile = entries.find(({ specifier }) => specifier === './compile')
  if (root === undefined || compile === undefined) {
    throw new Error('root and compile export entries are required')
  }

  const entryTargets = new Set(entries.map(({ javascript }) => javascript))
  const trivialEntryStub = (path: string): boolean => {
    const content = fileByPath.get(path)?.content
    return content !== undefined && /^\s*(?:export\s*\{\s*\}\s*;?\s*)?$/u.test(content)
  }
  const duplicateByHash = new Map<string, string[]>()
  for (const file of files) {
    if (file.kind !== 'javascript') continue
    const paths = duplicateByHash.get(file.sha256) ?? []
    paths.push(file.path)
    duplicateByHash.set(file.sha256, paths)
  }
  const duplicateRuntimeArtifacts = [...duplicateByHash]
    .filter(
      ([, paths]) =>
        paths.length > 1 &&
        !paths.every((path) => entryTargets.has(path) && trivialEntryStub(path)),
    )
    .map(([artifactSha256, paths]) =>
      Object.freeze({
        sha256: artifactSha256,
        paths: Object.freeze(paths.sort()),
      }),
    )
    .sort((left, right) => left.sha256.localeCompare(right.sha256))

  let legacy: FpPackageTopologyEvidence['legacy'] = null
  let tiered: FpPackageTopologyEvidence['tiered'] = null
  if (mode === 'legacy') {
    const rootFile = fileByPath.get(root.javascript) as FpPackageFileEvidence
    const compileFile = fileByPath.get(compile.javascript) as FpPackageFileEvidence
    const compileImports = new Set(compileFile.imports)
    legacy = Object.freeze({
      rootEntry: root.javascript,
      compileEntry: compile.javascript,
      sharedDirectArtifacts: intersection(rootFile.imports, compileImports),
    })
  } else {
    const compact = entries.find(({ specifier }) => specifier === './fusion')
    const optimized = entries.find(({ specifier }) => specifier === './fusion/optimized')
    const debug = entries.find(({ specifier }) => specifier === './fusion/debug')
    if (compact === undefined || optimized === undefined || debug === undefined) {
      throw new Error('tiered topology is missing a required fusion entry')
    }
    const compactSet = new Set(compact.closure)
    const optimizedExclusive = difference(optimized.closure, compactSet)
    const debugExclusive = difference(debug.closure, compactSet)
    const forbidden = new Set([...optimizedExclusive, ...debugExclusive])
    const checkedEntries = entries.filter(
      ({ specifier }) =>
        specifier === '.' ||
        (!specifier.startsWith('./fusion') &&
          specifier !== './compile' &&
          specifier !== './package.json'),
    )
    const forbiddenByEntry = checkedEntries
      .map((entry) =>
        Object.freeze({
          specifier: entry.specifier,
          artifacts: intersection(entry.closure, forbidden),
        }),
      )
      .filter(({ artifacts }) => artifacts.length > 0)

    tiered = Object.freeze({
      rootEntry: root.javascript,
      compactEntry: compact.javascript,
      optimizedEntry: optimized.javascript,
      debugEntry: debug.javascript,
      optimizedExclusiveArtifacts: optimizedExclusive,
      debugExclusiveArtifacts: debugExclusive,
      forbiddenTierArtifactsByEntry: Object.freeze(forbiddenByEntry),
    })
  }

  return Object.freeze({
    mode,
    entries: Object.freeze(entries),
    declarations: Object.freeze({
      entryTargets: Object.freeze([...new Set(typeEntryTargets)].sort()),
      reachable: reachableDeclarationPaths,
      unreachable: unreachableDeclarations,
      closureSha256: closureSha256(reachableDeclarationPaths, fileByPath),
      rawBytes: declarationArtifacts.reduce((total, artifact) => total + artifact.bytes, 0),
    }),
    unreachableJavascript,
    duplicateRuntimeArtifacts: Object.freeze(duplicateRuntimeArtifacts),
    legacy,
    tiered,
  })
}

const optimizedEntry = (topology: FpPackageTopologyEvidence): FpPackageEntryEvidence => {
  const specifier = topology.mode === 'legacy' ? './compile' : './fusion/optimized'
  const entry = topology.entries.find((candidate) => candidate.specifier === specifier)
  if (entry === undefined) throw new Error(`topology has no ${specifier} entry`)
  return entry
}

export const createFpPackageProjectionEvidence = (
  topology: FpPackageTopologyEvidence,
  files: readonly FpPackageFileEvidence[],
  sourceTarballSha256: string,
  packedTarball: FpPackageTarballEvidence,
): FpPackageProjectionEvidence => {
  const entry = optimizedEntry(topology)
  const fileByPath = new Map(files.map((file) => [file.path, file]))
  return Object.freeze({
    kind: 'same-package-lower-bound-feasibility-v1',
    sourceTarballSha256,
    optimizedSourceEntry: entry.specifier,
    optimizedClosure: entry.closure,
    optimizedClosureSha256: entry.closureSha256,
    optimizedClosureRawBytes: entry.rawBytes,
    reachableDeclarations: topology.declarations.reachable,
    reachableDeclarationsSha256: topology.declarations.closureSha256,
    reachableDeclarationRawBytes: topology.declarations.rawBytes,
    assumptions: FP_PACKAGE_PROJECTION_ASSUMPTIONS,
    packedTarball: Object.freeze({ ...packedTarball }),
    stableMaximumBytes: FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES,
    plausibleBelowStableMaximum: packedTarball.bytes < FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES,
  })
}

export const createFpPackageSizeReport = (input: {
  readonly generatedAt: string
  readonly files: readonly FpPackageFileEvidence[]
  readonly tarball: FpPackageTarballEvidence
  readonly topology: FpPackageTopologyEvidence
  readonly projection: FpPackageProjectionEvidence
}): FpPackageSizeReport => {
  const { manifest } = parseManifest(input.files)
  const manifestFile = input.files.find(({ path }) => path === 'package.json')
  if (manifestFile === undefined) throw new Error('packed manifest evidence is missing')
  return Object.freeze({
    schemaVersion: FP_PACKAGE_TOPOLOGY_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    package: Object.freeze({
      name: FP_PACKAGE_NAME,
      version: manifest.version as string,
      manifestSha256: manifestFile.sha256,
    }),
    tarball: Object.freeze({ ...input.tarball }),
    files: Object.freeze(input.files),
    topology: input.topology,
    projection: input.projection,
  })
}

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

export const evaluateFpPackageSizeReport = (
  report: FpPackageSizeReport,
  artifactReceipts: FpPackageArtifactReceipts,
): FpPackageSizeEvaluation => {
  const failures: string[] = []
  try {
    recordFailure(
      failures,
      report.schemaVersion === FP_PACKAGE_TOPOLOGY_SCHEMA_VERSION,
      `report schema must be ${FP_PACKAGE_TOPOLOGY_SCHEMA_VERSION}`,
    )
    recordFailure(
      failures,
      Number.isFinite(Date.parse(report.generatedAt)),
      'report has no valid generatedAt timestamp',
    )
    const recomputedFiles = createFpPackageFileEvidence(report.files)
    recordFailure(
      failures,
      sameJson(report.files, recomputedFiles),
      'packed file identity, compression, or import graph is inconsistent',
    )
    const { manifest } = parseManifest(recomputedFiles)
    const manifestFile = recomputedFiles.find(({ path }) => path === 'package.json')
    recordFailure(
      failures,
      report.package.name === FP_PACKAGE_NAME &&
        report.package.version === manifest.version &&
        report.package.manifestSha256 === manifestFile?.sha256,
      'report package identity does not match its packed manifest',
    )
    recordFailure(
      failures,
      report.tarball.path.endsWith('.tgz') &&
        SHA256.test(report.tarball.sha256) &&
        Number.isSafeInteger(report.tarball.bytes) &&
        report.tarball.bytes > 0 &&
        Number.isSafeInteger(report.tarball.fileCount) &&
        report.tarball.fileCount > 0 &&
        SHA256.test(report.tarball.fileSetSha256),
      'source packed tarball evidence is malformed',
    )
    const sourceFileSetIdentity = createFpPackageFileSetIdentity(recomputedFiles)
    recordFailure(
      failures,
      report.tarball.fileCount === sourceFileSetIdentity.fileCount &&
        report.tarball.fileSetSha256 === sourceFileSetIdentity.fileSetSha256,
      'source packed tarball receipt is not bound to the reported file graph',
    )
    recordFailure(
      failures,
      sameJson(report.tarball, artifactReceipts.sourceTarball),
      'source packed tarball evidence does not match the independently read artifact',
    )
    const recomputedTopology = deriveFpPackageTopology(recomputedFiles)
    recordFailure(
      failures,
      sameJson(report.topology, recomputedTopology),
      'reported package topology does not match the packed export/import graph',
    )

    recordFailure(
      failures,
      recomputedTopology.unreachableJavascript.length === 0,
      'package contains JavaScript unreachable from public exports',
    )

    if (recomputedTopology.mode === 'legacy') {
      const unexpectedDuplicateRuntimeArtifacts =
        recomputedTopology.duplicateRuntimeArtifacts.filter(
          ({ paths }) =>
            !FP_PACKAGE_LEGACY_ALLOWED_DUPLICATE_RUNTIME_PATH_GROUPS.some((allowedPaths) =>
              sameJson(paths, allowedPaths),
            ),
        )
      recordFailure(
        failures,
        unexpectedDuplicateRuntimeArtifacts.length === 0,
        'legacy package contains unexpected duplicate runtime artifacts',
      )
      const shared = recomputedTopology.legacy?.sharedDirectArtifacts ?? []
      recordFailure(
        failures,
        shared.length === 1,
        `legacy root and compile entries must share exactly one direct runtime artifact; found ${shared.length}`,
      )
      const sharedFile =
        shared.length === 1 ? recomputedFiles.find(({ path }) => path === shared[0]) : undefined
      recordFailure(
        failures,
        sharedFile !== undefined &&
          sharedFile.kind === 'javascript' &&
          sharedFile.gzipBytes <= FP_PACKAGE_LEGACY_SHARED_GZIP_MAXIMUM_BYTES,
        sharedFile === undefined
          ? 'legacy shared runtime artifact is missing'
          : `legacy shared runtime gzip is ${sharedFile.gzipBytes} bytes; budget is ${FP_PACKAGE_LEGACY_SHARED_GZIP_MAXIMUM_BYTES}`,
      )
      recordFailure(
        failures,
        report.tarball.bytes <= FP_PACKAGE_LEGACY_TARBALL_MAXIMUM_BYTES,
        `legacy packed @stopcock/fp tarball is ${report.tarball.bytes} bytes; budget is ${FP_PACKAGE_LEGACY_TARBALL_MAXIMUM_BYTES}`,
      )
    } else {
      recordFailure(
        failures,
        recomputedTopology.tiered?.forbiddenTierArtifactsByEntry.length === 0,
        'root or direct specialist entry reaches optimized/debug-only runtime artifacts',
      )
      recordFailure(
        failures,
        recomputedTopology.duplicateRuntimeArtifacts.length === 0,
        'tiered package contains duplicate runtime artifacts',
      )
    }

    const expectedProjection = createFpPackageProjectionEvidence(
      recomputedTopology,
      recomputedFiles,
      report.tarball.sha256,
      report.projection.packedTarball,
    )
    recordFailure(
      failures,
      sameJson(report.projection, expectedProjection),
      'lower-bound projection is not bound to the source graph and packed evidence',
    )
    recordFailure(
      failures,
      report.projection.packedTarball.path.endsWith('.tgz') &&
        SHA256.test(report.projection.packedTarball.sha256) &&
        Number.isSafeInteger(report.projection.packedTarball.bytes) &&
        report.projection.packedTarball.bytes > 0 &&
        Number.isSafeInteger(report.projection.packedTarball.fileCount) &&
        report.projection.packedTarball.fileCount > 0 &&
        SHA256.test(report.projection.packedTarball.fileSetSha256),
      'lower-bound projected tarball evidence is malformed',
    )
    recordFailure(
      failures,
      sameJson(report.projection.packedTarball, artifactReceipts.projectionTarball),
      'lower-bound projected tarball evidence does not match the independently read artifact',
    )
    recordFailure(
      failures,
      report.projection.plausibleBelowStableMaximum,
      `same-package lower-bound projection is ${report.projection.packedTarball.bytes} bytes; stable maximum is strictly below ${FP_PACKAGE_STABLE_TARBALL_MAXIMUM_BYTES}`,
    )
  } catch (error) {
    failures.push(`malformed package-size report: ${(error as Error).message}`)
  }
  return Object.freeze({
    passed: failures.length === 0,
    failures: Object.freeze(failures),
  })
}
