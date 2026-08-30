// `.mts` keeps this executable fixture outside the package build's `src/**/*.ts` inputs.
export const V2_ROOT_MIGRATION = [
  {
    name: 'pipe',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain-sequential',
  },
  {
    name: 'flow',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain-sequential',
  },
  {
    name: 'compile',
    kind: 'value',
    destination: '@stopcock/fp/fusion',
    disposition: 'move',
  },
  {
    name: 'compilePure',
    kind: 'value',
    destination: '@stopcock/fp/fusion',
    disposition: 'move',
  },
  {
    name: 'explain',
    kind: 'value',
    destination: '@stopcock/fp/fusion/debug',
    disposition: 'move',
  },
  {
    name: 'optionFromNullable',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'isNone',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'isSome',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'none',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'some',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'err',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'isErr',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'isOk',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'ok',
    kind: 'value',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'Fn',
    kind: 'type',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'LazyValue',
    kind: 'type',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'Runner',
    kind: 'type',
    destination: '@stopcock/fp/fusion',
    disposition: 'move',
  },
  {
    name: 'PipelineExplanation',
    kind: 'type',
    destination: '@stopcock/fp/fusion/debug',
    disposition: 'move',
  },
  {
    name: 'None',
    kind: 'type',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'Option',
    kind: 'type',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'Some',
    kind: 'type',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'Err',
    kind: 'type',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'Ok',
    kind: 'type',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
  {
    name: 'Result',
    kind: 'type',
    destination: '@stopcock/fp',
    disposition: 'retain',
  },
] as const

// Before the one-runtime-path plan, `reference-interpreter` and
// `portable-lowering` ran the fused compact engine's own executor, which
// consumed a callback's returned value as an arbitrary Iterable (a plain
// `for...of`) rather than reading it as an indexed Array like every other
// surface. That executor is gone: `runtime-compile` (`@stopcock/fp/compile`)
// is now a plain alias for sequential application over the real `array.ts`
// operators, so it is byte-for-byte the same code path as
// `generated-data-last` and conforms identically -- confirmed empirically
// (exact result, event order, and thrown-error propagation all match) before
// this fixture was updated.
export const V2_EAGER_FLAT_MAP_SURFACES = [
  {
    id: 'generated-data-last',
    expectedContract: 'indexed-returned-array',
    currentStatus: 'conformant',
    oracleEligible: true,
  },
  {
    id: 'runtime-compile',
    expectedContract: 'indexed-returned-array',
    currentStatus: 'conformant',
    oracleEligible: true,
  },
  {
    id: 'fp-compiler',
    expectedContract: 'indexed-returned-array',
    currentStatus: 'conformant',
    oracleEligible: true,
  },
] as const

export const V2_EAGER_FLAT_MAP_EXPECTATIONS = Object.freeze({
  callbackArguments: 'value-only',
  sourceLength: 'snapshot-before-first-callback',
  returnedArrayLength: 'snapshot-before-first-index-read',
  returnedArrayAccess: 'indexed-zero-through-length-minus-one',
  returnedArrayHoles: 'observed-as-undefined',
  arbitraryReturnedIterable: 'not-consumed',
  resultOwnership: 'fresh-array',
})

export const V2_ITER_FLAT_MAP_EXPECTATIONS = Object.freeze({
  callbackArguments: 'value-and-independent-outer-index',
  callbackResult: 'arbitrary-iterable',
  evaluation: 'lazy',
  earlyTermination: 'closes-active-nested-and-source-iterators',
})
