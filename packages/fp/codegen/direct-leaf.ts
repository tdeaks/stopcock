/**
 * Direct-leaf emission policy.
 *
 * A generated dual mixes two unrelated jobs in one function: executing the
 * operation, and constructing a curried operator. The execution path then
 * shares a frame with cache reads, tag writes, and operator identity, which is
 * what produces the mixed-history plateau on `map`.
 *
 * A policy entry splits one operation into an isolated direct leaf and an
 * isolated constructor. The leaf reads no operator cache, tag field,
 * provenance, or fusion state. The model and render functions here are pure so
 * the emitted shape is testable without running the generator.
 *
 * Both paths call one shared execution leaf, and construction stays in the
 * dispatcher's data-last branch. Three other shapes were measured and rejected
 * by the map history gate, each on the *direct* path after an unrelated
 * history:
 *
 * - construction as its own function: ~85% slower on V8 after a mixed-size
 *   history and ~70% slower on JSC after a data-last history, whether or not
 *   the constructed closure shares the leaf, and whether or not the cache hit
 *   is checked before the call;
 * - both paths inlining the body instead of calling the leaf: ~89% slower on
 *   JSC after a data-last history;
 * - only the direct path inlining the body: ~78% slower on JSC.
 *
 * So `construction` is a measured policy choice, not a style preference, and
 * the gate is what keeps it honest.
 */

export type DirectLeafCacheV1 = 'none' | 'weak-callback-map'

/**
 * Where the curried constructor lives. `isolated` emits a separate function;
 * `inline` keeps it in the dispatcher's data-last branch. Both keep execution
 * and construction on separate paths that share no cache or tag reads.
 */
export type DirectLeafConstructionV1 = 'inline' | 'isolated'

export interface DirectLeafPolicyV1 {
  readonly module: 'array'
  readonly name: string
  readonly arity: 2
  readonly leaf: string
  readonly construct: string
  readonly construction: DirectLeafConstructionV1
  /** Why this construction form, in one line. */
  readonly constructionReason: string
  /**
   * `weak-callback-map` keys operators on the callback itself, so `map(f)`
   * returns the same operator while `f` is live and retains nothing once it is
   * not. It replaces the one-entry strong slot the hand-written `map` used to
   * carry.
   */
  readonly cache: DirectLeafCacheV1
}

export const DIRECT_LEAF_POLICIES_V1: readonly DirectLeafPolicyV1[] = Object.freeze([
  Object.freeze({
    module: 'array',
    name: 'map',
    arity: 2,
    leaf: 'runMap',
    construct: 'constructMap',
    construction: 'inline',
    constructionReason:
      'an isolated constructor function costs ~70% on JSC and ~85% on V8 on the direct path after a data-last or mixed-size history',
    cache: 'weak-callback-map',
  }),
] as const)

export const directLeafPolicyForV1 = (
  module: string,
  name: string,
): DirectLeafPolicyV1 | undefined =>
  DIRECT_LEAF_POLICIES_V1.find((policy) => policy.module === module && policy.name === name)

export interface DirectLeafModelV1 {
  readonly policy: DirectLeafPolicyV1
  readonly declaration: string
  readonly opcode: number
  /** Parameter names of the operation body, data first. */
  readonly params: readonly string[]
  readonly bodyCode: string
}

export const renderDirectLeafV1 = (model: DirectLeafModelV1): string => {
  const { policy, params, bodyCode } = model
  const [data, arg] = params
  const cacheName = `${policy.construct}Cache`

  const cacheState =
    policy.cache === 'none' ? '' : `const ${cacheName} = new WeakMap<object, any>()\n\n`
  const cacheHit =
    policy.cache === 'none'
      ? ''
      : `  const _hit = typeof _a0 === 'function' ? ${cacheName}.get(_a0) : undefined
  if (_hit !== undefined) return _hit
`
  const cacheStore =
    policy.cache === 'none'
      ? ''
      : `  if (typeof _a0 === 'function') ${cacheName}.set(_a0, _dl)
`

  const leaf = `function ${policy.leaf}(${data}: any, ${arg}: any): any {
  ${bodyCode}
}

`

  const constructBody = `${cacheHit}  const _dl: any = function (data: any) {
    return ${policy.leaf}(data, _a0)
  }
  _dl._op = ${model.opcode}
  _dl._fn = _a0
  registerTrustedOperator(_dl, ${model.opcode}, _a0)
${cacheStore}  return _dl
`

  const directBranch = `  if (arguments.length >= ${policy.arity}) {
    const _a0 = arguments[0]
    const _a1 = arguments[1]
    return ${policy.leaf}(_a0, _a1)
  }
`

  if (policy.construction === 'inline') {
    return `${leaf}${cacheState}${model.declaration} = function ${policy.name}(): any {
${directBranch}  const _a0 = arguments[0]
${constructBody}} as any
`
  }

  return `${leaf}${cacheState}function ${policy.construct}(_a0: any): any {
${constructBody}}

${model.declaration} = function ${policy.name}(): any {
${directBranch}  return ${policy.construct}(arguments[0])
} as any
`
}
