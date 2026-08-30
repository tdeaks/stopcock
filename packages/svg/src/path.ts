import type { Node, Path } from './types'

export const start = (x: number, y: number): Path => [{ c: 'M', x, y }]
export function lineTo(path: Path, x: number, y: number): Path
export function lineTo(x: number, y: number): (path: Path) => Path
export function lineTo(
  pathOrX: Path | number,
  xOrY: number,
  maybeY?: number,
): Path | ((path: Path) => Path) {
  if (arguments.length >= 3) return lineTo(xOrY, maybeY as number)(pathOrX as Path)
  const x = pathOrX as number
  const y = xOrY
  return (path: Path): Path => [...path, { c: 'L', x, y }]
}

export function curveTo(
  path: Path,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number,
): Path
export function curveTo(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number,
): (path: Path) => Path
export function curveTo(
  pathOrX1: Path | number,
  x1OrY1: number,
  y1OrX2: number,
  x2OrY2: number,
  y2OrX: number,
  xOrY: number,
  maybeY?: number,
): Path | ((path: Path) => Path) {
  if (arguments.length >= 7) {
    return curveTo(x1OrY1, y1OrX2, x2OrY2, y2OrX, xOrY, maybeY as number)(pathOrX1 as Path)
  }
  const x1 = pathOrX1 as number
  const y1 = x1OrY1
  const x2 = y1OrX2
  const y2 = x2OrY2
  const x = y2OrX
  const y = xOrY
  return (path: Path): Path => [...path, { c: 'C', x1, y1, x2, y2, x, y }]
}

export function quadTo(path: Path, x1: number, y1: number, x: number, y: number): Path
export function quadTo(x1: number, y1: number, x: number, y: number): (path: Path) => Path
export function quadTo(
  pathOrX1: Path | number,
  x1OrY1: number,
  y1OrX: number,
  xOrY: number,
  maybeY?: number,
): Path | ((path: Path) => Path) {
  if (arguments.length >= 5) {
    return quadTo(x1OrY1, y1OrX, xOrY, maybeY as number)(pathOrX1 as Path)
  }
  const x1 = pathOrX1 as number
  const y1 = x1OrY1
  const x = y1OrX
  const y = xOrY
  return (path: Path): Path => [...path, { c: 'Q', x1, y1, x, y }]
}

export function arcTo(
  path: Path,
  rx: number,
  ry: number,
  large: boolean,
  sweep: boolean,
  x: number,
  y: number,
): Path
export function arcTo(
  rx: number,
  ry: number,
  large: boolean,
  sweep: boolean,
  x: number,
  y: number,
): (path: Path) => Path
export function arcTo(
  pathOrRx: Path | number,
  rxOrRy: number,
  ryOrLarge: number | boolean,
  largeOrSweep: boolean,
  sweepOrX: boolean | number,
  xOrY: number,
  maybeY?: number,
): Path | ((path: Path) => Path) {
  if (arguments.length >= 7) {
    return arcTo(
      rxOrRy,
      ryOrLarge as number,
      largeOrSweep,
      sweepOrX as boolean,
      xOrY,
      maybeY as number,
    )(pathOrRx as Path)
  }
  const rx = pathOrRx as number
  const ry = rxOrRy
  const large = ryOrLarge as boolean
  const sweep = largeOrSweep
  const x = sweepOrX as number
  const y = xOrY
  return (path: Path): Path => [...path, { c: 'A', rx, ry, large, sweep, x, y }]
}

export function close(path: Path): Path
export function close(): (path: Path) => Path
export function close(path?: Path): Path | ((path: Path) => Path) {
  if (arguments.length === 0) return (source: Path): Path => close(source)
  return [...(path as Path), { c: 'Z' }]
}

export function toNode(d: Path): Node
export function toNode(): (d: Path) => Node
export function toNode(d?: Path): Node | ((d: Path) => Node) {
  if (arguments.length === 0) return (path: Path): Node => toNode(path)
  return { kind: 'path', d: d as Path }
}

export const path = { start, lineTo, curveTo, quadTo, arcTo, close, toNode }
