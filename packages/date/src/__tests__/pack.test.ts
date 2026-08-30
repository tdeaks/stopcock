import { execFileSync } from 'node:child_process'
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import pkg from '../../package.json' with { type: 'json' }

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const TSC = fileURLToPath(
  new URL('../../../../node_modules/typescript/lib/tsc.js', import.meta.url),
)
const TARBALL_NAME = `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`

let scratchDir: string
let consumerDir: string
let installedRoot: string

beforeAll(async () => {
  execFileSync('node', ['../../tooling/build-package.mjs'], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })

  scratchDir = await mkdtemp(join(tmpdir(), 'stopcock-date-pack-'))
  execFileSync('bun', ['pm', 'pack', '--destination', scratchDir], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
  })

  consumerDir = join(scratchDir, 'consumer')
  installedRoot = join(consumerDir, 'node_modules/@stopcock/date')
  await mkdir(installedRoot, { recursive: true })
  execFileSync(
    'tar',
    ['-xzf', join(scratchDir, TARBALL_NAME), '-C', installedRoot, '--strip-components=1'],
    { stdio: 'inherit' },
  )
  await writeFile(
    join(consumerDir, 'package.json'),
    JSON.stringify({
      name: 'stopcock-date-pack-consumer',
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

    await access(join(installedRoot, rootExport.types))
    await access(join(installedRoot, rootExport.import))
    await access(join(installedRoot, 'README.md'))
    await access(join(installedRoot, 'CHANGELOG.md'))
    await access(join(installedRoot, 'LICENSE'))
    expect(installedPackage.dependencies).toBeUndefined()

    const files = await readdir(installedRoot, { recursive: true })
    expect(files.some((file) => file.includes('__tests__'))).toBe(false)
    expect(files.some((file) => file.startsWith('src/'))).toBe(false)
  })

  it('executes the extracted public root', async () => {
    await writeFile(
      join(consumerDir, 'smoke.mjs'),
      `
import { Tz, fromISO, range } from '@stopcock/date'

const start = fromISO('2024-03-01T00:00:00.000Z')
const end = fromISO('2024-03-03T00:00:00.000Z')
const values = range(end, 1, 'day')(start)
const shifted = Tz.add(start, 1, 'day', 'UTC', 'later')

if (values.length !== 3) throw new Error('packed range smoke failed')
if (Tz.getDay(shifted, 'UTC') !== 2) throw new Error('packed Tz smoke failed')
`.trimStart(),
    )

    execFileSync(process.execPath, ['smoke.mjs'], {
      cwd: consumerDir,
      stdio: 'inherit',
    })
  })

  it('exposes portable declarations for the corrected overloads', async () => {
    await writeFile(
      join(consumerDir, 'consumer.ts'),
      `
import { Tz, fromISO, range, rangeBy, type Timestamp } from '@stopcock/date'

const start = fromISO('2024-03-01T00:00:00.000Z')
const end = fromISO('2024-03-03T00:00:00.000Z')
const ranged: Timestamp[] = range(end, 1, 'day')(start)
const rangedBy: Timestamp[] = rangeBy(end, (value) => Tz.add(value, 1, 'day', 'UTC'))(start)
const shifted: Timestamp = Tz.add(start, 1, 'day', 'UTC', 'later')
const shift: (value: Timestamp) => Timestamp = Tz.subtract(1, 'day', 'UTC')
void ranged
void rangedBy
void shifted
void shift
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
