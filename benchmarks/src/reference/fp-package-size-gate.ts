import { spawnSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_NAME = '@stopcock/fp'
const MAX_SHARED_CHUNK_GZIP_BYTES = 18_000
const MAX_PACKED_TARBALL_BYTES = 150_000

export const FP_PACKAGE_SIZE_POLICY = Object.freeze({
  sharedChunk: Object.freeze({
    description: 'shared compile/runtime ESM chunk, gzip level 9',
    maximumBytes: MAX_SHARED_CHUNK_GZIP_BYTES,
  }),
  packedTarball: Object.freeze({
    description: 'published @stopcock/fp tarball, gzip level 9',
    maximumBytes: MAX_PACKED_TARBALL_BYTES,
  }),
})

export interface FpPackageSizeReport {
  readonly generatedAt: string
  readonly package: {
    readonly name: typeof PACKAGE_NAME
    readonly version: string
  }
  readonly build: {
    readonly compileFacade: string
    readonly rootFacade: string
    readonly sharedChunk: string
  }
  readonly measurements: {
    readonly sharedChunkBytes: number
    readonly sharedChunkGzipBytes: number
    readonly packedTarballBytes: number
  }
  readonly tarball: string
}

export interface FpPackageSizeEvaluation {
  readonly passed: boolean
  readonly failures: readonly string[]
}

const recordFailure = (failures: string[], condition: boolean, message: string): void => {
  if (!condition) failures.push(message)
}

export const evaluateFpPackageSizeReport = (
  report: FpPackageSizeReport,
): FpPackageSizeEvaluation => {
  const failures: string[] = []
  recordFailure(
    failures,
    typeof report.generatedAt === 'string' && Number.isFinite(Date.parse(report.generatedAt)),
    'report has no valid generatedAt timestamp',
  )
  recordFailure(
    failures,
    report.package.name === PACKAGE_NAME && report.package.version.length > 0,
    'report does not identify a versioned @stopcock/fp package',
  )
  recordFailure(
    failures,
    report.build.compileFacade === 'compile.js' &&
      report.build.rootFacade === 'index.js' &&
      /^compile-[A-Za-z0-9_-]+\.js$/u.test(report.build.sharedChunk),
    'report does not identify the shared compile/runtime chunk',
  )
  for (const [label, value] of [
    ['shared chunk bytes', report.measurements.sharedChunkBytes],
    ['shared chunk gzip bytes', report.measurements.sharedChunkGzipBytes],
    ['packed tarball bytes', report.measurements.packedTarballBytes],
  ] as const) {
    recordFailure(
      failures,
      Number.isSafeInteger(value) && value > 0,
      `${label} is not a positive safe integer`,
    )
  }
  recordFailure(
    failures,
    report.measurements.sharedChunkGzipBytes <= MAX_SHARED_CHUNK_GZIP_BYTES,
    `shared compile/runtime chunk gzip is ${report.measurements.sharedChunkGzipBytes} bytes; budget is ${MAX_SHARED_CHUNK_GZIP_BYTES}`,
  )
  recordFailure(
    failures,
    report.measurements.packedTarballBytes <= MAX_PACKED_TARBALL_BYTES,
    `packed @stopcock/fp tarball is ${report.measurements.packedTarballBytes} bytes; budget is ${MAX_PACKED_TARBALL_BYTES}`,
  )
  recordFailure(
    failures,
    typeof report.tarball === 'string' && report.tarball.endsWith('.tgz'),
    'report has no packed tarball path',
  )
  return { passed: failures.length === 0, failures: Object.freeze(failures) }
}

const artifactDirectory = (): string =>
  resolve(process.env.PERF_ARTIFACT_DIR ?? join(tmpdir(), 'stopcock-fp-performance'))

const importedCompileChunks = (source: string): readonly string[] =>
  Array.from(source.matchAll(/from\s+["']\.\/(compile-[A-Za-z0-9_-]+\.js)["']/gu), (match) =>
    String(match[1]),
  )

const main = async (): Promise<void> => {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  const packageDirectory = join(repositoryRoot, 'packages', 'fp')
  const distDirectory = join(packageDirectory, 'dist')
  const directory = artifactDirectory()
  const reportPath = join(directory, 'fp-package-size.json')
  const gatePath = join(directory, 'fp-package-size-gate.json')
  let report: FpPackageSizeReport | undefined
  let evaluation: FpPackageSizeEvaluation = {
    passed: false,
    failures: Object.freeze(['@stopcock/fp size measurements were not produced']),
  }

  await mkdir(directory, { recursive: true })
  try {
    const packageManifest = JSON.parse(
      await readFile(join(packageDirectory, 'package.json'), 'utf8'),
    ) as { readonly name?: string; readonly version?: string }
    if (packageManifest.name !== PACKAGE_NAME || typeof packageManifest.version !== 'string') {
      throw new Error('packages/fp/package.json does not identify a versioned @stopcock/fp')
    }

    const compileFacade = await readFile(join(distDirectory, 'compile.js'), 'utf8')
    const rootFacade = await readFile(join(distDirectory, 'index.js'), 'utf8')
    const compileChunks = new Set([
      ...importedCompileChunks(compileFacade),
      ...importedCompileChunks(rootFacade),
    ])
    if (compileChunks.size !== 1) {
      throw new Error(
        `expected compile.js and index.js to share one compile-* runtime chunk; found ${[...compileChunks].join(', ') || 'none'}`,
      )
    }
    const [sharedChunk] = compileChunks
    if (
      sharedChunk === undefined ||
      !compileFacade.includes(`"./${sharedChunk}"`) ||
      !rootFacade.includes(`"./${sharedChunk}"`)
    ) {
      throw new Error('compile.js and index.js do not import the same compile/runtime chunk')
    }
    const sharedChunkBuffer = await readFile(join(distDirectory, sharedChunk))

    const packDirectory = await mkdtemp(join(directory, 'fp-pack-'))
    const packed = spawnSync(
      'bun',
      ['pm', 'pack', '--destination', packDirectory, '--ignore-scripts', '--quiet'],
      { cwd: packageDirectory, encoding: 'utf8' },
    )
    if (packed.error) throw packed.error
    if (packed.status !== 0 || packed.signal !== null) {
      throw new Error(
        `bun pm pack failed with status ${String(packed.status)}: ${packed.stderr.trim()}`,
      )
    }
    const tarballs = (await readdir(packDirectory)).filter((entry) => entry.endsWith('.tgz'))
    if (tarballs.length !== 1) {
      throw new Error(`expected exactly one packed tarball; found ${tarballs.length}`)
    }
    const tarballPath = join(packDirectory, tarballs[0] as string)
    const tarballStat = await stat(tarballPath)

    report = {
      generatedAt: new Date().toISOString(),
      package: {
        name: PACKAGE_NAME,
        version: packageManifest.version,
      },
      build: {
        compileFacade: 'compile.js',
        rootFacade: 'index.js',
        sharedChunk: basename(sharedChunk),
      },
      measurements: {
        sharedChunkBytes: sharedChunkBuffer.byteLength,
        sharedChunkGzipBytes: gzipSync(sharedChunkBuffer, { level: 9 }).byteLength,
        packedTarballBytes: tarballStat.size,
      },
      tarball: tarballPath,
    }
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    evaluation = evaluateFpPackageSizeReport(report)
  } catch (error) {
    evaluation = {
      passed: false,
      failures: Object.freeze([
        `@stopcock/fp size measurement failed: ${(error as Error).message}`,
      ]),
    }
  }

  await writeFile(
    gatePath,
    `${JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        policy: FP_PACKAGE_SIZE_POLICY,
        report,
        evaluation,
        passed: evaluation.passed,
      },
      null,
      2,
    )}\n`,
  )

  console.log('\n@stopcock/fp package-size release gate\n')
  if (report) {
    console.log(
      `shared compile/runtime chunk: ${report.measurements.sharedChunkGzipBytes} / ${MAX_SHARED_CHUNK_GZIP_BYTES} gzip bytes`,
    )
    console.log(
      `packed tarball: ${report.measurements.packedTarballBytes} / ${MAX_PACKED_TARBALL_BYTES} bytes`,
    )
  }
  for (const failure of evaluation.failures) console.error(`FAIL\t${failure}`)
  console.log(`raw report: ${reportPath}`)
  console.log(`gate report: ${gatePath}`)
  if (!evaluation.passed) process.exitCode = 1
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
