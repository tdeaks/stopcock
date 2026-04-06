import { bench, describe } from 'vitest'
import { Vec, Mat } from '@stopcock/la'

// -- Vectors at different sizes --

const v3a = Vec.create(1, 2, 3)
const v3b = Vec.create(4, 5, 6)
const v100a = new Float64Array(100).map((_, i) => i)
const v100b = new Float64Array(100).map((_, i) => i * 2)
const v10k = new Float64Array(10_000).map((_, i) => Math.sin(i))
const v10kb = new Float64Array(10_000).map((_, i) => Math.cos(i))

describe('Vec.add', () => {
  bench('3d', () => Vec.add(v3a, v3b))
  bench('100d', () => Vec.add(v100a, v100b))
  bench('10,000d', () => Vec.add(v10k, v10kb))
})

describe('Vec.dot', () => {
  bench('3d', () => Vec.dot(v3a, v3b))
  bench('100d', () => Vec.dot(v100a, v100b))
  bench('10,000d', () => Vec.dot(v10k, v10kb))
})

describe('Vec.normalize', () => {
  bench('3d', () => Vec.normalize(v3a))
  bench('100d', () => Vec.normalize(v100a))
  bench('10,000d', () => Vec.normalize(v10k))
})

describe('Vec.cross', () => {
  bench('3d', () => Vec.cross(v3a, v3b))
})

describe('Vec.lerp', () => {
  bench('3d', () => Vec.lerp(v3a, v3b, 0.5))
  bench('100d', () => Vec.lerp(v100a, v100b, 0.5))
  bench('10,000d', () => Vec.lerp(v10k, v10kb, 0.5))
})

// -- Matrices at different sizes --

const randomMat = (n: number) =>
  Mat.fromArray(n, n, Array.from({ length: n * n }, () => Math.random() * 10 - 5))

const m4a = randomMat(4)
const m4b = randomMat(4)
const m16a = randomMat(16)
const m16b = randomMat(16)
const m64a = randomMat(64)
const m64b = randomMat(64)
const m128a = randomMat(128)
const m128b = randomMat(128)

describe('Mat.multiply', () => {
  bench('4x4', () => Mat.multiply(m4a, m4b))
  bench('16x16', () => Mat.multiply(m16a, m16b))
  bench('64x64', () => Mat.multiply(m64a, m64b))
  bench('128x128', () => Mat.multiply(m128a, m128b))
})

describe('Mat.transpose', () => {
  bench('4x4', () => Mat.transpose(m4a))
  bench('16x16', () => Mat.transpose(m16a))
  bench('64x64', () => Mat.transpose(m64a))
  bench('128x128', () => Mat.transpose(m128a))
})

describe('Mat.determinant', () => {
  bench('4x4', () => Mat.determinant(m4a))
  bench('16x16', () => Mat.determinant(m16a))
  bench('64x64', () => Mat.determinant(m64a))
})

describe('Mat.inverse', () => {
  bench('4x4', () => Mat.inverse(m4a))
  bench('16x16', () => Mat.inverse(m16a))
  bench('64x64', () => Mat.inverse(m64a))
})

describe('Mat.lu', () => {
  bench('4x4', () => Mat.lu(m4a))
  bench('16x16', () => Mat.lu(m16a))
  bench('64x64', () => Mat.lu(m64a))
  bench('128x128', () => Mat.lu(m128a))
})

describe('Mat.qr', () => {
  bench('4x4', () => Mat.qr(m4a))
  bench('16x16', () => Mat.qr(m16a))
  bench('64x64', () => Mat.qr(m64a))
})

describe('Mat.svd', () => {
  bench('4x4', () => Mat.svd(m4a))
  bench('16x16', () => Mat.svd(m16a))
})

describe('Mat.eigenvalues', () => {
  // eigenvalues requires symmetric matrices
  const symmetric = (n: number) => {
    const a = randomMat(n)
    const at = Mat.transpose(a)
    return Mat.add(a, at) // A + A^T is symmetric
  }
  const s4 = symmetric(4)
  const s16 = symmetric(16)

  bench('4x4 symmetric', () => Mat.eigenvalues(s4))
  bench('16x16 symmetric', () => Mat.eigenvalues(s16))
})

describe('Mat.solve', () => {
  const b4 = new Float64Array([1, 2, 3, 4])
  const b16 = new Float64Array(16).map((_, i) => i)
  const b64 = new Float64Array(64).map((_, i) => i)

  bench('4x4', () => Mat.solve(m4a, b4))
  bench('16x16', () => Mat.solve(m16a, b16))
  bench('64x64', () => Mat.solve(m64a, b64))
})

