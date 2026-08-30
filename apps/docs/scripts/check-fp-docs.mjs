import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { API, SignatureKind, SymbolFlags } from 'typescript/unstable/sync'
import {
  COMPANION_DUAL_REFERENCE_MANIFEST,
  DUAL_REFERENCE_DOCUMENTS,
  EXPECTED_COMPANION_DUAL_EXPORT_COUNT,
  EXPECTED_DUAL_EXPORT_COUNT,
  EXPECTED_DUAL_MODULE_COUNT,
  NON_DUAL_OVERLOAD_EXCLUSIONS,
  findStaleCurrentVersionClaims,
  findStaleDualOnlyClaims,
  findUnicodeEmDashes,
  hasOperationReference,
  missingDualReferenceLanes,
  parseFpDualCatalogue,
} from './fp-docs-contract.mjs'

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(docsRoot, '../..')
const contentRoot = join(docsRoot, 'src/content/docs')
const componentsRoot = join(docsRoot, 'src/components')
const packagesRoot = join(repositoryRoot, 'packages')

const repositoryRelative = (file) => relative(repositoryRoot, file).replaceAll('\\', '/')

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else files.push(path)
  }
  return files
}

const errors = []
const forbiddenRootNames = new Set([
  'A',
  'B',
  'D',
  'G',
  'Lens',
  'Logic',
  'M',
  'N',
  'O',
  'Obj',
  'R',
  'S',
  'Stream',
  'V',
  'each',
  'filtered',
  'index',
  'lens',
  'modify',
  'over',
  'path',
  'prop',
  'set',
  'view',
])
const legacySubpaths =
  /(?:from\s+|import\s*\()\s*['"]@stopcock\/fp\/(?:stream|dict|logic|lens|prism|traversal|iso)['"]/gu

const contentFiles = (await walk(contentRoot)).filter((file) => file.endsWith('.mdx'))
const componentFiles = (await walk(componentsRoot)).filter((file) =>
  /\.(?:astro|[cm]?[jt]sx?)$/u.test(file),
)
const packageReadmes = []
for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const directory = join(packagesRoot, entry.name)
  if ((await readdir(directory)).includes('README.md')) {
    packageReadmes.push(join(directory, 'README.md'))
  }
}

const documentSources = new Map()
for (const file of [...contentFiles, ...componentFiles, ...packageReadmes]) {
  const document = repositoryRelative(file)
  const source = await readFile(file, 'utf8')
  documentSources.set(document, source)

  for (const claim of findStaleDualOnlyClaims(source)) {
    errors.push(`${document}:${claim.line}: stale curried-only or data-last-only claim`)
  }
  for (const claim of findStaleCurrentVersionClaims(document, source)) {
    errors.push(
      `${document}:${claim.line}: stale current-version label ${JSON.stringify(claim.text)}`,
    )
  }
  for (const dash of findUnicodeEmDashes(source)) {
    errors.push(`${document}:${dash.line}: Unicode em dash; use ASCII punctuation`)
  }
}

for (const file of contentFiles) {
  const relative = file.slice(docsRoot.length + 1)
  const source = documentSources.get(repositoryRelative(file))
  if (source === undefined) throw new Error(`${repositoryRelative(file)} was not loaded`)
  // Deleted lines in migration diff blocks intentionally show the old API.
  const liveSource = source
    .split('\n')
    .filter((line) => !line.startsWith('- '))
    .join('\n')

  for (const match of liveSource.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*['"]@stopcock\/fp['"]/gu,
  )) {
    const names = match[1]
      .split(',')
      .map(
        (part) =>
          part
            .trim()
            .replace(/^type\s+/u, '')
            .split(/\s+as\s+/u)[0],
      )
      .filter(Boolean)
    const forbidden = names.filter((name) => forbiddenRootNames.has(name))
    if (forbidden.length > 0) {
      errors.push(`${relative}: legacy root imports ${forbidden.join(', ')}; use public subpaths`)
    }
  }

  if (legacySubpaths.test(liveSource)) {
    errors.push(`${relative}: imports a removed 1.x FP subpath`)
  }
  legacySubpaths.lastIndex = 0

  if (
    !relative.includes('migration') &&
    /\bcompileJit\b|\bruntime JIT\b|\bnew Function\(\).*(?:fusion|pipeline)/iu.test(liveSource)
  ) {
    errors.push(`${relative}: describes the removed runtime-JIT contract`)
  }
}

const manifest = await readFile(join(repositoryRoot, 'packages/fp/module-manifest.ts'), 'utf8')
const publicModules = [
  ...manifest.matchAll(/\{\s*subpath:\s*'([^']+)',\s*entry:\s*'([^']+)'/gu),
].map((match) => ({ subpath: match[1], entry: match[2] }))
const specialistModules = publicModules.filter(({ subpath }) => subpath !== '.')
const subpaths = specialistModules.map(({ subpath }) => subpath)
const catalogue = await readFile(join(contentRoot, 'api/modules.mdx'), 'utf8')
for (const subpath of subpaths) {
  if (!catalogue.includes(`\`${subpath.slice(1)}\``)) {
    errors.push(`api/modules.mdx: missing public subpath ${subpath}`)
  }
}

const resolveAlias = (checker, symbol) =>
  symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol

const isDualCallable = (checker, symbol) => {
  if (!(symbol.flags & SymbolFlags.Value)) return false
  const type = checker.getTypeOfSymbol(symbol)
  if (type === undefined) return false
  const signatures = checker.getSignaturesOfType(type, SignatureKind.Call)
  if (signatures.length < 2) return false
  const arities = new Set(signatures.map((signature) => signature.getParameters().length))
  if (arities.size < 2) return false
  return signatures.some((signature) => {
    const result = checker.getReturnTypeOfSignature(signature)
    return (
      result !== undefined && checker.getSignaturesOfType(result, SignatureKind.Call).length > 0
    )
  })
}

const hasDualDispatchEvidence = (symbol, moduleExports, seen = new Set()) => {
  if (seen.has(symbol)) return false
  seen.add(symbol)
  const source = (symbol.declarations ?? [])
    .map((declaration) => declaration.resolve().getText())
    .join('\n')
  if (/\barguments\.length\b|\btypeof\b|\bArray\.isArray\b|\.length\s*[!<>=]/u.test(source)) {
    return true
  }

  const alias = source.match(/=\s*([A-Za-z_$][\w$]*)\s*$/u)?.[1]
  const target =
    alias === undefined ? undefined : moduleExports.find((candidate) => candidate.name === alias)
  return target !== undefined && hasDualDispatchEvidence(target, moduleExports, seen)
}

const collectDualExportInventory = () => {
  const config = join(repositoryRoot, 'packages/fp/tsconfig.json')
  const api = new API({ cwd: repositoryRoot })
  try {
    const snapshot = api.updateSnapshot({ openProjects: [config] })
    const project = snapshot.getProject(config)
    if (project === undefined) throw new Error(`TypeScript project not found: ${config}`)

    const checker = project.checker
    const inventory = new Map()
    for (const { subpath, entry } of specialistModules) {
      const sourceFile = project.program.getSourceFile(join(repositoryRoot, 'packages/fp', entry))
      if (sourceFile === undefined) throw new Error(`${subpath}: TypeScript source not found`)
      if (!/\barguments\.length\b/u.test(sourceFile.text)) continue
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
      if (moduleSymbol === undefined) throw new Error(`${subpath}: module symbol not found`)

      const moduleExports = checker.getExportsOfModule(moduleSymbol)
      const names = []
      for (const symbol of moduleExports) {
        if (NON_DUAL_OVERLOAD_EXCLUSIONS.has(`${subpath}:${symbol.name}`)) continue
        if (isDualCallable(checker, symbol) && hasDualDispatchEvidence(symbol, moduleExports)) {
          names.push(symbol.name)
        }
      }

      if (names.length > 0) {
        inventory.set(
          subpath,
          names.toSorted((left, right) => left.localeCompare(right)),
        )
      }
    }
    return inventory
  } finally {
    api.close()
  }
}

const dualExportInventory = collectDualExportInventory()
const dualExportCount = [...dualExportInventory.values()].reduce(
  (count, names) => count + names.length,
  0,
)
if (dualExportInventory.size !== EXPECTED_DUAL_MODULE_COUNT) {
  errors.push(
    `dual export inventory has ${dualExportInventory.size} modules; expected ${EXPECTED_DUAL_MODULE_COUNT}`,
  )
}
if (dualExportCount !== EXPECTED_DUAL_EXPORT_COUNT) {
  errors.push(
    `dual export inventory has ${dualExportCount} names; expected ${EXPECTED_DUAL_EXPORT_COUNT}`,
  )
}
for (const subpath of dualExportInventory.keys()) {
  if (!catalogue.includes(`\`${subpath.slice(1)}\``)) {
    errors.push(`api/modules.mdx: missing dual module ${subpath}`)
  }
}

const catalogueSections = parseFpDualCatalogue(catalogue)
for (const [subpath, names] of dualExportInventory) {
  const section = catalogueSections.get(subpath)
  if (section === undefined) {
    errors.push(`api/modules.mdx: missing exact dual catalogue for ${subpath}`)
    continue
  }
  if (section.expectedCount !== section.operations.length) {
    errors.push(
      `api/modules.mdx: ${subpath} heading says ${section.expectedCount} operations but lists ${section.operations.length}`,
    )
  }

  const documented = new Set(section.operations)
  const actual = new Set(names)
  const missing = names.filter((name) => !documented.has(name))
  const extra = section.operations.filter((name) => !actual.has(name))
  if (missing.length > 0) {
    errors.push(`api/modules.mdx: ${subpath} is missing dual names ${missing.join(', ')}`)
  }
  if (extra.length > 0) {
    errors.push(`api/modules.mdx: ${subpath} has non-dual names ${extra.join(', ')}`)
  }
}
for (const subpath of catalogueSections.keys()) {
  if (!dualExportInventory.has(subpath)) {
    errors.push(`api/modules.mdx: dual catalogue names non-dual module ${subpath}`)
  }
}

const collectCompanionDualExportInventory = (packageName, contract) => {
  const packageRoot = join(packagesRoot, packageName)
  const config = join(packageRoot, 'tsconfig.json')
  const api = new API({ cwd: repositoryRoot })
  try {
    const snapshot = api.updateSnapshot({ openProjects: [config] })
    const project = snapshot.getProject(config)
    if (project === undefined) throw new Error(`TypeScript project not found: ${config}`)

    const checker = project.checker
    const direct = new Map()
    const qualified = new Map()
    for (const entry of contract.entries) {
      const sourceFile = project.program.getSourceFile(join(packageRoot, entry))
      if (sourceFile === undefined) throw new Error(`${packageName}/${entry}: source not found`)
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
      if (moduleSymbol === undefined)
        throw new Error(`${packageName}/${entry}: module symbol not found`)
      const exports = checker.getExportsOfModule(moduleSymbol)

      for (const exported of exports) {
        const symbol = resolveAlias(checker, exported)
        if (!isDualCallable(checker, symbol)) continue
        const type = checker.getTypeOfSymbol(symbol)
        const types = direct.get(exported.name) ?? []
        types.push(type)
        direct.set(exported.name, types)
      }

      for (const namespace of contract.namespaces) {
        const exported = exports.find((candidate) => candidate.name === namespace)
        if (exported === undefined) continue
        const symbol = resolveAlias(checker, exported)
        const members =
          symbol.flags & SymbolFlags.Module
            ? checker.getExportsOfModule(symbol)
            : checker.getPropertiesOfType(checker.getTypeOfSymbol(symbol))
        for (const member of members) {
          const memberSymbol = resolveAlias(checker, member)
          if (!isDualCallable(checker, memberSymbol)) continue
          qualified.set(`${namespace}.${member.name}`, checker.getTypeOfSymbol(memberSymbol))
        }
      }
    }

    // Object namespaces can re-expose an operation that is also exported at the
    // package root. Keep the qualified spelling when both names point at the
    // same callable type. Distinct root and namespace operations remain separate.
    for (const namespace of contract.namespaces) {
      for (const [name, types] of direct) {
        const qualifiedType = qualified.get(`${namespace}.${name}`)
        if (qualifiedType !== undefined && types.some((type) => type === qualifiedType)) {
          direct.delete(name)
        }
      }
    }

    return new Set(
      [...direct.keys(), ...qualified.keys()].toSorted((left, right) => left.localeCompare(right)),
    )
  } finally {
    api.close()
  }
}

let companionDualExportCount = 0
for (const [packageName, contract] of Object.entries(COMPANION_DUAL_REFERENCE_MANIFEST)) {
  const inventory = collectCompanionDualExportInventory(packageName, contract)
  companionDualExportCount += inventory.size
  const expected = new Set(contract.operations)
  const missingFromSource = contract.operations.filter((operation) => !inventory.has(operation))
  const missingFromManifest = [...inventory]
    .filter((operation) => !expected.has(operation))
    .toSorted((left, right) => left.localeCompare(right))
  if (missingFromSource.length > 0) {
    errors.push(
      `${packageName}: companion dual manifest names non-dual or missing operations ${missingFromSource.join(', ')}`,
    )
  }
  if (missingFromManifest.length > 0) {
    errors.push(
      `${packageName}: companion dual manifest is missing operations ${missingFromManifest.join(', ')}`,
    )
  }

  const pageSource = documentSources.get(contract.page)
  if (pageSource === undefined) {
    errors.push(`${contract.page}: missing companion dual reference page`)
    continue
  }
  for (const operation of contract.operations) {
    if (!hasOperationReference(pageSource, operation)) {
      errors.push(`${contract.page}: missing exact dual operation reference ${operation}`)
    }
  }
  const missingLanes = missingDualReferenceLanes(pageSource)
  if (missingLanes.length > 0) {
    errors.push(`${contract.page}: missing ${missingLanes.join(' and ')} dual-reference coverage`)
  }
}
if (companionDualExportCount !== EXPECTED_COMPANION_DUAL_EXPORT_COUNT) {
  errors.push(
    `companion dual export inventory has ${companionDualExportCount} names; expected ${EXPECTED_COMPANION_DUAL_EXPORT_COUNT}`,
  )
}

for (const document of DUAL_REFERENCE_DOCUMENTS) {
  const source = documentSources.get(document)
  if (source === undefined) {
    errors.push(`${document}: missing dual-reference document`)
    continue
  }

  const missingLanes = missingDualReferenceLanes(source)
  if (missingLanes.length > 0) {
    errors.push(`${document}: missing ${missingLanes.join(' and ')} dual-reference coverage`)
  }
}

if (errors.length > 0) {
  throw new Error(`FP documentation contract failed:\n${errors.join('\n')}`)
}

console.log(
  `FP documentation contract verified across ${subpaths.length} specialist subpaths, ${dualExportCount} FP dual exports in ${dualExportInventory.size} modules, and ${companionDualExportCount} companion dual exports`,
)
