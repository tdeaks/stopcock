import { basename } from 'node:path'
import MagicString from 'magic-string'

const INCOMING_MAP_MARKER = 'x_stopcock_fp_incoming_source_map_v1'

const sourceMapObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Preserve source-map composition around Unplugin 3.3's transform loader.
 * `seed` supplies its missing upstream map; `finalize` restores the physical
 * identity which MagicString intentionally keeps relative in direct compiler
 * receipts.
 */
export default function sourceMapSeedLoader(source, sourceMap) {
  const callback = this.async()
  const phase = this.getOptions().phase
  if (phase === 'finalize') {
    if (sourceMap === null || sourceMap === undefined) {
      callback(null, source, sourceMap)
      return
    }
    if (!sourceMapObject(sourceMap)) {
      callback(new Error('fp-compiler: source-map finalizer received a non-object map'))
      return
    }
    if (Object.hasOwn(sourceMap, INCOMING_MAP_MARKER)) {
      if (sourceMap[INCOMING_MAP_MARKER] !== true) {
        callback(new Error('fp-compiler: source-map input marker has an invalid value'))
        return
      }
      const restored = { ...sourceMap }
      delete restored[INCOMING_MAP_MARKER]
      callback(null, source, restored)
      return
    }
    if (Array.isArray(sourceMap.sources) && sourceMap.sources.length === 1) {
      const ambiguousSources = new Set([
        basename(this.resourcePath),
        basename(this.resource),
      ])
      const sourceRoot = sourceMap.sourceRoot
      if (
        ambiguousSources.has(sourceMap.sources[0]) &&
        ambiguousSources.has(sourceMap.file) &&
        (sourceRoot === undefined || sourceRoot === '')
      ) {
        callback(null, source, {
          ...sourceMap,
          sources: [this.resourcePath],
        })
        return
      }
    }
    callback(null, source, sourceMap)
    return
  }
  if (phase !== 'seed') {
    callback(new Error(`fp-compiler: unknown source-map loader phase ${String(phase)}`))
    return
  }
  const incoming =
    sourceMap ??
    new MagicString(source).generateMap({
      source: this.resourcePath,
      includeContent: true,
      hires: true,
    })
  if (!sourceMapObject(incoming)) {
    callback(new Error('fp-compiler: source-map seeder received a non-object map'))
    return
  }
  if (Object.hasOwn(incoming, INCOMING_MAP_MARKER)) {
    callback(new Error('fp-compiler: source-map input already contains the private marker'))
    return
  }
  callback(null, source, {
    ...incoming,
    [INCOMING_MAP_MARKER]: true,
  })
}
