import { getColorMatrix3x3Float } from '@stopcock/la/accel'
import type { Color, ColorSpace } from './types'
import {
  LIN_SRGB_TO_XYZ_D65,
  XYZ_D65_TO_LIN_SRGB,
  XYZ_D65_TO_XYZ_D50,
  XYZ_D50_TO_XYZ_D65,
  LIN_P3_TO_XYZ_D65,
  XYZ_D65_TO_LIN_P3,
  XYZ_D65_TO_LMS,
  LMS_TO_XYZ_D65,
  LMS_PRIME_TO_OKLAB,
  OKLAB_TO_LMS_PRIME,
} from './matrices'
import { srgbToLinear, linearToSrgb, p3ToLinear, linearToP3 } from './transfer'
import { matrixFor, type CVDType } from './cvd'
import { toGamut } from './gamut'

export type ChannelBuffer = Float64Array

const validateBuffer = (name: string, buf: ChannelBuffer): void => {
  if (buf.length % 3 !== 0) throw new Error(`${name} length must be a multiple of 3`)
}

const validateOut = (src: ChannelBuffer, out?: ChannelBuffer): void => {
  if (out && out.length !== src.length)
    throw new Error(`out length ${out.length} must match source length ${src.length}`)
}

export const applyMatrix3x3 = (
  matrix: Float64Array,
  src: ChannelBuffer,
  out: ChannelBuffer = new Float64Array(src.length),
): ChannelBuffer => {
  validateBuffer('src', src)
  validateOut(src, out)
  if (matrix.length < 9) throw new Error('matrix must contain 9 values')

  const pixelCount = src.length / 3
  const accel = getColorMatrix3x3Float()
  if (accel && pixelCount >= 16) {
    accel(matrix, src, out, pixelCount)
    return out
  }

  const m0 = matrix[0],
    m1 = matrix[1],
    m2 = matrix[2]
  const m3 = matrix[3],
    m4 = matrix[4],
    m5 = matrix[5]
  const m6 = matrix[6],
    m7 = matrix[7],
    m8 = matrix[8]
  let i = 0
  const n = src.length
  for (; i + 12 <= n; i += 12) {
    const r0 = src[i],
      g0 = src[i + 1],
      b0 = src[i + 2]
    out[i] = m0 * r0 + m1 * g0 + m2 * b0
    out[i + 1] = m3 * r0 + m4 * g0 + m5 * b0
    out[i + 2] = m6 * r0 + m7 * g0 + m8 * b0

    const r1 = src[i + 3],
      g1 = src[i + 4],
      b1 = src[i + 5]
    out[i + 3] = m0 * r1 + m1 * g1 + m2 * b1
    out[i + 4] = m3 * r1 + m4 * g1 + m5 * b1
    out[i + 5] = m6 * r1 + m7 * g1 + m8 * b1

    const r2 = src[i + 6],
      g2 = src[i + 7],
      b2 = src[i + 8]
    out[i + 6] = m0 * r2 + m1 * g2 + m2 * b2
    out[i + 7] = m3 * r2 + m4 * g2 + m5 * b2
    out[i + 8] = m6 * r2 + m7 * g2 + m8 * b2

    const r3 = src[i + 9],
      g3 = src[i + 10],
      b3 = src[i + 11]
    out[i + 9] = m0 * r3 + m1 * g3 + m2 * b3
    out[i + 10] = m3 * r3 + m4 * g3 + m5 * b3
    out[i + 11] = m6 * r3 + m7 * g3 + m8 * b3
  }
  for (; i < n; i += 3) {
    const r = src[i],
      g = src[i + 1],
      b = src[i + 2]
    out[i] = m0 * r + m1 * g + m2 * b
    out[i + 1] = m3 * r + m4 * g + m5 * b
    out[i + 2] = m6 * r + m7 * g + m8 * b
  }
  return out
}

export const applyTransfer = (
  fn: (value: number) => number,
  src: ChannelBuffer,
  out: ChannelBuffer = new Float64Array(src.length),
): ChannelBuffer => {
  validateBuffer('src', src)
  validateOut(src, out)
  for (let i = 0; i < src.length; i++) out[i] = fn(src[i])
  return out
}

type BatchEdge = (src: ChannelBuffer, out: ChannelBuffer, scratch: ChannelBuffer) => ChannelBuffer

const D50_X = 0.9642956764295677
const D50_Y = 1
const D50_Z = 0.8251046025104602
const LAB_E = 216 / 24389
const LAB_K = 24389 / 27

const cbrtLab = (t: number): number => (t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116)
const invLab = (f: number): number => {
  const f3 = f * f * f
  return f3 > LAB_E ? f3 : (116 * f - 16) / LAB_K
}

const toPolarBuffer: BatchEdge = (src, out) => {
  for (let i = 0; i < src.length; i += 3) {
    const l = src[i],
      a = src[i + 1],
      b = src[i + 2]
    const c = Math.hypot(a, b)
    let h = (Math.atan2(b, a) * 180) / Math.PI
    if (h < 0) h += 360
    if (c < 1e-7) h = 0
    out[i] = l
    out[i + 1] = c
    out[i + 2] = h
  }
  return out
}

const fromPolarBuffer: BatchEdge = (src, out) => {
  for (let i = 0; i < src.length; i += 3) {
    const rad = (src[i + 2] * Math.PI) / 180
    out[i] = src[i]
    out[i + 1] = src[i + 1] * Math.cos(rad)
    out[i + 2] = src[i + 1] * Math.sin(rad)
  }
  return out
}

const xyz50ToLabBuffer: BatchEdge = (src, out) => {
  for (let i = 0; i < src.length; i += 3) {
    const fx = cbrtLab(src[i] / D50_X)
    const fy = cbrtLab(src[i + 1] / D50_Y)
    const fz = cbrtLab(src[i + 2] / D50_Z)
    out[i] = 116 * fy - 16
    out[i + 1] = 500 * (fx - fy)
    out[i + 2] = 200 * (fy - fz)
  }
  return out
}

const labToXyz50Buffer: BatchEdge = (src, out) => {
  for (let i = 0; i < src.length; i += 3) {
    const l = src[i],
      a = src[i + 1],
      b = src[i + 2]
    const fy = (l + 16) / 116
    const fx = a / 500 + fy
    const fz = fy - b / 200
    out[i] = invLab(fx) * D50_X
    out[i + 1] = invLab(fy) * D50_Y
    out[i + 2] = invLab(fz) * D50_Z
  }
  return out
}

const xyz65ToOklabBuffer: BatchEdge = (src, out, scratch) => {
  applyMatrix3x3(XYZ_D65_TO_LMS, src, scratch)
  for (let i = 0; i < scratch.length; i++) scratch[i] = Math.cbrt(scratch[i])
  return applyMatrix3x3(LMS_PRIME_TO_OKLAB, scratch, out)
}

const oklabToXyz65Buffer: BatchEdge = (src, out, scratch) => {
  applyMatrix3x3(OKLAB_TO_LMS_PRIME, src, scratch)
  for (let i = 0; i < scratch.length; i++) scratch[i] = scratch[i] ** 3
  return applyMatrix3x3(LMS_TO_XYZ_D65, scratch, out)
}

const srgbToHslBuffer: BatchEdge = (src, out) => {
  for (let i = 0; i < src.length; i += 3) {
    const r = src[i],
      g = src[i + 1],
      b = src[i + 2]
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b)
    const l = (max + min) / 2
    let h = 0,
      s = 0
    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
      else if (max === g) h = ((b - r) / d + 2) * 60
      else h = ((r - g) / d + 4) * 60
    }
    out[i] = h
    out[i + 1] = s
    out[i + 2] = l
  }
  return out
}

const hslToSrgbBuffer: BatchEdge = (src, out) => {
  for (let i = 0; i < src.length; i += 3) {
    const h = src[i],
      s = src[i + 1],
      l = src[i + 2]
    if (s === 0) {
      out[i] = l
      out[i + 1] = l
      out[i + 2] = l
      continue
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const hk = h / 360
    const hue2rgb = (t0: number) => {
      let t = t0
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    out[i] = hue2rgb(hk + 1 / 3)
    out[i + 1] = hue2rgb(hk)
    out[i + 2] = hue2rgb(hk - 1 / 3)
  }
  return out
}

const srgbToHwbBuffer: BatchEdge = (src, out) => {
  for (let i = 0; i < src.length; i += 3) {
    const r = src[i],
      g = src[i + 1],
      b = src[i + 2]
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b)
    let h = 0
    if (max !== min) {
      const d = max - min
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
      else if (max === g) h = ((b - r) / d + 2) * 60
      else h = ((r - g) / d + 4) * 60
    }
    out[i] = h
    out[i + 1] = min
    out[i + 2] = 1 - max
  }
  return out
}

const hwbToSrgbBuffer: BatchEdge = (src, out, scratch) => {
  for (let i = 0; i < src.length; i += 3) {
    const h = src[i],
      w = src[i + 1],
      bl = src[i + 2]
    if (w + bl >= 1) {
      const gray = w / (w + bl)
      out[i] = gray
      out[i + 1] = gray
      out[i + 2] = gray
      continue
    }
    scratch[i] = h
    scratch[i + 1] = 1
    scratch[i + 2] = 0.5
  }
  hslToSrgbBuffer(scratch, scratch, out)
  for (let i = 0; i < src.length; i += 3) {
    const w = src[i + 1],
      bl = src[i + 2]
    if (w + bl >= 1) continue
    const span = 1 - w - bl
    out[i] = scratch[i] * span + w
    out[i + 1] = scratch[i + 1] * span + w
    out[i + 2] = scratch[i + 2] * span + w
  }
  return out
}

const p3ToXyz65Buffer: BatchEdge = (src, out, scratch) => {
  applyTransfer(p3ToLinear, src, scratch)
  return applyMatrix3x3(LIN_P3_TO_XYZ_D65, scratch, out)
}

const xyz65ToP3Buffer: BatchEdge = (src, out, scratch) => {
  applyMatrix3x3(XYZ_D65_TO_LIN_P3, src, scratch)
  return applyTransfer(linearToP3, scratch, out)
}

const BATCH_EDGES: Record<string, BatchEdge> = {
  'srgb→linear-srgb': (src, out) => applyTransfer(srgbToLinear, src, out),
  'linear-srgb→srgb': (src, out) => applyTransfer(linearToSrgb, src, out),
  'linear-srgb→xyz-d65': (src, out) => applyMatrix3x3(LIN_SRGB_TO_XYZ_D65, src, out),
  'xyz-d65→linear-srgb': (src, out) => applyMatrix3x3(XYZ_D65_TO_LIN_SRGB, src, out),
  'xyz-d65→xyz-d50': (src, out) => applyMatrix3x3(XYZ_D65_TO_XYZ_D50, src, out),
  'xyz-d50→xyz-d65': (src, out) => applyMatrix3x3(XYZ_D50_TO_XYZ_D65, src, out),
  'xyz-d50→lab': xyz50ToLabBuffer,
  'lab→xyz-d50': labToXyz50Buffer,
  'lab→lch': toPolarBuffer,
  'lch→lab': fromPolarBuffer,
  'xyz-d65→oklab': xyz65ToOklabBuffer,
  'oklab→xyz-d65': oklabToXyz65Buffer,
  'oklab→oklch': toPolarBuffer,
  'oklch→oklab': fromPolarBuffer,
  'srgb→hsl': srgbToHslBuffer,
  'hsl→srgb': hslToSrgbBuffer,
  'srgb→hwb': srgbToHwbBuffer,
  'hwb→srgb': hwbToSrgbBuffer,
  'p3→xyz-d65': p3ToXyz65Buffer,
  'xyz-d65→p3': xyz65ToP3Buffer,
}

const PATH_CACHE = new Map<string, BatchEdge[]>()

const findPath = (from: ColorSpace, to: ColorSpace): BatchEdge[] => {
  const key = `${from}→${to}`
  const cached = PATH_CACHE.get(key)
  if (cached) return cached
  const queue: Array<{ at: ColorSpace; path: BatchEdge[] }> = [{ at: from, path: [] }]
  const seen = new Set<ColorSpace>([from])
  while (queue.length > 0) {
    const { at, path } = queue.shift()!
    for (const edgeKey of Object.keys(BATCH_EDGES)) {
      const [edgeFrom, edgeTo] = edgeKey.split('→') as [ColorSpace, ColorSpace]
      if (edgeFrom !== at || seen.has(edgeTo)) continue
      const nextPath = [...path, BATCH_EDGES[edgeKey]]
      if (edgeTo === to) {
        PATH_CACHE.set(key, nextPath)
        return nextPath
      }
      seen.add(edgeTo)
      queue.push({ at: edgeTo, path: nextPath })
    }
  }
  throw new Error(`No conversion path from ${from} to ${to}`)
}

export const convertBuffer = (
  src: ChannelBuffer,
  srcSpace: ColorSpace,
  dstSpace: ColorSpace,
  out?: ChannelBuffer,
): ChannelBuffer => {
  validateBuffer('src', src)
  validateOut(src, out)
  if (src.length === 0) return out ?? src
  if (srcSpace === dstSpace) {
    if (out && out !== src) out.set(src)
    return out ?? src
  }
  if (srcSpace === 'srgb' && dstSpace === 'oklab')
    return srgbToOklabDirect(src, out ?? new Float64Array(src.length))
  if (srcSpace === 'oklab' && dstSpace === 'srgb')
    return oklabToSrgbDirect(src, out ?? new Float64Array(src.length))

  const path = findPath(srcSpace, dstSpace)
  const scratchA = new Float64Array(src.length)
  const scratchB = out ?? new Float64Array(src.length)
  const edgeScratch = new Float64Array(src.length)
  let cur = src

  for (let i = 0; i < path.length; i++) {
    const isLast = i === path.length - 1
    const dst = isLast ? scratchB : i % 2 === 0 ? scratchA : scratchB
    path[i](cur, dst, edgeScratch)
    cur = dst
  }

  return cur
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)

const combine3x3 = (a: Float64Array, b: Float64Array): Float64Array => {
  const out = new Float64Array(9)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row * 3 + col] =
        a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col]
    }
  }
  return out
}

const LIN_SRGB_TO_LMS = combine3x3(XYZ_D65_TO_LMS, LIN_SRGB_TO_XYZ_D65)
const LMS_TO_LIN_SRGB = combine3x3(XYZ_D65_TO_LIN_SRGB, LMS_TO_XYZ_D65)
const NO_BYTE_KEY = 0xffffffff
const SRGB_TO_LINEAR_8 = Float64Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255))
type ByteOklabMeta = {
  keys: Uint32Array
  values: Map<number, readonly [number, number, number]>
}
const BYTE_OKLAB_SOURCE = new WeakMap<ChannelBuffer, ByteOklabMeta>()

const byteFromUnit = (value: number): number => {
  const scaled = value * 255
  const rounded = Math.round(scaled)
  return rounded >= 0 && rounded <= 255 && Math.abs(scaled - rounded) <= 1e-10 ? rounded : -1
}

const srgbToOklabDirect = (src: ChannelBuffer, out: ChannelBuffer): ChannelBuffer => {
  const l0 = LIN_SRGB_TO_LMS[0],
    l1 = LIN_SRGB_TO_LMS[1],
    l2 = LIN_SRGB_TO_LMS[2]
  const m0 = LIN_SRGB_TO_LMS[3],
    m1 = LIN_SRGB_TO_LMS[4],
    m2 = LIN_SRGB_TO_LMS[5]
  const s0 = LIN_SRGB_TO_LMS[6],
    s1 = LIN_SRGB_TO_LMS[7],
    s2 = LIN_SRGB_TO_LMS[8]
  const o0 = LMS_PRIME_TO_OKLAB[0],
    o1 = LMS_PRIME_TO_OKLAB[1],
    o2 = LMS_PRIME_TO_OKLAB[2]
  const o3 = LMS_PRIME_TO_OKLAB[3],
    o4 = LMS_PRIME_TO_OKLAB[4],
    o5 = LMS_PRIME_TO_OKLAB[5]
  const o6 = LMS_PRIME_TO_OKLAB[6],
    o7 = LMS_PRIME_TO_OKLAB[7],
    o8 = LMS_PRIME_TO_OKLAB[8]
  const keys = new Uint32Array(src.length / 3)
  const values = new Map<number, readonly [number, number, number]>()
  for (let i = 0; i < src.length; i += 3) {
    const pixel = i / 3
    const rb = byteFromUnit(src[i])
    const gb = byteFromUnit(src[i + 1])
    const bb = byteFromUnit(src[i + 2])
    const key = rb >= 0 && gb >= 0 && bb >= 0 ? (rb << 16) | (gb << 8) | bb : NO_BYTE_KEY
    keys[pixel] = key
    const cached = key === NO_BYTE_KEY ? undefined : values.get(key)
    if (cached) {
      out[i] = cached[0]
      out[i + 1] = cached[1]
      out[i + 2] = cached[2]
      continue
    }
    const r = key === NO_BYTE_KEY ? srgbToLinear(src[i]) : SRGB_TO_LINEAR_8[rb]
    const g = key === NO_BYTE_KEY ? srgbToLinear(src[i + 1]) : SRGB_TO_LINEAR_8[gb]
    const b = key === NO_BYTE_KEY ? srgbToLinear(src[i + 2]) : SRGB_TO_LINEAR_8[bb]
    const lp = Math.cbrt(l0 * r + l1 * g + l2 * b)
    const mp = Math.cbrt(m0 * r + m1 * g + m2 * b)
    const sp = Math.cbrt(s0 * r + s1 * g + s2 * b)
    out[i] = o0 * lp + o1 * mp + o2 * sp
    out[i + 1] = o3 * lp + o4 * mp + o5 * sp
    out[i + 2] = o6 * lp + o7 * mp + o8 * sp
    if (key !== NO_BYTE_KEY) values.set(key, [out[i], out[i + 1], out[i + 2]])
  }
  BYTE_OKLAB_SOURCE.set(out, { keys, values })
  return out
}

const oklabToSrgbDirect = (src: ChannelBuffer, out: ChannelBuffer): ChannelBuffer => {
  const p0 = OKLAB_TO_LMS_PRIME[0],
    p1 = OKLAB_TO_LMS_PRIME[1],
    p2 = OKLAB_TO_LMS_PRIME[2]
  const p3 = OKLAB_TO_LMS_PRIME[3],
    p4 = OKLAB_TO_LMS_PRIME[4],
    p5 = OKLAB_TO_LMS_PRIME[5]
  const p6 = OKLAB_TO_LMS_PRIME[6],
    p7 = OKLAB_TO_LMS_PRIME[7],
    p8 = OKLAB_TO_LMS_PRIME[8]
  const r0 = LMS_TO_LIN_SRGB[0],
    r1 = LMS_TO_LIN_SRGB[1],
    r2 = LMS_TO_LIN_SRGB[2]
  const g0 = LMS_TO_LIN_SRGB[3],
    g1 = LMS_TO_LIN_SRGB[4],
    g2 = LMS_TO_LIN_SRGB[5]
  const b0 = LMS_TO_LIN_SRGB[6],
    b1 = LMS_TO_LIN_SRGB[7],
    b2 = LMS_TO_LIN_SRGB[8]
  const meta = out === src ? undefined : BYTE_OKLAB_SOURCE.get(src)
  for (let i = 0; i < src.length; i += 3) {
    if (meta) {
      const key = meta.keys[i / 3]
      const cached = key === NO_BYTE_KEY ? undefined : meta.values.get(key)
      if (cached && src[i] === cached[0] && src[i + 1] === cached[1] && src[i + 2] === cached[2]) {
        out[i] = ((key >>> 16) & 255) / 255
        out[i + 1] = ((key >>> 8) & 255) / 255
        out[i + 2] = (key & 255) / 255
        continue
      }
    }
    const l = src[i],
      a = src[i + 1],
      b = src[i + 2]
    const lp = p0 * l + p1 * a + p2 * b
    const mp = p3 * l + p4 * a + p5 * b
    const sp = p6 * l + p7 * a + p8 * b
    const l3 = lp * lp * lp
    const m3 = mp * mp * mp
    const s3 = sp * sp * sp
    out[i] = linearToSrgb(r0 * l3 + r1 * m3 + r2 * s3)
    out[i + 1] = linearToSrgb(g0 * l3 + g1 * m3 + g2 * s3)
    out[i + 2] = linearToSrgb(b0 * l3 + b1 * m3 + b2 * s3)
  }
  return out
}

export const simulateBuffer = (
  src: ChannelBuffer,
  srcSpace: ColorSpace,
  type: CVDType,
  severity: number = 1,
  out?: ChannelBuffer,
): ChannelBuffer => {
  validateBuffer('src', src)
  validateOut(src, out)
  if (src.length === 0) return out ?? src

  const linear = convertBuffer(src, srcSpace, 'linear-srgb')
  const simulated = new Float64Array(src.length)

  if (type === 'achromatopsia') {
    for (let i = 0; i < linear.length; i += 3) {
      const l = 0.2126 * linear[i] + 0.7152 * linear[i + 1] + 0.0722 * linear[i + 2]
      simulated[i] = l
      simulated[i + 1] = l
      simulated[i + 2] = l
    }
  } else {
    applyMatrix3x3(matrixFor(type, clamp01(severity)), linear, simulated)
  }

  return convertBuffer(simulated, 'linear-srgb', srcSpace, out)
}

export const toGamutBuffer = (
  src: ChannelBuffer,
  srcSpace: ColorSpace,
  targetSpace: ColorSpace,
  out: ChannelBuffer = new Float64Array(src.length),
): ChannelBuffer => {
  validateBuffer('src', src)
  validateOut(src, out)
  for (let i = 0; i < src.length; i += 3) {
    const color: Color = {
      space: srcSpace,
      channels: new Float64Array([src[i], src[i + 1], src[i + 2]]),
      alpha: 1,
    }
    const mapped = toGamut(targetSpace)(color)
    out[i] = mapped.channels[0]
    out[i + 1] = mapped.channels[1]
    out[i + 2] = mapped.channels[2]
  }
  return out
}
