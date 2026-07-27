import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_MAP_SEED_LOADER = join(
  dirname(fileURLToPath(import.meta.url)),
  'source-map-seed-loader.js',
)

interface RuleWithDynamicUse {
  use: (data: unknown) => unknown
}

interface CompilerRules {
  readonly options?: {
    readonly module?: {
      readonly rules?: unknown
    }
  }
}

interface HostPlugin {
  apply(compiler: unknown): void
}

const rulesFor = (compiler: unknown, host: string): unknown[] => {
  const rules = (compiler as CompilerRules).options?.module?.rules
  if (!Array.isArray(rules)) {
    throw new Error(`fp-compiler: ${host} adapter cannot inspect normalized module rules`)
  }
  return rules
}

const hasDynamicUse = (rule: unknown): rule is RuleWithDynamicUse =>
  typeof rule === 'object' &&
  rule !== null &&
  'use' in rule &&
  typeof (rule as { readonly use?: unknown }).use === 'function'

/**
 * Unplugin 3.3's Webpack-family transform loaders discard a transform map when
 * no earlier loader supplied one. Seed an exact identity map immediately
 * before that loader, then restore the transformed map's physical source
 * identity afterwards. Keeping the workaround in our adapter also protects
 * installed consumers; a workspace-only dependency patch would not.
 */
export const preserveWebpackLikeSourceMaps = <Options, Plugin>(
  adapter: (options?: Options) => Plugin,
  host: 'webpack' | 'rspack',
): ((options?: Options) => Plugin) => {
  return (options?: Options): Plugin => {
    const plugin = adapter(options) as Plugin & HostPlugin
    return {
      ...plugin,
      apply(compiler: unknown): void {
        const rules = rulesFor(compiler, host)
        const existing = new Set(rules)
        plugin.apply(compiler)
        const transformRules = rules.filter(
          (rule): rule is RuleWithDynamicUse => !existing.has(rule) && hasDynamicUse(rule),
        )
        if (transformRules.length !== 1) {
          throw new Error(
            `fp-compiler: ${host} adapter expected one injected transform rule, received ${transformRules.length}`,
          )
        }
        const transformRule = transformRules[0]
        const originalUse = transformRule.use
        transformRule.use = (data: unknown): unknown => {
          const selected = originalUse(data)
          if (!Array.isArray(selected)) {
            throw new Error(`fp-compiler: ${host} transform rule returned a non-array loader set`)
          }
          if (selected.length === 0) return selected
          return [
            {
              loader: SOURCE_MAP_SEED_LOADER,
              options: { phase: 'finalize' },
            },
            ...selected,
            {
              loader: SOURCE_MAP_SEED_LOADER,
              options: { phase: 'seed' },
            },
          ]
        }
      },
    } as Plugin
  }
}
