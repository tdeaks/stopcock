import { describe, expect, test } from 'vite-plus/test'
import {
  DEBUG_FACADE_CEILING_BYTES,
  DEBUG_MARKER,
  ENGINE_MARKER,
  evaluateFacades,
  measureFacades,
  type FacadeRow,
} from './s6-facade-gate'

const rowOf = (id: string, gzipBytes: number, code: string): FacadeRow => ({ id, gzipBytes, code })

const clean = (): FacadeRow[] => [
  rowOf('direct.map', 460, 'plain map'),
  rowOf('fusion.pipeline', 2_900, 'compact, no engine'),
  rowOf('optimized.pipeline', 11_000, `uses ${ENGINE_MARKER}`),
  rowOf('fusion.pipeline.debug', 11_300, `uses ${ENGINE_MARKER} and ${DEBUG_MARKER}`),
  rowOf('compact.pipeline.debug', 3_900, `compact plus ${DEBUG_MARKER}`),
]

describe('S6 facade policy', () => {
  test('accepts a clean set of rows', () => {
    expect(evaluateFacades(clean())).toEqual([])
  })

  test('rejects a direct consumer that retains the engine', () => {
    const rows = clean()
    rows[0] = rowOf('direct.map', 460, `sneaky ${ENGINE_MARKER}`)
    expect(evaluateFacades(rows)).toContain('a direct-only consumer retains the fusion engine')
  })

  test('rejects debug leaking into a pipeline that did not import it', () => {
    const rows = clean()
    rows[1] = rowOf('fusion.pipeline', 11_000, `${ENGINE_MARKER} ${DEBUG_MARKER}`)
    expect(evaluateFacades(rows)).toContain('the debug facade is present without being imported')
  })

  test('rejects a debug increment over the ceiling', () => {
    const rows = clean()
    rows[3] = rowOf(
      'fusion.pipeline.debug',
      11_000 + DEBUG_FACADE_CEILING_BYTES + 1,
      `${ENGINE_MARKER} ${DEBUG_MARKER}`,
    )
    expect(evaluateFacades(rows).some((failure) => failure.includes('over its'))).toBe(true)
  })

  test('rejects a debug fixture that never reaches the debug surface', () => {
    const rows = clean()
    rows[3] = rowOf('fusion.pipeline.debug', 11_100, ENGINE_MARKER)
    expect(evaluateFacades(rows)).toContain(
      'the debug fixture does not actually reach the debug surface',
    )
  })

  test('rejects explain dragging the engine into a compact consumer', () => {
    // The regression S10 exists to prevent. No byte ceiling on the optimized
    // base would catch it, because that base already contains the engine.
    const rows = clean()
    rows[4] = rowOf('compact.pipeline.debug', 3_900, `${ENGINE_MARKER} ${DEBUG_MARKER}`)
    expect(evaluateFacades(rows)).toContain(
      'explaining a compact pipeline pulls in the optimized engine',
    )
  })

  test('rejects a compact debug increment over the ceiling', () => {
    const rows = clean()
    rows[4] = rowOf(
      'compact.pipeline.debug',
      2_900 + DEBUG_FACADE_CEILING_BYTES + 1,
      DEBUG_MARKER,
    )
    expect(
      evaluateFacades(rows).some((failure) => failure.includes('over a compact base')),
    ).toBe(true)
  })
})

describe('measured facades', () => {
  test('direct entries stay clean and debug stays optional', async () => {
    const rows = await measureFacades()
    expect(evaluateFacades(rows)).toEqual([])
    expect(rows.find((row) => row.id === 'direct.map')?.code).not.toContain(ENGINE_MARKER)
  }, 180_000)
})
