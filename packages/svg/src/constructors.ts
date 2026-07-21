import type { Gradient, GradientStop, Node, Pattern } from './types'

export const circle = (r: number): Node => ({ kind: 'circle', r, cx: 0, cy: 0 })
export const rect = (w: number, h: number): Node => ({ kind: 'rect', w, h, x: 0, y: 0 })
export const ellipse = (rx: number, ry: number): Node => ({ kind: 'ellipse', rx, ry, cx: 0, cy: 0 })
export const image = (href: string, w: number, h: number): Node => ({
  kind: 'image',
  href,
  w,
  h,
  x: 0,
  y: 0,
})
export const line = (x1: number, y1: number, x2: number, y2: number): Node => ({
  kind: 'line',
  x1,
  y1,
  x2,
  y2,
})
export const text = (value: string, size: number = 16): Node => ({
  kind: 'text',
  text: value,
  x: 0,
  y: 0,
  size,
})
export const group = (children: ReadonlyArray<Node>): Node => ({ kind: 'group', children })
export const use = (target: Node): Node => ({ kind: 'use', target })

export const linear = (stops: ReadonlyArray<GradientStop>, angle: number = 0): Gradient => ({
  kind: 'linear',
  stops,
  angle,
})

export const radial = (
  stops: ReadonlyArray<GradientStop>,
  opts: { cx?: number; cy?: number; r?: number } = {},
): Gradient => ({ kind: 'radial', stops, cx: opts.cx ?? 0.5, cy: opts.cy ?? 0.5, r: opts.r ?? 0.5 })

export const pattern = (child: Node, w: number, h: number): Pattern => ({
  kind: 'pattern',
  child,
  w,
  h,
})
