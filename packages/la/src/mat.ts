import type { Vec } from './vec'
import { mul2x2, mul3x3, mul4x4, det4x4 } from './fast'
import { getMatmul } from './accel'

export type Mat = { data: Float64Array; rows: number; cols: number }

export const create = (rows: number, cols: number, data?: number[]): Mat => ({
  data: data ? new Float64Array(data) : new Float64Array(rows * cols),
  rows,
  cols,
})

export const identity = (n: number): Mat => {
  const m = create(n, n)
  for (let i = 0; i < n; i++) m.data[i * n + i] = 1
  return m
}

export const zeros = (rows: number, cols: number): Mat => create(rows, cols)

export const fromArray = (rows: number, cols: number, arr: number[]): Mat =>
  create(rows, cols, arr)

export const get = (m: Mat, row: number, col: number): number =>
  m.data[row * m.cols + col]

export const set = (m: Mat, row: number, col: number, value: number): Mat => {
  const data = new Float64Array(m.data)
  data[row * m.cols + col] = value
  return { data, rows: m.rows, cols: m.cols }
}

export const add = (a: Mat, b: Mat): Mat => {
  if (a.rows !== b.rows || a.cols !== b.cols)
    throw new Error(`Matrix add: incompatible dimensions ${a.rows}x${a.cols} + ${b.rows}x${b.cols}`)
  const data = new Float64Array(a.data.length)
  for (let i = 0; i < data.length; i++) data[i] = a.data[i] + b.data[i]
  return { data, rows: a.rows, cols: a.cols }
}

export const sub = (a: Mat, b: Mat): Mat => {
  if (a.rows !== b.rows || a.cols !== b.cols)
    throw new Error(`Matrix sub: incompatible dimensions ${a.rows}x${a.cols} - ${b.rows}x${b.cols}`)
  const data = new Float64Array(a.data.length)
  for (let i = 0; i < data.length; i++) data[i] = a.data[i] - b.data[i]
  return { data, rows: a.rows, cols: a.cols }
}

export const multiply = (a: Mat, b: Mat): Mat => {
  if (a.cols !== b.rows)
    throw new Error(`Matrix multiply: incompatible dimensions ${a.rows}x${a.cols} * ${b.rows}x${b.cols}`)
  const M = a.rows, K = a.cols, N = b.cols
  const data = new Float64Array(M * N)

  // WASM path for large matrices
  const wasmMul = getMatmul()
  if (wasmMul && M > 8) {
    wasmMul(a.data, b.data, data, M, K, N)
    return { data, rows: M, cols: N }
  }

  // Unrolled fast paths for common small sizes
  if (M === 2 && K === 2 && N === 2) { mul2x2(a.data, b.data, data); return { data, rows: 2, cols: 2 } }
  if (M === 3 && K === 3 && N === 3) { mul3x3(a.data, b.data, data); return { data, rows: 3, cols: 3 } }
  if (M === 4 && K === 4 && N === 4) { mul4x4(a.data, b.data, data); return { data, rows: 4, cols: 4 } }

  // Block matmul for larger matrices (cache-friendly tiling)
  if (M > 32 && K > 32 && N > 32) {
    const B = 32
    for (let ii = 0; ii < M; ii += B)
      for (let jj = 0; jj < N; jj += B)
        for (let kk = 0; kk < K; kk += B) {
          const iMax = Math.min(ii + B, M)
          const jMax = Math.min(jj + B, N)
          const kMax = Math.min(kk + B, K)
          for (let i = ii; i < iMax; i++)
            for (let k = kk; k < kMax; k++) {
              const aik = a.data[i * K + k]
              for (let j = jj; j < jMax; j++)
                data[i * N + j] += aik * b.data[k * N + j]
            }
        }
    return { data, rows: M, cols: N }
  }

  // Generic i-k-j loop
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < K; k++) {
      const aik = a.data[i * K + k]
      for (let j = 0; j < N; j++) {
        data[i * N + j] += aik * b.data[k * N + j]
      }
    }
  }
  return { data, rows: M, cols: N }
}

export const multiplyInto = (out: Mat, a: Mat, b: Mat): Mat => {
  if (a.cols !== b.rows)
    throw new Error(`Matrix multiply: incompatible dimensions ${a.rows}x${a.cols} * ${b.rows}x${b.cols}`)
  const M = a.rows, K = a.cols, N = b.cols
  out.data.fill(0)
  for (let i = 0; i < M; i++)
    for (let k = 0; k < K; k++) {
      const aik = a.data[i * K + k]
      for (let j = 0; j < N; j++)
        out.data[i * N + j] += aik * b.data[k * N + j]
    }
  return out
}

export const scale = (m: Mat, s: number): Mat => {
  const data = new Float64Array(m.data.length)
  for (let i = 0; i < data.length; i++) data[i] = m.data[i] * s
  return { data, rows: m.rows, cols: m.cols }
}

export const transpose = (m: Mat): Mat => {
  const data = new Float64Array(m.rows * m.cols)
  for (let i = 0; i < m.rows; i++)
    for (let j = 0; j < m.cols; j++)
      data[j * m.rows + i] = m.data[i * m.cols + j]
  return { data, rows: m.cols, cols: m.rows }
}

export const trace = (m: Mat): number => {
  let sum = 0
  const n = Math.min(m.rows, m.cols)
  for (let i = 0; i < n; i++) sum += m.data[i * m.cols + i]
  return sum
}

export const determinant = (m: Mat): number => {
  const n = m.rows
  if (n === 1) return m.data[0]
  if (n === 2) return m.data[0] * m.data[3] - m.data[1] * m.data[2]
  if (n === 3) {
    const [a, b, c, d, e, f, g, h, i] = m.data
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  }
  if (n === 4) return det4x4(m.data)
  const { L: _, U, P } = lu(m)
  let det = 1
  for (let i = 0; i < n; i++) det *= U.data[i * n + i]
  const visited = new Uint8Array(n)
  let swaps = 0
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue
    let j = i, cycleLen = 0
    while (!visited[j]) { visited[j] = 1; j = P[j]; cycleLen++ }
    swaps += cycleLen - 1
  }
  return swaps % 2 === 0 ? det : -det
}

export const lu = (m: Mat): { L: Mat; U: Mat; P: number[] } => {
  const n = m.rows
  const u = new Float64Array(m.data)
  const l = new Float64Array(n * n)
  const p: number[] = Array.from({ length: n }, (_, i) => i)

  for (let k = 0; k < n; k++) {
    let maxVal = 0, maxRow = k
    for (let i = k; i < n; i++) {
      const v = Math.abs(u[i * n + k])
      if (v > maxVal) { maxVal = v; maxRow = i }
    }
    if (maxRow !== k) {
      [p[k], p[maxRow]] = [p[maxRow], p[k]]
      for (let j = 0; j < n; j++) {
        [u[k * n + j], u[maxRow * n + j]] = [u[maxRow * n + j], u[k * n + j]]
      }
      for (let j = 0; j < k; j++) {
        [l[k * n + j], l[maxRow * n + j]] = [l[maxRow * n + j], l[k * n + j]]
      }
    }
    l[k * n + k] = 1
    for (let i = k + 1; i < n; i++) {
      const factor = u[i * n + k] / u[k * n + k]
      l[i * n + k] = factor
      for (let j = k; j < n; j++) {
        u[i * n + j] -= factor * u[k * n + j]
      }
    }
  }

  return {
    L: { data: l, rows: n, cols: n },
    U: { data: u, rows: n, cols: n },
    P: p,
  }
}

export const solve = (a: Mat, b: Vec): Vec => {
  if (a.rows !== a.cols)
    throw new Error(`Matrix solve: matrix must be square, got ${a.rows}x${a.cols}`)
  if (b.length !== a.rows)
    throw new Error(`Matrix solve: incompatible dimensions ${a.rows}x${a.cols} and vector of length ${b.length}`)
  const n = a.rows
  const { L, U, P } = lu(a)
  for (let i = 0; i < n; i++)
    if (Math.abs(U.data[i * n + i]) < 1e-12) throw new Error('Matrix is singular')

  const pb = new Float64Array(n)
  for (let i = 0; i < n; i++) pb[i] = b[P[i]]

  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = 0; j < i; j++) sum += L.data[i * n + j] * y[j]
    y[i] = pb[i] - sum
  }

  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0
    for (let j = i + 1; j < n; j++) sum += U.data[i * n + j] * x[j]
    x[i] = (y[i] - sum) / U.data[i * n + i]
  }

  return x
}

export const inverse = (m: Mat): Mat | null => {
  const n = m.rows
  const aug = new Float64Array(n * 2 * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) aug[i * 2 * n + j] = m.data[i * n + j]
    aug[i * 2 * n + n + i] = 1
  }
  const w = 2 * n
  for (let k = 0; k < n; k++) {
    let maxVal = 0, maxRow = k
    for (let i = k; i < n; i++) {
      const v = Math.abs(aug[i * w + k])
      if (v > maxVal) { maxVal = v; maxRow = i }
    }
    if (maxVal < 1e-12) return null
    if (maxRow !== k) {
      for (let j = 0; j < w; j++)
        [aug[k * w + j], aug[maxRow * w + j]] = [aug[maxRow * w + j], aug[k * w + j]]
    }
    const pivot = aug[k * w + k]
    for (let j = 0; j < w; j++) aug[k * w + j] /= pivot
    for (let i = 0; i < n; i++) {
      if (i === k) continue
      const factor = aug[i * w + k]
      for (let j = 0; j < w; j++) aug[i * w + j] -= factor * aug[k * w + j]
    }
  }
  const data = new Float64Array(n * n)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) data[i * n + j] = aug[i * w + n + j]
  return { data, rows: n, cols: n }
}

export const qr = (m: Mat): { Q: Mat; R: Mat } => {
  const { rows, cols } = m
  const q = new Float64Array(rows * cols)
  const r = new Float64Array(cols * cols)

  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < rows; i++) q[i * cols + j] = m.data[i * cols + j]

    for (let k = 0; k < j; k++) {
      let dot = 0
      for (let i = 0; i < rows; i++) dot += q[i * cols + k] * q[i * cols + j]
      r[k * cols + j] = dot
      for (let i = 0; i < rows; i++) q[i * cols + j] -= dot * q[i * cols + k]
    }

    let norm = 0
    for (let i = 0; i < rows; i++) norm += q[i * cols + j] * q[i * cols + j]
    norm = Math.sqrt(norm)
    r[j * cols + j] = norm

    if (norm > 1e-12) {
      for (let i = 0; i < rows; i++) q[i * cols + j] /= norm
    }
  }

  return {
    Q: { data: q, rows, cols },
    R: { data: r, rows: cols, cols },
  }
}

export const svd = (m: Mat): { U: Mat; S: Vec; V: Mat } => {
  if (m.rows === 0 || m.cols === 0)
    throw new Error(`SVD: matrix must be non-empty, got ${m.rows}x${m.cols}`)
  const { rows, cols } = m
  const k = Math.min(rows, cols)

  const ata = multiply(transpose(m), m)
  const n = ata.rows

  let v = identity(n)
  const d = new Float64Array(ata.data)

  for (let iter = 0; iter < 100 * n * n; iter++) {
    let offDiag = 0
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        offDiag += d[i * n + j] * d[i * n + j]
    if (offDiag < 1e-20) break

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const dpq = d[p * n + q]
        if (Math.abs(dpq) < 1e-15) continue

        const tau = (d[q * n + q] - d[p * n + p]) / (2 * dpq)
        const t = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau))
        const c = 1 / Math.sqrt(1 + t * t)
        const s = t * c

        const dpp = d[p * n + p], dqq = d[q * n + q]
        d[p * n + p] = dpp - t * dpq
        d[q * n + q] = dqq + t * dpq
        d[p * n + q] = 0
        d[q * n + p] = 0

        for (let i = 0; i < n; i++) {
          if (i === p || i === q) continue
          const dip = d[i * n + p], diq = d[i * n + q]
          d[i * n + p] = c * dip - s * diq
          d[p * n + i] = c * dip - s * diq
          d[i * n + q] = s * dip + c * diq
          d[q * n + i] = s * dip + c * diq
        }

        for (let i = 0; i < n; i++) {
          const vip = v.data[i * n + p], viq = v.data[i * n + q]
          v.data[i * n + p] = c * vip - s * viq
          v.data[i * n + q] = s * vip + c * viq
        }
      }
    }
  }

  const singularValues = new Float64Array(k)
  const indices = Array.from({ length: n }, (_, i) => i)
  indices.sort((a, b) => d[b * n + b] - d[a * n + a])

  const vSorted = create(n, n)
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      vSorted.data[i * n + j] = v.data[i * n + indices[j]]

  for (let i = 0; i < k; i++)
    singularValues[i] = Math.sqrt(Math.max(0, d[indices[i] * n + indices[i]]))

  const uData = new Float64Array(rows * k)
  for (let j = 0; j < k; j++) {
    if (singularValues[j] < 1e-12) continue
    for (let i = 0; i < rows; i++) {
      let sum = 0
      for (let l = 0; l < cols; l++)
        sum += m.data[i * cols + l] * vSorted.data[l * n + j]
      uData[i * k + j] = sum / singularValues[j]
    }
  }

  return {
    U: { data: uData, rows, cols: k },
    S: singularValues,
    V: { data: new Float64Array(vSorted.data), rows: n, cols: n },
  }
}

export const eigenvalues = (m: Mat): Vec => {
  const n = m.rows
  if (m.rows !== m.cols)
    throw new Error(`eigenvalues: matrix must be square, got ${m.rows}x${m.cols}`)
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (Math.abs(m.data[i * n + j] - m.data[j * n + i]) > 1e-10)
        throw new Error('eigenvalues: matrix must be symmetric')

  let a: Mat = { data: new Float64Array(m.data), rows: n, cols: n }

  for (let iter = 0; iter < 300 * n; iter++) {
    let offDiag = 0
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (i !== j) offDiag += a.data[i * n + j] * a.data[i * n + j]
    if (offDiag < 1e-20) break

    const ann = a.data[(n - 1) * n + (n - 1)]
    const an1n1 = n >= 2 ? a.data[(n - 2) * n + (n - 2)] : 0
    const an1n = n >= 2 ? a.data[(n - 2) * n + (n - 1)] : 0
    const ann1 = n >= 2 ? a.data[(n - 1) * n + (n - 2)] : 0

    const delta = (an1n1 - ann) / 2
    const sign = delta >= 0 ? 1 : -1
    const mu = ann - (an1n * ann1) / (delta + sign * Math.sqrt(delta * delta + an1n * ann1))
    const shift = isFinite(mu) ? mu : ann

    const shifted: Mat = { data: new Float64Array(a.data), rows: n, cols: n }
    for (let i = 0; i < n; i++) shifted.data[i * n + i] -= shift

    const { Q, R } = qr(shifted)
    a = multiply(R, Q)
    for (let i = 0; i < n; i++) a.data[i * n + i] += shift
  }

  const vals = new Float64Array(n)
  for (let i = 0; i < n; i++) vals[i] = a.data[i * n + i]
  return vals
}

export const norm = (m: Mat): number => {
  let sum = 0
  for (let i = 0; i < m.data.length; i++) sum += m.data[i] * m.data[i]
  return Math.sqrt(sum)
}

export const cholesky = (m: Mat): Mat | null => {
  if (m.rows !== m.cols)
    throw new Error(`Cholesky: matrix must be square, got ${m.rows}x${m.cols}`)
  const n = m.rows
  const L = new Float64Array(n * n)

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0
      for (let k = 0; k < j; k++) sum += L[i * n + k] * L[j * n + k]

      if (i === j) {
        const diag = m.data[i * n + i] - sum
        if (diag <= 0) return null
        L[i * n + j] = Math.sqrt(diag)
      } else {
        L[i * n + j] = (m.data[i * n + j] - sum) / L[j * n + j]
      }
    }
  }

  return { data: L, rows: n, cols: n }
}
