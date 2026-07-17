import type { Real, Window } from './types'
import { assertPositiveFinite, assertPositiveInteger, assertWindow, fail } from './validate'

const sincKernel = (x: number): number => {
  if (Math.abs(x) < 1e-12) return 1
  const pix = Math.PI * x
  return Math.sin(pix) / pix
}

const windowValue = (kind: Window, distance: number, width: number): number => {
  const x = Math.abs(distance) / width
  if (x >= 1) return 0
  switch (kind) {
    case 'rect': return 1
    case 'hann': return 0.5 + 0.5 * Math.cos(Math.PI * x)
    case 'hamming': return 0.54 + 0.46 * Math.cos(Math.PI * x)
    case 'blackman': return 0.42 + 0.5 * Math.cos(Math.PI * x) + 0.08 * Math.cos(2 * Math.PI * x)
    case 'blackman-harris':
      return 0.35875 + 0.48829 * Math.cos(Math.PI * x) + 0.14128 * Math.cos(2 * Math.PI * x) + 0.01168 * Math.cos(3 * Math.PI * x)
    case 'triangular': return 1 - x
  }
}

export function outputLength(inLen: number, ratio: number): number {
  if (!Number.isInteger(inLen) || inLen < 0) fail('inLen must be an integer >= 0')
  assertPositiveFinite(ratio, 'ratio')
  return Math.floor(inLen * ratio)
}

export function linear(buf: Real, ratio: number, out: Real): Real {
  assertPositiveFinite(ratio, 'ratio')
  if (out.length !== outputLength(buf.length, ratio)) {
    fail('out.length must equal resample.outputLength(buf.length, ratio)')
  }
  if (buf.length === 0) return out
  if (buf.length === 1) {
    out.fill(buf[0])
    return out
  }

  for (let i = 0; i < out.length; i++) {
    const pos = i / ratio
    const left = Math.floor(pos)
    const frac = pos - left
    const right = Math.min(left + 1, buf.length - 1)
    out[i] = buf[left] * (1 - frac) + buf[right] * frac
  }
  return out
}

export function sinc(
  buf: Real,
  ratio: number,
  opts: { width: number, window: Window, out: Real },
): Real {
  assertPositiveFinite(ratio, 'ratio')
  assertPositiveInteger(opts.width, 'opts.width')
  assertWindow(opts.window, 'opts.window')
  if (opts.out.length !== outputLength(buf.length, ratio)) {
    fail('opts.out.length must equal resample.outputLength(buf.length, ratio)')
  }
  const out = opts.out
  if (buf.length === 0) return out

  for (let i = 0; i < out.length; i++) {
    const pos = i / ratio
    const start = Math.ceil(pos - opts.width)
    const end = Math.floor(pos + opts.width)
    let acc = 0
    let weight = 0
    for (let source = start; source <= end; source++) {
      if (source < 0 || source >= buf.length) continue
      const d = pos - source
      const w = sincKernel(d) * windowValue(opts.window, d, opts.width)
      acc += buf[source] * w
      weight += w
    }
    out[i] = Math.abs(weight) > 1e-15 ? acc / weight : 0
  }

  return out
}

export function polyphase(buf: Real, up: number, down: number, taps: Real, out: Real): Real {
  assertPositiveInteger(up, 'up')
  assertPositiveInteger(down, 'down')
  if (taps.length < up) fail('taps.length must be >= up')
  if (out.length !== Math.floor(buf.length * up / down)) {
    fail('out.length must equal Math.floor(buf.length * up / down)')
  }

  for (let m = 0; m < out.length; m++) {
    const t = m * down
    let acc = 0
    for (let k = 0; k < taps.length; k++) {
      const sourceTick = t - k
      if (sourceTick % up !== 0) continue
      const source = sourceTick / up
      if (source < 0 || source >= buf.length) continue
      acc += taps[k] * buf[source]
    }
    out[m] = acc
  }

  return out
}
