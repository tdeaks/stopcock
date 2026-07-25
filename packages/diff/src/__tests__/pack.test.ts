import { execFileSync } from 'node:child_process'
import {
  access,
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import pkg from '../../package.json' with { type: 'json' }

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const FP_ROOT = fileURLToPath(new URL('../../../fp', import.meta.url))
const TSC = fileURLToPath(
  new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url),
)
const TARBALL_NAME = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`

let scratchDir: string
let consumerDir: string
let installedRoot: string

beforeAll(async () => {
  execFileSync('node', ['../../tooling/build-package.mjs'], {
    cwd: FP_ROOT,
    stdio: 'inherit',
  })
  execFileSync('node', ['../../tooling/build-package.mjs'], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })

  scratchDir = await mkdtemp(join(tmpdir(), 'stopcock-diff-pack-'))
  execFileSync('bun', ['pm', 'pack', '--destination', scratchDir], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })

  const fpFixtureDir = join(scratchDir, 'fp')
  await mkdir(fpFixtureDir, { recursive: true })
  await cp(join(FP_ROOT, 'dist'), join(fpFixtureDir, 'dist'), { recursive: true })
  await cp(join(FP_ROOT, 'package.json'), join(fpFixtureDir, 'package.json'))

  consumerDir = join(scratchDir, 'consumer')
  installedRoot = join(consumerDir, 'node_modules/@stopcock/diff')
  await mkdir(installedRoot, { recursive: true })
  execFileSync(
    'tar',
    ['-xzf', join(scratchDir, TARBALL_NAME), '-C', installedRoot, '--strip-components=1'],
    { stdio: 'inherit' },
  )
  await symlink(fpFixtureDir, join(consumerDir, 'node_modules/@stopcock/fp'), 'dir')
  await writeFile(
    join(consumerDir, 'package.json'),
    JSON.stringify({
      name: 'stopcock-diff-pack-consumer',
      private: true,
      type: 'module',
    }),
  )
}, 60_000)

afterAll(async () => {
  if (scratchDir) await rm(scratchDir, { recursive: true, force: true })
})

describe('packed tarball', () => {
  it('ships its declared root plus package documentation', async () => {
    const installedPackage = JSON.parse(
      await readFile(join(installedRoot, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      exports: Record<string, { types: string; import: string }>
    }
    const rootExport = installedPackage.exports['.']!

    await expect(access(join(installedRoot, rootExport.types))).resolves.toBeUndefined()
    await expect(access(join(installedRoot, rootExport.import))).resolves.toBeUndefined()
    await expect(access(join(installedRoot, 'README.md'))).resolves.toBeUndefined()
    await expect(access(join(installedRoot, 'CHANGELOG.md'))).resolves.toBeUndefined()
    await expect(access(join(installedRoot, 'LICENSE'))).resolves.toBeUndefined()
    expect(installedPackage.dependencies?.['@stopcock/fp']).not.toContain('workspace:')

    const files = await readdir(installedRoot, { recursive: true })
    expect(files.some((file) => file.includes('__tests__'))).toBe(false)
    expect(files.some((file) => file.startsWith('src/'))).toBe(false)
  })

  it('executes the extracted public root in both call forms', async () => {
    await writeFile(
      join(consumerDir, 'smoke.mjs'),
      `
import { apply, applyUnsafe, patch } from '@stopcock/diff'

const change = patch([
  { op: 'replace', path: ['count'], oldValue: 1, newValue: 2 },
])
const direct = apply({ count: 1 }, change)
const dataLast = apply(change)({ count: 1 })
const unsafe = applyUnsafe(change)({ count: 1 })

if (direct._tag !== 1 || direct.value.count !== 2) {
  throw new Error('packed direct apply smoke failed')
}
if (dataLast._tag !== 1 || dataLast.value.count !== 2) {
  throw new Error('packed data-last apply smoke failed')
}
if (unsafe.count !== 2) throw new Error('packed applyUnsafe smoke failed')
`.trimStart(),
    )

    execFileSync(process.execPath, ['smoke.mjs'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })
  })

  it('exposes portable declarations for both generic overloads', async () => {
    await writeFile(
      join(consumerDir, 'consumer.ts'),
      `
import { apply, applyUnsafe, patch, type PatchError } from '@stopcock/diff'
import type { Result } from '@stopcock/fp/result'

type Model = { readonly count: number; readonly label: string }
const model: Model = { count: 1, label: 'before' }
const change = patch([
  { op: 'replace', path: ['count'], oldValue: 1, newValue: 2 },
])

const direct: Result<Model, PatchError> = apply(model, change)
const dataLast: Result<Model, PatchError> = apply(change)(model)
const unsafeDirect: Model = applyUnsafe(model, change)
const unsafeDataLast: Model = applyUnsafe(change)(model)
void direct
void dataLast
void unsafeDirect
void unsafeDataLast
`.trimStart(),
    )

    for (const [name, compilerOptions] of [
      [
        'bundler',
        {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
      ],
      [
        'nodenext',
        {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
      ],
    ] as const) {
      const config = `tsconfig.${name}.json`
      await writeFile(
        join(consumerDir, config),
        JSON.stringify({
          compilerOptions,
          include: ['consumer.ts'],
        }),
      )
      execFileSync(process.execPath, [TSC, '-p', config], {
        cwd: consumerDir,
        stdio: 'inherit',
      })
    }
  })
})
