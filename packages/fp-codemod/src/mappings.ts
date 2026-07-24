export const LEGACY_SUBPATHS: Readonly<Record<string, string>> = {
  '@stopcock/fp/stream': '@stopcock/fp/iter',
  '@stopcock/fp/dict': '@stopcock/fp/record',
  '@stopcock/fp/dual-lite': '@stopcock/fp/dual',
}

export const MANUAL_SUBPATHS: Readonly<Record<string, string>> = {
  '@stopcock/fp/lens': '@stopcock/fp/optic',
}

export const REMOVED_SUBPATHS = new Set(['@stopcock/fp/logic'])

export const ROOT_NAMESPACES: Readonly<Record<string, string>> = {
  A: 'array',
  B: 'boolean',
  D: 'record',
  G: 'guard',
  M: 'math',
  N: 'number',
  Obj: 'object',
  O: 'option',
  R: 'result',
  S: 'string',
  Stream: 'iter',
}

export interface NamedMigration {
  readonly module: string
  readonly exported: string
}

const aliases = (
  module: string,
  values: Readonly<Record<string, string>>,
): Readonly<Record<string, NamedMigration>> =>
  Object.fromEntries(
    Object.entries(values).map(([legacy, exported]) => [legacy, { module, exported }]),
  )

export const ROOT_NAMED_MIGRATIONS: Readonly<Record<string, NamedMigration>> = {
  ...aliases('option', {
    fromPredicate: 'fromPredicate',
    mapOption: 'map',
    flatMapOption: 'flatMap',
    andThenOption: 'andThen',
    flattenOption: 'flatten',
    orElseOption: 'orElse',
    orElseWithOption: 'orElse',
    andOption: 'and',
    zipOption: 'zip',
    zipWithOption: 'zipWith',
    containsOption: 'contains',
    existsOption: 'exists',
    mapNullable: 'mapNullable',
    filterOption: 'filter',
    getOrElseOption: 'getOrElse',
    matchOption: 'match',
    tapOption: 'tap',
    toNullable: 'toNullable',
    toUndefined: 'toUndefined',
    toResult: 'toResult',
  }),
  ...aliases('result', {
    mapResult: 'map',
    mapErr: 'mapErr',
    flatMapResult: 'flatMap',
    andThenResult: 'andThen',
    flattenResult: 'flatten',
    orElseResult: 'orElse',
    orElseWithResult: 'orElse',
    andResult: 'and',
    zipResult: 'zip',
    zipWithResult: 'zipWith',
    containsResult: 'contains',
    existsResult: 'exists',
    getOrElseResult: 'getOrElse',
    matchResult: 'match',
    tryCatch: 'tryCatch',
    fromThrowable: 'fromThrowable',
    resultFromNullable: 'fromNullable',
    toOption: 'toOption',
    tapResult: 'tap',
    tapErr: 'tapErr',
  }),
  ...aliases('guard', {
    Predicate: 'Predicate',
    Refinement: 'Refinement',
    Brand: 'Brand',
    is: 'is',
    isNil: 'isNil',
    isNotNil: 'isNotNil',
    propIs: 'propIs',
    isArray: 'isArray',
    isBigInt: 'isBigInt',
    isBoolean: 'isBoolean',
    isDate: 'isDate',
    isDeepEqual: 'isDeepEqual',
    isDefined: 'isDefined',
    isEmpty: 'isEmpty',
    isEmptyish: 'isEmptyish',
    isError: 'isError',
    isFunction: 'isFunction',
    isNonNull: 'isNonNull',
    isNonNullish: 'isNonNullish',
    isNullish: 'isNullish',
    isNumber: 'isNumber',
    isObjectType: 'isObjectType',
    isPlainObject: 'isPlainObject',
    isPromise: 'isPromise',
    isShallowEqual: 'isShallowEqual',
    isStrictEqual: 'isStrictEqual',
    isString: 'isString',
    isSymbol: 'isSymbol',
    isTruthy: 'isTruthy',
    and: 'and',
    or: 'or',
    not: 'not',
  }),
  ...aliases('function', {
    identity: 'identity',
    always: 'always',
    flip: 'flip',
    complement: 'complement',
    memoize: 'memoize',
    once: 'once',
    converge: 'converge',
    juxt: 'juxt',
  }),
  ...aliases('compile', {
    OptimizerStats: 'OptimizerStats',
    getOptimizerStats: 'getOptimizerStats',
    resetOptimizerStats: 'resetOptimizerStats',
  }),
}

export const ROOT_RENAMED_MIGRATIONS: Readonly<Record<string, string>> = {
  explainPipeline: 'explain',
}

export const SLIM_ROOT_EXPORTS = new Set([
  'Fn',
  'LazyValue',
  'pipe',
  'flow',
  'dual',
  'compile',
  'compilePure',
  'explain',
  'PipelineExplanation',
  'PureRewrite',
  'Runner',
  'None',
  'Option',
  'Some',
  'optionFromNullable',
  'isNone',
  'isSome',
  'none',
  'some',
  'Err',
  'Ok',
  'Result',
  'err',
  'isErr',
  'isOk',
  'ok',
])

export const RUNTIME_COMPILER_ROOT_EXPORTS = new Set([
  'compileJit',
  'JitUnavailableError',
  'JitCompileOptions',
  'RunnerExplanation',
  'explainRunner',
  'explainSteps',
])

export const ASYNC_ROOT_EXPORTS = new Set(['tryCatchAsync'])

export const MANUAL_OPTIC_ROOT_EXPORTS = new Set([
  'Lens',
  'lens',
  'prop',
  'index',
  'path',
  'lensProp',
  'lensIndex',
  'lensPath',
  'view',
  'set',
  'over',
  'composeLens',
  'Prism',
  'prism',
  'prismFromPredicate',
  'somePrism',
  'okPrism',
  'preview',
  'setPrism',
  'overPrism',
  'composePrism',
  'Traversal',
  'traversal',
  'each',
  'filtered',
  'composeTraversal',
  'toArray',
  'modify',
  'setTraversal',
  'Iso',
  'iso',
  'reverse',
  'composeIso',
  'composeOptics',
])

export const MANUAL_ROOT_EXPORTS = new Set([
  ...RUNTIME_COMPILER_ROOT_EXPORTS,
  ...ASYNC_ROOT_EXPORTS,
  ...MANUAL_OPTIC_ROOT_EXPORTS,
  'getWithDefault',
  'Logic',
])
