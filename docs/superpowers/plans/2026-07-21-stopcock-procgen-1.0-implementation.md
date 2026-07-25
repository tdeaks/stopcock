# `@stopcock/procgen` 1.0 implementation plan

## Outcome

Build a deterministic procedural-generation package for seeded 2D content and reusable 2D/3D scalar fields. Field definitions must be immutable, serializable AST values that can run through a normative TypeScript CPU implementation or lower to `@stopcock/compute` without parsing JavaScript callbacks.

The package combines continuous generation—noise, fractals, signed-distance fields, domain warping, grids, volumes, contours, and Poisson-disc points—with bounded discrete systems—L-system/turtle output and Wave Function Collapse. Outputs integrate explicitly with Geo, SVG, and Color rather than introducing another geometry, renderer, or color model.

The complete surface in this document is the 1.0 contract. Develop it as private `0.0.0`; publish `1.0.0` only after Geo and Compute are stable and every package gate passes.

## Scope boundaries

### Included in 1.0

- Bit-stable seeded pseudorandom generation with clone, fork, state export/import, bounded integers, shuffling, and weighted selection.
- Serializable 2D and 3D scalar-field ASTs with arithmetic, shaping, transforms, repetition, and domain warping.
- Value, Perlin, simplex, and Worley noise in 2D and 3D.
- Fractal Brownian motion, ridged multifractal, turbulence, and configurable domain warp.
- 2D SDF primitives, polygon distance, transforms, repetition, boolean operations, and smooth booleans.
- 3D sphere, box, capsule, torus, plane, transforms, repetition, boolean operations, and smooth booleans.
- CPU grid/volume sampling with caller-owned output and optional Compute execution.
- Marching squares with deterministic contour stitching and ambiguous-case handling.
- Bridson Poisson-disc sampling.
- Bounded deterministic or seeded-weighted L-system expansion and 2D turtle interpretation.
- Deterministic overlapping-model WFC with socket/symmetry expansion, propagation, contradiction diagnostics, bounded backtracking, and bounded restarts.
- Explicit Geo, SVG, and Color adapters and interactive terrain/WFC showcases.

### Excluded from 1.0

- Marching cubes, dual contouring, voxel meshing, or any other 3D surface extraction.
- A scene graph, raster renderer, game engine, physics engine, or terrain erosion simulator.
- Shader-source authoring or exposing raw WGSL/GLSL as the package’s field model.
- Arbitrary JavaScript callbacks inside fields, serialized WFC rules, or L-system productions.
- Context-sensitive and fully parametric grammar languages.
- Unbounded WFC search or a silently partial WFC result.
- Global randomness or dependence on `Math.random()`.

## Repository integration

### Package and exports

Create `packages/procgen` using the established ESM package shape:

- `type: "module"`, `sideEffects: false`, `files: ["dist"]`.
- `build: "tsup && tsc --emitDeclarationOnly"`.
- Direct dependencies on `@stopcock/fp` and `@stopcock/geo`.
- Optional peer dependencies for `@stopcock/compute`, `@stopcock/svg`, and `@stopcock/color`, referenced only by their adapter entrypoints.
- Explicit exports for `.`, `./random`, `./noise`, `./sdf`, `./contour`, `./poisson`, `./lsystem`, `./wfc`, `./compute`, `./geo`, `./svg`, and `./color`.
- Root imports must not initialize WASM/WebGPU, allocate noise tables, or load SVG/Color/Compute code.

The package joins the ordinary non-synth build, test, Changesets, benchmark, and documentation paths. Do not change `@stopcock/synth` or make any new package depend on it.

### Prerequisite contracts

- Geo must already expose its packed `PointBuffer`, `Bounds`, ring/polygon types, robust containment, and topology operations.
- Compute must already expose serializable rank-aware kernels and explicit `ComputeRuntime` instances with CPU/WASM/WebGPU negotiation.
- SVG remains the rendering target. Procgen only creates SVG nodes through `@stopcock/procgen/svg`.
- Color remains the color authority. Procgen colorization accepts Stopcock color values and interpolation policies.

## Determinism contract

- A serialized RNG state and a sequence of integer/random-choice calls must produce identical bits in every supported Node, Bun, and browser runtime.
- WFC, Poisson sampling, L-system weighted choices, permutation generation, and tie-breaking must be identical for the same seed and ordered inputs.
- Integer algorithms and topology choices are bit-stable. Floating-point noise, fields, grids, and CPU/WASM/WebGPU execution use documented dtype-specific tolerances because transcendental and reduction implementations can differ.
- Input iteration order is semantic. APIs that accept records canonicalize keys lexicographically before deriving random choices; APIs that accept arrays preserve array order.
- No API reads hidden process, time, locale, hardware, or global random state.

## Public data model

### Random source

```ts
export type Seed = number | bigint | string | Uint8Array

export interface RandomState {
  readonly algorithm: 'xoshiro128**'
  readonly version: 1
  readonly words: readonly [number, number, number, number]
}

export interface Random {
  uint32(): number
  float(): number
  int(minInclusive: number, maxExclusive: number): number
  bool(probability?: number): boolean
  pick<T>(values: readonly T[]): T
  weightedIndex(weights: readonly number[]): number
  shuffle<T>(values: readonly T[]): T[]
  fork(label: Seed): Random
  clone(): Random
  state(): RandomState
}

export function random(seed: Seed): Random
export function randomFromState(state: RandomState): Random
```

- Use xoshiro128** with explicit unsigned 32-bit operations.
- Expand seeds through an in-repository stable byte hash and SplitMix-style word generation; reject the all-zero internal state.
- `float()` constructs a `[0, 1)` value from stable random bits.
- `int()` uses rejection sampling, never modulo bias, and requires safe integer bounds with a positive range no larger than `2^32`.
- `weightedIndex()` requires at least one positive finite weight and uses a stable cumulative scan.
- `fork()` derives a child from the current state and label without consuming or mutating the parent.
- `shuffle()` returns a new array and never mutates the input.

### Field descriptors

```ts
export type FieldDType = 'f32' | 'f64'

export interface Field2 {
  readonly kind: 'field2'
  readonly version: 1
  readonly node: FieldNode2
}

export interface Field3 {
  readonly kind: 'field3'
  readonly version: 1
  readonly node: FieldNode3
}

export interface ScalarGrid {
  readonly width: number
  readonly height: number
  readonly bounds: Bounds
  readonly dtype: FieldDType
  readonly data: Float32Array | Float64Array
}

export interface ScalarVolume {
  readonly width: number
  readonly height: number
  readonly depth: number
  readonly bounds: readonly [number, number, number, number, number, number]
  readonly dtype: FieldDType
  readonly data: Float32Array | Float64Array
}

export type SampleGridOptions =
  | {
      readonly dtype?: 'f64'
      readonly width: number
      readonly height: number
      readonly bounds: Bounds
      readonly out?: Float64Array
    }
  | {
      readonly dtype: 'f32'
      readonly width: number
      readonly height: number
      readonly bounds: Bounds
      readonly out?: Float32Array
    }

export type SampleVolumeOptions =
  | {
      readonly dtype?: 'f64'
      readonly width: number
      readonly height: number
      readonly depth: number
      readonly bounds: readonly [number, number, number, number, number, number]
      readonly out?: Float64Array
    }
  | {
      readonly dtype: 'f32'
      readonly width: number
      readonly height: number
      readonly depth: number
      readonly bounds: readonly [number, number, number, number, number, number]
      readonly out?: Float32Array
    }
```

Field nodes are a closed discriminated union. They contain numbers, seeds, child nodes, and fixed option records only. Freeze descriptors in development builds and treat them as immutable in all builds.

Shared node families:

- Constant and coordinate nodes.
- Add, subtract, multiply, divide, min, max, absolute, negate, power, clamp, smoothstep, and remap.
- Translate, rotate, scale, and finite repetition.
- Noise source, fractal, turbulence, ridge, and domain-warp nodes.
- Dimension-specific SDF primitives and boolean nodes.

Validate depth, total node count, numeric arguments, enum values, and cycles before compilation or deserialization. Default safety limits are 256 AST depth and 100,000 nodes; parsing APIs accept lower caller limits but never higher than the package hard maximum.

## Field construction and evaluation

### Builder namespaces

Export `Field2` and `Field3` namespaces with matching operations where dimensions permit:

```ts
Field2.constant(value)
Field2.x / Field2.y
Field2.add(a, b)
Field2.sub(a, b)
Field2.mul(a, b)
Field2.div(a, b)
Field2.min(a, b)
Field2.max(a, b)
Field2.abs(field)
Field2.negate(field)
Field2.pow(field, exponent)
Field2.clamp(field, min, max)
Field2.smoothstep(field, edge0, edge1)
Field2.remap(field, inMin, inMax, outMin, outMax)
Field2.translate(field, dx, dy)
Field2.rotate(field, radians)
Field2.scale(field, sx, sy?)
Field2.repeat(field, periodX, periodY)
Field2.warp(field, xOffset, yOffset, strength)

Field3.x / Field3.y / Field3.z
// Corresponding arithmetic and 3D transform/warp operations.
```

Accept numbers wherever a field is accepted and lift them to constant nodes. Binary operations use Stopcock dual forms when doing so does not create ambiguous overloads.

### CPU execution

```ts
export interface CompiledField2 {
  sample(x: number, y: number): number
  sampleGrid(options: SampleGridOptions): ScalarGrid
}

export interface CompiledField3 {
  sample(x: number, y: number, z: number): number
  sampleVolume(options: SampleVolumeOptions): ScalarVolume
}

export function compileField2(field: Field2): CompiledField2
export function compileField3(field: Field3): CompiledField3
export function sample2(field: Field2, x: number, y: number): number
export function sample3(field: Field3, x: number, y: number, z: number): number
```

- The TypeScript compiler/interpreter is normative and synchronous.
- Compilation validates and topologically normalizes the AST once, interns shared subtrees, and caches immutable noise tables by seed/configuration.
- Grid coordinates sample pixel centres over the requested bounds. For width or height `1`, sample the corresponding bounds midpoint.
- Volume sampling uses x-fastest row-major order: `x + width * (y + height * z)`.
- `SampleGridOptions` and `SampleVolumeOptions` accept `dtype`, dimensions, bounds, and an optional correctly typed caller-owned `out` buffer.
- Reject invalid dimensions, non-finite bounds, reversed bounds, dtype/output mismatch, and multiplication overflow before allocating.

### Serialization

- `serializeField()` returns a canonical JSON-compatible envelope with package format, version, dimension, and AST.
- `parseField()` accepts unknown input, validates it without executing code, applies caller-supplied lower resource limits, and returns a normalized immutable descriptor.
- Serialization orders object keys canonically and preserves seeds without lossy number conversion.
- Unknown versions or node kinds throw `FieldDecodeError`; there is no best-effort reinterpretation.

## Noise and fractal plan

### Noise sources

Expose equivalent 2D and 3D builders under `Noise`:

```ts
Noise.value2({ seed, frequency?, interpolation? })
Noise.value3({ seed, frequency?, interpolation? })
Noise.perlin2({ seed, frequency?, period? })
Noise.perlin3({ seed, frequency?, period? })
Noise.simplex2({ seed, frequency? })
Noise.simplex3({ seed, frequency? })
Noise.worley2({ seed, frequency?, metric?, return? })
Noise.worley3({ seed, frequency?, metric?, return? })
```

- Use fixed gradient tables and a seed-derived permutation table for Perlin/simplex.
- Periodic Perlin validates positive integer periods and wraps lattice coordinates without seams.
- Worley supports Euclidean, squared-Euclidean, Manhattan, and Chebyshev metrics and returns `f1`, `f2`, or `f2-f1`.
- Noise builders return ordinary `Field2` or `Field3` descriptors rather than opaque closures.
- Document nominal output ranges; shaping operations must not assume every noise family is exactly normalized.

### Fractal composition

```ts
Noise.fbm(source, { octaves, lacunarity?, gain?, normalize? })
Noise.ridged(source, { octaves, lacunarity?, gain?, offset?, normalize? })
Noise.turbulence(source, { octaves, lacunarity?, gain?, normalize? })
Noise.domainWarp(source, { x, y, z?, strength, iterations? })
```

- Octaves are integers in `1..32`; defaults are octaves `5`, lacunarity `2`, and gain `0.5`.
- Normalization divides by the accumulated absolute amplitude and is enabled by default.
- Domain-warp iterations are limited to `1..8`; each iteration samples the original coordinate plus the previous displacement.
- Avoid hidden seed mutation: each octave derives a labelled child seed from the source seed/configuration.

## Signed-distance fields

### 2D primitives

Provide circle, axis-aligned and rounded box, segment, capsule, polygon, regular polygon, star, annulus, and half-plane nodes.

- Distances are negative inside, zero on the boundary, and positive outside.
- Polygon input uses Geo rings, rejects non-finite or degenerate rings, and computes signed distance from robust containment plus closest-edge distance.
- Transform nodes evaluate the inverse transform. Non-uniform scale applies the conservative minimum-scale correction and documents that exact Euclidean distance is guaranteed only under rigid/uniform transforms.

### 3D primitives

Provide sphere, axis-aligned and rounded box, capsule, torus, and plane nodes with the same sign convention.

### Boolean and shaping operations

Provide union/min, intersection/max, subtraction, smooth union, smooth intersection, smooth subtraction, shell, onion, offset, and finite repetition.

- Smooth radii must be positive and finite.
- Repetition requires positive periods and explicit finite repeat counts when later geometry extraction could otherwise imply unbounded output.
- SDF builders return field descriptors and compose with noise/fractal nodes without a separate evaluator.

## Grid, volume, and Compute execution

### Compute adapter

```ts
export interface ComputeField2 {
  sampleGrid(
    options: SampleGridOptions & { readonly signal?: AbortSignal },
  ): Promise<ScalarGrid>
  dispose(): Promise<void>
}

export interface ComputeField3 {
  sampleVolume(
    options: SampleVolumeOptions & { readonly signal?: AbortSignal },
  ): Promise<ScalarVolume>
  dispose(): Promise<void>
}

export function lowerField2(
  runtime: ComputeRuntime,
  field: Field2,
  options?: { dtype?: FieldDType },
): Promise<ComputeField2>

export function lowerField3(
  runtime: ComputeRuntime,
  field: Field3,
  options?: { dtype?: FieldDType },
): Promise<ComputeField3>
```

- Lower the closed field AST directly through Compute's public `defineDomainKernel`: fixed output extents describe the requested grid/volume, `index(axis)` and `size(axis)` derive world coordinates, and the field becomes one scalar output expression. Never allocate coordinate tensors or generate a program by stringifying a function.
- Cache compiled programs by canonical field serialization hash, dtype, dimensions, and exact bounds; reuse no compiled program across a mismatched output domain.
- CPU and WASM support both `f32` and `f64` where Compute supports them. WebGPU uses `f32`; requesting `f64` falls back according to the supplied runtime’s policy.
- Accelerated sampling is asynchronous and always accepts caller-owned output plus `AbortSignal`.
- Unsupported nodes or a lowered program above Compute's program limits fall back for the complete operation when allowed; do not split a single grid into backends in 1.0.
- Include the selected backend, fallback reason, and timing in an optional execution report without changing output values.

## Marching squares

```ts
export interface ContourLine {
  readonly points: PointBuffer
  readonly closed: boolean
}

export function contours(
  grid: ScalarGrid,
  isoValue?: number,
  options?: {
    interpolation?: 'linear' | 'midpoint'
    simplifyTolerance?: number
  },
): readonly ContourLine[]
```

- Classify equal-to-iso samples consistently as inside.
- Resolve saddle cases with the asymptotic decider using cell-centre interpolation, with lexicographic tie-breaking for an exact tie.
- Interpolate crossings in world coordinates from grid bounds.
- Stitch segments using canonical edge identifiers rather than approximate coordinate equality.
- Normalize closed contour orientation, rotate its first point to a deterministic lexicographic minimum, and sort output by descending absolute area then lexicographic bounds.
- Optional simplification delegates to Geo and preserves closure.

## Poisson-disc sampling

```ts
export function poisson2(
  bounds: Bounds,
  options: {
    radius: number
    seed: Seed | Random
    attempts?: number
    initial?: readonly [number, number]
    contains?: Polygon | MultiPolygon
  },
): PointBuffer
```

- Implement Bridson’s active-list algorithm with a background grid of cell size `radius / sqrt(2)`.
- Default to 30 candidate attempts per active point.
- Generate candidates uniformly by annulus area, not uniformly by radius.
- A polygon domain uses Geo containment. The initial point must be inside bounds/domain; otherwise choose one by deterministic bounded rejection sampling.
- Return points in acceptance order. Validate output pairwise distance in tests; do not sort after generation.
- Reject unreasonably large background-grid allocations before allocation.

## L-system and turtle plan

### Grammar model

```ts
export interface SymbolToken {
  readonly symbol: string
  readonly parameters?: readonly number[]
}

export interface Production {
  readonly weight?: number
  readonly replacement: readonly SymbolToken[]
}

export interface LSystem {
  readonly axiom: readonly SymbolToken[]
  readonly productions: Readonly<Record<string, readonly Production[]>>
}

export type TurtleCommand = 'draw' | 'move' | 'turn-left' | 'turn-right' | 'push' | 'pop'
export type TurtleCommandMap = Readonly<Record<string, TurtleCommand>>

export function rewrite(
  system: LSystem,
  options: {
    iterations: number
    seed?: Seed | Random
    maxSymbols?: number
  },
): readonly SymbolToken[]
```

- Productions are context-free and replacements are data, never callbacks.
- One production requires no RNG. Multiple alternatives use normalized positive weights and a required/default deterministic seed.
- Symbols without productions pass through unchanged.
- Defaults: `maxSymbols = 1_000_000`; stop before exceeding the limit and throw `GenerationLimitError` with iteration and projected size.
- Parameter values are carried to turtle commands but 1.0 replacements do not evaluate arbitrary parameter expressions.

### Turtle interpreter

```ts
export function turtle2(
  tokens: readonly SymbolToken[],
  options?: {
    step?: number
    angle?: number
    start?: readonly [number, number]
    heading?: number
    maxStackDepth?: number
    commands?: Partial<TurtleCommandMap>
  },
): readonly PointBuffer[]
```

- Default commands: `F` draw, `f` move, `+` turn left, `-` turn right, `[` push, and `]` pop.
- A token’s first numeric parameter overrides step/angle where applicable.
- A move starts a new output path; branch pop restores position/heading and starts a new segment if drawing resumes.
- Reject stack underflow, leftover stack frames, non-finite parameters, and stack depth above the configured maximum.
- Ignore unknown symbols by default; custom command mapping may map a symbol to a fixed built-in command enum, never a serialized callback.

## Wave Function Collapse

### Tile model and API

```ts
export type Direction = 'north' | 'east' | 'south' | 'west'
export type TileSymmetry = 'none' | 'rotate2' | 'rotate4' | 'reflect2' | 'dihedral8'

export interface WfcTile<T = unknown> {
  readonly id: string
  readonly value: T
  readonly weight?: number
  readonly sockets: Readonly<Record<Direction, string>>
  readonly symmetry?: TileSymmetry
}

export type WfcResult<T> =
  | {
      readonly kind: 'complete'
      readonly width: number
      readonly height: number
      readonly cells: readonly T[]
      readonly tileIds: readonly string[]
      readonly attempts: number
      readonly backtracks: number
    }
  | {
      readonly kind: 'contradiction'
      readonly cell: number
      readonly remaining: readonly string[]
      readonly attempts: number
      readonly backtracks: number
      readonly reason: 'initial-constraint' | 'propagation' | 'backtrack-limit' | 'restart-limit'
    }

export function solveWfc<T>(
  tiles: readonly WfcTile<T>[],
  options: {
    width: number
    height: number
    seed: Seed | Random
    boundary?: 'open' | 'wrap'
    fixed?: Readonly<Record<number, string | readonly string[]>>
    socketCompatibility?: Readonly<Record<string, readonly string[]>>
    maxBacktracks?: number
    maxRestarts?: number
    signal?: AbortSignal
  },
): WfcResult<T>
```

### Solver semantics

- Expand symmetry into deterministic variant IDs before solving; rotate/reflect sockets and preserve the original tile value plus variant transform metadata.
- By default sockets match equal strings on opposing edges. An explicit compatibility table is symmetric after validation and replaces equality for listed sockets.
- Store possibility sets in packed bitsets and precompute directional compatibility masks.
- Apply fixed-cell constraints, then propagate with a queue until stable or contradictory.
- Select the uncollapsed cell with minimum Shannon entropy. Break equal entropy by lowest cell index after applying a tiny RNG-derived tie value generated in stable cell order.
- Select a tile by normalized weights. Record the decision alternatives and RNG state for bounded chronological backtracking.
- On contradiction, restore the most recent decision with alternatives, remove the failed choice, and continue. Once `maxBacktracks` is reached, restart from the original constraints using a labelled child RNG.
- Defaults: `maxBacktracks = width * height * 4`, `maxRestarts = 3`. Abort is checked between propagation batches and decisions.
- Never return a partially collapsed grid as success. Contradiction results expose the first unresolved/empty cell and remaining candidates where meaningful.
- Validate unique IDs, positive finite weights, complete sockets, finite grid size, fixed indices, symmetry, and resource bounds before allocating bitsets.

## Output adapters

### `@stopcock/procgen/geo`

- Convert contour lines into Geo rings/polygons, using Geo topology to classify nesting and resolve requested fills.
- Return Poisson points directly as Geo `PointBuffer`.
- Convert turtle paths into Geo packed polylines and expose their combined bounds.
- Keep adapters deterministic and never mutate source buffers.

### `@stopcock/procgen/svg`

- Convert contours and turtle polylines into SVG path nodes.
- Render WFC cells as grouped supplied tile nodes with variant transforms; tile SVG nodes remain caller-owned values.
- Accept explicit viewBox/padding options but do not create or mutate DOM nodes.

### `@stopcock/procgen/color`

- Export `colorizeGrid(grid, stops, options)` returning an RGBA `Uint8ClampedArray` and dimensions.
- Stops use Stopcock Color values and explicit offsets. Interpolate through `@stopcock/color`, with configurable clamp/wrap/mirror range behavior.
- Treat non-finite grid values through an explicit fallback color; require it if the grid contains non-finite data.
- This adapter creates pixel data only and is not a canvas or image-file renderer.

## Errors and defensive behavior

Export distinct errors for invalid fields, field decoding, resource limits, generation limits, invalid grammars, WFC model errors, and unavailable Compute backends.

- Perform dimension/allocation arithmetic with checked safe integers before allocating buffers or bitsets.
- Never partially mutate caller-owned output on validation failure. Runtime abort may leave caller-owned output unspecified; document this and report abort distinctly.
- Reject NaN/infinite configuration values. Field evaluation itself follows IEEE numeric semantics and may produce non-finite values for deliberately invalid operations such as division by zero.
- Clone externally supplied RNGs only when an API promises not to consume them; otherwise document consumption explicitly. The default convention is to clone so top-level generation calls do not mutate caller RNG state.
- Ensure every bounded algorithm reports which limit was reached.

## Implementation sequence

### Phase 1: Package scaffold and deterministic random core

- [ ] Create manifest, TypeScript/tsup configuration, source exports, README, changelog, and private `0.0.0` package state.
- [ ] Implement seed encoding, stable hash, xoshiro128**, fork/clone/state restore, unbiased integer sampling, weighted choice, and shuffle.
- [ ] Add cross-runtime golden vectors before any higher-level algorithm consumes RNG.

### Phase 2: Field AST and CPU reference

- [ ] Define immutable 2D/3D node unions, constructors, lifting, validation, resource limits, canonical serialization, and parser.
- [ ] Implement AST normalization, subtree interning, synchronous point sampling, grid sampling, and volume sampling.
- [ ] Add caller-owned output, dtype handling, coordinate conventions, and property tests.

### Phase 3: Noise and fractals

- [ ] Implement value and Perlin noise with seeded tables and periodic mode.
- [ ] Implement simplex and Worley noise in both dimensions.
- [ ] Implement fBm, ridge, turbulence, and bounded domain warp as field AST nodes.
- [ ] Lock golden fixtures, nominal ranges, periodic seams, and distribution tests.

### Phase 4: SDFs

- [ ] Implement 2D primitives, Geo polygon distance, transforms, repetition, booleans, smoothing, shell, and offset.
- [ ] Implement selected 3D primitives and matching operations.
- [ ] Test sign, symmetry, transform, boundary, boolean, and conservative non-uniform-scale behavior.

### Phase 5: Compute execution

- [ ] Lower every supported field node into closed Compute expressions.
- [ ] Implement asynchronous grid/volume runners with caller output, cancellation, backend reports, and whole-operation fallback.
- [ ] Add CPU/WASM/WebGPU parity and unsupported-node/f64 fallback tests.

### Phase 6: Continuous 2D generators

- [ ] Implement marching-squares classification, asymptotic decider, edge-ID stitching, normalization, and Geo simplification adapter.
- [ ] Implement Bridson Poisson sampling for rectangular and polygon domains.
- [ ] Add topology/property tests and performance benchmarks for large grids and point sets.

### Phase 7: L-system and turtle

- [ ] Implement grammar/model validation, deterministic and weighted expansion, symbol limits, and serialization-safe tokens.
- [ ] Implement bounded turtle stack and packed path emission.
- [ ] Add classic plant/Koch/dragon fixtures, branch-error cases, determinism, and limit tests.

### Phase 8: WFC

- [ ] Implement symmetry variant expansion and socket compatibility validation.
- [ ] Implement packed possibility bitsets, entropy queue, propagation, deterministic weighted collapse, and fixed constraints.
- [ ] Add bounded backtracking/restarts, abort, complete/contradiction results, and diagnostic counters.
- [ ] Validate with hand-solvable, unsatisfiable, wrapping, fixed-cell, symmetry, and seeded golden fixtures.

### Phase 9: Adapters, documentation, and release

- [ ] Add Geo, SVG, and Color subpaths with independent entrypoints and optional peers.
- [ ] Add `libraries/procgen.mdx`, root/package catalogue entries, recipes, API tables, and deterministic examples.
- [ ] Build an Island Lab combining noise/SDF/contours/color and a WFC Lab showing entropy, contradictions, backtracking, and seed replay.
- [ ] Add benchmarks, packed-tarball import tests, and browser showcase smoke tests.
- [ ] Remove `private`, add the major Changeset, and publish only after all gates below pass.

## Test matrix

### Random and determinism

- Golden seed/state sequences in Node, Bun, and browser.
- Clone/fork independence, state round trips, integer range/bias sampling, weighted zero/error cases, and immutable shuffle input.
- Identical outputs across repeated calls with equal input ordering and seed.

### Fields, noise, and SDF

- AST validation, cycle/forgery rejection, canonical serialization, old-version rejection, and resource limits.
- CPU direct/interpreted/compiled equality plus Compute backend tolerance matrices.
- Noise determinism, periodic seams, continuity, nominal range, histogram sanity, and octave normalization.
- SDF sign/boundary/symmetry/transform/boolean properties and polygon comparison against Geo containment/distance.
- Grid/volume coordinate mapping, one-cell dimensions, caller-owned outputs, dtype mismatch, overflow, and abort.

### Continuous/discrete algorithms

- Marching-squares all 16 cell cases, both saddle cases, equality-to-iso, contour stitching, closure, orientation, sorting, and simplification.
- Poisson minimum distance, bounds/domain containment, deterministic order, density sanity, invalid initial point, and allocation limits.
- L-system deterministic/weighted expansion, passthrough symbols, token bounds, branch stack errors, and turtle coordinates.
- WFC complete/contradiction outcomes, socket compatibility, symmetry expansion, fixed cells, wrapping, entropy ties, backtracking, restarts, abort, and resource limits.

### Type and packaging tests

- Field2/Field3 dimension separation and builder overloads.
- Typed grid/volume output narrowing by dtype.
- WFC value-type propagation and discriminated result narrowing.
- Optional adapter peers do not leak into root declarations or bundle imports.
- Clean packed-package imports for every subpath in Node and Bun, plus browser bundling for Compute/SVG/Color adapters.

## Benchmarks

- RNG scalar and bulk generation versus a minimal native baseline.
- Every noise family at 512², 2048², and representative 3D volumes.
- Fractal/domain-warp AST depth and CPU/WASM/WebGPU crossover.
- Marching squares on sparse, dense, and saddle-heavy grids.
- Poisson generation by domain area and radius.
- L-system expansion by iteration/symbol count.
- WFC on 32², 64², and 128² models with easy, constrained, and contradiction-heavy tilesets.

Correctness, determinism, bounded memory, and absence of pathological regressions are gates. Competitor comparisons are benchmark-only and informational.

## Documentation and showcase requirements

- Document seed/state stability, floating-point tolerance, AST serialization versioning, and every hard resource limit prominently.
- Include recipes for terrain fields, seamless noise, SDF islands, contour-to-SVG, Poisson placement, L-system plants, and WFC tiles.
- Island Lab must expose seed, noise/fractal parameters, SDF/warp controls, execution backend, grid resolution, contours, and palette.
- WFC Lab must expose seed, boundaries, fixed cells, backtrack/restart limits, current diagnostic counts, replayable contradiction details, and final SVG output.
- Showcase examples must use package APIs and must not contain alternative hidden implementations.

## 1.0 acceptance gate

- Random golden vectors and discrete generator results match in the repository’s supported Node, Bun, and browser matrix.
- Every field node has a TypeScript reference implementation; every Compute-lowered node passes backend parity tests or follows the documented whole-operation fallback.
- All generators enforce deterministic resource bounds and report contradictions/limits without returning false success.
- Geo/SVG/Color adapters preserve their owning package representations and remain absent from the root import graph.
- Package build, runtime tests, declaration tests, browser tests, docs build, benchmark correctness checks, and clean packed-tarball imports pass.
- Geo and Compute stable releases required by the public surface are already available.
- README, library docs, recipes, both showcases, root package catalogue, sidebar, API reference, and major Changeset are complete.
- No release, CI, build, test, or documentation automation includes `@stopcock/synth`.
