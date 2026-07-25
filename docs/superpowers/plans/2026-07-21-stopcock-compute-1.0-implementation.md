# `@stopcock/compute` 1.0 implementation plan

## Outcome

Ship `@stopcock/compute@1.0.0` as Stopcock's instance-scoped numeric execution runtime. One closed, serializable rank-0–4 kernel program must execute with the same defined semantics through:

- the normative TypeScript interpreter;
- a generated-JavaScript CPU compiler with a CSP-safe interpreter fallback;
- an in-repository Rust/WASM backend with scalar and SIMD hot kernels;
- optional WebGPU lowering for supported `f32`, `i32`, and `u32` programs; and
- explicit browser or Node worker pools.

The package must also provide `@stopcock/compute/la`, an opt-in scoped adapter for the existing synchronous `@stopcock/la` accelerator seam. Importing Compute must never install a global runtime or accelerator.

The 1.0 package starts as `private: true`, version `0.0.0`. Remove `private` and add a major Changeset only after every mandatory CPU/WASM, worker, packaging, documentation, and benchmark gate in this plan passes. WebGPU availability is not a release prerequisite.

## Explicit exclusions

- No arbitrary JavaScript callback parsing, `Function#toString` analysis, or callback serialization.
- No automatic differentiation, optimizer, neural-network, dataframe, or general tensor framework.
- No sparse, ragged, complex, quantized, string, boolean-storage, or rank-greater-than-four tensors.
- No implicit global default runtime and no automatic LA installation.
- No persistent public GPU tensor/buffer abstraction in 1.0; public inputs and outputs are CPU typed-array views.
- No WebGPU `f64`, shared-memory worker protocol, distributed execution, or worker-hosted WebGPU.
- No promise that every program is faster off CPU. `auto` uses checked-in crossover profiles and records its choice.
- No end-to-end “zero-copy Img” claim in 1.0. Browser image decoding and the
  current `Uint8ClampedArray` Img representation require an explicit,
  measured staging/materialization boundary.
- No runtime dependency on `@stopcock/fp` and no public FP-to-Compute adapter in
  Compute 1.0. The cross-plan contract is readiness for a later independently
  packaged bridge.
- No dependency on or integration with the private `@stopcock/synth` package.

## Current repository seams

- `packages/la/src/accel.ts` owns a module-global `WasmAccelerator` with synchronous `dot`, `axpy`, `matmul`, `convolve1d`, byte color-matrix, and optional float color-matrix hooks. `Vec`, `Mat`, `Primitives`, `@stopcock/color`, and `@stopcock/img` already consult that registry.
- LA currently selects acceleration with hard-coded shape thresholds. Compute must replace those guesses only with benchmark-derived thresholds; it must not change the existing fallback implementations or operation results.
- `@stopcock/fp` already demonstrates closed opcode execution, generated JavaScript, CSP fallback, explain output, and bounded compile caching. Compute may reuse the architectural pattern but has no runtime dependency on FP and never parses user callback source.
- Packages are ESM-only, built with tsup plus declaration emission, marked `sideEffects: false`, covered by root Vitest/typecheck, and published through Changesets.
- Root `build:packages` and `test:packages` intentionally exclude only `@stopcock/synth`. Compute must join those commands without pulling synth back into CI.
- Apps/docs aliases workspace source directly. Compute's browser, worker, WASM, and WebGPU code must therefore stay behind explicit subpaths and must not touch browser globals at module evaluation time.

## Relationship to Stopcock semantic planning

Keep the logical-operator, numeric-program, and execution-runtime contracts
distinct:

| Concern | Owner |
|---|---|
| Collection operator semantics, callback count/order, cardinality, early exit, and materialization | FP's internal `OperatorSemanticV1` definitions |
| Source recognition, segmentation, capture safety, source maps, and compiler receipts | `@stopcock/fp-compiler` |
| FP-specialized loop selection | FP-derived `FusionRunnerDescriptorV1` |
| Closed numeric AST, dtype/rank rules, normalized numeric IR, and numeric semantics | Compute `KernelProgram` |
| CPU/WASM/WebGPU capability and execution lowering | Compute |
| Inline versus worker placement, copy/transfer, scratch, cancellation, and crash recovery | Compute |
| Combined human report | Check tooling composing FP receipts with Compute plans/reports without flattening their authority |

FP's internal, definition-only `defineOperatorV1` describes a logical
operation. `defineKernel` creates the only closed executable program accepted by
Compute. Neither an FP semantic definition nor a fusion-runner descriptor is
executable Compute input. Private operator provenance, callback functions,
mutable bindings, and runtime registrars never cross a Compute or worker
boundary.

A future optional compiler adapter may authenticate a closed, callback-free
segment, lower it into a versioned `KernelProgram`, and then discard private
provenance. Compute independently decodes and validates that program exactly as
it validates any untrusted caller/deserialized program. The adapter may not
generate a second worker queue, message protocol, transfer implementation,
cancellation policy, retry policy, or backend selector.

Every compile/run request carries:

```ts
export type ApproximationClass =
  | 'reassociation'
  | 'fma-contraction'
  | 'transcendental-implementation'

export interface ApproximationDomainV1 {
  readonly format: 'stopcock.compute.approximation-domain'
  readonly version: 1
  readonly id: string
  readonly contentHash: string
  readonly predicateProgramHash: string
}

export type ApproximationToleranceBoundV1 =
  | { readonly kind: 'ulps'; readonly maxUlps: number }
  | {
      readonly kind: 'absolute-relative'
      readonly absolute: number
      readonly relative: number
    }

export interface ApproximationToleranceV1 {
  readonly semanticOp: string
  readonly dtype: 'f32' | 'f64'
  readonly approximationClass: ApproximationClass
  readonly tolerance: ApproximationToleranceBoundV1
  readonly admittedDomainId: string
  readonly admittedDomainHash: string
  readonly evidenceId: string
  readonly evidenceHash: string
}

export type NumericPolicy =
  | { readonly version: 1; readonly mode: 'exact' }
  | {
      readonly version: 1
      readonly mode: 'approximate'
      readonly allow: readonly ApproximationClass[]
      readonly tolerances: readonly ApproximationToleranceV1[]
    }
```

`{ version: 1, mode: 'exact' }` is the default. Under it, backend matching
rejects any implementation that changes the interpreter's operation order or
per-node rounding. Approximate mode is closed and granular: every admitted
node/backend disposition names its required approximation class, and every
operation/dtype/domain has an explicit tolerance plus independently retained
content-addressed evidence. Missing, duplicate, irrelevant, or unproved
permissions fail closed. The canonical policy and its hash are recorded in the
plan, report, cache key, and crossover evidence. An FP-originated adapter
defaults to exact and must forward an explicit structured policy to authorize
anything else.

Source spans and FP receipts remain compiler-owned sidecars. Compute reports
program/node/segment identities and stable runtime reason codes. Combined
`stopcock check` output nests these artifacts and joins them by semantic,
program, plan, and artifact hashes; it does not relabel a static compiler
decision as an observed Compute execution.

This plan is sequenced after the coordinated Stopcock 2.0 stable promotion and
the S14 transition from the dynamic train-wide cohort check to frozen-manifest
replay in `2026-07-24-stopcock-v2-performance-density-superplan.md`. Creating
the private `packages/compute@0.0.0` workspace before both conditions would
contradict the dynamic `packages/*` cohort rule unless the 2.0
inventory/version policy is explicitly amended first.

## Package and entrypoint contract

Create `packages/compute` with no required runtime dependencies. Stage 8
publishes the additive LA seam as `@stopcock/la@2.1.0` after the coordinated
2.0 train; declare `@stopcock/la: ^2.1.0` as an optional peer dependency for
the `/la` adapter and the exact workspace LA version as a development
dependency for adapter tests. Compute 1.0 cannot publish before that LA minor is
registry-visible and its packed API/behavior gates pass.

Public exports:

| Entrypoint | Responsibility |
|---|---|
| `@stopcock/compute` | Tensor views, closed AST builders, validation, `runSync`, `compileSync`, `createComputeRuntime`, shared types and errors |
| `@stopcock/compute/cpu` | Explicit interpreter/JIT controls, compiler statistics, cache controls, CPU capability inspection |
| `@stopcock/compute/wasm` | WASM capability probe, explicit WASM backend construction, artifact metadata |
| `@stopcock/compute/webgpu` | WebGPU backend construction and capability inspection; this is the only entrypoint that types against WebGPU globals |
| `@stopcock/compute/worker/browser` | Browser module-worker pool and browser worker factory |
| `@stopcock/compute/worker/node` | `node:worker_threads` pool and Node worker factory |
| `@stopcock/compute/la` | Scoped synchronous LA adapter installation |

All entrypoints are ESM and side-effect-free. The root may lazily `import()` internal backends only after a runtime method requests them; it must not statically include the WASM blob, Node built-ins, worker bootstrap, or WebGPU code in a CPU-only bundle.

## Public tensor and AST types

### Tensor views

```ts
export type DType = 'f32' | 'f64' | 'i32' | 'u32'
export type Rank = 0 | 1 | 2 | 3 | 4

export type TypedData<D extends DType> =
  D extends 'f32' ? Float32Array :
  D extends 'f64' ? Float64Array :
  D extends 'i32' ? Int32Array :
  Uint32Array

export interface TensorView<D extends DType = DType, R extends Rank = Rank> {
  readonly dtype: D
  readonly data: TypedData<D>
  readonly shape: ReadonlyArray<number> & { readonly length: R }
  readonly strides: ReadonlyArray<number> & { readonly length: R }
  readonly offset: number
}

export function tensorView<D extends DType, R extends Rank>(
  dtype: D,
  data: TypedData<D>,
  shape: ReadonlyArray<number> & { readonly length: R },
  options?: {
    readonly offset?: number
    readonly strides?: ReadonlyArray<number> & { readonly length: R }
  },
): TensorView<D, R>

export function scalar<D extends DType>(
  dtype: D,
  data: TypedData<D>,
  offset?: number,
): TensorView<D, 0>

export function contiguous<D extends DType, R extends Rank>(view: TensorView<D, R>): boolean
export function broadcastTo<D extends DType, R extends Rank>(
  view: TensorView<D>,
  shape: ReadonlyArray<number> & { readonly length: R },
): TensorView<D, R>
```

Semantics:

- Shape dimensions are finite non-negative safe integers. Rank zero uses `shape: []`, `strides: []`, and addresses one element at `offset`.
- Public strides are non-negative safe integers. Zero strides represent broadcast axes. Negative-stride/reversed views are outside 1.0.
- Missing strides are canonical row-major strides. Zero-sized dimensions are valid and make the view empty.
- Validation computes the greatest reachable element index without integer overflow and rejects views that can address outside `data`.
- `broadcastTo` follows trailing-axis NumPy rules: dimensions must be equal or the source dimension must be one; prepended and expanded axes receive stride zero.
- Outputs are never broadcast views. A caller-owned output must have the exact inferred shape and dtype, enough capacity, and writable non-zero strides for every dimension with size greater than one.

### Ownership and transfer capabilities

Ordinary `TensorView` values are borrowed. They are always accepted for
same-thread execution and worker-copy execution, but a string option never makes
one transferable.

Expose an opaque affine ownership surface:

```ts
declare const ownedTensorBrand: unique symbol
declare const transferBatchBrand: unique symbol

export interface OwnedTensorView<
  D extends DType = DType,
  R extends Rank = Rank,
> extends TensorView<D, R> {
  readonly [ownedTensorBrand]: true
}

export interface TransferBatch {
  readonly [transferBatchBrand]: true
}

export function allocateOwnedTensor<D extends DType, R extends Rank>(
  dtype: D,
  shape: ReadonlyArray<number> & { readonly length: R },
): OwnedTensorView<D, R>

export function copyOwnedTensor<D extends DType, R extends Rank>(
  view: TensorView<D, R>,
): OwnedTensorView<D, R>

export function unsafeClaimOwnedTensor<D extends DType, R extends Rank>(
  view: TensorView<D, R>,
): OwnedTensorView<D, R>

export function moveInputs(
  inputs: Readonly<Record<string, OwnedTensorView>>,
): TransferBatch

export function releaseTransferBatch(batch: TransferBatch): void
```

`allocateOwnedTensor` and `copyOwnedTensor` are safe by construction.
`unsafeClaimOwnedTensor` performs every structural/runtime check but its name and
documentation state the unavoidable JavaScript precondition: the caller asserts
that no external alias is expected to remain usable after transfer. A TypeScript
brand is an explicit ownership claim, not proof that aliases do not exist.

Ownership is runtime typestate tracked by underlying `ArrayBuffer` identity:

```text
buffer group: live → reserved(transferBatchId) → consumed
                 └── release-before-commit ──→ live
batch:        open → submitted(taskId) → terminal(released | consumed)
```

All views and leases sharing one buffer form one ownership group.
`moveInputs` synchronously and atomically reserves every referenced group. A
second batch, run, borrow, mutation through a Compute API, or output alias using
one of those groups rejects with `OwnershipReservedError`. If any group cannot
be reserved, none are.

`releaseTransferBatch` transitions `open → terminal(released)`, makes all
still-attached groups live again, and is a no-op when repeated on that released
batch. It rejects a submitted or consumed batch.
`runMoved` synchronously and atomically claims `open → submitted(taskId)` before
validation or enqueue; a caller release or second submission after that point
rejects with `TransferBatchSubmittedError`. Queued cancellation, queue
rejection, validation failure, worker unavailability, or pool disposal before
dispatch performs the release automatically. A released batch cannot be
submitted; callers retain their original owned views.

Once a batch reaches its successful dispatch commit point, every lease in its
groups becomes consumed; later Compute use rejects with
`OwnershipConsumedError`. JavaScript aliases observe the platform's normal
detached-buffer behavior and cannot be restored.

`moveInputs` is opaque and single-use. It rejects duplicate input names,
detached/resizable/shared buffers, partial backing views, mixed
owned/borrowed groups, inconsistent leases, and uncertain byte ranges. A
transfer list contains each accepted buffer exactly once even when several
input bindings intentionally share it. Transfer mode forbids caller-owned
output and returns a newly owned output lease.

### Closed program format

The builder callback runs once against symbolic `Expr` handles. Its source is never retained or inspected. Finalization emits a plain-data, immutable `KernelProgram` suitable for structured clone and versioned persistence.

```ts
export interface InputSpec<D extends DType = DType, R extends Rank = Rank> {
  readonly dtype: D
  readonly rank: R
}

export interface Expr<D extends DType = DType, R extends Rank = Rank> {
  readonly dtype: D
  readonly rank: R
  readonly node: number
  /** @internal */ readonly program: unique symbol
}

export type ElementwiseOp =
  | 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'neg' | 'abs'
  | 'min' | 'max' | 'clamp' | 'fma' | 'pow'
  | 'sqrt' | 'rsqrt' | 'exp' | 'expm1' | 'log' | 'log1p'
  | 'sin' | 'cos' | 'tan' | 'tanh' | 'floor' | 'ceil' | 'round'
  | 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'select'
  | 'bitAnd' | 'bitOr' | 'bitXor' | 'shiftLeft' | 'shiftRight'
  | 'popcount'

export type BoundaryMode = 'zero' | 'clamp' | 'reflect'

export type KernelNode =
  | {
      readonly kind: 'input'
      readonly name: string
      readonly dtype: DType
      readonly rank: Rank
    }
  | {
      readonly kind: 'literal'
      readonly dtype: DType
      /** Canonical IEEE/integer bits, not a JSON number. */
      readonly bits: string
    }
  | {
      readonly kind: 'elementwise'
      readonly op: ElementwiseOp
      readonly args: readonly number[]
      readonly dtype: DType
      readonly rank: Rank
    }
  | {
      readonly kind: 'cast'
      readonly input: number
      readonly dtype: DType
      readonly rank: Rank
    }
  | {
      readonly kind: 'domain-index' | 'domain-size'
      readonly axis: number
    }
  | {
      readonly kind: 'reduction'
      readonly op: 'sum' | 'product' | 'min' | 'max' | 'mean'
      readonly input: number
      readonly axes: readonly number[]
      readonly keepDims: boolean
      readonly dtype: DType
      readonly rank: Rank
    }
  | {
      readonly kind: 'dot' | 'matmul'
      readonly left: number
      readonly right: number
      readonly dtype: DType
      readonly rank: Rank
    }
  | {
      readonly kind: 'stencil'
      readonly dimensions: 1 | 2
      readonly input: number
      readonly offsets: readonly (readonly number[])[]
      readonly coefficientBits: readonly string[]
      readonly boundary: BoundaryMode
      readonly dtype: DType
      readonly rank: Rank
    }
  | {
      readonly kind: 'convolution'
      readonly dimensions: 1 | 2
      readonly input: number
      readonly kernel: number
      readonly stride: readonly number[]
      readonly dilation: readonly number[]
      readonly padding: 'valid' | 'same'
      readonly boundary: BoundaryMode
      readonly dtype: DType
      readonly rank: Rank
    }

export interface KernelProgram<
  D extends DType = DType,
  R extends Rank = Rank,
> {
  readonly format: 'stopcock.compute.kernel'
  readonly version: 1
  readonly semantics: 'stopcock.compute.numeric.v1'
  readonly inputs: Readonly<Record<string, InputSpec>>
  readonly nodes: readonly KernelNode[]
  readonly output: number
  readonly outputDtype: D
  readonly outputRank: R
  readonly domain?: OutputDomain<R>
}

export type DomainExtent =
  | { readonly kind: 'fixed'; readonly size: number }
  | { readonly kind: 'input-axis'; readonly input: string; readonly axis: number }

export interface OutputDomain<R extends Rank = Rank> {
  readonly rank: R
  readonly shape: ReadonlyArray<DomainExtent> & { readonly length: R }
}

export function input<D extends DType, R extends Rank>(dtype: D, rank: R): InputSpec<D, R>

export function defineKernel<
  I extends Readonly<Record<string, InputSpec>>,
  D extends DType,
  R extends Rank,
>(
  inputs: I,
  build: (inputs: ExprInputs<I>) => Expr<D, R>,
): KernelProgram<D, R>

export interface DomainContext<R extends Rank> {
  index(axis: number): Expr<'u32', 0>
  size(axis: number): Expr<'u32', 0>
}

export function defineDomainKernel<
  I extends Readonly<Record<string, InputSpec>>,
  D extends DType,
  R extends Rank,
>(
  inputs: I,
  domain: OutputDomain<R>,
  build: (inputs: ExprInputs<I>, domain: DomainContext<R>) => Expr<D, 0>,
): KernelProgram<D, R>

export function encodeKernel(program: KernelProgram): Uint8Array
export function decodeKernel(value: unknown): KernelProgram
```

Node IDs are dense topological indices. Input names are non-empty, unique strings and are data keys only, never generated-code identifiers. `KernelProgram` is deeply frozen when built; all compilers revalidate externally supplied or deserialized programs instead of trusting the TypeScript type.

`KernelProgram` is the only executable payload accepted by a Compute worker. Its
wire form contains only null-prototype records, arrays, validated scalar
literals, and closed node discriminants. It contains no functions, accessors,
symbols, class instances, package-private provenance, typed-array views, or
extension bags.

Export canonical `encodeKernel` and `decodeKernel` boundaries.
`decodeKernel(value: unknown)` copies own data properties, rejects unknown
fields and node kinds, and enforces node/input/depth/literal limits before any
large allocation. It never trusts a TypeScript cast or compiler-produced
payload. Canonical bytes preserve `-0` and every explicitly supported
non-finite literal. `programHash` covers the format version, Compute compiler
numeric-semantics identity, and canonical program bytes. Numeric policy and
compiler implementation version belong to the plan/cache identity, not the
program identity. Optional source and debug metadata is a separate sidecar and
never changes program identity or cache keys.

`defineKernel` infers its output shape from broadcasting, reductions, matmul, stencil, or convolution. `defineDomainKernel` evaluates one scalar expression at every coordinate in an explicit rank-0–4 output domain. A fixed extent is a non-negative safe integer; an input-axis extent resolves from the named bound tensor during shape planning. `index(axis)` and `size(axis)` are legal only inside the domain builder, and their axes are validated when constructing the program. This is the procedural-output seam used by Procgen to generate grids and volumes without allocating coordinate tensors; ordinary Table and Vision kernels continue to use input-derived shapes.

### Expression set

Export symbolic builders as named functions and through a `K` namespace from the root:

- Arithmetic: `add`, `sub`, `mul`, `div`, `mod`, `neg`, `abs`, `min`, `max`, `clamp`, `fma`, `pow`.
- Scalar math: `sqrt`, `rsqrt`, `exp`, `expm1`, `log`, `log1p`, `sin`, `cos`, `tan`, `tanh`, `floor`, `ceil`, `round`.
- Comparisons and selection: `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `select`.
- Integer operations: `bitAnd`, `bitOr`, `bitXor`, `shiftLeft`, `shiftRight`, and `popcount`.
- Casts: `cast(expr, dtype)` among all four 1.0 dtypes.
- Domain coordinates: `index(axis)` and `size(axis)` as `u32` scalar nodes emitted only by `defineDomainKernel`.
- Reductions: `sum`, `product`, `reduceMin`, `reduceMax`, `mean`, each with `axes?: number | readonly number[] | 'all'` and `keepDims?: boolean`.
- Structured kernels: `dot` for rank-one inputs, `matmul` for rank-two inputs, `stencil1d`, `stencil2d`, `convolve1d`, and `convolve2d`.

Binary elementwise builders apply trailing-axis broadcasting. Both operands must have the same dtype; a numeric literal is converted to the other operand's dtype. Mixed typed expressions require an explicit `cast`. Comparisons return `u32` masks containing exactly zero or one. `select` requires a `u32` mask and same-dtype branches.

Reduction axes are normalized, unique, and in range. `mean` accepts only floating dtypes. Empty `sum` is zero and empty `product` is one; empty `mean`, minimum, and maximum throw `EmptyReductionError`.

`stencil1d` and `stencil2d` accept a literal list of fixed offsets and coefficients plus `boundary: 'zero' | 'clamp' | 'reflect'`; they perform a weighted sum only. Convolution accepts rank-one or rank-two signal and kernel expressions with literal positive integer stride and dilation plus `padding: 'valid' | 'same'` and the same boundary modes. Batched/channel convolution is outside 1.0.

The three planned domain integrations are represented without private runtime hooks:

- Table lowers each compatible rank-one value or SQL-validity expression to an ordinary single-output kernel and invokes the public runtime once per output. Callback and unsupported logical-type segments stay on Table's CPU engine.
- Vision expresses blur/gradient/morphology/warp and descriptor-distance work through elementwise, stencil, convolution, reduction, and matrix primitives. Algorithms needing data-dependent topology remain on its CPU reference path.
- Procgen uses `defineDomainKernel` plus index/size, integer hashing, casts, floor, arithmetic, and scalar math to sample 2D grids and 3D volumes without coordinate arrays. Fixed noise neighbourhoods are unrolled into the closed AST; oversized or unsupported fields follow runtime fallback rather than introducing a callback opcode.

### Normative numeric semantics

- The TypeScript interpreter defines correctness for all backends.
- `f32` rounds with `Math.fround` after every AST node, not only when storing output. `f64` follows JavaScript/IEEE-754 double semantics.
- Integer arithmetic is two's-complement 32-bit after every node. Signed multiplication uses `Math.imul`; unsigned results are coerced with `>>> 0`. Integer division truncates toward zero. Division or modulo by zero throws `IntegerDivideByZeroError` before output mutation.
- `popcount` accepts `i32` or `u32`, counts the underlying 32 bits, and returns an exact `u32` in `[0, 32]` on every backend.
- Float division/domain errors propagate IEEE `NaN` or infinity. Comparisons with `NaN` follow JavaScript/IEEE behavior.
- CPU and scalar WASM reductions traverse logical row-major index order.
  `{ version: 1, mode: 'exact' }` excludes any SIMD/WGSL implementation that
  reassociates floating reductions. A tree/vector/subgroup reduction requires
  an explicit `reassociation` permission and a matching
  operation/dtype/domain tolerance. Integer results remain exact under every
  policy.

Freeze an operation-by-operation semantic table before implementing a
non-interpreter backend:

| Node family | Exact semantics | Backend consequence |
|---|---|---|
| `f32` arithmetic | Apply `Math.fround` to each input conversion and each node result; preserve IEEE NaN, infinities, and signed zero | Disable contraction/reassociation or emulate; otherwise capability miss |
| `f64` arithmetic | JavaScript Number/IEEE-754 observable result on the qualified runtime | WebGPU unsupported; WASM must prove bit parity or call the same host semantic helper |
| `min` / `max` / `clamp` | Match `Math.min`/`Math.max`, including NaN propagation and `min(+0,-0) = -0`, `max(+0,-0) = +0` | WGSL/WASM native ops require signed-zero/NaN fixups or are ineligible |
| `fma` | Despite the name, exact mode is non-contracted multiply then add with the dtype's node rounding after each operation | Hardware fused FMA is allowed only under an explicitly qualified approximate policy |
| `floor` / `ceil` / `round` | Match JavaScript, including `Math.round` ties toward positive infinity and negative-zero results | Backends with ties-to-even/away rounding emulate or miss |
| `pow` and transcendental nodes | Match the qualified JavaScript `Math.*` implementation in exact mode | CPU/JIT may use the same host intrinsics; WASM/WGSL are approximate-only unless bit parity is proved for the admitted domain/runtime |
| float comparison / `select` | Match JavaScript comparison with NaN; `select` evaluates closed operands according to normalized-IR rules and returns mask values exactly `0` or `1` | No backend-specific unordered comparison shortcut may change results |
| integer add/sub/neg/mul | Coerce after each node to two's-complement `i32` or modulo-`2^32` `u32`; signed multiply uses `Math.imul` | Native wrapping integer operations are eligible after edge corpus passes |
| integer div/mod | Truncate toward zero; zero divisor throws; `i32 MIN / -1` wraps to `i32 MIN` and corresponding remainder is zero | Trap-prone backends precheck/emulate; raw trap is never the user-visible semantic |
| shifts/bitwise/popcount | Mask shift count with `& 31`; `i32` right shift is arithmetic, `u32` right shift logical; popcount observes the underlying 32 bits and returns `u32` | Backend opcode admitted only when signedness/count semantics match |
| casts | `f32` uses `Math.fround`; float→`i32`/`u32` uses defined JS `ToInt32`/`ToUint32` modulo semantics including NaN/infinity→zero; integer→float performs numeric conversion then dtype rounding | WGSL/WASM out-of-range or saturating conversions must be emulated or rejected |
| reductions | Exact mode visits logical row-major order with the table's per-node rounding/error rules | Trees, vector reassociation, and subgroup reductions are approximate-policy only |

Every normalized node/backend pair has one generated disposition:
`exact-native`, `exact-emulated`, `approximate-only`, or `unsupported`, plus a
stable reason code and corpus ID. Every `approximate-only` row additionally
names one or more required `ApproximationClass` values. The matcher admits it
only when all classes and an operation/dtype/domain-specific tolerance are
present in the canonical policy and the evidence hash is current.
`reassociation` does not authorize contracted FMA or alternate
transcendentals; those require `fma-contraction` and
`transcendental-implementation` respectively. No approximate policy can change
casts, errors, NaN/signed-zero behavior, comparisons, or integer results.

Numeric-policy canonicalization sorts allowed classes and tolerance rows by
semantic operation, dtype, class, and admitted domain; rejects duplicates,
unknown operations/domains, empty approximate policies, and non-finite or
negative tolerances; requires the `allow` set to equal exactly the classes
represented by its tolerance rows; requires an ULP maximum to be a non-negative
safe integer; and requires absolute/relative bounds to be non-negative finite
numbers. A row selects exactly one comparison rule: ULP distance must be at
most `maxUlps`, or absolute error must be at most
`absolute + relative * max(abs(actual), abs(reference))`. Every output covered
by the row must pass that rule.

The generated backend artifact contains a versioned, content-addressed
`ApproximationDomainV1` registry. Each domain ID/hash resolves to one closed
preflight program; arbitrary caller predicates are forbidden.
`numericPolicyHash` covers the canonical policy plus the domain and evidence
hashes. Every public boundary copies and deeply freezes it, so caller mutation
cannot change a compiled handle, plan, cache key, worker message, or evidence
join. An admitted domain is an executable constraint, not prose: the planner
must prove it from closed program/binding metadata or run the named preflight
against the relevant operands/intermediates before caller-visible mutation.
Unknown/stale domain or evidence hashes and failed/unavailable preflight make
that approximate implementation a capability miss.

Potentially throwing data-dependent nodes require one of two plans before
caller-visible mutation: a preflight fault scan, or execution into
backend-owned staging followed by commit. This includes integer divide/modulo
by zero and any future checked node. Caller-owned or aliased output is never
partially changed before the error is surfaced; an implementation may not rely
on catching a WASM trap after writes have begun.

## Synchronous CPU API

```ts
export type CpuMode = 'auto' | 'jit' | 'interpreter'

export interface RunBindings {
  readonly inputs: Readonly<Record<string, TensorView>>
  readonly output?: TensorView
}

export interface ExecutionReport {
  readonly format: 'stopcock.compute.execution-report'
  readonly version: 1
  readonly programHash: string
  readonly planHash: string
  readonly compilerSemanticVersion: string
  readonly artifactHash: string
  readonly numericPolicy: NumericPolicy
  readonly numericPolicyHash: string
  readonly fallbackPolicy: FallbackPolicy
  readonly requestedBackend: Backend
  readonly selectedBackend: Exclude<Backend, 'auto'>
  readonly implementationId: string
  readonly runtimeId: string
  readonly featureHash: string
  readonly appliedApproximationClasses: readonly ApproximationClass[]
  readonly admittedDomainHashes: readonly string[]
  readonly toleranceEvidenceIds: readonly string[]
  readonly toleranceEvidenceHashes: readonly string[]
  readonly placement: 'inline' | 'worker'
  readonly ownership: 'borrowed' | 'copy' | 'transfer'
  readonly fallbackCode?: string
  readonly fallbackDetail?: string
  readonly executedSegmentIds: readonly string[]
  readonly decisionReasonCodes: readonly string[]
  readonly profileId: string
  readonly profileHash: string
  readonly sourceMapId?: string
  readonly cacheHit: boolean
  readonly compileMs: number
  readonly executeMs: number
  readonly transferMs: number
  readonly bytesRead: number
  readonly bytesWritten: number
  readonly plannedTemporaryBytes: number
  readonly peakTemporaryBytes: number
  readonly retainedScratchBytes: number
  readonly worker?: number
  readonly workerEpoch?: number
  readonly retryCount: number
}

export interface ExecutionResult<D extends DType = DType, R extends Rank = Rank> {
  readonly output: TensorView<D, R>
  readonly report: ExecutionReport
}

export interface MovedExecutionResult<
  D extends DType = DType,
  R extends Rank = Rank,
> extends ExecutionResult<D, R> {
  readonly output: OwnedTensorView<D, R>
}

export interface CpuCompileOptions {
  readonly mode?: CpuMode
  readonly numericPolicy?: NumericPolicy
}

export interface CpuCompiledKernel<
  D extends DType = DType,
  R extends Rank = Rank,
> {
  readonly program: KernelProgram<D, R>
  readonly hash: string
  runSync(bindings: RunBindings): ExecutionResult<D, R>
  explain(bindings: RunBindings): ExecutionPlan
}

export function compileSync<D extends DType, R extends Rank>(
  program: KernelProgram<D, R>,
  options?: CpuCompileOptions,
): CpuCompiledKernel<D, R>

export function runSync<D extends DType, R extends Rank>(
  program: KernelProgram<D, R>,
  bindings: RunBindings,
  options?: CpuCompileOptions,
): ExecutionResult<D, R>
```

`auto` uses generated JavaScript only when a one-time CSP probe succeeds. `jit` throws `JitUnavailableError` when code generation is blocked; `interpreter` never invokes `new Function`. Generated source can contain only compiler-owned local names, checked numeric literals, and code templates selected from the closed node set.

The compiler performs validation, dtype/rank inference, broadcast/stride planning, constant folding, dead-node elimination, common-subexpression reuse by node ID, in-place eligibility analysis, and loop fusion. It does not reorder floating expressions across AST nodes.

Compiled CPU plans live in a 128-entry LRU keyed by canonical program bytes,
CPU mode, canonical numeric-policy hash, and compiler semantic version. Export
`getCpuCompilerStats`, `resetCpuCompilerStats`, and `clearCpuCompilerCache` from
`/cpu`. No cache entry retains user buffers.

## `ComputeRuntime`

```ts
export type Backend = 'auto' | 'cpu' | 'wasm' | 'webgpu'
export type WorkerBackend = 'auto' | 'cpu' | 'wasm'
export type FallbackPolicy = 'allow' | 'error'
export type Placement = 'auto' | 'inline' | 'worker'

export interface KernelSourceSpan {
  readonly sourceId: string
  readonly line: number
  readonly column: number
}

export interface KernelSourceMap {
  readonly format: 'stopcock.compute.source-map'
  readonly version: 1
  readonly id: string
  readonly programHash: string
  readonly origin: KernelSourceSpan
  readonly nodes: Readonly<Record<number, KernelSourceSpan>>
  readonly segments: Readonly<Record<string, KernelSourceSpan>>
}

export interface ComputeDiagnostics {
  readonly sourceMap?: KernelSourceMap
}

export interface ComputeRuntimeOptions {
  readonly backend?: Backend
  readonly fallback?: FallbackPolicy
  readonly numericPolicy?: NumericPolicy
  readonly workers?: false | WorkerPool | {
    readonly pool: WorkerPool
    readonly minElements?: number
  }
  readonly profile?: CrossoverProfile
}

export interface CompileOptions {
  readonly backend?: Backend
  readonly fallback?: FallbackPolicy
  readonly numericPolicy?: NumericPolicy
}

export interface InlineRunOptions extends CompileOptions {
  readonly output?: TensorView
  readonly signal?: AbortSignal
  readonly placement?: 'auto' | 'inline'
  readonly diagnostics?: ComputeDiagnostics
  readonly ownershipIntent?: never
}

export interface WorkerPlacedRunOptions {
  readonly backend?: WorkerBackend
  readonly fallback?: FallbackPolicy
  readonly numericPolicy?: NumericPolicy
  readonly output?: TensorView
  readonly signal?: AbortSignal
  readonly placement: 'worker'
  readonly diagnostics?: ComputeDiagnostics
  readonly ownershipIntent?: never
}

export type RunOptions = InlineRunOptions | WorkerPlacedRunOptions

export interface MoveRunOptions {
  readonly backend?: WorkerBackend
  readonly fallback?: FallbackPolicy
  readonly numericPolicy?: NumericPolicy
  readonly signal?: AbortSignal
  readonly placement?: 'worker'
  readonly diagnostics?: ComputeDiagnostics
  readonly output?: never
  readonly ownershipIntent?: never
}

export interface TransferExplainOptions {
  readonly backend?: WorkerBackend
  readonly fallback?: FallbackPolicy
  readonly numericPolicy?: NumericPolicy
  readonly signal?: AbortSignal
  readonly placement: 'worker'
  readonly diagnostics?: ComputeDiagnostics
  readonly output?: never
  readonly ownershipIntent: 'transfer'
}

export type ExplainOptions = RunOptions | TransferExplainOptions

export interface CompiledExecutionOptions {
  readonly output?: TensorView
  readonly signal?: AbortSignal
  readonly placement?: Placement
  readonly diagnostics?: ComputeDiagnostics
  readonly backend?: never
  readonly fallback?: never
  readonly numericPolicy?: never
  readonly ownershipIntent?: never
}

export interface ComputeCapabilities {
  readonly format: 'stopcock.compute.capabilities'
  readonly version: 1
  readonly runtimeId: string
  readonly compilerSemanticVersion: string
  readonly backends: Readonly<Record<
    Exclude<Backend, 'auto'>,
    {
      readonly available: boolean
      readonly featureHash: string
      readonly reasonCode?: string
    }
  >>
}

export interface CrossoverProfile {
  readonly format: 'stopcock.compute.crossover-profile'
  readonly version: 1
  readonly id: string
  readonly contentHash: string
  readonly benchmarkArtifactHash: string
  readonly environmentClass: string
  readonly entries: readonly {
    readonly planFamily: string
    readonly dtype: DType
    readonly layout: 'contiguous' | 'strided' | 'broadcast'
    readonly backend: Exclude<Backend, 'auto'>
    readonly implementationId: string
    readonly featureHash: string
    readonly numericPolicy: NumericPolicy
    readonly numericPolicyHash: string
    readonly placement: 'inline' | 'worker'
    readonly ownership: 'borrowed' | 'copy' | 'transfer'
    readonly minimumWork: number
    readonly evidenceId: string
    readonly evidenceHash: string
  }[]
}

export interface ExecutionPlan {
  readonly format: 'stopcock.compute.execution-plan'
  readonly version: 1
  readonly programHash: string
  readonly planHash: string
  readonly compilerSemanticVersion: string
  readonly numericPolicy: NumericPolicy
  readonly numericPolicyHash: string
  readonly fallbackPolicy: FallbackPolicy
  readonly requestedBackend: Backend
  readonly plannedBackend: Exclude<Backend, 'auto'>
  readonly plannedImplementationId: string
  readonly runtimeId: string
  readonly featureHash: string
  readonly allowedExecutors: readonly {
    readonly backend: Exclude<Backend, 'auto'>
    readonly implementationId: string
    readonly featureHash: string
    readonly disposition: 'primary' | 'fallback'
    readonly reasonCode: string
    readonly requiredApproximationClasses: readonly ApproximationClass[]
    readonly admittedDomainHashes: readonly string[]
    readonly toleranceEvidenceIds: readonly string[]
    readonly toleranceEvidenceHashes: readonly string[]
  }[]
  readonly plannedPlacement: 'inline' | 'worker'
  readonly ownershipIntent: 'borrowed' | 'copy' | 'transfer'
  readonly normalizedNodeIds: readonly number[]
  readonly segmentIds: readonly string[]
  readonly inferredShape: readonly number[]
  readonly plannedResultBytes: number
  readonly plannedTemporaryBytes: number
  readonly aliasDecisionCodes: readonly string[]
  readonly capabilityReasonCodes: readonly string[]
  readonly profileId: string
  readonly profileHash: string
  readonly evidenceIds: readonly string[]
  readonly evidenceHashes: readonly string[]
  readonly sourceMapId?: string
}

export interface CompiledKernel<
  D extends DType = DType,
  R extends Rank = Rank,
> {
  readonly program: KernelProgram<D, R>
  readonly compileOptions: Readonly<Required<CompileOptions>>
  readonly hash: string
  run(
    inputs: Readonly<Record<string, TensorView>>,
    options?: CompiledExecutionOptions,
  ): Promise<ExecutionResult<D, R>>
  explain(
    inputs: Readonly<Record<string, TensorView>>,
    options?: CompiledExecutionOptions,
  ): Promise<ExecutionPlan>
  dispose(): Promise<void>
}

export interface ComputeRuntime {
  readonly options: Readonly<ComputeRuntimeOptions>
  capabilities(): Promise<ComputeCapabilities>
  compile<D extends DType, R extends Rank>(
    program: KernelProgram<D, R>,
    options?: CompileOptions,
  ): Promise<CompiledKernel<D, R>>
  run<D extends DType, R extends Rank>(
    program: KernelProgram<D, R>,
    inputs: Readonly<Record<string, TensorView>>,
    options?: RunOptions,
  ): Promise<ExecutionResult<D, R>>
  runMoved<D extends DType, R extends Rank>(
    program: KernelProgram<D, R>,
    inputs: TransferBatch,
    options?: MoveRunOptions,
  ): Promise<MovedExecutionResult<D, R>>
  explain(
    program: KernelProgram,
    inputs: Readonly<Record<string, TensorView>>,
    options?: RunOptions,
  ): Promise<ExecutionPlan>
  explain(
    program: KernelProgram,
    inputs: Readonly<Record<string, OwnedTensorView>>,
    options: TransferExplainOptions,
  ): Promise<ExecutionPlan>
  dispose(): Promise<void>
}

export function createComputeRuntime(options?: ComputeRuntimeOptions): ComputeRuntime
```

The factory is synchronous and lazy. Backend initialization happens on first `capabilities`, `compile`, or `run`. `dispose` is asynchronous and idempotent; every later operation rejects with `RuntimeDisposedError`.

Direct `run` and `explain` share the same discriminated request domain.
`placement: 'worker'` accepts only `WorkerBackend`; a WebGPU worker request
cannot type-check. Transfer explanation is the one additional explain-only
overload, requires owned (but does not reserve) inputs, and must say
`ownershipIntent: 'transfer'`. Thus every executable ordinary run request can
be passed unchanged to `explain`, while a transfer plan cannot be fabricated
from borrowed views.

`compile` freezes its normalized backend, fallback, and numeric policy on the
returned handle. `CompiledKernel.run` and `.explain` accept only operational
placement/output/signal/diagnostic options; they cannot override compile
policy. `CompiledKernel.hash` covers program hash, normalized compile policy
including numeric-policy hash, and compiler semantic version. It is a prepared
handle identity, not an execution-plan or backend-artifact identity; each
shape/placement run still receives its own `planHash` and `artifactHash`. If a
worker placement conflicts with a frozen WebGPU request, both run and explain
produce the same pre-execution capability miss and apply the frozen fallback
policy.

`run`/`CompiledKernel.run` use borrowed inputs inline and copy them when worker
placement is selected. `runMoved` is the only transfer path, always uses an
available worker pool, forbids caller output, and rejects before ownership
commit when no worker can accept the program. There is no automatic promotion
from borrowed input to transfer mode.

`ExecutionPlan` reports normalized nodes, inferred shapes, fused segments,
planned result/scratch/backend-staging storage and allocation scopes, alias
decisions, backend support per segment, planned backend/placement,
threshold/profile evidence, transfer estimates, and stable
capability/fallback reason codes. `explain` never runs the kernel and never
reports a planned runner as executed. `planHash` covers
program hash, concrete shape/layout specialization, compiler semantic version,
canonical numeric-policy hash/fallback policy, ordered allowed executor
identities/feature hashes, requested backend/placement/ownership intent,
content-addressed crossover profile, and source-map ID when diagnostics are
attached. Every `explain` overload therefore requires concrete bindings;
input-free domain kernels pass an empty binding record. A future symbolic
explanation would be a separate schema/API and may not fabricate concrete
shapes, byte counts, executor artifacts, or a concrete `planHash`.

`ExecutionReport` is observed-run evidence. It records the actual backend,
placement, ownership mode, retry count, timings, transferred bytes, and
instrumented scratch high-water for the named program/plan/artifact/runtime.
It also records the approximation classes actually exercised and exact
tolerance/domain evidence IDs and hashes; exact execution emits empty arrays.
It does not contain tensor values. A report from a different program, plan,
compiler semantic version, artifact, runtime/feature set, profile hash,
numeric/fallback policy, or source-map ID cannot be joined to the plan as
current evidence. The executed implementation must appear in the plan's ordered
`allowedExecutors`; otherwise receipt validation fails even if the numerical
output happened to match. Its applied approximation classes, admitted-domain
hashes, and tolerance-evidence IDs/hashes must be an exact allowed subset of
that executor's planned requirements and canonical numeric policy.

`fallback: 'error'` rejects before execution when the requested backend cannot represent the complete program. With `allow`, explicit `webgpu` falls back to WASM then CPU, explicit `wasm` falls back to CPU, and `auto` chooses among all available backends. A failed backend never leaves a caller-owned output partially changed: non-CPU backends complete into backend-owned staging storage and copy to the caller's output only after success.

For inline CPU or WASM, `AbortSignal` is checked before dispatch and before
output commit but cannot preempt a monolithic synchronous kernel in 1.0. Worker
execution is preempted through the worker-pool termination protocol. WebGPU
abort is best-effort and suppresses output commit; it does not claim that
already-submitted device work was cancelled.

## Internal execution architecture

Implement these layers in order and keep them backend-neutral:

1. **Builder and decoder:** construct or decode version-one programs and reject unknown versions/nodes.
2. **Semantic validator:** validate graph topology, node contracts, dtype/rank legality, literal options, and resource limits before allocating large buffers.
3. **Shape planner:** infer broadcast, reduction, matmul, stencil, and convolution shapes from concrete bindings, or resolve an explicit output domain from fixed/input-axis extents.
4. **Memory planner:** calculate logical indexers, input/output overlap, temporary buffers, and in-place safety.
5. **Normalized IR:** constant-folded, dead-node-free, backend-independent operation stream with explicit casts and broadcast strides.
6. **Backend capability matcher:** answer support and estimated transfer/work costs for every normalized segment.
7. **Executor:** select backend, compile/cache, run, stage output, produce `ExecutionReport`, and release temporary resources in `finally` blocks.

Set conservative program limits before backend work: at most 1,024 nodes, 64 inputs, rank four, `Number.MAX_SAFE_INTEGER` logical elements, and a configurable runtime allocation ceiling defaulting to 1 GiB. Reject calculations that overflow safe integer arithmetic even if the eventual allocation would fail independently.

Alias rules:

- Compute overlap and transfer eligibility from underlying buffer identity and
  reachable byte ranges, never typed-array object identity alone.
- Read-only inputs may alias one another.
- Caller output may alias an input only when the normalized program is one fused elementwise pass, every read is at the same logical index, and no broadcasted/zero-stride read can be overwritten before reuse.
- Reductions, matmul, stencil, convolution, dtype-changing casts, and any uncertain overlap require separate output.
- Every binding sharing one `ArrayBuffer` forms one alias/ownership group.
  Transfer admits a group only when its buffer is fixed-length, non-shared,
  non-detached, fully covered by every bound typed-array view, and represented
  by one consistent live ownership lease. External aliases remain
  undetectable; only Compute allocation/copy is safe by construction.
- Reject unsafe overlap with `UnsafeAliasError`; never silently allocate when the caller explicitly supplied an unsafe output.

## TypeScript reference and CPU compiler

- Write one simple node evaluator and logical-index walker as the test oracle. Optimize only after parity tests exist.
- Precompute logical-to-physical index increments so the inner interpreter loop does not divide for every axis.
- Compile maximal compatible elementwise chains into one nested loop and fuse a terminal reduction into that loop when legal.
- Generate separate contiguous and generic-strided runners. The generic runner must preserve broadcast strides and rank-zero behavior.
- Compile domain kernels into rank-aware nested loops whose counters and resolved extents feed the closed `index`/`size` nodes; an empty domain returns an empty output without evaluating the scalar body.
- Compile immutable scratch schedules, never mutable scratch storage. Each
  invocation leases an exclusive arena. Reuse a slot only after the previous
  value's final read and only when dtype, size, and alignment agree. Scratch
  never aliases an input, caller output, or returned output.
- Concurrent invocations and separate worker jobs never share mutable scratch.
  Every success, failure, abort, and fallback releases its lease in `finally`;
  discard oversized high-water storage above a configured cap. Reports expose
  planned, peak, and retained scratch bytes. Compile caches retain no user
  buffers.
- Keep timing instrumentation outside hot inner loops.

## Rust/WASM backend

Create an in-repository Rust workspace under `packages/compute/wasm` with no crates.io runtime dependencies. Build two artifacts:

- a mandatory scalar `wasm32-unknown-unknown` module; and
- an optional SIMD128 module selected only after a standard validation probe succeeds.

The Rust layer accepts a validated compact bytecode derived from normalized IR. The generic scalar bytecode interpreter must cover all 1.0 nodes that are meaningful in WASM, including resolved domain index/size slots, providing broad CPU/WASM parity. Add specialized dispatch for recognized hot plans:

- contiguous fused elementwise loops;
- row-major reductions and dot products;
- AXPY;
- tiled matrix multiplication;
- fixed-window stencils;
- 1D/2D convolution; and
- byte and float 3x3 color matrices required by the LA adapter.

Use exported allocation/deallocation functions and one instance-local
high-water scratch arena. A WASM instance and its arena are leased exclusively
to one invocation; concurrent runtime calls either serialize on that instance
or use a bounded pool of independently owned instances. No mutable memory,
views, or arena regions are shared across concurrent calls. Recreate JS typed
views after `memory.grow`. Validate all byte lengths and offsets in TypeScript
before crossing FFI; validate again in Rust and return numeric error codes
rather than trapping for user input.

Build scripts compile both modules, hash their bytes, and generate a base64 TypeScript module containing artifact version, compiler semantic version, hashes, and bytes. Only `/wasm` and backends that dynamically import it may reference that generated module. Check the generated file in so docs source aliases and clean npm installs do not require Rust; CI must rebuild it and fail on a diff.

If module compilation, instantiation, SIMD selection, allocation, or execution fails, mark that backend instance unavailable, free owned memory, and follow the runtime fallback policy. A WebAssembly trap becomes `WasmExecutionError` with its cause and is never retried on the same instance.

## Optional WebGPU backend

WebGPU supports `f32`, `i32`, and `u32` only. Lower contiguous and broadcast elementwise segments, explicit domain kernels, reductions, dot, rank-two matmul, stencils, and convolution where WGSL can preserve the defined semantics. Map domain indices to `global_invocation_id` and pass resolved axis sizes through a compiler-owned uniform block. Unsupported operations, `f64`, excessive rank/dispatch limits, or device feature limits yield a capability miss rather than partial lowering in 1.0.

- Request an adapter/device only after `/webgpu` construction or an `auto` run crosses a WebGPU candidate threshold.
- Generate WGSL solely from normalized nodes; user strings never enter shader source.
- Cache shader modules and pipelines by program hash, concrete shape specialization, and device capability key.
- Upload CPU inputs into staging/storage buffers, dispatch, copy into a readback buffer, await mapping, then copy into a CPU output view.
- Use a tree reduction only when the request explicitly permits
  `reassociation` with matching tolerance evidence; exact mode falls back or
  uses an exact-order implementation. Integers remain exact.
- Register `device.lost`. With fallback allowed, reject in-flight GPU work internally and rerun once through WASM/CPU before committing output. With fallback disabled, surface `DeviceLostError`.
- Validation errors from generated WGSL are implementation defects: surface `WebGpuCompileError`, include the program hash but not huge shader text, and do not cache the failed pipeline.

WebGPU tests are conditional. The docs must label it optional and report when a showcase run used fallback.

## Backend selection and crossover profiles

`auto` never benchmarks during application startup. Check in a versioned
`CrossoverProfile` generated from the repository benchmark suite. A profile
contains thresholds by normalized plan family, dtype, contiguity, element/work
count, backend implementation/feature hash, canonical numeric-policy hash,
placement, and ownership mode. Profile decoding permits only
`inline + borrowed` or
`worker + copy|transfer`; worker entries cannot name WebGPU. Missing or
duplicate tuples and evidence from another feature/policy identity fail closed.

Selection order:

1. Eliminate backends that cannot represent the program/dtype/shape or are unavailable.
2. Keep CPU for work below the first measured crossover or for highly strided tiny views.
3. Select WASM only beyond the threshold where copy plus execution beats generated CPU.
4. Select WebGPU only beyond the threshold where upload, dispatch, and readback beat both CPU and WASM.
5. Ordinary `run(..., { placement: 'auto' })` uses worker-copy only after its
   configured minimum and copy-mode crossover. It never silently detaches
   borrowed inputs.
6. Explicit `runMoved` always requests worker-transfer and reports whether the
   transfer-mode crossover was met; the explicit request may run below it but
   is never described as the automatic performance choice.

For each backend/plan family, set the checked-in crossover to the first tested size where it wins by at least 15% for three consecutive sizes on both the pinned Node and Bun runs. If no such run exists, `auto` never selects that backend for the family, though explicit backend requests remain available. Unknown runtime versions use the most conservative built-in profile. Every report exposes the profile ID and stable fallback/placement reason codes.

## Worker pools

Both worker entrypoints implement the same structural interface:

```ts
export interface WorkerPoolOptions {
  readonly size?: number
  readonly maxQueued?: number
  readonly maxRetainedScratchBytes?: number
}

export interface WorkerCopyRunOptions {
  readonly backend?: WorkerBackend
  readonly fallback?: FallbackPolicy
  readonly numericPolicy?: NumericPolicy
  readonly signal?: AbortSignal
  readonly output?: TensorView
  readonly diagnostics?: ComputeDiagnostics
}

export interface WorkerMoveRunOptions {
  readonly backend?: WorkerBackend
  readonly fallback?: FallbackPolicy
  readonly numericPolicy?: NumericPolicy
  readonly signal?: AbortSignal
  readonly diagnostics?: ComputeDiagnostics
}

export interface WorkerPool {
  readonly size: number
  run<D extends DType, R extends Rank>(
    program: KernelProgram<D, R>,
    inputs: Readonly<Record<string, TensorView>>,
    options?: WorkerCopyRunOptions,
  ): Promise<ExecutionResult<D, R>>
  runMoved<D extends DType, R extends Rank>(
    program: KernelProgram<D, R>,
    inputs: TransferBatch,
    options?: WorkerMoveRunOptions,
  ): Promise<MovedExecutionResult<D, R>>
  dispose(): Promise<void>
}

export function createBrowserWorkerPool(options?: WorkerPoolOptions): WorkerPool
export function createNodeWorkerPool(options?: WorkerPoolOptions): WorkerPool
```

- Default size is `max(1, min(4, hardwareConcurrency - 1))`; explicit size must be a positive integer.
- Queue capacity is explicit and bounded. A full queue rejects with
  `WorkerQueueFullError`; it never grows without limit.
- Messages contain the versioned program, canonical numeric policy and hash,
  view metadata, typed-array buffers, backend request, task ID, and worker
  epoch. The worker
  decodes and revalidates the program/message/view/resource limits before
  allocating large storage or executing. Compiler-produced messages receive no
  trusted bypass.
- Each worker executes at most one active kernel unless it owns multiple
  explicitly independent arenas and WASM instances. Workers maintain their own
  bounded compile/WASM caches and capped scratch arenas.
- Copy runs preserve caller buffers through structured clone. Transfer runs
  require `TransferBatch`; arbitrary borrowed `TensorView` values cannot be
  detached by passing an option string.
- Caller-owned output is supported only in `copy` mode and is populated on the caller after the worker result returns.
- Jobs transition exactly once through
  `queued → dispatching → running → terminal`. A pre-aborted job never enters
  the queue. Queued cancellation removes it, releases its still-attached
  ownership reservations, and rejects with `signal.reason`.
- Immediately before posting, recheck cancellation, ownership leases, buffer
  state, program identity, and limits. The ownership commit point is the
  successful `postMessage` call: the platform detaches each transfer buffer
  exactly once and every lease in its group becomes consumed. Validation
  failure or cancellation before that point releases still-attached groups to
  live and makes the submitted batch terminal(released). Abort or crash
  afterward cannot restore detached inputs and commits no output.
- If `postMessage` throws, inspect every ownership group before settling:
  still-attached groups have their reservations released; any detached group
  is marked consumed and the transfer fails without retry. Never claim rollback
  of platform detachment.
- Aborting a running job terminates and replaces that worker, then rejects with
  `signal.reason`. The first abort, crash, disposal, or result transition wins;
  every task promise settles once.
- Late messages from a terminated or replaced worker epoch are ignored. A
  structured Compute failure is not a worker crash. Unexpected exit, `error`,
  `messageerror`, or protocol corruption becomes `WorkerCrashedError`, replaces
  the worker, and retries exactly once only for copy mode. Transferred inputs
  are never retried.
- `dispose` is idempotent, prevents new dispatch, rejects queued jobs before
  ownership commit, terminates running workers, applies the same
  copy-versus-transfer ownership outcome as cancellation, removes listeners,
  and releases caches/arenas.
- Worker runtimes support CPU and WASM; WebGPU-in-worker and `SharedArrayBuffer` protocols are excluded.

## Scoped LA adapter

After the coordinated 2.0 train, make an independently released additive LA
minor: export `getAccelerator(): WasmAccelerator | null` and
`LA_ACCELERATOR_ABI: 'stopcock.la.accelerator.v1'` from both
`@stopcock/la/accel` and the LA root, and replace threshold literals only with
generated values backed by the accepted crossover profile.
Preserve every existing function and type. This work carries an LA minor
Changeset, packs and qualifies `@stopcock/la@2.1.0`, and publishes it before
Compute 1.0; it is not an unversioned mutation hidden inside the Compute
release.

`@stopcock/compute/la` exports:

```ts
export function createLaAccelerator(runtime: ComputeRuntime): Promise<WasmAccelerator>

export function installLaAccelerator(runtime: ComputeRuntime): Promise<() => void>
```

The adapter initializes a synchronous CPU/WASM implementation of the current LA contract. It never delegates to WebGPU or workers. `installLaAccelerator` captures `getAccelerator()`, installs its adapter through `accelerate`, and returns an idempotent disposer. The disposer restores the captured accelerator only when the active accelerator is still the exact adapter it installed; it must not clobber a newer installation.

Replace LA's hard-coded accelerator routing thresholds with constants generated
from the accepted crossover profile. Existing JS fallbacks remain the behavior
below those thresholds. Adapter calls validate all dimensions and buffers
before FFI and must produce the same output as the JS path within the documented
tolerance. The package manager owns semver validation for optional peer
`^2.1.0`; runtime code does not pretend to discover an npm version. The Compute
`/la` entry imports the LA namespace, fails clearly when the peer is absent, and
rejects a missing/mismatched `LA_ACCELERATOR_ABI` before installation. Root
Compute remains usable in every absent/incompatible-peer case.

## Errors and failure semantics

Export a `ComputeError` base carrying a stable `code` and structured details, with at least:

- `InvalidProgramError`, `UnsupportedProgramVersionError`, and `ProgramLimitError`;
- `InvalidTensorError`, `DTypeError`, `ShapeError`, `OutputCapacityError`,
  `UnsafeAliasError`, `OwnershipReservedError`, and
  `OwnershipConsumedError`;
- `TransferBatchSubmittedError`;
- `EmptyReductionError` and `IntegerDivideByZeroError`;
- `BackendUnavailableError`, `UnsupportedBackendOperationError`, and `FallbackDisabledError`;
- `JitUnavailableError`, `WasmExecutionError`, `WebGpuCompileError`, and `DeviceLostError`;
- `OptionalPeerUnavailableError` and `IncompatibleLaAbiError` from `/la`;
- `RuntimeDisposedError`, `WorkerQueueFullError`, `WorkerCrashedError`, and
  `WorkerPoolClosedError`.

Program/tensor/configuration failures throw or reject before output mutation. `AbortSignal` rejection uses `signal.reason` unchanged. Backend implementation failures preserve the original error as `cause`. Runtime fallback is recorded in the report; it is never silent in diagnostics.

Define a bounded clone-safe worker error envelope containing task ID, worker
epoch, phase, program hash, stable error code, optional normalized
node/segment ID, bounded structured details, and sanitized worker stack. Never
structured-clone an arbitrary thrown value. The host reconstructs the matching
`ComputeError` and preserves the worker envelope as its cause.

An optional `KernelSourceMap` sidecar maps normalized node/segment IDs to
repo-relative file/line/column spans. Its unique `id` covers program hash plus
origin/spans, so identical programs from different callsites can coexist. It is
excluded from program serialization and compilation cache identity but included
in plan/report joins. `RunOptions`, worker-copy/move options, and
`ExplainOptions` accept it through `ComputeDiagnostics`.

The sidecar normally remains host-side in the task record. Generated worker code
returns normalized IDs; the host selects the task's exact source-map ID and
attaches the mapped span. A process-level crash without a node ID maps to that
map's origin/offload callsite. Production mode need not ship source text or
absolute paths.

## Implementation stages

### Stage 1: package shell, tensor views, and program builder

- [ ] Add the private `packages/compute` package, tsconfig, tsup entries, Vitest config, exports, README skeleton, and optional LA peer metadata.
- [ ] Implement dtype mappings, tensor construction, row-major strides, broadcast views, bounds/overflow validation, and contiguity checks.
- [ ] Implement owned tensor allocation/copy, explicitly unsafe ownership claim,
  one-shot transfer batches, buffer-group runtime typestate, and consumed-lease
  errors. Ordinary tensor views remain borrowed.
- [ ] Implement branded symbolic expressions, the version-one plain AST, all
  expression builders, deep freezing, canonical encoding, fail-closed decoding,
  and public error types.
- [ ] Add declaration tests pinning dtype/rank inference, builder input inference, illegal mixed dtypes, reduction rank changes, and subpath imports.

### Stage 2: semantic, shape, and memory planning

- [ ] Validate forged/deserialized programs and enforce resource limits before
  allocations, including unknown-field, accessor, prototype, literal, and
  canonical-byte adversarial cases.
- [ ] Implement broadcast/reduction/dot/matmul/stencil/convolution shape inference plus fixed/input-axis output-domain resolution.
- [ ] Implement closed index/size nodes for allocation-free procedural rank-0–4 outputs and include domains in canonical hashes/explain output.
- [ ] Add constant folding, dead-node elimination, normalized IR, canonical
  hashing, numeric-policy matching, byte-range overlap/ownership analysis,
  output validation, immutable scratch scheduling, and deterministic
  execution-plan explanation.
- [ ] Generate the complete node/backend
  `exact-native | exact-emulated | approximate-only | unsupported` matrix with
  stable reason/corpus IDs and reject missing dispositions.
- [ ] Generate the content-addressed approximation-domain/preflight registry,
  validate tolerance/evidence hashes, and implement the single selected
  ULP-or-absolute-relative comparison rule for each approximate row.
- [ ] Add a deliberately simple row-based TypeScript oracle used by all backend parity tests.

### Stage 3: CPU interpreter and compiler

- [ ] Implement generic-stride/rank interpreter runners with normative f32/integer semantics.
- [ ] Implement closed-template JIT for contiguous and strided elementwise
  loops, fused reductions, dot, matmul, stencil, and convolution. Include a
  fixed-small-axis reduction plus legal pointwise epilogue so the image
  showcase's RGB-weighted sum → contrast → threshold path needs no worker-side
  full-frame intermediate.
- [ ] Add CSP probing, forced modes, bounded LRU caching, statistics, and
  exclusive per-invocation scratch arenas with retained high-water caps.
- [ ] Expose `runSync`, `compileSync`, byte-deterministic `ExecutionPlan`
  output, and versioned observed `ExecutionReport` output. Timing-bearing
  reports are never called deterministic.

### Stage 4: runtime orchestration

- [ ] Implement lazy `ComputeRuntime`, capability discovery, backend contracts, staging, fallback, disposal, and report aggregation.
- [ ] Add the checked-in crossover profile format and selection logic without runtime calibration.
- [ ] Ensure concurrent calls use isolated run state while sharing immutable compiled plans.

### Stage 5: Rust/WASM

- [ ] Add scalar and SIMD Rust modules, compact normalized bytecode, FFI validation, error codes, memory arena, and generic interpreter.
- [ ] Add specialized fused, reduction, dot/AXPY, matmul, stencil, convolution, and color-matrix kernels.
- [ ] Add exact emulation/preflight for admitted signed-zero, NaN, rounding,
  cast, shift, and integer-divide edge cases; leave unproved transcendental
  paths approximate-only or unsupported.
- [ ] Add the dual-artifact build/embed/hash script and CI generated-artifact diff check.
- [ ] Implement `/wasm` probing, instantiation, view refresh after growth, failure quarantine, and runtime integration.

### Stage 6: workers

- [ ] Implement shared protocol/types, bounded task queue, task/epoch state
  machine, per-worker cache/arena, transfer commit point, buffer-group
  validation, structured error envelopes, cancellation race handling, crash
  replacement/copy-only retry, and disposal.
- [ ] Add separate browser and Node factories without leaking platform imports into root bundles.
- [ ] Integrate explicit pools and worker thresholds into `ComputeRuntime`;
  inline and worker execution emit hash-joinable plans/reports with stable reason
  codes.
- [ ] Add host-side `KernelSourceMap` mapping for normalized node/segment errors
  without sending source text or absolute paths to workers.

### Stage 7: WebGPU

- [ ] Implement capability probing, supported-node matcher, WGSL generation, pipeline caching, upload/readback staging, reduction tolerances, and resource cleanup.
- [ ] Generate explicit approximation requirements for reassociation, FMA
  contraction, and transcendental implementation differences. Exact mode must
  reject/fallback before dispatch; approximate mode admits only rows whose full
  deviation-class and tolerance/evidence set is present.
- [ ] Handle device loss and fallback-before-output-commit.
- [ ] Keep all WebGPU types and globals behind `/webgpu` or lazy runtime calls.

### Stage 8: LA integration

- [ ] Add and test LA's additive `getAccelerator` export, stable accelerator ABI
  token, and profile-generated threshold routing under a minor Changeset for
  `@stopcock/la@2.1.0`.
- [ ] Implement `createLaAccelerator` and scoped, non-clobbering installation/disposal.
- [ ] Replace hard-coded LA routing thresholds only after accepted benchmark crossover data exists.
- [ ] Prove integration through LA vectors/matrices/primitives plus existing Color and Img consumers.
- [ ] Build, pack, and publish the independently gated LA 2.1.0 minor before
  Compute 1.0; pin Compute's optional peer to `^2.1.0`, exercise absent and
  compatible installs, make the strict package-manager fixture reject an
  out-of-range peer, and make `/la` reject a mismatched ABI token.

### Stage 9: documentation, showcase, and release

- [ ] Add `apps/docs/src/content/docs/libraries/compute.mdx`, API recipes for every backend, failure/fallback guidance, and an explicit support matrix.
- [ ] Add a Pipeline Microscope showing static `ExecutionPlan`, observed
  `ExecutionReport`, and release evidence as visibly separate layers across
  interpreter, JIT, WASM, worker, and available WebGPU modes.
- [ ] Add a real Image Offload Microscope depending on `@stopcock/img` and
  `@stopcock/compute`: load a large image; perform one explicitly reported
  conversion into an owned interleaved `f32` staging tensor; transfer once;
  fuse grayscale → contrast → threshold into one worker pass; transfer the
  grayscale result back; explicitly convert that `f32` result into the current
  Img `Uint8ClampedArray` representation; and perform `Img.resize` as a
  deliberately visible host materialization boundary. Differentially
  characterize it against the existing Img operations and display mismatch
  count/max error. Do not claim bit-identical Img parity because the existing
  multi-pass `Uint8ClampedArray` path rounds/clamps at different points.
- [ ] Display host staging copies, transferred bytes, ownership/detachment
  state, worker full-frame intermediates, scratch high-water, planned and actual
  executor, boundary reason, fallback reason, retry count, and mapped failures.
  Describe this as a “transferable worker pipeline with no worker-side
  full-frame intermediates,” not zero-copy.
- [ ] Document that true zero-copy Img execution is outside 1.0 because Img uses
  `Uint8ClampedArray` while Compute exposes no `u8` storage semantics or closed
  resize/indexed-load lowering. Any future claim requires an explicit
  `@stopcock/compute/img` adapter and its own acceptance gates.
- [ ] Add Compute to the root README catalogue, docs library grid/sidebar/introduction, generated LLM docs, and dependency diagram.
- [ ] Pack the tarball and test root, every subpath, worker bootstrap, lazy WASM, and optional LA adapter from clean Node and Bun consumers.
- [ ] Remove `private`, add the `1.0.0` major Changeset, and publish only after the acceptance checklist is complete.

## Test plan

### Runtime and property tests

- Every node for all legal dtypes/ranks, rank zero, zero-sized axes, broadcasting, non-contiguous views, offsets, casts, caller-owned outputs, fixed domains, input-axis domains, and index/size coordinates.
- Forged cycles, unknown versions/opcodes, bad node references, invalid axes, overflows, allocation ceilings, dtype/rank mismatches, undersized outputs, and every alias class.
- Canonical encode/decode round trips; rejection of prototypes, accessors,
  functions, symbols, unknown fields, duplicate IDs, hostile lengths, and
  semantic-version/hash tampering before large allocation.
- Owned allocation/copy, unsafe-claim warnings, alias groups, duplicate backing
  buffers, partial/resizable/shared/detached views, atomic reservation,
  competing batches, reserved-use rejection, open/submitted batch races,
  explicit/automatic release, consumed leases, and transfer-batch single use.
- Fast-check generated valid programs and views compared interpreter-to-oracle; generated invalid programs must fail before execution.
- Fixed-small-axis reduction plus pointwise epilogue matches the unfused oracle
  exactly under exact policy and allocates no full-frame intermediate.
- Exact interpreter/JIT agreement for integer operations, bitwise outputs, and
  every floating path admitted by exact policy. Only an explicitly admitted
  approximate-policy row uses its named tolerance.
- Cross-backend edge corpus for NaN payload-insensitive behavior, infinities,
  `+0`/`-0`, rounding ties, FMA contraction, out-of-range casts, masked shifts,
  integer divide/modulo zero, and `i32 MIN / -1`.
- Potentially throwing nodes prove preflight or staging: caller-owned and
  in-place outputs remain byte-identical after failure.
- Exact numeric policy never selects an approximate-only runner. Approximate
  policy requires explicit opt-in for every deviation class and records the
  canonical policy hash plus tolerance/evidence identities. Fixtures prove
  that reassociation permission alone cannot admit FMA contraction or alternate
  transcendental implementations.
- Approximation fixtures cover ULP and absolute-relative rules, every output
  element, unknown/stale domain and evidence hashes, statically proved domains,
  preflight pass/fail, and fallback before caller-output mutation.
- CSP-disabled runs, compile cache hit/eviction/clear behavior, concurrent runs, runtime disposal, explicit fallback errors, and output non-mutation after failed execution.

### Rust/WASM tests

- Rust unit tests for bytecode validation, scalar operations, SIMD/scalar equivalence, bounds checks, error codes, allocation growth, and every specialized kernel.
- Randomized interpreter/WASM parity across programs, dtype, rank, shape, strides, broadcasts, zero dimensions, and output alias decisions.
- Repeated growth/call tests, exclusive-instance serialization/pooling under
  concurrency, arena release/cap behavior, malformed FFI lengths, unavailable
  SIMD, instantiation failure, and trap quarantine/fallback.
- LA adapter parity for dot, AXPY, rectangular matmul, convolution, byte/float color matrices, restoration of a previous accelerator, nested installs, and a newer accelerator replacing Compute before disposal.

### Worker and browser tests

- Queue capacity/order, bounded parallelism, per-job arena isolation, copied
  inputs, transferred ownership groups, exact-once transfer lists, output
  ownership, caller-owned output copy, and plan/report hash identity.
- Validation failure, pre-abort, and queued abort leave inputs attached; accepted
  transfer detaches once at dispatch; running abort/crash cannot restore inputs
  and commits no output.
- Task/epoch race tests cover late results, abort versus result, disposal versus
  dispatch, structured Compute failure versus crash, copy-only retry,
  transfer-no-retry, synchronous `postMessage` failure with attached/detached
  ownership inspection, respawn, repeated disposal, and work after disposal.
- Malformed/prototype-bearing messages, mutated metadata, oversized programs,
  bad byte ranges, duplicate buffers, `messageerror`, and protocol corruption
  fail before output mutation or large worker allocation.
- Minified Node and browser worker failures map normalized node/segment IDs back
  to the originating host-side pipeline span without shipping source text.
- Browser module-worker smoke tests against the packed package.
- Conditional WebGPU parity for every supported node family, unsupported/f64 fallback, forced-error policy, shader failure, device loss, and output staging.

### Type and package tests

- `*.test-d.ts` coverage for `TypedData`, rank inference, broadcasting builder results, reduction ranks, runtime result types, platform subpaths, and the optional LA peer.
- Declaration tests prove direct `run` options are accepted unchanged by
  `explain`, reject worker-plus-WebGPU requests, and prevent
  `CompiledKernel.run`/`.explain` from overriding frozen backend, fallback, or
  numeric policy.
- Declaration tests use both object literals and pre-bound variables to reject
  transfer intent with borrowed/inline/WebGPU/output options. The transfer
  explain overload accepts owned views without reserving them. Concrete
  `explain` requires bindings; an input-free domain program passes `{}` to
  runtime explain or `{ inputs: {} }` to CPU explain rather than receiving
  fabricated concrete facts.
- Domain-builder declarations reject invalid axes and non-scalar output expressions while preserving output rank and dtype inference.
- Declaration tests prevent borrowed `TensorView` bindings from reaching
  `runMoved`, make `TransferBatch` opaque, and return owned output from moved
  execution.
- Built declaration inspection for every export map entry.
- Tree-shaking smoke proving a root CPU import does not include generated WASM bytes, worker runtime, Node built-ins, or WGSL backend code.
- Packed-tarball clean installs in Node and Bun; Deno root/CPU ESM smoke remains non-blocking.
- Packed `/la` fixtures cover absent peer, matching
  `LA_ACCELERATOR_ABI`, mismatched/missing token, and package-manager peer-range
  validation without importing LA from root Compute.

### Future FP/Compute bridge contract tests

These are mandatory for a later optional bridge, not for standalone Compute
1.0:

- Exact elementwise FP oracle, compiler output, Compute CPU/WASM,
  worker-copy, and worker-transfer results are bit-identical and their receipt
  hashes join.
- Exact floating reduction never selects reassociating SIMD/WGSL; approximate
  mode requires explicit per-class opt-in and reports its policy hash and
  tolerance/evidence identities.
- Mutable capture produces a stable compiler skip reason and never invokes
  Compute.
- Only a closed numeric segment crosses an FP materialization boundary into one
  `KernelProgram`; segment and program hashes map exactly once.
- Both compiler and Compute independently reject tampered semantic/program/view
  identities before output mutation.
- Missing/duplicate segment IDs, mismatched semantic/program hashes, and an
  executed backend outside the plan fail combined receipt validation.
- Packed FP-only and Compute-only consumers contain no code from the other;
  only the optional adapter consumer contains both.

## Benchmark and acceptance gates

Add dedicated Compute benchmark files and JSON baseline output under `benchmarks`:

- interpreter versus JIT versus one handwritten fused loop;
- fused execution versus 2-, 5-, and 10-pass materialized typed-array pipelines;
- fixed-small-axis reduction plus pointwise epilogue versus the equivalent
  materialized grayscale/contrast/threshold passes;
- contiguous versus strided/broadcast views;
- reductions, dot, matmul, stencil, and convolution by dtype/shape;
- scalar WASM, SIMD WASM, JIT CPU, and current LA JS kernels including copy cost;
- worker copy/transfer crossover, dispatch/detachment cost, scratch high-water,
  retained worker memory, and pool scaling; and
- WebGPU upload/dispatch/readback crossover when hardware exists.

Release gates:

- A fused five-operation contiguous CPU plan at one million elements allocates no intermediate result arrays, beats its materialized multi-pass baseline on pinned Node and Bun, and remains within 20% of the handwritten fused loop.
- `auto` selects WASM or WebGPU only where the three-consecutive-size/15% crossover rule passed; beyond a selected threshold the chosen backend must not regress against the previous internal baseline by more than 10% without an approved baseline update.
- Worker copy and transfer modes each show a measured crossover. Automatic
  placement only selects worker-copy beyond its threshold; explicit
  `runMoved` below the transfer threshold is reported as caller-forced rather
  than an automatic performance win.
- The Image Offload Microscope proves exactly the documented input
  Img-to-owned-`f32` and output-`f32`-to-Img host conversions, zero hidden
  structured-clone buffer copies in transfer mode, no worker-side full-frame
  intermediate for the fused reduction/pointwise segment, a visible host resize
  boundary, and an explicit accepted Img error envelope with mismatch/max-error
  output. It is not described as bit-identical Img execution or end-to-end
  zero-copy.
- Correctness, bounded memory, cancellation, cleanup, package isolation, and report honesty are hard gates. Third-party competitor numbers are informational only.
- Packed `@stopcock/la@2.1.0` passes its own Changeset, API, behavior,
  threshold, clean-install, provenance, and publication gates before the packed
  Compute candidate is tested against optional peer `^2.1.0`.

## Final release acceptance

- [ ] CPU interpreter is the documented normative implementation and passes the full oracle/property suite.
- [ ] Generated CPU and mandatory scalar WASM pass all supported-runtime parity suites.
- [ ] SIMD is optional at runtime but tested when available; WebGPU absence does
  not fail release. Exact policy admits no approximate-only implementation;
  each approximate deviation class requires its own current tolerance evidence.
- [ ] Versioned `ExecutionPlan` and `ExecutionReport` separate static estimates
  from observed execution, join only through matching hashes, expose stable
  fallback codes, and contain no user tensor data.
- [ ] Direct run requests are explainable unchanged; worker-plus-WebGPU is
  unrepresentable; compiled handles freeze backend/fallback/numeric policy; and
  handle, plan, artifact, and observed-report identities remain distinct.
- [ ] Worker cancellation, ownership commit, exact-once detachment, alias-group
  validation, epoch races, copy-only crash retry, source mapping, and disposal
  are proven in Node and a real browser.
- [ ] Transfer is available only through an opaque consuming ownership
  capability; a borrowed tensor cannot be detached by an option string.
- [ ] LA adapter installation is explicit, scoped, reversible, and does not
  alter existing behavior when absent; the additive LA seam is released as
  `@stopcock/la@2.1.0` before Compute, the optional peer is `^2.1.0`, and the
  runtime checks the stable ABI token rather than inferring package semver.
- [ ] Root import is side-effect-free and platform-neutral; optional code stays behind subpaths/lazy imports.
- [ ] Docs, both Microscopes, support matrix, benchmark profiles, package
  catalogue, and generated LLM docs are current; no showcase says “zero-copy”
  where host staging or materialization still occurs.
- [ ] Package build, runtime tests, type tests, Rust tests, docs build, tarball inspection, and clean-install imports pass.
- [ ] `@stopcock/synth` remains private and excluded from public build/test/publish automation.
- [ ] Compute started after the coordinated Stopcock 2.0 stable cohort and its
  train-only dynamic check was retired for frozen-manifest replay, or that
  cohort plan was explicitly revised before the workspace was created.
- [ ] The public package is versioned and released independently as `@stopcock/compute@1.0.0`.
