import { describe, expect, it } from 'vite-plus/test'
import { rgb } from '@stopcock/color'
import {
  circle,
  fill,
  filter,
  group,
  image,
  linear,
  path,
  rect,
  render,
  rotate,
  stroke,
  translate,
  use,
  viewBox,
} from '../index'
import {
  alignToPrincipalAxis,
  bakeTransform,
  fitBezier,
  hitTest,
  lerpTransform,
  symmetry,
  toQuad,
} from '../la'

describe('@stopcock/svg render', () => {
  it('renders shapes, fills, strokes, transforms, and a root viewBox', () => {
    const doc = viewBox(
      0,
      0,
      100,
      100,
    )(stroke(rgb(0, 0, 0), 2)(fill(rgb(1, 0, 0))(translate(10, 20)(circle(5)))))
    const svg = render(doc)
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 100 100"')
    expect(svg).toContain('<circle')
    expect(svg).toContain('fill="oklch(')
    expect(svg).toContain('stroke-width="2"')
    expect(svg).toContain('transform="matrix(1 0 0 1 10 20)"')
  })

  it('escapes text content', () => {
    const svg = render(fill(rgb(0, 0, 0))({ kind: 'text', text: '<hello&"', x: 0, y: 0, size: 12 }))
    expect(svg).toContain('&lt;hello&amp;&quot;')
  })

  it('renders path command sequences', () => {
    const d = path.close()(path.lineTo(10, 10)(path.lineTo(10, 0)(path.start(0, 0))))
    const node = path.toNode()(d)
    expect(render(node)).toContain('d="M 0 0 L 10 0 L 10 10 Z"')
  })

  it('renders image nodes for pattern-backed documents', () => {
    const svg = render(image('data:image/png;base64,abc', 32, 16))
    expect(svg).toContain('<image')
    expect(svg).toContain('href="data:image/png;base64,abc"')
    expect(svg).toContain('width="32"')
  })

  it('hoists gradients and symbols by reference equality', () => {
    const grad = linear([
      { offset: 0, color: rgb(1, 0, 0) },
      { offset: 1, color: rgb(0, 0, 1) },
    ])
    const target = fill(grad)(rect(10, 10))
    const svg = render(viewBox(0, 0, 20, 20)(group([target, use(target), fill(grad)(circle(4))])))
    expect(svg.match(/<linearGradient/g)?.length).toBe(1)
    expect(svg.match(/url\(#_g0\)/g)?.length).toBe(3)
    expect(svg.match(/<symbol/g)?.length).toBe(1)
    expect(svg).toContain('href="#_s0"')
  })

  it('renders filter definitions', () => {
    const matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] as const
    const f = filter.compose([filter.blur(2), filter.colorMatrix(matrix)])
    const svg = render(filter(f)(rect(10, 10)))
    expect(svg).toContain('<filter id="_f0">')
    expect(svg).toContain('<feGaussianBlur stdDeviation="2" />')
    expect(svg).toContain('<feColorMatrix')
    expect(svg).toContain('filter="url(#_f0)"')
  })

  it('composes transforms with the most recent operator wrapping earlier ones', () => {
    const node = rotate(90)(translate(10, 0)(rect(1, 1)))
    expect(render(node)).toContain('transform="matrix(0 1 -1 0 0 10)"')
  })
})

describe('@stopcock/svg/la', () => {
  it('lerps transforms', () => {
    expect(lerpTransform([1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 10, 20], 0.5)).toEqual([
      1, 0, -0, 1, 5, 10,
    ])
  })

  it('toQuad maps a unit shape into an affine quad', () => {
    const warped = toQuad([
      [10, 20],
      [20, 20],
      [20, 30],
      [10, 30],
    ])(rect(1, 1))
    expect(warped.transform).toEqual([10, 0, 0, 10, 10, 20])
  })

  it('hitTest finds transformed shapes', () => {
    const node = translate(10, 0)(circle(5))
    expect(hitTest(node, [10, 0])).toBe(node)
  })

  it('fitBezier returns a cubic path', () => {
    expect(
      fitBezier([
        [0, 0],
        [5, 10],
        [10, 0],
      ])[1]?.c,
    ).toBe('C')
  })

  it('aligns to a principal axis', () => {
    expect(
      alignToPrincipalAxis(rect(1, 1), [
        [0, 0],
        [10, 0],
      ]).transform,
    ).toBeDefined()
  })

  it('bakes path transforms into path coordinates', () => {
    const node = translate(10, 0)(path.toNode()(path.lineTo(1, 0)(path.start(0, 0))))
    const baked = bakeTransform(node)
    expect(baked.transform).toBeUndefined()
    expect(baked.kind === 'path' ? baked.d[0] : undefined).toEqual({ c: 'M', x: 10, y: 0 })
  })

  it('builds symmetry groups', () => {
    const result = symmetry(rect(1, 1), 3, [1, 0, 0, 1, 10, 0])
    expect(result.kind).toBe('group')
    expect(result.kind === 'group' ? result.children.length : 0).toBe(3)
  })
})
