import { rgb } from '@stopcock/color'
import { describe, expect, it } from 'vite-plus/test'
import {
  circle,
  clip,
  ellipse,
  fill,
  filter,
  group,
  image,
  line,
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
  text,
  toClip,
  toMask,
  translate,
  use,
  viewBox,
} from '../index'
import { alignToPrincipalAxis, fitBezier, hitTest, lerpTransform, symmetry, toQuad } from '../la'
import { isNode } from '../node-guard'
import type { Mat, Pt } from '../types'

describe('@stopcock/svg dual node operations', () => {
  const node = rect(10, 20)
  const paint = rgb(0.2, 0.4, 0.6)

  it('keeps data-first and curried data-last node operators equivalent', () => {
    const clipping = toClip()(circle(4))
    const masking = toMask()(circle(5))
    const composedFilter = filter.compose([filter.blur(2)])

    expect(toClip(circle(4))).toEqual(clipping)
    expect(toMask(circle(5))).toEqual(masking)
    expect(fill(node, paint)).toEqual(fill(paint)(node))
    expect(stroke(node, paint, 2)).toEqual(stroke(paint, 2)(node))
    expect(stroke(node, paint, 2, { linecap: 'round' })).toEqual(
      stroke(paint, 2, { linecap: 'round' })(node),
    )
    expect(opacity(node, 0.5)).toEqual(opacity(0.5)(node))
    expect(translate(node, 3, 4)).toEqual(translate(3, 4)(node))
    expect(rotate(node, 30)).toEqual(rotate(30)(node))
    expect(rotate(node, 30, 5, 6)).toEqual(rotate(30, 5, 6)(node))
    expect(scale(node, 2)).toEqual(scale(2)(node))
    expect(scale(node, 2, 3)).toEqual(scale(2, 3)(node))
    expect(skewX(node, 10)).toEqual(skewX(10)(node))
    expect(skewY(node, 10)).toEqual(skewY(10)(node))
    expect(clip(node, clipping)).toEqual(clip(clipping)(node))
    expect(mask(node, masking)).toEqual(mask(masking)(node))
    expect(filter(node, composedFilter)).toEqual(filter(composedFilter)(node))
    expect(viewBox(node, 0, 0, 100, 100)).toEqual(viewBox(0, 0, 100, 100)(node))
  })

  it('keeps render options available in both lanes', () => {
    expect(render(node)).toBe(render()(node))
    expect(render(node, { pretty: true })).toBe(render({ pretty: true })(node))
  })

  it('does not confuse structurally extended configuration with node data', () => {
    const options = { pretty: true, kind: 'circle' as const }
    const paintWithNodeKind = { ...paint, kind: 'circle' as const }

    const renderWithOptions = render(options)
    const strokeWithPaint = stroke(paintWithNodeKind, 2)

    expect(renderWithOptions).toBeTypeOf('function')
    expect(renderWithOptions(node)).toBe(render(node, options))
    expect(strokeWithPaint).toBeTypeOf('function')
    expect(strokeWithPaint(node)).toEqual(stroke(node, paintWithNodeKind, 2))
  })

  it('recognizes every public node variant without accepting kind alone', () => {
    const pathNode = path.toNode(path.start(0, 0))
    const target = circle(1)
    const variants = [
      target,
      rect(1, 2),
      ellipse(1, 2),
      image('asset.png', 1, 2),
      line(0, 0, 1, 1),
      pathNode,
      text('label'),
      group([target]),
      use(target),
      viewBox(target, 0, 0, 10, 10),
    ]

    expect(variants.every(isNode)).toBe(true)
    expect(isNode({ kind: 'circle' })).toBe(false)
  })
})

describe('@stopcock/svg dual path and matrix operations', () => {
  const initial = path.start(0, 0)

  it('keeps path appenders equivalent', () => {
    expect(path.lineTo(initial, 1, 2)).toEqual(path.lineTo(1, 2)(initial))
    expect(path.curveTo(initial, 1, 2, 3, 4, 5, 6)).toEqual(path.curveTo(1, 2, 3, 4, 5, 6)(initial))
    expect(path.quadTo(initial, 1, 2, 3, 4)).toEqual(path.quadTo(1, 2, 3, 4)(initial))
    expect(path.arcTo(initial, 4, 5, true, false, 6, 7)).toEqual(
      path.arcTo(4, 5, true, false, 6, 7)(initial),
    )

    const open = path.lineTo(initial, 1, 2)
    expect(path.close(open)).toEqual(path.close()(open))
    expect(path.toNode(open)).toEqual(path.toNode()(open))
  })

  it('keeps affine multiplication equivalent', () => {
    const left: Mat = [1, 0, 0, 1, 10, 20]
    const right: Mat = [2, 0, 0, 3, 0, 0]
    expect(mul(left, right)).toEqual(mul(right)(left))
  })
})

describe('@stopcock/svg/la dual operations', () => {
  const node = rect(1, 1)
  const identity: Mat = [1, 0, 0, 1, 0, 0]
  const translated: Mat = [1, 0, 0, 1, 10, 20]
  const points: readonly Pt[] = [
    [0, 0],
    [5, 10],
    [10, 0],
  ]
  const corners: readonly [Pt, Pt, Pt, Pt] = [
    [10, 20],
    [20, 20],
    [20, 30],
    [10, 30],
  ]

  it('keeps LA helpers equivalent', () => {
    expect(lerpTransform(identity, translated, 0.5)).toEqual(
      lerpTransform(translated, 0.5)(identity),
    )
    expect(toQuad(node, corners)).toEqual(toQuad(corners)(node))
    expect(fitBezier(points, { tolerance: 0.1 })).toEqual(fitBezier({ tolerance: 0.1 })(points))
    expect(alignToPrincipalAxis(node, points)).toEqual(alignToPrincipalAxis(points)(node))
    expect(symmetry(node, 3, translated)).toEqual(symmetry(3, translated)(node))
  })

  it('keeps hit testing equivalent', () => {
    const target = translate(circle(5), 10, 0)
    expect(hitTest(target, [10, 0])).toBe(hitTest([10, 0])(target))
  })
})
