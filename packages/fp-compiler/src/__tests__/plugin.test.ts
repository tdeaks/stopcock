import { afterEach, describe, expect, it, vi } from 'vitest'
import { stopcockFp } from '../plugin'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('plugin diagnostics', () => {
  it('reports site-level static coverage instead of only transformed files', async () => {
    const plugin = stopcockFp.raw({ diagnostics: 'summary' }) as any
    const context = { warn: vi.fn() }
    const source = `
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
const fused = pipe([1, 2, 3], A.map((x) => x * 2))
const steps = [A.map((x) => x + 1)]
const deferred = pipe([1, 2, 3], ...steps)
`
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    plugin.buildStart.call(context)
    await plugin.transform.handler.call(context, source, 'fixture.ts')
    plugin.buildEnd.call(context)

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('fused 1/2 pipelines (50.0% coverage; 1 skipped)'),
    )
  })
})
