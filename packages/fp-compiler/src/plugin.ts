import { createUnplugin } from 'unplugin'
import { transformStopcockPipelines } from './transform'
import type { FilterPattern, StopcockCompilerOptions } from './types'
import { preserveWebpackLikeSourceMaps } from './webpack-like-source-maps'

// JavaScript and TypeScript module variants are ordinary compiler inputs.
// Keep JSX/TSX support while avoiding invented extensions such as `.mtsx`.
const DEFAULT_INCLUDE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const DEFAULT_EXCLUDE = [/node_modules/]

// unplugin's filter typing wants a mutable array; our public FilterPattern
// stays readonly, so copy on the way in.
function toMutableFilter(
  pattern: FilterPattern,
): string | RegExp | Array<string | RegExp> | undefined {
  if (pattern == null) return undefined
  if (typeof pattern === 'string' || pattern instanceof RegExp) return pattern
  return [...pattern]
}

const unplugin = createUnplugin((options: StopcockCompilerOptions | undefined = {}) => {
  const diagnostics = options.diagnostics ?? false
  const semantics = options.assumePure === true ? 'pure' : 'exact'
  let fileCount = 0
  let transformedCount = 0
  let pipelineFileCount = 0
  let fusedSiteCount = 0
  let partialSiteCount = 0
  let skippedSiteCount = 0
  let transformFailed = false

  return {
    name: 'stopcock-fp',
    enforce: 'pre',
    buildStart() {
      fileCount = 0
      transformedCount = 0
      pipelineFileCount = 0
      fusedSiteCount = 0
      partialSiteCount = 0
      skippedSiteCount = 0
      transformFailed = false
    },
    transform: {
      filter: {
        id: {
          include: toMutableFilter(options.include ?? DEFAULT_INCLUDE),
          exclude: toMutableFilter(options.exclude ?? DEFAULT_EXCLUDE),
        },
      },
      handler(code, id) {
        fileCount++
        // diagnostics: 'error' makes transformStopcockPipelines throw itself
        // on the first unfusable site. A portable Unplugin buildEnd hook does
        // not receive the host's failure state, so remember a transform error
        // here instead.
        const result = (() => {
          try {
            return transformStopcockPipelines(code, id, options)
          } catch (error) {
            transformFailed = true
            throw error
          }
        })()
        if (result.diagnostics.length > 0) {
          pipelineFileCount++
          for (const site of result.diagnostics) {
            if (site.transformed && site.reasonCodes?.includes('opaque-callback')) {
              partialSiteCount++
            } else if (site.transformed) fusedSiteCount++
            else skippedSiteCount++
          }
        }

        if (diagnostics === 'verbose') {
          for (const site of result.diagnostics) {
            const status = site.transformed
              ? site.reasonCodes?.includes('opaque-callback')
                ? `partially compiled (${site.steps} steps; opaque tail retained)`
                : `fused (${site.steps} steps)`
              : `skipped: ${site.reason}`
            this.warn(
              `stopcock-fp: ${id}:${site.line}:${site.column} [${site.semantics}] ${status}`,
            )
          }
        }

        if (result.code === code) return null

        transformedCount++
        return {
          code: result.code,
          map: result.map ?? undefined,
        }
      },
    },
    buildEnd(error?: Error) {
      if (transformFailed || error !== undefined) return
      if (diagnostics === 'summary') {
        const totalSites = fusedSiteCount + partialSiteCount + skippedSiteCount
        const coverage =
          totalSites === 0 ? 'n/a' : `${((fusedSiteCount / totalSites) * 100).toFixed(1)}%`
        console.log(
          `stopcock-fp: [${semantics}] fully compiled ${fusedSiteCount}/${totalSites} pipelines (${coverage} coverage; ${partialSiteCount} partial; ${skippedSiteCount} skipped) across ${transformedCount}/${pipelineFileCount} pipeline files; scanned ${fileCount} files`,
        )
      }
    },
  }
})

export const stopcockFp: typeof unplugin = {
  ...unplugin,
  webpack: preserveWebpackLikeSourceMaps(unplugin.webpack, 'webpack'),
  rspack: preserveWebpackLikeSourceMaps(unplugin.rspack, 'rspack'),
}

export default stopcockFp
