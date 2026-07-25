import { rolldown } from 'rolldown'
import type { ConsumerBundleAdapter, ConsumerEmittedChunk } from '../types'
import {
  assertExecutableChunks,
  entryByName,
  entryName,
  normalizeModuleId,
  resolveStopcockSpecifier,
} from './common'

export const bundleWithRolldown: ConsumerBundleAdapter = async (request) => {
  const entries = entryByName(request.entries)
  const bundle = await rolldown({
    cwd: request.consumerRoot,
    input: Object.fromEntries(
      request.entries.map((entry) => [entryName(entry.fixtureId), entry.path]),
    ),
    platform: 'browser',
    plugins: [
      {
        name: 'stopcock-packed-consumer-resolver',
        resolveId: (source) => resolveStopcockSpecifier(source, request.consumerRoot),
      },
    ],
    treeshake: {
      moduleSideEffects: false,
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
