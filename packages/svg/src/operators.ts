import type { ClipPath, ColorMatrix4x5, Filter, Mask, Mat, Node, Paint, Stroke } from './types'
import { identity, mul } from './matrix'

const withNode = (node: Node, patch: Partial<Node>): Node => ({ ...node, ...patch } as Node)

const composeTransform = (node: Node, next: Mat): Node =>
  withNode(node, { transform: mul(next, node.transform ?? identity) })

export const fill = (paint: Paint) => (node: Node): Node => withNode(node, { fill: paint })

export const stroke = (
  paint: Paint,
  width: number,
  opts: Omit<Stroke, 'paint' | 'width'> = {},
) => (node: Node): Node => withNode(node, { stroke: { paint, width, ...opts } })

export const opacity = (value: number) => (node: Node): Node => withNode(node, { opacity: value })

export const translate = (dx: number, dy: number) => (node: Node): Node =>
  composeTransform(node, [1, 0, 0, 1, dx, dy])

export const rotate = (deg: number, cx: number = 0, cy: number = 0) => (node: Node): Node => {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const rot: Mat = [cos, sin, -sin, cos, 0, 0]
  if (cx === 0 && cy === 0) return composeTransform(node, rot)
  return composeTransform(node, mul([1, 0, 0, 1, cx, cy], mul(rot, [1, 0, 0, 1, -cx, -cy])))
}

export const scale = (sx: number, sy: number = sx) => (node: Node): Node =>
  composeTransform(node, [sx, 0, 0, sy, 0, 0])

export const skewX = (deg: number) => (node: Node): Node =>
  composeTransform(node, [1, 0, Math.tan((deg * Math.PI) / 180), 1, 0, 0])

export const skewY = (deg: number) => (node: Node): Node =>
  composeTransform(node, [1, Math.tan((deg * Math.PI) / 180), 0, 1, 0, 0])

export const clip = (clipPath: ClipPath) => (node: Node): Node => withNode(node, { clip: clipPath })
export const mask = (maskValue: Mask) => (node: Node): Node => withNode(node, { mask: maskValue })

type FilterOperator = {
  (filterValue: Filter): (node: Node) => Node
  blur(stdDev: number): Filter
  colorMatrix(values: ColorMatrix4x5 | Float64Array | ReadonlyArray<number>): Filter
  compose(filters: ReadonlyArray<Filter>): Filter
}

export const filter = ((filterValue: Filter) => (node: Node): Node =>
  withNode(node, { filter: filterValue })) as FilterOperator

filter.blur = (stdDev: number): Filter => ({ kind: 'filter', stages: [{ kind: 'blur', stdDev }] })
filter.colorMatrix = (values): Filter => {
  if (values.length !== 20) throw new Error(`Color matrix must contain 20 values, got ${values.length}`)
  return { kind: 'filter', stages: [{ kind: 'colorMatrix', values }] }
}
filter.compose = (filters: ReadonlyArray<Filter>): Filter => ({
  kind: 'filter',
  stages: filters.flatMap((f) => f.stages),
})

export const viewBox = (x: number, y: number, w: number, h: number) => (node: Node): Node =>
  ({ kind: 'root', child: node, viewBox: [x, y, w, h] })

export const toClip = () => (node: Node): ClipPath => ({ kind: 'clip', child: node })
export const toMask = () => (node: Node): Mask => ({ kind: 'mask', child: node })
