import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLIC_MODULES } from '../module-manifest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const visited = new Set<string>()
const errors: string[] = []

const resolveImport = (from: string, specifier: string): string | undefined => {
  if (!specifier.startsWith('.')) return undefined
  const base = resolve(dirname(from), specifier)
  const candidates = extname(base) === '' ? [`${base}.ts`, resolve(base, 'index.ts')] : [base]
  return candidates.find(existsSync)
}

const visit = (file: string): void => {
  if (visited.has(file)) return
  visited.add(file)
  const source = readFileSync(file, 'utf8')
  const relative = file.slice(root.length + 1)

  if (/\bnew\s+Function\b|\beval\s*\(|\bimport\s*\(/u.test(source)) {
    errors.push(`${relative}: public runtime graph contains dynamic code loading or evaluation`)
  }
  if (/\bcompileJit\b|jit-(?:chunk|loader)|\.\/stream(?:['"])/u.test(source)) {
    errors.push(`${relative}: public runtime graph references removed JIT or Stream code`)
  }

  const imports = source.matchAll(
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gu,
  )
  for (const match of imports) {
    const dependency = resolveImport(file, match[1])
    if (dependency) visit(dependency)
  }
}

for (const module of PUBLIC_MODULES) visit(resolve(root, module.entry))

if (errors.length > 0) {
  throw new Error(`Portable boundary violations:\n${errors.join('\n')}`)
}

console.log(`Portable boundary verified across ${visited.size} source modules`)
