import { getDot, getAxpy } from './accel'

export type Vec = Float64Array

export const create = (...values: number[]): Vec => new Float64Array(values)

export const zeros = (n: number): Vec => new Float64Array(n)

export const ones = (n: number): Vec => {
  const v = new Float64Array(n)
  v.fill(1)
  return v
}

export const add = (a: Vec, b: Vec): Vec => {
  const n = a.length
  const out = new Float64Array(n)
  const m = n & ~3
  let i = 0
  for (; i < m; i += 4) {
    out[i] = a[i] + b[i]
    out[i + 1] = a[i + 1] + b[i + 1]
    out[i + 2] = a[i + 2] + b[i + 2]
    out[i + 3] = a[i + 3] + b[i + 3]
  }
  for (; i < n; i++) out[i] = a[i] + b[i]
  return out
}

export const sub = (a: Vec, b: Vec): Vec => {
  const n = a.length
  const out = new Float64Array(n)
  const m = n & ~3
  let i = 0
  for (; i < m; i += 4) {
    out[i] = a[i] - b[i]
    out[i + 1] = a[i + 1] - b[i + 1]
    out[i + 2] = a[i + 2] - b[i + 2]
    out[i + 3] = a[i + 3] - b[i + 3]
  }
  for (; i < n; i++) out[i] = a[i] - b[i]
  return out
}

export const scale = (v: Vec, s: number): Vec => {
  const n = v.length
  const out = new Float64Array(n)
  const m = n & ~3
  let i = 0
  for (; i < m; i += 4) {
    out[i] = v[i] * s
    out[i + 1] = v[i + 1] * s
    out[i + 2] = v[i + 2] * s
    out[i + 3] = v[i + 3] * s
  }
  for (; i < n; i++) out[i] = v[i] * s
  return out
}

export const dot = (a: Vec, b: Vec): number => {
  const n = a.length
  const wasmDot = getDot()
  if (wasmDot && n > 16) return wasmDot(a, b, n)
  if (n === 2) return a[0] * b[0] + a[1] * b[1]
  if (n === 3) return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  if (n === 4) return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  let sum = 0
  const m = n & ~3
  let i = 0
  for (; i < m; i += 4)
    sum += a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3]
  for (; i < n; i++) sum += a[i] * b[i]
  return sum
}

export const cross = (a: Vec, b: Vec): Vec =>
  new Float64Array([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ])

export const norm = (v: Vec): number => Math.sqrt(dot(v, v))

export const normalize = (v: Vec): Vec => {
  const n = norm(v)
  return n === 0 ? new Float64Array(v.length) : scale(v, 1 / n)
}

export const distance = (a: Vec, b: Vec): number => norm(sub(a, b))

export const lerp = (a: Vec, b: Vec, t: number): Vec => {
  const n = a.length
  const out = new Float64Array(n)
  const m = n & ~3
  let i = 0
  for (; i < m; i += 4) {
    out[i] = a[i] + (b[i] - a[i]) * t
    out[i + 1] = a[i + 1] + (b[i + 1] - a[i + 1]) * t
    out[i + 2] = a[i + 2] + (b[i + 2] - a[i + 2]) * t
    out[i + 3] = a[i + 3] + (b[i + 3] - a[i + 3]) * t
  }
  for (; i < n; i++) out[i] = a[i] + (b[i] - a[i]) * t
  return out
}

export const axpy = (a: number, x: Vec, y: Vec): Vec => {
  const n = x.length
  const wasmAxpy = getAxpy()
  if (wasmAxpy && n > 32) {
    const out = new Float64Array(n)
    wasmAxpy(a, x, y, out, n)
    return out
  }
  const out = new Float64Array(n)
  const m = n & ~3
  let i = 0
  for (; i < m; i += 4) {
    out[i] = a * x[i] + y[i]
    out[i + 1] = a * x[i + 1] + y[i + 1]
    out[i + 2] = a * x[i + 2] + y[i + 2]
    out[i + 3] = a * x[i + 3] + y[i + 3]
  }
  for (; i < n; i++) out[i] = a * x[i] + y[i]
  return out
}

export const addInto = (out: Vec, a: Vec, b: Vec): Vec => {
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i]
  return out
}

export const scaleInto = (out: Vec, v: Vec, s: number): Vec => {
  for (let i = 0; i < v.length; i++) out[i] = v[i] * s
  return out
}

export const axpyInto = (out: Vec, a: number, x: Vec, y: Vec): Vec => {
  for (let i = 0; i < x.length; i++) out[i] = a * x[i] + y[i]
  return out
}
