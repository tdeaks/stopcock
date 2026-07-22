# Frozen reference emitter changelog

Per the plan's oracle-independence rule, `emitter.ts` changes only with an
entry here, reviewed, never silently.

## 2026-07-21: grammar extension for scan and without (APPLIED)

`array.ts`'s `scan` and `without` are now tagged with real opcodes
(`OP_SCAN`, `OP_WITHOUT` in `packages/fp/src/opcodes.ts`) and registered
(`packages/fp/src/registry.ts`), so `buildPlan` no longer treats them as
opaque whole-array steps -- they enter the Plan IR like any other op. This
entry extends the emitter to match, purely to keep it an accurate oracle
for the newly-reachable grammar; no existing emission changed.

`scan` is added as a stream op (registry cardinality `stateful`, callback
arity 2, bindings `fn`/`a1`). Its array dialect emits the initial
accumulator (`a1`) before any element is processed -- output length is n+1
for n inputs, `out[0]` is the seed -- which differs from Stream's
`scanStream` (no opcode here; that dialect emits exactly one output per
input, see `OP_SCAN_STREAM`'s existing sign-off note). The emitter reflects
this with a one-shot "phantom" pass per scan position, run before the main
loop in descending position order (a later scan's own phantom must fire
before an earlier scan's phantom reaches it as a normal input -- matches
`interpret.ts`'s `runScanArrayInits` / `lower.ts`'s identical ordering).

`without` is added as a boundary op (registry cardinality `materializer`).
`without(arr, values)` binds `values` (a single array argument, not
variadic) at `.fn` -- dual-inline's arity-2 codegen always writes the sole
curried argument to the `_fn` slot regardless of whether it's a callback
(see `take`/`drop`, which bind their plain numeric count the same way).
Emission excludes membership with a `Set` (SameValueZero, matching
`array.ts`'s own `sameValueZero` semantics).

`toArray` remains absent from the real grammar: it has no opcode at all
(there is no `A.toArray` in the array domain -- only `Stream.toArray` and
optics' `Traversal.toArray`, both hand-written, neither routed through
`buildPlan`). It stays a synthetic sink in this emitter (`EMITTER_OPCODES.
toArray: null`), used only to give fuzzed pipelines a terminal shape.

`generate.ts`'s fuzz vocabulary now includes `scan` (reusing the same
reducer `CallbackSpec`s as `reduce`) and `without` (a new `values` field on
`SerializedStep`, since it's the one boundary op whose bound argument is an
array rather than a callback or scalar). Verified via
`fuzz-correctness.test.ts` at 500 seeds (default) and
`STOPCOCK_FUZZ_COUNT=2000`: zero failures both runs, ~370/2000 and ~85/2000
seeds respectively exercising scan/without.

## 2026-07-21: proposed flatMap idiom change (NOT APPLIED)

W6's engine-spike report flagged `map -> flatMap -> filter -> filterMap ->
reduce` running at ~0.2x vs this emitter, traced tentatively to a loop-shape
mismatch: this emitter's flatMap fans out with an indexed for-loop, while
jit-chunk.ts's tier-1/2 flatMap (a W5 change, shared with Stream) uses
`for (const v of items)`. The working assumption was that the emitter being
"too fast" relative to jit-chunk's for-of was purely distorting the ratio,
and that unifying both to the same idiom, if the fuzz corpus stayed clean,
would fix the measurement.

Extending `fuzz-correctness.test.ts` to run every seeded pipeline through an
awaited `compileJit` (tier 1/2), not just interpret/pipe/emitter, found the
real story: jit-chunk.ts's `for (const v of items)` throws "Assignment to
constant variable" for any pipeline where a stage after flatMap in the same
segment reassigns `v` (map, filterMap, mapWhile, scan, a second flatMap).
The `const` binding from the for-of shadows the outer loop's `let v` and
cannot be written to. This reproduces on effectively every flatMap-then-map
shape in the fuzz corpus (see pinned-corpus.json entries added 2026-07-21),
not a narrow edge case.

This is a tier-1/2 correctness bug in production code
(`packages/fp/src/jit-chunk.ts:283`), not an emitter concern, and outside
this verification pass's mandate ("do not fix the engine, report them").
**The emitter is not being changed**: its indexed loop is correct, and
copying jit-chunk's `for (const v of items)` here would import the same bug
into the oracle rather than fix anything. The performance-ratio question
this entry was meant to resolve is moot until jit-chunk.ts's flatMap binding
is `let`, not `const` — once that lands, re-measure the outlier before
touching this file.

Proposed fix for whoever picks up the jit-chunk.ts bug: change
`for (const v of ${items})` to `for (let v of ${items})` in
`emitStageChain`'s `OP_FLAT_MAP` case (jit-chunk.ts:283). Re-run the fuzz
corpus at 2000 seeds after; if clean, re-measure the map->flatMap->filter->
filterMap->reduce outlier against this emitter to see whether the ~0.2x
ratio was in fact just the loop-shape distortion once the crash is gone, or
whether a residual gap remains.
