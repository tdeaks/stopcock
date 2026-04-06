import { describe, it, expect } from 'vitest'
import { sumOfSquares, convolve1dFloat, complexMulAccum, applyColorMatrix3x3, convolve2dSeparable } from '../primitives'

describe('sumOfSquares', () => {
  it('computes sum of squares', () => {
    const a = new Float64Array([1, 2, 3, 4])
    expect(sumOfSquares(a, 4)).toBe(30) // 1+4+9+16
  })

  it('handles odd lengths', () => {
    const a = new Float64Array([3, 4, 5])
    expect(sumOfSquares(a, 3)).toBe(50)
  })

  it('handles empty', () => {
    expect(sumOfSquares(new Float64Array(0), 0)).toBe(0)
  })
})

describe('convolve1dFloat', () => {
  it('convolves signal with kernel', () => {
    const src = new Float64Array([1, 2, 3, 4, 5])
    const kernel = new Float64Array([1, 0, -1])
    const out = new Float64Array(7)
    convolve1dFloat(out, src, kernel, 5, 3)
    // [1*1, 2*1+1*0, 3*1+2*0+1*-1, 4*1+3*0+2*-1, 5*1+4*0+3*-1, 5*0+4*-1, 5*-1]
    expect(out[0]).toBe(1)
    expect(out[2]).toBe(2) // 3-1
    expect(out[3]).toBe(2) // 4-2
  })

  it('identity kernel preserves signal', () => {
    const src = new Float64Array([1, 2, 3])
    const kernel = new Float64Array([1])
    const out = new Float64Array(3)
    convolve1dFloat(out, src, kernel, 3, 1)
    expect(Array.from(out)).toEqual([1, 2, 3])
  })
})

describe('complexMulAccum', () => {
  it('multiplies complex arrays', () => {
    // (1+2i) * (3+4i) = (3-8) + (4+6)i = -5 + 10i
    const a = new Float64Array([1, 2])
    const b = new Float64Array([3, 4])
    const out = new Float64Array(2)
    complexMulAccum(out, a, b, 1)
    expect(out[0]).toBe(-5)
    expect(out[1]).toBe(10)
  })

  it('handles multiple complex pairs', () => {
    const a = new Float64Array([1, 0, 0, 1])  // 1+0i, 0+1i
    const b = new Float64Array([0, 1, 0, 1])  // 0+1i, 0+1i
    const out = new Float64Array(4)
    complexMulAccum(out, a, b, 2)
    // (1)(0+i) = 0+i
    expect(out[0]).toBeCloseTo(0)
    expect(out[1]).toBeCloseTo(1)
    // (i)(i) = -1
    expect(out[2]).toBeCloseTo(-1)
    expect(out[3]).toBeCloseTo(0)
  })
})

describe('applyColorMatrix3x3', () => {
  it('identity matrix preserves colors', () => {
    const identity = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
    const src = new Uint8ClampedArray([100, 150, 200, 255])
    const out = new Uint8ClampedArray(4)
    applyColorMatrix3x3(out, src, identity, 1)
    expect(out[0]).toBe(100)
    expect(out[1]).toBe(150)
    expect(out[2]).toBe(200)
    expect(out[3]).toBe(255)
  })

  it('grayscale matrix averages channels', () => {
    const gray = new Float64Array([0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114])
    const src = new Uint8ClampedArray([255, 0, 0, 255]) // pure red
    const out = new Uint8ClampedArray(4)
    applyColorMatrix3x3(out, src, gray, 1)
    // 0.299*255 = 76.245 -> 76
    expect(out[0]).toBe(76)
    expect(out[1]).toBe(76)
    expect(out[2]).toBe(76)
  })

  it('clamps output to 0-255', () => {
    const bright = new Float64Array([2, 0, 0, 0, 2, 0, 0, 0, 2])
    const src = new Uint8ClampedArray([200, 200, 200, 255])
    const out = new Uint8ClampedArray(4)
    applyColorMatrix3x3(out, src, bright, 1)
    expect(out[0]).toBe(255) // clamped
  })
})

describe('convolve2dSeparable', () => {
  it('uniform kernel produces average', () => {
    // 3x3 image, all 128 in one channel, box kernel
    const w = 3, h = 3, ch = 1
    const src = new Uint8ClampedArray(w * h * ch)
    src.fill(128)
    const out = new Uint8ClampedArray(w * h * ch)
    const kernel = new Float64Array([1 / 3, 1 / 3, 1 / 3])
    convolve2dSeparable(out, src, w, h, ch, kernel, kernel)
    // Center pixel should still be ~128 (average of all 128s)
    expect(out[4]).toBeGreaterThan(120)
    expect(out[4]).toBeLessThan(136)
  })
})
