import { execFileSync } from 'node:child_process'
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createScanner, SyntaxKind } from 'typescript/unstable/ast'
import { PUBLIC_MODULES } from '../module-manifest'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(packageRoot, '../..')
const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as {
  readonly name: string
  readonly exports: Record<string, string | { readonly types: string; readonly import: string }>
}

const expectedSubpaths = [...PUBLIC_MODULES.map(({ subpath }) => subpath), './package.json']
const actualSubpaths = Object.keys(packageJson.exports)

if (JSON.stringify(actualSubpaths) !== JSON.stringify(expectedSubpaths)) {
  throw new Error(
    `Export map does not match module-manifest.ts.\nExpected: ${expectedSubpaths.join(', ')}\nActual: ${actualSubpaths.join(', ')}`,
  )
}

const declarationRoot = resolve(packageRoot, 'dist')
const publicDeclarationPaths = PUBLIC_MODULES.map(({ subpath }) => {
  const exported = packageJson.exports[subpath]
  if (typeof exported === 'string') {
    throw new Error(`${subpath}: expected separate import and types targets`)
  }
  return resolve(packageRoot, exported.types)
})

const isPackageDeclaration = (path: string): boolean =>
  resolve(path).startsWith(`${declarationRoot}/`) && /\.d\.[cm]?ts$/u.test(path)

const declarationSources = new Map<string, string>()
const leakedDeclarationPaths: string[] = []
const unresolvedDeclarationPaths: string[] = []
const emittedDeclarationPaths = (await readdir(declarationRoot, { recursive: true }))
  .filter((file) => /\.d\.[cm]?ts$/u.test(file))
  .map((file) => resolve(declarationRoot, file))
const pendingDeclarationPaths = [
  ...new Set([...publicDeclarationPaths, ...emittedDeclarationPaths]),
]
while (pendingDeclarationPaths.length > 0) {
  const declarationPath = pendingDeclarationPaths.pop()
  if (!declarationPath || declarationSources.has(declarationPath)) continue

  let source: string
  try {
    source = await readFile(declarationPath, 'utf8')
  } catch {
    unresolvedDeclarationPaths.push(declarationPath)
    continue
  }
  declarationSources.set(declarationPath, source)

  const moduleSpecifierPattern = /(?:\bfrom\s+|\bimport\s*\(\s*)['"](?<specifier>[^'"]+)['"]/gu
  for (const match of source.matchAll(moduleSpecifierPattern)) {
    const specifier = match.groups?.specifier
    if (!specifier) continue
    const isLeaked =
      specifier.startsWith('/') ||
      specifier.startsWith('../') ||
      specifier.startsWith('file:') ||
      /^[A-Za-z]:[\\/]/u.test(specifier) ||
      specifier.includes('\\') ||
      specifier.includes('/src/') ||
      specifier.includes('node_modules') ||
      /\.tsx?$/u.test(specifier)
    if (isLeaked) {
      leakedDeclarationPaths.push(`${declarationPath} -> ${specifier}`)
      continue
    }
    if (!specifier.startsWith('.')) continue

    const declarationSpecifier = specifier.endsWith('.js')
      ? `${specifier.slice(0, -3)}.d.ts`
      : specifier.endsWith('.mjs')
        ? `${specifier.slice(0, -4)}.d.mts`
        : specifier.endsWith('.cjs')
          ? `${specifier.slice(0, -4)}.d.cts`
          : `${specifier}.d.ts`
    const dependencyPath = resolve(dirname(declarationPath), declarationSpecifier)
    if (!isPackageDeclaration(dependencyPath)) {
      leakedDeclarationPaths.push(`${declarationPath} -> ${specifier}`)
      continue
    }
    pendingDeclarationPaths.push(dependencyPath)
  }
}
if (unresolvedDeclarationPaths.length > 0) {
  throw new Error(
    `Published declarations reference missing declaration files:\n${unresolvedDeclarationPaths.join('\n')}`,
  )
}
if (leakedDeclarationPaths.length > 0) {
  throw new Error(
    `Published declarations leak source or filesystem-internal module paths:\n${leakedDeclarationPaths.join('\n')}`,
  )
}

const unsafeAnyLocations: string[] = []
for (const [declarationPath, source] of declarationSources) {
  const scanner = createScanner(true, undefined, source)
  for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
    if (token !== SyntaxKind.AnyKeyword) continue
    const index = scanner.getTokenStart()
    const lineStart = source.lastIndexOf('\n', index - 1) + 1
    const lineNumber = source.slice(0, index).split('\n').length
    const column = index - lineStart + 1
    unsafeAnyLocations.push(`${declarationPath}:${lineNumber}:${column}`)
  }
}
if (unsafeAnyLocations.length > 0) {
  throw new Error(
    `Published declarations expose explicit any types. Keep unsafe implementation casts private:\n${unsafeAnyLocations.join('\n')}`,
  )
}

for (const { subpath } of PUBLIC_MODULES) {
  const exported = packageJson.exports[subpath]
  if (typeof exported === 'string') {
    throw new Error(`${subpath}: expected separate import and types targets`)
  }

  const runtimePath = resolve(packageRoot, exported.import)
  const declarationPath = resolve(packageRoot, exported.types)
  await access(runtimePath)
  await access(declarationPath)
  await import(pathToFileURL(runtimePath).href)
}

const rootExport = packageJson.exports['.']
if (typeof rootExport === 'string') throw new Error('Root export must expose types and import')
const rootModule = await import(pathToFileURL(resolve(packageRoot, rootExport.import)).href)
const expectedRootKeys = [
  'compile',
  'compilePure',
  'dual',
  'err',
  'explain',
  'flow',
  'isErr',
  'isNone',
  'isOk',
  'isSome',
  'none',
  'ok',
  'optionFromNullable',
  'pipe',
  'some',
]
const rootKeys = Object.keys(rootModule).sort()
if (JSON.stringify(rootKeys) !== JSON.stringify(expectedRootKeys)) {
  throw new Error(
    `Root surface changed without updating its contract.\nExpected: ${expectedRootKeys.join(', ')}\nActual: ${rootKeys.join(', ')}`,
  )
}

const scratch = await mkdtemp(join(tmpdir(), 'stopcock-fp-contract-'))
try {
  execFileSync('bun', ['pm', 'pack', '--destination', scratch], {
    cwd: packageRoot,
    stdio: 'inherit',
  })
  const tarballs = (await readdir(scratch)).filter((file) => file.endsWith('.tgz'))
  if (tarballs.length !== 1) {
    throw new Error(`Expected one packed tarball, found ${tarballs.length}`)
  }
  const tarball = join(scratch, tarballs[0])
  const files = execFileSync('tar', ['-tzf', tarball], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)

  const forbidden = files.filter((file) =>
    /(?:^|\/)(?:src|scripts|codegen|__tests__)(?:\/|$)|\.(?:test|bench)\./u.test(file),
  )
  if (forbidden.length > 0) {
    throw new Error(`Packed tarball leaks development files:\n${forbidden.join('\n')}`)
  }

  const consumer = join(scratch, 'consumer')
  await mkdir(consumer)
  await writeFile(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'stopcock-fp-contract-consumer',
        private: true,
        type: 'module',
        dependencies: {
          [packageJson.name]: `file:${tarball}`,
        },
      },
      null,
      2,
    )}\n`,
  )
  execFileSync('bun', ['install', '--ignore-scripts'], {
    cwd: consumer,
    stdio: 'inherit',
  })

  const imports = PUBLIC_MODULES.map(({ subpath }, index) => {
    const specifier = subpath === '.' ? packageJson.name : `${packageJson.name}/${subpath.slice(2)}`
    return `import * as module${index} from ${JSON.stringify(specifier)}`
  })
  await writeFile(
    join(consumer, 'consumer.ts'),
    `${imports.join('\n')}\nvoid [${PUBLIC_MODULES.map((_, index) => `module${index}`).join(', ')}]\n`,
  )
  const dualSpecifier = `${packageJson.name}/dual`
  await writeFile(
    join(consumer, 'dual-contract.ts'),
    `import { dual } from ${JSON.stringify(dualSpecifier)}

type IsAny<T> = 0 extends 1 & T ? true : false
type ExpectFalse<Value extends false> = Value

const binary = dual(2, (value: number, suffix: string) => \`\${value}\${suffix}\`)
type BinaryIsTyped = ExpectFalse<IsAny<typeof binary>>
type BinaryReturnIsTyped = ExpectFalse<IsAny<ReturnType<typeof binary>>>

const immediate: string = binary(1, 'px')
const dataLast: (value: number) => string = binary('px')

const tagged = dual(
  4,
  (value: string, search: RegExp, replacement: string, limit: number) =>
    \`\${value.replace(search, replacement)}\${limit}\`,
  { op: 'replace' },
)
const taggedDataLast = tagged(/x/u, 'y', 1)
const opcode: number = taggedDataLast._op
const capturedFunction: RegExp = taggedDataLast._fn
const capturedArgument: string = taggedDataLast._a1
const secondCapturedArgument: number = taggedDataLast._a2

// @ts-expect-error partial application requires every non-data argument.
binary()
// @ts-expect-error declared arity must match the body tuple.
dual(2, (value: number, a: string, b: boolean) => \`\${value}\${a}\${b}\`)
// @ts-expect-error contextual types cannot replace the implementation contract.
const forged: {
  (value: string, date: Date): boolean
  (date: Date): (value: string) => boolean
} = dual(2, (value: number, addend: number) => value + addend)

void [
  null as unknown as BinaryIsTyped,
  null as unknown as BinaryReturnIsTyped,
  immediate,
  dataLast,
  opcode,
  capturedFunction,
  capturedArgument,
  secondCapturedArgument,
  forged,
]
`,
  )
  await writeFile(
    join(consumer, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['consumer.ts', 'dual-contract.ts'],
      },
      null,
      2,
    )}\n`,
  )

  const tsc = join(repositoryRoot, 'node_modules/typescript/lib/tsc.js')
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {
    cwd: consumer,
    stdio: 'inherit',
  })
  await writeFile(
    join(consumer, 'tsconfig.nodenext.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ['consumer.ts', 'dual-contract.ts'],
      },
      null,
      2,
    )}\n`,
  )
  execFileSync(process.execPath, [tsc, '-p', 'tsconfig.nodenext.json'], {
    cwd: consumer,
    stdio: 'inherit',
  })
  execFileSync('bun', ['run', 'consumer.ts'], {
    cwd: consumer,
    stdio: 'inherit',
  })
} finally {
  await rm(scratch, { recursive: true, force: true })
}

await import('./check-built-purity')

console.log(
  `Package contract verified for ${PUBLIC_MODULES.length} public modules with bundler, NodeNext, and runtime consumers`,
)
