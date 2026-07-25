import { readFile } from 'node:fs/promises'
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path'
import type { ConsumerBundleEntry, ConsumerEmittedChunk } from '../types'

export const entryName = (fixtureId: string): string =>
  fixtureId.replaceAll('.', '-').replaceAll('/', '-')

export const entryByName = (
  entries: readonly ConsumerBundleEntry[],
): ReadonlyMap<string, ConsumerBundleEntry> =>
  new Map(entries.map((entry) => [entryName(entry.fixtureId), entry]))

export const normalizeSlashes = (value: string): string => value.split(sep).join('/')

export const normalizeModuleId = (id: string, consumerRoot: string): string => {
  const clean = normalizeSlashes(id.replaceAll('\0', ''))
  const rootPrefix = `${normalizeSlashes(consumerRoot).replace(/\/+$/u, '')}/`
  if (clean.includes(rootPrefix)) return clean.replaceAll(rootPrefix, '')
  const absolute = isAbsolute(clean) ? clean : resolve(clean)
  const local = relative(consumerRoot, absolute)
  return local.startsWith('..') ? normalizeSlashes(clean) : normalizeSlashes(local)
}

export const normalizeOutputFile = (outputDirectory: string, path: string): string =>
  normalizeSlashes(relative(outputDirectory, path))

const IMPORT_PATTERN =
  /(?:\bfrom\s*|\bimport\s*)["']([^"']+\.m?js)["']|import\s*\(\s*["']([^"']+\.m?js)["']\s*\)/gu

export const staticChunkImports = (file: string, code: string): readonly string[] => {
  const directory = posix.dirname(normalizeSlashes(file))
  return Object.freeze(
    Array.from(code.matchAll(IMPORT_PATTERN), (match) => String(match[1] ?? match[2]))
      .filter((specifier) => specifier.startsWith('.'))
      .map((specifier) => posix.normalize(posix.join(directory, specifier)))
      .filter((value, index, values) => values.indexOf(value) === index)
      .sort(),
  )
}

export const resolveStopcockSpecifier = async (
  source: string,
  consumerRoot: string,
): Promise<string | null> => {
  if (source !== '@stopcock/fp' && !source.startsWith('@stopcock/fp/')) return null
  const packageDirectory = join(consumerRoot, 'node_modules', '@stopcock', 'fp')
  const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8')) as {
    readonly exports?: Readonly<Record<string, string | Readonly<Record<string, string>>>>
  }
  const key = source === '@stopcock/fp' ? '.' : `.${source.slice('@stopcock/fp'.length)}`
  const target = manifest.exports?.[key]
  const importTarget = typeof target === 'string' ? target : (target?.import ?? target?.default)
  if (typeof importTarget !== 'string') {
    throw new Error(`packed @stopcock/fp has no import export for ${source}`)
  }
  return resolve(packageDirectory, importTarget)
}

export const assertExecutableChunks = (chunks: readonly ConsumerEmittedChunk[]): void => {
  if (chunks.length === 0) throw new Error('bundler emitted no JavaScript chunks')
  const files = new Set<string>()
  for (const chunk of chunks) {
    if (!chunk.file.endsWith('.js') || chunk.file.endsWith('.js.map')) {
      throw new Error(`bundler emitted non-executable artifact ${chunk.file}`)
    }
    if (files.has(chunk.file)) throw new Error(`bundler emitted duplicate ${chunk.file}`)
    files.add(chunk.file)
    if (chunk.modules.length === 0) {
      throw new Error(`bundler emitted ${chunk.file} without module attribution`)
    }
  }
  for (const chunk of chunks) {
    for (const imported of chunk.imports) {
      if (!files.has(imported)) {
        throw new Error(`${chunk.file} imports missing emitted chunk ${imported}`)
      }
    }
  }
}
