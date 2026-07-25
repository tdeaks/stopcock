import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MANUAL_DENIED_PURE_INITIALIZERS_V1,
  MANUAL_PURE_DUAL_INITIALIZERS_V1,
  MANUAL_PURE_FREEZE_INITIALIZERS_V1,
  generatedDeniedInitializerKeysV1,
  generatedPureInitializerKeysV1,
  validatePureInitializerSourcePolicyV1,
  type PureInitializerSourceModuleV1,
} from '../codegen/purity'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = join(packageRoot, 'src')
const distRoot = join(packageRoot, 'dist')

function fail(message: string): never {
  throw new Error(`built purity contract: ${message}`)
}

function declaration(source: string, name: string): string {
  const match = new RegExp(`export const ${name}\\b`, 'u').exec(source)
  if (!match) fail(`source is missing export const ${name}`)
  const start = match.index
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next < 0 ? source.length : next)
}

function productionSourceModules(directory = sourceRoot): readonly PureInitializerSourceModuleV1[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__') return []
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return productionSourceModules(path)
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) return []
    return [
      {
        module: relative(sourceRoot, path).replaceAll('\\', '/').replace(/\.ts$/u, ''),
        source: readFileSync(path, 'utf8'),
      },
    ]
  })
}

function assertSourcePolicy(): void {
  for (const [moduleName, names] of Object.entries(MANUAL_PURE_DUAL_INITIALIZERS_V1)) {
    const source = readFileSync(join(sourceRoot, `${moduleName}.ts`), 'utf8')
    for (const name of names) {
      const initializer = declaration(source, name)
      if (!initializer.includes('= /* @__PURE__ */ dual(')) {
        fail(`${moduleName}.${name} is missing its reviewed manual annotation`)
      }
      if (/\{\s*op\s*:/u.test(initializer)) {
        fail(`${moduleName}.${name} became tagged and requires a new purity review`)
      }
    }
    const actual = (source.match(/\/\* @__PURE__ \*\/ dual\(/gu) ?? []).length
    if (actual !== names.length) {
      fail(`${moduleName}.ts contains ${actual} manual annotations; expected ${names.length}`)
    }
  }

  for (const [moduleName, names] of Object.entries(MANUAL_DENIED_PURE_INITIALIZERS_V1)) {
    const source = readFileSync(join(sourceRoot, `${moduleName}.ts`), 'utf8')
    for (const name of names) {
      if (declaration(source, name).includes('@__PURE__')) {
        fail(`${moduleName}.${name} is explicitly denied a pure annotation`)
      }
    }
  }

  for (const [moduleName, names] of Object.entries(MANUAL_PURE_FREEZE_INITIALIZERS_V1)) {
    const source = readFileSync(join(sourceRoot, `${moduleName}.ts`), 'utf8')
    for (const name of names) {
      if (
        !/= \/\* @__PURE__ \*\/ Object\.freeze\(\{\s*_tag:\s*0\s*\}\)\s*$/u.test(
          declaration(source, name),
        )
      ) {
        fail(`${moduleName}.${name} changed its reviewed fresh-literal initialization`)
      }
    }
  }

  try {
    validatePureInitializerSourcePolicyV1(productionSourceModules())
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

const builtFiles = readdirSync(distRoot)
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({
    file,
    source: readFileSync(join(distRoot, file), 'utf8'),
  }))

function builtModuleRegion(moduleName: string): string {
  const marker = `//#region src/${moduleName}.ts`
  const candidates = builtFiles.filter(({ source }) => source.includes(marker))
  if (candidates.length !== 1) {
    fail(`expected one built ${moduleName}.ts region; found ${candidates.length}`)
  }
  const source = candidates[0].source
  const start = source.indexOf(marker)
  const end = source.indexOf('//#endregion', start)
  if (end < 0) fail(`built ${moduleName}.ts region is unterminated`)
  return source.slice(start, end)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function assertBuiltPolicy(): void {
  const generatedRegions = new Map([
    ['array', builtModuleRegion('array')],
    ['math', builtModuleRegion('math')],
  ])
  for (const key of generatedPureInitializerKeysV1()) {
    const [moduleName, name] = key.split('.')
    const region = generatedRegions.get(moduleName)
    if (
      region === undefined ||
      !new RegExp(
        `const\\s+${escapeRegExp(name)}\\s*=\\s*/\\* @__PURE__ \\*/\\s*\\(\\(\\)\\s*=>`,
        'u',
      ).test(region)
    ) {
      fail(`built ${key} lost its generated pure initializer marker`)
    }
  }
  for (const key of generatedDeniedInitializerKeysV1()) {
    const [moduleName, name] = key.split('.')
    const region = generatedRegions.get(moduleName)
    if (
      region !== undefined &&
      new RegExp(`const\\s+${escapeRegExp(name)}\\s*=\\s*/\\* @__PURE__ \\*/`, 'u').test(region)
    ) {
      fail(`built ${key} retained a denied pure initializer marker`)
    }
  }

  for (const [moduleName, names] of Object.entries(MANUAL_PURE_DUAL_INITIALIZERS_V1)) {
    const region = builtModuleRegion(moduleName)
    for (const name of names) {
      if (
        !new RegExp(
          `const\\s+${escapeRegExp(name)}\\s*=\\s*/\\* @__PURE__ \\*/\\s*[A-Za-z_$][\\w$]*\\(`,
          'u',
        ).test(region)
      ) {
        fail(`built ${moduleName}.${name} lost its manual pure initializer marker`)
      }
    }
  }

  for (const [moduleName, names] of Object.entries(MANUAL_PURE_FREEZE_INITIALIZERS_V1)) {
    const region = builtModuleRegion(moduleName)
    for (const name of names) {
      if (
        !new RegExp(
          `const\\s+${escapeRegExp(name)}\\s*=\\s*/\\* @__PURE__ \\*/\\s*Object\\.freeze\\(\\{\\s*_tag:\\s*0\\s*\\}\\)`,
          'u',
        ).test(region)
      ) {
        fail(`built ${moduleName}.${name} lost its immutable pure initializer marker`)
      }
    }
  }
  const string = builtModuleRegion('string')
  for (const name of MANUAL_DENIED_PURE_INITIALIZERS_V1.string) {
    if (
      new RegExp(`const\\s+${escapeRegExp(name)}\\s*=\\s*/\\* @__PURE__ \\*/`, 'u').test(string)
    ) {
      fail(`built string.${name} retained a denied pure initializer marker`)
    }
  }
}

assertSourcePolicy()
assertBuiltPolicy()

const manualCount = Object.values(MANUAL_PURE_DUAL_INITIALIZERS_V1).reduce(
  (count, names) => count + names.length,
  0,
)
const immutableCount = Object.values(MANUAL_PURE_FREEZE_INITIALIZERS_V1).reduce(
  (count, names) => count + names.length,
  0,
)
console.log(
  `built purity contract: ${generatedPureInitializerKeysV1().length} generated, ${manualCount} manual dual, and ${immutableCount} immutable initializer markers verified`,
)
