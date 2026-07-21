import type { Node, Path } from './types'

export const start = (x: number, y: number): Path => [{ c: 'M', x, y }]
export const lineTo =
  (x: number, y: number) =>
  (path: Path): Path => [...path, { c: 'L', x, y }]
export const curveTo =
  (x1: number, y1: number, x2: number, y2: number, x: number, y: number) =>
  (path: Path): Path => [...path, { c: 'C', x1, y1, x2, y2, x, y }]
export const quadTo =
  (x1: number, y1: number, x: number, y: number) =>
  (path: Path): Path => [...path, { c: 'Q', x1, y1, x, y }]
export const arcTo =
  (rx: number, ry: number, large: boolean, sweep: boolean, x: number, y: number) =>
  (path: Path): Path => [...path, { c: 'A', rx, ry, large, sweep, x, y }]
export const close =
  () =>
  (path: Path): Path => [...path, { c: 'Z' }]
export const toNode =
  () =>
  (d: Path): Node => ({ kind: 'path', d })

export const path = { start, lineTo, curveTo, quadTo, arcTo, close, toNode }
