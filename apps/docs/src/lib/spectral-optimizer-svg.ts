import {
  circle,
  fill,
  group,
  line,
  opacity,
  path,
  rect,
  render,
  rotate,
  stroke,
  text,
  translate,
  viewBox,
} from '@stopcock/svg'
import { fromHex } from '@stopcock/color'
import type { SpectralPalette } from './spectral-optimizer'

export type SpectrumPathUpdate = {
  modelD: string
  realD: string
  targetRects: Array<{ x: number; y: number; width: number; height: number }>
}

export type HistoryFrame = {
  step: number
  params: ArrayLike<number>
  loss: number
  gradMag?: ArrayLike<number>
}

export type SpectrogramPool = {
  writeColumn(mags: ArrayLike<number>): void
  reset(): void
}

export type AudioStats = {
  centroid: number
  rolloff: number
  flatness: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function paint(hex: string) {
  return fromHex(hex)
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char))
}

function pointsFor(values: ArrayLike<number>, width: number, height: number, pad = 18) {
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  return Array.from({ length: values.length }, (_, i) => {
    const t = values.length === 1 ? 0 : i / (values.length - 1)
    return {
      x: pad + t * innerW,
      y: pad + (1 - clamp01(Number(values[i] ?? 0))) * innerH,
    }
  })
}

function smoothPath(values: ArrayLike<number>, width: number, height: number): string {
  const pts = pointsFor(values, width, height)
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

export function makeSpectrumPaths(
  target: ArrayLike<number>,
  modelMag: ArrayLike<number>,
  realMag: ArrayLike<number>,
  size: { width?: number; height?: number } = {},
): SpectrumPathUpdate {
  const width = size.width ?? 920
  const height = size.height ?? 330
  const pad = 18
  const binW = (width - pad * 2) / target.length
  return {
    modelD: smoothPath(modelMag, width, height),
    realD: smoothPath(realMag, width, height),
    targetRects: Array.from({ length: target.length }, (_, i) => {
      const value = clamp01(Number(target[i] ?? 0))
      const rectH = value * (height - pad * 2)
      return {
        x: pad + i * binW + binW * 0.16,
        y: height - pad - rectH,
        width: binW * 0.68,
        height: rectH,
      }
    }),
  }
}

export function makeFingerprint(history: readonly HistoryFrame[], palette: SpectralPalette, opts: { size?: number } = {}): string {
  const size = opts.size ?? 520
  const cx = size / 2
  const cy = size / 2
  const maxRadius = size * 0.45
  const minRadius = size * 0.1
  const safeHistory = history.length > 0 ? history : [{ step: 0, params: [], loss: 1 }]
  const rings = safeHistory.map((frame, index) => {
    const t = safeHistory.length === 1 ? 1 : index / (safeHistory.length - 1)
    const radius = minRadius + t * (maxRadius - minRadius)
    const params = Array.from(frame.params)
    const grad = Array.from(frame.gradMag ?? params)
    const sectors = Math.max(1, params.length)
    let d = ''
    for (let i = 0; i < sectors; i++) {
      const value = clamp01(Number(params[i] ?? 0))
      const start = ((i / sectors) * Math.PI * 2) - Math.PI / 2
      const end = start + ((0.18 + value * 0.78) / sectors) * Math.PI * 2
      const x1 = cx + Math.cos(start) * radius
      const y1 = cy + Math.sin(start) * radius
      const x2 = cx + Math.cos(end) * radius
      const y2 = cy + Math.sin(end) * radius
      d += `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} `
    }
    const attention = Math.min(1, Math.hypot(...grad.map(Number)) / 5)
    const color = attention > 0.58 ? palette.hot : attention > 0.25 ? palette.accent : palette.cool
    return `<path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="${Math.max(0.7, 3.5 - t * 2.4).toFixed(2)}" opacity="${(0.18 + t * 0.72).toFixed(3)}" stroke-linecap="round"/>`
  }).join('')
  const final = safeHistory[safeHistory.length - 1]
  const ticks = Array.from(final.params).slice(0, 8).map((value, index) => {
    const angle = index * 45
    const len = 18 + clamp01(Number(value)) * 58
    return render(rotate(angle, cx, cy)(stroke(paint(palette.accent), 2.2, { linecap: 'round' })(line(cx, cy - 18, cx, cy - len))))
  }).join('')

  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Optimization trajectory fingerprint">
    <rect width="${size}" height="${size}" fill="${palette.bg}"/>
    <circle cx="${cx}" cy="${cy}" r="${maxRadius}" fill="none" stroke="${palette.muted}" stroke-opacity=".32"/>
    ${rings}
    ${ticks}
    <circle cx="${cx}" cy="${cy}" r="${minRadius * 0.62}" fill="${palette.bg}" stroke="${palette.cool}" stroke-width="2"/>
  </svg>`
}

export function makeSpectrogramPool(svgEl: SVGSVGElement, cols = 64, rows = 128, palette: readonly string[] = defaultSpectrogramPalette()): SpectrogramPool {
  svgEl.replaceChildren()
  svgEl.setAttribute('viewBox', `0 0 ${cols} ${rows}`)
  const rects: SVGRectElement[][] = []
  for (let x = 0; x < cols; x++) {
    const column: SVGRectElement[] = []
    for (let y = 0; y < rows; y++) {
      const cell = document.createElementNS(SVG_NS, 'rect')
      cell.setAttribute('x', String(x))
      cell.setAttribute('y', String(rows - y - 1))
      cell.setAttribute('width', '1')
      cell.setAttribute('height', '1')
      cell.setAttribute('fill', palette[0])
      svgEl.append(cell)
      column.push(cell)
    }
    rects.push(column)
  }
  let columnIndex = 0
  return {
    writeColumn(mags) {
      const column = rects[columnIndex]
      for (let y = 0; y < rows; y++) {
        const source = Math.min(mags.length - 1, Math.floor((y / rows) * mags.length))
        const value = clamp01(Number(mags[source] ?? 0))
        column[y].setAttribute('fill', palette[Math.min(palette.length - 1, Math.floor(value * (palette.length - 1)))])
      }
      columnIndex = (columnIndex + 1) % cols
    },
    reset() {
      for (const column of rects) for (const cell of column) cell.setAttribute('fill', palette[0])
      columnIndex = 0
    },
  }
}

export function makeLandscape(
  grid: ArrayLike<number>,
  trajectory: ReadonlyArray<ArrayLike<number>>,
  palette: SpectralPalette,
  opts: { cols?: number; rows?: number; size?: number } = {},
): string {
  const cols = opts.cols ?? 48
  const rows = opts.rows ?? 48
  const size = opts.size ?? 420
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < grid.length; i++) {
    const value = Number(grid[i] ?? 0)
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  const span = Math.max(1e-6, max - min)
  const cellW = size / cols
  const cellH = size / rows
  const cells = Array.from({ length: cols * rows }, (_, index) => {
    const x = index % cols
    const y = Math.floor(index / cols)
    const value = (Number(grid[index] ?? max) - min) / span
    const color = value < 0.32 ? palette.cool : value < 0.68 ? palette.accent : palette.hot
    return `<rect x="${(x * cellW).toFixed(2)}" y="${(y * cellH).toFixed(2)}" width="${cellW.toFixed(2)}" height="${cellH.toFixed(2)}" fill="${color}" opacity="${(0.18 + (1 - value) * 0.62).toFixed(3)}"/>`
  }).join('')
  const pathD = trajectory.map((params, index) => {
    const x = clamp01(Number(params[3] ?? 0.5)) * size
    const y = (1 - clamp01(Number(params[4] ?? 0.5))) * size
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')

  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Loss landscape minimap">
    <rect width="${size}" height="${size}" fill="${palette.bg}"/>
    ${cells}
    <path d="${pathD}" fill="none" stroke="${palette.fg}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`
}

export function makePoster(input: {
  finalParams: ArrayLike<number>
  history: readonly HistoryFrame[]
  audioStats: AudioStats
  palette: SpectralPalette
  lens: string
  patchName?: string
}): string {
  const size = 2048
  const params = Array.from(input.finalParams)
  const hash = hashParams(params)
  const title = input.patchName ?? patchName(hash)
  const rings = params.flatMap((value, index) => {
    const nodes = []
    const count = 18
    const radius = 180 + index * 72
    for (let i = 0; i < count; i++) {
      const angle = i * 137.508 + index * 19
      const length = 18 + clamp01(Number(value)) * 96
      nodes.push(rotate(angle, 1024, 1024)(
        translate(1024, 1024 - radius)(
          stroke(paint(index % 2 ? input.palette.hot : input.palette.accent), 8, { linecap: 'round' })(
            line(0, 0, 0, -length),
          ),
        ),
      ))
    }
    return nodes
  })
  const barcode = Array.from(hash).map((char, index) => {
    const on = Number.parseInt(char, 16) > 7
    return translate(160 + index * 28, 1852)(
      fill(paint(on ? input.palette.fg : input.palette.muted))(rect(18, 86)),
    )
  })
  const doc = viewBox(0, 0, size, size)(
    group([
      fill(paint(input.palette.bg))(rect(size, size)),
      opacity(0.16)(stroke(paint(input.palette.muted), 2)(circle(820))),
      translate(1024, 1024)(opacity(0.12)(fill(paint(input.palette.cool))(circle(680)))),
      ...rings.map((node) => opacity(0.42)(node)),
      translate(1024, 1024)(fill(paint(input.palette.bg))(circle(272))),
      translate(1024, 1024)(stroke(paint(input.palette.accent), 8)(circle(248))),
      translate(170, 230)(fill(paint(input.palette.fg))(text(title, 96))),
      translate(174, 360)(fill(paint(input.palette.accent))(text(`loss ${input.history.at(-1)?.loss.toFixed(4) ?? 'n/a'} / ${input.lens}`, 38))),
      translate(174, 438)(fill(paint(input.palette.fg))(text(`centroid ${Math.round(input.audioStats.centroid)}Hz  rolloff ${Math.round(input.audioStats.rolloff)}Hz  flat ${input.audioStats.flatness.toFixed(2)}`, 34))),
      ...barcode,
    ]),
  )
  return render(doc)
}

function defaultSpectrogramPalette(): string[] {
  return Array.from({ length: 48 }, (_, i) => {
    const t = i / 47
    const hue = 202 - t * 160
    const light = 9 + t * 58
    return `hsl(${hue.toFixed(1)} 92% ${light.toFixed(1)}%)`
  })
}

function hashParams(params: ArrayLike<number>): string {
  let hash = 2166136261
  for (let i = 0; i < params.length; i++) {
    hash ^= Math.round(clamp01(Number(params[i] ?? 0)) * 65535)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function patchName(hash: string): string {
  const left = ['Glass', 'Warm', 'Noisy', 'Bright', 'Velvet', 'Neon', 'Cinder', 'Prism']
  const right = ['Pluck', 'Comet', 'Bloom', 'Engine', 'Lens', 'Circuit', 'Halo', 'Arc']
  const a = Number.parseInt(hash.slice(0, 2), 16) % left.length
  const b = Number.parseInt(hash.slice(2, 4), 16) % right.length
  return `${left[a]} ${right[b]}`
}

export function hydrateFingerprint(target: HTMLElement, history: readonly HistoryFrame[], palette: SpectralPalette) {
  target.innerHTML = makeFingerprint(history, palette)
}

export function hydrateLandscape(target: HTMLElement, grid: ArrayLike<number>, trajectory: ReadonlyArray<ArrayLike<number>>, palette: SpectralPalette) {
  target.innerHTML = makeLandscape(grid, trajectory, palette)
}

export function downloadSvg(name: string, svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function labelForHistory(history: readonly HistoryFrame[]): string {
  const last = history.at(-1)
  if (!last) return 'waiting'
  return `${last.step} steps / loss ${last.loss.toFixed(4)}`
}

export function makeMiniGlyph(params: ArrayLike<number>, palette: SpectralPalette): string {
  const nodes = Array.from({ length: params.length }, (_, index) =>
    rotate(index * (360 / params.length))(
      translate(80, 24)(
        stroke(paint(index % 2 ? palette.hot : palette.cool), 3, { linecap: 'round' })(
          line(0, 0, 0, 12 + clamp01(Number(params[index] ?? 0)) * 48),
        ),
      ),
    ))
  return render(viewBox(0, 0, 160, 160)(group(nodes)))
}

export function targetBarsMarkup(target: ArrayLike<number>, palette: SpectralPalette): string {
  const update = makeSpectrumPaths(target, [], [], { width: 320, height: 120 })
  return update.targetRects.map((item) =>
    `<rect x="${item.x.toFixed(2)}" y="${item.y.toFixed(2)}" width="${item.width.toFixed(2)}" height="${item.height.toFixed(2)}" fill="${esc(palette.accent)}"/>`,
  ).join('')
}
