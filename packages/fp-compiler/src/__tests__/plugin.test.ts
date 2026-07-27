import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  it('keeps receipt config identity stable across fallback-tier insertion order', async () => {
    const source = `
import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const fused = pipe([1, 2, 3], map((x) => x * 2))
`
    const firstReceipts: any[] = []
    const secondReceipts: any[] = []
    const first = stopcockFp.raw({
      diagnostics: 'summary',
      fallbackTiers: {
        '@fixture/first': 'sequential',
        '@fixture/second': 'compact',
      },
      receipts: { onReceipts: (receipts) => firstReceipts.push(...receipts) },
    }) as any
    const second = stopcockFp.raw({
      diagnostics: 'summary',
      fallbackTiers: {
        '@fixture/second': 'compact',
        '@fixture/first': 'sequential',
      },
      receipts: { onReceipts: (receipts) => secondReceipts.push(...receipts) },
    }) as any

    for (const plugin of [first, second]) {
      plugin.buildStart.call({})
      await plugin.transform.handler.call({}, source, 'fixture.ts')
      plugin.buildEnd.call({})
    }

    expect(firstReceipts).toHaveLength(1)
    expect(secondReceipts).toHaveLength(1)
    expect(firstReceipts[0]?.configHash).toBe(secondReceipts[0]?.configHash)
  })

  it('binds include and exclude filters into receipt config identity', async () => {
    const source = `
import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const fused = pipe([1, 2, 3], map((x) => x * 2))
`
    const receiptsFor = async (
      include: string | RegExp,
      exclude: string | RegExp,
    ): Promise<any[]> => {
      const receipts: any[] = []
      const plugin = stopcockFp.raw({
        include,
        exclude,
        receipts: { onReceipts: (emitted) => receipts.push(...emitted) },
      }) as any
      plugin.buildStart.call({})
      await plugin.transform.handler.call({ warn: vi.fn() }, source, 'fixture.ts')
      plugin.buildEnd.call({})
      return receipts
    }

    const first = await receiptsFor(/fixture\.ts$/i, /vendor/u)
    const second = await receiptsFor('fixture.ts', /vendor/u)
    const third = await receiptsFor(/fixture\.ts$/i, /generated/u)

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(third).toHaveLength(1)
    expect(first[0]?.configHash).not.toBe(second[0]?.configHash)
    expect(first[0]?.configHash).not.toBe(third[0]?.configHash)
  })

  it('collects receipts when user-facing diagnostics are disabled', async () => {
    const source = `
import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const fused = pipe([1, 2, 3], map((x) => x * 2))
`
    const receipts: any[] = []
    const plugin = stopcockFp.raw({
      receipts: { onReceipts: (emitted) => receipts.push(...emitted) },
    }) as any

    plugin.buildStart.call({})
    await plugin.transform.handler.call({}, source, '/repo/src/fixture.ts')
    plugin.buildEnd.call({})

    expect(receipts).toHaveLength(1)
    expect(receipts[0]).toMatchObject({
      disposition: 'transformed',
      sourcePath: expect.stringMatching(/^external\/sha256-[0-9a-f]{64}$/u),
    })
    expect(JSON.stringify(receipts[0])).not.toContain('/repo/src/fixture.ts')
  })

  it('discards buffered receipts when a later strict transform fails', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'stopcock-fp-compiler-failed-build-'))
    try {
      const receiptDirectory = join(scratch, 'receipts')
      const emitted: any[] = []
      const onReceipts = vi.fn((receipts: readonly any[]) => emitted.push(...receipts))
      const plugin = stopcockFp.raw({
        diagnostics: 'error',
        receipts: {
          dir: receiptDirectory,
          root: scratch,
          onReceipts,
        },
      }) as any
      const supported = `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const result = pipe([1, 2, 3], map((value) => value * 2))
`
      const unsupported = `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
const steps = [map((value) => value * 2)]
export const result = pipe([1, 2, 3], ...steps)
`

      plugin.buildStart.call({})
      await plugin.transform.handler.call({}, supported, join(scratch, 'supported.ts'))
      plugin.buildEnd.call({})

      expect(emitted).toHaveLength(1)
      expect(onReceipts).toHaveBeenCalledTimes(1)
      expect(existsSync(join(receiptDirectory, 'stopcock-receipts.json'))).toBe(true)

      plugin.buildStart.call({})
      expect(existsSync(join(receiptDirectory, 'stopcock-receipts.json'))).toBe(false)
      await plugin.transform.handler.call({}, supported, join(scratch, 'supported.ts'))
      expect(() =>
        plugin.transform.handler.call({}, unsupported, join(scratch, 'unsupported.ts')),
      ).toThrow(/skipped pipe/u)
      plugin.buildEnd.call({})

      expect(emitted).toHaveLength(1)
      expect(onReceipts).toHaveBeenCalledTimes(1)
      expect(existsSync(join(receiptDirectory, 'stopcock-receipts.json'))).toBe(false)

      plugin.buildStart.call({})
      await plugin.transform.handler.call({}, supported, join(scratch, 'supported.ts'))
      plugin.buildEnd.call({}, new Error('native host failure'))

      expect(emitted).toHaveLength(1)
      expect(onReceipts).toHaveBeenCalledTimes(1)
      expect(existsSync(join(receiptDirectory, 'stopcock-receipts.json'))).toBe(false)

      plugin.buildStart.call({})
      await plugin.transform.handler.call({}, supported, join(scratch, 'supported.ts'))
      plugin.buildEnd.call({})

      expect(emitted).toHaveLength(2)
      expect(onReceipts).toHaveBeenCalledTimes(2)
      expect(existsSync(join(receiptDirectory, 'stopcock-receipts.json'))).toBe(true)
    } finally {
      await rm(scratch, { recursive: true, force: true })
    }
  })

  it('passes an extracted artifact context through unchanged to each receipt', async () => {
    const artifactContext = {
      fpArtifactHash: `sha256:${'1'.repeat(64)}`,
      compilerArtifactHash: `sha256:${'2'.repeat(64)}`,
      optimizerArtifactHash: `sha256:${'3'.repeat(64)}`,
      fpAbiHash: `sha256:${'4'.repeat(64)}`,
      optimizerBankHash: `sha256:${'5'.repeat(64)}`,
    } as const
    const receipts: any[] = []
    const plugin = stopcockFp.raw({
      receipts: { artifactContext, onReceipts: (emitted) => receipts.push(...emitted) },
    }) as any
    const source = `import { pipe } from '@stopcock/fp'
import { map } from '@stopcock/fp/array'
export const result = pipe([1], map((value) => value + 1))
`

    plugin.buildStart.call({})
    await plugin.transform.handler.call({}, source, '/repo/src/fixture.ts')
    plugin.buildEnd.call({})

    expect(receipts).toHaveLength(1)
    expect(receipts[0]?.artifactContext).toEqual(artifactContext)
  })


  it('emits a tier-visible receipt for an opaque-only site when diagnostics are disabled', async () => {
    const source = `
import { pipe } from '@stopcock/fp'
const tail = (values) => values
export const skipped = pipe([1, 2, 3], tail)
`
    const receipts: any[] = []
    const context = { warn: vi.fn() }
    const plugin = stopcockFp.raw({
      receipts: { onReceipts: (emitted) => receipts.push(...emitted) },
    }) as any

    plugin.buildStart.call(context)
    await plugin.transform.handler.call(context, source, '/repo/src/gap.ts')
    plugin.buildEnd.call(context)

    expect(receipts).toHaveLength(1)
    expect(receipts[0]).toMatchObject({
      semanticIds: [],
      disposition: 'fallback',
      fallbackTier: 'sequential',
      segmentKinds: ['opaque'],
      reasonCodes: ['opaque-callback'],
    })
    expect(context.warn).not.toHaveBeenCalled()
  })
})
