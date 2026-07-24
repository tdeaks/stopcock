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
const SUBPATHS = [
  'index',
  'option-like',
  'either-like',
  'boundary',
  'standard-schema',
  'wire',
  'node',
] as const

let scratchDir: string
let consumerDir: string
let installedRoot: string

beforeAll(async () => {
  execFileSync('node', ['../../tooling/build-package.mjs'], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })
  scratchDir = await mkdtemp(join(tmpdir(), 'stopcock-fp-interop-pack-'))

  execFileSync('bun', ['pm', 'pack', '--destination', scratchDir], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })
  const tarballPath = join(scratchDir, TARBALL_NAME)

  const fpFixtureDir = join(scratchDir, 'fp-v2')
  await mkdir(fpFixtureDir, { recursive: true })
  await cp(join(FP_ROOT, 'dist'), join(fpFixtureDir, 'dist'), {
    recursive: true,
  })
  const fpPackage = JSON.parse(
    await readFile(join(FP_ROOT, 'package.json'), 'utf8'),
  ) as Record<string, unknown>
  fpPackage.version = '2.0.0'
  await writeFile(
    join(fpFixtureDir, 'package.json'),
    JSON.stringify(fpPackage, null, 2),
  )

  consumerDir = join(scratchDir, 'consumer')
  installedRoot = join(
    consumerDir,
    'node_modules/@stopcock/fp-interop',
  )
  await mkdir(installedRoot, { recursive: true })
  execFileSync(
    'tar',
    ['-xzf', tarballPath, '-C', installedRoot, '--strip-components=1'],
    { stdio: 'inherit' },
  )
  await symlink(
    fpFixtureDir,
    join(consumerDir, 'node_modules/@stopcock/fp'),
    'dir',
  )
  await writeFile(
    join(consumerDir, 'package.json'),
    JSON.stringify({
      name: 'stopcock-fp-interop-pack-consumer',
      private: true,
      type: 'module',
    }),
  )
}, 60_000)

afterAll(async () => {
  if (scratchDir) await rm(scratchDir, { recursive: true, force: true })
})

describe('packed tarball', () => {
  it('ships every declared runtime and declaration entry', async () => {
    for (const subpath of SUBPATHS) {
      await expect(access(join(installedRoot, `dist/${subpath}.js`))).resolves
        .toBeUndefined()
      await expect(access(join(installedRoot, `dist/${subpath}.d.ts`))).resolves
        .toBeUndefined()
    }

    const files = await readdir(installedRoot, { recursive: true })
    expect(files.some((file) => file.includes('__tests__'))).toBe(false)
    expect(files.some((file) => file.startsWith('src/'))).toBe(false)

    const rootRuntime = await readFile(join(installedRoot, 'dist/index.js'), 'utf8')
    const nodeRuntime = await readFile(join(installedRoot, 'dist/node.js'), 'utf8')
    expect(rootRuntime).not.toContain('fromNodeCallback')
    expect(rootRuntime).not.toMatch(/(?:from|import)\s*['"]node:/)
    expect(nodeRuntime).not.toMatch(/(?:from|import)\s*['"]node:/)
  })

  it('runs root and Node subpath imports in an isolated consumer', async () => {
    await writeFile(
      join(consumerDir, 'smoke.mjs'),
      `
import { fromTaggedOption, serializeResult } from '@stopcock/fp-interop'
import { fromNodeCallback } from '@stopcock/fp-interop/node'
import { err } from '@stopcock/fp/result'

const modules = await Promise.all([
  '@stopcock/fp-interop',
  '@stopcock/fp-interop/option-like',
  '@stopcock/fp-interop/either-like',
  '@stopcock/fp-interop/boundary',
  '@stopcock/fp-interop/standard-schema',
  '@stopcock/fp-interop/wire',
  '@stopcock/fp-interop/node',
].map((specifier) => import(specifier)))
const option = fromTaggedOption({ _tag: 'Some', value: 2 })
const wire = serializeResult(err('bad'), (value) => value, (error) => error)
const callback = await fromNodeCallback((done) => done(null, 3))
if (modules.some((module) => Object.keys(module).length === 0)) throw new Error('empty public module')
if (option._tag !== 1 || option.value !== 2) throw new Error('option smoke failed')
if (wire._tag !== 1 || wire.value !== '{"_tag":"Err","error":"bad"}') throw new Error('wire smoke failed')
if (callback._tag !== 1 || callback.value !== 3) throw new Error('node smoke failed')
`.trimStart(),
    )

    execFileSync(process.execPath, ['smoke.mjs'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })
  })

  it('declares fp as a peer and typechecks public imports', async () => {
    const installedPackage = JSON.parse(
      await readFile(join(installedRoot, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    expect(installedPackage.dependencies?.['@stopcock/fp']).toBeUndefined()
    expect(installedPackage.peerDependencies?.['@stopcock/fp']).toBe('^2.0.0')

    await writeFile(
      join(consumerDir, 'consumer.ts'),
      `
import {
  fromTaggedEither,
  decodeOptionWire,
  type TaggedEitherLike,
  type WireDecodeError,
} from '@stopcock/fp-interop'
import { liftNodeCallback } from '@stopcock/fp-interop/node'
import { err, ok, type Result } from '@stopcock/fp/result'
import type { Option } from '@stopcock/fp/option'
import * as optionLikeModule from '@stopcock/fp-interop/option-like'
import * as eitherLikeModule from '@stopcock/fp-interop/either-like'
import * as boundaryModule from '@stopcock/fp-interop/boundary'
import * as schemaModule from '@stopcock/fp-interop/standard-schema'
import * as wireModule from '@stopcock/fp-interop/wire'
import * as nodeModule from '@stopcock/fp-interop/node'

const foreign: TaggedEitherLike<string, number> = { _tag: 'Right', right: 1 }
const local: Result<number, string> = fromTaggedEither(foreign)
const decoded: Result<Option<number>, WireDecodeError<string>> =
  decodeOptionWire({ _tag: 'Some', value: 1 }, (input) =>
    typeof input === 'number' ? ok(input) : err('not-number'))
const lifted: (input: string) => Promise<Result<number, string>> =
  liftNodeCallback(
    (input: string, done: (error: unknown, value: number) => void) =>
      done(null, input.length),
    String,
  )
void local
void decoded
void lifted
void [
  optionLikeModule,
  eitherLikeModule,
  boundaryModule,
  schemaModule,
  wireModule,
  nodeModule,
]
`.trimStart(),
    )
    await writeFile(
      join(consumerDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ['consumer.ts'],
      }),
    )

    execFileSync(process.execPath, [TSC, '-p', 'tsconfig.json'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })

    await writeFile(
      join(consumerDir, 'tsconfig.nodenext.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ['consumer.ts'],
      }),
    )
    execFileSync(process.execPath, [TSC, '-p', 'tsconfig.nodenext.json'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })
  })
})
