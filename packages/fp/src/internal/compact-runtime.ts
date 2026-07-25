/**
 * Compact fusion.
 *
 * A real fused runtime that is honestly size-first. It fuses through one
 * generic exact executor instead of a bank of specialized templates, and that
 * trade is the entire point: the template bank is what makes optimized fusion
 * fast and what makes it eleven kilobytes.
 *
 * The executor it runs is the same generic exact implementation the other tiers
 * are checked against. That is deliberate rather than a shortcut — a separately
 * written compact executor would be a second place for early-exit and sink
 * semantics to drift, and compact's job is to be small and exactly right, not
 * to be fast. Optimized fusion remains where speed lives.
 *
 * Compact carries no operation-name registry, no descriptions, and no
 * statistics. Diagnostics live in `@stopcock/fp/fusion/debug`, which production
 * compact never imports and which cannot influence what compact selects or
 * executes.
 *
 * Deliberately a file rather than `compact/index.ts`: the declaration
 * post-processor appends `.js` to a directory specifier, producing
 * `./internal/compact.js` for a file that lives at
 * `./internal/compact/index.js` and breaking the packed type surface.
 */
import { interpret } from '../interpret'
import type { BoundPlan } from '../plan'
import { buildCompactPlan } from './compact/plan'

/**
 * Bounded plan cache keyed on exact step identity. Four entries, matching the
 * optimized engine's bound, so a churny call site cannot grow it.
 */
const CACHE_SIZE = 4
interface CacheEntry {
  readonly steps: readonly unknown[]
  readonly plan: BoundPlan
}
const cache: Array<CacheEntry | undefined> = [undefined, undefined, undefined, undefined]
let clock = 0

const sameSteps = (left: readonly unknown[], right: readonly unknown[]): boolean => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false
  }
  return true
}

const planFor = (steps: readonly unknown[]): BoundPlan => {
  for (const entry of cache) {
    if (entry !== undefined && sameSteps(entry.steps, steps)) return entry.plan
  }
  const plan = buildCompactPlan(steps)
  cache[clock++ % CACHE_SIZE] = { steps: steps.slice(), plan }
  return plan
}

export function compactPipe(value?: unknown, ...steps: readonly unknown[]): unknown {
  if (steps.length === 0) return value
  return interpret(planFor(steps), value)
}

export function compactFlow(...steps: readonly unknown[]): (value: unknown) => unknown {
  if (steps.length === 1) return steps[0] as (value: unknown) => unknown
  const plan = buildCompactPlan(steps)
  return (value: unknown) => interpret(plan, value)
}

export function compactCompile(...steps: readonly unknown[]): (value: unknown) => unknown {
  if (steps.length === 0) return (value: unknown) => value
  const plan = buildCompactPlan(steps)
  return (value: unknown) => interpret(plan, value)
}

/** Exposed for the cold/warm cache tests; not part of any public entry. */
export const resetCompactCache = (): void => {
  cache.fill(undefined)
  clock = 0
}
