import { describe, expect, it } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import expected from './fixtures/engine-explain-v1.json'
import { explain as staticExplain, explainPure as staticExplainPure } from '../explain'

/**
 * The fixture was captured from the engine implementation in `@stopcock/fp`
 * immediately before S10 deleted it, and it still has to hold here after S10X
 * moved the whole optimizer into this package.
 *
 * That makes it the strongest single check on the extraction: if reporting the
 * same explanations for the same pipelines still works, the bank, the plan
 * segmentation, and the fused-shape coverage all survived the move across a
 * package boundary intact.
 *
 * FP's own `explain` now answers `generic` everywhere, which is true for an
 * FP-only install. These template answers are this package's truth, so this
 * test lives here.
 */
const PIPELINES: readonly (readonly [string, readonly unknown[]])[] = [
  ['map', [A.map((x: number) => x * 2)]],
  ['map -> filter', [A.map((x: number) => x * 2), A.filter((x: number) => x > 2)]],
  [
    'map -> filter -> reduce',
    [
      A.map((x: number) => x * 2),
      A.filter((x: number) => x > 2),
      A.reduce(0, (a: number, b: number) => a + b),
    ],
  ],
  ['map -> filter -> find', [A.map((x: number) => x * 2), A.filter((x: number) => x > 2), A.find((x: number) => x > 4)]],
  ['filter -> map -> take', [A.filter((x: number) => x > 1), A.map((x: number) => x * 2), A.take(2)]],
  ['map -> sum', [A.map((x: number) => x * 2), A.sum]],
  ['sort -> take', [A.sort, A.take(3)]],
  ['map -> length', [A.map((x: number) => x * 2), A.length]],
  ['uniq -> count', [A.uniq, A.count((x: number) => x > 1)]],
  ['reverse -> map', [A.reverse, A.map((x: number) => x * 2)]],
  ['opaque step', [(x: readonly number[]) => x, A.map((x: number) => x * 2)]],
  [
    'map -> flatMap -> filter -> filterMap',
    [
      A.map((x: number) => x),
      A.flatMap((x: number) => [x]),
      A.filter((x: number) => x > 0),
      A.filterMap((x: number) => x),
    ],
  ],
]

const frozen = expected as Record<string, unknown>

describe('static explain reproduces what the engine reported', () => {
  it('covers every frozen pipeline', () => {
    expect(Object.keys(frozen).length).toBe(PIPELINES.length * 2)
  })

  it.each(PIPELINES)('%s', (label, steps) => {
    expect(staticExplain(...steps)).toEqual(frozen[label])
  })

  it.each(PIPELINES)('pure: %s', (label, steps) => {
    expect(staticExplainPure(...steps)).toEqual(frozen[`pure: ${label}`])
  })

  it('reports a fused shape as template-executed and an opaque one as generic', () => {
    // Guards the comparison above: if both sides degraded to 'generic'
    // everywhere the agreement would be vacuous.
    const fused = staticExplain(A.map((x: number) => x * 2), A.filter((x: number) => x > 2))
    expect(fused.segmentExecutors).toContain('template')
    const opaque = staticExplain((x: readonly number[]) => x)
    expect(opaque.segmentExecutors).toEqual(['generic'])
  })
})
