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
import { createRequire } from 'node:module'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  COMPILER_EMITTER_SOURCE_PATHS_V1,
  PROTOCOL_GENERATED_PATHS_V1,
} from '../codegen/protocol/generate-protocol'

const FP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = resolve(FP_ROOT, '../..')
const CHECK_GIT_DIFF = !process.argv.includes('--no-git-diff')
const requireCompilerDependency = createRequire(
  resolve(REPO_ROOT, 'packages/fp-compiler/package.json'),
)
const { parse: parseTypeScript } = requireCompilerDependency('@babel/parser') as {
  readonly parse: (
    source: string,
    options: {
      readonly sourceType: 'module'
      readonly plugins: readonly ['typescript']
    },
  ) => unknown
}

const GENERATED_PATHS = [
  ...PROTOCOL_GENERATED_PATHS_V1,
  'packages/fp/src/array.ts',
  'packages/fp/src/boolean.ts',
  'packages/fp/src/math.ts',
  'packages/fp/src/iter-kernels.ts',
  'packages/fp/src/internal/compact/facts.generated.ts',
  'packages/fp/codegen/generated/iter-kernel-manifest-v1.json',
  'packages/fp-optimizer/src/portable-templates.ts',
  'packages/fp-optimizer/codegen/generated/fusion-runner-bank-v1.json',
  'packages/fp-optimizer/src/runner-keys.generated.ts',
  'packages/fp-optimizer/src/bank-identity.generated.ts',
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

function stringLiteralValue(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const node = value as { readonly type?: unknown; readonly value?: unknown }
  return (node.type === 'StringLiteral' || node.type === 'Literal') &&
    typeof node.value === 'string'
    ? node.value
    : undefined
}

function staticModuleSpecifiers(source: string): readonly string[] {
  const root = parseTypeScript(source, {
    sourceType: 'module',
    plugins: ['typescript'],
  })
  const found = new Set<string>()
  const seen = new WeakSet<object>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (typeof value !== 'object' || value === null || seen.has(value)) return
    seen.add(value)
    const node = value as Record<string, unknown>
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
      case 'ExportAllDeclaration': {
        const specifier = stringLiteralValue(node.source)
        if (specifier !== undefined) found.add(specifier)
        break
      }
      case 'TSImportEqualsDeclaration': {
        const reference = node.moduleReference as Record<string, unknown> | undefined
        const specifier = stringLiteralValue(reference?.expression)
        if (specifier !== undefined) found.add(specifier)
        break
      }
      case 'ImportExpression': {
        const specifier = stringLiteralValue(node.source)
        if (specifier !== undefined) found.add(specifier)
        break
      }
      case 'TSImportType': {
        const specifier =
          stringLiteralValue(node.source) ??
          stringLiteralValue(node.argument) ??
          stringLiteralValue((node.argument as Record<string, unknown> | undefined)?.literal)
        if (specifier !== undefined) found.add(specifier)
        break
      }
      case 'CallExpression': {
        const callee = node.callee as Record<string, unknown> | undefined
        const isRequire = callee?.type === 'Identifier' && callee.name === 'require'
        const isDynamicImport = callee?.type === 'Import'
        if (isRequire || isDynamicImport) {
          const [argument] = (node.arguments as readonly unknown[] | undefined) ?? []
          const specifier = stringLiteralValue(argument)
          if (specifier !== undefined) found.add(specifier)
        }
        break
      }
    }
    for (const child of Object.values(node)) visit(child)
  }
  visit(root)
  return Object.freeze([...found])
}

const GENERATED_RUNTIME_SOURCE_ROOTS = Object.freeze([
  resolve(REPO_ROOT, 'packages/fp/src'),
  resolve(REPO_ROOT, 'packages/fp-optimizer/src'),
  resolve(REPO_ROOT, 'packages/fp-compiler/src'),
])

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function importsGeneratedRuntime(importer: string, specifier: string): boolean {
  if (
    specifier === '@stopcock/fp' ||
    specifier.startsWith('@stopcock/fp/') ||
    specifier === '@stopcock/fp-optimizer' ||
    specifier.startsWith('@stopcock/fp-optimizer/') ||
    specifier === '@stopcock/fp-compiler' ||
    specifier.startsWith('@stopcock/fp-compiler/')
  ) {
    return true
  }

  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    const importedPath = resolve(dirname(importer), specifier)
    return GENERATED_RUNTIME_SOURCE_ROOTS.some((root) => isWithin(root, importedPath))
  }

  // Reject repository-shaped bare paths too. They are not normal Node package
  // specifiers, but build-tool aliases could otherwise turn one into a
  // generator-to-runtime edge that the clean-input replay silently accepts.
  return /^(?:packages\/)?(?:fp|fp-optimizer|fp-compiler)\/src(?:\/|$)/u.test(specifier)
}

function assertStaticModuleScannerCoverage(): void {
  const nestedRuntimeSpecifier = '../../src/registry'
  const actual = new Set(
    staticModuleSpecifiers(
      [
        "import type { A } from '../src/a'",
        "export type { B } from '../src/b'",
        "import legacy = require('../src/c')",
        "const required = require('../src/d')",
        "const dynamic = import('../src/e')",
        "type Imported = import('../src/f').Value",
        `export type { Nested } from '${nestedRuntimeSpecifier}'`,
        "const generated = `import type { Hidden } from '../src/not-code'`",
      ].join('\n'),
    ),
  )
  const expected = [
    '../src/a',
    '../src/b',
    '../src/c',
    '../src/d',
    '../src/e',
    '../src/f',
    nestedRuntimeSpecifier,
  ]
  const missing = expected.filter((specifier) => !actual.has(specifier))
  const nestedGenerator = resolve(FP_ROOT, 'codegen/protocol/scanner-probe.ts')
  const missedNestedRuntime = !importsGeneratedRuntime(
    nestedGenerator,
    nestedRuntimeSpecifier,
  )
  const rejectedDefinitionInput = importsGeneratedRuntime(
    nestedGenerator,
    './operator-definitions',
  )
  if (
    missing.length > 0 ||
    actual.has('../src/not-code') ||
    missedNestedRuntime ||
    rejectedDefinitionInput
  ) {
    throw new Error(
      `generator import scanner lost coverage: missing=${missing.join(',')} template=${actual.has('../src/not-code')} nestedRuntime=${!missedNestedRuntime} definitionInput=${!rejectedDefinitionInput}`,
    )
  }
}

function assertAcyclicGeneratorImports(): void {
  const generationFiles = [
    ...walkTypeScript(resolve(FP_ROOT, 'codegen')),
    ...walkTypeScript(resolve(REPO_ROOT, 'packages/fp-optimizer/codegen')),
    resolve(REPO_ROOT, 'packages/fp-compiler/scripts/gen-ops-table.ts'),
  ]
  const violations: string[] = []
  assertStaticModuleScannerCoverage()
  for (const path of generationFiles) {
    const source = readFileSync(path, 'utf8')
    for (const specifier of staticModuleSpecifiers(source)) {
      if (importsGeneratedRuntime(path, specifier)) {
        violations.push(`${relative(REPO_ROOT, path)} imports ${specifier}`)
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
    const temporaryOptimizer = resolve(temporaryRoot, 'packages/fp-optimizer')
    mkdirSync(resolve(temporaryRoot, 'packages/fp-compiler/src'), { recursive: true })
    for (const path of COMPILER_EMITTER_SOURCE_PATHS_V1) {
      const destination = resolve(temporaryRoot, path)
      mkdirSync(dirname(destination), { recursive: true })
      cpSync(resolve(REPO_ROOT, path), destination)
    }
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
    mkdirSync(resolve(temporaryOptimizer, 'src'), { recursive: true })
    mkdirSync(resolve(temporaryOptimizer, 'codegen', 'generated'), { recursive: true })
    cpSync(
      resolve(REPO_ROOT, 'packages/fp-optimizer/codegen/portable-templates.ts'),
      resolve(temporaryOptimizer, 'codegen/portable-templates.ts'),
    )

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
