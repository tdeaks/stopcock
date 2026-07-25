import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Chunk, Configuration, Stats } from 'webpack'
import type { ConsumerBundleAdapter, ConsumerEmittedChunk } from '../types'
import {
  assertExecutableChunks,
  entryName,
  normalizeModuleId,
  normalizeSlashes,
  staticChunkImports,
} from './common'

const require = createRequire(import.meta.url)
const webpack = require('webpack') as typeof import('webpack')

const compile = (configuration: Configuration): Promise<Stats> =>
  new Promise((resolve, reject) => {
    const compiler = webpack(configuration)
    compiler.run((error, stats) => {
      const finish = (closeError?: Error | null): void => {
        if (error !== null && error !== undefined) reject(error)
        else if (closeError !== null && closeError !== undefined) reject(closeError)
        else if (stats === undefined) reject(new Error('webpack returned no stats'))
        else if (stats.hasErrors()) {
          reject(new Error(stats.toString({ all: false, errors: true, errorDetails: true })))
        } else resolve(stats)
      }
      compiler.close(finish)
    })
  })

export const bundleWithWebpack: ConsumerBundleAdapter = async (request) => {
  await mkdir(request.outputDirectory, { recursive: true })
  const entries = new Map(
    request.entries.map((entry) => [entryName(entry.fixtureId), entry.fixtureId]),
  )
  const stats = await compile({
    mode: 'production',
    context: request.consumerRoot,
    target: ['web', 'es2022'],
    entry: Object.fromEntries(
      request.entries.map((entry) => [entryName(entry.fixtureId), entry.path]),
    ),
    output: {
      path: request.outputDirectory,
      filename: '[name].js',
      chunkFilename: 'chunks/[id].js',
      module: true,
      library: { type: 'module' },
      clean: true,
      environment: {
        arrowFunction: true,
        const: true,
        destructuring: true,
        dynamicImport: true,
        module: true,
      },
    },
    experiments: { outputModule: true },
    optimization: {
      minimize: false,
      sideEffects: true,
      usedExports: true,
      concatenateModules: true,
      moduleIds: 'deterministic',
      chunkIds: 'deterministic',
      runtimeChunk: false,
      splitChunks:
        request.entries.length > 1
          ? {
              chunks: 'all',
              minSize: 0,
              minChunks: 2,
              name: false,
            }
          : false,
    },
    devtool: false,
    performance: false,
    stats: 'errors-warnings',
  })

  const chunkByFile = new Map<string, Chunk>()
  for (const chunk of stats.compilation.chunks) {
    for (const file of chunk.files) chunkByFile.set(normalizeSlashes(file), chunk)
  }
  const chunks: ConsumerEmittedChunk[] = await Promise.all(
    stats.compilation
      .getAssets()
      .filter(({ name }) => name.endsWith('.js'))
      .map(async ({ name }) => {
        const file = normalizeSlashes(name)
        const code = await readFile(join(request.outputDirectory, file), 'utf8')
        const chunk = chunkByFile.get(file)
        if (chunk === undefined) throw new Error(`webpack chunk metadata missing for ${file}`)
        const modules = Object.fromEntries(
          Array.from(stats.compilation.chunkGraph.getChunkModulesIterable(chunk), (module) => [
            normalizeModuleId(module.identifier(), request.consumerRoot),
            Math.max(0, Math.round(module.size())),
          ]),
        )
        const outputName = basename(file, '.js')
        const fixtureId = entries.get(outputName) ?? null
        return {
          file,
          code,
          imports: staticChunkImports(file, code),
          modules: Object.freeze(modules),
          isEntry: fixtureId !== null,
          entryId: fixtureId,
        }
      }),
  )
  assertExecutableChunks(chunks)
  return { chunks: Object.freeze(chunks) }
}
