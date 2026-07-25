# `@stopcock/geo` 1.0 Implementation Plan

**Status:** Decision-complete implementation handoff for release wave 2 of the [eight-package roadmap](./2026-07-21-stopcock-eight-package-roadmap.md).

**Outcome:** Ship a public `@stopcock/geo@1.0.0` containing a robust packed planar-geometry core, Delaunay/Voronoi construction, an immutable packed spatial index, polygon overlay, offsets and stroke expansion, WGS84 geodesy, RFC 7946 adapters, and an additive `@stopcock/svg/geo` integration.

**Implementation posture:** The TypeScript implementation is the normative runtime. It has no third-party runtime dependencies, does not mutate caller-owned geometry, and remains usable in Node, Bun, Deno, browsers, and workers without browser globals in any Geo entrypoint.

---

## 1. Locked scope

### Included in 1.0

- Packed planar points, paths, rings, polygons, bounds, segments, and cubic Bézier curves.
- Adaptive exact `orient2d` and `incircle` predicates.
- Segment intersections, closest points, metrics, containment, convex hulls, simplification, Bézier fitting, and curve flattening.
- Deterministic incremental half-edge Delaunay triangulation and bounded Voronoi cells.
- Immutable Hilbert-sorted packed R-tree with box search, early-exit visitation, and stable nearest-neighbour results.
- Robust union, intersection, difference, xor, self-intersection regularisation, and rectangular clipping.
- Open-line offsets, polygon expansion/erosion, path buffers, and stroke expansion with miter/bevel/round joins and butt/square/round caps.
- WGS84 direct and inverse geodesics, bearings, destinations, interpolation, rhumb-line operations, Web Mercator, and local east/north/up tangent frames.
- Strict RFC 7946 validation and packed adapters for every geometry, Feature, FeatureCollection, null geometry, optional altitude, bounding boxes, and foreign members.
- Explicit antimeridian detection and splitting. No adapter silently rewrites a crossing geometry.
- Additive `@stopcock/svg/geo` path conversion, exact curve/arc geometry bounds, and transform-aware hit testing.

### Excluded from 1.0

- Arbitrary coordinate reference systems, EPSG lookup, PROJ strings, datum grids, and network-backed GIS data.
- Spherical polygon overlay, ellipsoidal polygon area, routing, map matching, geocoding, tiles, vector-tile encoding, and topology-preserving simplification across a shared coverage.
- 3D meshes, Z-aware planar predicates, M ordinates, collision dynamics, triangulation constraints, conforming meshes, and dynamic R-tree insertion/removal.
- Straight skeletons, medial axes, Minkowski sums other than the specified buffer/offset surface, dashed-stroke expansion, and variable-width strokes.
- Implicit global snapping or tolerance. Exact predicates are the default; approximation occurs only through an explicit metric or snap option.

---

## 2. Current repository seams to preserve

- `@stopcock/la` uses `Float64Array` vectors and row-major matrices, but Geo's planar core does not require it. `@stopcock/geo` depends only on `@stopcock/fp` for the established lightweight dual-form helper.
- `@stopcock/svg` already uses `Pt = readonly [number, number]`, affine six-tuples, typed path commands, immutable operators, and the `/la` subpath.
- `@stopcock/svg/la` currently exports `fitBezier` and `hitTest`. Their import paths must remain valid; after Geo lands they delegate to the new Geo-backed implementation.
- The repository builds ESM with `tsup`, emits declarations separately with `tsc --emitDeclarationOnly`, sets `sideEffects: false`, and discovers runtime/type tests below `packages/*/src/**/__tests__`.
- Every new package starts as `private: true`, version `0.0.0`. It becomes public only after all gates in this document pass, then receives a major Changeset for `1.0.0`.
- Do not include or modify `@stopcock/synth` in Geo build, test, docs, or release work.

---

## 3. Package architecture and exports

Create these public entrypoints:

```text
@stopcock/geo
@stopcock/geo/delaunay
@stopcock/geo/spatial
@stopcock/geo/topology
@stopcock/geo/offset
@stopcock/geo/geodesy
@stopcock/svg/geo
```

The Geo package layout is:

```text
packages/geo/
  package.json
  tsconfig.json
  tsup.config.ts
  README.md
  src/
    index.ts
    types.ts
    validate.ts
    points.ts
    bounds.ts
    predicates.ts
    segment.ts
    polygon.ts
    hull.ts
    simplify.ts
    bezier.ts
    internal/
      expansion.ts
      exact-rational.ts
      heap.ts
      sort.ts
    delaunay/index.ts
    spatial/index.ts
    topology/index.ts
    offset/index.ts
    geodesy/index.ts
    geodesy/geojson.ts
    __tests__/
```

`packages/geo/tsup.config.ts` has one entry for each public subpath. `package.json` maps each entry to its matching JavaScript and declaration file, includes only `dist`, declares the existing repository metadata/license, and remains `private: true` until release acceptance.

`packages/svg/tsup.config.ts` gains `src/geo/index.ts`; `packages/svg/package.json` gains the `./geo` export and a direct Geo dependency. The root SVG entry must not import Geo, so ordinary `@stopcock/svg` consumers retain their current cold-import path.

---

## 4. Canonical planar representation

### Public types

```ts
export type Point = readonly [x: number, y: number]
export type PointBuffer = Float64Array // x0,y0,x1,y1,...
export type Path = PointBuffer         // open unless an API says otherwise
export type MultiPath = ReadonlyArray<Path>
export type Ring = PointBuffer         // logically closed; do not repeat the first point

export type Bounds = Readonly<{
  minX: number
  minY: number
  maxX: number
  maxY: number
}>

export type Segment = readonly [from: Point, to: Point]
export type CubicBezier = readonly [start: Point, control1: Point, control2: Point, end: Point]

export type Polygon = Readonly<{
  outer: Ring
  holes: ReadonlyArray<Ring>
}>

export type MultiPolygon = ReadonlyArray<Polygon>
export type FillRule = 'nonzero' | 'evenodd'
export type PointLocation = 'inside' | 'outside' | 'boundary'

export type SegmentIntersection =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'point'
      readonly point: Point
      readonly aT: number
      readonly bT: number
      readonly endpointTouch: boolean
    }
  | {
      readonly kind: 'overlap'
      readonly from: Point
      readonly to: Point
      readonly aRange: readonly [number, number]
      readonly bRange: readonly [number, number]
    }
```

### Representation invariants

- Point buffers are interleaved XY `Float64Array`s with even length. All public boundaries reject non-finite coordinates.
- A path may have zero or more points. Algorithms that need a segment require at least two points and throw `RangeError` otherwise.
- A ring omits the duplicated closing point. A non-empty ring used as polygonal area requires at least three distinct vertices after consecutive duplicates are removed.
- Inputs may use either winding. Every polygonal output is canonical: outer rings are counter-clockwise and holes clockwise in Cartesian coordinates.
- Canonical rings contain no repeated terminal point, consecutive duplicate, zero-length edge, or redundant collinear middle vertex.
- Canonical rings rotate their sequence so the lexicographically smallest `(x, y)` vertex is first. Polygon results sort by descending absolute outer area, then lexicographic first vertex. This makes serialization and seeded tests stable.
- Algorithms allocate new outputs. An output may reuse immutable scalar/tuple values but never returns a caller buffer that it later mutates.
- `-0` is normalised to `0` at public output and serialization boundaries.

### Explicit snapping

All operations default to exact, unsnapped input. APIs that accept `snapTolerance` use one shared policy:

```ts
export type SnapOptions = Readonly<{ snapTolerance?: number }>
```

- Missing or zero means no snapping.
- A positive value quantises a copied coordinate to `Math.round(value / snapTolerance) * snapTolerance` before arrangement construction.
- The grid origin is `(0, 0)` and is not configurable in 1.0.
- Snapping never mutates the source and is applied consistently to both operands.
- Negative, non-finite, or overflow-producing tolerances throw `RangeError`.

---

## 5. Root API

### Construction and packed access

```ts
packPoints(points: Iterable<Point>): PointBuffer
unpackPoints(points: PointBuffer): Point[]
pointAt(points: PointBuffer, index: number): Point
gatherPoints(points: PointBuffer, indices: Uint32Array): PointBuffer
makePolygon(outer: Ring, holes?: ReadonlyArray<Ring>): Polygon
```

`makePolygon` validates and canonicalises winding/rotation but does not resolve self-intersections or overlapping holes. Use `regularize` from `/topology` for that.

### Bounds and primitives

```ts
boundsOf(points: PointBuffer): Bounds | null
unionBounds(a: Bounds, b: Bounds): Bounds
intersectBounds(a: Bounds, b: Bounds): Bounds | null
boundsContainPoint(bounds: Bounds, point: Point): boolean
boundsIntersect(a: Bounds, b: Bounds): boolean

orient2d(a: Point, b: Point, c: Point): -1 | 0 | 1
incircle(a: Point, b: Point, c: Point, d: Point): -1 | 0 | 1

segmentIntersection(
  a: Segment,
  b: Segment,
  options?: SnapOptions,
): SegmentIntersection

closestPointOnSegment(
  point: Point,
  segment: Segment,
): { readonly point: Point; readonly t: number; readonly distanceSquared: number }
```

`incircle` interprets a positive result as `d` inside the circumcircle of counter-clockwise `a,b,c`; reverse winding reverses the sign. Degenerate `a,b,c` returns zero.

### Metrics and containment

```ts
signedArea(ring: Ring): number
area(subject: Polygon | MultiPolygon): number
perimeter(subject: Ring | Polygon | MultiPolygon): number
centroid(subject: Ring | Polygon | MultiPolygon): Point | null

classifyPoint(
  subject: Polygon | MultiPolygon,
  point: Point,
  options?: { fillRule?: FillRule },
): PointLocation

contains(
  subject: Polygon | MultiPolygon,
  point: Point,
  options?: { fillRule?: FillRule; includeBoundary?: boolean },
): boolean

contains(
  point: Point,
  options?: { fillRule?: FillRule; includeBoundary?: boolean },
): (subject: Polygon | MultiPolygon) => boolean
```

Defaults are `fillRule: 'nonzero'` and `includeBoundary: true`. A zero-area subject has `area = 0`, `centroid = null`, and no interior, although a point can still classify as `boundary`.

### Hull, simplification, and curves

```ts
convexHull(points: PointBuffer): Uint32Array

simplify(
  points: PointBuffer,
  tolerance: number,
  options?: { closed?: boolean },
): PointBuffer

simplify(
  tolerance: number,
  options?: { closed?: boolean },
): (points: PointBuffer) => PointBuffer

fitBezier(
  points: PointBuffer,
  options?: { maxError?: number; maxSegments?: number },
): ReadonlyArray<CubicBezier>

flattenBezier(
  curves: ReadonlyArray<CubicBezier>,
  tolerance?: number,
): PointBuffer
```

- `convexHull` returns indices into the original buffer. Exact duplicates retain the lowest input index. The hull is counter-clockwise and starts at its lexicographically smallest point. Collinear input returns the two extreme indices; a singleton returns its sole index.
- `simplify` uses absolute coordinate units, preserves open endpoints, and treats a closed path cyclically without repeating its first output point. Zero tolerance removes only exact duplicates/redundant collinear vertices.
- `fitBezier` requires at least two distinct points. Defaults are `maxError: 1` coordinate unit and `maxSegments: 1024`; exceeding the segment bound throws `RangeError` instead of silently loosening error.
- `flattenBezier` defaults to `tolerance: 0.25`; recursive subdivision stops only when the convex-hull distance to the chord is within tolerance.

All stateless operations with parameters use the repository's data-first/data-last convention through `@stopcock/fp/dual` where the call shape is unambiguous. Constructors, predicates with multiple geometry operands, and buffer accessors remain positional.

---

## 6. Delaunay and Voronoi (`@stopcock/geo/delaunay`)

### Public API

```ts
export type Triangulation = Readonly<{
  points: PointBuffer
  triangles: Uint32Array // triples indexing the original point sequence
  halfedges: Int32Array  // opposite directed edge, -1 on hull
  hull: Uint32Array
  ignored: Uint32Array   // later exact duplicates
}>

export type VoronoiDiagram = Readonly<{
  bounds: Bounds
  cells: ReadonlyArray<PointBuffer | null> // one clipped cell per original point
}>

delaunay(points: PointBuffer): Triangulation
voronoi(mesh: Triangulation, bounds: Bounds): VoronoiDiagram
voronoi(bounds: Bounds): (mesh: Triangulation) => VoronoiDiagram
```

### Algorithm and semantics

- Copy the source points into the result so later caller mutation cannot invalidate the mesh.
- Sort sites deterministically by distance from the seed circumcentre, then x, y, and original index. Use adaptive exact predicates for every orientation/incircle decision.
- Build a Delaunator-style incremental hull and half-edge structure in preallocated typed arrays, growing geometrically when the final triangle count is not yet known.
- Triangles are counter-clockwise. `halfedges.length === triangles.length`; if `halfedges[e] = f`, then `halfedges[f] = e`.
- Exact duplicate coordinates keep the first original index and place later indices in `ignored`. Their Voronoi cells are `null`.
- Fewer than three unique sites or fully collinear sites produce no triangles and a deterministic hull.
- Cocircular ties resolve by original input index, producing one stable legal triangulation.
- Voronoi derives finite cells from ordered incident circumcentres and clips each cell to the required bounds. Hull sites extend to the clipping box before clipping. Empty/duplicate cells are `null`; non-null cells are canonical rings.

---

## 7. Packed spatial index (`@stopcock/geo/spatial`)

### Public API

```ts
export type SpatialIndex<T> = Readonly<{
  readonly size: number
  readonly nodeSize: number
  // Remaining packed fields are intentionally not public API.
}>

export type Neighbor<T> = Readonly<{
  value: T
  inputIndex: number
  distance: number
}>

buildSpatialIndex<T>(
  items: ReadonlyArray<T>,
  getBounds: (item: T, index: number) => Bounds,
  options?: { nodeSize?: number },
): SpatialIndex<T>

search<T>(index: SpatialIndex<T>, query: Bounds): T[]

visit<T>(
  index: SpatialIndex<T>,
  query: Bounds,
  visitor: (value: T, inputIndex: number) => boolean | void,
): void

nearest<T>(
  index: SpatialIndex<T>,
  point: Point,
  options?: {
    count?: number
    maxDistance?: number
    distance?: (value: T, point: Point, inputIndex: number) => number
  },
): Neighbor<T>[]
```

### Algorithm and semantics

- Evaluate `getBounds` exactly once per item and validate all bounds before allocating the full tree.
- Bulk-load leaves by Hilbert order of box centres, then build parent levels bottom-up with default `nodeSize: 16`.
- Store every node bound in one `Float64Array` and child/item ranges in integer arrays. Keep user values in original input order; packed leaves store original indices.
- The index is immutable. Dynamic insert/update/delete is out of scope.
- `search` returns tree traversal order, which is deterministic but not input order. `visit` exposes the same order and stops when the visitor returns `false`.
- `nearest` uses a min-heap of bounding-box lower bounds. Without a distance callback, the result distance is point-to-box distance. With a callback, the callback supplies the exact non-negative item distance while the box remains its pruning lower bound; returning a value below that lower bound is a caller contract violation and throws.
- Neighbours sort by distance, then original input index. `count` defaults to one; an empty tree or zero count returns `[]`.

---

## 8. Polygon topology (`@stopcock/geo/topology`)

### Public API

```ts
export type PolygonSubject = Polygon | MultiPolygon
export type OverlayOperation = 'union' | 'intersection' | 'difference' | 'xor'

export type OverlayOptions = SnapOptions & Readonly<{
  fillRule?: FillRule
  maxIntersections?: number
  maxOutputVertices?: number
}>

regularize(subject: PolygonSubject, options?: OverlayOptions): MultiPolygon

overlay(
  a: PolygonSubject,
  b: PolygonSubject,
  operation: OverlayOperation,
  options?: OverlayOptions,
): MultiPolygon

union(a: PolygonSubject, b: PolygonSubject, options?: OverlayOptions): MultiPolygon
intersection(a: PolygonSubject, b: PolygonSubject, options?: OverlayOptions): MultiPolygon
difference(a: PolygonSubject, b: PolygonSubject, options?: OverlayOptions): MultiPolygon
xor(a: PolygonSubject, b: PolygonSubject, options?: OverlayOptions): MultiPolygon

clipToBounds(
  subject: PolygonSubject,
  bounds: Bounds,
  options?: OverlayOptions,
): MultiPolygon
```

Defaults are `fillRule: 'nonzero'` and no work limit. When supplied, `maxIntersections` and `maxOutputVertices` are hard defensive limits checked before the next growth allocation; exceeding either throws `RangeError` with the configured and observed counts.

### Exact arrangement implementation

1. Validate, copy, optionally snap, remove consecutive duplicates, and emit directed source segments tagged with operand, ring, and winding contribution.
2. Convert every finite IEEE-754 input coordinate into an exact dyadic BigInt representation. Represent non-endpoint intersections as reduced rational BigInt numerator/denominator pairs.
3. Run a Bentley-Ottmann sweep. Event ordering and active-edge comparisons use exact rationals; adaptive expansion predicates handle the overwhelmingly common orientation/incircle sign path without BigInt allocation.
4. Split segments at every point intersection and overlap endpoint. Merge coincident atomic edges while retaining signed winding contributions from both operands.
5. Build a deterministic DCEL/half-edge arrangement. Sort outgoing edges by exact quadrant/cross-product ordering, not `atan2`.
6. Traverse faces, classify each face against both operands under the selected fill rule, and select boundary half-edges according to the Boolean truth table.
7. Trace selected rings, discard zero-area/touch-only cycles, assign holes to the smallest containing outer, and canonicalise every output ring/polygon.
8. Convert exact rational vertices to nearest IEEE-754 doubles only while materialising the public result. Collapse adjacent vertices that round to the same double and rerun zero-area cleanup.

### Topology behavior

- Self-intersecting rings, shared edges, duplicate edges, T-junctions, point touches, near-parallel lines, and overlapping collinear segments are valid arrangement input.
- Boundary-only intersection produces an empty area result, not a zero-width polygon.
- `difference(a, [])` and `union(a, [])` regularise and canonicalise `a`; identity tests compare area and point classification rather than original vertex order.
- `regularize` resolves self-intersections and inconsistent hole placement using the selected fill rule.
- Exact ordering prevents tolerance-created slivers. A caller that wants coarser topology must opt into `snapTolerance`.

---

## 9. Offsets and stroke expansion (`@stopcock/geo/offset`)

### Public API

```ts
export type JoinStyle = 'miter' | 'bevel' | 'round'
export type CapStyle = 'butt' | 'square' | 'round'

export type OffsetOptions = OverlayOptions & Readonly<{
  join?: JoinStyle
  miterLimit?: number
  arcTolerance?: number
  maxArcSegments?: number
}>

export type StrokeOptions = OffsetOptions & Readonly<{
  cap?: CapStyle
  closed?: boolean
}>

offsetLine(path: Path, distance: number, options?: OffsetOptions): MultiPath
offsetPolygon(subject: PolygonSubject, distance: number, options?: OffsetOptions): MultiPolygon
bufferPath(path: Path, radius: number, options?: StrokeOptions): MultiPolygon
expandStroke(path: Path, width: number, options?: StrokeOptions): MultiPolygon
```

Defaults are `join: 'miter'`, `miterLimit: 4`, `cap: 'butt'`, `closed: false`, and `maxArcSegments: 4096`. `arcTolerance` defaults to `max(abs(distanceOrRadius) / 1024, 1e-9)` in coordinate units.

### Semantics and implementation

- `offsetLine` returns the one-sided parallel curve. Positive distance is left of the authored direction; negative is right. It may return multiple paths after self-intersection cleanup.
- `offsetPolygon` is winding-independent: positive expands the filled region and negative erodes it. Outer and hole boundaries move in opposite geometric directions as required by the filled region.
- `bufferPath` creates a filled radius around the path. `expandStroke(path, width)` is exactly `bufferPath(path, width / 2)` and exists for SVG/canvas terminology.
- Miter length is measured as the distance from authored vertex to join divided by absolute offset. Ratios above `miterLimit` become bevel joins.
- Round joins/caps use the minimum segment count whose sagitta is no greater than `arcTolerance`. If this requires more than `maxArcSegments` over one full circle, throw rather than silently violating tolerance.
- Square caps extend by the buffer radius along the terminal tangent. Butt caps end at the authored endpoint.
- Remove zero-length segments before tangent construction. A path with one unique point buffers to a circle for round caps and to a square for square caps; butt produces an empty result.
- Construct raw parallel segments/joins/caps, then pass the resulting loops through the topology arrangement. Do not attempt local-only self-intersection deletion.
- Polygon erosion that collapses the subject returns `[]`. Zero polygon offset returns a canonical regularised copy. Zero path radius/width returns `[]`; negative radius/width throws.

---

## 10. WGS84 geodesy (`@stopcock/geo/geodesy`)

### Public types and constants

```ts
export type LonLat = readonly [longitudeDegrees: number, latitudeDegrees: number]
export type LonLatHeight = readonly [longitudeDegrees: number, latitudeDegrees: number, heightMeters: number]
export type EnuPoint = readonly [eastMeters: number, northMeters: number, upMeters: number]

export const WGS84 = {
  semiMajorAxis: 6378137,
  inverseFlattening: 298.257223563,
} as const

export type GeodesicInverse = Readonly<{
  distance: number
  initialBearing: number | null
  finalBearing: number | null
}>

export type GeodesicDirect = Readonly<{
  point: LonLat
  finalBearing: number
}>
```

All distances/heights are metres. Bearings are degrees clockwise from true north, normalised to `[0, 360)`. Longitudes returned by geodesy functions are normalised to `[-180, 180)`.

### Public API

```ts
inverseGeodesic(a: LonLat, b: LonLat): GeodesicInverse
directGeodesic(start: LonLat, initialBearing: number, distance: number): GeodesicDirect
geodesicDistance(a: LonLat, b: LonLat): number
initialBearing(a: LonLat, b: LonLat): number | null
destination(start: LonLat, bearing: number, distance: number): LonLat
interpolateGeodesic(a: LonLat, b: LonLat, fraction: number): LonLat

rhumbDistance(a: LonLat, b: LonLat): number
rhumbBearing(a: LonLat, b: LonLat): number | null
rhumbDestination(start: LonLat, bearing: number, distance: number): LonLat
interpolateRhumb(a: LonLat, b: LonLat, fraction: number): LonLat

projectWebMercator(
  point: LonLat,
  options?: { latitude?: 'error' | 'clamp' },
): Point
unprojectWebMercator(point: Point): LonLat

export type LocalTangentPlane = Readonly<{
  origin: LonLatHeight
  project(point: LonLat | LonLatHeight): EnuPoint
  unproject(point: EnuPoint): LonLatHeight
}>

createLocalTangentPlane(origin: LonLat | LonLatHeight): LocalTangentPlane
```

### Algorithm and edge policy

- Implement Karney's near-antipode-safe ellipsoidal direct/inverse method with sixth-order flattening series, safeguarded Newton iteration, and a bisection fallback for the inverse root.
- Coincident points return distance zero and both bearings `null`. Antipodal and near-antipodal inputs must converge; they do not fall back to a sphere or Vincenty.
- Reject latitude outside `[-90, 90]`, non-finite values, negative distance, and interpolation fractions outside `[0, 1]`. Input longitude may be outside the canonical range and is explicitly normalised by geodesy functions.
- Interpolate along the shortest inverse geodesic by solving inverse once and evaluating the direct problem at `fraction * distance`.
- Rhumb lines use ellipsoidal meridional parts. Choose the shortest wrapped longitude delta. A destination that reaches/crosses a pole throws `RangeError`; do not reflect it silently.
- Web Mercator uses WGS84 semimajor radius. The default latitude policy is `error`; `{ latitude: 'clamp' }` clamps to `±85.0511287798066` before projecting.
- Local tangent planes convert geodetic coordinates to WGS84 ECEF, translate by the origin, then rotate to ENU. A 2D input has height zero; inverse always returns height.
- Acceptance tolerance against authoritative GeographicLib fixtures is 1 millimetre for distance and `1e-9` degrees for defined bearings/direct endpoints; near-antipodal distance tolerance is 1 centimetre.

---

## 11. RFC 7946 adapters (`@stopcock/geo/geodesy`)

GeoJSON is part of `/geodesy` because RFC 7946 coordinates are WGS84 longitude/latitude in decimal degrees. Planar algorithms operate on the XY projection supplied by the caller; they do not pretend lon/lat degrees are metric.

### Types

```ts
export type GeoJsonPosition =
  | readonly [longitude: number, latitude: number]
  | readonly [longitude: number, latitude: number, altitude: number]

export type PackedPositions = Readonly<{
  xy: PointBuffer
  altitude?: Float64Array
}>

export type PackedGeoJsonGeometry =
  | { readonly type: 'Point'; readonly coordinates: GeoJsonPosition }
  | { readonly type: 'MultiPoint'; readonly coordinates: PackedPositions }
  | { readonly type: 'LineString'; readonly coordinates: PackedPositions }
  | { readonly type: 'MultiLineString'; readonly coordinates: ReadonlyArray<PackedPositions> }
  | { readonly type: 'Polygon'; readonly coordinates: ReadonlyArray<PackedPositions> }
  | { readonly type: 'MultiPolygon'; readonly coordinates: ReadonlyArray<ReadonlyArray<PackedPositions>> }
  | { readonly type: 'GeometryCollection'; readonly geometries: ReadonlyArray<PackedGeoJsonGeometry> }

export type PackedGeoJsonFeature<P = Readonly<Record<string, unknown>> | null> = Readonly<{
  type: 'Feature'
  geometry: PackedGeoJsonGeometry | null
  properties: P
  id?: string | number
  bbox?: ReadonlyArray<number>
  foreign?: Readonly<Record<string, unknown>>
}>

export type PackedGeoJsonFeatureCollection<P = Readonly<Record<string, unknown>> | null> = Readonly<{
  type: 'FeatureCollection'
  features: ReadonlyArray<PackedGeoJsonFeature<P>>
  bbox?: ReadonlyArray<number>
  foreign?: Readonly<Record<string, unknown>>
}>

export type PackedGeoJson<P = Readonly<Record<string, unknown>> | null> =
  | PackedGeoJsonGeometry
  | PackedGeoJsonFeature<P>
  | PackedGeoJsonFeatureCollection<P>
```

For Polygon coordinates, element zero is the outer ring and remaining elements are holes. Each packed ring omits the repeated closing point; `encodeGeoJSON` restores it.

### API

```ts
decodeGeoJSON<P = Readonly<Record<string, unknown>> | null>(
  value: unknown,
  options?: { preserveForeignMembers?: boolean },
): PackedGeoJson<P>

encodeGeoJSON<P>(value: PackedGeoJson<P>): unknown
crossesAntimeridian(value: PackedGeoJson): boolean
splitAntimeridian<P>(value: PackedGeoJson<P>): PackedGeoJson<P>
geoJsonBounds(value: PackedGeoJson): ReadonlyArray<number> | null
```

### RFC behavior

- Accept exactly two- or three-element positions. Preserve altitude in parallel arrays and through decode/encode/splitting; reject ambiguous fourth/M ordinates.
- Require finite longitude/latitude, longitude within `[-180, 180]`, latitude within `[-90, 90]`, and finite altitude. `decodeGeoJSON` never normalises invalid input.
- Require LineStrings to have at least two positions and linear rings to contain at least four positions with identical first/last values. The internal packed ring removes the duplicate closing point.
- Accept either input ring winding for compatibility. Encoding always emits counter-clockwise exterior rings and clockwise holes.
- Permit empty FeatureCollections and GeometryCollections. Reject empty coordinate arrays for other geometry types; callers represent an unlocated Feature with `geometry: null`.
- Preserve Feature properties and ids exactly. When requested, retain unknown members in `foreign` without allowing them to redefine standard members.
- Validate `bbox` dimensionality and finite values. `encodeGeoJSON` preserves a decoded bbox if geometry is unchanged; `splitAntimeridian` recomputes affected bboxes.
- `crossesAntimeridian` detects any segment whose shortest RFC Cartesian representation crosses ±180.
- `splitAntimeridian` unwraps each line/ring, intersects it linearly with ±180 in lon/lat/altitude coordinates, cuts LineStrings to MultiLineStrings and Polygons to MultiPolygons where needed, then rewraps each part. It recurses through collections and preserves Feature properties/id/foreign members.
- Antimeridian splitting is explicit because it can change a geometry's type. No decoder, encoder, geodesic, projection, or topology call invokes it automatically.

---

## 12. SVG adapter (`@stopcock/svg/geo`)

### Public API

```ts
import type { Node, Path as SvgPath } from '@stopcock/svg'

pathFromPoints(points: PointBuffer, options?: { closed?: boolean }): SvgPath
pathFromBeziers(curves: ReadonlyArray<CubicBezier>): SvgPath

geometryBounds(
  node: Node,
  options?: {
    measureText?: (node: Extract<Node, { kind: 'text' }>) => Bounds | null
  },
): { readonly bounds: Bounds | null; readonly complete: boolean }

hitTest(
  root: Node,
  point: Point,
  options?: {
    mode?: 'fill' | 'stroke' | 'both'
    fillRule?: FillRule
    strokeTolerance?: number
    curveTolerance?: number
    measureText?: (node: Extract<Node, { kind: 'text' }>) => Bounds | null
  },
): Node | undefined
```

### Adapter semantics

- `pathFromPoints` emits `M` plus `L` commands and optional `Z`; empty input returns an empty SVG path.
- `pathFromBeziers` verifies segment continuity, emits one `M`, then cubic `C` commands. Discontinuous input throws rather than inventing connector lines.
- `geometryBounds` computes geometry-only axis-aligned bounds after nested affine transforms. It excludes stroke width, masks, clips, and filter expansion.
- Circle, ellipse, rect, image, and line bounds are analytic. Quadratic/cubic path bounds solve derivative extrema. SVG arcs are converted from endpoint to centre parameterisation and include every axis extremum inside the swept interval.
- Text uses the supplied measurer. Without one, text is skipped and `complete` is false; all known sibling geometry is still included.
- `hitTest` walks group/root/use children in reverse paint order, inverts each local transform, uses exact primitive containment and flattened curve/arc distance tests, and respects the requested mode. Defaults are `mode: 'both'`, `fillRule: 'nonzero'`, `strokeTolerance: 0`, and `curveTolerance: 0.25`.
- Preserve existing imports by turning `@stopcock/svg/la`'s `fitBezier` and `hitTest` into wrappers over Geo. Keep their current names and return shapes. Other `/la` helpers remain unchanged.

---

## 13. Failure and edge-case contract

- Throw `TypeError` for malformed object shapes and unsupported GeoJSON type/member combinations.
- Throw `RangeError` for odd buffer lengths, non-finite coordinates, invalid bounds, invalid radii/tolerances/counts, impossible ring/path cardinality, and configured work-limit exhaustion.
- Do not throw merely because a valid operation has no area/result. Return `[]`, an empty typed array, or `null` as specified.
- Do not catch arithmetic/programming errors and return partial geometry.
- Every operation is deterministic for identical bytes and options across supported runtimes. Stable tie-breaking always ends at original input index.
- No API reads browser globals, locale, current time, implicit randomness, or environment state.
- Very large output is allowed unless the caller supplies a work limit. Allocate geometrically and check typed-array size before allocation so failures occur before partial mutation.

---

## 14. Staged implementation tasks

### Task 1 — Scaffold the private package and export map

- [ ] Create `packages/geo` with version `0.0.0`, `private: true`, ESM, `sideEffects: false`, direct `@stopcock/fp` dependency, build scripts, six public entries, and declarations.
- [ ] Add source aliases/dependencies for Geo to the benchmark and docs workspaces without altering Synth exclusions.
- [ ] Add import smoke tests for every source entry and built entry.
- [ ] Confirm root `bun run build:packages`, lint, and test discovery include the private package.

### Task 2 — Lock representations and validation

- [ ] Implement public types, packed access helpers, polygon construction, canonical winding/rotation, bounds, and shared validators.
- [ ] Add defensive typed-array allocation helpers and public-output `-0` normalisation.
- [ ] Add runtime tests for all malformed lengths/cardinalities/non-finite values and declaration tests for readonly tuples, overloads, and subpath imports.

### Task 3 — Implement exact arithmetic and primitive geometry

- [ ] Implement expansion primitives (`twoSum`, `twoProduct`, expansion sum/scale/estimate) and adaptive exact `orient2d`/`incircle`.
- [ ] Implement dyadic decoding and exact rational comparisons used by topology.
- [ ] Implement segment intersection/overlap, closest point, area, perimeter, centroid, point classification, and bounds operations.
- [ ] Cross-check signs and intersections against a slow BigInt oracle in property tests.

### Task 4 — Hulls, simplification, and Bézier curves

- [ ] Implement stable Andrew hull indices, iterative open/closed RDP, Schneider fitting, Newton reparameterisation, and adaptive flattening.
- [ ] Enforce max-error and max-segment contracts.
- [ ] Add geometric error-property tests rather than snapshot-only control-point tests.

### Task 5 — Delaunay and Voronoi

- [ ] Implement deterministic seed selection, incremental hull/halfedges, duplicate handling, and collinear fallback.
- [ ] Implement circumcentres, ordered incident faces, hull rays, and rectangular cell clipping.
- [ ] Add topology invariants, Euler checks, incircle properties, and clipped-cell coverage tests.

### Task 6 — Immutable packed R-tree

- [ ] Implement Hilbert ordering, bottom-up bulk load, packed traversal, visit early exit, and min-heap nearest queries.
- [ ] Pin result stability and callback contract behavior.
- [ ] Property-test search and nearest against brute-force box/distance oracles.

### Task 7 — Exact polygon arrangement and Boolean overlay

- [ ] Implement exact sweep events, intersection splitting, coincident-edge merging, DCEL construction, face winding classification, Boolean selection, and ring extraction.
- [ ] Add regularisation, rectangle clipping, work limits, snap-grid preprocessing, and canonical output.
- [ ] Build adversarial fixtures for shared edges, bow ties, nested holes, T-junctions, spikes, near-parallel edges, and large coordinates.

### Task 8 — Offset, buffer, and stroke expansion

- [ ] Implement line normals, joins, caps, arc tessellation, polygon boundary direction, and raw-loop construction.
- [ ] Resolve all raw loops through topology and test collapsed erosion/split buffers.
- [ ] Add analytic fixtures for each join/cap/miter limit and property checks for containment/area monotonicity where mathematically valid.

### Task 9 — WGS84 geodesy and projections

- [ ] Implement Karney-series coefficients and safeguarded direct/inverse solvers.
- [ ] Add geodesic convenience functions, rhumb operations, Web Mercator, ECEF conversion, and local ENU frames.
- [ ] Check in a documented subset of GeographicLib's GeodTest data, including poles, equator, short paths, and near-antipodes.

### Task 10 — RFC 7946 adapters and antimeridian splitting

- [ ] Implement strict unknown-value validation, packed XY/altitude conversion, every geometry/feature/collection form, bbox handling, and foreign-member preservation.
- [ ] Implement explicit line/polygon antimeridian cutting with altitude interpolation and wrapper preservation.
- [ ] Add RFC examples, 2D/3D round trips, wrong-winding acceptance/canonical encode, null geometry, empty collections, malformed input, and antimeridian bbox fixtures.

### Task 11 — Add the SVG seam without breaking `/la`

- [ ] Add `@stopcock/svg/geo`, its package export/build entry, and direct dependency.
- [ ] Implement path adapters, analytic transformed geometry bounds, arc conversion, and hit testing.
- [ ] Delegate existing `/la` `fitBezier` and `hitTest` while preserving signatures and import paths.
- [ ] Run the full existing SVG suite unchanged before adding Geo-specific tests.

### Task 12 — Benchmarks, documentation, and Geo Lab

- [ ] Add source/dist benchmark aliases and benchmark-only competitors; validate semantic equivalence before timing.
- [ ] Add package README, full docs API page, recipes, root catalogue/grid/sidebar entries, dependency diagram, and LLMS generation coverage.
- [ ] Build the interactive Geo Lab with deterministic examples for hull/Delaunay/Voronoi, R-tree querying, Boolean overlay, offsets, freehand Bézier fitting, and geodesic/antimeridian paths.
- [ ] Make controls keyboard-operable, give SVG/canvas output accessible text alternatives, and keep all demo computation in-browser.

### Task 13 — Package isolation and 1.0 release

- [ ] Build every entry and inspect emitted declaration imports for private/internal paths.
- [ ] Pack the package, install it into an empty temporary consumer, and import every entry under Node and Bun.
- [ ] Run the Deno ESM smoke test as non-blocking evidence.
- [ ] Only after all acceptance checks pass: remove `private`, add the major Changeset for `1.0.0`, verify the publish set includes Geo and still excludes Synth, and run the existing publish dry-run/tarball inspection.

---

## 15. Test matrix

### Runtime and property tests

- Predicates: random triples/quadruples cross-checked against the BigInt exact oracle; nearly collinear/cocircular values at subnormal, ordinary, and large magnitudes.
- Segments: crossing, endpoint touch, overlap, reverse symmetry, degeneracy, and snap/no-snap cases.
- Polygon metrics: winding reversal, holes, translation/scaling laws, zero-area behavior, and point-on-edge/vertex classification.
- Hull/simplify/Bézier: all input points inside/on hull, source-order mapping, endpoint preservation, maximum deviation, closed-ring cyclic behavior, fit/flatten error.
- Delaunay/Voronoi: half-edge reciprocity, CCW triangles, no point in a circumcircle, duplicate mapping, Euler characteristic, hull agreement, clipped cell containment, and cell/site correspondence.
- Spatial: exact equality with brute-force queries, stable ties, visit cancellation, custom distance validation, empty/large indexes.
- Topology: commutative operations, `A union A = A`, `A intersection A = A`, `A xor A = empty`, difference identities, area conservation, fill-rule differences, shared boundaries, nested holes, self-intersections, and snap determinism.
- Offset: each join/cap, acute miter fallback, closed/open paths, holes, erosion collapse, self-intersecting raw offsets, and round-arc error bound.
- Geodesy: authoritative direct/inverse pairs, coincident/polar/equatorial/short/antipodal cases, inverse-direct closure, rhumb closure, Mercator round trips, and ENU/ECEF round trips.
- GeoJSON: all seven geometry types, null geometry, Feature/FeatureCollection, properties/id/bbox/foreign members, altitude, right-hand-rule encoding, malformed arrays, and antimeridian type changes.
- SVG: every node kind, nested transforms, quadratic/cubic/arc extrema, unmeasured text completeness, fill/stroke hit modes, and unchanged legacy `/la` imports.

### Type tests

- Readonly tuple rejection of wrong arity.
- Data-first/data-last inference for parameterised root operations.
- Generic value preservation through `SpatialIndex<T>` search/visit/nearest.
- Discriminated narrowing for intersections and packed GeoJSON.
- Correct declarations for all six Geo subpaths and `@stopcock/svg/geo`.
- Negative imports prove internal exact-arithmetic modules are not public.

### Benchmark suites

- Core: hull/simplify/containment at 1k, 100k, and 1m points.
- Delaunay/Voronoi: random, grid, and clustered inputs at 1k/10k/100k.
- Spatial: build, sparse search, dense search, and nearest at 10k/1m boxes.
- Topology: disjoint, dense-intersection, shared-edge, and hole-heavy polygons at increasing segment counts.
- Offset: long polylines, acute joins, round output, and self-intersection cleanup.
- Geodesy: direct/inverse batches and projection/ENU conversions.
- Compare only in `benchmarks` using pinned benchmark dependencies such as d3-delaunay, rbush, a maintained polygon-overlay implementation, and GeographicLib-generated expected values. Third-party speed is informational; correctness and internal regression baselines gate release.
- The packed R-tree must demonstrably beat brute-force search by 10k boxes. Other timing thresholds are recorded after the first correct implementation and then used only as internal regression budgets.

---

## 16. Showcase and documentation acceptance

The Geo Lab page contains five tabs backed by the published APIs:

1. **Triangulation:** seeded/draggable sites with hull, Delaunay, and bounded Voronoi overlays.
2. **Spatial query:** one million generated boxes off the main render loop, a draggable query box, result count, and query timing.
3. **Topology:** editable subject/clip polygons and union/intersection/difference/xor output with fill-rule and snap controls.
4. **Offsets:** editable open/closed path with join, cap, distance/width, miter, and arc-tolerance controls.
5. **Geodesy:** draggable lon/lat endpoints, direct/inverse measurements, geodesic versus rhumb line, and explicit antimeridian split preview.

Documentation must state coordinate units, Cartesian winding, lon/lat order, metres/degrees, boundary semantics, exact-versus-snap behavior, output canonicalisation, algorithmic complexity, and every 1.0 exclusion. Recipes must include SVG path generation, hit-testing, static spatial queries, polygon cleanup, buffered strokes, local ENU measurement, and RFC 7946 round-trip handling.

---

## 17. Release acceptance checklist

- [ ] All runtime, property, declaration, browser-showcase, and legacy SVG tests pass.
- [ ] `bun run lint:ci`, `bun run build:packages`, `bun run lint:types`, and `bun run test:packages` pass with Synth still excluded by the existing automation.
- [ ] Every built export resolves from a packed clean install; no source file, benchmark dependency, or undeclared Stopcock package leaks into `dist`.
- [ ] GeoJSON RFC examples and GeographicLib fixture tolerances pass on Node and Bun; Deno smoke results are recorded.
- [ ] Benchmark inputs are correctness-validated before timing, source and dist suites both resolve Geo subpaths, and initial regression baselines are checked in.
- [ ] Docs build succeeds, Geo appears in the root README and docs grid/sidebar, the Geo Lab works without server state, and generated LLMS docs include the full surface.
- [ ] Public API review confirms there is no arbitrary-CRS promise, implicit snapping, browser global, hidden mutation, or unstable result ordering.
- [ ] Package remains `0.0.0`/private until every item above is green; then publish exactly `@stopcock/geo@1.0.0` through a major Changeset and confirm `@stopcock/synth` remains outside the publish set.

---

## References

- [Stopcock eight-package 1.0 roadmap](./2026-07-21-stopcock-eight-package-roadmap.md)
- [SVG design](../../../packages/svg/DESIGN.md)
- [GeoJSON RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)
- [Charles F. F. Karney, “Algorithms for geodesics”](https://doi.org/10.1007/s00190-012-0578-z)

