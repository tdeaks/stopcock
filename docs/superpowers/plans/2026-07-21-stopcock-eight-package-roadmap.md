# Stopcock eight-package 1.0 roadmap

## Summary

Add eight independently publishable packages while preserving Stopcock’s existing principles: data-first/data-last APIs, typed-array-friendly representations, deterministic behavior, fusion where useful, ESM-only output, and no third-party runtime dependencies.

| Release wave | Package | Required Stopcock dependencies |
|---|---|---|
| 1 | `@stopcock/compute` | None; optional `@stopcock/la` peer for its adapter |
| 2 | `@stopcock/optimize` | `autodiff`, `la` |
| 2 | `@stopcock/geo` | `fp` |
| 2 | `@stopcock/sketch` | `fp` |
| 3 | `@stopcock/table` | `fp`; optional `compute` acceleration |
| 3 | `@stopcock/vision` | `img`, `geo`, `la`; optional `compute` acceleration |
| 3 | `@stopcock/motion` | `fp`; adapter-specific `color`, `svg`, `geo`, and `state` peers |
| 3 | `@stopcock/procgen` | `fp`, `geo`; optional `compute`, `color`, and `svg` adapters |

Packages within a wave release independently once their own gates pass. Each starts as private `0.0.0`, becomes public only after its complete 1.0 surface passes its acceptance gates, and receives a major Changeset for `1.0.0`. `@stopcock/synth` remains outside build, test, documentation, and publishing automation.

## Detailed package plans

- [`@stopcock/compute` 1.0 implementation](./2026-07-21-stopcock-compute-1.0-implementation.md)
- [`@stopcock/optimize` 1.0 implementation](./2026-07-21-stopcock-optimize-1.0-implementation.md)
- [`@stopcock/geo` 1.0 implementation](./2026-07-21-stopcock-geo-1.0-implementation.md)
- [`@stopcock/sketch` 1.0 implementation](./2026-07-21-stopcock-sketch-1.0-implementation.md)
- [`@stopcock/table` 1.0 implementation](./2026-07-21-stopcock-table-1.0-implementation.md)
- [`@stopcock/vision` 1.0 implementation](./2026-07-21-stopcock-vision-1.0-implementation.md)
- [`@stopcock/motion` 1.0 implementation](./2026-07-21-stopcock-motion-1.0-implementation.md)
- [`@stopcock/procgen` 1.0 implementation](./2026-07-21-stopcock-procgen-1.0-implementation.md)

## Shared implementation contract

- Support the repository’s pinned active Node LTS and Bun versions plus current evergreen browsers. Keep Deno as a non-blocking ESM smoke test.
- Keep root entrypoints side-effect-free and browser-global-free. Browser, worker, WebGPU, DOM, and native adapters live behind explicit subpath exports.
- Use only Stopcock runtime dependencies. Test, fixture-generation, and benchmark-only dependencies may use ecosystem libraries.
- Use closed, serializable ASTs wherever execution may cross workers or lower to Compute. Builder callbacks may construct symbolic nodes, but callback source is never parsed or serialized.
- Stateless transforms follow existing pipe conventions. Stateful objects—optimizer sessions, sketches, runtimes, worker pools, and playback controllers—use explicit mutation and disposal APIs.
- Every package ships API documentation, recipes, one interactive showcase, type tests, property tests where relevant, and clean-install tests from the packed tarball.
- Existing package APIs remain compatible. Cross-package additions such as `@stopcock/svg/geo`, LA's `getAccelerator()`, and LA's `VecValue`/`MatValue` type aliases are additive.

## Package plans

### 1. `@stopcock/compute`

**Purpose:** A shared execution runtime for fused numeric kernels, first-party WASM acceleration, optional WebGPU, and worker execution.

**Public surface**

- Export `DType`, `TensorView`, `KernelProgram`, `Expr`, `CompiledKernel`, `ComputeRuntime`, `Backend`, `ExecutionReport`, and structured capability/error types.
- Support dense rank 0–4 views using `f32`, `f64`, `i32`, and `u32`, with shape, offset, strides, broadcasting, and caller-owned output buffers.
- Support explicit rank 0–4 output domains with closed `index(axis)`/`size(axis)` nodes so procedural kernels can generate grids and volumes without coordinate input arrays.
- Provide a symbolic kernel builder covering arithmetic, comparison, selection, common scalar math, casts, elementwise maps, reductions, dot products, matrix multiplication, fixed-window stencils, and 1D/2D convolution.
- Builder functions execute once to create AST nodes; arbitrary JavaScript callbacks cannot appear in a program.
- Expose:
  - Root CPU interpreter/compiler with synchronous `runSync`.
  - `createComputeRuntime({ backend, fallback, workers })` with asynchronous `compile`, `run`, `explain`, and `dispose`.
  - `backend: "auto" | "cpu" | "wasm" | "webgpu"` and `fallback: "allow" | "error"`.
  - Browser and Node worker-pool subpaths with queued/running cancellation and explicit transfer ownership.
  - `@stopcock/compute/la` for scoped installation of a synchronous CPU/WASM LA accelerator.

**Implementation**

- Make the TypeScript interpreter the normative reference for every operation.
- Compile closed ASTs to generated JavaScript for hot CPU paths, with a CSP-safe interpreter fallback and a bounded LRU cache.
- Implement an in-repository Rust/WASM backend with scalar and SIMD variants. Package the built WASM artifact and fall back to TypeScript if initialization or SIMD detection fails.
- Lower supported `f32`, `i32`, and `u32` kernels to WGSL. Unsupported operations, `f64`, device loss, or size thresholds fall back automatically unless fallback is disabled.
- Select `auto` backends using supported operations, dtype, input size, transfer cost, and benchmark-derived crossover profiles.
- Validate shapes, dtypes, bounds, and output capacity before execution. Reject unsafe aliasing except for kernels explicitly compiled as in-place elementwise operations.
- Add `getAccelerator()` to `@stopcock/la`. `installLaAccelerator(runtime)` must return a disposer that restores the previous accelerator only when the installed accelerator is still active.

**1.0 gate**

- Exact CPU interpreter/compiler agreement for integer operations and tolerance-based agreement for floating-point operations.
- CPU/WASM parity across randomized programs, shapes, views, and aliasing cases.
- Conditional WebGPU parity tests on available hardware; lack of WebGPU is not a release failure.
- Worker cancellation, transfer, crash recovery, disposal, and device-loss tests.
- Benchmark gates for internal regressions and fusion benefits; competitor timings remain informational.

### 2. `@stopcock/optimize`

**Purpose:** Turn autodiff functions and ordinary numerical objectives into production-grade optimization, fitting, and root-finding workflows.

**Public surface**

- Accept scalar, `Vec`, and `Mat` parameters natively.
- Export `ParameterCodec<Model>` for deterministic packing and unpacking of structured models through `Float64Array`.
- Provide `minimize`, `createOptimizationSession`, `leastSquares`, `findRoot`, and `findRoots`.
- Return `OptimizeResult<P>` containing position, objective value, convergence state, stop reason, iteration/evaluation counts, and an optional immutable trace.
- Support iteration callbacks, `AbortSignal`, synchronous `run`, cooperative `runAsync`, and serializable checkpoints.
- Ship:
  - Adam, AdamW, SGD, momentum, Nesterov, and RMSProp.
  - Projected bounds for gradient methods.
  - Full L-BFGS-B with generalized Cauchy point and subspace minimization.
  - Nelder–Mead.
  - Levenberg–Marquardt with Huber, Cauchy, and soft-L1 robust losses.
  - Brent–Dekker and safeguarded Newton scalar roots.
  - Trust-region Newton and Broyden vector roots.
  - Constant, exponential, step, polynomial, cosine, warmup-cosine, and one-cycle schedules.

**Implementation**

- Flatten parameters internally in row-major order while restoring the exact public shape through native adapters or the supplied codec.
- Consume `DiffFn` objectives directly and also accept explicit value/gradient or residual/Jacobian functions.
- Use strong-Wolfe line search where applicable and LA primitives for linear solves.
- Apply bounds consistently; fixed dimensions remain fixed. General equality and nonlinear constraints are outside 1.0.
- Treat invalid initial values as input errors. A later non-finite evaluation terminates with the last finite state and a specific stop reason.
- Checkpoints contain method name, version, configuration, packed parameters, method state, counters, and RNG state. They never serialize the objective closure.
- Preserve trace values defensively so later session mutation cannot change earlier observations.

**1.0 gate**

- Standard convex, ill-conditioned, bounded, nonlinear least-squares, and derivative-free fixtures.
- Gradient/Jacobian finite-difference checks and cross-checks against `@stopcock/autodiff`.
- Resume-from-checkpoint equivalence at multiple iteration boundaries.
- Deterministic abort, callback, line-search failure, and non-finite behavior.
- End-to-end curve-fitting and model-training showcase.

### 3. `@stopcock/geo`

**Purpose:** A robust packed planar-geometry toolkit with topology, spatial indexing, and a focused WGS84 geodesy layer.

**Public surface**

- Use `readonly [number, number]` for individual points and interleaved `Float64Array` for packed paths and rings.
- Export `Bounds`, `Ring`, `Polygon`, `MultiPolygon`, segment, Bézier, intersection, and topology result types.
- Normalize polygon output to counter-clockwise outer rings and clockwise holes in Cartesian coordinates.
- Root operations include packing, bounds, robust orientation, segment intersection, closest points, area, perimeter, centroid, containment, convex hull, simplification, Bézier fitting, and curve flattening.
- Add subpaths:
  - `/delaunay`: Delaunay triangulation and bounded Voronoi cells.
  - `/spatial`: immutable packed R-tree and stable nearest-neighbour search.
  - `/topology`: union, intersection, difference, xor, and rectangular clipping.
  - `/offset`: line/polygon offsets, buffers, and stroke expansion with miter, bevel, and round joins plus butt, square, and round caps.
  - `/geodesy`: WGS84 inverse/direct geodesics, bearings, destinations, interpolation, rhumb lines, Web Mercator, local tangent-plane projection, and GeoJSON adapters.
- Add `@stopcock/svg/geo` for geometry-to-path conversion, full curve/arc bounds, transform-aware hit testing, and path generation. Preserve existing `@stopcock/svg/la` helpers as compatibility wrappers.

**Implementation**

- Use adaptive exact `orient2d` and `incircle` predicates; do not introduce a global epsilon.
- Keep intersection ordering exact internally and convert to double coordinates only at the public output boundary. Allow an explicit caller-supplied snap tolerance; default to no snapping.
- Build topology from a deterministic planar arrangement with exact event ordering and winding classification.
- Resolve offset self-intersections through the topology engine.
- Use deterministic incremental half-edge Delaunay construction and a Hilbert-sorted packed spatial index.
- Implement WGS84 geodesics with a near-antipode-safe Karney-style series.
- Target [GeoJSON RFC 7946](https://www.rfc-editor.org/rfc/rfc7946). Preserve feature properties, validate finite coordinates, and expose antimeridian splitting explicitly rather than silently rewriting coordinates.
- Exclude arbitrary CRS/proj-string handling and full GIS data management.

**1.0 gate**

- Degenerate, duplicate, collinear, self-intersecting, near-parallel, and large-coordinate property tests.
- Overlay identity, winding, containment, and area-conservation tests.
- Offset join/cap and self-intersection fixtures.
- Authoritative geodesic fixtures, antipodal cases, and GeoJSON round trips.
- Geo Lab showcase for topology, indexing, triangulation, offsets, and geodesics.

### 4. `@stopcock/sketch`

**Purpose:** Deterministic, mergeable fixed-memory summaries for streaming and telemetry workloads.

**Public surface**

- Export mutable accumulators for:
  - KLL quantiles.
  - REQ quantiles with high-rank or low-rank accuracy.
  - HLL++ cardinality.
  - Count-Min frequency estimates.
  - Mergeable weighted Misra–Gries heavy hitters.
  - Bloom filters.
  - Uniform reservoir sampling.
- Mutating `add`, `update`, and `mergeInto` operations return the same accumulator for pipeline use.
- Expose configuration, observation count, memory usage, estimates, documented error metadata, cloning, reset, and versioned binary encode/decode.
- Support stable hashing for UTF-8 strings, canonical IEEE-754 numbers, bigint, and binary data. Arbitrary objects require an explicit key encoder.

**Implementation**

- Use lazy level compaction for KLL, rank-targeted compaction for REQ, and HLL++ sparse-to-dense transition with small-range correction.
- Use conservative Count-Min updates and deterministic weighted Misra–Gries merging.
- Merge reservoirs using stream counts and a statistically correct merge procedure rather than concatenating samples.
- Permit merges only when algorithm configuration, seed, and key encoding match; otherwise throw a typed compatibility error.
- Define a stable-within-major binary envelope containing magic bytes, format version, sketch kind, configuration, state, body length, and CRC32.
- Reject oversized allocations and malformed input before allocating bodies.
- Exclude sliding windows, deletion-capable filters, and distinct-set materialization.

**1.0 gate**

- Seeded statistical property suites measured over multiple trials against documented conservative envelopes.
- Merge equivalence tests across different partitionings and merge trees.
- Corruption, incompatible configuration, and prior-format fixture tests.
- Fixed-memory telemetry showcase comparing exact and estimated metrics.

### 5. `@stopcock/table`

**Purpose:** A typed, lazy columnar query engine with SQL-style null behavior and broad Arrow interoperability.

**Public surface**

- Export `DataType`, `Field`, `Schema`, `Vector`, `RecordBatch`, `Table<R>`, `Query<R>`, `Expr<T>`, and validity-bitmap primitives.
- Construct tables from rows, columns, record batches, and synchronous or asynchronous batch streams.
- Build expressions through typed `col`/scope builders covering literals, arithmetic, comparisons, Kleene boolean logic, null tests, coalescing, conditional expressions, casts, and standard string/date operations.
- Support filter, derive, select, drop, rename, take, slice, distinct, stable order, aggregate, group, concat, union, pivot/unpivot, windows, and inner/left/right/full/semi/anti/cross/as-of joins.
- Provide row and range window frames with row number, rank, dense rank, lead, lag, and aggregate functions.
- Expose `explainPlan()` with projected columns, fused segments, materialization boundaries, execution backend, and estimated temporary allocations.
- Treat `mapRows` and named expression callbacks as explicit CPU/materialization barriers. Never parse callback source.
- Provide CSV, JSON/NDJSON, and Arrow IPC subpaths with byte, stream, and async-iterable APIs.

**Execution semantics**

- Store nullness in validity bitmaps. Comparisons with null produce null; boolean expressions use three-valued logic; filters retain only explicit `true`.
- Aggregates ignore null except `countAll`. Join keys do not match null unless `nullEqual` is explicitly enabled.
- Sort defaults to nulls last in either direction. NaNs sort after other non-null numbers, compare unequal, form one deterministic grouping/distinct bucket, and do not join by default.
- Fuse compatible filter/derive/project/take stages and prune unused columns. Sort, group, join, window, and callbacks form explicit boundaries.
- Run the reference executor on CPU. Lower compatible numeric segments to a supplied `ComputeRuntime`; unsupported segments remain CPU without changing results.
- Keep execution in memory for 1.0; external sorting and disk spill are excluded.

**Arrow interoperability**

- Pin the 1.0 target to [Arrow Columnar Format 1.5](https://arrow.apache.org/docs/format/Columnar.html) and its [IPC format](https://arrow.apache.org/docs/format/IPC.html).
- Read and write stream and file IPC, record batches, dictionaries and dictionary deltas, endian metadata, alignment/padding, and compressed buffers.
- Cover null, boolean, signed/unsigned integers, floats, decimal128/256, binary/string and large/view variants, fixed binary, date/time/timestamp, interval/duration, list/large-list/list-view, fixed-size list, struct, map, sparse/dense union, dictionary, and run-end encoded layouts.
- Preserve canonical and unknown extension metadata. Unknown extensions remain accessible through their storage type; semantic operations require a registered extension codec.
- Round-trip tensor and sparse-tensor IPC messages through `/arrow`, while the query engine itself operates on record batches.
- Implement the necessary FlatBuffers metadata reader/writer and LZ4 Frame and Zstandard codecs in-repository, with TypeScript reference implementations and first-party WASM acceleration where beneficial.
- Use zero-copy views only when alignment, endianness, and compression allow it; otherwise copy or decompress explicitly. Chunk data rather than assuming one engine-specific maximum typed-array size.

**Text I/O**

- Stream RFC 4180-style CSV with quoted newlines, BOM handling, configurable delimiter/header behavior, and `TextDecoder` support.
- Infer synchronous row schemas from the complete input by default. Streaming CSV/JSON requires a schema or an explicit bounded inference window.
- Preserve JSON nulls and support both row-array JSON and NDJSON.

**1.0 gate**

- Query/property tests against a simple row-based oracle, including joins, nulls, NaNs, windows, and callback barriers.
- Planner fusion and `explainPlan` snapshots.
- Cross-language Arrow fixtures generated by official implementations for every layout, dictionary mode, extension mode, and compression codec.
- Fragmented stream, malformed metadata, oversized allocation, endian, and zero-copy tests.
- Query Workbench showcase with plan inspection and CPU/Compute comparison.

### 6. `@stopcock/vision`

**Purpose:** Deterministic classical computer vision built around Stopcock image, geometry, and linear-algebra primitives.

**Public surface**

- Export `GrayImage`, `Mask`, `Quad`, `Homography`, feature, contour, flow, and document-detection types.
- Root operations include grayscale conversion, Canny edges, erosion/dilation/open/close, contour extraction with hierarchy, homography estimation, point transformation, perspective warping, document detection, rectification, and complete scanning.
- Return `null` for blank or ambiguous document detection rather than inventing a rectangle.
- Add:
  - `/features`: FAST corners, oriented BRIEF/ORB descriptors, Hamming matching, ratio filtering, and cross-checking.
  - `/motion`: pyramidal Lucas–Kanade sparse optical flow.
  - `/browser`: `ImageBitmap`/`VideoFrame` conversion, canvas/video capture, and disposable camera frame sources.
  - `/compute`: asynchronous accelerated equivalents using `ComputeRuntime`.

**Implementation**

- Implement Gaussian/Sobel/non-maximum suppression/hysteresis Canny, van Herk morphology, Suzuki–Abe contours, normalized DLT with seeded RANSAC, inverse perspective warping, ORB orientation/descriptor generation, and pyramidal LK.
- Represent document detections with quad, confidence, and diagnostic measurements.
- Lower blur/gradient, morphology, warp, and descriptor-distance kernels to Compute where supported; root APIs remain synchronous CPU references.
- `openCamera()` owns the created media tracks, surfaces native permission errors unchanged, and stops every owned track on close or abort.
- Exclude OCR, barcode recognition, neural-network inference, and model runtimes.

**1.0 gate**

- Synthetic geometric fixtures with known transformations and tolerances.
- Real checked-in document, low-contrast, blur, occlusion, and empty-frame fixtures.
- Seeded RANSAC determinism and CPU/Compute output parity.
- Browser tests for frame ownership, camera cleanup, abort, and unavailable APIs.
- Document Lab showcase with camera/upload input and visible intermediate stages.

### 7. `@stopcock/motion`

**Purpose:** A deterministic, sampleable animation model with optional direct DOM, WAAPI, and gesture control.

**Public surface**

- Define `Motion<T> { duration; sample(milliseconds) }`.
- Export tween, keyframes, physical spring, inertia, delay, reverse, repeat, sequence, parallel composition, and labelled timelines.
- Provide reusable easing and interpolation protocols for numbers, arrays, records, typed arrays, and user-defined values.
- Add adapters:
  - `/color`: perceptual color interpolation using Stopcock Color.
  - `/svg`: transforms, attributes, and compatible path interpolation.
  - `/geo`: deterministic path resampling and morphing.
  - `/state`: feed sampled values into Stopcock State.
  - `/dom`: animate styles, CSS custom properties, SVG attributes, and transforms.
  - `/waapi`: compile representable motion to native animations or adopt an existing `Animation`.
  - `/gestures`: drag, hover, press, and in-view controllers.
- `play()` returns a controller with pause, resume, seek, speed, cancel, completion, and `AbortSignal` support.

**Implementation**

- Keep pure motion construction and sampling independent of clocks and browser globals.
- Give springs a deterministic settling duration derived from explicit position/velocity thresholds and return the exact target after completion.
- Batch DOM reads before writes. Parse numeric units, colors, opacity, transforms, SVG attributes, and custom properties; incompatible units require an explicit interpolator.
- Compile compatible tween/keyframe/timeline motions to [Web Animations Level 1](https://www.w3.org/TR/web-animations-1/). Springs and custom interpolators use the request-animation-frame sampler while preserving the same controller semantics.
- Resolve selectors once at playback start. Do not continually query the document.
- Implement pointer-captured drag with axis lock, constraints, velocity, and optional spring release. Provide keyboard-equivalent press behavior and disposable listener ownership.
- Use IntersectionObserver for in-view state and native pointer/hover semantics where available.
- DOM playback defaults to `reduce: "user"` and honours `prefers-reduced-motion`; pure sampling is never altered. Also support `"always"` and `"never"`.
- Exclude layout/FLIP animation, scroll-linked timelines, and React/Vue/Svelte adapters from 1.0.

**1.0 gate**

- Fake-clock tests for every composition and playback state transition.
- Spring continuity, settling, repeat, reverse, seek, cancellation, and reduced-motion tests.
- Browser tests comparing compiled WAAPI and sampled fallback at defined timestamps.
- Gesture tests for pointer capture, keyboard input, constraints, velocity, cleanup, and in-view changes.
- Motion Lab showcase covering timelines, SVG morphing, DOM animation, and gestures.

### 8. `@stopcock/procgen`

**Purpose:** Seeded procedural 2D content and serializable 2D/3D fields that can execute through Compute.

**Public surface**

- Export a bit-stable seeded RNG with splitting/forking and serializable state.
- Define immutable, serializable `Field2` and `Field3` ASTs rather than storing arbitrary functions.
- Include value, Perlin, simplex, and Worley noise in 2D and 3D, plus fractal Brownian motion, ridged noise, turbulence, and domain warping.
- Include 2D signed-distance primitives and operations for circles, boxes, capsules, polygons, transforms, union, intersection, subtraction, smoothing, and repetition.
- Include 3D sphere, box, capsule, torus, plane, transform, boolean, smoothing, and repetition fields.
- Provide 2D grid and 3D volume sampling, marching squares, Poisson-disc sampling, bounded L-system rewriting/turtle output, and deterministic Wave Function Collapse.
- Add `/compute` lowering and explicit `/geo`, `/svg`, and `/color` adapters.

**Implementation**

- Make RNG state and integer choices bit-identical across supported runtimes. Floating noise output must remain within documented tolerance.
- Execute fields through a synchronous CPU interpreter and lower the same AST to Compute for CPU/WASM/WebGPU sampling.
- Return packed Geo-compatible paths from marching squares, Poisson sampling, and turtle interpretation.
- Support deterministic and seeded weighted L-system productions with explicit maximum iteration and symbol-count limits.
- Define WFC tiles through sockets, weights, and symmetry expansion. Support open and wrapping boundaries, entropy-based selection, propagation, bounded backtracking, and bounded restarts.
- WFC returns either `{ kind: "complete", cells }` or `{ kind: "contradiction", cell, remaining, attempts }`; it never returns a silently partial grid.
- Sample 3D scalar fields into caller-owned volumes, but exclude marching cubes, general 3D meshing, rendering, and scene management from 1.0.
- Never use implicit global randomness.

**1.0 gate**

- Golden seeded fixtures for RNG, noise, fields, Poisson points, L-systems, and WFC.
- Field serialization and CPU/Compute parity tests.
- Statistical noise-distribution and Poisson-distance properties.
- WFC contradiction, symmetry, boundary, backtracking, determinism, and maximum-work tests.
- Island/terrain and WFC showcase with SVG and raster outputs.

## Repository-wide validation and release

- Run each package’s build, runtime tests, declaration tests, package-isolation checks, and packed-tarball clean-install tests before removing `private`.
- Add browser integration coverage for Compute, Vision, and Motion; conditionally exercise WebGPU without making hardware availability a release requirement.
- Use fixed seeds and checked-in golden fixtures for statistical, serialization, Arrow, and geometry compatibility.
- Update the root package catalogue, documentation grid, API reference, dependency diagrams, and one showcase page per package.
- Record benchmark baselines for internal regression detection. Correctness and memory bounds are release gates; relative performance against third-party libraries is published but not gating.
- Publish packages one at a time in dependency order. A later package cannot block an already-complete package in the same release wave.

## Assumptions and explicit boundaries

- The plans describe eight separate implementation epics, not one pull request or one coordinated release.
- Existing Stopcock packages remain backward compatible; new adapters use additive exports.
- `@stopcock/compute` is explicit and instance-scoped. No package installs a global runtime automatically.
- WebGPU is optional acceleration with transparent fallback; CPU and WASM are the mandatory correctness backends.
- Arrow 1.0 compatibility means broad IPC representation and round-trip support; extension-specific query semantics still require registered codecs.
- Geo is a robust planar toolkit plus WGS84 utilities, not an arbitrary-CRS GIS.
- Optimize supports box constraints but not general constrained programming.
- Table has no SQL parser or disk-spill engine.
- Vision contains classical CV only.
- Motion excludes layout and framework bindings.
- Procgen supports 3D fields but not 3D mesh generation.
- `@stopcock/synth` remains untouched and excluded from all public automation.
