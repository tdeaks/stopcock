/**
 * Binding-aware dead import pruning.
 *
 * Fusing a pipeline consumes the operator references that fed it, so imports
 * that were live before the transform can be dead after it. Pruning them is
 * only safe once you know what the transform actually removed, which is why
 * this runs on reference analysis of the post-transform program rather than on
 * a guess about what fusion usually consumes.
 *
 * What it will not do:
 * - touch a type-only import or a type-only specifier, which carry no runtime
 *   reference to count;
 * - touch a bare `import 'x'` side-effect import, whose whole purpose is the
 *   side effect;
 * - remove a namespace binding, or any binding, that anything still references,
 *   including a fallback site the compiler declined to transform;
 * - shift or drop a leading comment, since removing a specifier must not take
 *   an unrelated comment with it.
 */
import type * as t from '@babel/types'

export interface ReplacedRange {
  readonly start: number
  readonly end: number
}

export interface PrunableSpecifier {
  readonly local: string
  readonly start: number
  readonly end: number
}

export interface PrunableImport {
  readonly source: string
  readonly declarationStart: number
  readonly declarationEnd: number
  readonly specifiers: readonly PrunableSpecifier[]
  /** True when the declaration is `import 'x'` with no specifiers at all. */
  readonly sideEffectOnly: boolean
}

export interface PruneEdit {
  readonly kind: 'declaration' | 'specifier'
  readonly start: number
  readonly end: number
}

/** A reference inside a replaced range no longer exists in the output. */
export const survivesTransform = (position: number, replaced: readonly ReplacedRange[]): boolean =>
  !replaced.some((range) => position >= range.start && position < range.end)

export interface PruneInput {
  readonly imports: readonly PrunableImport[]
  /** Every referenced identifier in the program, with its position. */
  readonly references: readonly { readonly name: string; readonly position: number }[]
  readonly replaced: readonly ReplacedRange[]
  /**
   * Source text, used only to widen a specifier removal over its separator.
   * Removing `filter` from `{ filter, map }` without the comma leaves
   * `{ , map }`, which does not parse.
   */
  readonly code?: string
}

/**
 * Widens a specifier range to swallow the comma that binds it to its
 * neighbour: the following one when there is a following specifier, otherwise
 * the preceding one.
 */
export const widenOverSeparator = (
  code: string,
  start: number,
  end: number,
): { start: number; end: number } => {
  let after = end
  while (after < code.length && /\s/u.test(code[after])) after++
  if (code[after] === ',') {
    after++
    while (after < code.length && /[^\S\n]/u.test(code[after])) after++
    return { start, end: after }
  }
  let before = start
  while (before > 0 && /\s/u.test(code[before - 1])) before--
  if (code[before - 1] === ',') return { start: before - 1, end }
  return { start, end }
}

/**
 * Returns the edits to apply, longest-lived first so a caller can apply them
 * without tracking offsets: declaration removals subsume their specifiers.
 */
export const planImportPrune = (input: PruneInput): PruneEdit[] => {
  const live = new Set<string>()
  for (const reference of input.references) {
    if (survivesTransform(reference.position, input.replaced)) live.add(reference.name)
  }

  const edits: PruneEdit[] = []
  for (const declaration of input.imports) {
    // Nothing to prune, and nothing that would be safe to prune.
    if (declaration.sideEffectOnly || declaration.specifiers.length === 0) continue

    const dead = declaration.specifiers.filter((specifier) => !live.has(specifier.local))
    if (dead.length === 0) continue

    if (dead.length === declaration.specifiers.length) {
      edits.push({
        kind: 'declaration',
        start: declaration.declarationStart,
        end: declaration.declarationEnd,
      })
      continue
    }
    for (const specifier of dead) {
      const range =
        input.code === undefined
          ? { start: specifier.start, end: specifier.end }
          : widenOverSeparator(input.code, specifier.start, specifier.end)
      edits.push({ kind: 'specifier', start: range.start, end: range.end })
    }
  }
  return edits.sort((left, right) => left.start - right.start)
}

/** Collects the import shape the planner needs from a parsed program. */
export const collectPrunableImports = (
  program: t.Program,
  sources: ReadonlySet<string>,
): PrunableImport[] => {
  const out: PrunableImport[] = []
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    if (!sources.has(statement.source.value)) continue
    // A type-only import has no runtime reference to count, so it is never
    // ours to remove.
    if (statement.importKind === 'type') continue

    const specifiers: PrunableSpecifier[] = []
    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type') continue
      if (specifier.start == null || specifier.end == null) continue
      specifiers.push({
        local: specifier.local.name,
        start: specifier.start,
        end: specifier.end,
      })
    }

    out.push({
      source: statement.source.value,
      declarationStart: statement.start ?? 0,
      declarationEnd: statement.end ?? 0,
      specifiers,
      sideEffectOnly: statement.specifiers.length === 0,
    })
  }
  return out
}
