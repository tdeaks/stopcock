import { describe, it, expect } from 'vitest'
import * as Mat from '../mat'
import * as Vec from '../vec'

const approxMat = (a: Mat.Mat, expected: number[], tol = 1e-8) => {
  expect(a.data.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++)
    expect(a.data[i]).toBeCloseTo(expected[i], 8)
}

const approxVec = (a: Float64Array, expected: number[], tol = 1e-8) => {
  expect(a.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++)
    expect(a[i]).toBeCloseTo(expected[i], 8)
}

describe('Mat', () => {
  it('identity', () => {
    const I = Mat.identity(3)
    approxMat(I, [1, 0, 0, 0, 1, 0, 0, 0, 1])
  })

  it('get/set immutable', () => {
    const m = Mat.fromArray(2, 2, [1, 2, 3, 4])
    expect(Mat.get(m, 0, 1)).toBe(2)
    const m2 = Mat.set(m, 0, 1, 99)
    expect(Mat.get(m, 0, 1)).toBe(2)
    expect(Mat.get(m2, 0, 1)).toBe(99)
  })

  it('add/sub', () => {
    const a = Mat.fromArray(2, 2, [1, 2, 3, 4])
    const b = Mat.fromArray(2, 2, [5, 6, 7, 8])
    approxMat(Mat.add(a, b), [6, 8, 10, 12])
    approxMat(Mat.sub(a, b), [-4, -4, -4, -4])
  })

  it('multiply identity', () => {
    const A = Mat.fromArray(3, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9])
    const I = Mat.identity(3)
    approxMat(Mat.multiply(I, A), [1, 2, 3, 4, 5, 6, 7, 8, 9])
    approxMat(Mat.multiply(A, I), [1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('multiply 2x2', () => {
    const a = Mat.fromArray(2, 2, [1, 2, 3, 4])
    const b = Mat.fromArray(2, 2, [5, 6, 7, 8])
    approxMat(Mat.multiply(a, b), [19, 22, 43, 50])
  })

  it('multiply non-square', () => {
    const a = Mat.fromArray(2, 3, [1, 2, 3, 4, 5, 6])
    const b = Mat.fromArray(3, 2, [7, 8, 9, 10, 11, 12])
    const c = Mat.multiply(a, b)
    expect(c.rows).toBe(2)
    expect(c.cols).toBe(2)
    approxMat(c, [58, 64, 139, 154])
  })

  it('transpose', () => {
    const m = Mat.fromArray(2, 3, [1, 2, 3, 4, 5, 6])
    const t = Mat.transpose(m)
    expect(t.rows).toBe(3)
    expect(t.cols).toBe(2)
    approxMat(t, [1, 4, 2, 5, 3, 6])
  })

  it('trace', () => {
    expect(Mat.trace(Mat.fromArray(3, 3, [1, 0, 0, 0, 5, 0, 0, 0, 9]))).toBe(15)
  })

  it('determinant 2x2', () => {
    expect(Mat.determinant(Mat.fromArray(2, 2, [3, 8, 4, 6]))).toBeCloseTo(-14)
  })

  it('determinant 3x3', () => {
    expect(Mat.determinant(Mat.fromArray(3, 3, [6, 1, 1, 4, -2, 5, 2, 8, 7]))).toBeCloseTo(-306)
  })

  it('determinant 4x4', () => {
    const m = Mat.fromArray(4, 4, [
      1, 2, 3, 4,
      5, 6, 7, 8,
      2, 6, 4, 8,
      3, 1, 1, 2,
    ])
    expect(Mat.determinant(m)).toBeCloseTo(72)
  })

  it('inverse 2x2', () => {
    const m = Mat.fromArray(2, 2, [4, 7, 2, 6])
    const inv = Mat.inverse(m)!
    const prod = Mat.multiply(m, inv)
    approxMat(prod, [1, 0, 0, 1])
  })

  it('inverse 3x3', () => {
    const m = Mat.fromArray(3, 3, [1, 2, 3, 0, 1, 4, 5, 6, 0])
    const inv = Mat.inverse(m)!
    const prod = Mat.multiply(m, inv)
    const I = Mat.identity(3)
    for (let i = 0; i < 9; i++) expect(prod.data[i]).toBeCloseTo(I.data[i], 8)
  })

  it('inverse singular returns null', () => {
    const m = Mat.fromArray(2, 2, [1, 2, 2, 4])
    expect(Mat.inverse(m)).toBeNull()
  })

  it('solve Ax = b', () => {
    const A = Mat.fromArray(3, 3, [2, 1, -1, -3, -1, 2, -2, 1, 2])
    const b = Vec.create(8, -11, -3)
    const x = Mat.solve(A, b)
    approxVec(x, [2, 3, -1])
  })

  it('LU decomposition PA = LU', () => {
    const A = Mat.fromArray(3, 3, [2, 1, 1, 4, 3, 3, 8, 7, 9])
    const { L, U, P } = Mat.lu(A)
    const LU = Mat.multiply(L, U)
    const PA = Mat.create(3, 3)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        PA.data[i * 3 + j] = A.data[P[i] * 3 + j]
    for (let i = 0; i < 9; i++) expect(LU.data[i]).toBeCloseTo(PA.data[i], 8)
  })

  it('QR decomposition A = QR', () => {
    const A = Mat.fromArray(3, 3, [12, -51, 4, 6, 167, -68, -4, 24, -41])
    const { Q, R } = Mat.qr(A)
    const QR = Mat.multiply(Q, R)
    for (let i = 0; i < 9; i++) expect(QR.data[i]).toBeCloseTo(A.data[i], 8)

    const QtQ = Mat.multiply(Mat.transpose(Q), Q)
    const I = Mat.identity(3)
    for (let i = 0; i < 9; i++) expect(QtQ.data[i]).toBeCloseTo(I.data[i], 8)
  })

  it('eigenvalues of diagonal matrix', () => {
    const D = Mat.fromArray(3, 3, [5, 0, 0, 0, 3, 0, 0, 0, 1])
    const eigs = Mat.eigenvalues(D)
    const sorted = Array.from(eigs).sort((a, b) => b - a)
    expect(sorted[0]).toBeCloseTo(5)
    expect(sorted[1]).toBeCloseTo(3)
    expect(sorted[2]).toBeCloseTo(1)
  })

  it('eigenvalues of symmetric matrix', () => {
    const A = Mat.fromArray(2, 2, [2, 1, 1, 2])
    const eigs = Mat.eigenvalues(A)
    const sorted = Array.from(eigs).sort((a, b) => b - a)
    expect(sorted[0]).toBeCloseTo(3)
    expect(sorted[1]).toBeCloseTo(1)
  })

  it('SVD: U * diag(S) * V^T = A', () => {
    const A = Mat.fromArray(2, 2, [3, 2, 2, 3])
    const { U, S, V } = Mat.svd(A)

    const sigma = Mat.create(2, 2)
    sigma.data[0] = S[0]
    sigma.data[3] = S[1]
    const reconstructed = Mat.multiply(Mat.multiply(U, sigma), Mat.transpose(V))
    for (let i = 0; i < 4; i++) expect(reconstructed.data[i]).toBeCloseTo(A.data[i], 6)
  })

  it('SVD: singular values are non-negative and sorted', () => {
    const A = Mat.fromArray(3, 3, [1, 2, 3, 4, 5, 6, 7, 8, 10])
    const { S } = Mat.svd(A)
    for (let i = 0; i < S.length; i++) expect(S[i]).toBeGreaterThanOrEqual(0)
    for (let i = 1; i < S.length; i++) expect(S[i - 1]).toBeGreaterThanOrEqual(S[i] - 1e-10)
  })

  it('Frobenius norm', () => {
    const m = Mat.fromArray(2, 2, [1, 2, 3, 4])
    expect(Mat.norm(m)).toBeCloseTo(Math.sqrt(30))
  })

  it('scale', () => {
    approxMat(Mat.scale(Mat.fromArray(2, 2, [1, 2, 3, 4]), 3), [3, 6, 9, 12])
  })

  describe('validation', () => {
    it('multiply with incompatible dimensions throws', () => {
      const a = Mat.fromArray(2, 3, [1, 2, 3, 4, 5, 6])
      const b = Mat.fromArray(2, 2, [1, 2, 3, 4])
      expect(() => Mat.multiply(a, b)).toThrow(/incompatible dimensions/)
    })

    it('add with different dimensions throws', () => {
      const a = Mat.fromArray(2, 2, [1, 2, 3, 4])
      const b = Mat.fromArray(3, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9])
      expect(() => Mat.add(a, b)).toThrow(/incompatible dimensions/)
    })

    it('sub with different dimensions throws', () => {
      const a = Mat.fromArray(2, 3, [1, 2, 3, 4, 5, 6])
      const b = Mat.fromArray(2, 2, [1, 2, 3, 4])
      expect(() => Mat.sub(a, b)).toThrow(/incompatible dimensions/)
    })

    it('solve with singular matrix throws', () => {
      const A = Mat.fromArray(2, 2, [1, 2, 2, 4])
      const b = Vec.create(1, 2)
      expect(() => Mat.solve(A, b)).toThrow(/singular/)
    })

    it('solve with non-square matrix throws', () => {
      const A = Mat.fromArray(2, 3, [1, 2, 3, 4, 5, 6])
      const b = Vec.create(1, 2)
      expect(() => Mat.solve(A, b)).toThrow(/square/)
    })

    it('solve with incompatible vector length throws', () => {
      const A = Mat.fromArray(3, 3, [1, 0, 0, 0, 1, 0, 0, 0, 1])
      const b = Vec.create(1, 2)
      expect(() => Mat.solve(A, b)).toThrow(/incompatible/)
    })

    it('eigenvalues with non-symmetric matrix throws', () => {
      const A = Mat.fromArray(2, 2, [1, 5, 0, 2])
      expect(() => Mat.eigenvalues(A)).toThrow(/symmetric/)
    })

    it('eigenvalues with non-square matrix throws', () => {
      const A = Mat.fromArray(2, 3, [1, 2, 3, 4, 5, 6])
      expect(() => Mat.eigenvalues(A)).toThrow(/square/)
    })

    it('svd with empty matrix throws', () => {
      const A = Mat.create(0, 0)
      expect(() => Mat.svd(A)).toThrow(/non-empty/)
    })

    it('svd with zero rows throws', () => {
      const A = Mat.create(0, 3)
      expect(() => Mat.svd(A)).toThrow(/non-empty/)
    })
  })

  describe('solve well-conditioned 4x4', () => {
    it('solves correctly', () => {
      // Hilbert-like but well-conditioned: diagonal-dominant
      const A = Mat.fromArray(4, 4, [
        10, 1, 0, 0,
        1, 10, 1, 0,
        0, 1, 10, 1,
        0, 0, 1, 10,
      ])
      const expected = [1, 2, 3, 4]
      // b = A * expected
      const bArr = new Float64Array(4)
      for (let i = 0; i < 4; i++) {
        let s = 0
        for (let j = 0; j < 4; j++) s += A.data[i * 4 + j] * expected[j]
        bArr[i] = s
      }
      const x = Mat.solve(A, bArr)
      approxVec(x, expected)
    })
  })

  describe('inverse 4x4', () => {
    it('A * A^-1 = I', () => {
      const A = Mat.fromArray(4, 4, [
        5, 7, 6, 5,
        7, 10, 8, 7,
        6, 8, 10, 9,
        5, 7, 9, 10,
      ])
      const inv = Mat.inverse(A)
      expect(inv).not.toBeNull()
      const prod = Mat.multiply(A, inv!)
      const I = Mat.identity(4)
      for (let i = 0; i < 16; i++) expect(prod.data[i]).toBeCloseTo(I.data[i], 6)
    })
  })

  it('determinant 5x5 via LU', () => {
    const A = Mat.fromArray(5, 5, [
      2, 1, 0, 0, 0,
      1, 3, 1, 0, 0,
      0, 1, 4, 1, 0,
      0, 0, 1, 5, 1,
      0, 0, 0, 1, 6,
    ])
    const det = Mat.determinant(A)
    expect(det).toBeCloseTo(492)
  })

  it('determinant 1x1', () => {
    expect(Mat.determinant(Mat.fromArray(1, 1, [7]))).toBe(7)
  })

  it('multiplyInto writes result into existing buffer', () => {
    const a = Mat.fromArray(2, 2, [1, 2, 3, 4])
    const b = Mat.fromArray(2, 2, [5, 6, 7, 8])
    const out = Mat.zeros(2, 2)
    Mat.multiplyInto(out, a, b)
    approxMat(out, [19, 22, 43, 50])
  })

  it('multiplyInto throws on incompatible dims', () => {
    const a = Mat.fromArray(2, 3, [1, 2, 3, 4, 5, 6])
    const b = Mat.fromArray(2, 2, [1, 2, 3, 4])
    const out = Mat.zeros(2, 2)
    expect(() => Mat.multiplyInto(out, a, b)).toThrow(/incompatible/)
  })

  it('multiply 4x4 uses fast path', () => {
    const a = Mat.fromArray(4, 4, [
      1, 0, 0, 0,
      0, 2, 0, 0,
      0, 0, 3, 0,
      0, 0, 0, 4,
    ])
    const b = Mat.identity(4)
    approxMat(Mat.multiply(a, b), [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4])
  })

  it('cholesky throws on non-square', () => {
    const m = Mat.fromArray(2, 3, [1, 2, 3, 4, 5, 6])
    expect(() => Mat.cholesky(m)).toThrow(/square/)
  })

  it('multiply large matrices uses block path', () => {
    const n = 34
    const a = Mat.identity(n)
    const b = Mat.identity(n)
    const c = Mat.multiply(a, b)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        expect(c.data[i * n + j]).toBeCloseTo(i === j ? 1 : 0)
  })

  it('zeros creates zero matrix', () => {
    const z = Mat.zeros(3, 2)
    expect(z.rows).toBe(3)
    expect(z.cols).toBe(2)
    for (let i = 0; i < 6; i++) expect(z.data[i]).toBe(0)
  })
})

