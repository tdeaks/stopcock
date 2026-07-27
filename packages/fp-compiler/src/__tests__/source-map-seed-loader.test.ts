import { describe, expect, it } from 'vitest'
import sourceMapSeedLoader from '../source-map-seed-loader.js'

interface LoaderSourceMap {
  readonly version: number
  readonly file?: string
  readonly sourceRoot?: string
  readonly sources: readonly string[]
  readonly sourcesContent?: readonly string[]
  readonly names: readonly string[]
  readonly mappings: string
  readonly [key: string]: unknown
}

interface LoaderContext {
  readonly resourcePath: string
  readonly resource: string
  async(): (
    error: Error | null,
    source?: string,
    sourceMap?: LoaderSourceMap | null,
  ) => void
  getOptions(): { readonly phase: 'seed' | 'finalize' }
}

const RESOURCE = '/selected/consumer/src/entry.mjs'
const SOURCE = 'export const result = 1\n'

const runLoader = (
  phase: 'seed' | 'finalize',
  sourceMap: LoaderSourceMap | null,
): Promise<LoaderSourceMap | null> =>
  new Promise((resolve, reject) => {
    const context: LoaderContext = {
      resourcePath: RESOURCE,
      resource: RESOURCE,
      getOptions: () => ({ phase }),
      async: () => (error, _source, nextMap) => {
        if (error !== null) reject(error)
        else resolve(nextMap ?? null)
      },
    }
    sourceMapSeedLoader.call(context, SOURCE, sourceMap)
  })

describe('Webpack-family source-map bridge', () => {
  it('restores a pre-existing no-op map without changing its evidence', async () => {
    const upstream = {
      version: 3,
      file: 'entry.mjs',
      sources: ['entry.mjs'],
      sourcesContent: [SOURCE],
      names: [],
      mappings: 'AAAA',
      x_upstream_evidence: 'preserve-me',
    } satisfies LoaderSourceMap

    const seeded = await runLoader('seed', upstream)
    const restored = await runLoader('finalize', seeded)

    expect(restored).toEqual(upstream)
    expect(JSON.stringify(restored)).toBe(JSON.stringify(upstream))
  })

  it('rebases only a compiler-produced ambiguous source identity', async () => {
    const compilerMap = {
      version: 3,
      file: 'entry.mjs',
      sources: ['entry.mjs'],
      sourcesContent: [SOURCE],
      names: [],
      mappings: 'AAAA',
    } satisfies LoaderSourceMap

    await expect(runLoader('finalize', compilerMap)).resolves.toEqual({
      ...compilerMap,
      sources: [RESOURCE],
    })
  })
})
