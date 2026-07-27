import { afterEach, describe, expect, it, vi } from 'vitest'
import { stopcockFp } from '../plugin'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('plugin diagnostics', () => {
  it('selects every standard JavaScript and TypeScript module extension by default', () => {
    const plugin = stopcockFp.raw() as any
    const include = plugin.transform.filter.id.include as RegExp

    for (const extension of ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts']) {
      expect(include.test(`fixture.${extension}`), extension).toBe(true)
    }
    for (const extension of ['json', 'css', 'mtsx', 'ctsx']) {
      expect(include.test(`fixture.${extension}`), extension).toBe(false)
    }
  })

  it('reports fully compiled, partial, and skipped site counts separately', async () => {
    const plugin = stopcockFp.raw({ diagnostics: 'summary' }) as any
    const context = { warn: vi.fn() }
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
const fused = pipe([1, 2, 3], A.map((x) => x * 2))
const tail = (xs) => xs
const partial = pipe([1, 2, 3], A.map((x) => x + 1), tail)
const steps = [A.map((x) => x + 1)]
const deferred = pipe([1, 2, 3], ...steps)
`
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    plugin.buildStart.call(context)
    await plugin.transform.handler.call(context, source, 'fixture.ts')
    plugin.buildEnd.call(context)

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'fully compiled 1/3 pipelines (33.3% coverage; 1 partial; 1 skipped)',
      ),
    )
  })
})
