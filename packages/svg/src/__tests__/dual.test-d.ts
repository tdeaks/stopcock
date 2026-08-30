import { rgb } from '@stopcock/color'
import { expectTypeOf, test } from 'vite-plus/test'
import {
  circle,
  clip,
  fill,
  filter,
  mask,
  mul,
  opacity,
  path,
  rect,
  render,
  rotate,
  scale,
  skewX,
  skewY,
  stroke,
  toClip,
  toMask,
  translate,
  viewBox,
} from '../index'
import { alignToPrincipalAxis, fitBezier, hitTest, lerpTransform, symmetry, toQuad } from '../la'
import type { ClipPath, Filter, Mask, Mat, Node, Path, Pt } from '../types'

declare const node: Node
declare const matrixA: Mat
declare const matrixB: Mat
declare const point: Pt
declare const points: ReadonlyArray<Pt>
declare const corners: readonly [Pt, Pt, Pt, Pt]
declare const pathValue: Path

test('node operations expose data-first and curried data-last overloads', () => {
  const paint = rgb(0.2, 0.4, 0.6)
  const paintWithNodeKind = { ...paint, kind: 'circle' as const }
  const clipping = toClip()(circle(2))
  const masking = toMask()(circle(2))
  const composedFilter = filter.compose([filter.blur(2)])

  expectTypeOf(toClip(node)).toEqualTypeOf<ClipPath>()
  expectTypeOf(toClip()).toEqualTypeOf<(node: Node) => ClipPath>()
  expectTypeOf(toMask(node)).toEqualTypeOf<Mask>()
  expectTypeOf(toMask()).toEqualTypeOf<(node: Node) => Mask>()
  expectTypeOf(fill(node, paint)).toEqualTypeOf<Node>()
  expectTypeOf(fill(paint)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(stroke(node, paint, 2)).toEqualTypeOf<Node>()
  expectTypeOf(stroke(paint, 2)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(stroke(paintWithNodeKind, 2)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(stroke(node, paint, 2, { linejoin: 'round' })).toEqualTypeOf<Node>()
  expectTypeOf(stroke(paint, 2, { linejoin: 'round' })).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(opacity(node, 0.5)).toEqualTypeOf<Node>()
  expectTypeOf(opacity(0.5)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(translate(node, 1, 2)).toEqualTypeOf<Node>()
  expectTypeOf(translate(1, 2)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(rotate(node, 30, 5, 6)).toEqualTypeOf<Node>()
  expectTypeOf(rotate(30, 5, 6)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(scale(node, 2, 3)).toEqualTypeOf<Node>()
  expectTypeOf(scale(2, 3)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(skewX(node, 10)).toEqualTypeOf<Node>()
  expectTypeOf(skewX(10)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(skewY(node, 10)).toEqualTypeOf<Node>()
  expectTypeOf(skewY(10)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(clip(node, clipping)).toEqualTypeOf<Node>()
  expectTypeOf(clip(clipping)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(mask(node, masking)).toEqualTypeOf<Node>()
  expectTypeOf(mask(masking)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(filter(node, composedFilter)).toEqualTypeOf<Node>()
  expectTypeOf(filter(composedFilter)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(filter.blur(2)).toEqualTypeOf<Filter>()
  expectTypeOf(viewBox(node, 0, 0, 100, 100)).toEqualTypeOf<Node>()
  expectTypeOf(viewBox(0, 0, 100, 100)).toEqualTypeOf<(node: Node) => Node>()
})

test('path, matrix, and rendering operations expose both lanes', () => {
  const optionsWithNodeKind = { pretty: true, kind: 'circle' as const }

  expectTypeOf(path.lineTo(pathValue, 1, 2)).toEqualTypeOf<Path>()
  expectTypeOf(path.lineTo(1, 2)).toEqualTypeOf<(path: Path) => Path>()
  expectTypeOf(path.curveTo(pathValue, 1, 2, 3, 4, 5, 6)).toEqualTypeOf<Path>()
  expectTypeOf(path.curveTo(1, 2, 3, 4, 5, 6)).toEqualTypeOf<(path: Path) => Path>()
  expectTypeOf(path.quadTo(pathValue, 1, 2, 3, 4)).toEqualTypeOf<Path>()
  expectTypeOf(path.quadTo(1, 2, 3, 4)).toEqualTypeOf<(path: Path) => Path>()
  expectTypeOf(path.arcTo(pathValue, 1, 2, true, false, 3, 4)).toEqualTypeOf<Path>()
  expectTypeOf(path.arcTo(1, 2, true, false, 3, 4)).toEqualTypeOf<(path: Path) => Path>()
  expectTypeOf(path.close(pathValue)).toEqualTypeOf<Path>()
  expectTypeOf(path.close()).toEqualTypeOf<(path: Path) => Path>()
  expectTypeOf(path.toNode(pathValue)).toEqualTypeOf<Node>()
  expectTypeOf(path.toNode()).toEqualTypeOf<(path: Path) => Node>()
  expectTypeOf(mul(matrixA, matrixB)).toEqualTypeOf<Mat>()
  expectTypeOf(mul(matrixB)).toEqualTypeOf<(a: Mat) => Mat>()
  expectTypeOf(render(node)).toEqualTypeOf<string>()
  expectTypeOf(render(node, { pretty: true })).toEqualTypeOf<string>()
  expectTypeOf(render()).toEqualTypeOf<(node: Node) => string>()
  expectTypeOf(render({ pretty: true })).toEqualTypeOf<(node: Node) => string>()
  expectTypeOf(render(optionsWithNodeKind)).toEqualTypeOf<(node: Node) => string>()
})

test('linear-algebra helpers expose both lanes', () => {
  expectTypeOf(lerpTransform(matrixA, matrixB, 0.5)).toEqualTypeOf<Mat>()
  expectTypeOf(lerpTransform(matrixB, 0.5)).toEqualTypeOf<(a: Mat) => Mat>()
  expectTypeOf(toQuad(node, corners)).toEqualTypeOf<Node>()
  expectTypeOf(toQuad(corners)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(hitTest(node, point)).toEqualTypeOf<Node | undefined>()
  expectTypeOf(hitTest(point)).toEqualTypeOf<(root: Node) => Node | undefined>()
  expectTypeOf(fitBezier(points)).toEqualTypeOf<Path>()
  expectTypeOf(fitBezier(points, { tolerance: 0.1 })).toEqualTypeOf<Path>()
  expectTypeOf(fitBezier()).toEqualTypeOf<(points: ReadonlyArray<Pt>) => Path>()
  expectTypeOf(fitBezier({ tolerance: 0.1 })).toEqualTypeOf<(points: ReadonlyArray<Pt>) => Path>()
  expectTypeOf(alignToPrincipalAxis(node, points)).toEqualTypeOf<Node>()
  expectTypeOf(alignToPrincipalAxis(points)).toEqualTypeOf<(node: Node) => Node>()
  expectTypeOf(symmetry(node, 3, matrixA)).toEqualTypeOf<Node>()
  expectTypeOf(symmetry(3, matrixA)).toEqualTypeOf<(node: Node) => Node>()
})

test('constructors remain direct and shape-confused calls are rejected', () => {
  expectTypeOf(rect(10, 20)).toEqualTypeOf<Node>()

  // @ts-expect-error a node is data, not fill configuration
  fill(node)
  // @ts-expect-error path data cannot occupy lineTo's numeric configuration slot
  path.lineTo(path.start(0, 0), 1)
  // @ts-expect-error symmetry's data-last form requires both configuration arguments
  symmetry(3)
})
