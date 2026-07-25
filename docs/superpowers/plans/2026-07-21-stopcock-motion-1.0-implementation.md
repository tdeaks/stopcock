# `@stopcock/motion` 1.0 implementation plan

## Outcome

Build a public, renderer-independent motion package whose core abstraction is a deterministic `time -> value` function, then layer direct DOM playback, Web Animations API interoperability, and accessible pointer/keyboard gestures behind browser-only subpaths.

The package must fit Stopcock rather than imitate a framework animation library:

- Motions are immutable, sampleable values that compose through ordinary functions and `pipe`.
- Pure construction and sampling do not read clocks, browser globals, layout, or global preferences.
- Playback, DOM writes, WAAPI objects, and event listeners are explicit stateful resources with disposal.
- Color, SVG, Geo, and State integration are optional subpaths; importing the root cannot pull those packages or browser code into a bundle.
- The complete surface described here is the 1.0 contract. The package remains private at `0.0.0` until every release gate passes, then publishes as `1.0.0`.

## Scope boundaries

### Included in 1.0

- Tween, keyframes, analytic spring, inertia, constant, mapping, delay, reverse, repeat, sequence, parallel composition, and labelled timelines.
- Built-in easing and reusable interpolators for scalar, array, typed-array, record, discrete, color, affine-transform, SVG-path, and Geo-path values.
- A scheduler-independent playback controller with pause, resume, seek, speed, cancellation, completion, and `AbortSignal` support.
- Direct style, CSS custom-property, SVG-attribute, and transform animation.
- WAAPI compilation for representable motions, adoption of existing `Animation` objects, and request-animation-frame fallback for non-representable motions.
- Drag, press, hover, and in-view gestures with deterministic cleanup and accessible keyboard press behavior.
- `prefers-reduced-motion` handling in the DOM layer.

### Excluded from 1.0

- Layout measurement animation, shared-element transitions, and FLIP.
- Scroll-linked timelines and scroll-triggered choreography.
- React, Vue, Svelte, Solid, or other framework bindings.
- A general physics world, collision engine, or multi-body constraints.
- Automatic morphing of arbitrary SVG path topology without the Geo adapter.
- CSS layout-property unit conversion that requires continual layout reads.

## Repository integration

### Package and exports

Create `packages/motion` with the same ESM-only conventions as the existing packages:

- `type: "module"`, `sideEffects: false`, `files: ["dist"]`.
- `build: "tsup && tsc --emitDeclarationOnly"`.
- Runtime dependency on `@stopcock/fp` for dual forms and pipeline conventions.
- Optional peer dependencies for `@stopcock/color`, `@stopcock/svg`, `@stopcock/geo`, and `@stopcock/state`, each referenced only by its adapter entrypoint.
- Explicit exports for `.`, `./color`, `./svg`, `./geo`, `./state`, `./dom`, `./waapi`, and `./gestures`.
- The root build graph, root Vitest discovery, Changesets configuration, and documentation app must include Motion without changing the private or excluded treatment of `@stopcock/synth`.

Use one source entry per public subpath. Browser globals may appear only in `dom`, `waapi`, and `gestures`, and must be read lazily inside functions so importing those modules remains safe during SSR.

### Existing seams

- `@stopcock/color` already exposes immutable color values and mixing; the Motion color adapter delegates to that rather than introducing another color parser.
- `@stopcock/svg` represents transforms as six-number affine matrices and paths as typed command arrays. Motion must improve the current approximate `lerpTransform` implementation to perform real affine decomposition, shortest-arc rotation, shear, reflection, and exact endpoints before depending on it.
- The Geo adapter consumes packed paths from the new `@stopcock/geo`; Motion core must not depend on Geo directly.
- The State adapter writes sampled values through public store/update seams and owns no store lifecycle.

## Public API contract

### Core types

```ts
export type Milliseconds = number

export type Easing = (progress: number) => number

export type Interpolator<T> = (
  from: Readonly<T>,
  to: Readonly<T>,
  progress: number,
) => T

export interface Motion<T> {
  readonly duration: Milliseconds
  sample(time: Milliseconds): T
}

export type MotionValue<M> = M extends Motion<infer T> ? T : never
```

`Motion` values are immutable. Implementations may keep a package-private recipe descriptor for WAAPI compilation, but no public code may rely on it and it must not alter sampling.

### Constructors

```ts
export interface TweenOptions<T> {
  readonly duration: number
  readonly easing?: Easing
  readonly interpolate?: Interpolator<T>
}

export interface KeyframeOptions<T> {
  readonly duration: number
  readonly offsets?: readonly number[]
  readonly easing?: Easing | readonly Easing[]
  readonly interpolate?: Interpolator<T>
}

export interface SpringOptions<T> {
  readonly stiffness?: number
  readonly damping?: number
  readonly mass?: number
  readonly velocity?: number
  readonly restSpeed?: number
  readonly restDelta?: number
  readonly maxDuration?: number
  readonly interpolate?: Interpolator<T>
}

export function constant<T>(value: T, duration?: number): Motion<T>

export function tween<T>(
  from: T,
  to: T,
  options: TweenOptions<T>,
): Motion<T>

export function keyframes<T>(
  values: readonly T[],
  options: KeyframeOptions<T>,
): Motion<T>

export function spring<T>(
  from: T,
  to: T,
  options?: SpringOptions<T>,
): Motion<T>

export function inertia(
  from: number,
  options: {
    velocity: number
    power?: number
    timeConstant?: number
    min?: number
    max?: number
    bounce?: Partial<Omit<SpringOptions<number>, 'interpolate'>>
    restSpeed?: number
    maxDuration?: number
  },
): Motion<number>
```

Rules:

- Durations, times, physical parameters, values used by numeric constructors, and offsets must be finite.
- Sampling clamps negative time to zero and time beyond `duration` to the final sample.
- Zero-duration motions always return the exact final value.
- Tween and keyframe endpoints return the exact supplied endpoint values without interpolation drift.
- Keyframes require at least two values. Offsets must match the value count, begin at `0`, end at `1`, and increase strictly.
- One easing applies to all keyframe segments; an easing array must have `values.length - 1` entries.
- The default interpolator exists only for numbers. Other types require an explicit interpolator or an adapter constructor.

### Composition

```ts
export const sample: {
  <T>(motion: Motion<T>, time: number): T
  (time: number): <T>(motion: Motion<T>) => T
}

export const map: {
  <A, B>(motion: Motion<A>, fn: (value: A) => B): Motion<B>
  <A, B>(fn: (value: A) => B): (motion: Motion<A>) => Motion<B>
}

export function delay<T>(motion: Motion<T>, milliseconds: number): Motion<T>
export function reverse<T>(motion: Motion<T>): Motion<T>

export function repeat<T>(
  motion: Motion<T>,
  options: {
    count: number
    direction?: 'normal' | 'alternate'
    gap?: number
  },
): Motion<T>

export function sequence<T>(motions: readonly Motion<T>[]): Motion<T>

export function parallel<M extends Record<string, Motion<unknown>>>(
  motions: M,
): Motion<{ [K in keyof M]: MotionValue<M[K]> }>

export type TimelineClip<T> = {
  readonly at: number
  readonly motion: Motion<T>
}

export function timeline<T extends Record<string, readonly TimelineClip<unknown>[]>>(
  tracks: T,
): Motion<TimelineValues<T>>
```

Composition semantics:

- `delay` holds the initial value during its delay.
- At an exact `sequence` boundary, the next motion owns the sample; the total endpoint belongs to the final motion.
- `repeat.count` is a positive finite integer. Infinite repetition is excluded because every `Motion` has finite duration.
- Repeat gaps hold the preceding cycle endpoint. Alternate cycles reverse the child motion before applying the same boundary rules.
- Parallel children begin at zero; children that finish early hold their final values.
- Timeline clips on one track must be ordered, non-overlapping, and use non-negative `at` times. Before the first clip the track holds its initial value; gaps and time after the last clip hold the most recent endpoint. At a shared boundary the new clip wins.
- Mapping makes the recipe non-WAAPI-representable unless the adapter recognizes the mapper; sampling remains valid.

### Easing and core interpolators

Export `Easing` and `Interpolate` namespaces:

```ts
Easing.linear
Easing.inQuad / outQuad / inOutQuad
Easing.inCubic / outCubic / inOutCubic
Easing.inQuart / outQuart / inOutQuart
Easing.cubicBezier(x1, y1, x2, y2)
Easing.steps(count, 'start' | 'end')

Interpolate.number
Interpolate.discrete<T>(threshold?: number)
Interpolate.array<T>(element: Interpolator<T>)
Interpolate.float32
Interpolate.float64
Interpolate.object<T>(spec: { [K in keyof T]: Interpolator<T[K]> })
```

- Cubic Bézier requires x control points in `[0, 1]`; solve through Newton iteration with bisection fallback.
- Composite interpolators allocate fresh outputs for non-endpoint samples and preserve exact endpoint references at `0` and `1`.
- Typed-array interpolation rejects mismatched lengths before creating the motion.

## Physical motion implementation

### Springs

- Implement analytic underdamped, critically damped, and overdamped oscillator solutions over a normalized scalar displacement.
- Defaults: stiffness `170`, damping `26`, mass `1`, initial velocity `0`, rest speed `0.01`, rest delta `0.001`, and maximum duration `10_000ms`.
- Determine duration using a deterministic fixed-resolution search followed by binary refinement for the first time both rest conditions remain satisfied for two consecutive samples.
- If no rest point exists before `maxDuration`, use `maxDuration`; the sample at and beyond that time is forced to the exact target.
- Generic springs calculate scalar progress from the analytic solution and pass it to the selected interpolator. Overshoot is preserved unless that interpolator deliberately clamps.

### Inertia

- Model free motion as exponential velocity decay with configurable power and time constant.
- Without bounds, terminate at the first deterministic rest-speed crossing or `maxDuration`.
- When the projected endpoint crosses `min` or `max`, splice to an analytic spring at the first boundary crossing while preserving boundary velocity.
- Reject `min > max`, an initial value outside bounds, non-positive time constants, and invalid bounce spring settings.

## Playback runtime

### Scheduler and controller

```ts
export interface FrameScheduler {
  now(): number
  request(callback: (time: number) => void): unknown
  cancel(handle: unknown): void
}

export type PlaybackState = 'running' | 'paused' | 'finished' | 'cancelled'

export interface Playback {
  readonly state: PlaybackState
  readonly currentTime: number
  readonly speed: number
  readonly finished: Promise<'finished' | 'cancelled'>
  pause(): void
  resume(): void
  seek(time: number): void
  setSpeed(speed: number): void
  cancel(reason?: unknown): void
}

export interface PlaybackOptions {
  readonly scheduler?: FrameScheduler
  readonly signal?: AbortSignal
  readonly from?: number
  readonly speed?: number
}

export function play<T>(
  motion: Motion<T>,
  onUpdate: (value: T, time: number) => void,
  options?: PlaybackOptions,
): Playback
```

- The default scheduler uses `requestAnimationFrame` when available and a monotonic `setTimeout` fallback otherwise.
- Emit the initial sample synchronously, then at most once per scheduled frame, and emit the exact final sample once.
- Speed must be positive and finite. Changing it rebases the clock so motion time remains continuous.
- Pause/resume preserves elapsed motion time. Seek clamps and emits immediately, including while paused.
- Completion and cancellation are idempotent. Cancellation or abort resolves `finished` as `cancelled` and prevents later writes.
- An `onUpdate` exception cancels outstanding scheduling and rejects `finished` with that exception.
- A pre-aborted signal creates an already-cancelled controller and performs no update.

## Adapter plans

### `@stopcock/motion/color`

- Export `color(space = 'oklab', options?)` as an `Interpolator<Color>` and `colorTween` as a convenience constructor.
- Delegate conversion, hue strategy, gamut policy, and mixing to `@stopcock/color`.
- Preserve exact color endpoints; default to perceptual OKLab interpolation.

### `@stopcock/motion/svg`

- Export affine-matrix and compatible-path interpolators plus convenience tween constructors.
- Correct `@stopcock/svg/la` affine interpolation first: decompose translation, rotation, scale, shear, and reflection; take the shortest rotation arc; recompose without discarding negative determinant or shear.
- Compatible SVG paths must have identical command counts and command letters. Interpolate coordinates and radii linearly; choose arc flags at progress `0.5`. Reject incompatibility at construction.
- Keep general path resampling out of this adapter; route it through Motion Geo.

### `@stopcock/motion/geo`

- Export `resamplePath(path, count)`, `pathInterpolator(options)`, and `pathTween` for packed planar paths.
- Normalize direction and closed-ring start index deterministically, then resample both inputs to the same caller-selected or automatically selected count by cumulative arc length.
- Preserve closure and use Geo’s packed `Float64Array` representation. Reject mixing open and closed paths unless explicitly allowed.

### `@stopcock/motion/state`

```ts
export function playIntoStore<S extends object, T>(
  motion: Motion<T>,
  store: Store<S>,
  accessor: Accessor<S, T>,
  options?: PlaybackOptions,
): Playback

export function playIntoHandle<T>(
  motion: Motion<T>,
  handle: Handle<T>,
  options?: PlaybackOptions,
): Playback
```

- Use `store.set(accessor, value)` or `handle.set(value)` once per sampled frame through the existing public State contracts.
- State remains caller-owned. Cancellation stops writes but does not dispose or reset the store.
- Batch at most one state commit per animation frame.

### `@stopcock/motion/dom`

```ts
export type DomBindings = {
  readonly style?: Readonly<Record<string, Motion<string | number>>>
  readonly attribute?: Readonly<Record<string, Motion<string | number>>>
}

export type DomPlayback = Omit<Playback, 'cancel'> & {
  cancel(options?: { readonly restore?: boolean; readonly reason?: unknown }): void
}

export function animateDom(
  target: Element | string,
  bindings: DomBindings,
  options?: PlaybackOptions & {
    driver?: 'auto' | 'raf' | 'waapi'
    reduce?: 'user' | 'always' | 'never'
  },
): DomPlayback

export function cssTween(
  from: string | number,
  to: string | number,
  options: TweenOptions<string | number>,
): Motion<string | number>
```

- Resolve a selector once at playback start and throw when it does not identify exactly one element.
- Parse and interpolate unit-compatible numeric CSS values, opacity, colors, CSS custom properties, and 2D transform lists.
- Normalize transform lists into affine components before interpolation. Do not silently convert incompatible units such as `%` and `px`; require a caller-provided interpolator.
- Write styles through `CSSStyleDeclaration.setProperty` and SVG/HTML attributes through `setAttribute`.
- Capture no baseline for restoration by default. `cancel({ restore: true })` may restore values captured once at start.
- `reduce: 'user'` checks `prefers-reduced-motion` once at start and listens for changes while active. Reduced playback applies final values synchronously and reports completion without scheduling frames.
- Batch writes for all bindings into a single frame callback.

### `@stopcock/motion/waapi`

- Export `canCompileWaapi`, `compileWaapi`, `playWaapi`, and `adoptAnimation`.
- Compile tween, keyframe, delay, finite repeat, sequence, parallel, and compatible timeline recipes when every bound property can be expressed as keyframes.
- Springs, inertia, arbitrary `map`, custom interpolators, Geo morphs, and callbacks are not compiled; `driver: 'auto'` falls back to RAF and `driver: 'waapi'` throws `UnsupportedWaapiMotionError`.
- Normalize the native `Animation` into the same `Playback` state, seek, speed, cancel, abort, and completion semantics.
- Treat native `cancel` as package cancellation rather than an unhandled rejected `finished` promise.

### `@stopcock/motion/gestures`

```ts
export interface GestureController {
  readonly active: boolean
  dispose(): void
}

export interface DragSample {
  readonly x: number
  readonly y: number
  readonly deltaX: number
  readonly deltaY: number
  readonly velocityX: number
  readonly velocityY: number
  readonly source: PointerEvent
}

export interface DragOptions {
  readonly axis?: 'x' | 'y' | 'both'
  readonly constraints?:
    | { readonly minX?: number; readonly maxX?: number; readonly minY?: number; readonly maxY?: number }
    | (() => { readonly minX?: number; readonly maxX?: number; readonly minY?: number; readonly maxY?: number })
  readonly release?: false | { readonly kind: 'inertia' } | { readonly kind: 'spring' }
  readonly touchAction?: string
  readonly signal?: AbortSignal
  readonly onStart?: (sample: DragSample) => void
  readonly onMove?: (sample: DragSample) => void
  readonly onEnd?: (sample: DragSample, release?: Motion<readonly [number, number]>) => void
  readonly onCancel?: (reason: unknown) => void
}

export interface PressOptions {
  readonly disabled?: boolean
  readonly signal?: AbortSignal
  readonly onChange?: (pressed: boolean) => void
  readonly onStart?: (event: PointerEvent | KeyboardEvent) => void
  readonly onEnd?: (event: PointerEvent | KeyboardEvent) => void
  readonly onPress?: (event: PointerEvent | KeyboardEvent) => void
  readonly onCancel?: (reason: unknown) => void
}

export interface HoverOptions {
  readonly signal?: AbortSignal
  readonly onChange: (hovered: boolean, event: PointerEvent) => void
}

export interface InViewOptions {
  readonly root?: Element | Document | null
  readonly rootMargin?: string
  readonly threshold?: number | readonly number[]
  readonly once?: boolean
  readonly signal?: AbortSignal
  readonly onChange: (visible: boolean, entry: IntersectionObserverEntry) => void
}

export function drag(element: Element, options: DragOptions): GestureController
export function press(element: Element, options: PressOptions): GestureController
export function hover(element: Element, options: HoverOptions): GestureController
export function inView(element: Element, options: InViewOptions): GestureController
```

- Drag uses Pointer Events and pointer capture, supports x/y/both axes, numeric or pointer-down-resolved constraints, velocity estimation, and optional inertia/spring release.
- Resolve layout-dependent constraints only at pointer down, not every frame. Document the required `touch-action`; if the helper changes it, restore the previous value on disposal.
- Press covers pointer activation plus Enter and Space. Prevent duplicate click/keyboard activation and expose start, end, cancel, and change callbacks.
- Hover ignores touch pointers and uses enter/leave semantics that do not bubble unexpectedly.
- In-view uses `IntersectionObserver`, supports threshold/root/rootMargin/once, and reports unavailable APIs explicitly.
- Every controller accepts `AbortSignal`, owns only its own listeners/observer/capture, and has idempotent cleanup.

## Errors and defensive behavior

Export typed errors for invalid motion definitions, interpolation mismatch, missing DOM targets, unsupported WAAPI compilation, and disposed browser controllers.

- Validate complete definitions before starting playback or registering listeners.
- Do not mutate input arrays, records, SVG paths, Geo buffers, or keyframe arrays.
- Browser adapters must fail with clear capability errors when their required platform API is absent.
- Listener callbacks may throw; clean up owned resources before rethrowing or rejecting completion.
- Device refresh rate must not affect sampled values at the same timestamps.

## Implementation sequence

### Phase 1: Package scaffold and core sampling

- [ ] Add package manifest, TypeScript configuration, tsup entries, source index, README, changelog, and private `0.0.0` state.
- [ ] Implement shared validation, `Motion`, recipe metadata, endpoint helpers, and numeric/discrete interpolators.
- [ ] Implement constant, tween, keyframes, sample, and map with data-first/data-last forms where natural.
- [ ] Add runtime and declaration tests before adding stateful playback.

### Phase 2: Composition and physical motion

- [ ] Implement easing functions and cubic-Bézier solver.
- [ ] Implement delay, reverse, repeat, sequence, parallel, and timeline boundary semantics.
- [ ] Implement analytic spring and deterministic duration detection.
- [ ] Implement inertia and bounded spring hand-off.
- [ ] Add property tests for exact endpoints, finite sampling, composition identities, and time clamping.

### Phase 3: Playback

- [ ] Implement injected scheduler, default RAF/timeout scheduler, controller state machine, cancellation, speed rebasing, and completion promise.
- [ ] Add a fake scheduler used by all timing tests.
- [ ] Prove no callback can occur after cancellation, abort, completion, or a callback exception.

### Phase 4: Value adapters

- [ ] Add Color adapter and endpoint/gamut tests.
- [ ] Correct SVG affine interpolation and add SVG matrix/path adapters without changing existing API signatures.
- [ ] Add Geo resampling/morph adapter after Geo reaches a stable public representation.
- [ ] Add State playback adapter with one commit per scheduled frame.

### Phase 5: Browser drivers

- [ ] Implement CSS token parsing, transform decomposition, DOM bindings, write batching, baseline restoration, and reduced-motion behavior.
- [ ] Implement WAAPI recipe analysis, compilation, native controller normalization, and RAF fallback.
- [ ] Add happy-dom unit coverage and real-browser coverage for computed platform behavior.

### Phase 6: Gestures

- [ ] Implement shared disposable controller and AbortSignal ownership.
- [ ] Implement drag/capture/constraints/velocity/release, then press, hover, and in-view.
- [ ] Verify keyboard equivalence, touch-pointer behavior, listener restoration, and observer cleanup.

### Phase 7: Documentation, performance, and release

- [ ] Add package README, `libraries/motion.mdx`, API examples for every subpath, and package-catalogue/sidebar entries.
- [ ] Build a Motion Lab showcase with scrubber, easing/spring controls, DOM/WAAPI driver display, SVG/Geo morph, reduced-motion toggle, and gesture examples.
- [ ] Add benchmark coverage and clean packed-package import fixtures.
- [ ] Remove `private`, add the major Changeset, and publish only after all gates below pass.

## Test matrix

### Runtime and property tests

- Exact initial/final sampling, negative/overflow time, zero duration, invalid durations, and immutable inputs.
- Every keyframe offset/easing boundary and malformed offsets.
- Sequence, repeat, alternate, delay, gaps, parallel, empty timeline, timeline gaps, shared boundaries, and overlap rejection.
- All spring damping regimes, overshoot, duration refinement, max-duration fallback, and exact target forcing.
- Inertia free decay, each bound, boundary velocity continuity, and invalid bounds.
- Reverse symmetry and repeat/sequence equivalence properties over generated finite motions.
- Fake-clock playback covering pause/resume/seek/speed, abort timing, cancellation races, callback errors, and idempotency.
- Color, SVG, Geo, State, DOM, WAAPI, and gesture tests isolated by subpath.

### Type tests

- Generic interpolator inference and rejection of nonnumeric tweening without an interpolator.
- Parallel and timeline output-record inference.
- Optional adapter peer imports do not leak into the root declarations.
- DOM binding key/value acceptance, Playback state narrowing, and gesture option unions.

### Browser tests

- RAF and WAAPI values at fixed timestamps, pause/seek/speed parity, native finish/cancel normalization, and fallback selection.
- Style/custom-property/SVG-attribute/transform writes and optional restoration.
- Live `prefers-reduced-motion` changes.
- Pointer capture, lost capture, Escape/cancel, keyboard press, touch filtering, observer thresholds, and cleanup after removal.

### Benchmarks

- Scalar tween and spring sampling.
- 100-track and 1,000-keyframe timelines.
- Color, affine matrix, 1,000-command SVG path, and 10,000-point Geo interpolation.
- RAF binding of 1, 10, and 100 properties versus equivalent handwritten updates.
- WAAPI compilation time and native-vs-RAF main-thread cost.

Benchmark results document overhead and regression trends; external-library timing is informational rather than a release gate.

## 1.0 acceptance gate

- Root import is pure, SSR-safe, tree-shakeable, and does not load adapter peers.
- Every motion returns deterministic values for a fixed timestamp, independent of scheduler cadence.
- Browser resources have idempotent disposal and produce no writes after completion or cancellation.
- WAAPI and RAF agree at defined timestamps for representable motions.
- Reduced-motion and keyboard press behavior pass browser accessibility tests.
- Package build, runtime tests, declaration tests, browser tests, docs build, benchmark correctness checks, and packed-tarball Node/Bun import tests pass.
- Existing SVG behavior remains compatible apart from the intended correctness improvement to affine interpolation.
- Root README, docs catalogue, sidebar, API reference, showcase, and Changeset are complete.
- No CI, build, test, or publishing command is broadened to include `@stopcock/synth`.
