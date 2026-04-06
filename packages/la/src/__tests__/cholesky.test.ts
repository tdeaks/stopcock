import { describe, it, expect } from 'vitest'
import { Mat } from '../index'

describe('cholesky', () => {
  it('decomposes 2x2 positive definite matrix', () => {
    const m = Mat.fromArray(2, 2, [4, 2, 2, 3])
    const L = Mat.cholesky(m)
    expect(L).not.toBeNull()
    // L * L^T should equal m
    const result = Mat.multiply(L!, Mat.transpose(L!))
    for (let i = 0; i < 4; i++)
      expect(result.data[i]).toBeCloseTo(m.data[i])
  })

  it('decomposes 3x3 positive definite matrix', () => {
    const m = Mat.fromArray(3, 3, [25, 15, -5, 15, 18, 0, -5, 0, 11])
    const L = Mat.cholesky(m)
    expect(L).not.toBeNull()
    const result = Mat.multiply(L!, Mat.transpose(L!))
    for (let i = 0; i < 9; i++)
      expect(result.data[i]).toBeCloseTo(m.data[i])
  })

  it('decomposes identity', () => {
    const I = Mat.identity(3)
    const L = Mat.cholesky(I)
    expect(L).not.toBeNull()
    for (let i = 0; i < 9; i++)
      expect(L!.data[i]).toBeCloseTo(I.data[i])
  })

  it('returns null for non-positive-definite', () => {
    const m = Mat.fromArray(2, 2, [-1, 0, 0, 1])
    expect(Mat.cholesky(m)).toBeNull()
  })

  it('L is lower triangular', () => {
    const m = Mat.fromArray(3, 3, [4, 2, 1, 2, 5, 3, 1, 3, 6])
    const L = Mat.cholesky(m)!
    // Upper triangle should be zero
    expect(L.data[1]).toBe(0) // L[0][1]
    expect(L.data[2]).toBe(0) // L[0][2]
    expect(L.data[5]).toBe(0) // L[1][2]
  })
})
