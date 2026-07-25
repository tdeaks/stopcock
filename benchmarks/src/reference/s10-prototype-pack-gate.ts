/**
 * S10 exact publish-style prototype pack.
 *
 * Produces the immutable decision input for S10J, and nothing more. It is not
 * the final topology: it answers one question, from the artifact rather than
 * from an estimate — how large is the optimizer's contribution to a
 * same-package publish?
 *
 *   below 100 KiB -> same-package-feasible
 *   at or above    -> externalization-required
 *
 * Measured on the real packed file set with unminified ESM, because that is
 * what a consumer installs. A lower bound from a bundled consumer is kept for
 * attribution but never used to choose the topology: tree-shaking is a
 * property of one consumer's build, and install cost is not.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const localDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(localDirectory, '..', '..', '..')
const fpRoot = join(repoRoot, 'packages', 'fp')

const KIB = 1024

/** The threshold the superplan sets for the XDEC topology decision. */
export const SAME_PACKAGE_CEILING_BYTES = 100 * KIB

export type PackCategory = 'optimizer' | 'compact' | 'direct' | 'compiler' | 'types' | 'metadata'

export interface PackedFile {
  readonly path: string
  readonly bytes: number
  readonly category: PackCategory
  readonly sha256: string
}

export interface PrototypePack {
  readonly files: readonly PackedFile[]
  readonly totalBytes: number
  readonly categoryBytes: Readonly<Record<PackCategory, number>>
  readonly optimizerBytes: number
  readonly decision: 'same-package-feasible' | 'externalization-required'
  /** Hash over the packed inventory: path, size, and content of every file. */
  readonly inventoryHash: string
}

/**
 * Which part of the product a packed file belongs to.
 *
 * The optimizer is the engine plus everything only it pulls in: the runner
 * bank, the lowerer, the plan machinery, and the operation registry. The
 * compact tier and the direct operations are separately reachable and are not
 * charged to it.
 */
const OPTIMIZER_FILES = [
  'compile',
  'lower',
  'portable-templates',
  'plan',
  'registry',
  'shape-entry',
  'sort-kernel',
  'fusion-engine',
  'fusion-flow',
  'fusion/optimized',
  'plan-analysis',
  'selection-trace',
]

export const categorize = (path: string): PackCategory => {
  if (path.endsWith('.d.ts')) return 'types'
  if (!path.endsWith('.js')) return 'metadata'
  // Packed paths are `dist/<name>[-<8-char content hash>].js`.
  const base = path.replace(/^dist\//u, '').replace(/-[A-Za-z0-9_-]{8}\.js$/u, '')
  if (base.startsWith('compact') || base === 'fusion.js' || base === 'fusion') return 'compact'
  if (base.startsWith('compiler') || base.includes('receipt')) return 'compiler'
  if (OPTIMIZER_FILES.some((name) => base === name || base.startsWith(`${name}.`))) {
    return 'optimizer'
  }
  return 'direct'
}

const walk = (root: string, prefix = ''): string[] =>
  readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const next = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    return entry.isDirectory() ? walk(root, next) : [next]
  })

export const buildPrototypePack = (): PrototypePack => {
  const staging = mkdtempSync(join(repoRoot, 'node_modules', '.stopcock-s10-pack-'))
  try {
    // `npm pack` applies the real `files` allowlist, so the inventory is what
    // a consumer would actually install rather than what the repo contains.
    const output = execFileSync('npm', ['pack', '--pack-destination', staging, '--silent'], {
      cwd: fpRoot,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
    const tarball = join(staging, output[output.length - 1])
    execFileSync('tar', ['-xzf', tarball, '-C', staging])

    const packageRoot = join(staging, 'package')
    const files: PackedFile[] = walk(packageRoot)
      .map((relativePath) => {
        const absolute = join(packageRoot, relativePath)
        const contents = readFileSync(absolute)
        return {
          path: relativePath,
          bytes: statSync(absolute).size,
          category: categorize(relativePath),
          sha256: `sha256:${createHash('sha256').update(contents).digest('hex')}`,
        }
      })
      .sort((a, b) => (a.path < b.path ? -1 : 1))

    const categoryBytes = {
      optimizer: 0,
      compact: 0,
      direct: 0,
      compiler: 0,
      types: 0,
      metadata: 0,
    } as Record<PackCategory, number>
    for (const file of files) categoryBytes[file.category] += file.bytes

    const inventory = createHash('sha256')
    for (const file of files) {
      inventory.update(file.path)
      inventory.update('\0')
      inventory.update(String(file.bytes))
      inventory.update('\0')
      inventory.update(file.sha256)
      inventory.update('\0')
    }

    const optimizerBytes = categoryBytes.optimizer
    return {
      files,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      categoryBytes,
      optimizerBytes,
      decision:
        optimizerBytes < SAME_PACKAGE_CEILING_BYTES
          ? 'same-package-feasible'
          : 'externalization-required',
      inventoryHash: `sha256:${inventory.digest('hex')}`,
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

const main = (): void => {
  const pack = buildPrototypePack()
  for (const [category, bytes] of Object.entries(pack.categoryBytes)) {
    console.log(`${category}\t${bytes} B`)
  }
  console.log(`total\t${pack.totalBytes} B\t${pack.files.length} files`)
  console.log(
    `optimizer\t${pack.optimizerBytes} B\tceiling ${SAME_PACKAGE_CEILING_BYTES} B\t${pack.decision}`,
  )
  console.log(`inventory\t${pack.inventoryHash}`)
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
if (invokedPath === fileURLToPath(import.meta.url)) main()

export { repoRoot, relative }
