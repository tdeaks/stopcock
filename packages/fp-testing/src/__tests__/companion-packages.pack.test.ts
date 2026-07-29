// This is deliberately a tarball-level contract test. Source imports and
// workspace symlinks can hide missing files, broken export maps, invalid
// NodeNext declarations, and lost executable bits.
import { execFileSync, spawnSync } from 'node:child_process'
import {
  access,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

interface ExportTarget {
  readonly types: string
  readonly import: string
}

interface PackageManifest {
  readonly name: string
  readonly version: string
  readonly exports: Readonly<Record<string, ExportTarget>>
  readonly bin?: Readonly<Record<string, string>>
  readonly dependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
}

interface PackedPackage {
  readonly directory: string
  readonly manifest: PackageManifest
  readonly installedRoot: string
  readonly tarballPath: string
}

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url))
const FP_ROOT = join(REPO_ROOT, 'packages/fp')
const BUILD_SCRIPT = join(REPO_ROOT, 'tooling/build-package.mjs')
const TSC = join(REPO_ROOT, 'node_modules/typescript/lib/tsc.js')

const PACKAGE_DIRECTORIES = [
  'pattern',
  'parser',
  'persistent',
  'fp-testing',
  'eslint-plugin-fp',
  'fp-codemod',
] as const

const readJson = async <Value>(file: string): Promise<Value> =>
  JSON.parse(await readFile(file, 'utf8')) as Value

const packageSpecifier = (name: string, exportName: string): string =>
  exportName === '.' ? name : `${name}/${exportName.slice(2)}`

const tarballName = (manifest: PackageManifest): string =>
  `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`

let scratchDir: string
let consumerDir: string
let packedPackages: readonly PackedPackage[]

beforeAll(async () => {
  scratchDir = await mkdtemp(join(tmpdir(), 'stopcock-fp-companion-pack-'))
  consumerDir = join(scratchDir, 'consumer')
  const nodeModules = join(consumerDir, 'node_modules')
  const stopcockModules = join(nodeModules, '@stopcock')
  await mkdir(stopcockModules, { recursive: true })
  await writeFile(
    join(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'stopcock-fp-companion-pack-consumer',
        private: true,
        type: 'module',
      },
      null,
      2,
    ),
  )

  const installed: PackedPackage[] = []
  for (const directory of PACKAGE_DIRECTORIES) {
    const packageRoot = join(REPO_ROOT, 'packages', directory)
    const manifest = await readJson<PackageManifest>(join(packageRoot, 'package.json'))

    // Exercise the exact shared build path used by package release jobs.
    execFileSync(process.execPath, [BUILD_SCRIPT], {
      cwd: packageRoot,
      stdio: 'inherit',
    })

    execFileSync('bun', ['pm', 'pack', '--destination', scratchDir], {
      cwd: packageRoot,
      stdio: 'inherit',
    })
    const tarballPath = join(scratchDir, tarballName(manifest))
    const installedRoot = join(stopcockModules, manifest.name.slice('@stopcock/'.length))
    await mkdir(installedRoot, { recursive: true })
    execFileSync('tar', ['-xzf', tarballPath, '-C', installedRoot, '--strip-components=1'], {
      stdio: 'inherit',
    })
    installed.push({ directory, manifest, installedRoot, tarballPath })
  }
  packedPackages = installed

  // Parser's FP 2 peer is represented by an offline fixture built from the
  // workspace artifacts. Its version is adjusted in scratch only, so the test
  // exercises the declared peer range without mutating the package under test.
  const fpFixture = join(scratchDir, 'fp-v2')
  await mkdir(fpFixture, { recursive: true })
  await cp(join(FP_ROOT, 'dist'), join(fpFixture, 'dist'), { recursive: true })
  const fpManifest = await readJson<Record<string, unknown>>(join(FP_ROOT, 'package.json'))
  fpManifest.version = '2.0.0'
  await writeFile(join(fpFixture, 'package.json'), JSON.stringify(fpManifest, null, 2))
  await symlink(fpFixture, join(stopcockModules, 'fp'), 'dir')

  // The codemod intentionally uses the consumer's TypeScript compiler API.
  // Link the workspace's pinned compiler instead of reaching a registry.
  await symlink(join(REPO_ROOT, 'node_modules/typescript'), join(nodeModules, 'typescript'), 'dir')
}, 180_000)

afterAll(async () => {
  if (scratchDir) await rm(scratchDir, { recursive: true, force: true })
})

describe('FP companion package tarballs', () => {
  it('ships every manifest target plus its README and license', async () => {
    for (const packed of packedPackages) {
      const installedManifest = await readJson<PackageManifest>(
        join(packed.installedRoot, 'package.json'),
      )
      expect(installedManifest.name).toBe(packed.manifest.name)
      expect(installedManifest.version).toBe(packed.manifest.version)
      await expect(access(packed.tarballPath)).resolves.toBeUndefined()
      await expect(access(join(packed.installedRoot, 'README.md'))).resolves.toBeUndefined()
      await expect(access(join(packed.installedRoot, 'LICENSE'))).resolves.toBeUndefined()

      for (const target of Object.values(installedManifest.exports)) {
        expect(target.import).toMatch(/^\.\//)
        expect(target.types).toMatch(/^\.\//)
        await expect(access(join(packed.installedRoot, target.import))).resolves.toBeUndefined()
        await expect(access(join(packed.installedRoot, target.types))).resolves.toBeUndefined()
      }

      for (const target of Object.values(installedManifest.bin ?? {})) {
        await expect(access(join(packed.installedRoot, target))).resolves.toBeUndefined()
      }

      const files = await readdir(packed.installedRoot, { recursive: true })
      expect(files.some((file) => file.includes('__tests__'))).toBe(false)
      expect(files.some((file) => /\.test(?:-d)?\.[cm]?[jt]sx?$/.test(file))).toBe(false)
    }
  })

  it('imports every public runtime entry from the isolated install', async () => {
    const specifiers = packedPackages.flatMap(({ manifest }) =>
      Object.keys(manifest.exports).map((exportName) =>
        packageSpecifier(manifest.name, exportName),
      ),
    )
    await writeFile(
      join(consumerDir, 'runtime.mjs'),
      `
const specifiers = ${JSON.stringify(specifiers)}
for (const specifier of specifiers) {
  const namespace = await import(specifier)
  if (Object.keys(namespace).length === 0) {
    throw new Error(\`No runtime exports from \${specifier}\`)
  }
}
`.trimStart(),
    )

    execFileSync(process.execPath, ['runtime.mjs'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })
  })

  it('typechecks every public entry in strict Bundler and NodeNext consumers', async () => {
    const specifiers = packedPackages.flatMap(({ manifest }) =>
      Object.keys(manifest.exports).map((exportName) =>
        packageSpecifier(manifest.name, exportName),
      ),
    )
    await writeFile(
      join(consumerDir, 'consumer.ts'),
      specifiers
        .map(
          (specifier, index) =>
            `import * as module${index} from ${JSON.stringify(specifier)}\nvoid module${index}`,
        )
        .join('\n'),
    )

    const commonCompilerOptions = {
      target: 'ES2022',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      isolatedModules: true,
      verbatimModuleSyntax: true,
    }
    await writeFile(
      join(consumerDir, 'tsconfig.bundler.json'),
      JSON.stringify(
        {
          compilerOptions: {
            ...commonCompilerOptions,
            module: 'ESNext',
            moduleResolution: 'Bundler',
          },
          include: ['consumer.ts'],
        },
        null,
        2,
      ),
    )
    await writeFile(
      join(consumerDir, 'tsconfig.nodenext.json'),
      JSON.stringify(
        {
          compilerOptions: {
            ...commonCompilerOptions,
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
          },
          include: ['consumer.ts'],
        },
        null,
        2,
      ),
    )

    execFileSync(process.execPath, [TSC, '-p', 'tsconfig.bundler.json'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })
    execFileSync(process.execPath, [TSC, '-p', 'tsconfig.nodenext.json'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })
  }, 120_000)

  it('preserves and executes the fp-codemod CLI', async () => {
    const codemod = packedPackages.find(({ manifest }) => manifest.name === '@stopcock/fp-codemod')
    expect(codemod).toBeDefined()
    if (!codemod) return

    const cli = join(codemod.installedRoot, 'dist/cli.js')
    const cliStats = await stat(cli)
    expect(cliStats.mode & 0o111).not.toBe(0)
    expect(await readFile(cli, 'utf8')).toMatch(/^#!\/usr\/bin\/env node/)

    const help = execFileSync(cli, ['--help'], {
      cwd: consumerDir,
      encoding: 'utf8',
    })
    expect(help).toContain('stopcock-fp-codemod [options]')

    const fixture = join(consumerDir, 'legacy.ts')
    await writeFile(
      fixture,
      "import { A } from '@stopcock/fp'\nexport const values = A.map((x: number) => x + 1, [1])\n",
    )
    const result = spawnSync(cli, ['--check', '--json', fixture], {
      cwd: consumerDir,
      encoding: 'utf8',
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    const summary = JSON.parse(result.stdout) as {
      readonly scannedFiles: number
      readonly changedFiles: number
    }
    expect(summary.scannedFiles).toBe(1)
    expect(summary.changedFiles).toBe(1)
  })

  it('retains the intended runtime peer contracts', async () => {
    const manifests = Object.fromEntries(
      await Promise.all(
        packedPackages.map(async ({ installedRoot, manifest }) => [
          manifest.name,
          await readJson<PackageManifest>(join(installedRoot, 'package.json')),
        ]),
      ),
    )

    const parserSource = packedPackages.find(
      ({ manifest }) => manifest.name === '@stopcock/parser',
    )?.manifest

    expect(manifests['@stopcock/parser']?.dependencies?.['@stopcock/fp']).toBeUndefined()
    // The -next cohort pins an exact prerelease (e.g. '2.0.0-next.0') because a
    // plain '^2.0.0' range does not match a prerelease under npm semver; assert
    // against the source manifest so this follows the cohort instead of a
    // hardcoded string that only holds once FP reaches stable 2.0.0.
    expect(manifests['@stopcock/parser']?.peerDependencies?.['@stopcock/fp']).toBe(
      parserSource?.peerDependencies?.['@stopcock/fp'],
    )
    expect(manifests['@stopcock/eslint-plugin-fp']?.peerDependencies?.eslint).toBe(
      '>=9.0.0 <11.0.0',
    )
    expect(manifests['@stopcock/fp-codemod']?.peerDependencies?.typescript).toBe('>=7.0.0 <8.0.0')
  })
})
