import { toCSS } from '@stopcock/color'
import type { Color } from '@stopcock/color'
import type { ClipPath, Filter, Gradient, Mask, Node, Paint, Path, Pattern, Stroke } from './types'
import { isIdentity } from './matrix'

type Defs = {
  gradients: Map<Gradient, string>
  patterns: Map<Pattern, string>
  clips: Map<ClipPath, string>
  masks: Map<Mask, string>
  filters: Map<Filter, string>
  symbols: Map<Node, string>
}

const makeDefs = (): Defs => ({
  gradients: new Map(),
  patterns: new Map(),
  clips: new Map(),
  masks: new Map(),
  filters: new Map(),
  symbols: new Map(),
})

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const num = (value: number, fractionDigits: number = 6): string => {
  if (!Number.isFinite(value)) return '0'
  return String(Number(value.toFixed(fractionDigits)))
}

const mat = (m: readonly [number, number, number, number, number, number]): string =>
  `matrix(${m.map((v) => num(v)).join(' ')})`

const ensure = <T extends object>(map: Map<T, string>, value: T, prefix: string): string => {
  const cached = map.get(value)
  if (cached) return cached
  const id = `_${prefix}${map.size}`
  map.set(value, id)
  return id
}

const isColor = (paint: Paint): paint is Color =>
  typeof paint === 'object' && paint !== null && 'space' in paint && 'channels' in paint

const isGradient = (paint: Paint): paint is Gradient =>
  typeof paint === 'object' && paint !== null && 'kind' in paint && (paint.kind === 'linear' || paint.kind === 'radial')

const collectPaint = (paint: Paint | undefined, defs: Defs): void => {
  if (!paint || paint === 'none' || isColor(paint)) return
  if (isGradient(paint)) ensure(defs.gradients, paint, 'g')
  else {
    ensure(defs.patterns, paint, 'p')
    collectNode(paint.child, defs)
  }
}

const collectCommon = (node: Node, defs: Defs): void => {
  collectPaint(node.fill, defs)
  collectPaint(node.stroke?.paint, defs)
  if (node.clip) {
    ensure(defs.clips, node.clip, 'c')
    collectNode(node.clip.child, defs)
  }
  if (node.mask) {
    ensure(defs.masks, node.mask, 'm')
    collectNode(node.mask.child, defs)
  }
  if (node.filter) ensure(defs.filters, node.filter, 'f')
}

const collectNode = (node: Node, defs: Defs): void => {
  collectCommon(node, defs)
  if (node.kind === 'group') for (const child of node.children) collectNode(child, defs)
  if (node.kind === 'root') collectNode(node.child, defs)
  if (node.kind === 'use') {
    ensure(defs.symbols, node.target, 's')
    collectNode(node.target, defs)
  }
}

const renderPaint = (paint: Paint | undefined, defs: Defs): string | undefined => {
  if (!paint) return undefined
  if (paint === 'none') return 'none'
  if (isColor(paint)) return toCSS(paint as any)
  if (isGradient(paint)) return `url(#${ensure(defs.gradients, paint, 'g')})`
  return `url(#${ensure(defs.patterns, paint as Pattern, 'p')})`
}

const attrs = (entries: Array<[string, string | number | undefined]>): string => {
  const rendered = entries
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${key}="${esc(String(value))}"`)
  return rendered.length > 0 ? ` ${rendered.join(' ')}` : ''
}

const commonAttrs = (node: Node, defs: Defs): string => {
  const stroke = node.stroke
  const strokeAttrs = stroke ? renderStroke(stroke, defs) : []
  return attrs([
    ['fill', renderPaint(node.fill, defs)],
    ...strokeAttrs,
    ['opacity', node.opacity === undefined ? undefined : num(node.opacity)],
    ['transform', isIdentity(node.transform) ? undefined : mat(node.transform!)],
    ['clip-path', node.clip ? `url(#${ensure(defs.clips, node.clip, 'c')})` : undefined],
    ['mask', node.mask ? `url(#${ensure(defs.masks, node.mask, 'm')})` : undefined],
    ['filter', node.filter ? `url(#${ensure(defs.filters, node.filter, 'f')})` : undefined],
  ])
}

const renderStroke = (stroke: Stroke, defs: Defs): Array<[string, string | number | undefined]> => [
  ['stroke', renderPaint(stroke.paint, defs)],
  ['stroke-width', num(stroke.width)],
  ['stroke-dasharray', stroke.dash?.map((value) => num(value)).join(' ')],
  ['stroke-linecap', stroke.linecap],
  ['stroke-linejoin', stroke.linejoin],
]

const renderPathData = (path: Path): string => path.map((cmd) => {
  switch (cmd.c) {
    case 'M': return `M ${num(cmd.x)} ${num(cmd.y)}`
    case 'L': return `L ${num(cmd.x)} ${num(cmd.y)}`
    case 'C': return `C ${num(cmd.x1)} ${num(cmd.y1)} ${num(cmd.x2)} ${num(cmd.y2)} ${num(cmd.x)} ${num(cmd.y)}`
    case 'Q': return `Q ${num(cmd.x1)} ${num(cmd.y1)} ${num(cmd.x)} ${num(cmd.y)}`
    case 'A': return `A ${num(cmd.rx)} ${num(cmd.ry)} 0 ${cmd.large ? 1 : 0} ${cmd.sweep ? 1 : 0} ${num(cmd.x)} ${num(cmd.y)}`
    case 'Z': return 'Z'
  }
}).join(' ')

const renderNode = (node: Node, defs: Defs): string => {
  switch (node.kind) {
    case 'circle':
      return `<circle${attrs([['r', num(node.r)], ['cx', num(node.cx)], ['cy', num(node.cy)]])}${commonAttrs(node, defs)} />`
    case 'rect':
      return `<rect${attrs([['width', num(node.w)], ['height', num(node.h)], ['x', num(node.x)], ['y', num(node.y)], ['rx', node.rx === undefined ? undefined : num(node.rx)], ['ry', node.ry === undefined ? undefined : num(node.ry)]])}${commonAttrs(node, defs)} />`
    case 'ellipse':
      return `<ellipse${attrs([['rx', num(node.rx)], ['ry', num(node.ry)], ['cx', num(node.cx)], ['cy', num(node.cy)]])}${commonAttrs(node, defs)} />`
    case 'image':
      return `<image${attrs([['href', node.href], ['width', num(node.w)], ['height', num(node.h)], ['x', num(node.x)], ['y', num(node.y)]])}${commonAttrs(node, defs)} />`
    case 'line':
      return `<line${attrs([['x1', num(node.x1)], ['y1', num(node.y1)], ['x2', num(node.x2)], ['y2', num(node.y2)]])}${commonAttrs(node, defs)} />`
    case 'path':
      return `<path${attrs([['d', renderPathData(node.d)]])}${commonAttrs(node, defs)} />`
    case 'text':
      return `<text${attrs([['x', num(node.x)], ['y', num(node.y)], ['font-size', num(node.size)], ['font-family', node.family]])}${commonAttrs(node, defs)}>${esc(node.text)}</text>`
    case 'group':
      return `<g${commonAttrs(node, defs)}>${node.children.map((child) => renderNode(child, defs)).join('')}</g>`
    case 'use':
      return `<use${attrs([['href', `#${ensure(defs.symbols, node.target, 's')}`]])}${commonAttrs(node, defs)} />`
    case 'root':
      return renderRoot(node, defs)
  }
}

const gradientVector = (angle: number): [number, number, number, number] => {
  const rad = (angle * Math.PI) / 180
  const x = Math.cos(rad) / 2
  const y = Math.sin(rad) / 2
  return [0.5 - x, 0.5 - y, 0.5 + x, 0.5 + y]
}

const renderStops = (gradient: Gradient): string => gradient.stops.map((stop) =>
  `<stop${attrs([
    ['offset', stop.offset <= 1 ? `${num(stop.offset * 100)}%` : num(stop.offset)],
    ['stop-color', toCSS(stop.color)],
    ['stop-opacity', stop.opacity === undefined ? undefined : num(stop.opacity)],
  ])} />`
).join('')

const renderGradient = (gradient: Gradient, id: string): string => {
  if (gradient.kind === 'linear') {
    const [x1, y1, x2, y2] = gradientVector(gradient.angle)
    return `<linearGradient${attrs([
      ['id', id],
      ['x1', num(x1)],
      ['y1', num(y1)],
      ['x2', num(x2)],
      ['y2', num(y2)],
      ['gradientTransform', gradient.transform ? mat(gradient.transform) : undefined],
    ])}>${renderStops(gradient)}</linearGradient>`
  }
  return `<radialGradient${attrs([
    ['id', id],
    ['cx', num(gradient.cx)],
    ['cy', num(gradient.cy)],
    ['r', num(gradient.r)],
    ['gradientTransform', gradient.transform ? mat(gradient.transform) : undefined],
  ])}>${renderStops(gradient)}</radialGradient>`
}

const renderPattern = (pattern: Pattern, id: string, defs: Defs): string =>
  `<pattern${attrs([
    ['id', id],
    ['width', num(pattern.w)],
    ['height', num(pattern.h)],
    ['patternUnits', 'userSpaceOnUse'],
    ['patternTransform', pattern.transform ? mat(pattern.transform) : undefined],
  ])}>${renderNode(pattern.child, defs)}</pattern>`

const renderFilterStage = (stage: Filter['stages'][number]): string => {
  if (stage.kind === 'blur') return `<feGaussianBlur${attrs([['stdDeviation', num(stage.stdDev)]])} />`
  if (stage.values.length !== 20) throw new Error(`Color matrix must contain 20 values, got ${stage.values.length}`)
  return `<feColorMatrix${attrs([
    ['type', 'matrix'],
    ['values', Array.from(stage.values).map((value) => num(value)).join(' ')],
  ])} />`
}

const renderDefs = (defs: Defs): string => {
  const parts: string[] = []
  for (const [gradient, id] of defs.gradients) parts.push(renderGradient(gradient, id))
  for (const [pattern, id] of defs.patterns) parts.push(renderPattern(pattern, id, defs))
  for (const [clip, id] of defs.clips) parts.push(`<clipPath${attrs([['id', id]])}>${renderNode(clip.child, defs)}</clipPath>`)
  for (const [mask, id] of defs.masks) parts.push(`<mask${attrs([['id', id]])}>${renderNode(mask.child, defs)}</mask>`)
  for (const [filter, id] of defs.filters) parts.push(`<filter${attrs([['id', id]])}>${filter.stages.map(renderFilterStage).join('')}</filter>`)
  for (const [symbol, id] of defs.symbols) parts.push(`<symbol${attrs([['id', id]])}>${renderNode(symbol, defs)}</symbol>`)
  return parts.length > 0 ? `<defs>${parts.join('')}</defs>` : ''
}

const renderRoot = (node: Extract<Node, { kind: 'root' }>, defs: Defs): string =>
  `<svg${attrs([
    ['xmlns', 'http://www.w3.org/2000/svg'],
    ['viewBox', node.viewBox.map((value) => num(value)).join(' ')],
  ])}>${renderDefs(defs)}${renderNode(node.child, defs)}</svg>`

export const render = (node: Node, _opts: { pretty?: boolean } = {}): string => {
  const root = node.kind === 'root' ? node : ({ kind: 'root', child: node, viewBox: [0, 0, 100, 100] } as Node)
  const defs = makeDefs()
  collectNode(root, defs)
  return renderNode(root, defs)
}

export const renderPath = renderPathData
