import packageJson from '../package.json' with { type: 'json' }
import { noEagerArrayChains, noLegacyApi, noRootModuleImports, preferOptionPartials } from './rules'
import type { FlatConfig, StopcockFpPlugin } from './types'

export * from './rules'
export type { FlatConfig, StopcockFpPlugin } from './types'

export const rules = {
  'no-legacy-api': noLegacyApi,
  'no-root-module-imports': noRootModuleImports,
  'no-eager-array-chains': noEagerArrayChains,
  'prefer-option-partials': preferOptionPartials,
} as const

const plugin: {
  meta: StopcockFpPlugin['meta']
  rules: StopcockFpPlugin['rules']
  configs: Record<string, FlatConfig>
} = {
  meta: {
    name: '@stopcock/eslint-plugin-fp',
    version: packageJson.version,
  },
  rules,
  configs: {},
}

plugin.configs.recommended = {
  name: '@stopcock/fp/recommended',
  plugins: {
    '@stopcock/fp': plugin,
  },
  rules: {
    '@stopcock/fp/no-legacy-api': 'error',
    '@stopcock/fp/no-root-module-imports': 'warn',
    '@stopcock/fp/prefer-option-partials': 'warn',
  },
}

plugin.configs.performance = {
  name: '@stopcock/fp/performance',
  plugins: {
    '@stopcock/fp': plugin,
  },
  rules: {
    '@stopcock/fp/no-legacy-api': 'error',
    '@stopcock/fp/no-root-module-imports': 'warn',
    '@stopcock/fp/no-eager-array-chains': 'warn',
    '@stopcock/fp/prefer-option-partials': 'warn',
  },
}

export const configs: StopcockFpPlugin['configs'] = plugin.configs

export default plugin as StopcockFpPlugin
