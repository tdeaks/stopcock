# `@stopcock/vision` 1.0 implementation plan

## Outcome

Ship `@stopcock/vision@1.0.0` as Stopcock's deterministic classical-computer-vision package. The synchronous root is the normative CPU implementation and operates on explicit packed image planes. Optional subpaths add local features, sparse optical flow, browser capture, and an honest `ComputeRuntime` adapter without pulling browser or Compute code into the root bundle.

The complete 1.0 package includes:

- byte grayscale and binary-mask planes;
- Canny edge detection, rectangular morphology, and contour hierarchy extraction;
- normalized-DLT homographies, seeded RANSAC, perspective transforms, and inverse warping;
- document detection, rectification, contrast enhancement, and adaptive binary scanning;
- FAST corners, oriented BRIEF/ORB descriptors, and deterministic Hamming matching;
- pyramidal Lucas-Kanade sparse optical flow;
- `ImageBitmap`, `VideoFrame`, canvas, video, and disposable camera adapters; and
- asynchronous acceleration of representable stages through an explicit `ComputeRuntime`, with visible CPU-stage and backend-fallback diagnostics.

The package starts at `0.0.0` with `private: true`. Remove `private` and add the major Changeset for `1.0.0` only after all mandatory CPU, browser, packaging, documentation, benchmark, and Compute-parity gates in this plan pass.

---

## 1. Locked scope

### Included in 1.0

- Dense `GrayImage` and `Mask` planes with validated dimensions and canonical output values.
- RGBA-to-gray and plane-to-RGBA adapters for the existing `@stopcock/img` `Image` type.
- Relative- or absolute-threshold Canny using Gaussian smoothing, Sobel gradients, four-direction non-maximum suppression, and eight-connected hysteresis.
- Grayscale and binary rectangular erosion, dilation, opening, and closing using separable van Herk/Gil-Werman passes.
- Eight-connected Suzuki-Abe contour following with external/list/tree retrieval and full or simple chain output.
- Ordered quads, exact three-by-three projective matrices, normalized DLT, seeded RANSAC, point transformation, and nearest/bilinear perspective warp.
- A contour-based document detector that returns `null` when there is no confident, unambiguous quadrilateral.
- Rectified color, enhanced-gray, and Sauvola-binary document output.
- FAST-9 corners, Harris ranking, multi-scale ORB, fixed 256-bit descriptors, Hamming distance, ratio filtering, and mutual cross-check matching.
- Coarse-to-fine pyramidal Lucas-Kanade tracking with per-point status, error, and iteration counts.
- Browser capture from `ImageBitmap`, `VideoFrame`, `HTMLCanvasElement`, `OffscreenCanvas`, and `HTMLVideoElement`.
- Camera acquisition through `getUserMedia`, pull-based frames, source-level cancellation, and deterministic track/listener/video cleanup.
- A `@stopcock/vision/compute` adapter that invokes only public Compute programs and reports every Compute and CPU stage.

### Explicit exclusions

- No OCR, handwriting recognition, document semantics, barcode/QR detection, face detection, neural-network inference, model loading, or ML runtime.
- No camera calibration, stereo reconstruction, structure from motion, dense optical flow, bundle adjustment, SLAM, or 3D point clouds.
- No general segmentation framework, watershed, graph cuts, active contours, or learned feature descriptors.
- No video encoder/decoder, recording, media-server integration, or ownership of caller-supplied `ImageBitmap`, `VideoFrame`, canvas, video, or stream objects.
- No OpenCV-compatible namespace or promise of bit-for-bit OpenCV output.
- No hidden worker pool, hidden camera permission request, global accelerator installation, implicit runtime singleton, or automatic Compute dependency.
- No dependency on or integration with the private `@stopcock/synth` package.

---

## 2. Repository seams and compatibility

- `@stopcock/img` currently owns `Image = { data: Uint8ClampedArray; width; height }`, raw RGBA creation/copying, RGB-to-gray conversion, RGBA convolution, Sobel-style `edgeDetect`, Hough lines, and connected components. Vision reuses the `Image` type but does not change those functions or reinterpret their results.
- `@stopcock/img`'s public `rgbToGray` uses `round(0.299R + 0.587G + 0.114B)`. Vision's default RGBA-to-gray conversion must use that same formula so moving from Img to Vision does not change opaque pixels.
- Img's `Image` type has no discriminator and its typed-array contents are mutable. Vision treats every caller buffer as read-only for the duration of a call and always allocates a distinct public result unless a constructor explicitly receives `copy: false`.
- `@stopcock/geo` supplies `Point`, interleaved `PointBuffer`, `Bounds`, exact orientation, hulls, polygon metrics, and simplification. Vision uses those public APIs rather than adding a second planar-geometry toolkit.
- Geo uses Cartesian winding, while image coordinates increase rightward and downward. Vision contour documentation and adapters must state the distinction explicitly.
- `@stopcock/la` supplies row-major `Mat`, SVD, solves, inverse, and matrix primitives. Homography code uses public LA functions and keeps its own fixed-length validation; it does not reach into LA internals.
- The planned Compute contract exposes closed rank-0–4 programs, `f32`, `f64`, `i32`, and `u32` tensor views, convolution/stencil/reduction primitives, asynchronous `ComputeRuntime`, and visible `ExecutionReport`s. Vision must not invent a private Compute opcode or parse callbacks.
- Existing packages are ESM-only, `sideEffects: false`, built with `tsup` plus declaration emission, tested under `packages/*/src/**/__tests__`, documented through Astro/Starlight, and released through Changesets. Vision follows the same conventions.
- Root build/test automation excludes only `@stopcock/synth`. Vision must join ordinary package automation without adding Synth to its graph.

---

## 3. Package layout and exports

Create `packages/vision` with runtime dependencies on `@stopcock/fp`, `@stopcock/img`, `@stopcock/geo`, and `@stopcock/la`. Declare `@stopcock/compute` as an optional peer dependency and a development dependency used only to build and test `/compute`.

Public entrypoints:

| Entrypoint | Responsibility |
|---|---|
| `@stopcock/vision` | Planes, conversion, thresholding, Canny, morphology, contours, homographies, warp, and document workflows |
| `@stopcock/vision/features` | FAST, ORB description, Hamming matching, and match-to-correspondence adapters |
| `@stopcock/vision/motion` | Pyramidal Lucas-Kanade sparse optical flow |
| `@stopcock/vision/browser` | Browser frame conversion, canvas/video capture, and disposable camera sources |
| `@stopcock/vision/compute` | Explicit asynchronous `ComputeRuntime` adapter and stage diagnostics |

Recommended source layout:

```text
packages/vision/
  package.json
  README.md
  tsconfig.json
  tsup.config.ts
  src/
    index.ts
    types.ts
    errors.ts
    validate.ts
    plane.ts
    canny.ts
    morphology.ts
    contours.ts
    homography.ts
    warp.ts
    document.ts
    internal/
      allocation.ts
      convolution.ts
      gradient.ts
      interpolate.ts
      integral.ts
      prng.ts
      pyramid.ts
    features/
      index.ts
      fast.ts
      orb.ts
      pattern.ts
      match.ts
    motion/
      index.ts
      lucas-kanade.ts
    browser/
      index.ts
      canvas.ts
      camera.ts
    compute/
      index.ts
      adapter.ts
      programs.ts
    __tests__/
```

Each public subpath gets a separate tsup entry and package export. The root entry must not statically import `@stopcock/compute`, DOM declarations, browser globals, camera code, WebCodecs code, or browser worker code. `/browser` reads platform globals only inside invoked functions, so importing it during SSR is safe. `/compute` must be the only entry with a runtime import from `@stopcock/compute`.

---

## 4. Canonical representations and coordinate semantics

### Public plane and geometry types

```ts
import type { Image } from '@stopcock/img'
import type { Bounds, Point, PointBuffer } from '@stopcock/geo'

export type GrayImage = Readonly<{
  readonly kind: 'gray8'
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
}>

export type Mask = Readonly<{
  readonly kind: 'mask8'
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
}>

export type PixelPlane = GrayImage | Mask

export type Quad = readonly [
  topLeft: Point,
  topRight: Point,
  bottomRight: Point,
  bottomLeft: Point,
]

export interface Homography extends Float64Array {
  readonly length: 9
  readonly __stopcockHomography: unique symbol
}
```

`Image` is re-exported as a type from the root for convenience; its runtime constructors remain owned by `@stopcock/img`.

### Plane invariants

- Width and height are positive safe integers. `data.length` is exactly `width * height`; multiplication is checked for safe-integer overflow before comparing or allocating.
- `GrayImage` values represent intensity in `[0, 255]` and are row-major with no public stride or offset in 1.0.
- A `Mask` treats zero as background and every non-zero input byte as foreground. Every Vision-produced mask is canonicalized to exactly `0` or `255`.
- Public operations never mutate input planes, images, points, descriptors, options, or caller arrays. Returned typed arrays never alias inputs unless the caller explicitly constructs a plane with `copy: false`; even then algorithms allocate outputs.
- Constructors copy by default. `copy: false` creates a borrowed dense view and is documented as observing future caller mutation.
- Alpha is not represented in a gray plane or mask. RGBA conversion defaults to ignoring alpha, matching existing Img behavior. Callers may explicitly composite transparency against black or white.

### Pixel coordinates

- The origin is the centre of the top-left pixel. Pixel `(x, y)` has integer centre coordinates and occupies the continuous square `[x - 0.5, x + 0.5] x [y - 0.5, y + 0.5]`.
- X increases rightward and Y downward. Angles exposed by Features are radians increasing clockwise in image coordinates, normalized to `[-Math.PI, Math.PI)`.
- Quads are always ordered top-left, top-right, bottom-right, bottom-left in image coordinates. Public quad normalization rejects duplicate, self-crossing, or effectively zero-area inputs.
- A homography is a row-major three-by-three matrix mapping source pixel-centre coordinates to destination pixel-centre coordinates. It is normalized to finite unit Frobenius scale with a positive final non-zero element where possible; code must never assume `h[8]` can always be normalized to one.
- Projective division treats `abs(w) <= 1e-12 * max(1, abs(xNumerator), abs(yNumerator))` as a point at infinity.

### Construction and conversion

```ts
export function grayImage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { readonly copy?: boolean },
): GrayImage

export function maskImage(
  data: Uint8Array,
  width: number,
  height: number,
  options?: { readonly copy?: boolean },
): Mask

export type AlphaMode = 'ignore' | 'black' | 'white'

export const toGray: {
  (image: Image, options?: { readonly alpha?: AlphaMode }): GrayImage
  (options?: { readonly alpha?: AlphaMode }): (image: Image) => GrayImage
}

export function planeToImage(
  plane: PixelPlane,
  options?: {
    readonly foreground?: readonly [number, number, number, number]
    readonly background?: readonly [number, number, number, number]
  },
): Image

export const threshold: {
  (image: GrayImage, value: number): Mask
  (value: number): (image: GrayImage) => Mask
}
```

`toGray` computes the existing Img BT.601 byte luminance. `ignore` uses RGB unchanged; `black` multiplies luminance by alpha; `white` composites it against 255. `planeToImage` maps gray bytes to opaque equal RGB channels. For masks it defaults to opaque white foreground and opaque black background; custom colors are validated bytes.

---

## 5. Validation, errors, and resource limits

Export a `VisionError` base with stable `code`, optional structured details, and these subclasses:

- `InvalidImageError`, `InvalidPlaneError`, and `InvalidOptionError`;
- `PixelLimitError`, `TemporaryMemoryLimitError`, `FeatureLimitError`, and `WorkLimitError`;
- `DegenerateQuadError`, `DegenerateCorrespondenceError`, `SingularHomographyError`, and `PointAtInfinityError`;
- `BrowserApiUnavailableError`, `FrameUnavailableError`, `CameraClosedError`, and `FrameIteratorActiveError`;
- `VisionComputeDisposedError` and `VisionComputeStageError`.

Use `TypeError`-compatible subclasses for wrong object/buffer kinds and `RangeError`-compatible subclasses for invalid numeric ranges or exceeded configured limits. Invalid input must fail before output mutation or large allocation. A valid search that finds no document, model, feature, or contour returns the specified empty result or `null`; it is not an exception.

```ts
export type VisionLimits = Readonly<{
  maxPixels: number
  maxTemporaryBytes: number
  maxContours: number
  maxContourPoints: number
  maxFeatures: number
  maxCorrespondences: number
  maxOutputPixels: number
}>

export const DEFAULT_VISION_LIMITS: VisionLimits
```

Pin defaults to:

- `maxPixels: 64_000_000`;
- `maxTemporaryBytes: 512 * 1024 * 1024`;
- `maxContours: 100_000`;
- `maxContourPoints: 8_000_000`;
- `maxFeatures: 20_000`;
- `maxCorrespondences: 100_000`; and
- `maxOutputPixels: 64_000_000`.

Heavy option types accept `limits?: Partial<VisionLimits>`. Validate finite positive safe integers, merge with defaults, calculate complete worst-case working memory before allocation, and reject if the planned peak exceeds the ceiling. Temporary arrays are call-local and released after completion. No global cache may retain image buffers.

Synchronous CPU functions are deterministic and non-cancellable once entered. They enforce explicit work limits instead. Browser and Compute APIs accept `AbortSignal`; an already-aborted signal rejects with `signal.reason`, and an abort during asynchronous work uses the same reason unchanged.

---

## 6. Canny edge detection

### API

```ts
export type CannyThresholds =
  | Readonly<{ kind: 'relative'; low: number; high: number }>
  | Readonly<{ kind: 'absolute'; low: number; high: number }>

export type CannyOptions = Readonly<{
  sigma?: number
  radius?: number
  thresholds?: CannyThresholds
  border?: 'reflect' | 'clamp'
  limits?: Partial<VisionLimits>
}>

export const canny: {
  (image: GrayImage, options?: CannyOptions): Mask
  (options?: CannyOptions): (image: GrayImage) => Mask
}
```

Defaults are `sigma: 1.4`, `radius: ceil(3 * sigma)`, relative thresholds `{ low: 0.1, high: 0.2 }`, and reflected borders. Sigma is finite and greater than zero; radius is an integer from 1 through 32. Low/high must be finite, non-negative, and `low <= high`; relative values are at most one.

### Algorithm and numeric contract

1. Generate and normalize a one-dimensional Gaussian kernel in `Float64Array`.
2. Convolve horizontal then vertical into `Float64Array` planes without intermediate byte clamping.
3. Apply fixed 3x3 Sobel X/Y kernels. Store gradient components and Euclidean magnitude as doubles.
4. Quantize direction into `0`, `45`, `90`, or `135` degrees and perform non-maximum suppression. Ties keep the pixel only when it wins the lexicographically earlier comparison, preventing two-pixel plateaus from varying by traversal.
5. For relative thresholds, multiply low/high by the maximum finite suppressed magnitude. A maximum of zero returns an all-zero mask.
6. Mark strong pixels at or above high, weak pixels at or above low, and run iterative eight-neighbour hysteresis from strong pixels using an explicitly allocated stack. Do not recurse.
7. Emit `255` for retained edges and `0` otherwise.

Absolute thresholds use raw Sobel magnitude on input bytes and are not normalized. Every pass uses row-major traversal. NaN cannot arise from validated byte input and finite options; an implementation-generated non-finite value is an internal error rather than background.

---

## 7. Binary and grayscale morphology

### API

```ts
export type MorphologyOptions = Readonly<{
  radius: number | readonly [x: number, y: number]
  iterations?: number
  border?: 'clamp' | 'constant'
  constant?: number
  limits?: Partial<VisionLimits>
}>

export const erode: {
  <T extends PixelPlane>(image: T, options: MorphologyOptions): T
  (options: MorphologyOptions): <T extends PixelPlane>(image: T) => T
}

export const dilate: typeof erode
export const open: typeof erode
export const close: typeof erode
```

Radius components are integer values from zero through 1,024. `iterations` defaults to one and is an integer from one through 64. A zero-by-zero radius returns a distinct copy. `border` defaults to `clamp`. With `constant`, the default is operation-neutral: 255 for erosion and 0 for dilation; an explicit byte constant is used by every constituent pass of opening/closing.

### Algorithm and semantics

- Implement rectangular max/min filters as horizontal and vertical van Herk/Gil-Werman passes. Runtime is `O(width * height)` per iteration and does not scale with kernel area.
- Opening is erosion followed by dilation. Closing is dilation followed by erosion. Each requested iteration applies the complete named operation again.
- Preserve the input discriminator and typed-array class. Grayscale outputs retain extrema in `[0,255]`; mask outputs canonicalize non-zero extrema to `255`.
- Never implement large radii as nested kernel loops. A small-radius reference implementation exists only in tests.
- Border extension is performed logically and does not allocate a padded image.

---

## 8. Contours and hierarchy

### API

```ts
export type ContourKind = 'outer' | 'hole'
export type ContourRetrieval = 'external' | 'list' | 'tree'
export type ContourApproximation = 'none' | 'simple'

export type Contour = Readonly<{
  id: number
  kind: ContourKind
  points: PointBuffer
  area: number
  perimeter: number
  bounds: Bounds
  parent: number | null
  firstChild: number | null
  nextSibling: number | null
  previousSibling: number | null
}>

export type ContourResult = Readonly<{
  width: number
  height: number
  contours: readonly Contour[]
}>

export type ContourOptions = Readonly<{
  retrieval?: ContourRetrieval
  approximation?: ContourApproximation
  minArea?: number
  limits?: Partial<VisionLimits>
}>

export const findContours: {
  (mask: Mask, options?: ContourOptions): ContourResult
  (options?: ContourOptions): (mask: Mask) => ContourResult
}
```

Defaults are tree retrieval, simple chain approximation, and `minArea: 0`. Foreground is eight-connected and background is four-connected, matching Suzuki-Abe's unambiguous topology convention.

### Output contract

- Follow borders over a private one-pixel zero frame; never mutate or relabel the caller's mask.
- Contour points are centres of boundary foreground pixels and omit a repeated terminal point.
- `none` retains every border-following step. `simple` removes consecutive collinear horizontal, vertical, and diagonal steps without geometric smoothing.
- Output outer contours are clockwise on screen and holes counter-clockwise on screen. `area` is always non-negative and expressed in squared pixels; it does not expose Geo's Cartesian signed-area convention.
- IDs are dense result-array indices. Tree retrieval fills all hierarchy links. List retrieval retains every contour but nulls hierarchy links. External retrieval keeps only top-level outers and reassigns dense IDs.
- Sort siblings by first discovery in row-major scan order. Filtering by `minArea` removes the complete filtered node but reparents retained descendants to the nearest retained ancestor.
- Empty masks return `{ width, height, contours: [] }`.
- Stop before exceeding `maxContours` or total `maxContourPoints`; throw `WorkLimitError` without returning a partial tree.

---

## 9. Homographies and perspective warp

### Public types and construction

```ts
export type Correspondence = Readonly<{
  source: Point
  destination: Point
}>

export type HomographyEstimate = Readonly<{
  homography: Homography
  inliers: Uint32Array
  rmsError: number
  iterations: number
}>

export type RansacOptions = Readonly<{
  seed?: number
  reprojectionThreshold?: number
  confidence?: number
  maxIterations?: number
  minInliers?: number
  limits?: Partial<VisionLimits>
}>

export function makeHomography(values: ArrayLike<number>): Homography
export function identityHomography(): Homography
export function orderQuad(points: readonly [Point, Point, Point, Point]): Quad

export function solveHomography(source: Quad, destination: Quad): Homography

export function estimateHomography(
  correspondences: readonly Correspondence[],
  options?: RansacOptions,
): HomographyEstimate | null

export function invertHomography(homography: Homography): Homography | null
export function composeHomographies(after: Homography, before: Homography): Homography
export function transformPoint(homography: Homography, point: Point): Point | null
export function transformPoints(homography: Homography, points: PointBuffer): PointBuffer
```

`makeHomography` copies exactly nine finite values and rejects a singular or all-zero matrix. `orderQuad` sorts four unique finite points around their centroid, verifies convex non-zero area with Geo predicates, rotates to the top-left start, and produces clockwise screen order. It throws `DegenerateQuadError` rather than guessing through a bow tie or duplicate.

`transformPoint` returns `null` for a point at infinity. `transformPoints` throws `PointAtInfinityError` naming the point index so its packed output never contains a sentinel or partial result.

### DLT and RANSAC

- Normalize source and destination coordinates independently to zero centroid and RMS distance `sqrt(2)`.
- Build the standard two-row-per-match DLT matrix and take the right singular vector corresponding to the smallest singular value using public LA SVD.
- Denormalize, normalize matrix scale, and reject rank-deficient or ill-conditioned systems. Four-point solving additionally rejects any sample containing three collinear source or destination points.
- RANSAC uses a package-private xoshiro32 generator seeded by `seed >>> 0`; the default seed is `0x5a17c0de`. It samples four distinct indices without replacement.
- Score models with symmetric transfer error: the squared forward destination error plus squared inverse source error. An inlier's square-root mean error must be at most `reprojectionThreshold`, default three pixels.
- Defaults are confidence `0.995`, maximum 2,000 iterations, and minimum inliers `max(4, ceil(0.25 * count))`. The confidence formula may reduce, never increase, the configured iteration cap.
- Choose the model with most inliers, then lowest RMS error, then lexicographically smallest sorted sample indices.
- Refit once from all inliers using normalized DLT, reclassify once, and refit a final time if the inlier set changed.
- Return inlier indices in ascending input order. Return `null` when no model reaches `minInliers`; malformed inputs and exceeded limits still throw.

### Warp API

```ts
export type WarpOptions<P extends Image | PixelPlane> = Readonly<{
  width: number
  height: number
  interpolation?: P extends Mask ? 'nearest' : 'nearest' | 'bilinear'
  border?: 'constant' | 'clamp'
  fill?: P extends Image
    ? readonly [number, number, number, number]
    : number
  limits?: Partial<VisionLimits>
}>

export function warpPerspective(
  image: Image,
  sourceToDestination: Homography,
  options: WarpOptions<Image>,
): Image

export function warpPerspective(
  image: GrayImage,
  sourceToDestination: Homography,
  options: WarpOptions<GrayImage>,
): GrayImage

export function warpPerspective(
  image: Mask,
  sourceToDestination: Homography,
  options: WarpOptions<Mask>,
): Mask
```

Warp computes the inverse homography once, visits destination pixel centres in row-major order, maps each to source coordinates, and samples there. Defaults are bilinear for RGBA/gray, nearest for masks, constant borders, transparent black for RGBA, and zero for planes. Bilinear RGBA interpolates straight byte channels including alpha; it does not silently premultiply. Nearest uses round-half-up. Bilinear samples use the four surrounding integer pixel centres and the same per-neighbour border rule. Final byte conversion rounds to nearest then clamps. A singular mapping throws before allocating output.

---

## 10. Document detection, rectification, and scanning

### Types and API

```ts
export type DocumentDetectionOptions = Readonly<{
  maxDimension?: number
  canny?: CannyOptions
  closeRadius?: number
  minAreaRatio?: number
  maxAreaRatio?: number
  minSideRatio?: number
  minConfidence?: number
  ambiguityGap?: number
  maxCandidates?: number
  limits?: Partial<VisionLimits>
}>

export type DocumentDiagnostics = Readonly<{
  analyzedWidth: number
  analyzedHeight: number
  contourCount: number
  candidateCount: number
  rejectedByArea: number
  rejectedByShape: number
  rejectedByConfidence: number
  runnerUpConfidence: number | null
}>

export type DocumentDetection = Readonly<{
  quad: Quad
  confidence: number
  areaRatio: number
  rectangularity: number
  edgeSupport: number
  contourId: number
  diagnostics: DocumentDiagnostics
}>

export type RectifyOptions = Readonly<{
  size?: Readonly<{ width: number; height: number }>
  maxDimension?: number
  interpolation?: 'nearest' | 'bilinear'
  limits?: Partial<VisionLimits>
}>

export type RectifiedDocument<T extends Image | PixelPlane> = Readonly<{
  image: T
  sourceQuad: Quad
  destinationQuad: Quad
  homography: Homography
}>

export function detectDocument(
  image: Image | GrayImage,
  options?: DocumentDetectionOptions,
): DocumentDetection | null

export function rectifyDocument<T extends Image | GrayImage>(
  image: T,
  document: DocumentDetection | Quad,
  options?: RectifyOptions,
): RectifiedDocument<T>

export type ScanMode = 'color' | 'gray' | 'binary'

export type DocumentScan<T extends Image | PixelPlane> = Readonly<{
  mode: ScanMode
  detection: DocumentDetection
  rectified: RectifiedDocument<T>
}>

export type ScanOptions = DocumentDetectionOptions & RectifyOptions & Readonly<{
  output?: ScanMode
  enhanceContrast?: boolean
  contrastPercentiles?: readonly [low: number, high: number]
  sauvola?: Readonly<{ radius?: number; k?: number; dynamicRange?: number }>
}>

export function scanDocument(
  image: Image,
  options?: ScanOptions & { readonly output?: 'color' },
): DocumentScan<Image> | null

export function scanDocument(
  image: Image,
  options: ScanOptions & { readonly output: 'gray' },
): DocumentScan<GrayImage> | null

export function scanDocument(
  image: Image,
  options: ScanOptions & { readonly output: 'binary' },
): DocumentScan<Mask> | null
```

### Detection pipeline

Defaults are `maxDimension: 1600`, `closeRadius: 2`, area ratio `[0.12, 0.98]`, minimum side ratio `0.08`, minimum confidence `0.55`, ambiguity gap `0.05`, and 64 candidates.

1. Validate the source. If its largest dimension exceeds `maxDimension`, create a bilinearly downscaled analysis image and record exact X/Y scale factors.
2. Convert to gray, run Canny, then close the edge mask.
3. Extract external contours, sorted by descending area with row-major contour ID as tie-breaker. Examine at most `maxCandidates` after area filtering.
4. Compute each contour's convex hull. Simplify the closed hull at epsilon values `0.01`, `0.015`, `0.02`, `0.03`, `0.04`, and `0.05` times perimeter, retaining every distinct four-vertex convex result.
5. Reject candidates outside the area range, with any side shorter than `minSideRatio * min(analyzedWidth, analyzedHeight)`, with self-intersection, or with an internal angle outside `[25, 155]` degrees.
6. Score each unique quad:
   - `areaScore = clamp(areaRatio / 0.60, 0, 1)`;
   - `rectangularity = mean(1 - abs(cos(internalAngle)))`;
   - `edgeSupport` is the fraction of rasterized side samples having an edge pixel within a two-pixel Chebyshev radius;
   - `borderScore` is one when every vertex is at least two pixels from the analysis boundary, otherwise the minimum normalized boundary distance clamped to `[0,1]`; and
   - `confidence = 0.30 * areaScore + 0.25 * rectangularity + 0.35 * edgeSupport + 0.10 * borderScore`.
7. Deduplicate candidates whose convex intersection-over-union is at least `0.85`, keeping the higher-confidence/tie-broken result.
8. Choose highest confidence, then largest area, then lexicographically smallest packed quad. Return `null` if it is below `minConfidence`, or if a non-overlapping runner-up is within `ambiguityGap`.
9. Transform the winning quad back to original pixel-centre coordinates and clamp only sub-pixel numerical overshoot within `1e-9` of the source support. Do not clamp a genuinely out-of-bounds candidate.

There is no line-only or image-boundary fallback. Blank, highly ambiguous, non-quadrilateral, or insufficiently supported inputs return `null`.

### Rectification and scan output

- Inferred output width is `round(max(top length, bottom length))`; inferred height is `round(max(left length, right length))`, each at least one. An explicit size wins. `maxDimension` then scales inferred dimensions down without changing aspect ratio.
- The destination quad is `[(0,0), (width-1,0), (width-1,height-1), (0,height-1)]`.
- Rectification solves source-to-destination homography and uses `warpPerspective`. Color/gray default to bilinear sampling.
- `scanDocument` detects first, rectifies the original RGBA source, and then produces the requested mode. Default mode is color and performs no hidden enhancement.
- Gray mode converts the rectified color image and, by default, contrast-stretches between the first and 99th percentiles. `enhanceContrast: false` disables this. Equal percentile values leave gray unchanged.
- Binary mode performs the same optional contrast stretch and then Sauvola thresholding using integral sum and squared-sum images. Defaults are radius 12 (25x25 window), `k: 0.2`, and dynamic range 128. Border windows shrink to available pixels; foreground document ink is `0` and page background is `255`.
- Percentiles are finite values in `[0,1]` with `low < high`. Sauvola radius is 1–256, `k` is finite in `[-1,1]`, and dynamic range is positive.
- The returned `homography` always maps source to the returned output dimensions. Gray/binary `RectifiedDocument` wrappers retain that mapping rather than recalculating it after conversion.

---

## 11. `@stopcock/vision/features`

### Public contract

```ts
import type { Point } from '@stopcock/geo'
import type { Correspondence, GrayImage, VisionLimits } from '@stopcock/vision'

export type Keypoint = Readonly<{
  point: Point
  score: number
  angle: number
  octave: number
  scale: number
}>

export type FastOptions = Readonly<{
  threshold?: number
  nonMaxSuppression?: boolean
  maxFeatures?: number
  border?: number
  limits?: Partial<VisionLimits>
}>

export type OrbOptions = Readonly<{
  maxFeatures?: number
  levels?: number
  scaleFactor?: number
  fastThreshold?: number
  patchSize?: 31
  limits?: Partial<VisionLimits>
}>

export type OrbFeatures = Readonly<{
  keypoints: readonly Keypoint[]
  descriptors: Uint32Array
  wordsPerDescriptor: 8
}>

export type FeatureMatch = Readonly<{
  queryIndex: number
  trainIndex: number
  distance: number
}>

export type MatchOptions = Readonly<{
  maxDistance?: number
  ratio?: number | false
  crossCheck?: boolean
  maxMatches?: number
  limits?: Partial<VisionLimits>
}>

export function fastCorners(image: GrayImage, options?: FastOptions): readonly Keypoint[]

export function describeOrb(
  image: GrayImage,
  keypoints: readonly Keypoint[],
  options?: Pick<OrbOptions, 'patchSize' | 'limits'>,
): OrbFeatures

export function orb(image: GrayImage, options?: OrbOptions): OrbFeatures

export function hammingDistance(
  a: OrbFeatures,
  aIndex: number,
  b: OrbFeatures,
  bIndex: number,
): number

export function matchDescriptors(
  query: OrbFeatures,
  train: OrbFeatures,
  options?: MatchOptions,
): readonly FeatureMatch[]

export function matchesToCorrespondences(
  query: OrbFeatures,
  train: OrbFeatures,
  matches: readonly FeatureMatch[],
): readonly Correspondence[]
```

### FAST and ORB algorithm

- FAST uses the standard 16-pixel radius-three circle and FAST-9 contiguous bright/dark test. The threshold is a byte delta, default 20.
- Corner score is the largest threshold for which the point remains a FAST corner. Non-maximum suppression compares the 3x3 neighbourhood; equal-score ties keep the lexicographically earlier `(y, x)` point.
- `fastCorners` defaults to 500 features, non-maximum suppression on, and a 16-pixel border. It ranks by score descending, then Y/X ascending, truncates, then returns row-major order for stable downstream indexing. Returned FAST angles are zero, octave zero, and scale one.
- `orb` builds a Gaussian pyramid with eight levels and scale factor 1.2 by default. Levels are 1–16 and factor is finite and greater than one when levels exceed one.
- Distribute `maxFeatures` geometrically across levels, run FAST with non-max suppression, calculate a 7x7 Harris response for ranking, and retain the globally strongest requested count with deterministic octave/Y/X ties.
- Compute orientation by intensity centroid over the 31x31 circular patch. Convert positions back to base-image coordinates but retain octave and scale.
- Use one checked-in, versioned set of 256 BRIEF comparison pairs within the 31x31 patch. Rotate pairs by the keypoint angle, bilinearly sample the level image, and pack bits little-endian into eight consecutive `Uint32` words.
- `describeOrb` preserves input order but drops points whose octave is unavailable or whose rotated patch cannot be sampled. Returned keypoints and descriptors remain one-to-one. It never writes a zero descriptor as a hidden invalid sentinel.
- Validate `descriptors.length === keypoints.length * 8` at every public matching boundary.

### Matching semantics

- Hamming distance is an integer from 0 through 256 using a branch-free 32-bit population count over XORed words.
- Defaults are `maxDistance: 64`, Lowe ratio `0.8`, cross-check enabled, and no match-count cap.
- For each query descriptor, select the lowest distance, then lowest train index. Apply `maxDistance`. Apply the ratio only when two train candidates exist; a single candidate is governed by max distance alone.
- With cross-check, keep only mutual nearest pairs using the same tie rules.
- Sort final matches by distance, then query index, then train index, and apply `maxMatches` last.
- Empty feature sets produce no matches. Invalid indices, descriptor lengths, thresholds, or limits throw before scanning.
- `matchesToCorrespondences` preserves match order and maps query points to source and train points to destination, ready for root `estimateHomography`.

---

## 12. `@stopcock/vision/motion`

### Public contract

```ts
import type { PointBuffer } from '@stopcock/geo'
import type { GrayImage, VisionLimits } from '@stopcock/vision'

export const FlowStatus: Readonly<{
  Tracked: 0
  OutsideImage: 1
  Singular: 2
  NotConverged: 3
  Inconsistent: 4
}>

export type FlowStatusCode = 0 | 1 | 2 | 3 | 4

export type OpticalFlow = Readonly<{
  from: PointBuffer
  to: PointBuffer
  status: Uint8Array
  error: Float32Array
  iterations: Uint8Array
  levels: number
}>

export type LucasKanadeOptions = Readonly<{
  levels?: number
  scaleFactor?: number
  windowRadius?: number
  maxIterations?: number
  epsilon?: number
  minEigenvalue?: number
  maxError?: number
  forwardBackwardThreshold?: number | false
  limits?: Partial<VisionLimits>
}>

export const trackPoints: {
  (
    previous: GrayImage,
    next: GrayImage,
    points: PointBuffer,
    options?: LucasKanadeOptions,
  ): OpticalFlow
  (
    next: GrayImage,
    points: PointBuffer,
    options?: LucasKanadeOptions,
  ): (previous: GrayImage) => OpticalFlow
}
```

Defaults are four levels, scale factor `0.5`, radius four (9x9 window), ten iterations per level, epsilon `0.01` pixels, minimum structure-tensor eigenvalue `1e-4` after normalization, no finite max-error rejection, and a forward/backward consistency threshold of 1.5 pixels.

### Algorithm and result semantics

- Require equal positive image dimensions and an even, finite point buffer. Limit count by `maxFeatures`.
- Build Gaussian pyramids until the requested level count or until either dimension cannot support the window plus a one-pixel derivative border.
- At each level, bilinearly sample the previous intensity and spatial derivatives over the window, build the two-by-two normal matrix, and iteratively solve displacement against temporal residual in the next image.
- Traverse from coarsest to finest, scaling coordinates/displacements exactly between levels. Stop a point when update norm is within epsilon or `maxIterations` is reached.
- Mark singular when the minimum eigenvalue is below threshold, outside when any required sample leaves the image, not-converged when the iteration cap or max error is hit, and tracked otherwise.
- When forward/backward checking is enabled, track successful endpoints in reverse and mark inconsistent when round-trip distance exceeds the threshold.
- `from` is a defensive copy. `to` retains the last finite estimate; for a point rejected before the first update it equals `from`. Failed points have `error = Infinity`. `iterations` is total successful iterations across levels, saturated at 255.
- Error is the RMS photometric residual over the final valid window. Processing order and ties are deterministic; no random feature replacement occurs.

---

## 13. `@stopcock/vision/browser`

### Frame conversion API

```ts
import type { Image } from '@stopcock/img'

export type FrameCaptureOptions = Readonly<{
  size?: Readonly<{ width: number; height: number }>
  maxDimension?: number
  colorSpace?: PredefinedColorSpace
  limits?: Partial<VisionLimits>
}>

export function fromImageBitmap(
  bitmap: ImageBitmap,
  options?: FrameCaptureOptions,
): Image

export function fromVideoFrame(
  frame: VideoFrame,
  options?: FrameCaptureOptions,
): Image

export function captureFrame(
  source: HTMLCanvasElement | OffscreenCanvas | HTMLVideoElement,
  options?: FrameCaptureOptions,
): Image
```

- The returned `Image` always owns a copied dense RGBA buffer. These functions never close the supplied `ImageBitmap` or `VideoFrame`, clear a canvas, pause a supplied video, or change a source's dimensions.
- Native dimensions come from bitmap width/height, `VideoFrame.displayWidth/displayHeight`, canvas width/height, or `videoWidth/videoHeight` respectively.
- `size` and `maxDimension` are mutually exclusive. Size uses positive integer dimensions. `maxDimension` scales down only, preserving aspect ratio and rounding each result to at least one.
- Use `OffscreenCanvas` when available, otherwise an unattached `HTMLCanvasElement`. If neither exists, throw `BrowserApiUnavailableError` at invocation, not import.
- Draw sources through a 2D context and copy `ImageData.data`. Browser colour conversion and the requested canvas `colorSpace` define the RGBA bytes; docs must not claim raw camera-plane access.
- A video with no decoded frame (`readyState < HAVE_CURRENT_DATA`, zero dimensions, or ended before a frame) throws `FrameUnavailableError`.

### Disposable camera source

```ts
export type CameraOpenOptions = Readonly<{
  signal?: AbortSignal
  frame?: FrameCaptureOptions
}>

export type CameraFramesOptions = Readonly<{
  signal?: AbortSignal
  maxFps?: number
  frame?: FrameCaptureOptions
}>

export interface CameraFrameSource extends AsyncDisposable {
  readonly stream: MediaStream
  readonly settings: Readonly<MediaTrackSettings>
  readonly closed: boolean
  capture(options?: FrameCaptureOptions): Image
  frames(options?: CameraFramesOptions): AsyncIterable<Image>
  close(): void
}

export function openCamera(
  constraints?: true | MediaTrackConstraints,
  options?: CameraOpenOptions,
): Promise<CameraFrameSource>
```

Implementation contract:

1. Check `navigator.mediaDevices.getUserMedia` only when called. Request `{ video: constraints ?? true, audio: false }`.
2. Do not catch or translate the native permission/device `DOMException`; callers must be able to inspect its native name. Errors after acquisition may wrap with `cause` only when cleanup has run.
3. Create an unattached muted, autoplay, plays-inline video, assign the acquired stream, await loaded metadata and `play()`, and capture immutable settings from the sole video track.
4. The source owns only the stream/tracks and internal video it created. `close()` is synchronous and idempotent: cancel pending frame callbacks, stop every owned track, pause the video, clear `srcObject`, remove listeners, and mark closed.
5. The source-level opening signal remains attached for the source lifetime. If it aborts during opening, clean up and reject with `signal.reason`; if it aborts later, close the source.
6. `capture` takes a fresh owned copy and throws `CameraClosedError` after close.
7. `frames()` is pull-based and retains no queued image. Use `requestVideoFrameCallback` where available and a request-animation-frame/time-based fallback otherwise. `maxFps` throttles delivery without duplicating frames.
8. Permit only one active iterator. A second throws `FrameIteratorActiveError`. Returning or aborting the iterator cancels its pending callback but does not close the camera; closing the source completes iteration.
9. Per-iterator abort rejects that iterator with its signal reason. `[Symbol.asyncDispose]` calls `close()` and resolves.

Browser tests must verify that every permission-success path either returns an owned source or stops every acquired track before rejecting.

---

## 14. `@stopcock/vision/compute`

### Adapter API

The adapter wraps a caller-owned `ComputeRuntime`. It caches only compiled programs and never installs a global backend, creates a runtime, or disposes the supplied runtime.

```ts
import type {
  ComputeRuntime,
  ExecutionReport,
} from '@stopcock/compute'

export type VisionStageReport = Readonly<{
  stage: string
  runner: 'compute' | 'cpu'
  reason?: string
  execution?: ExecutionReport
}>

export type VisionComputeResult<T> = Readonly<{
  value: T
  stages: readonly VisionStageReport[]
}>

export type VisionComputeOptions = Readonly<{
  mode?: 'auto' | 'runtime' | 'cpu'
  failurePolicy?: 'cpu' | 'error'
  maxTemporaryBytes?: number
}>

export interface VisionComputeAdapter {
  canny(
    image: GrayImage,
    options?: CannyOptions & { readonly signal?: AbortSignal },
  ): Promise<VisionComputeResult<Mask>>

  erode<T extends PixelPlane>(
    image: T,
    options: MorphologyOptions & { readonly signal?: AbortSignal },
  ): Promise<VisionComputeResult<T>>

  dilate<T extends PixelPlane>(
    image: T,
    options: MorphologyOptions & { readonly signal?: AbortSignal },
  ): Promise<VisionComputeResult<T>>

  open<T extends PixelPlane>(
    image: T,
    options: MorphologyOptions & { readonly signal?: AbortSignal },
  ): Promise<VisionComputeResult<T>>

  close<T extends PixelPlane>(
    image: T,
    options: MorphologyOptions & { readonly signal?: AbortSignal },
  ): Promise<VisionComputeResult<T>>

  warpPerspective(
    image: Image,
    homography: Homography,
    options: WarpOptions<Image> & { readonly signal?: AbortSignal },
  ): Promise<VisionComputeResult<Image>>

  warpPerspective(
    image: GrayImage,
    homography: Homography,
    options: WarpOptions<GrayImage> & { readonly signal?: AbortSignal },
  ): Promise<VisionComputeResult<GrayImage>>

  warpPerspective(
    image: Mask,
    homography: Homography,
    options: WarpOptions<Mask> & { readonly signal?: AbortSignal },
  ): Promise<VisionComputeResult<Mask>>

  matchDescriptors(
    query: OrbFeatures,
    train: OrbFeatures,
    options?: MatchOptions & { readonly signal?: AbortSignal },
  ): Promise<VisionComputeResult<readonly FeatureMatch[]>>

  dispose(): Promise<void>
}

export function createVisionCompute(
  runtime: ComputeRuntime,
  options?: VisionComputeOptions,
): VisionComputeAdapter
```

Move `OrbFeatures`, `FeatureMatch`, and `MatchOptions` to a package-private shared type module that `/features` and `/compute` re-export identically; `/compute` must not import the `/features` bundle solely for types.

### Honest lowering rules

The Compute plan's public IR is the sole lowering surface. Data-dependent contour following, hysteresis traversal, RANSAC model selection, FAST branching, ORB orientation, and Lucas-Kanade iteration stay on Vision's CPU algorithms. No adapter method may label such work as Compute execution.

- **Canny:** convert bytes to a `f64` tensor, lower separable Gaussian and Sobel convolutions, then perform direction quantization, suppression, threshold selection, and hysteresis on CPU. `f64` intentionally prevents optional WebGPU reassociation from changing threshold topology; Compute may select CPU or WASM. Every pass appears as a stage report.
- **Mask morphology:** for radii no greater than 15, lower rectangular dilation to an all-ones `u32` convolution followed by `sum > 0`, and erosion to `sum === kernelArea`. Repeat constituent passes exactly. Larger radii use the CPU van-Herk path because materializing a large Compute convolution is algorithmically worse.
- **Grayscale morphology:** remain on CPU in 1.0 because the locked Compute stencil is weighted-sum-only and cannot represent neighbourhood min/max. Record that reason.
- **Perspective warp:** CPU computes inverse coordinates and gathers four source samples into bounded tiles; a `f64` Compute program performs bilinear weighting, rounding, and clamping. Nearest-neighbour and mask warp remain CPU. Use this only when the crossover profile proves the gather-plus-runtime path wins and temporary tiling remains below the limit.
- **Descriptor matching:** expand query/train descriptor pairs in bounded tiles, lower XOR plus a closed SWAR `u32` popcount expression and word reduction, then apply nearest/ratio/cross-check selection on CPU. Never materialize the full Cartesian product when it exceeds the configured tile budget.
- **Unsupported shape/operation:** run the normative root implementation and report a CPU stage with a reason. Do not dynamically extend the Compute AST.

### Mode, fallback, parity, and disposal

- `auto` consults checked-in Vision crossover thresholds and uses Compute only for a representable stage above its measured threshold.
- `runtime` submits every representable stage regardless of size, while the supplied runtime still selects/falls back among its own backends. `cpu` executes the normative root pipeline and is used for parity tests.
- Default `failurePolicy` is `cpu`. After successful input validation, a non-abort Compute backend failure reruns the complete public operation through the root CPU implementation and appends a CPU stage containing the stable Compute error code. `error` instead rejects with `VisionComputeStageError` and preserves the cause.
- Runtime fallback is never hidden: preserve each `ExecutionReport`, including selected backend and `fallbackReason`. A Vision-level CPU decision is represented separately.
- Aborts never trigger CPU retry. Reject with `signal.reason` and release all temporary tensors in `finally` blocks.
- Public byte and integer results must be bit-identical to the synchronous root result. Homography/warp intermediates may differ only before final byte rounding; final Image/Gray/Mask bytes remain identical. If an accelerated backend cannot meet that contract, mark the stage unsupported and use CPU.
- `maxTemporaryBytes` defaults to the lower of the operation's Vision limit and 256 MiB. Tile sizing is deterministic.
- `dispose()` is asynchronous and idempotent, disposes compiled kernels owned by the adapter, clears program caches, and rejects later calls with `VisionComputeDisposedError`. It does not call `runtime.dispose()`.

---

## 15. Internal implementation order

### Task 1 — Scaffold the private package and export graph

- [ ] Add `packages/vision` at `0.0.0`, `private: true`, ESM, `sideEffects: false`, dependencies/optional peer metadata, five tsup entries, declaration emission, README skeleton, and Vitest configuration.
- [ ] Add source aliases to docs and benchmarks without modifying the Synth exclusion.
- [ ] Add source and built import-smoke tests for every subpath.
- [ ] Prove a root import works in an ES2022 TypeScript project without DOM libs and does not resolve Compute.

### Task 2 — Lock planes, coordinates, validation, errors, and limits

- [ ] Implement public types, copy/borrow constructors, Img conversion, plane visualization, thresholding, quad ordering, validators, checked allocation math, and stable errors.
- [ ] Add malformed object, wrong typed-array, length mismatch, overflow, non-finite option, coordinate, and limit tests before algorithm work.
- [ ] Add declaration tests for discriminated planes, branded homographies, quad ordering, conditional warp options, and dual forms.

### Task 3 — Implement Canny reference pipeline

- [ ] Implement Gaussian kernel generation, reflected/clamped separable convolution, Sobel gradients, deterministic non-max suppression, threshold resolution, and iterative hysteresis.
- [ ] Keep intermediate doubles internal and expose only the canonical mask.
- [ ] Add small hand-computed fixtures and a deliberately slow test oracle before optimization.

### Task 4 — Implement morphology and contours

- [ ] Implement reference rectangular extrema, van-Herk horizontal/vertical passes, border modes, iterations, and gray/mask preservation.
- [ ] Implement private-frame Suzuki-Abe following, hierarchy creation, chain simplification, filtering/reparenting, ordering, and work-limit checks.
- [ ] Cross-check morphology with the reference and contour raster topology with generated masks.

### Task 5 — Implement projective geometry and warp

- [ ] Implement homography branding/normalization, normalized DLT using LA SVD, compose/invert/transform, deterministic PRNG, symmetric-error RANSAC, and final inlier refits.
- [ ] Implement nearest and bilinear inverse warp for RGBA, gray, and mask with checked output planning.
- [ ] Add projective property tests before using these APIs in document scanning or feature demos.

### Task 6 — Build the document workflow

- [ ] Implement bounded analysis downscaling, contour/hull candidate extraction, epsilon sweep, rejection, exact scoring, polygon-IoU deduplication, ambiguity handling, and full-resolution remapping.
- [ ] Implement inferred/explicit rectification sizing and source-to-destination metadata.
- [ ] Implement percentile contrast stretch, integral-image Sauvola thresholding, typed scan overloads, and `null` detection behavior.
- [ ] Check in synthetic perspective-page fixtures and a small licensed real-world corpus with attribution.

### Task 7 — Build FAST, ORB, and matching

- [ ] Implement FAST-9 tests/scores/NMS, Harris response, pyramid allocation, deterministic feature quotas, intensity-centroid orientation, fixed pattern generation artifact, descriptor packing, and validation.
- [ ] Implement popcount, nearest/second-nearest search, ratio, cross-check, stable sorting/truncation, and match-to-correspondence conversion.
- [ ] Check the BRIEF pattern artifact into source and add a generation/hash verification script so accidental pattern changes fail CI.

### Task 8 — Build pyramidal Lucas-Kanade

- [ ] Reuse internal Gaussian/bilinear primitives to build bounded pyramids and derivatives.
- [ ] Implement coarse-to-fine solves, status/error/iteration output, forward-backward checking, and all limit paths.
- [ ] Add synthetic sub-pixel translation, rotation, occlusion, flat-patch, and boundary fixtures.

### Task 9 — Build browser capture and camera lifecycle

- [ ] Implement lazy canvas selection, source dimension/ready-state checks, scaling, color-space selection, and copied RGBA output.
- [ ] Implement `openCamera`, hidden video readiness, owned track lifecycle, direct capture, pull iterator, frame throttling, single-iterator guard, both abort scopes, and async disposal.
- [ ] Test with fake media objects in unit tests and real browser APIs/mocks through Puppeteer.

### Task 10 — Build real Compute lowering

- [ ] Add the optional-peer `/compute` entry, shared feature declarations, adapter lifecycle, program cache, deterministic tiling, stage-report format, mode/failure policy, and abort cleanup.
- [ ] Lower Canny convolution, small mask morphology, tiled bilinear blending, and tiled Hamming popcount through public Compute builders only.
- [ ] Add explicit CPU-stage reasons for unrepresentable work; never report a wrapper-only CPU call as accelerated.
- [ ] Establish byte-exact root/adapter parity before enabling any `auto` threshold.

### Task 11 — Benchmarks, docs, and Document Lab

- [ ] Add source and packed-dist benchmarks with correctness setup, crossover generation, JSON baselines, and benchmark-only competitors.
- [ ] Add package README, full library documentation, algorithm/coordinate/error/support tables, recipes, root catalogue/grid/sidebar entries, dependency diagram, and generated LLM-doc inclusion.
- [ ] Build the Document Lab entirely from published APIs, including explicit camera start/stop and visible CPU/Compute stage reports.

### Task 12 — Isolation, audit, and 1.0 release

- [ ] Build every entry, inspect declarations and bundle metafiles, and prove root/features/motion contain no DOM or Compute import while root/browser contain no Node built-ins.
- [ ] Pack and install in clean Node and Bun consumers; import and exercise each platform-valid subpath. Record non-blocking Deno root/features/motion smoke results.
- [ ] Run docs/browser tests from the packed artifact, not only workspace aliases.
- [ ] After every acceptance item is green, remove `private`, add the major Changeset, inspect the publish set, and publish Vision alone as `1.0.0` with Synth still excluded.

---

## 16. Runtime and property test matrix

### Planes and validation

- Gray/mask copy and borrowed construction, zero/non-zero mask normalization, RGBA alpha modes, plane visualization colors, threshold endpoints, and input non-mutation.
- Wrong buffer type, unsafe dimensions, mismatched lengths, invalid bytes/options, multiplication overflow, allocation ceiling, and forged branded values.
- All public outputs use the expected typed-array class, exact dimensions, canonical mask values, and distinct buffers.

### Canny

- Constant, single step, diagonal, impulse, checkerboard, low-contrast, high-contrast, and border-touching images.
- Absolute versus relative thresholds, low equals high, reflected versus clamped borders, zero gradient, and every radius.
- Property tests for intensity-offset behavior before clipping, horizontal/vertical transpose symmetry, deterministic ties, edge-mask canonicalization, and oracle equivalence on small images.
- Explicit test that hysteresis retains connected weak edges and discards isolated weak pixels.

### Morphology

- Gray and mask inputs, anisotropic/zero/maximum practical radii, repeated iterations, clamp/constant borders, and all four operations.
- Compare van-Herk output to nested-loop reference for generated small images and radii.
- Algebraic properties where border policy permits: erosion anti-extensivity, dilation extensivity, monotonicity, opening/closing idempotence, and erosion/dilation complement duality.
- Prove runtime operation count remains linear in pixels rather than radius area with instrumentation tests.

### Contours

- Empty/full masks, one pixel, lines, diagonal contacts, nested donuts, islands in holes, touching boundaries, thin structures, and multiple siblings.
- Full/simple chain consistency, winding, no duplicate terminal point, hierarchy reciprocity, dense ID reassignment, min-area reparenting, and stable scan order.
- Rasterize generated contour hierarchy and compare inside/outside topology to source masks where the centre-contour representation is lossless.
- Exact tests for contour/point limits and no partial result leakage.

### Homography and warp

- Identity, translation, scale, rotation, affine shear, strong perspective, inverse, composition, and source/destination reversal.
- DLT recovery from exact and noisy points; collinear, duplicate, singular, insufficient, point-at-infinity, and very large coordinate cases.
- Seeded RANSAC with controlled outliers, identical repeated runs, adaptive iteration cap, tie-breaking, no-model null, and inlier sorting.
- Warp identity byte equality, known nearest/bilinear samples, each border/fill policy, transparent RGBA, mask interpolation rejection, singular pre-allocation failure, and output pixel limits.
- Property tests that transformed source points land at destinations and inverse round trips remain within scale-aware tolerance.

### Document workflows

- Generated pages under rotation, perspective, scale, shadow, blur, textured backgrounds, partial occlusion, and each source aspect ratio.
- Blank, low-edge, multiple equal documents, non-quadrilateral, border-only, too-small, and below-confidence cases return `null`.
- Candidate deduplication, ambiguity gap, exact score components, full-resolution coordinate remapping, explicit/inferred/max sizing, and homography metadata.
- Color/gray/binary modes, contrast constant-image behavior, percentile bounds, Sauvola border windows, ink polarity, and typed overload results.
- Checked-in licensed real fixtures include receipts, white paper, coloured paper, low light, perspective, clutter, and no-document negatives. Expected quads use intersection-over-union/corner-error tolerances rather than fragile byte snapshots.

### Features and matching

- FAST circle decisions, score/NMS ties, borders, feature caps, row-major output, and uniform images.
- Pyramid quotas, scale conversion, Harris ranking, orientation on synthetic gradients, fixed BRIEF hash, descriptor length/order, and invalid patch filtering.
- ORB repeatability under small rotation, scale, brightness, and translation using minimum match/inlier thresholds.
- Popcount against a bit-by-bit oracle, identical descriptors, maximal distance, nearest ties, ratio/no-ratio/single-candidate behavior, cross-check, sort/truncate, and empty sets.
- Feature matches fed through root RANSAC recover known image homographies.

### Sparse optical flow

- Zero motion, integer/sub-pixel translation, small rotation, multi-level large displacement, brightness shift, occlusion, flat patches, edges, corners, and boundary exits.
- Status code, last-estimate, infinity-error, iteration saturation, min-eigenvalue, max-error, and forward/backward rejection contracts.
- Generated translations compare against known displacement and a brute-force small-window oracle within documented sub-pixel tolerance.
- Repeated calls are byte/double deterministic and leave both source images and point buffers unchanged.

### Compute adapter

- Each representable stage proves a real `ComputeRuntime.run` occurred and carries its `ExecutionReport`; CPU-only paths carry a reason and no fabricated report.
- `auto`, forced runtime, and CPU modes; below/above crossover; unsupported dtype/radius/interpolation; explicit runtime fallback; Vision CPU failure policy; error policy; already/during abort; and adapter/runtime disposal independence.
- Random root versus adapter equality for Canny masks, mask morphology, warp bytes, Hamming distances, selected matches, and stable ordering on CPU and WASM.
- Conditional WebGPU parity for exact `u32` morphology/popcount programs. Do not enable a WebGPU stage that changes public byte output.
- Temporary tile ceiling, no full descriptor Cartesian allocation, repeated-run cache reuse, concurrent calls, failure cleanup, and no retained caller buffers.

### Browser lifecycle

- Bitmap/frame/canvas/video dimensions, scaling, copied output, unavailable canvases, color-space option, and invalid/undecoded video.
- Permission denial passes through the original DOMException.
- Success, metadata failure, play failure, abort during acquisition/readiness, close, repeated close, async disposal, and page-unload cleanup all stop every owned track exactly once.
- Direct capture, request-video-frame callback and fallback iterator, maximum FPS, one active iterator, iterator return, iterator abort, source abort, source close, and capture after close.
- Real-browser packed-package smoke uses a generated canvas/video source; camera hardware itself is represented by deterministic fake tracks so CI never prompts.

---

## 17. Type and package tests

- `*.test-d.ts` pins `GrayImage`/`Mask` discrimination, readonly results, dual-form inference, `Quad` tuple order, Homography branding, contour hierarchy narrowing, scan-mode overloads, and warp interpolation restrictions.
- Feature declarations pin descriptor word count, match/correspondence inference, and absence of root-only accidental exports.
- Motion declarations pin status typed arrays and data-last ordering.
- Browser declarations compile with DOM/WebCodecs libs and do not leak through root declarations. A root-only fixture compiles with `lib: ["ES2022"]` and no DOM.
- Compute declarations resolve only when the optional peer is installed; root/features/motion/browser clean consumers do not require it.
- Inspect all emitted `.d.ts` files for `src/`, package-private shared modules, test helpers, and undeclared dependencies.
- Bundle/metafile tests prove:
  - root imports no browser or Compute module;
  - `/features` and `/motion` import no browser or Compute module;
  - `/browser` imports no Node built-in;
  - `/compute` imports Compute but no browser module; and
  - no entry imports Synth.
- Pack the tarball and test every valid entry under pinned Node and Bun. Browser and Compute smoke tests install optional peers explicitly. Deno root/features/motion import evidence is recorded but non-blocking.

---

## 18. Benchmarks and performance gates

Add correctness-validated source and dist suites under `benchmarks` for:

- RGBA-to-gray and threshold at 1080p, 4K, and 12 MP;
- Canny by image size, sigma, edge density, and CPU versus eligible Compute stages;
- gray/mask morphology by image size and radius, including proof that van-Herk remains radius-independent;
- contour extraction on sparse, dense, nested, and noisy masks;
- DLT/RANSAC by correspondence count and outlier ratio;
- gray/RGBA nearest and bilinear warp at common document sizes;
- FAST/ORB by pyramid level and feature cap;
- Hamming matching at 500x500, 2,000x2,000, and tiled large sets;
- Lucas-Kanade by point count, window, and pyramid depth;
- browser capture at 720p/1080p where the benchmark browser permits it; and
- Compute conversion, temporary-allocation, execution, and fallback cost separately, not just aggregate wall time.

Pinned OpenCV.js or another maintained classical-CV library may appear only in benchmark/test workspaces. Normalize input, borders, thresholds, and output comparison before timing; competitor speed is informational.

Hard structural gates:

- Van-Herk morphology performs a constant number of passes per pixel per iteration regardless of radius.
- Canny uses no RGBA intermediate and no recursion; contour following uses no source-mask copy larger than its one-byte labelled workspace plus bounded output.
- Descriptor matching tiles under the configured temporary ceiling and never allocates `queryCount * trainCount` distances.
- Browser frame iteration queues at most one pending frame and retains no old image after delivery.
- Every Compute `auto` threshold is disabled until the backend wins end-to-end, including conversion/gather/transfer costs, by at least 15% for three consecutive tested sizes on pinned Node and Bun. Browser/WebGPU thresholds additionally require three stable runs on the documented test environment.
- Accepted source and dist benchmark results become internal JSON regression baselines. A regression greater than 10% on three repeated runs requires investigation or an explicit reviewed baseline update; absolute third-party comparisons do not block release.

---

## 19. Document Lab and documentation

Create `apps/docs/src/content/docs/libraries/vision.mdx` and a `/showcases/vision/` Document Lab. The showcase must import the package APIs rather than copying algorithms into the Astro component.

Document Lab panels:

1. **Input:** drag/drop or file upload plus an explicit Start Camera button. Show native permission errors and a persistent Stop Camera control while tracks are live.
2. **Edges:** original, gray, Canny, and closed mask with sigma/threshold/radius controls.
3. **Detection:** contour and candidate overlays, chosen quad, confidence components, ambiguity/no-result explanation, and diagnostics counters.
4. **Scan:** color, enhanced-gray, and binary outputs with output sizing, contrast, and Sauvola controls.
5. **Features:** two images with keypoints, matches, RANSAC inliers, and recovered homography.
6. **Motion:** successive frames with selected points, flow vectors, status colours, and forward/backward rejection.
7. **Execution:** synchronous CPU versus available Compute adapter, per-stage runner/backend/fallback, time, and temporary-byte diagnostics.

The page must stop camera tracks on explicit stop, component disposal, navigation, and error. It must not request permission on page load. Canvas/SVG visuals need text alternatives, controls need labels and keyboard operation, and rapidly changing diagnostics use a non-disruptive live region.

Documentation must state:

- pixel-centre coordinates, Y direction, angle direction, contour winding, quad order, and homography direction;
- byte/mask/alpha semantics and every default border/interpolation/threshold policy;
- deterministic seeds, tie-breaks, `null` versus exception behavior, and resource defaults;
- which stages can actually use Compute and why others remain CPU;
- camera and caller-owned browser resource ownership;
- supported runtimes/subpaths and optional peer requirements; and
- the explicit no-ML/OCR/barcode scope boundary.

Recipes must cover document scanning, custom rectification, ORB-to-RANSAC image alignment, sparse motion tracking, camera cleanup with `await using`, and inspected Compute fallback.

---

## 20. Final 1.0 acceptance checklist

- [ ] Root CPU output is documented as normative and passes all runtime, property, fixture, limit, and non-mutation tests.
- [ ] Canny, morphology, contours, homography/RANSAC/warp, document workflows, FAST/ORB/matching, and Lucas-Kanade satisfy every representation, coordinate, tie, and failure contract above.
- [ ] Blank or ambiguous document inputs return `null`; no boundary rectangle or other fabricated detection is emitted.
- [ ] Browser conversion works in a real browser, and every camera success/failure/abort/disposal path proves owned tracks and listeners are cleaned up.
- [ ] `/compute` executes real public Compute programs for eligible stages, reports every CPU/backend fallback, preserves public output parity, releases temporaries, and never owns the supplied runtime.
- [ ] Root/features/motion remain platform-neutral; optional browser/Compute code is isolated behind its subpath and absent from unrelated bundles/declarations.
- [ ] Resource ceilings fail before oversized allocation and no synchronous API returns partial output after an error.
- [ ] Source/dist benchmarks are correctness-validated, crossover profiles are checked in, and internal regression baselines pass.
- [ ] Package README, full docs, recipes, support table, catalogue/grid/sidebar, dependency diagram, Document Lab, and generated LLM docs are complete.
- [ ] `bun run lint:ci`, `bun run build:packages`, `bun run lint:types`, and `bun run test:packages` pass with Synth still excluded.
- [ ] Every exported entry resolves from the packed tarball in its supported environment; no source path, undeclared package, benchmark dependency, browser global, or private module leaks into `dist`.
- [ ] The package stays private at `0.0.0` until every mandatory item is green, then publishes independently as exactly `@stopcock/vision@1.0.0` through a major Changeset.

---

## References

- [Stopcock eight-package roadmap](./2026-07-21-stopcock-eight-package-roadmap.md)
- [`@stopcock/compute` 1.0 implementation plan](./2026-07-21-stopcock-compute-1.0-implementation.md)
- [`@stopcock/geo` 1.0 implementation plan](./2026-07-21-stopcock-geo-1.0-implementation.md)
- [Current `@stopcock/img` API](../../../packages/img/README.md)

