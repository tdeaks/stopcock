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
const PUBLIC_IMPORTS = [
  '@stopcock/async',
  '@stopcock/async/task',
  '@stopcock/async/async-iter',
] as const

let scratchDir: string
let consumerDir: string
let installedRoot: string

beforeAll(async () => {
  execFileSync('node', ['../../tooling/build-package.mjs'], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })
  scratchDir = await mkdtemp(join(tmpdir(), 'stopcock-async-pack-'))
  execFileSync('bun', ['pm', 'pack', '--destination', scratchDir], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })

  const fpFixtureDir = join(scratchDir, 'fp')
  await mkdir(fpFixtureDir, { recursive: true })
  await cp(join(FP_ROOT, 'dist'), join(fpFixtureDir, 'dist'), {
    recursive: true,
  })
  await cp(join(FP_ROOT, 'package.json'), join(fpFixtureDir, 'package.json'))

  consumerDir = join(scratchDir, 'consumer')
  installedRoot = join(consumerDir, 'node_modules/@stopcock/async')
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
      name: 'stopcock-async-pack-consumer',
      private: true,
      type: 'module',
    }),
  )
}, 60_000)

afterAll(async () => {
  if (scratchDir) await rm(scratchDir, { recursive: true, force: true })
})

describe('packed tarball', () => {
  it('ships every manifest target plus package documentation', async () => {
    const installedPackage = JSON.parse(
      await readFile(join(installedRoot, 'package.json'), 'utf8'),
    ) as {
      exports: Record<
        string,
        {
          types: string
          import: string
        }
      >
    }

    for (const entry of Object.values(installedPackage.exports)) {
      await access(join(installedRoot, entry.types))
      await access(join(installedRoot, entry.import))
    }
    await access(join(installedRoot, 'README.md'))
    await access(join(installedRoot, 'CHANGELOG.md'))
    await access(join(installedRoot, 'LICENSE'))

    const files = await readdir(installedRoot, { recursive: true })
    expect(files.some((file) => file.includes('__tests__'))).toBe(false)
    expect(files.some((file) => file.startsWith('src/'))).toBe(false)
  })

  it('runs every public entry from the extracted package', async () => {
    await writeFile(
      join(consumerDir, 'smoke.mjs'),
      `
import { AsyncIter, Task, run } from '@stopcock/async'

const modules = await Promise.all(
  ${JSON.stringify(PUBLIC_IMPORTS)}.map((specifier) => import(specifier)),
)
const taskResult = await run(Task.map((value) => value * 3)(Task.resolve(2)))
const iterResult = await run(
  AsyncIter.collect(
    AsyncIter.take(
      AsyncIter.map([1, 2, 3], (value) => value * 2),
      2,
    ),
  ),
)
if (modules.some((module) => Object.keys(module).length === 0)) {
  throw new Error('empty public module')
}
if (taskResult !== 6) throw new Error('Task smoke failed')
if (JSON.stringify(iterResult) !== '[2,4]') {
  throw new Error('AsyncIter smoke failed')
}
`.trimStart(),
    )

    execFileSync(process.execPath, ['smoke.mjs'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })
  })

  it('has a publishable FP dependency and portable public declarations', async () => {
    const installedPackage = JSON.parse(
      await readFile(join(installedRoot, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
    }
    const fpVersion = installedPackage.dependencies?.['@stopcock/fp']
    expect(fpVersion).toBeDefined()
    expect(fpVersion).not.toContain('workspace:')

    await writeFile(
      join(consumerDir, 'consumer.ts'),
      `
import {
  AsyncIter,
  Task,
  resolve,
  run,
  type Task as TaskValue,
} from '@stopcock/async'
import * as AsyncIterSubpath from '@stopcock/async/async-iter'
import * as TaskSubpath from '@stopcock/async/task'

const task: TaskValue<number> = resolve(42)
const doubled: TaskValue<number> = Task.map((value: number) => value * 2)(task)
const values = AsyncIter.map([1, 2, 3], (value) => value * 2)
const collected: TaskValue<number[], unknown> = AsyncIter.collect(values)
const result: Promise<number> = run(doubled)
void collected
void result
void AsyncIterSubpath
void TaskSubpath
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
