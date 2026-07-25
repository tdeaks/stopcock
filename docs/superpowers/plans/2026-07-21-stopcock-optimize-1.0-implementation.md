# `@stopcock/optimize` 1.0 Implementation Plan

**Date:** 2026-07-21  
**Status:** Ready for implementation  
**Target:** A new, publishable `@stopcock/optimize` package that provides deterministic, typed optimization, nonlinear least-squares, scalar and vector root-finding, schedules, tracing, cancellation, and exact checkpoint/resume.

## Outcome

Ship a broad 1.0 optimization package whose public API works naturally with numbers, `Float64Array`, `@stopcock/la` matrices, and arbitrary fixed-shape user models described by a `ParameterCodec<Model>`.

The package must:

- minimize scalar objectives with first-order methods, projected box constraints, L-BFGS-B, and Nelder-Mead;
- solve robust nonlinear least-squares problems with Levenberg-Marquardt;
- find scalar roots with Brent-Dekker and safeguarded Newton, and square vector roots with trust-region Newton and Broyden updates;
- consume explicit derivatives or `@stopcock/autodiff` `DiffFn` values without forcing users through a second tensor abstraction;
- offer synchronous one-shot helpers and stateful sessions with cooperative async execution;
- expose deterministic schedules, trace records, callbacks, cancellation, checkpointing, and exact resume;
- preserve the last valid iterate when a later objective evaluation becomes non-finite;
- publish without native binaries, platform-specific installation steps, or runtime side effects.

This plan deliberately does not add global optimization, mixed-integer optimization, arbitrary nonlinear constraints, distributed execution, automatic GPU execution, stochastic data-loader abstractions, sparse Jacobians, or probabilistic inference. Box constraints are the only constraints in 1.0.

## Decisions fixed by this plan

The following are release decisions, not implementation options:

1. All solvers operate internally on a contiguous `Float64Array`; `ParameterCodec<Model>` is the only structured-parameter boundary.
2. Model shape is fixed for the lifetime of a session. Dynamic arrays, optional numeric leaves, maps, sets, and graph-shaped models are unsupported.
3. Object codecs use lexicographically sorted keys, so the packed layout does not depend on JavaScript property insertion order.
4. The public solver surface uses discriminated problem records. It does not infer derivative availability from function arity or return shape.
5. Gradient methods require an explicit gradient, an autodiff-backed objective, or an explicitly enabled finite-difference policy. No silent finite differencing occurs.
6. L-BFGS-B is a real bounded algorithm with a generalized Cauchy point and subspace minimization, not unconstrained L-BFGS followed by clipping.
7. Levenberg-Marquardt supports linear, Huber, Cauchy, and soft-L1 losses and applies bounds through an active-set projected step.
8. Scalar roots require a valid sign-changing bracket unless the selected safeguarded Newton method can establish one within its configured expansion budget.
9. Vector root-finding accepts square systems only in 1.0: number of residuals must equal number of packed parameters.
10. Checkpoints are produced only at completed iteration boundaries. They contain algorithm state but never contain executable objective, residual, derivative, callback, or scheduler functions.
11. Resuming validates the solver kind, method version, codec signature, packed size, and numerical configuration before evaluating the supplied problem.
12. A resumed session uses the numerical configuration stored in the checkpoint. Only runtime controls such as `signal`, callbacks, trace retention, and async scheduling may be replaced.
13. Traces contain immutable snapshots. Position and vector fields are copied before delivery to user callbacks or storage.
14. Randomized tie-breaking uses an internal seeded `xoshiro128**` generator. Solvers never use `Math.random()`.
15. `runAsync()` is cooperative, not parallel. It yields between evaluation batches and has identical accepted iterates to `run()` for the same problem, seed, and options.
16. `@stopcock/autodiff` and `@stopcock/la` are direct runtime dependencies. `@stopcock/async`, `@stopcock/fp`, `@stopcock/compute`, and `@stopcock/synth` are not dependencies.
17. `@stopcock/synth` remains outside repository-wide build, test, and publish automation for this release unless separately brought into scope.

## Current repository seams

Implementation must begin by preserving the contracts already present in the monorepo:

- `@stopcock/autodiff` exposes synchronous scalar-output `DiffFn<Args>` values with `forward`, `gradient`, and `valueAndGradient`. Its gradients are `number | Float64Array | Mat`, and unary functions unwrap their single argument in the returned gradient.
- `@stopcock/la` owns `Vec`, `Mat`, decompositions, and dense solve primitives. Its root currently exports `Mat` as a namespace rather than a directly usable value type. Add the non-breaking aliases `export type { Vec as VecValue } from './vec'` and `export type { Mat as MatValue } from './mat'`; Optimize uses `MatValue` and does not add optimization-specific state or methods to LA.
- Existing autodiff examples implement training loops manually. Replace or supplement those examples with Optimize-backed examples only after the solver behavior is proven; do not remove the low-level autodiff examples.
- Package tests live beside package source, public entrypoints are declared through package exports, and published tarballs must be checked for workspace-source leakage and undeclared dependencies.
- Repository automation currently has an explicit non-synth boundary. New broad validation may include Optimize but must keep Synth excluded.

Before changing source, record the exact current exports and constructor shapes of `DiffFn`, `Vec`, and `Mat`. If the live constructor APIs differ from this plan’s examples, adapt only the internal adapter layer. The `VecValue`/`MatValue` aliases are the one intentional public LA addition and preserve the existing namespace exports.

## Package and entrypoint layout

Create:

```text
packages/optimize/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    types.ts
    errors.ts
    codec/
      index.ts
      scalar.ts
      vector.ts
      matrix.ts
      composite.ts
      descriptor.ts
    objective/
      normalize.ts
      autodiff.ts
      finite-difference.ts
      evaluation.ts
    bounds/
      normalize.ts
      project.ts
      active-set.ts
    session/
      session.ts
      async-runner.ts
      trace.ts
      checkpoint.ts
      rng.ts
    methods/
      first-order.ts
      lbfgsb.ts
      nelder-mead.ts
      line-search.ts
    least-squares/
      lm.ts
      losses.ts
      jacobian.ts
    roots/
      scalar.ts
      vector.ts
    schedules/
      descriptors.ts
      evaluate.ts
    internal/
      vectors.ts
      linear-solve.ts
      stopping.ts
  test/
  bench/
```

Publish these entrypoints:

```json
{
  ".": "./dist/index.js",
  "./codec": "./dist/codec/index.js",
  "./methods": "./dist/methods/index.js",
  "./least-squares": "./dist/least-squares/index.js",
  "./roots": "./dist/roots/index.js",
  "./schedules": "./dist/schedules/index.js",
  "./checkpoint": "./dist/session/checkpoint.js"
}
```

Each export requires matching ESM JavaScript, declaration output, and package export metadata. Do not expose `internal/`, concrete session implementations, mutable method state, or LA/autodiff adapters as public subpaths.

The initial workspace version is `0.0.0` while implementation is incomplete. The first registry release is `1.0.0`; do not publish a narrower API under 1.0 and retrofit the remainder later.

## Public parameter model

### Native parameter types

The root entrypoint exports:

```ts
import type { MatValue } from "@stopcock/la";

export type NativeParameters = number | Float64Array | MatValue;

export interface ParameterCodec<Model> {
  readonly id: string;
  readonly version: number;
  readonly size: number;
  readonly descriptor: CodecDescriptor;
  readonly signature: string;
  pack(model: Model, out?: Float64Array): Float64Array;
  packInto(model: Model, out: Float64Array, offset?: number): void;
  unpack(values: ArrayLike<number>, offset?: number): Model;
}
```

`pack()` with an `out` argument must require `out.length === size`; it must not silently allocate, resize, or write a prefix. `packInto()` permits a larger destination and checks `offset >= 0 && offset + size <= out.length`. `unpack()` reads exactly `size` values from the requested offset and returns a fresh model, including fresh arrays and matrices.

`CodecDescriptor` is a closed, JSON-safe tree:

```ts
export type CodecDescriptor =
  | { readonly kind: "scalar" }
  | { readonly kind: "vector"; readonly length: number }
  | { readonly kind: "matrix"; readonly rows: number; readonly columns: number }
  | { readonly kind: "tuple"; readonly items: readonly CodecDescriptor[] }
  | { readonly kind: "array"; readonly count: number; readonly item: CodecDescriptor }
  | {
      readonly kind: "struct";
      readonly fields: readonly {
        readonly key: string;
        readonly codec: CodecDescriptor;
      }[];
    }
  | {
      readonly kind: "custom";
      readonly id: string;
      readonly version: number;
      readonly size: number;
    };
```

The `signature` is the lower-case hex SHA-256 digest of a canonical UTF-8 JSON serialization of `{ id, version, size, descriptor }`. The implementation must include a small synchronous, pure TypeScript SHA-256 routine rather than requiring Node `crypto` or Web Crypto. Canonical serialization sorts object keys, preserves descriptor array order, and rejects non-finite numeric descriptor fields.

### Built-in codecs

Export the `Codec` namespace object and named factories:

```ts
export const Codec: {
  scalar(): ParameterCodec<number>;
  vector(length: number): ParameterCodec<Float64Array>;
  matrix(rows: number, columns: number): ParameterCodec<MatValue>;
  tuple<const T extends readonly ParameterCodec<unknown>[]>(items: T): ParameterCodec<CodecTuple<T>>;
  array<T>(item: ParameterCodec<T>, count: number): ParameterCodec<T[]>;
  struct<const T extends Record<string, ParameterCodec<unknown>>>(fields: T): ParameterCodec<CodecStruct<T>>;
  custom<T>(definition: CustomCodecDefinition<T>): ParameterCodec<T>;
  native<T extends NativeParameters>(example: T): ParameterCodec<T>;
};
```

Rules:

- `scalar()` packs one number.
- `vector(length)` accepts only `Float64Array` of that exact length.
- `matrix(rows, columns)` uses LA’s public matrix accessor and restores `MatValue` in row-major logical order, independent of its internal storage representation.
- `tuple()` preserves tuple position.
- `array()` requires exactly `count` elements.
- `struct()` accepts a plain object and packs fields in lexicographically sorted Unicode code-point key order. The returned descriptor exposes that frozen order.
- `custom()` requires a globally meaningful non-empty `id`, positive integer `version`, non-negative integer `size`, `packInto`, and `unpack`. Its functions are runtime behavior; only its identity and shape enter the descriptor.
- `native(example)` dispatches only on number, `Float64Array`, or `MatValue`, using the example’s fixed size. It copies shape, never the example values.
- Zero-size codecs are allowed only as nested structural components. A top-level optimization problem must have at least one packed parameter.
- Cyclic object graphs, sparse arrays, typed arrays other than `Float64Array`, and matrices whose dimensions change between calls are rejected.

The package never silently mutates a model supplied by the caller. Every position passed to an objective or callback is freshly decoded or a callback-only immutable snapshot.

### Gradient encoding

Explicit derivatives return one of:

```ts
export type ModelGradient<Model> = Model | Float64Array;
```

A `Float64Array` means “already packed” and must have `codec.size` elements. Any other value is packed through the same codec as the model. This deliberately makes structured gradients visually match structured parameters. For a model whose runtime type is itself `Float64Array`, both interpretations are equivalent.

## Objective contracts

### Scalar minimization problems

Export:

```ts
export interface ValueGradient {
  readonly value: number;
  readonly gradient: Float64Array;
}

export type ScalarObjective<Model> =
  | {
      readonly kind: "value-gradient";
      readonly evaluate: (position: Model) => {
        readonly value: number;
        readonly gradient: ModelGradient<Model>;
      };
    }
  | {
      readonly kind: "separate";
      readonly value: (position: Model) => number;
      readonly gradient: (position: Model) => ModelGradient<Model>;
    }
  | {
      readonly kind: "autodiff";
      readonly fn: DiffFn<readonly [Model]>;
    }
  | {
      readonly kind: "value";
      readonly value: (position: Model) => number;
    };

export interface MinimizeProblem<Model> {
  readonly initial: Model;
  readonly codec?: ParameterCodec<Model>;
  readonly objective: ScalarObjective<Model>;
  readonly bounds?: Bounds<Model>;
}
```

When `codec` is omitted, infer it with `Codec.native(initial)`. Structured models always require an explicit codec.

For an autodiff objective, call `fn.valueAndGradient(initial)` through a narrow adapter and normalize `number | Float64Array | MatValue` using the selected native codec. Autodiff objectives therefore support native unary models in 1.0. A structured model may still use autodiff by packing it and defining a `DiffFn<[Float64Array]>` over packed values; provide this as a documented recipe rather than an unsafe generic cast.

The evaluation layer owns all accounting:

- a combined value-and-gradient call increments both `valueEvaluations` and `gradientEvaluations` once;
- a separate value call increments only `valueEvaluations`;
- a finite-difference gradient increments `gradientEvaluations` once plus `valueEvaluations` for every actual objective call;
- cached value/gradient pairs at an unchanged packed point are reused only within the same solver step and are not retained across callback boundaries;
- user exceptions are rethrown as `ObjectiveEvaluationError` with the original error available as `cause` and the attempted evaluation kind and counters attached.

### Finite-difference policy

Value-only objectives are accepted by Nelder-Mead without extra configuration. Gradient methods accept them only when options include:

```ts
export type FiniteDifferenceOptions =
  | { readonly scheme: "forward"; readonly relativeStep?: number }
  | { readonly scheme: "central"; readonly relativeStep?: number };
```

Defaults:

- forward: `relativeStep = sqrt(Number.EPSILON)`;
- central: `relativeStep = cbrt(Number.EPSILON)`;
- coordinate step: `relativeStep * max(1, abs(x[i]))`;
- if a bound blocks the preferred sample, use a feasible one-sided stencil;
- if both sides are fixed by equal bounds, the derivative is zero;
- never sample outside bounds.

Central difference is the documentation recommendation; no finite-difference policy is enabled by default.

## Bounds and projections

Export:

```ts
export interface Bounds<Model> {
  readonly lower?: number | Model | Float64Array;
  readonly upper?: number | Model | Float64Array;
}
```

A scalar bound broadcasts to every packed coordinate. A structured or packed bound follows the gradient encoding rules. Missing lower values are `-Infinity`; missing upper values are `Infinity`.

Normalization occurs before the first objective evaluation and rejects:

- incorrect shapes or packed lengths;
- `NaN` bounds;
- any `lower[i] > upper[i]`;
- non-finite initial parameters;
- an initial parameter outside the inclusive interval;
- a top-level zero-size model.

The initial point is not silently projected. Callers must consciously choose a feasible initial state.

All bounded methods share these definitions:

```text
project(x)[i] = min(upper[i], max(lower[i], x[i]))

projectedGradient(x, g)[i] =
  0, if x[i] == lower[i] and g[i] > 0
  0, if x[i] == upper[i] and g[i] < 0
  g[i], otherwise
```

Floating-point boundary comparison uses exact equality after projection; the solver itself writes exact bound values when a step reaches a bound. Stopping uses the infinity norm of the projected gradient.

## Minimization API

### Method descriptors

Export this closed union:

```ts
export type MinimizeMethod =
  | SgdOptions
  | MomentumOptions
  | NesterovOptions
  | RmsPropOptions
  | AdamOptions
  | AdamWOptions
  | LbfgsbOptions
  | NelderMeadOptions;

export interface CommonMinimizeOptions {
  readonly maxIterations?: number;
  readonly maxEvaluations?: number;
  readonly gradientTolerance?: number;
  readonly stepTolerance?: number;
  readonly functionTolerance?: number;
  readonly trace?: TraceOptions;
  readonly callback?: IterationCallback<MinimizeIteration>;
  readonly signal?: AbortSignal;
  readonly seed?: number;
  readonly finiteDifference?: FiniteDifferenceOptions;
}
```

Defaults common to all minimizers:

- `maxIterations = 1_000`;
- `maxEvaluations = 100_000`;
- `gradientTolerance = 1e-8` where a gradient exists;
- `stepTolerance = 1e-12` relative to `max(1, ||x||∞)`;
- `functionTolerance = 1e-12` relative to `max(1, abs(f))`;
- `seed = 0`;
- trace disabled unless requested.

Invalid or non-finite option values throw `InvalidConfigurationError`. A maximum of zero means no iterations but still permits the validated initial evaluation needed to return a result.

Method defaults and state:

| Method | Required descriptor and defaults | Checkpointed state |
| --- | --- | --- |
| SGD | `{ kind: "sgd", learningRate: 0.01 }` | accepted step index |
| Momentum | `{ kind: "momentum", learningRate: 0.01, momentum: 0.9 }` | velocity, step index |
| Nesterov | `{ kind: "nesterov", learningRate: 0.01, momentum: 0.9 }` | velocity, step index |
| RMSProp | `{ kind: "rmsprop", learningRate: 0.001, decay: 0.99, epsilon: 1e-8 }` | square average, step index |
| Adam | `{ kind: "adam", learningRate: 0.001, beta1: 0.9, beta2: 0.999, epsilon: 1e-8 }` | first and second moments, bias step |
| AdamW | Adam defaults plus `weightDecay: 0.01` | Adam state, bias step |
| L-BFGS-B | `{ kind: "lbfgsb", historySize: 10, maxLineSearchSteps: 20, c1: 1e-4, c2: 0.9 }` | correction pairs, scale, active set, last line-search state |
| Nelder-Mead | `{ kind: "nelder-mead", alpha: 1, gamma: 2, rho: 0.5, sigma: 0.5, initialScale: 0.05 }` | complete simplex and values |

Every `learningRate` field accepts either a positive number or a `Schedule` descriptor. AdamW applies decoupled weight decay before projection. Weight decay applies to every free coordinate, including those at one-sided bounds, and the projected result is the accepted state.

For Momentum and Nesterov, velocity is zeroed on any coordinate whose proposed step is clipped and points farther outside the feasible region. Nesterov evaluates the gradient at the projected look-ahead point. RMSProp, Adam, and AdamW also zero an outward first-moment component when projection activates a bound; second-moment history is retained.

### One-shot and session APIs

```ts
export function minimize<Model>(
  problem: MinimizeProblem<Model>,
  options: CommonMinimizeOptions & { readonly method: MinimizeMethod },
): MinimizeResult<Model>;

export function createOptimizationSession<Model>(
  problem: MinimizeProblem<Model>,
  options: CommonMinimizeOptions & { readonly method: MinimizeMethod },
): OptimizationSession<Model, MinimizeResult<Model>>;
```

`minimize()` creates a session and calls `run()`. It is synchronous and deterministic.

### L-BFGS-B algorithm requirements

Implement the Byrd-Lu-Nocedal-Zhu bounded algorithm, including:

1. Compute the projected gradient and stop if its infinity norm is within tolerance.
2. Build the compact limited-memory Hessian representation from up to `historySize` accepted `(s, y)` pairs.
3. Compute the generalized Cauchy point by sorting finite breakpoints at which the negative-gradient path hits a bound, updating the directional derivative and curvature segment by segment.
4. Identify free variables at the Cauchy point.
5. Solve the subspace minimization over free variables with the compact representation; truncate the step at the first bound.
6. Perform a projected strong-Wolfe line search from the current point along the feasible direction. Use safeguarded cubic interpolation with bisection fallback.
7. Accept correction pairs only when `sᵀy > 1e-10 * ||s||₂ * ||y||₂`; otherwise skip the update without failing the solve.
8. If the strong-Wolfe search exhausts `maxLineSearchSteps`, try the best finite Armijo point seen. If none exists, return `reason: "line-search-failed"` at the last accepted point.

Do not replace steps 3–5 with projected unconstrained L-BFGS. Add small, independently tested internal routines for breakpoints, compact products, active-set selection, and subspace truncation.

### Nelder-Mead requirements

Construct an `n + 1` simplex from the initial point. For coordinate `i`, use:

```text
delta = initialScale * max(1, abs(x[i]))
candidate[i] = project(x[i] + delta)
```

If projection produces a duplicate vertex, try the negative direction, then the nearest representable feasible displacement. A coordinate fixed by equal bounds is excluded from the effective simplex dimension. If all coordinates are fixed, return the initial result with `reason: "projected-gradient"` and zero iterations.

Sort equal-valued vertices lexicographically by packed coordinates for deterministic behavior. Standard reflection, expansion, outside/inside contraction, and shrink rules operate on free coordinates and project every candidate before evaluation. Stop when both simplex diameter and objective spread meet their respective tolerances.

## Schedules

Export a closed, JSON-safe union:

```ts
export type Schedule =
  | { readonly kind: "constant"; readonly value: number }
  | { readonly kind: "exponential"; readonly initial: number; readonly decay: number; readonly decaySteps?: number; readonly staircase?: boolean }
  | { readonly kind: "step"; readonly initial: number; readonly stepSize: number; readonly gamma: number }
  | { readonly kind: "polynomial"; readonly initial: number; readonly end: number; readonly totalSteps: number; readonly power?: number }
  | { readonly kind: "cosine"; readonly maximum: number; readonly minimum: number; readonly totalSteps: number }
  | { readonly kind: "warmup-cosine"; readonly peak: number; readonly minimum: number; readonly warmupSteps: number; readonly totalSteps: number; readonly start?: number }
  | { readonly kind: "one-cycle"; readonly maximum: number; readonly totalSteps: number; readonly pctStart?: number; readonly divFactor?: number; readonly finalDivFactor?: number };

export function scheduleValue(schedule: number | Schedule, step: number): number;
```

`step` is the zero-based accepted-update count. Rejected line-search or trial evaluations do not advance it. Schedules clamp their finite horizon at the last value rather than cycling.

Exact formulas:

- constant: `value`;
- exponential: `initial * decay ** q`, where `q = step / decaySteps` or `floor(step / decaySteps)` for staircase;
- step: `initial * gamma ** floor(step / stepSize)`;
- polynomial: `end + (initial - end) * (1 - min(step, totalSteps) / totalSteps) ** power`;
- cosine: `minimum + 0.5 * (maximum - minimum) * (1 + cos(pi * t))`, `t = min(step, totalSteps) / totalSteps`;
- warmup-cosine: linear interpolation from `start` to `peak` for `step < warmupSteps`, then the cosine formula from `peak` to `minimum` through `totalSteps`;
- one-cycle: linear rise from `maximum / divFactor` to `maximum` through `pctStart * totalSteps`, then cosine decay to `maximum / finalDivFactor`.

Defaults are `decaySteps = 1`, `staircase = false`, `power = 1`, `start = 0`, `pctStart = 0.3`, `divFactor = 25`, and `finalDivFactor = 10_000`. Durations and step sizes must be positive integers. Rates and factors must be finite and positive; schedule endpoints may be zero only for `constant`, `polynomial.end`, `cosine.minimum`, and `warmup-cosine.start/minimum`.

## Results, trace, callbacks, and stopping

### Stable result model

```ts
export type StopReason =
  | "projected-gradient"
  | "step-tolerance"
  | "function-tolerance"
  | "residual-tolerance"
  | "bracket-tolerance"
  | "max-iterations"
  | "max-evaluations"
  | "callback"
  | "aborted"
  | "non-finite"
  | "line-search-failed"
  | "singular"
  | "trust-region-failed"
  | "stagnation";

export interface EvaluationCounts {
  readonly value: number;
  readonly gradient: number;
  readonly residual: number;
  readonly jacobian: number;
}

export interface MinimizeResult<Model> {
  readonly position: Model;
  readonly value: number;
  readonly converged: boolean;
  readonly reason: StopReason;
  readonly iterations: number;
  readonly evaluations: EvaluationCounts;
  readonly gradientNorm?: number;
  readonly projectedGradientNorm?: number;
  readonly trace?: readonly MinimizeIteration<Model>[];
  readonly traceDropped: number;
}
```

`converged` is true only for tolerance reasons, including a completely fixed feasible box. Budget, callback, abort, non-finite, and algorithm-failure reasons are non-converged.

Iteration records include solver kind, method, completed iteration, copied decoded position, scalar objective/cost or residual norm, relevant gradient/step norms, current schedule value, acceptance state, evaluation counts, and method-specific diagnostics in a closed `details` union. Do not expose mutable internal vectors or arbitrary dictionaries.

### Trace policy

```ts
export interface TraceOptions {
  readonly every?: number;
  readonly maxEntries?: number;
  readonly includePosition?: boolean;
}
```

Defaults are `every = 1`, `maxEntries = 1_000`, and `includePosition = true`. `maxEntries = 0` disables retention while still permitting callbacks. Retention is a ring policy that always preserves the initial record if one was requested and the latest record, evicting the oldest intermediate record. `traceDropped` counts every eligible record not present in the final trace, whether skipped by cadence or evicted by capacity.

Callbacks run synchronously after a completed iteration and receive a frozen defensive record. Returning `false` stops with `reason: "callback"`; returning `void` or `true` continues. Callback exceptions propagate unchanged after the session records the latest completed boundary as checkpointable.

### Termination precedence

At each completed boundary, test in this order:

1. cancellation signal;
2. callback request;
3. non-finite trial exhaustion;
4. algorithm-specific convergence criterion;
5. maximum evaluations;
6. maximum iterations.

If multiple convergence tolerances hold at the same boundary, use projected-gradient, residual, bracket, step, then function tolerance in that order. Counts include the evaluation that reached a budget. No new evaluation starts once the configured budget has already been reached.

Initial state rules:

- invalid shape, configuration, bounds, or non-finite initial parameters throw before evaluation;
- a non-finite initial objective, residual, gradient, or Jacobian throws `NonFiniteInitialEvaluationError` because there is no valid partial result;
- after one valid boundary exists, repeated non-finite trial evaluations cause a normal partial result with `reason: "non-finite"` at the last finite accepted state.

## Stateful sessions and cooperative async execution

```ts
export type SessionStatus = "ready" | "running" | "completed" | "failed" | "disposed";

export interface SessionStep<Result> {
  readonly done: boolean;
  readonly result?: Result;
}

export interface AsyncRunOptions {
  readonly signal?: AbortSignal;
  readonly yieldEveryEvaluations?: number;
  readonly scheduler?: (resume: () => void) => void;
}

export interface OptimizationSession<Model, Result> {
  readonly status: SessionStatus;
  step(): SessionStep<Result>;
  run(): Result;
  runAsync(options?: AsyncRunOptions): Promise<Result>;
  result(): Result | undefined;
  checkpoint(options?: CheckpointOptions): OptimizationCheckpoint;
  cancel(reason?: unknown): void;
  dispose(): void;
}
```

`step()` advances exactly one accepted outer iteration, though it may perform multiple trial evaluations. Initialization is part of the first `step()` call. `run()` repeatedly steps until completion.

`runAsync()` uses `yieldEveryEvaluations = 32` by default. The default scheduler is `setTimeout(resume, 0)` when available, falling back to `queueMicrotask`. The scheduler only controls when execution resumes; it does not enter checkpoint state and may be replaced after resume. Async execution checks cancellation before each evaluation and before scheduling the next batch.

A pre-aborted signal rejects `runAsync()` with `signal.reason` before evaluation. Once a valid boundary exists, cancellation resolves to a partial result with `reason: "aborted"`. Calling `cancel()` follows the same rule. A synchronous `run()` can observe only cancellation changed by callbacks or objective code; document that JavaScript cannot process an external abort event while a long synchronous call monopolizes the thread.

Sessions are single-consumer:

- calling a run method while `status === "running"` throws `SessionStateError`;
- after completion, `run()`, `runAsync()`, and `step()` return the same result without reevaluation;
- `checkpoint()` is allowed in `ready` state and after completed boundaries, but not during an in-progress evaluation;
- `dispose()` releases internal arrays and makes every operation except `dispose()` throw;
- a user-function exception sets `status = "failed"`; `result()` remains undefined, but the last completed boundary may still be checkpointed.

## Checkpoint and resume contract

Export a JSON-safe schema:

```ts
export interface OptimizationCheckpoint {
  readonly format: "@stopcock/optimize/checkpoint";
  readonly version: 1;
  readonly solver: "minimize" | "least-squares" | "scalar-root" | "vector-root";
  readonly method: string;
  readonly methodVersion: 1;
  readonly codecSignature: string;
  readonly size: number;
  readonly numericalConfig: unknown;
  readonly position: readonly number[];
  readonly methodState: unknown;
  readonly counters: {
    readonly iterations: number;
    readonly evaluations: EvaluationCounts;
    readonly acceptedUpdates: number;
  };
  readonly rngState: readonly [number, number, number, number];
  readonly lastEvaluation: unknown;
  readonly trace?: readonly unknown[];
  readonly traceDropped?: number;
}

export interface CheckpointOptions {
  readonly includeTrace?: boolean;
}
```

All numeric arrays are ordinary JSON arrays, not typed arrays. Serialization follows normal `JSON.stringify`; the implementation must reject checkpoint creation if any state field is non-finite rather than encoding `null` accidentally. `includeTrace` defaults to false.

Export solver-specific resume helpers rather than one weakly typed dispatcher:

```ts
export function resumeOptimizationSession<Model>(
  problem: Omit<MinimizeProblem<Model>, "initial"> & { readonly initial?: Model },
  checkpoint: OptimizationCheckpoint,
  runtime?: ResumeRuntimeOptions<MinimizeIteration<Model>>,
): OptimizationSession<Model, MinimizeResult<Model>>;

export function resumeLeastSquaresSession<Model>(...): OptimizationSession<Model, LeastSquaresResult<Model>>;
export function resumeScalarRootSession(...): OptimizationSession<number, ScalarRootResult>;
export function resumeVectorRootSession<Model>(...): OptimizationSession<Model, VectorRootResult<Model>>;
```

On resume:

1. validate the top-level format and schema version;
2. require the expected solver and method version;
3. rebuild or accept the problem codec and compare its signature and size;
4. reject any supplied `initial` whose packed value differs bit-for-bit from the checkpoint position; the recommended call omits `initial`;
5. validate every array length, counter, enum, and method-specific state invariant;
6. restore the stored numerical configuration and RNG state;
7. attach only runtime replacements: callback, signal, trace retention, async yield batch, and scheduler;
8. re-evaluate the supplied objective once at the checkpoint position, compare finite scalar/vector values to stored values using exact IEEE equality, and reject with `CheckpointProblemMismatchError` if they differ;
9. do not charge the validation re-evaluation to restored solver counters;
10. continue from the next iteration boundary.

Exact equality makes resume fail closed if callers supply a different problem. Document that non-deterministic objectives cannot promise exact resume. A run split at any completed boundary and resumed against the same deterministic problem must produce the same accepted iterates, result, counters, and RNG state as an uninterrupted run; elapsed wall time is never recorded.

## Nonlinear least-squares

### Problem and result types

```ts
export type ResidualVector = Float64Array;

export type LeastSquaresModel<Model> =
  | {
      readonly kind: "residual-jacobian";
      readonly evaluate: (position: Model) => {
        readonly residuals: ArrayLike<number>;
        readonly jacobian: MatValue | ArrayLike<number>;
      };
      readonly residualCount: number;
    }
  | {
      readonly kind: "separate";
      readonly residuals: (position: Model) => ArrayLike<number>;
      readonly jacobian: (position: Model) => MatValue | ArrayLike<number>;
      readonly residualCount: number;
    }
  | {
      readonly kind: "finite-difference";
      readonly residuals: (position: Model) => ArrayLike<number>;
      readonly residualCount: number;
      readonly finiteDifference?: FiniteDifferenceOptions;
    }
  | {
      readonly kind: "autodiff";
      readonly residuals: readonly DiffFn<readonly [Model]>[];
    };

export interface LeastSquaresProblem<Model> {
  readonly initial: Model;
  readonly codec?: ParameterCodec<Model>;
  readonly model: LeastSquaresModel<Model>;
  readonly bounds?: Bounds<Model>;
}

export interface LeastSquaresResult<Model> {
  readonly position: Model;
  readonly cost: number;
  readonly residuals: Float64Array;
  readonly residualNorm: number;
  readonly converged: boolean;
  readonly reason: StopReason;
  readonly iterations: number;
  readonly evaluations: EvaluationCounts;
  readonly damping: number;
  readonly trace?: readonly LeastSquaresIteration<Model>[];
  readonly traceDropped: number;
}
```

A flat explicit Jacobian is row-major with `residualCount * codec.size` entries. A `MatValue` must have `residualCount` rows and `codec.size` columns. Autodiff residuals are scalar `DiffFn` values, one per residual; evaluate their value/gradient pairs and stack gradients row-major. The residual count is fixed and must be positive.

### Robust loss contract

```ts
export type RobustLoss =
  | { readonly kind: "linear" }
  | { readonly kind: "huber"; readonly scale: number }
  | { readonly kind: "cauchy"; readonly scale: number }
  | { readonly kind: "soft-l1"; readonly scale: number };
```

For residual `r`, let `z = (r / scale)^2`. The objective contribution is `0.5 * scale^2 * rho(z)` and the iteratively reweighted least-squares row multiplier is `sqrt(max(rho'(z), Number.MIN_VALUE))`:

| Loss | `rho(z)` | `rho'(z)` |
| --- | --- | --- |
| linear | `z` with effective scale `1` | `1` |
| Huber | `z` for `z <= 1`, otherwise `2 * sqrt(z) - 1` | `1` for `z <= 1`, otherwise `1 / sqrt(z)` |
| Cauchy | `log1p(z)` | `1 / (1 + z)` |
| soft-L1 | `2 * (sqrt(1 + z) - 1)` | `1 / sqrt(1 + z)` |

Nonlinear losses require finite `scale > 0`.

### LM API and algorithm

```ts
export interface LevenbergMarquardtOptions extends CommonSolverOptions {
  readonly method?: "levenberg-marquardt";
  readonly loss?: RobustLoss;
  readonly initialDamping?: number;
  readonly dampingMinimum?: number;
  readonly dampingMaximum?: number;
  readonly residualTolerance?: number;
  readonly gradientTolerance?: number;
}

export function leastSquares<Model>(
  problem: LeastSquaresProblem<Model>,
  options?: LevenbergMarquardtOptions,
): LeastSquaresResult<Model>;

export function createLeastSquaresSession<Model>(...): OptimizationSession<Model, LeastSquaresResult<Model>>;
```

Defaults are linear loss, `initialDamping = 1e-3`, `dampingMinimum = 1e-15`, `dampingMaximum = 1e15`, `residualTolerance = 1e-8`, and the common iteration/evaluation/step tolerances.

At each iteration:

1. Evaluate residuals and Jacobian together when possible.
2. Apply robust row weights to form weighted `J` and `r`.
3. Compute `g = Jᵀr`, diagonal scaling `D[i] = max((JᵀJ)[i,i], 1e-12)`, and the active set from bounds and `g`.
4. Solve `(J_freeᵀ J_free + lambda * D_free) delta_free = -g_free` using an internal Cholesky solve, falling back to pivoted QR through `@stopcock/la` if Cholesky detects non-positive pivots.
5. Truncate/project the candidate to bounds and recompute the predicted reduction for the actual feasible step.
6. Evaluate candidate residuals and compute `ratio = actualReduction / predictedReduction`.
7. Accept when the ratio is positive and cost is finite. Update damping with Nielsen’s rule: `lambda *= max(1/3, 1 - (2 * ratio - 1)^3)` and reset `nu = 2`.
8. Reject otherwise, set `lambda *= nu`, then `nu *= 2`, and retry without advancing the outer iteration.
9. Stop with `trust-region-failed` if damping exceeds the maximum or ten consecutive damping retries fail.

Checkpoint `lambda`, `nu`, residuals, Jacobian-derived scaling, active set, and all counters. Stop on residual norm, projected gradient norm, step, function/cost improvement, budget, callback, cancellation, or failure using the common precedence.

## Scalar root-finding

### API

```ts
export interface ScalarRootProblem {
  readonly fn: (x: number) => number;
  readonly derivative?: (x: number) => number;
  readonly bracket: readonly [number, number];
  readonly initial?: number;
}

export type ScalarRootMethod =
  | { readonly kind: "brent" }
  | { readonly kind: "safeguarded-newton" }
  | { readonly kind: "auto" };

export interface ScalarRootOptions extends CommonSolverOptions {
  readonly method?: ScalarRootMethod;
  readonly absoluteTolerance?: number;
  readonly relativeTolerance?: number;
  readonly residualTolerance?: number;
  readonly finiteDifferenceDerivative?: boolean;
}

export interface ScalarRootResult {
  readonly root: number;
  readonly value: number;
  readonly bracket: readonly [number, number];
  readonly converged: boolean;
  readonly reason: StopReason;
  readonly iterations: number;
  readonly evaluations: EvaluationCounts;
  readonly trace?: readonly ScalarRootIteration[];
  readonly traceDropped: number;
}

export function findRoot(problem: ScalarRootProblem, options?: ScalarRootOptions): ScalarRootResult;
export function createScalarRootSession(...): OptimizationSession<number, ScalarRootResult>;
```

Both bracket endpoints must be finite and ordered. Evaluate endpoints once. Return immediately if either is an exact zero. Otherwise require finite values of opposite sign; invalid brackets throw `InvalidBracketError` before the session becomes runnable. The root itself is not required to lie at `initial`; `initial` is merely the first Newton candidate when inside the bracket.

`brent` implements the full Brent-Dekker interpolation/bisection algorithm and preserves the sign-changing bracket after every accepted step. `safeguarded-newton` uses an explicit derivative, or a central finite-difference derivative only when `finiteDifferenceDerivative` is true. A Newton step is accepted only when it lies strictly inside the bracket and is no larger than half the current bracket width; otherwise bisect. `auto` chooses safeguarded Newton when a derivative source exists and Brent otherwise.

Defaults are `absoluteTolerance = 1e-12`, `relativeTolerance = 4 * Number.EPSILON`, and `residualTolerance = 1e-12`. Stop when `abs(f(x)) <= residualTolerance` or bracket width is at most `absoluteTolerance + relativeTolerance * abs(x)`.

## Vector root-finding

### API

```ts
export type VectorRootModel<Model> =
  | {
      readonly kind: "residual-jacobian";
      readonly evaluate: (position: Model) => {
        readonly residuals: ArrayLike<number>;
        readonly jacobian: MatValue | ArrayLike<number>;
      };
    }
  | {
      readonly kind: "separate";
      readonly residuals: (position: Model) => ArrayLike<number>;
      readonly jacobian: (position: Model) => MatValue | ArrayLike<number>;
    }
  | {
      readonly kind: "finite-difference";
      readonly residuals: (position: Model) => ArrayLike<number>;
      readonly finiteDifference?: FiniteDifferenceOptions;
    }
  | {
      readonly kind: "autodiff";
      readonly residuals: readonly DiffFn<readonly [Model]>[];
    };

export interface VectorRootProblem<Model> {
  readonly initial: Model;
  readonly codec?: ParameterCodec<Model>;
  readonly model: VectorRootModel<Model>;
  readonly bounds?: Bounds<Model>;
}

export type VectorRootMethod =
  | { readonly kind: "trust-region-newton"; readonly initialRadius?: number; readonly maximumRadius?: number }
  | { readonly kind: "broyden"; readonly initialRadius?: number; readonly maximumRadius?: number; readonly restartInterval?: number };

export interface VectorRootResult<Model> {
  readonly root: Model;
  readonly residuals: Float64Array;
  readonly residualNorm: number;
  readonly converged: boolean;
  readonly reason: StopReason;
  readonly iterations: number;
  readonly evaluations: EvaluationCounts;
  readonly trace?: readonly VectorRootIteration<Model>[];
  readonly traceDropped: number;
}

export function findRoots<Model>(problem: VectorRootProblem<Model>, options: VectorRootOptions): VectorRootResult<Model>;
export function createVectorRootSession<Model>(...): OptimizationSession<Model, VectorRootResult<Model>>;
```

The residual vector length must equal `codec.size`; otherwise initialization throws `ShapeMismatchError`. Explicit flat Jacobians are row-major `size * size` arrays.

Trust-region Newton uses a Powell dogleg step:

1. compute the Newton step from pivoted QR;
2. compute the steepest-descent/Cauchy step for `0.5 * ||F||²`;
3. select the dogleg point inside the current radius;
4. truncate/project against bounds and use the actual feasible step for predicted reduction;
5. shrink radius to `0.25 * radius` for ratio below `0.25`, grow up to the maximum when ratio exceeds `0.75` and the boundary was reached, and accept when ratio exceeds `1e-4` with finite residuals.

Broyden starts from an explicit/autodiff/finite-difference Jacobian and applies the good rank-one update:

```text
B_next = B + ((y - B s) sᵀ) / (sᵀ s)
```

Restart from a fresh Jacobian every `restartInterval` accepted iterations, when `sᵀs` is too small, after a rejected trust-region step, or when the linear solve is singular. Defaults are `initialRadius = max(1, ||x||₂)`, `maximumRadius = 1_000 * initialRadius`, and `restartInterval = max(10, size)`. Three consecutive singular fresh Jacobians stop with `reason: "singular"`; ten consecutive rejected radius updates stop with `reason: "trust-region-failed"`.

Both methods support box bounds through projected feasible steps and stop on residual, step, budget, callback, cancellation, or failure. Checkpoints preserve radius, current Jacobian approximation, restart counter, last residuals, and RNG state.

## Internal linear algebra policy

Use `@stopcock/la` at public interoperability points and for stable pivoted decompositions already provided by the library. Keep hot solver-state operations over internal `Float64Array` buffers to avoid repeated `Mat` construction.

Implement only these private helpers in Optimize:

- dot, infinity norm, Euclidean norm, axpy, scale, and bounded projection over packed arrays;
- symmetric packed/dense products needed by L-BFGS-B and LM;
- Cholesky factor/solve with explicit positive-pivot checks;
- adapter functions to and from public LA `Mat` without reading private fields;
- stable hypot and compensated sums for norms and reductions.

Do not create a second public vector or matrix class. Do not copy general-purpose LU, QR, SVD, or matrix APIs from LA into Optimize.

## Error taxonomy

Export stable error classes with `name`, machine-readable `code`, and relevant dimensions/counters:

- `OptimizeError` base class;
- `InvalidConfigurationError`;
- `InvalidParameterError`;
- `ShapeMismatchError`;
- `InvalidBoundsError`;
- `InvalidBracketError`;
- `DerivativeRequiredError`;
- `NonFiniteInitialEvaluationError`;
- `ObjectiveEvaluationError`;
- `CheckpointValidationError`;
- `CheckpointProblemMismatchError`;
- `SessionStateError`.

Algorithmic inability to progress after a valid initial state is represented by a result reason, not an exception. Programmer mistakes, invalid schemas, malformed checkpoints, and user-function exceptions are exceptions.

## Implementation sequence

### Stage 1: Package shell and public type contract

1. Create the workspace package, ESM `tsup && tsc --emitDeclarationOnly` build config, exports, README skeleton, and root-Vitest runtime/declaration fixtures used by sibling packages.
2. Add the non-breaking `VecValue` and `MatValue` type aliases to LA's root declarations while retaining the existing `Vec`/`Mat` namespace values unchanged.
3. Add direct dependencies on the workspace versions of `@stopcock/autodiff` and `@stopcock/la`.
4. Define the public discriminated unions, results, trace records, errors, and no-op declaration fixtures before solver code.
5. Add type tests proving LA matrices satisfy `MatValue`, native inference, structured codec inference, immutable result fields, and invalid union combinations.
6. Add package-isolation verification from a packed tarball.

**Gate:** imports from every advertised entrypoint typecheck in a temporary consumer without reaching into monorepo source.

### Stage 2: Deterministic codecs and packed-state primitives

1. Implement descriptor canonicalization and synchronous SHA-256 signatures.
2. Implement scalar, vector, matrix, tuple, array, struct, custom, and native codecs.
3. Add packed-vector helpers, finite validation, exact shape checks, copy discipline, and codec fuzz tests.
4. Implement bounds normalization, projection, active-set detection, and projected-gradient norms.
5. Test nested models with matrices, tuples, and structs across randomized pack/unpack round trips.

**Gate:** `unpack(pack(model))` preserves values and exact declared shape, signatures are stable across processes, and object insertion order cannot change a struct layout.

### Stage 3: Evaluation engine, trace, and base session

1. Normalize explicit, separate, autodiff, and finite-difference objectives into a single packed evaluation interface.
2. Add exact evaluation accounting and same-step caching.
3. Implement trace cadence, bounded retention, immutable records, callback stop behavior, and stop precedence.
4. Implement the session lifecycle, synchronous stepping/running, cancellation, defensive results, and disposal.
5. Add the JSON-safe checkpoint envelope, schema validation utilities, and deterministic RNG.

**Gate:** mock-method tests prove lifecycle, count, callback, abort, trace, and initial/later non-finite semantics independent of any solver.

### Stage 4: Schedules and first-order minimizers

1. Implement and table-test every schedule formula at boundaries and beyond its horizon.
2. Add SGD, Momentum, Nesterov, RMSProp, Adam, and AdamW in the shared session engine.
3. Apply bounds and active-moment rules consistently.
4. Checkpoint every optimizer-specific array and counter.
5. Compare reference sequences against hand-calculated one- and two-dimensional examples.

**Gate:** every first-order method converges on smooth convex fixtures, respects bounds at every callback, and resumes bit-for-bit from several split points.

### Stage 5: L-BFGS-B

1. Add correction history and compact Hessian operations.
2. Implement generalized Cauchy-point breakpoint traversal.
3. Add free-variable subspace minimization and feasible-step truncation.
4. Implement projected strong-Wolfe search with safeguarded interpolation.
5. Add curvature skip, failure fallback, and complete checkpoint state.

**Gate:** match accepted reference minima on bounded quadratic, Rosenbrock, fixed-coordinate, optimum-on-bound, ill-scaled, and line-search-failure fixtures. Include at least one case that projected L-BFGS would solve incorrectly to guard the full algorithm.

### Stage 6: Nelder-Mead

1. Implement deterministic simplex construction, fixed-coordinate removal, and duplicate repair.
2. Add reflection, expansion, contraction, shrink, lexicographic ties, projection, and dual stopping criteria.
3. Checkpoint complete simplex/value state and verify seeded reproducibility.

**Gate:** solve derivative-free nonsmooth and bounded fixtures and resume with identical simplex ordering and counts.

### Stage 7: Robust Levenberg-Marquardt

1. Normalize residual/Jacobian sources and row-major shape checks.
2. Implement finite-difference and autodiff Jacobian adapters.
3. Implement all robust loss formulas and weighted system construction.
4. Add active-set projected LM, Cholesky/QR fallback, Nielsen damping, retry limits, tracing, and checkpoint state.
5. Add curve-fitting and outlier-resistant showcase examples.

**Gate:** recover known parameters on linear and nonlinear models, demonstrate robust loss resistance to injected outliers, respect bounds, and reproduce exact resumed results.

### Stage 8: Scalar and vector roots

1. Implement Brent-Dekker with persistent sign-changing brackets.
2. Implement safeguarded Newton and optional central-difference derivative.
3. Implement square-system adapters and trust-region dogleg Newton.
4. Implement good Broyden updates, restart rules, singular handling, bounds, trace, and checkpoint state.
5. Add difficult endpoint, flat-derivative, near-singular, and bounded root fixtures.

**Gate:** scalar methods never lose their bracket; vector methods reduce known square systems to tolerance and terminate honestly on singular/no-root fixtures.

### Stage 9: Async runner and exact resume

1. Add evaluation-batched `runAsync()` without changing numerical step order.
2. Add browser and Node scheduler tests, pre-abort and mid-run cancellation, and callback/yield interaction tests.
3. Complete solver-specific resume helpers and strict state validation.
4. Run checkpoint split tests at initialization, early, middle, penultimate, and terminal boundaries for every method.
5. Fuzz malformed checkpoint objects and require stable typed errors rather than uncaught property access.

**Gate:** sync, async, uninterrupted, and checkpoint-resumed runs have identical accepted iteration records and final numerical state for deterministic objectives.

### Stage 10: Documentation, benchmarks, and release integration

1. Finish README decision guides for derivative source, optimizer selection, bounds, robust loss, roots, cancellation, and checkpoint limitations.
2. Add runnable examples for bounded regression, autodiff training, robust curve fitting, scalar roots, vector roots, async progress, and checkpoint/resume.
3. Add benchmarks and store machine-readable baselines without using elapsed time as a correctness assertion.
4. Add a changeset for `@stopcock/optimize` 1.0 and any documentation-only changes to Autodiff/LA.
5. Add Optimize to repository-wide non-synth build, test, lint, typecheck, package-isolation, and publish selection.
6. Pack the package, install it into a clean consumer, and run ESM import and declaration smoke tests under the repository-supported Node and Bun versions.

**Gate:** all release acceptance criteria below pass from a clean checkout and from the packed artifact.

## Test matrix

### Codec and type tests

- scalar, zero/one/many-length vector, matrix, tuple, array, nested struct, and custom round trips;
- lexicographic struct layout independent of input object creation order;
- canonical descriptor/signature snapshots;
- output reuse and offset boundary checks;
- alias protection and mutation-after-pack/unpack tests;
- malformed model, wrong matrix dimensions, cyclic graph, dynamic length, NaN, and typed-array rejection;
- compile-only inference for native and structured problems;
- declaration tests for every public subpath and no `any` leakage in result/trace unions.

### Derivative tests

- explicit combined versus separate count parity;
- autodiff values and gradients against analytic derivatives;
- central/forward finite differences against analytic gradients/Jacobians over scale-varied fixtures;
- feasible one-sided stencils at lower and upper bounds;
- fixed-coordinate derivative zero;
- wrong gradient/Jacobian shape and non-finite derivative failures;
- randomized derivative checks against smooth polynomial and trigonometric fixtures.

### Minimizer tests

- convex quadratic, Rosenbrock, ill-conditioned diagonal, flat valley, and bound-active minima;
- fixed dimensions and all-fixed problems;
- schedule values and optimizer update sequences;
- AdamW’s decoupled decay ordering;
- L-BFGS-B Cauchy point, active-set, subspace, strong-Wolfe, curvature-skip, and fallback fixtures;
- Nelder-Mead duplicate vertices, projected simplex, deterministic ties, shrink, and nonsmooth objectives;
- explicit `maxIterations = 0`, exact evaluation budgets, callback stop, abort, and later non-finite partial results.

### Least-squares tests

- exact linear fit and noisy nonlinear curve fit;
- underdetermined and overdetermined systems where supported by residual count, while parameter size remains fixed;
- row-major flat Jacobian versus `Mat` equivalence;
- linear, Huber, Cauchy, and soft-L1 cost/weight table tests;
- outlier robustness, active bounds, singular normal equations, QR fallback, damping rejection/acceptance, and retry exhaustion;
- explicit, finite-difference, and autodiff Jacobian result agreement.

### Root tests

- roots at endpoints, interior roots, narrow/wide brackets, reversed/invalid brackets, flat derivatives, discontinuities, and non-finite trial points;
- Brent bracket invariant after every trace record;
- safeguarded Newton rejection to bisection;
- square vector polynomial systems, scaled systems, bound-active roots, singular Jacobians, Broyden restart, and no-root stagnation;
- reject non-square vector systems and incorrectly shaped Jacobians before advancing.

### Session and checkpoint tests

- every legal and illegal lifecycle transition;
- defensive snapshots when callbacks mutate nested decoded models;
- ring retention, cadence, dropped counts, and trace omission from checkpoints;
- callback exception and objective exception checkpoint boundary behavior;
- pre-aborted and mid-run signals under sync limitations and async scheduling;
- malformed schema, wrong codec signature, wrong solver/method, bad lengths/counters, non-finite checkpoint state, and problem mismatch;
- bit-for-bit packed positions, state arrays, counters, traces, reasons, and RNG state across uninterrupted versus resumed runs for every method;
- JSON stringify/parse round trip before resume.

### Cross-runtime and packaging tests

- Node and Bun unit/integration suites;
- supported browser test runner for sync and cooperative async paths;
- ESM-only consumer import of root and all public subpaths;
- packed tarball install with no workspace resolution;
- no Node built-in imports in browser-reachable modules;
- side-effect check: importing any entrypoint creates no timers, workers, random state, or global registrations;
- tree-shaking smoke test for importing only schedules or codecs.

## Benchmarks

Benchmarks are regression signals, not correctness gates. Capture median, p95, allocations where available, iteration/evaluation counts, and final error for:

- pack/unpack for 10, 1,000, and 100,000 parameters;
- analytic versus autodiff versus finite-difference gradient evaluation;
- each first-order method on 1K and 100K diagonal quadratics;
- L-BFGS-B with 10, 1K, and 10K parameters at multiple active-bound ratios;
- Nelder-Mead at 2, 8, and 20 dimensions;
- LM at `(residuals, parameters)` sizes `(100, 5)`, `(10_000, 20)`, and `(1_000, 100)`;
- Brent and safeguarded Newton on cheap and expensive objectives;
- trust-region Newton and Broyden at 5, 50, and 200 variables;
- trace disabled, callback-only, and maximum retained trace overhead;
- uninterrupted versus checkpoint/resume overhead;
- sync versus cooperative async numerical parity and scheduling overhead.

Store fixtures and benchmark configuration in source control. Report solver counts alongside time so a speed change caused by different numerical behavior is visible.

## Documentation requirements

The README must include:

- a two-minute native `Float64Array` minimization example;
- a nested structured model codec example and its deterministic packed layout;
- a method-selection table explaining first-order methods, L-BFGS-B, and Nelder-Mead;
- explicit gradient, autodiff, and finite-difference examples with evaluation-cost warnings;
- bounds semantics, including rejection of infeasible initial points;
- robust LM fitting with outliers;
- scalar Brent and vector Broyden examples;
- schedule plots or value tables without adding a charting dependency;
- callback, trace, cancellation, and cooperative async examples;
- checkpoint JSON storage and resume, including objective exclusion and deterministic-objective requirements;
- failure semantics that distinguish thrown configuration errors from partial algorithmic results;
- bundle/runtime compatibility and the direct Autodiff/LA dependency statement.

Add API docs for every exported type and function. Every option must state its default, units, valid range, and checkpoint behavior.

## Release acceptance criteria

The 1.0 work is complete only when all of the following are true:

- every method in the closed minimizer, least-squares, and root unions is implemented and exported;
- structured codecs round-trip and produce stable signatures across Node, Bun, and browser runs;
- explicit derivatives, finite differences, and documented autodiff paths are tested;
- all bounded iterates observed by callbacks are feasible;
- L-BFGS-B includes generalized Cauchy and subspace phases;
- robust LM implements all four documented losses and bounded projected steps;
- Brent preserves a sign-changing bracket and vector roots enforce square systems;
- sync and cooperative async runs are numerically identical;
- every method resumes exactly from a JSON-round-tripped checkpoint;
- initial invalid/non-finite states throw and later non-finite states return the last valid partial result;
- public traces and results cannot mutate active or completed solver state;
- declaration, lint, unit, integration, browser, package-isolation, and tarball consumer checks pass;
- the README examples execute against the packed package;
- repository-wide automation includes Optimize while continuing to exclude Synth;
- a changeset marks the complete package for `1.0.0`.

Do not call the package 1.0-ready if any method is a placeholder, any checkpoint omits method state, the bounded quasi-Newton implementation is projection-only, async changes accepted iterate order, or examples import workspace source paths.
