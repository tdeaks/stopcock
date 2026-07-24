import { resolve } from 'node:path'
import { build } from 'esbuild'
import type { ConsumerBundleAdapter, ConsumerEmittedChunk } from '../types'
import {
  assertExecutableChunks,
  entryName,
  normalizeModuleId,
  normalizeOutputFile,
  normalizeSlashes,
} from './common'

export const bundleWithEsbuild: ConsumerBundleAdapter = async (request) => {
  const entryPoints = Object.fromEntries(
    request.entries.map((entry) => [entryName(entry.fixtureId), entry.path]),
  )
  const fixtureByEntryPath = new Map(
    request.entries.map((entry) => [resolve(entry.path), entry.fixtureId]),
  )
  const result = await build({
    absWorkingDir: request.consumerRoot,
    entryPoints,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    treeShaking: true,
    splitting: request.entries.length > 1,
    outdir: request.outputDirectory,
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    write: false,
    metafile: true,
    sourcemap: false,
    logLevel: 'silent',
  })
  if (result.metafile === undefined) throw new Error('esbuild emitted no metafile')
  const metadataByFile = new Map(
    Object.entries(result.metafile.outputs).map(([path, metadata]) => [
      normalizeOutputFile(request.outputDirectory, resolve(request.consumerRoot, path)),
      metadata,
    ]),
  )
  const emittedFiles = new Set(
    result.outputFiles
      .filter(({ path }) => path.endsWith('.js'))
      .map(({ path }) => normalizeOutputFile(request.outputDirectory, path)),
  )
  const chunks: ConsumerEmittedChunk[] = result.outputFiles
    .filter(({ path }) => path.endsWith('.js'))
    .map((output) => {
      const file = normalizeOutputFile(request.outputDirectory, output.path)
      const metadata = metadataByFile.get(file)
      if (metadata === undefined) throw new Error(`esbuild metadata missing for ${file}`)
      const imports = metadata.imports
        .filter(({ kind }) => kind === 'import-statement' || kind === 'dynamic-import')
        .map(({ path }) => {
          const fromWorkingDirectory = normalizeOutputFile(
            request.outputDirectory,
            resolve(request.consumerRoot, path),
          )
          if (emittedFiles.has(fromWorkingDirectory)) return fromWorkingDirectory
          const fromCurrentChunk = normalizeOutputFile(
            request.outputDirectory,
            resolve(output.path, '..', path),
          )
          if (emittedFiles.has(fromCurrentChunk)) return fromCurrentChunk
          const normalized = normalizeSlashes(path).replace(/^\.\//u, '')
          const suffix = [...emittedFiles].filter(
            (candidate) =>
              candidate === normalized ||
              candidate.endsWith(`/${normalized}`) ||
              normalized.endsWith(`/${candidate}`),
          )
          if (suffix.length === 1) return suffix[0] as string
          return normalized
        })
      const entryPoint =
        metadata.entryPoint === undefined
          ? null
          : resolve(request.consumerRoot, metadata.entryPoint)
      return {
        file,
        code: output.text,
        imports: Object.freeze([...new Set(imports)].sort()),
        modules: Object.freeze(
          Object.fromEntries(
            Object.entries(metadata.inputs).map(([id, input]) => [
              normalizeModuleId(id, request.consumerRoot),
              input.bytesInOutput,
            ]),
          ),
        ),
        isEntry: entryPoint !== null,
        entryId: entryPoint === null ? null : (fixtureByEntryPath.get(entryPoint) ?? null),
      }
    })
  assertExecutableChunks(chunks)
  return { chunks: Object.freeze(chunks) }
}
