import type { Image, DetectedLine, Component, ComponentResult } from './types'
import { dual } from './dual'

const isForeground = (img: Image, x: number, y: number): boolean => {
  const i = (y * img.width + x) * 4
  return img.data[i] > 0 || img.data[i + 1] > 0 || img.data[i + 2] > 0
}

// --- Hough line transform ---

export type HoughOptions = {
  threshold?: number   // min votes for a line (default: auto, 50% of max)
  thetaSteps?: number  // angular resolution (default: 180)
  maxLines?: number    // cap on returned lines (default: 50)
}

export const houghLines: {
  (img: Image, options?: HoughOptions): DetectedLine[]
  (options: HoughOptions): (img: Image) => DetectedLine[]
} = dual(2, (img: Image, options: HoughOptions = {}): DetectedLine[] => {
  const { thetaSteps = 180, maxLines = 50 } = options
  const w = img.width, h = img.height
  const diag = Math.ceil(Math.sqrt(w * w + h * h))
  const rhoMax = diag
  const rhoSteps = diag * 2

  // precompute sin/cos
  const sinTable = new Float64Array(thetaSteps)
  const cosTable = new Float64Array(thetaSteps)
  for (let t = 0; t < thetaSteps; t++) {
    const theta = (t / thetaSteps) * Math.PI
    sinTable[t] = Math.sin(theta)
    cosTable[t] = Math.cos(theta)
  }

  // accumulator
  const acc = new Int32Array(rhoSteps * thetaSteps)

  // vote
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isForeground(img, x, y)) continue
      for (let t = 0; t < thetaSteps; t++) {
        const rho = Math.round(x * cosTable[t] + y * sinTable[t]) + rhoMax
        acc[rho * thetaSteps + t]++
      }
    }
  }

  // find peaks
  let maxVotes = 0
  for (let i = 0; i < acc.length; i++) {
    if (acc[i] > maxVotes) maxVotes = acc[i]
  }

  const threshold = options.threshold ?? Math.floor(maxVotes * 0.5)
  const lines: DetectedLine[] = []

  for (let r = 0; r < rhoSteps; r++) {
    for (let t = 0; t < thetaSteps; t++) {
      const votes = acc[r * thetaSteps + t]
      if (votes < threshold) continue
      lines.push({
        rho: r - rhoMax,
        theta: (t / thetaSteps) * Math.PI,
        votes,
      })
    }
  }

  lines.sort((a, b) => b.votes - a.votes)
  return lines.slice(0, maxLines)
})

// Convert a detected line to two endpoints for rendering on a canvas.
export const lineToEndpoints = (
  line: DetectedLine,
  width: number,
  height: number,
): [{ x: number; y: number }, { x: number; y: number }] => {
  const cos = Math.cos(line.theta)
  const sin = Math.sin(line.theta)
  const x0 = cos * line.rho
  const y0 = sin * line.rho
  const len = Math.max(width, height)
  return [
    { x: Math.round(x0 - len * sin), y: Math.round(y0 + len * cos) },
    { x: Math.round(x0 + len * sin), y: Math.round(y0 - len * cos) },
  ]
}

// --- Connected component labelling (two-pass with union-find) ---

class UnionFind {
  parent: Int32Array
  rank: Uint8Array

  constructor(n: number) {
    this.parent = new Int32Array(n)
    this.rank = new Uint8Array(n)
    for (let i = 0; i < n; i++) this.parent[i] = i
  }

  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]
      x = this.parent[x]
    }
    return x
  }

  union(a: number, b: number): void {
    const ra = this.find(a), rb = this.find(b)
    if (ra === rb) return
    if (this.rank[ra] < this.rank[rb]) { this.parent[ra] = rb }
    else if (this.rank[ra] > this.rank[rb]) { this.parent[rb] = ra }
    else { this.parent[rb] = ra; this.rank[ra]++ }
  }
}

export const connectedComponents = (img: Image): ComponentResult => {
  const w = img.width, h = img.height
  const labels = new Int32Array(w * h)
  const uf = new UnionFind(w * h + 1)
  let nextLabel = 1

  // pass 1: assign provisional labels
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isForeground(img, x, y)) continue
      const idx = y * w + x
      const above = y > 0 && isForeground(img, x, y - 1) ? labels[(y - 1) * w + x] : 0
      const left = x > 0 && isForeground(img, x - 1, y) ? labels[y * w + x - 1] : 0

      if (above === 0 && left === 0) {
        labels[idx] = nextLabel++
      } else if (above !== 0 && left === 0) {
        labels[idx] = above
      } else if (above === 0 && left !== 0) {
        labels[idx] = left
      } else {
        labels[idx] = Math.min(above, left)
        if (above !== left) uf.union(above, left)
      }
    }
  }

  // pass 2: resolve labels and collect stats
  const remap = new Map<number, number>()
  let componentId = 0

  const stats = new Map<number, { area: number; sumX: number; sumY: number; minX: number; minY: number; maxX: number; maxY: number }>()

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (labels[idx] === 0) continue

      const root = uf.find(labels[idx])
      if (!remap.has(root)) remap.set(root, ++componentId)
      const id = remap.get(root)!
      labels[idx] = id

      let s = stats.get(id)
      if (!s) {
        s = { area: 0, sumX: 0, sumY: 0, minX: x, minY: y, maxX: x, maxY: y }
        stats.set(id, s)
      }
      s.area++
      s.sumX += x
      s.sumY += y
      if (x < s.minX) s.minX = x
      if (y < s.minY) s.minY = y
      if (x > s.maxX) s.maxX = x
      if (y > s.maxY) s.maxY = y
    }
  }

  const components: Component[] = []
  for (const [id, s] of stats) {
    components.push({
      id,
      area: s.area,
      centroid: { x: Math.round(s.sumX / s.area), y: Math.round(s.sumY / s.area) },
      bbox: { x: s.minX, y: s.minY, w: s.maxX - s.minX + 1, h: s.maxY - s.minY + 1 },
    })
  }
  components.sort((a, b) => b.area - a.area)

  return { labels, width: w, height: h, components }
}
