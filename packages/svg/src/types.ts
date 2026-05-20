import type { Color } from '@stopcock/color'

export type Mat = readonly [number, number, number, number, number, number]
export type Pt = readonly [number, number]

export type GradientStop = { offset: number; color: Color; opacity?: number }
export type Gradient =
  | { kind: 'linear'; stops: ReadonlyArray<GradientStop>; angle: number; transform?: Mat }
  | { kind: 'radial'; stops: ReadonlyArray<GradientStop>; cx: number; cy: number; r: number; transform?: Mat }

export type Pattern = { kind: 'pattern'; child: Node; w: number; h: number; transform?: Mat }
export type Paint = Color | Gradient | Pattern | 'none'

export type Stroke = {
  paint: Paint
  width: number
  dash?: ReadonlyArray<number>
  linecap?: 'butt' | 'round' | 'square'
  linejoin?: 'miter' | 'round' | 'bevel'
}

export type ClipPath = { kind: 'clip'; child: Node }
export type Mask = { kind: 'mask'; child: Node }

export type ColorMatrix4x5 = readonly [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
]

export type FilterStage =
  | { kind: 'blur'; stdDev: number }
  | { kind: 'colorMatrix'; values: ColorMatrix4x5 | Float64Array | ReadonlyArray<number> }

export type Filter = { kind: 'filter'; stages: ReadonlyArray<FilterStage> }

export type PathCmd =
  | { c: 'M'; x: number; y: number }
  | { c: 'L'; x: number; y: number }
  | { c: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: 'Q'; x1: number; y1: number; x: number; y: number }
  | { c: 'A'; rx: number; ry: number; large: boolean; sweep: boolean; x: number; y: number }
  | { c: 'Z' }
export type Path = ReadonlyArray<PathCmd>

export type Common = {
  fill?: Paint
  stroke?: Stroke
  transform?: Mat
  opacity?: number
  clip?: ClipPath
  mask?: Mask
  filter?: Filter
}

export type Node = Common & (
  | { kind: 'circle'; r: number; cx: number; cy: number }
  | { kind: 'rect'; w: number; h: number; x: number; y: number; rx?: number; ry?: number }
  | { kind: 'ellipse'; rx: number; ry: number; cx: number; cy: number }
  | { kind: 'image'; href: string; w: number; h: number; x: number; y: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'path'; d: Path }
  | { kind: 'text'; text: string; x: number; y: number; size: number; family?: string }
  | { kind: 'group'; children: ReadonlyArray<Node> }
  | { kind: 'use'; target: Node }
  | { kind: 'root'; child: Node; viewBox: readonly [number, number, number, number] }
)
