import { rollup } from 'rollup'
import type { ConsumerBundleAdapter, ConsumerEmittedChunk } from '../types'
import {
  assertExecutableChunks,
  entryByName,
  entryName,
  normalizeModuleId,
  resolveStopcockSpecifier,
} from './common'

export const bundleWithRollup: ConsumerBundleAdapter = async (request) => {
  const entries = entryByName(request.entries)
  const bundle = await rollup({
    input: Object.fromEntries(
      request.entries.map((entry) => [entryName(entry.fixtureId), entry.path]),
    ),
    plugins: [
      {
        name: 'stopcock-packed-consumer-resolver',
        resolveId: (source) => resolveStopcockSpecifier(source, request.consumerRoot),
      },
    ],
    treeshake: {
      moduleSideEffects: false,
      propertyReadSideEffects: false,
      tryCatchDeoptimization: false,
    },
    onwarn(warning, warn) {
      if (warning.code === 'EMPTY_BUNDLE') throw new Error(warning.message)
      warn(warning)
    },
  })
  try {
    const generated = await bundle.generate({
      format: 'es',
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name].js',
      sourcemap: false,
    })
    const chunks: ConsumerEmittedChunk[] = generated.output
      .filter((output) => output.type === 'chunk')
      .map((chunk) => ({
        file: chunk.fileName,
        code: chunk.code,
        imports: Object.freeze([...chunk.imports, ...chunk.dynamicImports].sort()),
        modules: Object.freeze(
          Object.fromEntries(
            Object.entries(chunk.modules).map(([id, module]) => [
              normalizeModuleId(id, request.consumerRoot),
              module.renderedLength,
            ]),
          ),
        ),
        isEntry: chunk.isEntry,
        entryId: chunk.isEntry ? (entries.get(chunk.name)?.fixtureId ?? null) : null,
      }))
    assertExecutableChunks(chunks)
    return { chunks: Object.freeze(chunks) }
  } finally {
    await bundle.close()
  }
}
