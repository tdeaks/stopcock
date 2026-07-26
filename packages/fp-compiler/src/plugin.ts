import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import { createUnplugin } from 'unplugin'
import { buildCompilerReceipt, serializeReceipts } from './receipt-emit'
import type { CompilerReceiptV1 } from './receipt-schema.generated'
import { transformStopcockPipelines } from './transform'
import type { FilterPattern, StopcockCompilerOptions } from './types'

const DEFAULT_INCLUDE = /\.[jt]sx?$/
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

type FilterIdentity =
  | { readonly kind: 'none' }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'regexp'; readonly source: string; readonly flags: string }
  | { readonly kind: 'array'; readonly values: readonly Exclude<FilterIdentity, { kind: 'none' }>[] }

/**
 * Filter selection changes which source sites can receive receipts, so it is
 * part of the decision identity. RegExp stringification is deliberately not
 * used: an explicit structural form avoids engine-dependent formatting.
 */
function filterIdentity(pattern: FilterPattern): FilterIdentity {
  if (pattern == null) return { kind: 'none' }
  if (typeof pattern === 'string') return { kind: 'string', value: pattern }
  if (pattern instanceof RegExp) {
    return { kind: 'regexp', source: pattern.source, flags: pattern.flags }
  }
  return {
    kind: 'array',
    values: pattern.map((entry) =>
      typeof entry === 'string'
        ? { kind: 'string' as const, value: entry }
        : { kind: 'regexp' as const, source: entry.source, flags: entry.flags },
    ),
  }
}

export const stopcockFp = createUnplugin((options: StopcockCompilerOptions | undefined = {}) => {
  const diagnostics = options.diagnostics ?? false
  const semantics = options.assumePure === true ? 'pure' : 'exact'
  const receiptOptions = options.receipts
  const receiptRoot = resolvePath(receiptOptions?.root ?? process.cwd())
  /*
   * Diagnostics are the transform's site-evidence channel. Receipts must
   * collect that evidence even when the caller has disabled user-facing
   * diagnostics; the original `diagnostics` value below still exclusively
   * controls warnings and summary output.
   */
  const transformOptions: StopcockCompilerOptions =
    receiptOptions !== undefined && diagnostics === false
      ? { ...options, diagnostics: 'summary' }
      : options
  /**
   * Only the options that can change a decision. `diagnostics` and the receipt
   * settings themselves cannot, so including them would invalidate every
   * receipt when someone merely turned logging on.
   */
  const configHash = `sha256:${createHash('sha256')
    .update(
      JSON.stringify({
        semantics,
        include: filterIdentity(options.include ?? DEFAULT_INCLUDE),
        exclude: filterIdentity(options.exclude ?? DEFAULT_EXCLUDE),
        importSources: options.importSources ?? null,
        compileImportSources: options.compileImportSources ?? null,
        arrayImportSources: options.arrayImportSources ?? null,
        fallbackTiers:
          options.fallbackTiers === undefined
            ? null
            : Object.entries(options.fallbackTiers).sort(([left], [right]) =>
                left.localeCompare(right),
              ),
        expectedSemanticManifestHash: options.expectedSemanticManifestHash ?? null,
        expectedLoweringAbiHash: options.expectedLoweringAbiHash ?? null,
      }),
    )
    .digest('hex')}`
  let receipts: CompilerReceiptV1[] = []
  let fileCount = 0
  let transformedCount = 0
  let pipelineFileCount = 0
  let fusedSiteCount = 0
  let partialSiteCount = 0
  let skippedSiteCount = 0

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
      receipts = []
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
        const result = transformStopcockPipelines(code, id, transformOptions)
        if (result.diagnostics.length > 0) {
          pipelineFileCount++
          for (const site of result.diagnostics) {
            if (site.transformed && site.reasonCodes?.includes('opaque-callback')) {
              partialSiteCount++
            } else if (site.transformed) fusedSiteCount++
            else skippedSiteCount++
          }
        }

        if (receiptOptions !== undefined) {
          for (const receiptSite of result.diagnostics) {
            const receipt = buildCompilerReceipt(receiptSite, code, {
              root: receiptRoot,
              configHash,
              emittedCode: result.code === code ? null : result.code,
              sourceMap: result.map === null ? null : JSON.stringify(result.map),
            })
            receipts.push(receipt)
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
    buildEnd() {
      if (receiptOptions !== undefined) {
        receiptOptions.onReceipts?.(receipts)
        if (receiptOptions.dir !== undefined) {
          const directory = resolvePath(receiptOptions.dir)
          mkdirSync(directory, { recursive: true })
          writeFileSync(join(directory, 'stopcock-receipts.json'), serializeReceipts(receipts))
        }
      }
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

export default stopcockFp
