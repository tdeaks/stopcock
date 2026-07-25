# Stopcock worker-offloaded transferable pipelines implementation plan

> **Status:** proposed flagship integration workstream.
>
> **Canonical runtime owner:**
> [`2026-07-21-stopcock-compute-1.0-implementation.md`](./2026-07-21-stopcock-compute-1.0-implementation.md)
> owns worker pools, backend execution, transfer validation, cancellation,
> crash recovery, and crossover profiles. This plan must not create a second
> worker protocol inside `@stopcock/fp-compiler` or `@stopcock/img`.
>
> **Initial integration:** `@stopcock/img` pointwise operations lowered into
> `@stopcock/compute`, plus one browser and Node demonstration.

## Outcome

Allow a user to describe a supported image pipeline, run it through an explicit
Compute worker pool, transfer logically consumed full buffers when requested,
reuse bounded worker-local scratch, and receive an execution report that
explains:

- which operations fused;
- which operations formed materialization boundaries;
- whether inputs were copied or transferred;
- selected worker/backend;
- bytes copied/transferred/read/written;
- compiler-owned temporary and output allocations;
- cancellation or fallback behavior;
- the source stage associated with an error.

The first proof pipeline is:

```text
grayscale -> contrast -> threshold -> resize
```

`grayscale`, `contrast`, and `threshold` form one compatible pointwise segment.
`resize` is an explicit shape-changing boundary and a second segment.

The honest product language is **worker-offloaded transferable pipeline**.
“Zero-copy” may be used only for the measured worker-boundary transfer itself;
it must never imply zero allocations, zero scratch, or absence of output
transfer.

## Current repository seams

- `@stopcock/compute` is planned around a closed serializable `KernelProgram`,
  explicit `copy | transfer` ownership, browser/Node worker pools, backend
  reports, and cancellation by terminating/replacing a running worker.
- `@stopcock/img` currently represents an image as a structural
  `{ data: Uint8ClampedArray, width, height }` and allocates new images for
  common filters.
- Image dual helpers carry no FP fusion metadata.
- `@stopcock/signal` already has caller-owned outputs and reusable FFT or
  convolution scratch.
- `@stopcock/la` already has `*Into`-style and accelerator seams.
- `@stopcock/async` Task carries an `AbortSignal`, but a signal cannot preempt a
  synchronous worker loop without a worker protocol or worker termination.
- The FP compiler recognizes a bounded FP/Array grammar; it does not serialize
  arbitrary Img callbacks and must not start doing so.

## Explicit exclusions

- No arbitrary function serialization, callback source parsing, or
  `Function#toString`.
- No claim that a TypeScript brand proves exclusive ownership of an
  `ArrayBuffer`.
- No `SharedArrayBuffer` worker protocol in the first release.
- No partial/sliced buffer transfer.
- No WebGPU inside workers in the first release.
- No transparent offload of every Img, Signal, Color, or LA operation.
- No retry after a transferred input has been detached.
- No main-thread fallback after externally visible partial output.
- No hidden worker creation from the `@stopcock/img` root import.

## Package and dependency boundary

Keep Compute dependency-free at its root. Put the image vocabulary and lowering
knowledge with Img:

```text
@stopcock/img
  ordinary synchronous image API, unchanged

@stopcock/img/compute
  image pipeline descriptors
  lowering to public Compute KernelProgram APIs
  execution adapter and image-specific reports

@stopcock/compute/worker/browser
@stopcock/compute/worker/node
  worker runtime and protocol ownership
```

`@stopcock/img` may declare `@stopcock/compute` as an optional peer only when
the `/compute` subpath is added. Root Img consumers must not retain Compute,
worker, WASM, Node, or compiler code. If package-level optional-peer metadata
would create unacceptable install warnings, ship the integration first as a
private app-local adapter and revisit the public subpath after Compute 1.0.

## Closed image pipeline format

Use data descriptors, not arbitrary functions:

```ts
export type ImageStage =
  | { readonly kind: "grayscale"; readonly id?: string }
  | { readonly kind: "contrast"; readonly amount: number; readonly id?: string }
  | { readonly kind: "threshold"; readonly value: number; readonly id?: string }
  | {
      readonly kind: "resize"
      readonly width: number
      readonly height: number
      readonly method: "nearest" | "bilinear"
      readonly id?: string
    }

export interface ImagePipeline {
  readonly format: "stopcock.img.pipeline"
  readonly version: 1
  readonly stages: readonly ImageStage[]
  readonly hash: string
}

export function imagePipeline(...stages: readonly ImageStage[]): ImagePipeline
```

Rules:

- all numeric parameters are finite and validated before allocation;
- threshold uses Img's documented byte-scale semantics;
- stage IDs are stable diagnostic labels and never generated-code identifiers;
- the pipeline is deeply frozen and canonically hashed;
- decoded/external pipelines are revalidated;
- unsupported stages fail before input transfer;
- build tools may attach a source location to a stage, but source location does
  not affect semantic identity or cache keys;
- a future compiler may recognize these closed builders, but runtime correctness
  cannot depend on build-time extraction.

## Execution API

```ts
export interface ImagePipelineRunner {
  readonly pipeline: ImagePipeline
  explain(
    image?: Image,
    options?: ImagePipelineRunOptions,
  ): Promise<ImagePipelinePlan>
  run(
    input: ImagePipelineInput,
    options: ImagePipelineRunOptions,
  ): Promise<ImagePipelineResult>
}

export type ImagePipelineInput =
  | { readonly mode: "copy"; readonly image: Image }
  | { readonly mode: "transfer"; readonly image: TransferImage }

export interface ImagePipelineRunOptions {
  readonly runtime: ComputeRuntime
  readonly pool: WorkerPool
  readonly backend?: "cpu" | "wasm" | "auto"
  readonly signal?: AbortSignal
}
```

No global default runtime or pool is installed. Pool/runtime construction and
disposal remain explicit and instance-scoped.

## Transfer and ownership contract

### Copy is the default

Passing an ordinary `Image` uses copy mode. Caller buffers stay readable and
undisturbed. Documentation examples default to this mode.

### Transfer is an explicit consuming operation

Provide a stateful wrapper rather than a structural brand alone:

```ts
export interface TransferImage {
  readonly state: "ready" | "moved"
  readonly width: number
  readonly height: number
}

export function copyForTransfer(image: Image): TransferImage
export function adoptForTransfer(image: Image): TransferImage
```

- `copyForTransfer` creates a full, private-sized buffer copy and is the safe
  preparation path.
- `adoptForTransfer` requires the view to cover one complete non-shared
  `ArrayBuffer` with no prefix/suffix bytes. Its name and docs state that the
  caller asserts exclusive logical ownership; JavaScript cannot prove absence
  of aliases.
- accepting a transfer job transitions the wrapper to `moved` before posting.
  Later wrapper access fails deterministically.
- successful posting detaches the underlying buffer and therefore detaches any
  aliases the caller retained.
- preflight failure leaves the wrapper `ready`.
- once posting begins, cancellation or worker crash does not restore the input.
- the same `ArrayBuffer` cannot appear twice in a transfer list. Aliased input
  views are rejected unless the lowering explicitly supports one deduplicated
  transfer and immutable alias metadata.
- `SharedArrayBuffer`, resizable buffers, sliced views, and caller-owned output
  are rejected in transfer mode.

The public docs must plainly state that the wrapper enforces a logical
single-use state; it does not prove physical uniqueness.

## Segment lowering

### Pointwise segment

Lower grayscale, contrast, and threshold into one Compute domain kernel over
the source pixels:

- preserve Img's channel order and alpha behavior;
- pin rounding, clamping, and byte-conversion order against the synchronous Img
  reference implementation;
- write one output image and no intermediate image arrays;
- report any scalar/compiler scratch separately;
- avoid a semantic shortcut if it changes rounding relative to the three
  ordinary operations.

If exact fusion cannot reproduce existing intermediate byte quantization,
choose one of:

1. retain explicit byte-rounding nodes inside the fused kernel; or
2. label a distinct pure/approximate mode and keep exact mode segmented.

Do not silently change Img semantics to obtain one loop.

### Resize boundary

Resize is a shape-changing materialization boundary:

- it receives the completed pointwise output;
- output shape is validated before allocation;
- nearest and bilinear modes match synchronous Img fixtures;
- scratch/output allocation is planned explicitly;
- the report exposes two segments and the boundary reason.

### Backend and worker selection

The Img adapter supplies semantic programs; Compute selects CPU/WASM and worker
execution using its checked-in crossover profile. The adapter must not maintain
a second threshold table.

## Scratch and buffer reuse

- Scratch is per worker and never concurrently shared between jobs.
- Reuse is keyed by dtype, logical size, alignment, and segment family.
- Pools have explicit byte and entry limits with deterministic eviction.
- Returned output never exposes uninitialized capacity.
- A cache retains no user input view or source-location object.
- Cancellation, crash, and disposal release or quarantine scratch in `finally`
  paths.
- Reports distinguish peak scratch capacity from bytes logically used.
- Security documentation states that pools are instance-scoped. A
  multi-tenant host requiring memory zeroing must select a `clearScratch`
  policy or separate pools; the default must never expose scratch contents
  through an output view.

## Cancellation and failure semantics

- A pre-aborted signal rejects before transfer or queueing.
- Aborting a queued job removes it and leaves an unposted transfer wrapper
  ready.
- Aborting a running copy job terminates/replaces the worker and rejects with
  `signal.reason`.
- Aborting a running transfer job terminates/replaces the worker, rejects with
  `signal.reason`, and leaves the input moved/detached.
- A copied job may retry once after a worker crash according to Compute policy.
- A transferred job is never retried.
- Synchronous long-running kernels are not described as cooperatively
  cancellable unless generated loops contain proven checkpoints. The initial
  implementation uses worker termination.
- No partial image is returned on abort or failure.
- Error serialization preserves stable code, message, cause category, pipeline
  hash, segment ID, and stage ID without embedding image bytes.

## Source mapping and diagnostics

Every stage may carry build-time diagnostic metadata:

```ts
interface PipelineSourceSite {
  readonly source: string
  readonly line: number
  readonly column: number
}
```

The source site belongs to debug metadata and is stripped from production
kernel identity. A compiler transform may attach it only when it recognizes a
literal closed pipeline builder. Runtime-created pipelines still report stage
and segment IDs.

Errors map:

```text
worker task -> Compute program hash -> Img pipeline hash -> segment -> stage
```

Source maps are tested in packed Vite and Node consumers. Generated worker
stack text is supplementary; structured identifiers remain authoritative.

## Implementation stages

### Stage 0 — Confirm Compute prerequisites

Do not begin adapter implementation until Compute has:

- closed KernelProgram validation;
- browser and Node worker pools;
- copy/transfer preflight;
- cancellation, crash replacement, and no-retry transfer semantics;
- execution reports and crossover profiles;
- packed worker smoke tests.

**Gate:** all prerequisites pass from the packed Compute artifact.

### Stage 1 — Freeze Img semantics and pipeline descriptors

1. Add independent fixtures for grayscale, contrast, threshold, and resize.
2. Record alpha, rounding, clamp, threshold scale, malformed image, and empty
   image behavior.
3. Implement and canonically hash the closed `ImagePipeline`.
4. Add type and decoder tests.

**Gate:** descriptor construction changes no root Img behavior or bundle.

### Stage 2 — Implement pointwise Compute lowering

1. Lower the three pointwise stages to one exact Compute program where
   possible.
2. Add explicit intermediate quantization nodes if required.
3. Differentially compare synchronous three-pass Img with Compute CPU and WASM.
4. Report segment, output, and scratch allocations honestly.

**Gate:** exact output bytes and alpha match the frozen corpus on CPU and WASM.

### Stage 3 — Add resize boundary and multi-segment execution

1. Lower/execute resize as a separate shape-changing segment.
2. Commit output only after both segments succeed.
3. Add boundary explanations and failure injection between segments.
4. Bound temporary retention across the boundary.

**Gate:** failure or abort at either segment returns no partial output and
releases temporary storage.

### Stage 4 — Add transfer wrappers and worker execution

1. Implement safe copied preparation and explicit adopted transfer.
2. Add full-buffer/shared/sliced/duplicate-buffer preflight.
3. Connect to browser and Node Compute pools.
4. Exercise queued/running abort, crash, retry, disposal, and moved-state
   transitions.

**Gate:** every transfer-state transition is deterministic and the no-retry
rule holds after detachment.

### Stage 5 — Add compiler metadata and source diagnostics

1. Teach the FP/compiler diagnostic layer only about the closed Img pipeline
   builder and semantic manifest.
2. Emit source locations and rejection reasons.
3. Do not serialize or inline arbitrary callbacks.
4. Connect stage/segment information to compiler receipts.

**Gate:** removing the compiler plugin changes no runtime behavior; unsupported
sites remain explicit runtime pipelines.

### Stage 6 — Ship the flagship demonstration

Build a private browser demo with:

- an image large enough to demonstrate main-thread responsiveness;
- synchronous main-thread, worker-copy, and worker-transfer modes;
- input ownership state;
- fused segments and resize boundary;
- selected backend and fallback;
- bytes, scratch, passes, queue, transfer, and execution timing;
- cancellation and worker-recovery controls;
- downloadable result and machine-readable receipt.

Add an equivalent Node CLI fixture for reproducible benchmarks.

## Test matrix

- zero, one, odd, and large image dimensions;
- opaque and varying alpha;
- contrast extremes and invalid non-finite parameters;
- threshold boundaries from 0 through 255;
- nearest and bilinear resize;
- exact fused versus three-pass byte output;
- empty, undersized, sliced, resizable, shared, detached, and duplicated
  buffers;
- copied and adopted transfer wrappers;
- pre-abort, queued abort, running abort, crash before/after transfer, and
  dispose;
- copy retry and transfer no-retry;
- scratch reuse, eviction, isolation, and output-capacity exposure;
- browser module worker, Node worker threads, strict CSP, packed ESM, and source
  maps;
- root Img bundle excluding Compute and worker code.

## Benchmark and product gates

- The exact pointwise segment allocates no intermediate image result arrays.
- Worker copy and transfer crossovers are measured separately on pinned browser,
  Node, and Bun-capable profiles.
- Automatic offload occurs only above an accepted crossover.
- UI responsiveness is measured with long-task/event-loop-delay evidence, not
  inferred from worker use.
- The report includes queue, transfer, compile, execute, and output-transfer
  time separately.
- Transfer is not marketed as a win where total elapsed time loses to copy or
  synchronous execution.
- The flagship corpus includes warm and cold worker/cache runs.
- Every benchmark artifact records source, pipeline, Compute, Img, runtime,
  worker bootstrap, and crossover-profile hashes.

## Release acceptance

- Compute remains the sole worker-runtime and protocol owner.
- Img root behavior and dependency closure remain unchanged.
- Only closed named image stages are lowerable.
- Copy is safe/default; transfer is explicit and consuming.
- Running cancellation terminates/replaces the worker and never returns partial
  output.
- Exact mode preserves synchronous Img output bytes.
- The report truthfully names fusion, boundaries, allocations, ownership, and
  fallbacks.
- Both packed browser and Node examples work without private workspace imports.
- Documentation says “worker-offloaded transferable pipeline,” with “zero-copy”
  limited to proven boundary transfers.

## Rollback

The entire adapter and demo can be removed without changing Compute or ordinary
Img. A failing lowering falls back to the synchronous Img implementation only
before transfer and before externally visible work. After transfer or worker
execution begins, surface failure according to the worker contract; never hide
it with an unreported retry or semantic fallback.
