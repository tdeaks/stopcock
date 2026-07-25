import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import expected from './fixtures/engine-explain-v1.json'
import { explain as staticExplain, explainPure as staticExplainPure } from '../internal/explain'

/**
 * S10. `explain` moved off the optimized engine so the debug facade stops
 * carrying it into a compact consumer.
 *
 * The fixture was captured from the engine implementation immediately before
 * it was deleted. Comparing against the live engine would have been the
 * stronger check, but it only holds while both exist; freezing its output
 * keeps the guard after the engine copy is gone.
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
