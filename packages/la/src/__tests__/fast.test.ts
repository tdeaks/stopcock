import { describe, it, expect } from 'vitest'
import { dot2, dot3, dot4, mul2x2, mul3x3, mul4x4, det4x4 } from '../fast'
import { Vec, Mat } from '../index'

describe('dot fast paths', () => {
  it('dot2 matches generic', () => {
    const a = new Float64Array([3, 4])
    const b = new Float64Array([1, 2])
    expect(dot2(a, b)).toBe(Vec.dot(a, b))
  })

  it('dot3 matches generic', () => {
    const a = new Float64Array([1, 2, 3])
    const b = new Float64Array([4, 5, 6])
    expect(dot3(a, b)).toBe(Vec.dot(a, b))
  })

  it('dot4 matches generic', () => {
    const a = new Float64Array([1, 2, 3, 4])
    const b = new Float64Array([5, 6, 7, 8])
    expect(dot4(a, b)).toBe(Vec.dot(a, b))
  })
})

describe('matmul fast paths', () => {
  it('mul2x2 matches generic', () => {
    const a = Mat.fromArray(2, 2, [1, 2, 3, 4])
    const b = Mat.fromArray(2, 2, [5, 6, 7, 8])
    const expected = Mat.multiply(a, b)
    const out = new Float64Array(4)
    mul2x2(a.data, b.data, out)
    expect(Array.from(out)).toEqual(Array.from(expected.data))
  })

  it('mul3x3 matches generic', () => {
    const a = Mat.fromArray(3, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9])
    const b = Mat.fromArray(3, 3, [9, 8, 7, 6, 5, 4, 3, 2, 1])
    const expected = Mat.multiply(a, b)
    const out = new Float64Array(9)
    mul3x3(a.data, b.data, out)
    expect(Array.from(out)).toEqual(Array.from(expected.data))
  })

  it('mul4x4 matches generic', () => {
    const a = Mat.fromArray(4, 4, Array.from({ length: 16 }, (_, i) => i + 1))
    const b = Mat.fromArray(4, 4, Array.from({ length: 16 }, (_, i) => 16 - i))
    const out = new Float64Array(16)
    mul4x4(a.data, b.data, out)
    // Verify against a known manual calculation for the first element
    // Row 0 of a: [1,2,3,4], Col 0 of b: [16,12,8,4]
    expect(out[0]).toBe(1 * 16 + 2 * 12 + 3 * 8 + 4 * 4)
  })
})

describe('det4x4', () => {
  it('identity has determinant 1', () => {
    expect(det4x4(Mat.identity(4).data)).toBeCloseTo(1)
  })

  it('matches LU-based determinant', () => {
    const m = Mat.fromArray(4, 4, [2, 3, 1, 5, 1, 0, 3, 1, 0, 2, -3, 2, 0, 2, 3, 1])
    expect(det4x4(m.data)).toBeCloseTo(Mat.determinant(m))
  })
})
