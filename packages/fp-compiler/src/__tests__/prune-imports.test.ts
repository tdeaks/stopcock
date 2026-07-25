import { describe, expect, it } from 'vite-plus/test'
import {
  planImportPrune,
  survivesTransform,
  widenOverSeparator,
  type PruneInput,
} from '../prune-imports'

const declaration = (
  local: string,
  overrides: Partial<PruneInput['imports'][number]> = {},
): PruneInput['imports'][number] => ({
  source: '@stopcock/fp/array',
  declarationStart: 0,
  declarationEnd: 50,
  specifiers: [{ local, start: 9, end: 9 + local.length }],
  sideEffectOnly: false,
  ...overrides,
})

describe('reference survival', () => {
  it('drops a reference inside a replaced range', () => {
    expect(survivesTransform(15, [{ start: 10, end: 20 }])).toBe(false)
  })

  it('keeps a reference outside every replaced range', () => {
    expect(survivesTransform(25, [{ start: 10, end: 20 }])).toBe(true)
  })

  it('treats the end of a range as outside it', () => {
    expect(survivesTransform(20, [{ start: 10, end: 20 }])).toBe(true)
  })
})

describe('import pruning', () => {
  it('removes a specifier whose only reference was fused away', () => {
    const edits = planImportPrune({
      imports: [declaration('map')],
      references: [{ name: 'map', position: 60 }],
      replaced: [{ start: 55, end: 80 }],
    })
    expect(edits).toEqual([{ kind: 'declaration', start: 0, end: 50 }])
  })

  it('keeps a specifier a fallback site still references', () => {
    // The mixed-site rule: a file with one fused and one skipped pipeline keeps
    // exactly what the skipped one needs.
    expect(
      planImportPrune({
        imports: [declaration('map')],
        references: [
          { name: 'map', position: 60 },
          { name: 'map', position: 200 },
        ],
        replaced: [{ start: 55, end: 80 }],
      }),
    ).toEqual([])
  })

  it('removes only the dead specifier when a sibling survives', () => {
    const edits = planImportPrune({
      imports: [
        declaration('map', {
          specifiers: [
            { local: 'map', start: 9, end: 12 },
            { local: 'filter', start: 14, end: 20 },
          ],
        }),
      ],
      references: [
        { name: 'map', position: 60 },
        { name: 'filter', position: 200 },
      ],
      replaced: [{ start: 55, end: 80 }],
    })
    expect(edits).toEqual([{ kind: 'specifier', start: 9, end: 12 }])
  })

  it('never touches a side-effect-only import', () => {
    expect(
      planImportPrune({
        imports: [declaration('x', { specifiers: [], sideEffectOnly: true })],
        references: [],
        replaced: [],
      }),
    ).toEqual([])
  })

  it('never touches a declaration with no prunable specifiers', () => {
    // A type-only import arrives here with an empty specifier list, and an
    // empty list must not be read as "everything is dead".
    expect(
      planImportPrune({
        imports: [declaration('x', { specifiers: [], sideEffectOnly: false })],
        references: [],
        replaced: [],
      }),
    ).toEqual([])
  })

  it('keeps an aliased local that is still referenced under its alias', () => {
    expect(
      planImportPrune({
        imports: [declaration('m', { specifiers: [{ local: 'm', start: 9, end: 10 }] })],
        references: [{ name: 'm', position: 300 }],
        replaced: [{ start: 55, end: 80 }],
      }),
    ).toEqual([])
  })

  it('keeps a namespace binding that survives anywhere', () => {
    expect(
      planImportPrune({
        imports: [declaration('A', { specifiers: [{ local: 'A', start: 7, end: 8 }] })],
        references: [{ name: 'A', position: 300 }],
        replaced: [],
      }),
    ).toEqual([])
  })

  it('returns edits in source order', () => {
    const edits = planImportPrune({
      imports: [
        declaration('map', {
          declarationStart: 100,
          declarationEnd: 140,
          specifiers: [{ local: 'map', start: 110, end: 113 }],
        }),
        declaration('pipe', {
          declarationStart: 0,
          declarationEnd: 40,
          specifiers: [{ local: 'pipe', start: 9, end: 13 }],
        }),
      ],
      references: [],
      replaced: [],
    })
    expect(edits.map((edit) => edit.start)).toEqual([0, 100])
  })
})

describe('separator widening', () => {
  it('takes the following comma when a specifier follows', () => {
    const code = `import { filter, map } from 'x'`
    const start = code.indexOf('filter')
    expect(widenOverSeparator(code, start, start + 6)).toEqual({
      start,
      end: code.indexOf('map'),
    })
  })

  it('takes the preceding comma when the specifier is last', () => {
    const code = `import { map, filter } from 'x'`
    const start = code.indexOf('filter')
    expect(widenOverSeparator(code, start, start + 6)).toEqual({
      start: code.indexOf(',', code.indexOf('map')),
      end: start + 6,
    })
  })

  it('leaves a lone specifier alone', () => {
    const code = `import { map } from 'x'`
    const start = code.indexOf('map')
    expect(widenOverSeparator(code, start, start + 3)).toEqual({ start, end: start + 3 })
  })
})
