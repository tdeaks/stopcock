import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(docsRoot, '../..')
const contentRoot = join(docsRoot, 'src/content/docs')

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else if (entry.name.endsWith('.mdx')) files.push(path)
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

for (const file of await walk(contentRoot)) {
  const relative = file.slice(docsRoot.length + 1)
  const source = await readFile(file, 'utf8')
  // Deleted lines in migration diff blocks intentionally show the old API.
  const liveSource = source
    .split('\n')
    .filter((line) => !line.startsWith('- '))
    .join('\n')

  for (const match of liveSource.matchAll(
    /import\s*\{([\s\S]*?)\}\s*from\s*['"]@stopcock\/fp['"]/gu,
  )) {
    const names = match[1]
      .split(',')
      .map((part) =>
        part
          .trim()
          .replace(/^type\s+/u, '')
          .split(/\s+as\s+/u)[0],
      )
      .filter(Boolean)
    const forbidden = names.filter((name) => forbiddenRootNames.has(name))
    if (forbidden.length > 0) {
      errors.push(
        `${relative}: legacy root imports ${forbidden.join(', ')}; use public subpaths`,
      )
    }
  }

  if (legacySubpaths.test(liveSource)) {
    errors.push(`${relative}: imports a removed 1.x FP subpath`)
  }
  legacySubpaths.lastIndex = 0

  if (
    !relative.includes('migration') &&
    /\bcompileJit\b|\bruntime JIT\b|\bnew Function\(\).*(?:fusion|pipeline)/iu.test(
      liveSource,
    )
  ) {
    errors.push(`${relative}: describes the removed runtime-JIT contract`)
  }
}

const manifest = await readFile(
  join(repositoryRoot, 'packages/fp/module-manifest.ts'),
  'utf8',
)
const subpaths = [...manifest.matchAll(/\{\s*subpath:\s*'([^']+)'/gu)]
  .map((match) => match[1])
  .filter((subpath) => subpath !== '.')
const catalogue = await readFile(
  join(contentRoot, 'api/modules.mdx'),
  'utf8',
)
for (const subpath of subpaths) {
  if (!catalogue.includes(`\`${subpath.slice(1)}\``)) {
    errors.push(`api/modules.mdx: missing public subpath ${subpath}`)
  }
}

if (errors.length > 0) {
  throw new Error(`FP documentation contract failed:\n${errors.join('\n')}`)
}

console.log(
  `FP documentation contract verified across ${subpaths.length} specialist subpaths`,
)
