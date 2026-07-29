export const PURE_ANNOTATION_V1 = '/* @__PURE__ */'

export type PureInitializerModuleV1 =
  | 'array'
  | 'array-extra'
  | 'math'
  | 'option'
  | 'result'
  | 'object'
  | 'string'
  | 'number'

export interface PureInitializerSourceModuleV1 {
  readonly module: string
  readonly source: string
}

export interface PureInitializerSourceSiteV1 {
  readonly module: string
  readonly name: string
  readonly callKind: 'dual' | 'freeze'
}

// a308baa ("convert every hand-written op module to single-form") moved
// array-extra, option, result, object, string, and number off dual()/
// dual-untagged() entirely: every op in those modules is now a plain
// op(configArgs) => (data) => result closure, not a call to `dual`. A plain
// function expression assigned to a const carries no side effect a bundler
// needs `/* @__PURE__ */` to disprove, so none of those modules review a
// manual dual initializer anymore. This allowlist stays empty until a
// hand-written module reintroduces a tagless `dual(...)` call.
export const MANUAL_PURE_DUAL_INITIALIZERS_V1 = Object.freeze(
  {} as Readonly<Record<string, readonly string[]>>,
)

// Object.freeze receives a fresh literal, so dropping this unused singleton
// cannot mutate external state or expose a different construction order.
export const MANUAL_PURE_FREEZE_INITIALIZERS_V1 = Object.freeze({
  option: Object.freeze(['none']),
} as const)

const PURE_INITIALIZER_SOURCE_SITES_V1 = Object.freeze([
  ...Object.entries(MANUAL_PURE_DUAL_INITIALIZERS_V1).flatMap(([module, names]) =>
    names.map((name) => Object.freeze({ module, name, callKind: 'dual' as const })),
  ),
  ...Object.entries(MANUAL_PURE_FREEZE_INITIALIZERS_V1).flatMap(([module, names]) =>
    names.map((name) => Object.freeze({ module, name, callKind: 'freeze' as const })),
  ),
] satisfies readonly PureInitializerSourceSiteV1[])

const PURE_MARKER_PATTERN_V1 = /\/\* @__PURE__ \*\//gu
const EXPORTED_CONST_PATTERN_V1 = /export\s+const\s+([A-Za-z_$][\w$]*)\b/gu

const sourceSiteKey = (site: Pick<PureInitializerSourceSiteV1, 'module' | 'name'>): string =>
  `${site.module}.${site.name}`

export function pureInitializerSourceSitesV1(): readonly PureInitializerSourceSiteV1[] {
  return PURE_INITIALIZER_SOURCE_SITES_V1
}

export function validatePureInitializerSourcePolicyV1(
  modules: readonly PureInitializerSourceModuleV1[],
): void {
  const expected = new Map(
    PURE_INITIALIZER_SOURCE_SITES_V1.map((site) => [sourceSiteKey(site), site]),
  )
  const actual = new Set<string>()

  for (const { module, source } of modules) {
    for (const marker of source.matchAll(PURE_MARKER_PATTERN_V1)) {
      const markerIndex = marker.index
      const declarations = [...source.slice(0, markerIndex).matchAll(EXPORTED_CONST_PATTERN_V1)]
      const declaration = declarations.at(-1)
      const name = declaration?.[1]
      if (name === undefined) {
        throw new Error(`pure marker in ${module} is not owned by an exported const initializer`)
      }

      const key = `${module}.${name}`
      const site = expected.get(key)
      if (site === undefined) throw new Error(`unreviewed pure initializer ${key}`)
      if (actual.has(key)) throw new Error(`duplicate pure initializer marker for ${key}`)

      const afterMarker = source.slice(markerIndex + marker[0].length)
      const shape =
        site.callKind === 'dual'
          ? /^\s*dual\(/u
          : /^\s*Object\.freeze\(\{\s*_tag:\s*0\s*\}\)/u
      if (!shape.test(afterMarker)) {
        throw new Error(`pure initializer ${key} changed its reviewed ${site.callKind} shape`)
      }
      actual.add(key)
    }
  }

  const missing = [...expected.keys()].filter((key) => !actual.has(key))
  if (missing.length > 0) {
    throw new Error(`reviewed pure initializers are missing: ${missing.join(', ')}`)
  }
}
