import MagicString from 'magic-string'

/**
 * Supply a high-resolution identity map only when an earlier loader did not.
 * The following compiler transform replaces this with its composed map.
 */
export default function sourceMapSeedLoader(source, sourceMap) {
  const callback = this.async()
  if (sourceMap !== null && sourceMap !== undefined) {
    callback(null, source, sourceMap)
    return
  }
  const identity = new MagicString(source, { filename: this.resourcePath }).generateMap({
    file: this.resourcePath,
    source: this.resourcePath,
    includeContent: true,
    hires: true,
  })
  callback(null, source, identity)
}
