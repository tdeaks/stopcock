import type { Real, Window } from './types'
import { assertPositiveInteger, assertSameLength, assertWindow } from './validate'
import { dual } from './dual'

const allocate = (n: number): Real => new Float32Array(n)

export function rect(n: number): Real {
  assertPositiveInteger(n, 'n')
  const out = allocate(n)
  out.fill(1)
  return out
}

export function hann(n: number): Real {
  assertPositiveInteger(n, 'n')
  const out = allocate(n)
  if (n === 1) {
    out[0] = 1
    return out
  }
  const scale = (2 * Math.PI) / (n - 1)
  for (let i = 0; i < n; i++) out[i] = 0.5 - 0.5 * Math.cos(scale * i)
  return out
}

export function hamming(n: number): Real {
  assertPositiveInteger(n, 'n')
  const out = allocate(n)
  if (n === 1) {
    out[0] = 1
    return out
  }
  const scale = (2 * Math.PI) / (n - 1)
  for (let i = 0; i < n; i++) out[i] = 0.54 - 0.46 * Math.cos(scale * i)
  return out
}

export function blackman(n: number): Real {
  assertPositiveInteger(n, 'n')
  const out = allocate(n)
  if (n === 1) {
    out[0] = 1
    return out
  }
  const scale = (2 * Math.PI) / (n - 1)
  for (let i = 0; i < n; i++) {
    const x = scale * i
    out[i] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x)
  }
  return out
}

export function blackmanHarris(n: number): Real {
  assertPositiveInteger(n, 'n')
  const out = allocate(n)
  if (n === 1) {
    out[0] = 1
    return out
  }
  const scale = (2 * Math.PI) / (n - 1)
  for (let i = 0; i < n; i++) {
    const x = scale * i
    out[i] = 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x)
  }
  return out
}

export function triangular(n: number): Real {
  assertPositiveInteger(n, 'n')
  const out = allocate(n)
  if (n === 1) {
    out[0] = 1
    return out
  }
  const denom = n % 2 === 0 ? n : n + 1
  for (let i = 0; i < n; i++) out[i] = 1 - Math.abs((i - (n - 1) / 2) / (denom / 2))
  return out
}

export function create(kind: Window, n: number): Real {
  assertWindow(kind)
  switch (kind) {
    case 'hann':
      return hann(n)
    case 'hamming':
      return hamming(n)
    case 'blackman':
      return blackman(n)
    case 'blackman-harris':
      return blackmanHarris(n)
    case 'triangular':
      return triangular(n)
    case 'rect':
      return rect(n)
  }
}

export const apply: {
  (buf: Real, w: Real, out: Real): Real
  (w: Real, out: Real): (buf: Real) => Real
} = dual(3, (buf: Real, w: Real, out: Real): Real => {
  assertSameLength(buf.length, w.length, 'buf', 'w')
  assertSameLength(buf.length, out.length, 'buf', 'out')
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * w[i]
  return out
})
