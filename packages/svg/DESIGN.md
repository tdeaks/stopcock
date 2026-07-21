# @stopcock/svg

Procedural vector graphics as pipeable values. Output target for color, geo, procgen, motion.

## Decisions

| #   | Question                    | Decision                                                                                                                                                        |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Composition model           | Everything is pipe. `group([...])` is a stage that takes an array of `Node`.                                                                                    |
| 2   | AST shape                   | Hybrid. Discriminated `kind` for the leaf type, structural `Common` for shared decoration (`fill`, `stroke`, `transform`, `opacity`, `clip`, `mask`, `filter`). |
| 3   | Gradient placement          | In `Paint`. One `fill` function, any paint kind.                                                                                                                |
| 4   | clip / mask scope           | On `Common`, valid on any node.                                                                                                                                 |
| 5   | Reuse model                 | Reference by value. Renderer hoists into `<defs>`. No ids in user code.                                                                                         |
| 6   | Equality for dedup          | Reference equality. `const` is the user's lever.                                                                                                                |
| 7   | Render passes               | Two. Walk to collect defs, then emit.                                                                                                                           |
| 8   | Transform representation    | Affine matrix as a flat 6-tuple. Composes by multiply, identity is a constant.                                                                                  |
| 9   | Transform compose direction | Post-multiply. Whatever you pipe most recently wraps everything before it. Matches reading order.                                                               |
| 10  | Rotation default center     | Origin. Caller passes `cx, cy` if they want something else. No bounding-box math at this layer.                                                                 |
| 11  | Angle units                 | Degrees at the API. Convert to radians internally. Matches SVG, CSS, and color hue.                                                                             |
| 12  | Path representation         | Typed command array, built by pipe. String only as an escape hatch.                                                                                             |
| 13  | Output                      | String. DOM and React adapters can sit in separate packages later.                                                                                              |
| 14  | Color integration           | Accept `Color` from `@stopcock/color` directly. No `toHex()` ceremony at call sites.                                                                            |

## Type system

```ts
import type { Color } from '@stopcock/color'

export type Mat = readonly [number, number, number, number, number, number]
export const identity: Mat = [1, 0, 0, 1, 0, 0]

export type GradientStop = { offset: number; color: Color; opacity?: number }
export type Gradient =
  | { kind: 'linear'; stops: ReadonlyArray<GradientStop>; angle: number; transform?: Mat }
  | {
      kind: 'radial'
      stops: ReadonlyArray<GradientStop>
      cx: number
      cy: number
      r: number
      transform?: Mat
    }

export type Pattern = { kind: 'pattern'; child: Node; w: number; h: number; transform?: Mat }
export type Paint = Color | Gradient | Pattern | 'none'

export type Stroke = {
  paint: Paint
  width: number
  dash?: ReadonlyArray<number>
  linecap?: 'butt' | 'round' | 'square'
  linejoin?: 'miter' | 'round' | 'bevel'
}

export type ClipPath = { kind: 'clip'; child: Node }
export type Mask = { kind: 'mask'; child: Node }
export type Filter = { kind: 'filter'; stages: ReadonlyArray<FilterStage> }

export type PathCmd =
  | { c: 'M'; x: number; y: number }
  | { c: 'L'; x: number; y: number }
  | { c: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: 'Q'; x1: number; y1: number; x: number; y: number }
  | { c: 'A'; rx: number; ry: number; large: boolean; sweep: boolean; x: number; y: number }
  | { c: 'Z' }
export type Path = ReadonlyArray<PathCmd>

export type Common = {
  fill?: Paint
  stroke?: Stroke
  transform?: Mat
  opacity?: number
  clip?: ClipPath
  mask?: Mask
  filter?: Filter
}

export type Node = Common &
  (
    | { kind: 'circle'; r: number; cx: number; cy: number }
    | { kind: 'rect'; w: number; h: number; x: number; y: number; rx?: number; ry?: number }
    | { kind: 'ellipse'; rx: number; ry: number; cx: number; cy: number }
    | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
    | { kind: 'path'; d: Path }
    | { kind: 'text'; text: string; x: number; y: number; size: number; family?: string }
    | { kind: 'group'; children: ReadonlyArray<Node> }
    | { kind: 'use'; target: Node }
    | { kind: 'root'; child: Node; viewBox: readonly [number, number, number, number] }
  )
```

## Operators

Every operator returns the same kind of value it accepts. Pipe-clean by construction.

### On `Node`

```
fill(paint)                    : Node => Node
stroke(paint, w, opts?)        : Node => Node
opacity(a)                     : Node => Node
translate(dx, dy)              : Node => Node
rotate(deg, cx?, cy?)          : Node => Node
scale(sx, sy?)                 : Node => Node
skewX(deg) / skewY(deg)        : Node => Node
clip(clipPath)                 : Node => Node
mask(mask)                     : Node => Node
filter(f)                      : Node => Node
viewBox(x, y, w, h)            : Node => Node    // wraps in { kind: 'root' }
toClip()                       : Node => ClipPath
toMask()                       : Node => Mask
```

### Constructors

```
circle(r)                      : Node
rect(w, h)                     : Node
ellipse(rx, ry)                : Node
line(x1, y1, x2, y2)           : Node
text(s, size?)                 : Node
group(children)                : Node
use(target)                    : Node
```

### On `Path`

```
path.start(x, y)               : Path
path.lineTo(x, y)              : Path => Path
path.curveTo(x1, y1, x2, y2, x, y) : Path => Path
path.quadTo(x1, y1, x, y)      : Path => Path
path.arcTo(rx, ry, large, sweep, x, y) : Path => Path
path.close()                   : Path => Path
path.toNode()                  : Path => Node
```

### On `Gradient`

```
linear(stops, angle?)          : Gradient
radial(stops, opts?)           : Gradient
rotateGradient(deg)            : Gradient => Gradient
scaleGradient(s)               : Gradient => Gradient
```

### On `Filter`

```
filter.blur(stdDev)            : Filter
filter.colorMatrix(values)     : Filter
filter.compose(filters)        : Filter
```

## Render contract

```ts
render(node: Node, opts?: { pretty?: boolean }): string
```

Walks the tree twice. First pass collects `Gradient`, `Pattern`, `ClipPath`, `Mask`, `Filter`, and `use` targets into per-kind `Map<object, string>` tables keyed by reference. Second pass emits `<svg>...<defs>{defs}</defs>{body}</svg>`. Synthetic ids are kind-prefixed and deterministic in walk order (`_g0`, `_g1`, `_c0`, `_m0`, ...). User-facing API never sees the ids.

Reference equality drives dedup. Two structurally identical gradients created by separate calls get separate entries unless the user hoists to a `const`.

## Build order

1. `types.ts`, `identity`, `mul` for matrices
2. `circle`, `rect`, `group`, `viewBox`, basic `render` with no defs
3. `fill`, `stroke` accepting `Color` only, format via `@stopcock/color`
4. `translate`, `rotate`, `scale` composing onto existing transform
5. `path.*` builders and path rendering
6. `Gradient` added to `Paint`, plus the collector and defs emission
7. `ClipPath`, `Mask`, `use` reusing the same hoisting mechanism
8. `Filter` last. Biggest spec surface, ships as a subnamespace
9. `@stopcock/la` integration. Decomposition, fitting, hit testing, filter math. Detailed below.

## Linear algebra integration

`Common.transform` stays as a flat 6-tuple. The hot path needs no general matrix machinery. The interesting features sit one level above and reach for `@stopcock/la` when the math earns its keep. `la` is a peer dependency for these features, not a core runtime dependency.

The principle: user-visible API stays pipe-shaped. Linear algebra is hidden behind one well-named function each. Users never see a `la.Mat`.

### Features

**`svg.lerpTransform(a: Mat, b: Mat, t: number): Mat`**
Tween between two transforms without shearing artifacts. Linear interpolation of raw matrix elements warps rotation because rotation lives in a curved subspace. Decompose each transform into translate, rotate, scale, shear via SVD on the 2x2 linear part, interpolate per component, recompose. Backed by `la.svd`.

**`svg.toQuad(corners: [Pt, Pt, Pt, Pt]): Node => Node`**
Warp a node into a quadrilateral. Useful for stickers, faked perspective, mockup compositing. Solves an 8-unknown linear system to produce the homography from the unit square to the destination corners. Backed by `la.solve`.

**`svg.hitTest(root: Node, screenPt: Pt): Node | undefined`**
Find the leaf node under a click point in screen space. Walks the tree, applying the inverse of each transform in turn to map the point into local coordinates. Backed by `la.inverse`. Generalizes cleanly if perspective transforms ever land.

**`svg.fitBezier(points: ReadonlyArray<Pt>, opts?: { tolerance?: number }): Path`**
Least-squares fit of a cubic Bezier through sampled points. Use cases: vectorizing noisy procgen output, smoothing pointer-input strokes, tracing raster shapes. Backed by `la.qr` or `la.solve`.

**`svg.alignToPrincipalAxis(node: Node, points: ReadonlyArray<Pt>): Node => Node`**
Rotate a node to align with the principal axis of a point cloud. Covariance matrix plus `la.eigenvalues`. Two lines of glue, visually striking. Useful for text-on-blob layouts.

**`svg.bakeTransform(node: Node): Node`**
Push any transform on a `path` node into its vertex coordinates, then drop the transform. Reduces output size and lets paths be edited in their final coordinate frame. Each vertex is a `Mat times Vec` operation. For paths with thousands of vertices, batched through `la.multiply` with WASM acceleration via `la.accelerate()`.

**`filter.colorMatrix(values: number[20]): Filter` and `filter.compose(filters: Filter[]): Filter`**
`<feColorMatrix>` is a 4x5 matrix applied to RGBA. Composition of two color matrices is matrix multiplication. The single-pixel application path can reuse `la.Primitives.applyColorMatrix3x3` promoted to 4x5.

**`filter.blur(stdDev: number): Filter`**
Implemented in SVG via `<feGaussianBlur>`. For any CPU or canvas fallback path, separable convolution from `la.Primitives.convolve2dSeparable` provides the implementation.

**`svg.symmetry(node: Node, n: number, step: Mat): Node`**
Repeat a node `n` times under a recurrence (each instance is the previous composed with `step`). For small `n` the per-step compose is fine. For large `n`, the accumulator chain expressed through `la.multiply` with acceleration wins.

### Packaging

These features live in `packages/svg/src/la/`. Importing from `@stopcock/svg/la` pulls in `@stopcock/la`. Importing from `@stopcock/svg` itself does not. The core stays lean for users who only need the basic AST and renderer.

## Open questions

These don't block step 1. Revisit when their step lands.

- **`at(x, y)` shorthand?** For shapes that have native position attrs (`circle.cx`, `rect.x`), do we want a helper that sets them directly rather than going through a translate matrix. Cheaper output, less general.
- **Structural dedup as an opt-in.** `svg.dedupe(true)` mode that hashes def values and shares structurally identical ones. Default stays reference-equality.
- **Text safety.** `text` content must be XML-escaped at render time.
- **Bounding-box helpers.** A pure `bounds(node): Box` function would unlock "rotate around center" and layout work. Sits well in `@stopcock/geo` rather than here.
- **DOM and React adapters.** Separate packages. `@stopcock/svg-dom` produces DOM nodes, `@stopcock/svg-react` produces JSX. Same core AST.

## What this commits us to

- One pipe model. Everything composes the same way.
- No ids, no strings, no global state in user code.
- The renderer is the only thing that knows about XML.
- Adding a new def-shaped feature is a localized change: new type, new collector arm, new render arm.
- Color, geo, procgen, motion can all target this without depending on it transitively.
