#!/usr/bin/env node
// CI asset scan for the portable module graph boundary. See docs/superpowers/plans/
// 2026-07-21-stopcock-fp-tiered-execution-implementation.md, "Portable
// boundary". Regex-based source graph walk (no bundler run: the package
// ships source, and this check is defined over that source graph).
//
// Asserts:
//  (a) resolving '#jit-loader' under the stopcock-portable condition and
//      walking every import edge reachable from src/index.ts never reaches
//      jit-chunk.ts, and no visited module's source contains a Function
//      constructor reference (`new Function` or a bare `Function(` call).
//  (b) resolving '#jit-loader' under the default condition, jit-chunk.ts IS
//      reached from src/index.ts, and every edge into it is a dynamic
//      import() — never a static import/export-from.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(SCRIPT_DIR, '..')
const SRC_ROOT = join(PKG_ROOT, 'src')
const ENTRY = join(SRC_ROOT, 'index.ts')

type EdgeKind = 'static' | 'dynamic'

interface PackageJson {
  readonly imports?: Record<string, Record<string, string> | string>
}

interface Edge {
  readonly from: string
  readonly to: string
  readonly kind: EdgeKind
}

interface GraphWalkResult {
  readonly visited: ReadonlySet<string>
  readonly edges: readonly Edge[]
}

// Matches `import ... from '...'` / `export ... from '...'`, including
// multi-line named-import lists (`[\s\S]*?` spans newlines, non-greedy so it
// stops at the first `from` clause it finds).
const STATIC_SPECIFIER_RE = /^[ \t]*(?:export|import)\s+(?:type\s+)?[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/gm
// Side-effect-only imports: `import '...'`.
const SIDE_EFFECT_IMPORT_RE = /^[ \t]*import\s+['"]([^'"]+)['"]/gm
const DYNAMIC_SPECIFIER_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const NEW_FUNCTION_RE = /\bnew\s+Function\s*\(/
const FUNCTION_CALL_RE = /\bFunction\s*\(/

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as PackageJson
}

function resolveFile(pathNoExt: string): string {
  for (const ext of ['.ts', '.tsx']) {
    const candidate = pathNoExt.endsWith(ext) ? pathNoExt : pathNoExt + ext
    if (existsSync(candidate)) return candidate
  }
  if (existsSync(pathNoExt)) return pathNoExt
  throw new Error(`check-portable-boundary: cannot resolve module file for ${pathNoExt}`)
}

/** Resolves a single import specifier from `fromFile` to an absolute source
 * file path, or null if it's outside this package's own src graph (a bare
 * package import, a node builtin, etc.) — those aren't part of the boundary
 * we're auditing. */
function resolveSpecifier(fromFile: string, specifier: string, pkg: PackageJson, condition: string): string | null {
  if (specifier.startsWith('.')) {
    return resolveFile(join(dirname(fromFile), specifier))
  }
  if (specifier.startsWith('#')) {
    const entry = pkg.imports?.[specifier]
    if (!entry) throw new Error(`check-portable-boundary: no "imports" entry for ${specifier}`)
    const target = typeof entry === 'string' ? entry : (entry[condition] ?? entry.default)
    if (!target) throw new Error(`check-portable-boundary: no target for ${specifier} under condition "${condition}" or "default"`)
    return resolveFile(join(PKG_ROOT, target))
  }
  return null
}

function extractEdges(source: string): readonly { specifier: string; kind: EdgeKind }[] {
  const out: { specifier: string; kind: EdgeKind }[] = []
  for (const m of source.matchAll(STATIC_SPECIFIER_RE)) out.push({ specifier: m[1], kind: 'static' })
  for (const m of source.matchAll(SIDE_EFFECT_IMPORT_RE)) out.push({ specifier: m[1], kind: 'static' })
  for (const m of source.matchAll(DYNAMIC_SPECIFIER_RE)) out.push({ specifier: m[1], kind: 'dynamic' })
  return out
}

/** Walks the full source import graph reachable from `entry`, resolving the
 * package-internal '#jit-loader' specifier under `condition`. */
function walkGraph(entry: string, pkg: PackageJson, condition: string): GraphWalkResult {
  const visited = new Set<string>()
  const edges: Edge[] = []
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (visited.has(file)) continue
    visited.add(file)
    const source = readFileSync(file, 'utf8')
    for (const { specifier, kind } of extractEdges(source)) {
      const resolved = resolveSpecifier(file, specifier, pkg, condition)
      if (resolved === null) continue
      edges.push({ from: file, to: resolved, kind })
      if (!visited.has(resolved)) queue.push(resolved)
    }
  }
  return { visited, edges }
}

export interface ScanReport {
  readonly ok: boolean
  readonly errors: readonly string[]
}

export function checkPortableBoundary(): ScanReport {
  const pkg = readPackageJson()
  const errors: string[] = []
  const jitChunkFile = join(SRC_ROOT, 'jit-chunk.ts')

  // (a) portable graph: no path to jit-chunk.ts, no Function-constructor text.
  const portable = walkGraph(ENTRY, pkg, 'stopcock-portable')
  if (portable.visited.has(jitChunkFile)) {
    errors.push('portable graph reaches jit-chunk.ts (expected zero import path, static or dynamic)')
  }
  for (const file of portable.visited) {
    const source = readFileSync(file, 'utf8')
    if (NEW_FUNCTION_RE.test(source) || FUNCTION_CALL_RE.test(source)) {
      errors.push(`portable graph module contains a Function constructor reference: ${file}`)
    }
  }

  // (b) default graph: jit-chunk.ts is reached, and only via dynamic import.
  const defaultGraph = walkGraph(ENTRY, pkg, 'default')
  if (!defaultGraph.visited.has(jitChunkFile)) {
    errors.push('default graph never reaches jit-chunk.ts (expected exactly one dynamic import path)')
  }
  const edgesIntoChunk = defaultGraph.edges.filter((e) => e.to === jitChunkFile)
  if (edgesIntoChunk.length === 0) {
    errors.push('default graph has no edge into jit-chunk.ts')
  }
  for (const edge of edgesIntoChunk) {
    if (edge.kind !== 'dynamic') {
      errors.push(`default graph reaches jit-chunk.ts via a static import from ${edge.from} (must be dynamic)`)
    }
  }

  return { ok: errors.length === 0, errors }
}

const isMain = process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const report = checkPortableBoundary()
  if (!report.ok) {
    for (const err of report.errors) console.error(`check:portable: ${err}`)
    process.exit(1)
  }
  console.log('check:portable: ok')
}
