import type { PortableRunner } from './lower'

export type SemanticMode = 'exact' | 'pure'

/**
 * Shared portable runner for one pipeline shape and semantic mode.
 *
 * Pipe and compile cache this cell instead of closing over bound callbacks.
 * Bindings stay call-local, so callback churn can reuse the lowered shape
 * without retaining user functions.
 */
export interface ShapeEntry {
  run: PortableRunner
  execCount: number
  /**
   * The shape this entry was built for. Set once at construction so selection
   * tracing can join `executed` back to `selected` without threading a key
   * through every dispatch site — including the front-cache hit, where the
   * caller no longer has the plan.
   */
  readonly shapeKey: string
}

let evictionCount = 0

export function evictionStats(): { readonly evictions: number } {
  return { evictions: evictionCount }
}

export function resetEvictionStats(): void {
  evictionCount = 0
}

export function executionIdentityKey(
  shapeKey: string,
  mode: SemanticMode,
  rewriteSignature: string,
): string {
  return `${shapeKey}|${mode}|${rewriteSignature}`
}

const ENTRY_LIMIT = 256
const entries = new Map<string, ShapeEntry>()

function evictOldest(): void {
  const oldestKey = entries.keys().next().value
  if (oldestKey === undefined) return
  entries.delete(oldestKey)
  evictionCount++
}

export function getOrCreateEntry(
  shapeKey: string,
  mode: SemanticMode,
  rewriteSignature: string,
  createPortableRun: () => PortableRunner,
): { readonly entry: ShapeEntry; readonly hit: boolean } {
  const key = executionIdentityKey(shapeKey, mode, rewriteSignature)
  const cached = entries.get(key)
  if (cached) {
    entries.delete(key)
    entries.set(key, cached)
    return { entry: cached, hit: true }
  }

  const entry: ShapeEntry = {
    run: createPortableRun(),
    execCount: 0,
    shapeKey,
  }
  entries.set(key, entry)
  if (entries.size > ENTRY_LIMIT) evictOldest()
  return { entry, hit: false }
}

export function entryCount(): number {
  return entries.size
}

/** Test-only cache inspection. */
export function __lookupEntry(
  shapeKey: string,
  mode: SemanticMode,
  rewriteSignature: string,
): ShapeEntry | undefined {
  return entries.get(executionIdentityKey(shapeKey, mode, rewriteSignature))
}

/** Test-only cache reset. Existing compiled runners remain usable. */
export function __clearEntries(): void {
  evictionCount += entries.size
  entries.clear()
}
