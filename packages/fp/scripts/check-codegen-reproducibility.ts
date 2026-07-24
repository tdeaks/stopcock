import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { PROTOCOL_GENERATED_PATHS_V1 } from '../codegen/protocol/generate-protocol'

const FP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(FP_ROOT, '../..')
const CHECK_GIT_DIFF = !process.argv.includes('--no-git-diff')

const GENERATED_PATHS = [
  ...PROTOCOL_GENERATED_PATHS_V1,
  'packages/fp/src/array.ts',
  'packages/fp/src/boolean.ts',
  'packages/fp/src/math.ts',
  'packages/fp/src/portable-templates.ts',
  'packages/fp/package.json',
] as const

function run(
  command: string,
  args: readonly string[],
  cwd = REPO_ROOT,
  environment: Readonly<Record<string, string>> = {},
): void {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`command failed: ${command} ${args.join(' ')}`)
  }
}

function hashFile(path: string): string {
  return createHash('sha256')
    .update(readFileSync(resolve(REPO_ROOT, path)))
    .digest('hex')
}

function outputIdentity(): string {
  const hash = createHash('sha256')
  for (const path of [...GENERATED_PATHS].sort()) {
    hash.update(path)
    hash.update('\0')
    hash.update(hashFile(path))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function assertGeneratedTreeIsTrackedAndClean(): void {
  const result = spawnSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all', '--', ...GENERATED_PATHS],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  )
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error('failed to inspect generated-file ownership')
  }
  const status = result.stdout.trim()
  if (status.length > 0) {
    throw new Error(`generated files are modified or untracked:\n${status}`)
  }
}

function walkTypeScript(directory: string): readonly string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (entry !== 'defs' && entry !== 'generated') files.push(...walkTypeScript(path))
    } else if (entry.endsWith('.ts')) {
      files.push(path)
    }
  }
  return files
}

function assertAcyclicGeneratorImports(): void {
  const forbidden = [
    /from\s+['"]\.\.\/src(?:\/|['"])/u,
    /from\s+['"][^'"]*fp\/src\/(?:array|registry|opcodes)(?:\.ts)?['"]/u,
    /from\s+['"]@stopcock\/fp(?:\/|['"])/u,
  ]
  const generationFiles = [
    ...walkTypeScript(resolve(FP_ROOT, 'codegen')),
    resolve(REPO_ROOT, 'packages/fp-compiler/scripts/gen-ops-table.ts'),
  ]
  const violations: string[] = []
  for (const path of generationFiles) {
    const source = readFileSync(path, 'utf8')
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        violations.push(`${relative(REPO_ROOT, path)} matches ${String(pattern)}`)
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`generator imports generated/runtime FP modules:\n${violations.join('\n')}`)
  }
}

function assertCleanInputGeneration(): void {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'stopcock-s2-clean-codegen-'))
  try {
    const temporaryFp = resolve(temporaryRoot, 'packages/fp')
    mkdirSync(resolve(temporaryRoot, 'packages/fp-compiler/src'), { recursive: true })
    cpSync(resolve(FP_ROOT, 'codegen'), resolve(temporaryFp, 'codegen'), {
      recursive: true,
      filter: (source) => !source.split('/').includes('generated'),
    })
    mkdirSync(resolve(temporaryFp, 'scripts'), { recursive: true })
    cpSync(
      resolve(FP_ROOT, 'scripts/sync-module-manifest.ts'),
      resolve(temporaryFp, 'scripts/sync-module-manifest.ts'),
    )
    cpSync(resolve(FP_ROOT, 'module-manifest.ts'), resolve(temporaryFp, 'module-manifest.ts'))
    cpSync(resolve(FP_ROOT, 'package.json'), resolve(temporaryFp, 'package.json'))

    run('bun', ['run', 'codegen/generate.ts'], temporaryFp, { STOPCOCK_CODEGEN_SKIP_FORMAT: '1' })

    const missing = GENERATED_PATHS.filter((path) => !existsSync(resolve(temporaryRoot, path)))
    if (missing.length > 0) {
      throw new Error(`clean-input generation omitted: ${missing.join(', ')}`)
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

assertAcyclicGeneratorImports()
assertCleanInputGeneration()
run('bun', ['run', 'codegen/generate.ts'], FP_ROOT)
const first = outputIdentity()
run('bun', ['run', 'codegen/generate.ts'], FP_ROOT)
const second = outputIdentity()
if (first !== second) {
  throw new Error(`consecutive code generation drifted: ${first} != ${second}`)
}

run('node', [resolve(REPO_ROOT, 'tooling/build-package.mjs')], FP_ROOT)
const postBuild = outputIdentity()
if (second !== postBuild) {
  throw new Error(`package build changed generated output: ${second} != ${postBuild}`)
}

if (CHECK_GIT_DIFF) {
  assertGeneratedTreeIsTrackedAndClean()
  run('git', ['diff', '--exit-code', '--', ...GENERATED_PATHS])
}

console.log(`codegen and build reproducibility: sha256:${postBuild}`)
