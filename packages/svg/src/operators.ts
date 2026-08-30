import type { ClipPath, ColorMatrix4x5, Filter, Mask, Mat, Node, Paint, Stroke } from './types'
import { identity, mul } from './matrix'
import { isNode } from './node-guard'

const withNode = (node: Node, patch: Partial<Node>): Node => ({ ...node, ...patch }) as Node

const composeTransform = (node: Node, next: Mat): Node =>
  withNode(node, { transform: mul(next, node.transform ?? identity) })

export function fill(node: Node, paint: Paint): Node
export function fill(paint: Paint): (node: Node) => Node
export function fill(nodeOrPaint: Node | Paint, maybePaint?: Paint): Node | ((node: Node) => Node) {
  if (arguments.length >= 2) return fill(maybePaint as Paint)(nodeOrPaint as Node)
  const paint = nodeOrPaint as Paint
  return (node: Node): Node => withNode(node, { fill: paint })
}

type StrokeOptions = Omit<Stroke, 'paint' | 'width'>

export function stroke(node: Node, paint: Paint, width: number, opts?: StrokeOptions): Node
export function stroke(paint: Paint, width: number, opts?: StrokeOptions): (node: Node) => Node
export function stroke(
  nodeOrPaint: Node | Paint,
  paintOrWidth: Paint | number,
  widthOrOpts?: number | StrokeOptions,
  maybeOpts: StrokeOptions = {},
): Node | ((node: Node) => Node) {
  if (isNode(nodeOrPaint)) {
    return stroke(paintOrWidth as Paint, widthOrOpts as number, maybeOpts)(nodeOrPaint)
  }
  const paint = nodeOrPaint
  const width = paintOrWidth as number
  const opts = (widthOrOpts as StrokeOptions | undefined) ?? {}
  return (node: Node): Node => withNode(node, { stroke: { paint, width, ...opts } })
}

export function opacity(node: Node, value: number): Node
export function opacity(value: number): (node: Node) => Node
export function opacity(
  nodeOrValue: Node | number,
  maybeValue?: number,
): Node | ((node: Node) => Node) {
  if (arguments.length >= 2) return opacity(maybeValue as number)(nodeOrValue as Node)
  const value = nodeOrValue as number
  return (node: Node): Node => withNode(node, { opacity: value })
}

export function translate(node: Node, dx: number, dy: number): Node
export function translate(dx: number, dy: number): (node: Node) => Node
export function translate(
  nodeOrDx: Node | number,
  dxOrDy: number,
  maybeDy?: number,
): Node | ((node: Node) => Node) {
  if (arguments.length >= 3) return translate(dxOrDy, maybeDy as number)(nodeOrDx as Node)
  const dx = nodeOrDx as number
  const dy = dxOrDy
  return (node: Node): Node => composeTransform(node, [1, 0, 0, 1, dx, dy])
}

export function rotate(node: Node, deg: number, cx?: number, cy?: number): Node
export function rotate(deg: number, cx?: number, cy?: number): (node: Node) => Node
export function rotate(
  nodeOrDeg: Node | number,
  degOrCx: number = 0,
  cxOrCy: number = 0,
  maybeCy: number = 0,
): Node | ((node: Node) => Node) {
  if (isNode(nodeOrDeg)) return rotate(degOrCx, cxOrCy, maybeCy)(nodeOrDeg)
  const deg = nodeOrDeg
  const cx = degOrCx
  const cy = cxOrCy
  return (node: Node): Node => {
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const rot: Mat = [cos, sin, -sin, cos, 0, 0]
    if (cx === 0 && cy === 0) return composeTransform(node, rot)
    return composeTransform(node, mul([1, 0, 0, 1, cx, cy], mul(rot, [1, 0, 0, 1, -cx, -cy])))
  }
}

export function scale(node: Node, sx: number, sy?: number): Node
export function scale(sx: number, sy?: number): (node: Node) => Node
export function scale(
  nodeOrSx: Node | number,
  sxOrSy?: number,
  maybeSy?: number,
): Node | ((node: Node) => Node) {
  if (isNode(nodeOrSx)) return scale(sxOrSy as number, maybeSy)(nodeOrSx)
  const sx = nodeOrSx
  const sy = sxOrSy ?? sx
  return (node: Node): Node => composeTransform(node, [sx, 0, 0, sy, 0, 0])
}

export function skewX(node: Node, deg: number): Node
export function skewX(deg: number): (node: Node) => Node
export function skewX(nodeOrDeg: Node | number, maybeDeg?: number): Node | ((node: Node) => Node) {
  if (arguments.length >= 2) return skewX(maybeDeg as number)(nodeOrDeg as Node)
  const deg = nodeOrDeg as number
  return (node: Node): Node =>
    composeTransform(node, [1, 0, Math.tan((deg * Math.PI) / 180), 1, 0, 0])
}

export function skewY(node: Node, deg: number): Node
export function skewY(deg: number): (node: Node) => Node
export function skewY(nodeOrDeg: Node | number, maybeDeg?: number): Node | ((node: Node) => Node) {
  if (arguments.length >= 2) return skewY(maybeDeg as number)(nodeOrDeg as Node)
  const deg = nodeOrDeg as number
  return (node: Node): Node =>
    composeTransform(node, [1, Math.tan((deg * Math.PI) / 180), 0, 1, 0, 0])
}

export function clip(node: Node, clipPath: ClipPath): Node
export function clip(clipPath: ClipPath): (node: Node) => Node
export function clip(
  nodeOrClipPath: Node | ClipPath,
  maybeClipPath?: ClipPath,
): Node | ((node: Node) => Node) {
  if (arguments.length >= 2) return clip(maybeClipPath as ClipPath)(nodeOrClipPath as Node)
  const clipPath = nodeOrClipPath as ClipPath
  return (node: Node): Node => withNode(node, { clip: clipPath })
}

export function mask(node: Node, maskValue: Mask): Node
export function mask(maskValue: Mask): (node: Node) => Node
export function mask(
  nodeOrMaskValue: Node | Mask,
  maybeMaskValue?: Mask,
): Node | ((node: Node) => Node) {
  if (arguments.length >= 2) return mask(maybeMaskValue as Mask)(nodeOrMaskValue as Node)
  const maskValue = nodeOrMaskValue as Mask
  return (node: Node): Node => withNode(node, { mask: maskValue })
}

type FilterOperator = {
  (node: Node, filterValue: Filter): Node
  (filterValue: Filter): (node: Node) => Node
  blur(stdDev: number): Filter
  colorMatrix(values: ColorMatrix4x5 | Float64Array | ReadonlyArray<number>): Filter
  compose(filters: ReadonlyArray<Filter>): Filter
}

export const filter = function filter(
  nodeOrFilterValue: Node | Filter,
  maybeFilterValue?: Filter,
): Node | ((node: Node) => Node) {
  if (arguments.length >= 2) {
    return withNode(nodeOrFilterValue as Node, { filter: maybeFilterValue as Filter })
  }
  const filterValue = nodeOrFilterValue as Filter
  return (node: Node): Node => withNode(node, { filter: filterValue })
} as FilterOperator

filter.blur = (stdDev: number): Filter => ({ kind: 'filter', stages: [{ kind: 'blur', stdDev }] })
filter.colorMatrix = (values): Filter => {
  if (values.length !== 20)
    throw new Error(`Color matrix must contain 20 values, got ${values.length}`)
  return { kind: 'filter', stages: [{ kind: 'colorMatrix', values }] }
}
filter.compose = (filters: ReadonlyArray<Filter>): Filter => ({
  kind: 'filter',
  stages: filters.flatMap((f) => f.stages),
})

export function viewBox(node: Node, x: number, y: number, w: number, h: number): Node
export function viewBox(x: number, y: number, w: number, h: number): (node: Node) => Node
export function viewBox(
  nodeOrX: Node | number,
  xOrY: number,
  yOrW: number,
  wOrH: number,
  maybeH?: number,
): Node | ((node: Node) => Node) {
  if (arguments.length >= 5) {
    return viewBox(xOrY, yOrW, wOrH, maybeH as number)(nodeOrX as Node)
  }
  const x = nodeOrX as number
  const y = xOrY
  const w = yOrW
  const h = wOrH
  return (node: Node): Node => ({ kind: 'root', child: node, viewBox: [x, y, w, h] })
}

export function toClip(node: Node): ClipPath
export function toClip(): (node: Node) => ClipPath
export function toClip(node?: Node): ClipPath | ((node: Node) => ClipPath) {
  if (arguments.length === 0) return (source: Node): ClipPath => toClip(source)
  return { kind: 'clip', child: node as Node }
}

export function toMask(node: Node): Mask
export function toMask(): (node: Node) => Mask
export function toMask(node?: Node): Mask | ((node: Node) => Mask) {
  if (arguments.length === 0) return (source: Node): Mask => toMask(source)
  return { kind: 'mask', child: node as Node }
}
