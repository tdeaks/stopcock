# stopcock Ecosystem Specification

## Vision

Expand stopcock from a pipeline/array FP library into a full-stack functional toolkit. Each new package follows the same conventions: curried data-last functions, composable with `pipe()`, tree-shakeable ESM, zero configuration.

Two tiers of packages:

1. **WASM-accelerated** (Zig source, compiled to WASM with SIMD128). For compute-bound work where tight arithmetic loops outweigh the ~50-100ns WASM call boundary cost.
2. **Pure JS** (ReScript or TypeScript). For async, streaming, structural, and validation work where the bottleneck is not raw compute.

All packages live under `packages/` in the monorepo, published as `@nm/<name>`. All integrate with the existing fusion engine where applicable.

---

## WASM Architecture (shared across all Zig packages)

### Build pipeline

```
packages/<name>/src/*.zig
  → zig build -Dtarget=wasm32-wasi -Doptimize=ReleaseFast
  → packages/<name>/wasm/<name>.wasm
  → packages/<name>/src/wasm-loader.ts   (async init, memory management)
  → packages/<name>/src/index.ts          (pipeable TS wrappers)
  → packages/<name>/dist/                 (tree-shakeable ESM)
```

Turborepo dependency: `wasm` task runs before `build` for Zig packages.

### WASM loading strategy

```ts
// Lazy singleton. WASM is loaded on first call, cached thereafter.
let instance: WebAssembly.Instance | null = null

async function init(): Promise<void> {
  if (instance) return
  const mod = await WebAssembly.compileStreaming(fetch(wasmUrl))
  instance = await WebAssembly.instantiate(mod, imports)
}

// Synchronous hot path after init
function callWasm(fn: string, ...args: number[]): number {
  return (instance!.exports[fn] as Function)(...args)
}
```

Each package exports an `init()` for explicit preloading and auto-initializes on first use. Node.js loads from filesystem via `fs.readFile`; browsers use `fetch`.

### Memory management

Zig packages allocate from a shared linear memory. For bulk data (arrays, buffers), the TS wrapper:

1. Allocates space in WASM memory via an exported `alloc(len)` function.
2. Copies input data into WASM memory (`new Float32Array(memory.buffer, ptr, len)`).
3. Calls the WASM function.
4. Copies result back (or returns a view for zero-copy when the caller opts in via `SharedArrayBuffer`).
5. Calls `free(ptr, len)`.

### Crossover dispatch

Every WASM-backed function has a JS fallback. The wrapper checks input size against a threshold and dispatches:

```ts
export const multiply = dual(2, (a: Matrix, b: Matrix): Matrix =>
  a.rows * a.cols > CROSSOVER_THRESHOLD
    ? wasmMultiply(a, b)
    : jsMultiply(a, b)
)
```

Thresholds are determined empirically per function and baked into the build. The existing AOT compiler infrastructure can generate specialized dispatch code.

### Tree-shaking

Each WASM package splits its `.wasm` binary by module (one per functional domain) so that bundlers can code-split. A consumer importing only `LA.dot` does not pull in SVD code. This requires Zig `@export` per-function and a thin JS wrapper per export.

---

## Package 1: @nm/hash — Crypto/Hashing

**Priority: 1** | **Difficulty: 2/5**

Start here. Simplest WASM module: fixed-size inputs, no complex memory lifecycle, well-defined algorithms.

### Overview

Fast hashing and HMAC. WASM eliminates GC pauses in tight byte-processing loops. BLAKE3 is specifically designed to exploit SIMD parallelism.

### API Surface

```ts
import { pipe } from "stopcock"
import * as Hash from "@nm/hash"

// One-shot hash
const digest = pipe(data, Hash.sha256)
const b3     = pipe(data, Hash.blake3)
const quick  = pipe(data, Hash.xxhash64)
const crc    = pipe(data, Hash.crc32)

// HMAC
const mac = pipe(data, Hash.hmac("sha256", key))

// Key derivation
const derived = pipe(password, Hash.pbkdf2(salt, 100_000, "sha256"))

// Constant-time comparison
const ok = pipe(digest, Hash.timeSafeEqual(expected))

// Hex / base64 output
const hex = pipe(data, Hash.sha256, Hash.toHex)
```

### Implementation

**Language:** Zig -> WASM

**Algorithms:**
- SHA-256, SHA-512: standard Merkle-Damgard construction. Inner loop is 64/80 rounds of bitwise ops + additions on 32/64-bit words. Zig `@Vector(4, u32)` processes 4 message schedule words simultaneously.
- BLAKE3: tree structure with 7 rounds per compression. Each round operates on a 4x4 state matrix. Zig SIMD vectorizes the G function across 4 columns/diagonals.
- xxHash64: single-pass accumulator with 4 parallel lanes. Maps directly to `@Vector(4, u64)`.
- CRC32: table-based with optional CLMUL acceleration.
- PBKDF2: iterative HMAC. WASM wins because inner loop is thousands of hash rounds with no JS boundary crossing.

**Memory:** Input data is copied into WASM linear memory once. Output is a fixed-size digest (32 or 64 bytes) copied back. No streaming state needed for one-shot API; streaming API (future) would keep state in WASM memory between `update()` calls.

### Performance Notes

Even small inputs benefit because the entire hash computation happens in WASM without GC interruption. No crossover dispatch needed; WASM is always faster for hashing.

---

## Package 2: @nm/encoding — Binary Encoding/Decoding

**Priority: 2** | **Difficulty: 2/5**

### Overview

SIMD-accelerated base64 is a well-known 10-20x win over JS. Extends to other binary encodings and serialization formats.

### API Surface

```ts
import { pipe } from "stopcock"
import * as Enc from "@nm/encoding"

// Base64
const encoded = pipe(buffer, Enc.base64.encode)
const decoded = pipe(b64string, Enc.base64.decode)

// Hex
const hex = pipe(buffer, Enc.hex.encode)

// Base58 (Bitcoin-style)
const b58 = pipe(buffer, Enc.base58.encode)

// MessagePack
const packed   = pipe(data, Enc.msgpack.encode)
const unpacked = pipe(packed, Enc.msgpack.decode)

// CBOR
const cbor = pipe(data, Enc.cbor.encode)

// Protobuf (schema-driven)
const msg = pipe(buffer, Enc.protobuf.decode(schema))

// Chained
const result = pipe(
  rawBytes,
  Enc.msgpack.decode,
  transform,
  Enc.base64.encode
)
```

### Implementation

**Language:** Zig -> WASM

**Algorithms:**
- Base64 encode: SIMD processes 12 input bytes -> 16 output chars using lookup table vectorization. Zig `@Vector(16, u8)` with shuffle and mask operations.
- Base64 decode: reverse lookup via SIMD range checks. Validates padding.
- Base58: big-number division loop. Not SIMD-friendly but still faster in WASM due to tight integer arithmetic.
- MessagePack/CBOR: recursive descent over byte stream. Type byte dispatch, varint decoding. WASM wins on the byte-level parsing loop.
- Protobuf: varint + wire type dispatch. Schema compiled to a decode plan at init time.

**Memory:** Encoding output is typically 4/3x input size (base64) or variable (msgpack). Allocate pessimistic output buffer, return actual length.

---

## Package 3: @nm/la — Linear Algebra

**Priority: 2** | **Difficulty: 4/5**

### Overview

Matrix and vector operations with SIMD acceleration. The crossover point concept is central: below ~16x16, JS is faster due to WASM call overhead. Above that, WASM SIMD dominates.

### API Surface

```ts
import { pipe } from "stopcock"
import * as LA from "@nm/la"

// Matrix operations
const result = pipe(matrix, LA.transpose, LA.multiply(weights), LA.normalize)
const inv    = pipe(matrix, LA.invert)
const det    = pipe(matrix, LA.determinant)
const eig    = pipe(matrix, LA.eigenvalues)
const svd    = pipe(matrix, LA.svd)

// Vector operations
const d = LA.dot(v1, v2)
const c = LA.cross(v1, v2)
const n = pipe(vector, LA.vnormalize)
const m = pipe(vector, LA.magnitude)

// Matrix construction
const eye = LA.identity(4)
const rot = LA.rotation3d(Math.PI / 4, "z")

// Batch operations
const transformed = pipe(
  pointCloud,
  LA.batchMultiply(transformMatrix)
)
```

### Implementation

**Language:** Zig -> WASM, JS fallback for small matrices

**Data representation:** Row-major `Float32Array` (or `Float64Array` via generic). Matrix metadata (rows, cols) stored separately. WASM operates on the raw float buffer.

**Algorithms:**
- Multiply: naive O(n^3) for small matrices, tiled/blocked multiply for cache efficiency on large matrices. Zig `@Vector(4, f32)` does 4 multiply-accumulate ops per SIMD instruction. For 4x4 matrices (common in 3D), a specialized fully-unrolled SIMD path.
- Transpose: in-place with SIMD 4x4 block transpose using shuffle operations.
- Invert: LU decomposition with partial pivoting. SIMD accelerates the row reduction.
- Determinant: LU decomposition byproduct (product of diagonal).
- Eigenvalues: QR algorithm with implicit shifts. Iterative, heavy on Givens rotations which vectorize.
- SVD: Golub-Kahan bidiagonalization + QR iteration.
- Dot product: `@Vector` multiply + horizontal sum. For long vectors, loop-unrolled accumulation.
- Cross product: 3-element, hand-written with SIMD shuffle.

**Crossover thresholds:**
- `multiply`: ~16x16 (256 elements, ~16K FLOPs)
- `transpose`: ~32x32 (WASM overhead > trivial loop for small matrices)
- `dot`: ~64 elements
- `invert`, `eigenvalues`, `svd`: ~8x8 (algorithms are complex enough that WASM wins sooner)

### Use Cases

ML preprocessing, physics simulations, 3D transforms (camera/projection matrices), statistical regression (normal equations), PCA.

---

## Package 4: @nm/img — Image Processing

**Priority: 3** | **Difficulty: 4/5**

### Overview

Pixel-level image operations. WASM SIMD processes 4 RGBA channels simultaneously per instruction. Zero-copy possible via `SharedArrayBuffer` from Canvas `getImageData()`.

### API Surface

```ts
import { pipe } from "stopcock"
import * as Img from "@nm/img"

const result = pipe(
  imageData,
  Img.blur(5),
  Img.resize(200, 200),
  Img.grayscale
)

// Individual operations
const edges   = pipe(imageData, Img.edgeDetect("sobel"))
const canny   = pipe(imageData, Img.edgeDetect("canny", { low: 50, high: 150 }))
const sharp   = pipe(imageData, Img.sharpen(1.5))
const resized = pipe(imageData, Img.resize(800, 600, "lanczos"))
const equalized = pipe(imageData, Img.histogramEq)

// Color space
const hsl = pipe(imageData, Img.toHSL)
const lab = pipe(imageData, Img.toLab)
const rgb = pipe(hslData, Img.toRGB)

// Composition
const thumbnail = pipe(
  imageData,
  Img.resize(200, 200, "bilinear"),
  Img.sharpen(0.5),
  Img.toBuffer("png")
)
```

### Implementation

**Language:** Zig -> WASM

**Data representation:** `ImageData` (`Uint8ClampedArray` of RGBA pixels). Width and height passed alongside the buffer pointer.

**Algorithms:**
- Blur (Gaussian): separable kernel — horizontal pass then vertical pass. Each pixel: load 4 RGBA channels via `@Vector(4, u8)`, multiply by kernel weight (promoted to `@Vector(4, f32)`), accumulate. Kernel radius determines number of taps.
- Sharpen: unsharp mask — subtract blurred from original, scale, add back.
- Edge detection (Sobel): 3x3 convolution with Gx and Gy kernels. Magnitude = sqrt(Gx^2 + Gy^2). SIMD processes 4 pixels in parallel across the scanline.
- Edge detection (Canny): Gaussian blur -> Sobel -> non-maximum suppression -> hysteresis thresholding. Multi-pass.
- Resize (bilinear): weighted average of 4 nearest pixels. Source coordinate calculation per output pixel, SIMD interpolation of 4 channels.
- Resize (Lanczos): sinc-windowed kernel, 3-lobe. Higher quality, more taps per output pixel.
- Color space: RGB->HSL/Lab are per-pixel arithmetic transforms. 4 pixels at a time with SIMD.
- Histogram equalization: two passes. First: build 256-bin histogram (scalar). Second: apply CDF mapping (SIMD lookup).

**Zero-copy path:** When input is backed by `SharedArrayBuffer`, the WASM module reads directly from the shared memory without copying. The caller must ensure no concurrent writes during processing.

### Use Cases

Client-side photo filters, thumbnail generation before upload, computer vision preprocessing, canvas-based image editing.

---

## Package 5: @nm/signal — DSP / Signal Processing

**Priority: 3** | **Difficulty: 4/5**

### Overview

FFT and signal processing primitives. Butterfly operations in FFT are the canonical SIMD workload: parallel complex multiplications on float arrays.

### API Surface

```ts
import { pipe } from "stopcock"
import * as Sig from "@nm/signal"

// FFT pipeline
const spectrum = pipe(
  samples,
  Sig.window("hann"),
  Sig.fft,
  Sig.magnitude
)

// Inverse
const reconstructed = pipe(spectrum, Sig.ifft)

// Filtering
const clean = pipe(
  samples,
  Sig.fft,
  Sig.lowPass(4000),
  Sig.ifft
)

// Convolution (time domain)
const convolved = pipe(signal, Sig.convolve(kernel))

// Cross-correlation
const corr = pipe(Sig.crossCorrelate(signalA, signalB))

// Filter design
const filtered = pipe(samples, Sig.bandPass(200, 4000))

// Spectral analysis
const psd = pipe(samples, Sig.window("blackman"), Sig.fft, Sig.powerSpectralDensity)

// Windowing functions
const windowed = pipe(samples, Sig.window("hamming"))
```

### Implementation

**Language:** Zig -> WASM

**Algorithms:**
- FFT (Cooley-Tukey radix-2): butterfly operations. Each butterfly: complex multiply + add/subtract. `@Vector(4, f32)` processes 2 complex numbers (real + imag interleaved) per SIMD operation. Split-radix variant for better constant factors.
- Inverse FFT: conjugate input, forward FFT, conjugate output, scale by 1/N.
- Windowing: element-wise multiply of sample array by window coefficients. Coefficients precomputed. Pure SIMD vectorized loop.
- Convolution: short kernels (<64 taps) in time domain via direct sum. Long kernels via FFT multiply (O(n log n) vs O(n*k)).
- Filters: implemented as frequency-domain masks applied to FFT output. Low-pass zeroes bins above cutoff. Band-pass zeroes bins outside range.
- Power spectral density: |FFT(x)|^2 / N.

**Data representation:** `Float32Array` for real signals, interleaved `Float32Array` (re, im, re, im, ...) for complex. FFT input length must be power of 2; wrapper zero-pads automatically.

### Use Cases

Audio analysis (WebAudio integration), sensor data processing (accelerometer, gyroscope), financial time series (spectral decomposition of returns), real-time visualization (spectrogram).

---

## Package 6: @nm/compress — Compression

**Priority: 3** | **Difficulty: 3/5**

### Overview

Compression algorithms with tight byte-level loops, bitwise operations, and lookup tables. WASM's linear memory model and lack of GC pauses make it ideal.

### API Surface

```ts
import { pipe } from "stopcock"
import * as Z from "@nm/compress"

// One-shot compression
const compressed   = pipe(data, Z.zstd(3))       // level 3
const decompressed = pipe(compressed, Z.unzstd)

const lz4  = pipe(data, Z.lz4)
const br   = pipe(data, Z.brotli(6))
const gzip = pipe(data, Z.gzip)

// Streaming (returns TransformStream)
const stream = pipe(
  readableStream,
  Z.stream.zstd(3)     // returns ReadableStream of compressed chunks
)

// Decompress with auto-detection (reads magic bytes)
const auto = pipe(compressed, Z.decompress)
```

### Implementation

**Language:** Zig -> WASM

**Algorithms:**
- LZ4: block format. Hash table for match finding, 4-byte minimum match. Decompression is a tight copy loop with offset references. Fastest option.
- Zstd: Finite State Entropy (FSE) coding + LZ match finding. Configurable compression levels (1-22). Zig's `@import("std").compress.zstd` provides a reference but we implement a stripped version for code size.
- Brotli: LZ77 + Huffman + context modeling + static dictionary. Higher ratio than gzip. Decode is the priority (server sends Brotli, client decodes).
- gzip/deflate: LZ77 + Huffman. Compatibility format. Wrap zlib-compatible deflate.

**Streaming:** Each algorithm maintains compressor state in WASM linear memory. The TS wrapper feeds chunks via `update(chunk)` and collects output. Flush on `end()`.

**Code size concern:** Zstd and Brotli are large algorithms. Per-algorithm WASM modules allow tree-shaking at the binary level. Consumer importing only `Z.lz4` gets a ~20KB WASM binary, not the full suite.

### Use Cases

Client-side file compression, API payload compression (Brotli for responses), IndexedDB storage optimization, offline-first apps.

---

## Package 7: @nm/geo — Computational Geometry / Spatial

**Priority: 4** | **Difficulty: 4/5**

### Overview

Computational geometry and spatial indexing. Tight f64 arithmetic loops and the linear memory model of WASM are ideal for spatial index traversal.

### API Surface

```ts
import { pipe } from "stopcock"
import * as Geo from "@nm/geo"

// Geometric operations
const hull      = pipe(points, Geo.convexHull)
const inside    = pipe(polygon, Geo.contains(point))
const triangles = pipe(points, Geo.delaunay)
const voronoi   = pipe(points, Geo.voronoi(bounds))

// Spatial indexing
const tree = pipe(points, Geo.rtree)
const near = pipe(tree, Geo.nearest(queryPoint, 10))
const inBox = pipe(tree, Geo.search(bbox))

// k-d tree
const kd     = pipe(points, Geo.kdtree)
const kNearest = pipe(kd, Geo.knn(queryPoint, 5))

// Geodesic
const dist    = Geo.greatCircle(pointA, pointB)
const bearing = Geo.bearing(pointA, pointB)
const dest    = Geo.destination(pointA, bearing, distance)

// Chained
const result = pipe(
  rawCoordinates,
  Geo.convexHull,
  Geo.area
)
```

### Implementation

**Language:** Zig -> WASM

**Algorithms:**
- Convex hull (Andrew's monotone chain): sort points by x, build upper and lower hulls. O(n log n). Sorting in WASM, cross product tests vectorized.
- Point-in-polygon: ray casting with winding number fallback for complex polygons. Per-edge test vectorizable with SIMD.
- Delaunay triangulation: divide-and-conquer or incremental insertion. O(n log n). Heavy on in-circle predicates (4x4 determinant, benefits from SIMD f64).
- Voronoi: dual of Delaunay. Compute Delaunay first, derive Voronoi edges from circumcenters.
- R-tree: bulk-loaded via Sort-Tile-Recursive (STR). Query traverses nodes in WASM linear memory (cache-friendly flat layout). Node: bounding box (4 f64) + child pointers.
- k-d tree: median-of-medians partitioning. Flat array layout in WASM memory. kNN via priority queue with distance pruning.
- Great-circle distance: Vincenty formula on WGS84 ellipsoid. Pure f64 arithmetic.

**Data representation:** Points as `Float64Array` (x, y pairs interleaved). Polygons as point arrays with an element count. Spatial indices live entirely in WASM memory; the TS wrapper holds an opaque handle.

### Use Cases

Map applications, GIS analysis, game development (collision detection), data visualization (Voronoi diagrams, spatial clustering).

---

## Package 8: @nm/rand — High-quality Random

**Priority: 4** | **Difficulty: 2/5**

### Overview

PRNG state machines are tight arithmetic loops. WASM avoids the overhead of JS BigInt for 64-bit state operations and eliminates JIT deoptimization from mixed integer widths.

### API Surface

```ts
import { pipe } from "stopcock"
import * as Rand from "@nm/rand"

// Seeded PRNG
const rng = Rand.create(42)                     // PCG by default
const rng2 = Rand.create(42, "xoshiro256")
const rng3 = Rand.create(undefined, "chacha20") // crypto-secure

// Generate values
const n   = pipe(rng, Rand.next)             // [0, 1) uniform
const int = pipe(rng, Rand.int(1, 100))
const f   = pipe(rng, Rand.float(-1, 1))

// Distributions
const samples = pipe(rng, Rand.normal(0, 1), Rand.take(1000))
const poisson = pipe(rng, Rand.poisson(5), Rand.take(100))
const exp     = pipe(rng, Rand.exponential(1.5), Rand.take(100))
const beta    = pipe(rng, Rand.beta(2, 5), Rand.take(100))

// Sampling
const shuffled   = pipe(array, Rand.shuffle(rng))
const sampled    = pipe(array, Rand.sample(rng, 10))
const reservoir  = pipe(stream, Rand.reservoirSample(rng, 100))
const weighted   = pipe(items, Rand.weightedChoice(rng, weights))

// Reproducibility
const [value, nextRng] = Rand.step(rng)  // pure: returns value + new state
```

### Implementation

**Language:** Zig -> WASM

**Algorithms:**
- PCG (Permuted Congruential Generator): 128-bit state, 64-bit output. Two multiplies + XOR + rotate per step. Zig's native u128 support compiles to efficient WASM i64 pairs.
- xoshiro256**: 256-bit state (4x u64). 4 multiplies + shifts + rotates per step. Excellent statistical quality, fast.
- ChaCha20 CSPRNG: 20 rounds of quarter-round operations on 4x4 u32 state. SIMD vectorizes the quarter-round across 4 columns. Cryptographically secure.
- Normal distribution: Ziggurat method. Precomputed table of 256 rectangles. 97% of samples require only a multiply + compare. Rejection sampling for edge cases.
- Poisson: inverse CDF for small lambda, normal approximation for large lambda.
- Reservoir sampling (Vitter's Algorithm R): for sampling k items from a stream of unknown length. O(n) time, O(k) space. WASM holds the reservoir.

**PRNG state:** lives in WASM memory. The TS `Rng` handle is an opaque pointer. `Rand.step` returns a new handle (functional style) or mutates in place (imperative style, opt-in).

### Use Cases

Monte Carlo simulations, procedural generation, A/B test assignment (deterministic with seed), statistical bootstrapping, game randomness.

---

## Package 9: @nm/async — Async Composition

**Priority: 1** | **Difficulty: 3/5**

Highest priority. The single biggest gap in the JS FP ecosystem. No existing library (remeda, rambda, ts-belt, fp-ts) does async composition well.

### Overview

A `Task<A>` type (lazy Promise with cancellation) and combinators for concurrent, rate-limited, and resilient async pipelines.

### API Surface

```ts
import { pipe } from "stopcock"
import * as Async from "@nm/async"

// Task creation
const task = Async.of(() => fetch("/api/data"))
const delayed = Async.delay(1000, () => fetch("/api"))

// Combinators
const result = await pipe(
  urls,
  Async.map(url => fetch(url)),
  Async.parallel(5),                 // max 5 concurrent
  Async.map(res => res.json())
)

// Sequential
const chain = await pipe(
  Async.of(() => getUser(id)),
  Async.flatMap(user => getOrders(user.id)),
  Async.flatMap(orders => enrichOrders(orders))
)

// Race / timeout
const fast = await pipe(
  Async.of(() => fetch("/api")),
  Async.timeout(3000),               // rejects after 3s
  Async.retry(3, { backoff: "exponential", base: 500 })
)

// Throttle / debounce
const throttled = pipe(fn, Async.throttle(100))
const debounced = pipe(fn, Async.debounce(300))

// Rate limiting
const limited = await pipe(
  requests,
  Async.map(req => callApi(req)),
  Async.rateLimit(10, 1000)          // 10 per second
)

// Circuit breaker
const breaker = Async.circuitBreaker({
  threshold: 5,       // 5 failures opens circuit
  timeout: 30_000,    // 30s before half-open retry
})
const safe = pipe(
  Async.of(() => externalService()),
  Async.withBreaker(breaker)
)

// Cancellation
const [result, cancel] = Async.cancellable(
  pipe(
    Async.of(() => longRunning()),
    Async.flatMap(process)
  )
)
cancel() // aborts via AbortController

// Backpressure-aware iteration
const processed = await pipe(
  asyncIterable,
  Async.mapAsync(5, processItem),    // 5 concurrent, backpressure
  Async.filterAsync(validate),
  Async.collect
)
```

### Implementation

**Language:** TypeScript

**Core type:**

```ts
interface Task<A> {
  run: (signal?: AbortSignal) => Promise<A>
}
```

`Task` is lazy: nothing executes until `.run()` (or `await` via the pipeline). This enables composition before execution and cancellation propagation.

**Key internals:**

- `parallel(n)`: semaphore-based concurrency limiter. Maintains a queue of pending tasks, dispatches up to `n` simultaneously. Resolves in order of completion (or original order via `parallelOrdered`).
- `retry(n, opts)`: catches rejection, re-runs up to `n` times. Backoff strategies: constant, linear, exponential (with jitter). Respects `AbortSignal`.
- `rateLimit(count, window)`: token bucket algorithm. Refills tokens at `count/window` rate. Tasks queue when no tokens available.
- `circuitBreaker`: state machine (closed -> open -> half-open). Tracks failure count. When threshold exceeded, rejects immediately for `timeout` duration. Half-open allows one probe request.
- `throttle`/`debounce`: standard trailing-edge implementations, but return `Task` wrappers for composition.
- Cancellation: each `Task.run` accepts `AbortSignal`. `Async.cancellable` creates a controller and threads the signal through the entire composed chain.

**Fusion integration:** `Async.map` + `Async.filter` chains over arrays can fuse: instead of creating intermediate Promise arrays, process items through the full pipeline concurrently with backpressure. The fusion engine detects `_op: "asyncMap"` / `_op: "asyncFilter"` tags.

---

## Package 10: @nm/stream — Lazy Iterables / Transducers

**Priority: 2** | **Difficulty: 2/5**

### Overview

Pull-based lazy evaluation over iterables and generators. Deferred computation: nothing runs until the terminal operation requests values.

### API Surface

```ts
import { pipe } from "stopcock"
import * as Stream from "@nm/stream"

// Creation
const s = Stream.from([1, 2, 3, 4, 5])
const r = Stream.range(0, Infinity)
const g = Stream.from(function* () { yield* generateItems() })
const i = Stream.iterate(x => x * 2, 1) // 1, 2, 4, 8, ...

// Transformation (lazy — no work happens here)
const primes = pipe(
  Stream.range(2, Infinity),
  Stream.filter(isPrime),
  Stream.take(100)
)

// Terminal operations (pull values)
const arr  = pipe(primes, Stream.toArray)
const sum  = pipe(primes, Stream.reduce((a, b) => a + b, 0))
const first = pipe(primes, Stream.first)

// Chunking / windowing
const chunks = pipe(stream, Stream.chunk(100))
const windows = pipe(stream, Stream.slidingWindow(5))
const batches = pipe(stream, Stream.batch(50))

// Zip / interleave
const zipped = pipe(Stream.zip(streamA, streamB))
const merged = pipe(Stream.interleave(streamA, streamB))

// Flatten
const flat = pipe(nestedStream, Stream.flatMap(x => Stream.from(x.items)))

// Async iteration
const asyncResult = await pipe(
  Stream.fromAsync(asyncIterable),
  Stream.mapAsync(fetch),
  Stream.collect
)
```

### Implementation

**Language:** TypeScript + ReScript for hot-path combinators

**Core type:**

```ts
interface Stream<A> {
  [Symbol.iterator](): Iterator<A>
}
```

Each combinator returns a new `Stream` whose iterator lazily wraps the source iterator. No intermediate arrays.

**Key internals:**

- `filter`, `map`, `take`, `drop`: each wraps the source `Iterator`, applying logic in `next()`. `take` returns `{ done: true }` after n items.
- `flatMap`: returns an iterator that maintains an "inner" iterator. When inner is exhausted, pulls next from outer, creates new inner.
- `chunk(n)`: accumulates n items in a buffer, yields the buffer, starts fresh.
- `slidingWindow(n)`: ring buffer of size n. Yields a copy after each new item.
- `reduce`, `toArray`, `first`: terminal operations that drive the iterator protocol.

**Fusion engine integration:** When a `Stream` is used as input to `pipe()` alongside `A.map`, `A.filter`, etc., the fusion engine can detect the iterable input and switch from eager array processing to pull-based iteration. This is an extension of the existing materialization boundary concept: the stream *is* the lazy segment.

---

## Package 11: @nm/struct — Persistent/Immutable Data Structures

**Priority: 3** | **Difficulty: 4/5**

### Overview

Immutable collections with structural sharing. Functional programming without persistent data structures forces defensive copying on every update.

### API Surface

```ts
import { pipe } from "stopcock"
import * as Struct from "@nm/struct"

// HAMT (immutable map)
const m = Struct.HashMap.empty<string, number>()
const m2 = pipe(m, Struct.HashMap.set("a", 1), Struct.HashMap.set("b", 2))
const val = pipe(m2, Struct.HashMap.get("a"))        // Option<number>
const m3 = pipe(m2, Struct.HashMap.delete("a"))
const size = pipe(m2, Struct.HashMap.size)

// Iteration
const entries = pipe(m2, Struct.HashMap.toArray)
const mapped = pipe(m2, Struct.HashMap.map(v => v * 2))

// Finger tree (immutable deque)
const dq = Struct.Deque.empty<number>()
const dq2 = pipe(dq, Struct.Deque.pushBack(1), Struct.Deque.pushBack(2))
const dq3 = pipe(dq2, Struct.Deque.pushFront(0))
const [head, rest] = pipe(dq3, Struct.Deque.popFront) // [Option<number>, Deque<number>]
const concatenated = pipe(Struct.Deque.concat(dqA, dqB))

// Sorted set (red-black tree)
const ss = Struct.SortedSet.empty<number>()
const ss2 = pipe(ss, Struct.SortedSet.add(3), Struct.SortedSet.add(1), Struct.SortedSet.add(2))
const sorted = pipe(ss2, Struct.SortedSet.toArray) // [1, 2, 3]
const has = pipe(ss2, Struct.SortedSet.has(2))     // true
const range = pipe(ss2, Struct.SortedSet.range(1, 3))
```

### Implementation

**Language:** ReScript

Algebraic data types and pattern matching are the natural fit for tree structures. ReScript's variant types compile to efficient tagged JS objects.

**Algorithms:**

- **HAMT:** 32-way branching trie keyed by hash bits. 5 bits per level, 7 levels for 32-bit hash. Bitmap node layout: a 32-bit bitmap indicates which children exist, compact array stores only present children. Path copying on insert/delete (O(log32 n) = O(7) nodes copied). Collision nodes for hash collisions (linked list at leaf level).

- **Finger tree:** recursive structure: `Empty | Single(a) | Deep(prefix, deeper, suffix)` where prefix/suffix are 1-4 element arrays and deeper is a finger tree of nodes. Push/pop on both ends: O(1) amortized. Concatenation: O(log(min(n,m))). ReScript variants map directly to this recursive definition.

- **Red-black tree:** standard left-leaning red-black tree. Insert: walk down, insert red leaf, fix up (at most 2 rotations). Delete: complex but well-defined. All operations O(log n). Path copying for persistence.

**Structural sharing:** only nodes on the path from root to the modified leaf are copied. All other subtrees are shared between old and new versions. This makes `set` on a HAMT with 1M entries copy ~7 nodes (224 bytes), not the entire map.

---

## Package 12: @nm/parse — Parser Combinators

**Priority: 4** | **Difficulty: 3/5**

### Overview

Composable parsers built from small pieces. The quintessential FP pattern: complex behavior from simple, composable parts.

### API Surface

```ts
import { pipe } from "stopcock"
import * as P from "@nm/parse"

// Primitives
const digit = P.regex(/[0-9]/)
const letter = P.regex(/[a-zA-Z]/)
const ws = P.regex(/\s*/)

// Combinators
const identifier = pipe(
  P.seq(letter, P.many(P.alt(letter, digit))),
  P.map(([first, rest]) => first + rest.join(""))
)

const integer = pipe(
  P.many1(digit),
  P.map(ds => parseInt(ds.join(""), 10))
)

const between = (open: string, close: string) => <A>(p: P.Parser<A>) =>
  pipe(P.seq(P.string(open), p, P.string(close)), P.map(([, v]) => v))

const parens = between("(", ")")

// Built-in parsers
const json = P.json         // full JSON parser from combinators
const csv  = P.csv          // RFC 4180 compliant
const url  = P.url          // URL with components

// Running
const result = P.run(identifier, "hello123 world")
// { success: true, value: "hello123", rest: " world" }

// Error reporting
const detailed = P.runVerbose(parser, input)
// { success: false, expected: "digit", position: { line: 3, col: 12 } }

// Recursive grammars
const expr: P.Parser<Expr> = P.lazy(() =>
  P.alt(
    pipe(P.seq(expr, P.string("+"), term), P.map(([l, , r]) => Add(l, r))),
    term
  )
)
```

### Implementation

**Language:** TypeScript

**Core type:**

```ts
type Parser<A> = (input: string, pos: number) => ParseResult<A>
type ParseResult<A> = { ok: true; value: A; pos: number } | { ok: false; expected: string; pos: number }
```

Parsers are functions. Combinators are higher-order functions that compose parsers. Zero allocation on the hot path (result objects are reused via object pooling or returned as tuples).

**Key combinators:**
- `seq(...parsers)`: runs parsers in sequence, fails on first failure.
- `alt(...parsers)`: tries each parser, returns first success. Backtracks on failure.
- `many(p)`: zero or more. Loops calling `p` until failure, collects results.
- `many1(p)`: one or more.
- `sepBy(p, sep)`: `p` separated by `sep`. Returns array of `p` results.
- `lazy(f)`: deferred parser creation for recursive grammars. `f` is called once and cached.
- `map(p, f)`: transforms successful result.

**Error reporting:** track furthest position reached across `alt` branches. Report "expected X at line:col" for the deepest failure.

---

## Package 13: @nm/validate — Schema Validation

**Priority: 2** | **Difficulty: 3/5**

### Overview

Composable schema validators with JIT compilation. Zod interprets schemas at runtime, walking a tree of validator objects per value. This compiles schemas to specialized validator functions using `new Function()`, the same technique as the fusion engine's AOT compiler.

### API Surface

```ts
import * as V from "@nm/validate"

// Primitives
const Name = V.string().min(1).max(100)
const Age = V.number().int().min(0).max(150)
const Email = V.string().email()

// Objects
const User = V.object({
  name: Name,
  age: Age,
  email: Email,
  role: V.enum(["admin", "user", "guest"]),
  tags: V.array(V.string()).optional(),
})

// Composition
const CreateUserRequest = V.object({
  user: User,
  idempotencyKey: V.string().uuid(),
})

// Validation
const result = User.parse(input)         // Result<User, ValidationError[]>
const typed = User.assert(input)         // throws on failure, returns typed value
const check = User.is(input)             // type guard: input is User

// Pipe integration
import { pipe } from "stopcock"

const process = pipe(
  rawInput,
  User.parse,
  R.map(user => enrichUser(user)),
  R.getOrElse(() => defaultUser)
)

// Schema operations
const Partial = V.partial(User)          // all fields optional
const Pick = V.pick(User, ["name", "email"])
const Extend = V.extend(User, { department: V.string() })
const Infer = V.infer<typeof User>       // TypeScript type extraction

// Discriminated unions
const Shape = V.discriminatedUnion("type", [
  V.object({ type: V.literal("circle"), radius: V.number() }),
  V.object({ type: V.literal("rect"), width: V.number(), height: V.number() }),
])
```

### Implementation

**Language:** TypeScript with JIT compilation

**Schema definition:** each validator method returns a schema node (plain object describing constraints). Schemas are data, not functions, until compiled.

**JIT compilation:**

```ts
// V.object({ name: V.string().min(1), age: V.number() })
// compiles to:
function validate_User(input) {
  if (typeof input !== "object" || input === null) return err("expected object")
  const name = input.name
  if (typeof name !== "string") return err("name: expected string")
  if (name.length < 1) return err("name: min length 1")
  const age = input.age
  if (typeof age !== "number") return err("age: expected number")
  return ok({ name, age })
}
```

No tree walking, no method dispatch, no schema interpretation at validation time. The compiled function is a straight-line sequence of type checks and constraint tests.

**Compilation strategy:**
1. Schema is built by chaining methods (like Zod).
2. On first `.parse()` / `.assert()` / `.is()` call, the schema is compiled to a function via `new Function()`.
3. Compiled function is cached on the schema object.
4. Subsequent calls execute the compiled function directly.

**Error accumulation:** compiled functions collect all errors (not just the first) via a pre-allocated error array. This enables "show all validation errors" UX.

**Reuse of infrastructure:** the AOT compiler in `codegen/aot-compile.ts` already generates optimized functions from operation descriptions. The same code generation patterns (string template assembly, function compilation, caching) apply directly.

---

## Package 14: @nm/optics — Lenses, Prisms, Traversals

**Priority: 4** | **Difficulty: 3/5**

### Overview

Extends the existing `lens` module with the full optics hierarchy: prisms (for sum types / Option), traversals (multi-focus), and isos (bidirectional transforms).

### API Surface

```ts
import { pipe } from "stopcock"
import * as O from "@nm/optics"

// Lens (product types — always succeeds)
const nameLens = O.lens<User, string>(
  user => user.name,
  (user, name) => ({ ...user, name })
)

// Prop shorthand (generates lens from key)
const ageLens = O.prop<User>()("age")

// View / set / over
const name = pipe(user, O.view(nameLens))
const updated = pipe(user, O.set(nameLens, "Alice"))
const shouted = pipe(user, O.over(nameLens, s => s.toUpperCase()))

// Prism (sum types — may fail, returns Option)
const somePrism = O.prism<Option<number>, number>(
  opt => opt._tag === 1 ? O.some(opt.value) : O.none,
  value => ({ _tag: 1, value })
)

const value = pipe(maybeUser, O.preview(somePrism)) // Option<User>

// Traversal (multi-focus)
const itemsTraversal = O.traverse<Order, Item>(order => order.items)

const allPrices = pipe(order, O.collectAll(itemsTraversal, priceLens))
const discounted = pipe(
  order,
  O.overAll(itemsTraversal, priceLens, price => price * 0.9)
)

// Iso (bidirectional)
const celsiusFahrenheit = O.iso<number, number>(
  c => c * 9 / 5 + 32,
  f => (f - 32) * 5 / 9
)

// Composition (the whole point)
const addressCityLens = pipe(addressLens, O.compose(cityLens))

const deepUpdate = pipe(
  company,
  O.over(
    pipe(employeesTraversal, O.compose(addressLens), O.compose(zipLens)),
    normalizeZip
  )
)
```

### Implementation

**Language:** TypeScript

**Core types:**

```ts
interface Lens<S, A> { get: (s: S) => A; set: (s: S, a: A) => S }
interface Prism<S, A> { preview: (s: S) => Option<A>; review: (a: A) => S }
interface Traversal<S, A> { getAll: (s: S) => A[]; overAll: (s: S, f: (a: A) => A) => S }
interface Iso<S, A> { get: (s: S) => A; reverseGet: (a: A) => S }
```

**Composition rules:** lens + lens = lens, lens + prism = prism, lens + traversal = traversal, prism + lens = prism, traversal + anything = traversal. The `compose` function dispatches based on the optic type tags.

**Existing infrastructure:** the `lens.ts` module in `packages/fp/src/` already has `lensProp`, `view`, `set`, `over`. This package extends it with prisms, traversals, isos, and composition. Could either extend in-place or publish as a separate package for tree-shaking.

---

## Shared Infrastructure

### Dependency graph

```
@nm/async          (standalone — no deps beyond core)
@nm/stream         (standalone)
@nm/validate       (depends on core Result type)
@nm/optics         (depends on core Option type, extends existing lens)
@nm/parse          (depends on core Result/Option)
@nm/struct         (standalone)

@nm/hash           (standalone WASM)
@nm/encoding       (standalone WASM)
@nm/la             (standalone WASM)
@nm/img            (standalone WASM)
@nm/signal         (standalone WASM, may use @nm/la for matrix ops in filters)
@nm/compress       (standalone WASM)
@nm/geo            (standalone WASM)
@nm/rand           (standalone WASM)
```

All packages depend on `stopcock` (core) for `pipe`, `dual`, `Option`, `Result`. No circular dependencies. WASM packages are fully independent of each other.

### Fusion engine integration

Packages that produce pipeable array/iterable operations integrate with the fusion engine via `_op` tags:

- `@nm/async`: `asyncMap`, `asyncFilter` tags enable async fusion (concurrent pipeline without intermediate arrays)
- `@nm/stream`: lazy iterables are a natural fusion representation; the fusion engine can accept `Stream` as input and avoid materialization
- `@nm/validate`: compiled validators are plain functions, no special fusion needed
- WASM packages: bulk operations are opaque to the fusion engine (they process internally). But a WASM function used as a `map` callback fuses normally since the fusion engine just calls it per-element.

### WASM loading strategy (cross-package)

If a consumer uses multiple WASM packages, each maintains its own `WebAssembly.Instance`. Sharing a single WASM memory across packages would create coupling and complicate memory management. The overhead of multiple instances is minimal (each is ~64KB base memory, grown on demand).

### Build pipeline

```
Zig source → zig build (wasm32-wasi, ReleaseFast, SIMD enabled)
           → wasm-opt -O3 (Binaryen optimizer, further size/speed)
           → TS wrapper generation (typed exports matching Zig @export signatures)
           → tsup bundle (ESM + CJS, tree-shakeable)
```

Turborepo task graph:

```json
{
  "wasm": { "inputs": ["src/**/*.zig"], "outputs": ["wasm/*.wasm"] },
  "build": { "dependsOn": ["wasm", "^build"] }
}
```

### Package size budget

Target: each WASM package ships <100KB gzipped for the core module. Zig compiles to compact WASM (no runtime, no allocator unless opted in). `wasm-opt` typically reduces size by 20-30%.

| Package | Estimated WASM size (gzipped) |
|---------|-------------------------------|
| hash | ~15KB |
| encoding | ~20KB |
| la | ~30KB |
| rand | ~10KB |
| compress (lz4 only) | ~20KB |
| compress (full suite) | ~80KB |
| img | ~40KB |
| signal | ~25KB |
| geo | ~35KB |

---

## Priority / Difficulty Summary

| Package | Priority | Difficulty | Language | Rationale |
|---------|----------|------------|----------|-----------|
| @nm/async | 1 | 3/5 | TS | Biggest ecosystem gap, no toolchain needed |
| @nm/hash | 1 | 2/5 | Zig/WASM | Simplest WASM module, proves the Zig pipeline |
| @nm/validate | 2 | 3/5 | TS | Reuses JIT infrastructure, high demand |
| @nm/encoding | 2 | 2/5 | Zig/WASM | Known massive SIMD wins (base64) |
| @nm/stream | 2 | 2/5 | TS/ReScript | Natural extension of fusion engine |
| @nm/la | 2 | 4/5 | Zig/WASM | Complex algorithms but high value |
| @nm/img | 3 | 4/5 | Zig/WASM | Large surface area, lots of algorithms |
| @nm/signal | 3 | 4/5 | Zig/WASM | FFT is well-defined but implementation is subtle |
| @nm/compress | 3 | 3/5 | Zig/WASM | Algorithms are complex but well-documented |
| @nm/struct | 3 | 4/5 | ReScript | HAMT and finger trees are non-trivial |
| @nm/parse | 4 | 3/5 | TS | Useful but smaller audience |
| @nm/optics | 4 | 3/5 | TS | Extends existing lens module |
| @nm/geo | 4 | 4/5 | Zig/WASM | Niche audience, complex algorithms |
| @nm/rand | 4 | 2/5 | Zig/WASM | Simple but lower demand |

### Recommended execution order

1. **@nm/hash** + **@nm/async** (parallel: one proves Zig/WASM pipeline, the other fills the ecosystem gap)
2. **@nm/encoding** + **@nm/validate** (parallel: both quick wins with high impact)
3. **@nm/stream** + **@nm/la** (parallel: stream extends fusion, LA is the flagship WASM package)
4. **@nm/struct** + **@nm/compress** (parallel: both medium effort)
5. **@nm/img** + **@nm/signal** (parallel: both heavy WASM, benefit from lessons learned)
6. **@nm/parse** + **@nm/optics** + **@nm/geo** + **@nm/rand** (remaining packages, lower priority)
