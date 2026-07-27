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

export interface GeneratedInitializerSiteV1 {
  readonly module: 'array' | 'math'
  readonly name: string
  readonly bodyKind: 'inline' | 'reference'
}

export interface PureInitializerSourceModuleV1 {
  readonly module: string
  readonly source: string
}

export interface PureInitializerSourceSiteV1 {
  readonly module: string
  readonly name: string
  readonly callKind:
    | 'generated-iife'
    | 'registered-dual-iife'
    | 'registered-unary'
    | 'dual'
    | 'typed-array'
    | 'freeze'
}

const GENERATED_PURE_INITIALIZER_KEYS_V1 = Object.freeze([
  'array.head',
  'array.last',
  'array.tail',
  'array.init',
  'array.isEmpty',
  'array.length',
  'array.reverse',
  'array.flatten',
  'array.sort',
  'array.uniq',
  'array.sortAsc',
  'array.sortDesc',
  'array.dropRepeats',
  'array.shuffle',
  'array.headOrUndefined',
  'array.headNonEmpty',
  'array.lastOrUndefined',
  'array.lastNonEmpty',
  'array.minOrUndefined',
  'array.minNonEmpty',
  'array.maxOrUndefined',
  'array.maxNonEmpty',
  'array.only',
  'array.onlyOrUndefined',
  'array.mergeAll',
  'array.transpose',
  'array.unnest',
  'math.inc',
  'math.dec',
  'math.negate',
] as const)

const GENERATED_DENIED_INITIALIZER_KEYS_V1 = Object.freeze([
  'array.sum',
  'array.min',
  'array.max',
] as const)

// Every listed call is tagless. With no tag, dual allocates only a fresh local
// wrapper: it does not invoke the body or read the mutable opcode table.
export const MANUAL_PURE_DUAL_INITIALIZERS_V1 = Object.freeze({
  'array-extra': Object.freeze([
    'partitionMap',
    'traverse',
    'groupMap',
    'groupMapReduce',
    'countBy',
    'zipAll',
    'span',
    'dropUntil',
    'cartesian',
    'combinations',
    'binarySearch',
    'mapInto',
    'filterInto',
    'shuffleWith',
  ]),
  // Phase 2 (compiler: option/result domains): dual-internal.ts is gone;
  // option.ts and result.ts call `dual` from `./dual-untagged` now (same
  // untagged dispatchers, moved so `dual-internal.ts` could go), same call
  // shape as every other untagged module below, so they belong on this
  // allowlist rather than a separate one.
  option: Object.freeze([
    'fromPredicate',
    'map',
    'flatMap',
    'orElse',
    'orElseWith',
    'and',
    'zip',
    'zipWith',
    'contains',
    'exists',
    'mapNullable',
    'filter',
    'getOrElse',
    'getWithDefault',
    'match',
    'tap',
    'as',
    'ap',
    'traverse',
    'partitionMap',
    'toResult',
  ]),
  result: Object.freeze([
    'fromPredicate',
    'map',
    'mapErr',
    'mapBoth',
    'flatMap',
    'orElse',
    'and',
    'zip',
    'zipWith',
    'ap',
    'filterOrElse',
    'contains',
    'exists',
    'getOrElse',
    'getOrThrow',
    'match',
    'traverse',
    'traverseValidation',
    'optional',
    'nullable',
    'tap',
    'tapErr',
    'as',
  ]),
  object: Object.freeze([
    'pick',
    'omit',
    'assoc',
    'dissoc',
    'mapValues',
    'mapKeys',
    'pickBy',
    'omitBy',
    'mergeWith',
    'getPathOrUndefined',
    'getPath',
    'hasPath',
    'setPath',
    'modifyPath',
    'removePath',
    'evolve',
  ]),
  string: Object.freeze([
    'startsWith',
    'endsWith',
    'includes',
    'repeat',
    'stripPrefix',
    'stripSuffix',
    'replace',
    'replaceAll',
    'test',
    'match',
  ]),
  number: Object.freeze([
    'clamp',
    'between',
    'weightedMeanOrUndefined',
    'weightedMean',
    'quantileOrUndefined',
    'quantile',
    'quantileNonEmpty',
    'percentileOrUndefined',
    'percentile',
    'percentileNonEmpty',
    'dotProduct',
    'dotProductTruncate',
    'gcd',
    'lcm',
  ]),
} as const)

/**
 * Each initializer passes one fresh local unary function to the fixed-numeric
 * tagger, which writes its public opcode and registers that same private
 * identity. Dropping an unused initializer cannot be observed because no
 * reference to either the function or its WeakMap entry escapes.
 */
export const MANUAL_PURE_REGISTERED_INITIALIZERS_V1 = Object.freeze({
  string: Object.freeze([
    'isEmpty',
    'length',
    'trim',
    'trimStart',
    'trimEnd',
    'toLowerCase',
    'toUpperCase',
  ]),
} as const)

/**
 * The initializer allocates only the anonymous arity-zero public wrapper.
 * Private registration remains inside its data-last call path.
 */
export const MANUAL_PURE_REGISTERED_DUAL_INITIALIZERS_V1 = Object.freeze({
  string: Object.freeze(['split']),
} as const)

/**
 * A typed-array literal built from constants. Dropping it when compact fusion
 * is unreachable cannot change behaviour, and it is the fact table's whole
 * purpose to be droppable.
 */
export const MANUAL_PURE_TYPED_ARRAY_INITIALIZERS_V1 = Object.freeze({
  'internal/compact/facts.generated': Object.freeze(['COMPACT_FACTS']),
} as const)

// Object.freeze receives a fresh literal, so dropping this unused singleton
// cannot mutate external state or expose a different construction order.
export const MANUAL_PURE_FREEZE_INITIALIZERS_V1 = Object.freeze({
  option: Object.freeze(['none']),
} as const)

// No tagged manual initializer is currently eligible for this deny list:
// scalar String operators use fixed numeric registration and split constructs
// its tagged data-last operator only when called.
export const MANUAL_DENIED_PURE_INITIALIZERS_V1 = Object.freeze({
  string: Object.freeze([]),
} as const)

const PURE_INITIALIZER_SOURCE_SITES_V1 = Object.freeze([
  ...GENERATED_PURE_INITIALIZER_KEYS_V1.map((key) => {
    const [module, name] = key.split('.')
    return Object.freeze({ module, name, callKind: 'generated-iife' as const })
  }),
  ...Object.entries(MANUAL_PURE_DUAL_INITIALIZERS_V1).flatMap(([module, names]) =>
    names.map((name) => Object.freeze({ module, name, callKind: 'dual' as const })),
  ),
  ...Object.entries(MANUAL_PURE_REGISTERED_INITIALIZERS_V1).flatMap(([module, names]) =>
    names.map((name) => Object.freeze({ module, name, callKind: 'registered-unary' as const })),
  ),
  ...Object.entries(MANUAL_PURE_REGISTERED_DUAL_INITIALIZERS_V1).flatMap(([module, names]) =>
    names.map((name) => Object.freeze({ module, name, callKind: 'registered-dual-iife' as const })),
  ),
  ...Object.entries(MANUAL_PURE_TYPED_ARRAY_INITIALIZERS_V1).flatMap(([module, names]) =>
    names.map((name) => Object.freeze({ module, name, callKind: 'typed-array' as const })),
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
        site.callKind === 'generated-iife' || site.callKind === 'registered-dual-iife'
          ? /^\s*\(\(\)\s*=>\s*\{/u
          : site.callKind === 'registered-unary'
            ? /^\s*taggedUnary\(\s*\([^)]*\)\s*=>/u
            : site.callKind === 'dual'
              ? /^\s*dual\(/u
              : site.callKind === 'typed-array'
                ? /^\s*Uint8Array\.from\(\[/u
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

const keyOf = (site: Pick<GeneratedInitializerSiteV1, 'module' | 'name'>): string =>
  `${site.module}.${site.name}`

export function generatedPureAnnotationV1(site: GeneratedInitializerSiteV1): string {
  const key = keyOf(site)
  if ((GENERATED_PURE_INITIALIZER_KEYS_V1 as readonly string[]).includes(key)) {
    if (site.bodyKind !== 'inline') {
      throw new Error(`pure initializer ${key} no longer creates a fresh local function`)
    }
    return `${PURE_ANNOTATION_V1} `
  }
  if ((GENERATED_DENIED_INITIALIZER_KEYS_V1 as readonly string[]).includes(key)) {
    if (site.bodyKind !== 'reference') {
      throw new Error(`denied initializer ${key} changed shape and requires purity review`)
    }
    return ''
  }
  return ''
}

export function generatedPureInitializerKeysV1(): readonly string[] {
  return GENERATED_PURE_INITIALIZER_KEYS_V1
}

export function generatedDeniedInitializerKeysV1(): readonly string[] {
  return GENERATED_DENIED_INITIALIZER_KEYS_V1
}
