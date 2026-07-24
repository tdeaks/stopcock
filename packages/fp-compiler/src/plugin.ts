import { createUnplugin } from 'unplugin'
import { transformStopcockPipelines } from './transform'
import type { FilterPattern, StopcockCompilerOptions } from './types'

const DEFAULT_INCLUDE = /\.[jt]sx?$/
const DEFAULT_EXCLUDE = [/node_modules/]

// unplugin's filter typing wants a mutable array; our public FilterPattern
// stays readonly, so copy on the way in.
function toMutableFilter(pattern: FilterPattern): string | RegExp | Array<string | RegExp> | undefined {
  if (pattern == null) return undefined
  if (typeof pattern === 'string' || pattern instanceof RegExp) return pattern
  return [...pattern]
}

export const stopcockFp = createUnplugin((options: StopcockCompilerOptions | undefined = {}) => {
  const diagnostics = options.diagnostics ?? false
  const semantics = options.assumePure === true ? 'pure' : 'exact'
  let fileCount = 0
  let transformedCount = 0
  let pipelineFileCount = 0
  let fusedSiteCount = 0
  let skippedSiteCount = 0

  return {
    name: 'stopcock-fp',
    enforce: 'pre',
    buildStart() {
      fileCount = 0
      transformedCount = 0
      pipelineFileCount = 0
      fusedSiteCount = 0
      skippedSiteCount = 0
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
        // on the first unfusable site; nothing further to check here.
        const result = transformStopcockPipelines(code, id, options)
        if (result.diagnostics.length > 0) {
          pipelineFileCount++
          for (const site of result.diagnostics) {
            if (site.transformed) fusedSiteCount++
            else skippedSiteCount++
          }
        }

        if (diagnostics === 'verbose') {
          for (const site of result.diagnostics) {
            const status = site.transformed ? `fused (${site.steps} steps)` : `skipped: ${site.reason}`
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
    buildEnd() {
      if (diagnostics === 'summary') {
        const totalSites = fusedSiteCount + skippedSiteCount
        const coverage =
          totalSites === 0
            ? 'n/a'
            : `${((fusedSiteCount / totalSites) * 100).toFixed(1)}%`
        console.log(
          `stopcock-fp: [${semantics}] fused ${fusedSiteCount}/${totalSites} pipelines (${coverage} coverage; ${skippedSiteCount} skipped) across ${transformedCount}/${pipelineFileCount} pipeline files; scanned ${fileCount} files`,
        )
      }
    },
  }
})

export default stopcockFp
