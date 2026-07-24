# Stopcock 2.0 S0 architecture and semantic contract

Status: approved by the canonical Stopcock 2.0 superplan and frozen by S0.

Authority:
`docs/superpowers/plans/2026-07-24-stopcock-v2-performance-density-superplan.md`.
This document records the S0 decision in an implementation-oriented form. It
does not replace or amend the canonical plan.

## Tier and claim boundary

| Tier              | Stable public entry                                                                          | 2.0 role                                                                        | Fallback and claim boundary                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Sequential root   | `@stopcock/fp`                                                                               | Tiny synchronous `pipe` and `flow`, plus narrow Option/Result values and guards | Always-correct sequential execution; no fusion claim                                             |
| Direct specialist | `@stopcock/fp/*`                                                                             | Direct data-first/data-last operations                                          | No planner, provenance lookup, cache, or fusion engine on a direct leaf                          |
| Compiler          | `@stopcock/fp-compiler`                                                                      | Build-time fused output and versioned receipts                                  | Unsupported sites preserve the tier selected by their original import                            |
| Compact fusion    | `@stopcock/fp/fusion`                                                                        | Explicit exact CSP-safe size-first fusion                                       | Complete generic exact fallback; no maximum-throughput claim unless the exact artifact proves it |
| Optimized fusion  | `@stopcock/fp/fusion/optimized`, or direct `@stopcock/fp-optimizer` only after accepted S10X | Explicit maximum portable throughput                                            | Complete generic exact fallback; claim is limited to qualified artifact/corpus/runtime evidence  |
| Fusion debug      | `@stopcock/fp/fusion/debug`                                                                  | Explanations, observed-run diagnostics, and statistics                          | Absent unless explicitly imported; selection is never rendered as execution                      |

Before S9, `@stopcock/fp/fusion` may exist only as a clearly labelled,
non-published compatibility alias to optimized fusion. It is not eligible for
compact size or performance claims in that state. Before the first RC it must
become the isolated compact runtime.

## Root migration map

Every current runtime and type export has one intentional 2.0 destination.
`packages/fp/src/__tests__/v2-contract-fixtures.mts` is the machine-checked
snapshot.

| Current root export                    | Kind       | 2.0 destination                                    |
| -------------------------------------- | ---------- | -------------------------------------------------- |
| `pipe`, `flow`                         | value      | retain at `@stopcock/fp`, with sequential behavior |
| `compile`, `compilePure`               | value      | `@stopcock/fp/fusion`                              |
| `explain`                              | value      | `@stopcock/fp/fusion/debug`                        |
| `dual`                                 | value      | `@stopcock/fp/dual`                                |
| `Runner`                               | type       | `@stopcock/fp/fusion`                              |
| `PipelineExplanation`, `PureRewrite`   | type       | `@stopcock/fp/fusion/debug`                        |
| `Fn`, `LazyValue`                      | type       | retain at `@stopcock/fp`                           |
| Option constructors, guards, and types | value/type | retain at `@stopcock/fp`                           |
| Result constructors, guards, and types | value/type | retain at `@stopcock/fp`                           |

`@stopcock/fp/compile` and `@stopcock/fp/dual` remain compatibility subpaths
for the documented window. S8 owns the atomic root cutover; S0 changes no
runtime export.

## Eager Array and lazy Iter `flatMap`

Eager `Array.flatMap` is an indexed Array contract:

- the callback contract returns an Array;
- the source length is snapshotted before the first callback;
- the returned Array length is snapshotted before its first indexed read;
- indices `0..length-1` are read in order, with holes observed as
  `undefined`;
- arbitrary callback-returned iterables are not consumed;
- callback count, value-only argument shape, getter order, thrown-error
  identity/timing, source mutation visibility, and result order are exact;
- the result is a fresh Array.

Lazy `Iter.flatMap` is deliberately different:

- the callback may return any iterable;
- it receives the value and its independent outer index;
- evaluation remains lazy; and
- early termination and thrown errors close the active nested iterator and
  source according to the iterator protocol.

### S0 surface status

The intended contract above is authoritative. The current surface status is
recorded so no implementation is silently promoted to oracle:

| Surface                               | S0 status                                                               |
| ------------------------------------- | ----------------------------------------------------------------------- |
| generated direct/data-last `array.ts` | conforms to the indexed contract                                        |
| `interpret.ts`                        | divergent: accepts arbitrary iterables and observes live Array lengths  |
| portable lowering/templates           | divergent: accepts arbitrary iterables; some paths observe live lengths |
| multi-step runtime `compile()`        | divergent through portable lowering                                     |
| `@stopcock/fp-compiler`               | conforms to indexed Array behavior for its current lowering             |
| `Iter.flatMap`                        | conforms to the separate lazy iterable contract                         |

`interpret.ts` is therefore not an approved Array-pipeline comparison oracle
at S0. Any affected later slice must use the independent fixtures and cannot
claim cross-tier equivalence until the divergence is removed. S0 deliberately
does not change production runtime behavior.

## Trusted operator provenance

The approved 2.0 design is a same-package private
`WeakMap<Function, TrustedOperatorMetadata>` (or an equivalently unforgeable
mechanism) populated only by generated internal factories.

- Public `_op`, `_fn`, `_a1`, and `_a2` fields remain compatibility and
  diagnostic data only.
- Public `dual(..., { op })` never registers caller-selected metadata.
- Planner and binding extraction use only private, call-local provenance.
- An unknown, forged, copied, reordered, deleted, or mutated public shape
  executes through the complete generic callable path.
- Mutating public fields on a trusted operator cannot alter its behavior or
  bindings.
- Duplicate package/module instances cannot exchange trust.
- Trust says only that the function and bindings came from an authenticated
  internal factory. It does not imply purity, exactness, speed, worker/SIMD/
  Wasm suitability, corpus verification, or release qualification.
- No public registrar or third-party operator SDK ships in 2.0.

S0 includes a non-gating full-valid-opcode characterization of the current
forgeable boundary. It demonstrates that the current planner accepts every
registered forged opcode and binding, but names that result as a vulnerability
rather than the desired 2.0 behavior. S5A owns the passing security gate and
migration note.

## Version and release boundary

- The selected base public inventory is the 20 packages named by the canonical
  plan.
- Private `@stopcock/synth` is aligned and compatibility-tested but never
  published.
- `2.0.0-next.0` is a local development cohort, not a published RC.
- S13 owns the first publishable unused `2.0.0-next.N`.
- S14 owns stable `2.0.0` alignment, acceptance, and publication.
- No registry write, dist-tag move, GitHub release mutation, RC acceptance, or
  stable publication is authorized by S0.
- Runtime claims are tier-, artifact-, corpus-, runtime-, and profile-specific.
  Peer results are characterization, never a release denominator.

The checked-in package-readiness inventory is a separate S0 artifact. A
blocked public package stops S0B; it is never waived, silently dropped, or
versioned into apparent readiness.
