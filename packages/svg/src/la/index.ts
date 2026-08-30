import { Mat as LaMat } from '@stopcock/la'
import type { Mat, Node, Path, Pt } from '../types'
import { applyToPoint, identity, inverse as inverseAffine, mul } from '../matrix'
import { group } from '../constructors'
import { rotate } from '../operators'

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export function lerpTransform(a: Mat, b: Mat, t: number): Mat
export function lerpTransform(b: Mat, t: number): (a: Mat) => Mat
export function lerpTransform(
  aOrB: Mat,
  bOrT: Mat | number,
  maybeT?: number,
): Mat | ((a: Mat) => Mat) {
  if (arguments.length < 3) {
    const b = aOrB
    const t = bOrT as number
    return (a: Mat): Mat => lerpTransform(a, b, t)
  }
  const a = aOrB
  const b = bOrT as Mat
  const t = maybeT as number
  LaMat.svd(LaMat.fromArray(2, 2, [a[0], a[2], a[1], a[3]]))
  const angleA = Math.atan2(a[1], a[0])
  const angleB = Math.atan2(b[1], b[0])
  const sxA = Math.hypot(a[0], a[1])
  const sxB = Math.hypot(b[0], b[1])
  const syA = Math.hypot(a[2], a[3])
  const syB = Math.hypot(b[2], b[3])
  const angle = lerp(angleA, angleB, t)
  const sx = lerp(sxA, sxB, t)
  const sy = lerp(syA, syB, t)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [cos * sx, sin * sx, -sin * sy, cos * sy, lerp(a[4], b[4], t), lerp(a[5], b[5], t)]
}

export function toQuad(node: Node, corners: readonly [Pt, Pt, Pt, Pt]): Node
export function toQuad(corners: readonly [Pt, Pt, Pt, Pt]): (node: Node) => Node
export function toQuad(
  nodeOrCorners: Node | readonly [Pt, Pt, Pt, Pt],
  maybeCorners?: readonly [Pt, Pt, Pt, Pt],
): Node | ((node: Node) => Node) {
  if (arguments.length >= 2)
    return toQuad(maybeCorners as readonly [Pt, Pt, Pt, Pt])(nodeOrCorners as Node)
  const corners = nodeOrCorners as readonly [Pt, Pt, Pt, Pt]
  return (node: Node): Node => {
    const [topLeft, topRight, , bottomLeft] = corners
    const basis = LaMat.fromArray(3, 3, [0, 0, 1, 1, 0, 1, 0, 1, 1])
    const x = LaMat.solve(basis, new Float64Array([topLeft[0], topRight[0], bottomLeft[0]]))
    const y = LaMat.solve(basis, new Float64Array([topLeft[1], topRight[1], bottomLeft[1]]))
    const transform: Mat = [x[0], y[0], x[1], y[1], x[2], y[2]]
    return { ...node, transform: mul(transform, node.transform ?? identity) } as Node
  }
}

const localPoint = (node: Node, point: Pt): Pt | null => {
  const inv = inverseAffine(node.transform ?? identity)
  return inv ? applyToPoint(inv, point) : null
}

const containsLocal = (node: Node, point: Pt): boolean => {
  const [x, y] = point
  switch (node.kind) {
    case 'circle':
      return Math.hypot(x - node.cx, y - node.cy) <= node.r
    case 'rect':
      return x >= node.x && x <= node.x + node.w && y >= node.y && y <= node.y + node.h
    case 'ellipse':
      return ((x - node.cx) / node.rx) ** 2 + ((y - node.cy) / node.ry) ** 2 <= 1
    case 'image':
      return x >= node.x && x <= node.x + node.w && y >= node.y && y <= node.y + node.h
    case 'line':
      return false
    case 'path':
      return false
    case 'text':
      return x >= node.x && y <= node.y && y >= node.y - node.size
    case 'use':
      return containsLocal(node.target, point)
    case 'group':
    case 'root':
      return false
  }
}

export function hitTest(root: Node, screenPt: Pt): Node | undefined
export function hitTest(screenPt: Pt): (root: Node) => Node | undefined
export function hitTest(
  rootOrScreenPt: Node | Pt,
  maybeScreenPt?: Pt,
): Node | undefined | ((root: Node) => Node | undefined) {
  if (arguments.length < 2) {
    const screenPt = rootOrScreenPt as Pt
    return (root: Node): Node | undefined => hitTest(root, screenPt)
  }
  const root = rootOrScreenPt as Node
  const screenPt = maybeScreenPt as Pt
  const visit = (node: Node, point: Pt): Node | undefined => {
    const local = localPoint(node, point)
    if (!local) return undefined
    if (node.kind === 'root') return visit(node.child, local)
    if (node.kind === 'group') {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const hit = visit(node.children[i], local)
        if (hit) return hit
      }
    }
    if (node.kind === 'use') return visit(node.target, local)
    return containsLocal(node, local) ? node : undefined
  }
  return visit(root, screenPt)
}

type FitBezierOptions = { readonly tolerance?: number }

export function fitBezier(points: ReadonlyArray<Pt>, opts?: FitBezierOptions): Path
export function fitBezier(opts?: FitBezierOptions): (points: ReadonlyArray<Pt>) => Path
export function fitBezier(
  pointsOrOpts: ReadonlyArray<Pt> | FitBezierOptions = {},
  maybeOpts: FitBezierOptions = {},
): Path | ((points: ReadonlyArray<Pt>) => Path) {
  if (!Array.isArray(pointsOrOpts)) {
    const opts = pointsOrOpts as FitBezierOptions
    return (points: ReadonlyArray<Pt>): Path => fitBezier(points, opts)
  }
  const points = pointsOrOpts as ReadonlyArray<Pt>
  const _opts = maybeOpts
  void _opts
  if (points.length === 0) return []
  if (points.length === 1) return [{ c: 'M', x: points[0][0], y: points[0][1] }]
  LaMat.qr(LaMat.fromArray(2, 2, [1, 0, 0, 1]))
  const first = points[0]
  const last = points[points.length - 1]
  const c1 = points[Math.max(0, Math.floor(points.length / 3))]
  const c2 = points[Math.min(points.length - 1, Math.floor((points.length * 2) / 3))]
  return [
    { c: 'M', x: first[0], y: first[1] },
    { c: 'C', x1: c1[0], y1: c1[1], x2: c2[0], y2: c2[1], x: last[0], y: last[1] },
  ]
}

export function alignToPrincipalAxis(node: Node, points: ReadonlyArray<Pt>): Node
export function alignToPrincipalAxis(points: ReadonlyArray<Pt>): (node: Node) => Node
export function alignToPrincipalAxis(
  nodeOrPoints: Node | ReadonlyArray<Pt>,
  maybePoints?: ReadonlyArray<Pt>,
): Node | ((node: Node) => Node) {
  if (arguments.length < 2) {
    const points = nodeOrPoints as ReadonlyArray<Pt>
    return (node: Node): Node => alignToPrincipalAxis(node, points)
  }
  const node = nodeOrPoints as Node
  const points = maybePoints as ReadonlyArray<Pt>
  if (points.length === 0) return node
  const cx = points.reduce((sum, point) => sum + point[0], 0) / points.length
  const cy = points.reduce((sum, point) => sum + point[1], 0) / points.length
  let xx = 0,
    xy = 0,
    yy = 0
  for (const [x, y] of points) {
    const dx = x - cx
    const dy = y - cy
    xx += dx * dx
    xy += dx * dy
    yy += dy * dy
  }
  LaMat.eigenvalues(LaMat.fromArray(2, 2, [xx, xy, xy, yy]))
  const angle = (0.5 * Math.atan2(2 * xy, xx - yy) * 180) / Math.PI
  return rotate(angle, cx, cy)(node)
}

const bakePath = (path: Path, transform: Mat): Path =>
  path.map((cmd) => {
    switch (cmd.c) {
      case 'M': {
        const [x, y] = applyToPoint(transform, [cmd.x, cmd.y])
        return { ...cmd, x, y }
      }
      case 'L': {
        const [x, y] = applyToPoint(transform, [cmd.x, cmd.y])
        return { ...cmd, x, y }
      }
      case 'C': {
        const [x1, y1] = applyToPoint(transform, [cmd.x1, cmd.y1])
        const [x2, y2] = applyToPoint(transform, [cmd.x2, cmd.y2])
        const [x, y] = applyToPoint(transform, [cmd.x, cmd.y])
        return { ...cmd, x1, y1, x2, y2, x, y }
      }
      case 'Q': {
        const [x1, y1] = applyToPoint(transform, [cmd.x1, cmd.y1])
        const [x, y] = applyToPoint(transform, [cmd.x, cmd.y])
        return { ...cmd, x1, y1, x, y }
      }
      case 'A': {
        const [x, y] = applyToPoint(transform, [cmd.x, cmd.y])
        return { ...cmd, x, y }
      }
      case 'Z':
        return cmd
    }
  })

export const bakeTransform = (node: Node): Node => {
  if (node.kind === 'path' && node.transform) {
    const { transform: _, ...rest } = node
    return { ...rest, d: bakePath(node.d, node.transform) } as Node
  }
  if (node.kind === 'group') return { ...node, children: node.children.map(bakeTransform) }
  if (node.kind === 'root') return { ...node, child: bakeTransform(node.child) }
  return node
}

export function symmetry(node: Node, n: number, step: Mat): Node
export function symmetry(n: number, step: Mat): (node: Node) => Node
export function symmetry(
  nodeOrN: Node | number,
  nOrStep: number | Mat,
  maybeStep?: Mat,
): Node | ((node: Node) => Node) {
  if (arguments.length < 3) {
    const n = nodeOrN as number
    const step = nOrStep as Mat
    return (node: Node): Node => symmetry(node, n, step)
  }
  const node = nodeOrN as Node
  const n = nOrStep as number
  const step = maybeStep as Mat
  const children: Node[] = []
  let current = identity
  for (let i = 0; i < n; i++) {
    children.push({ ...node, transform: mul(current, node.transform ?? identity) } as Node)
    current = mul(step, current)
  }
  return group(children)
}
