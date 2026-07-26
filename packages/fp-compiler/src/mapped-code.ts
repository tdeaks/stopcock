import MagicString, { Bundle } from 'magic-string'

export interface SourceSpan {
  readonly start: number
  readonly end: number
}

/**
 * A byte range in generated code that is an exact copy of a source range.
 * Generated scaffolding is deliberately absent: the file renderer anchors it
 * to the call site, while these ranges retain token-level source locations.
 */
export interface GeneratedSourceFragment {
  readonly generatedStart: number
  readonly generatedEnd: number
  readonly source: SourceSpan
}

export interface MappedCode {
  readonly code: string
  readonly sourceFragments: readonly GeneratedSourceFragment[]
}

export interface FilePatch extends MappedCode {
  readonly start: number
  readonly end: number
  /** Original position used for generated, non-source-backed scaffolding. */
  readonly anchor: number
}

const emptyMappedCode = (code: string): MappedCode => ({
  code,
  sourceFragments: [],
})

export const generatedCode = (code: string): MappedCode => emptyMappedCode(code)

export const sourceCode = (source: string, start: number, end: number): MappedCode => ({
  code: source.slice(start, end),
  sourceFragments:
    start === end
      ? []
      : [
          {
            generatedStart: 0,
            generatedEnd: end - start,
            source: { start, end },
          },
        ],
})

export const concatMappedCode = (
  parts: readonly (MappedCode | string)[],
): MappedCode => {
  let code = ''
  const sourceFragments: GeneratedSourceFragment[] = []
  for (const part of parts) {
    const mapped = typeof part === 'string' ? emptyMappedCode(part) : part
    const offset = code.length
    code += mapped.code
    for (const fragment of mapped.sourceFragments) {
      sourceFragments.push({
        generatedStart: fragment.generatedStart + offset,
        generatedEnd: fragment.generatedEnd + offset,
        source: fragment.source,
      })
    }
  }
  return { code, sourceFragments }
}

export const sliceMappedCode = (
  mapped: MappedCode,
  start: number,
  end = mapped.code.length,
): MappedCode => {
  const sourceFragments = mapped.sourceFragments.flatMap((fragment) => {
    const overlapStart = Math.max(start, fragment.generatedStart)
    const overlapEnd = Math.min(end, fragment.generatedEnd)
    if (overlapStart >= overlapEnd) return []
    const sourceOffset = overlapStart - fragment.generatedStart
    return [
      {
        generatedStart: overlapStart - start,
        generatedEnd: overlapEnd - start,
        source: {
          start: fragment.source.start + sourceOffset,
          end: fragment.source.start + sourceOffset + (overlapEnd - overlapStart),
        },
      },
    ]
  })
  return {
    code: mapped.code.slice(start, end),
    sourceFragments,
  }
}

/**
 * Tracks exact source slices while string-oriented emitters assemble code.
 * Markers exist only during emission and are removed before generated code is
 * parsed, measured, or returned.
 */
export class SourceFragmentTracker {
  readonly #source: string
  readonly #spans = new Map<number, SourceSpan>()
  #nextId = 0

  constructor(source: string) {
    this.#source = source
  }

  source(start: number, end: number): string {
    const id = this.#nextId++
    this.#spans.set(id, { start, end })
    return `\u0001S${id}\u0002${this.#source.slice(start, end)}\u0001E${id}\u0002`
  }

  node(node: { readonly start?: number | null; readonly end?: number | null }): string {
    if (node.start == null || node.end == null) {
      throw new Error('fp-compiler: source-backed node has no source span')
    }
    return this.source(node.start, node.end)
  }

  finish(tagged: string): MappedCode {
    const marker = /\u0001([SE])(\d+)\u0002/gu
    const open = new Map<number, number>()
    const sourceFragments: GeneratedSourceFragment[] = []
    let code = ''
    let cursor = 0
    for (const match of tagged.matchAll(marker)) {
      const markerStart = match.index
      code += tagged.slice(cursor, markerStart)
      const id = Number(match[2])
      if (match[1] === 'S') {
        if (open.has(id)) throw new Error('fp-compiler: nested duplicate source marker')
        open.set(id, code.length)
      } else {
        const generatedStart = open.get(id)
        const span = this.#spans.get(id)
        if (generatedStart === undefined || span === undefined) {
          throw new Error('fp-compiler: unmatched source marker')
        }
        const generatedEnd = code.length
        if (generatedEnd - generatedStart !== span.end - span.start) {
          throw new Error('fp-compiler: source fragment changed while emitting')
        }
        sourceFragments.push({ generatedStart, generatedEnd, source: span })
        open.delete(id)
      }
      cursor = markerStart + match[0].length
    }
    code += tagged.slice(cursor)
    if (open.size > 0) throw new Error('fp-compiler: unclosed source marker')
    return {
      code,
      sourceFragments: sourceFragments.sort(
        (left, right) => left.generatedStart - right.generatedStart,
      ),
    }
  }
}

const anchoredGenerated = (
  source: string,
  id: string,
  text: string,
  anchor: number,
): MagicString => {
  if (text.length === 0) return new MagicString('', { filename: id })
  if (source.length === 0) return new MagicString(text, { filename: id })
  const safeAnchor = Math.max(0, Math.min(anchor, source.length - 1))
  const generated = new MagicString(source, { filename: id })
  generated.overwrite(safeAnchor, safeAnchor + 1, text)
  return generated.snip(safeAnchor, safeAnchor + 1)
}

const appendSource = (
  bundle: Bundle,
  source: string,
  id: string,
  start: number,
  end: number,
): void => {
  if (start >= end) return
  const original = new MagicString(source, { filename: id })
  bundle.addSource({
    filename: id,
    content: original.snip(start, end),
    separator: '',
  })
}

const appendPatch = (
  bundle: Bundle,
  source: string,
  id: string,
  patch: FilePatch,
): void => {
  let cursor = 0
  for (const fragment of [...patch.sourceFragments].sort(
    (left, right) => left.generatedStart - right.generatedStart,
  )) {
    if (
      fragment.generatedStart < cursor ||
      fragment.generatedEnd > patch.code.length ||
      fragment.source.start < 0 ||
      fragment.source.end > source.length
    ) {
      throw new Error('fp-compiler: invalid mapped replacement fragment')
    }
    const generatedPrefix = patch.code.slice(cursor, fragment.generatedStart)
    if (generatedPrefix.length > 0) {
      bundle.addSource({
        filename: id,
        content: anchoredGenerated(source, id, generatedPrefix, patch.anchor),
        separator: '',
      })
    }
    const copied = patch.code.slice(fragment.generatedStart, fragment.generatedEnd)
    const original = source.slice(fragment.source.start, fragment.source.end)
    if (copied !== original) {
      throw new Error('fp-compiler: mapped replacement no longer matches source')
    }
    appendSource(bundle, source, id, fragment.source.start, fragment.source.end)
    cursor = fragment.generatedEnd
  }
  const generatedSuffix = patch.code.slice(cursor)
  if (generatedSuffix.length > 0) {
    bundle.addSource({
      filename: id,
      content: anchoredGenerated(source, id, generatedSuffix, patch.anchor),
      separator: '',
    })
  }
}

export function renderFilePatches(
  source: string,
  id: string,
  patches: readonly FilePatch[],
): {
  readonly code: string
  readonly map: ReturnType<Bundle['generateMap']>
} {
  const ordered = patches
    .map((patch, order) => ({ patch, order }))
    .sort(
      (left, right) =>
        left.patch.start - right.patch.start ||
        left.patch.end - right.patch.end ||
        left.order - right.order,
    )
  const bundle = new Bundle({ separator: '' })
  let cursor = 0
  for (const { patch } of ordered) {
    if (patch.start < cursor || patch.end < patch.start || patch.end > source.length) {
      throw new Error(
        `fp-compiler: overlapping or invalid file patches ${patch.start}:${patch.end} after ${cursor}`,
      )
    }
    appendSource(bundle, source, id, cursor, patch.start)
    appendPatch(bundle, source, id, patch)
    cursor = patch.end
  }
  appendSource(bundle, source, id, cursor, source.length)
  return {
    code: bundle.toString(),
    map: bundle.generateMap({
      file: id,
      includeContent: true,
      hires: true,
    }),
  }
}
