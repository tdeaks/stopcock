import { describe, it, expect } from 'vitest'
import * as Vec from '../vec'

const approx = (a: Float64Array, b: number[], tol = 1e-10) => {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 10)
}

describe('Vec', () => {
  it('create', () => {
    const v = Vec.create(1, 2, 3)
    expect(v).toBeInstanceOf(Float64Array)
    approx(v, [1, 2, 3])
  })

  it('zeros/ones', () => {
    approx(Vec.zeros(3), [0, 0, 0])
    approx(Vec.ones(3), [1, 1, 1])
  })

  it('add/sub', () => {
    const a = Vec.create(1, 2, 3)
    const b = Vec.create(4, 5, 6)
    approx(Vec.add(a, b), [5, 7, 9])
    approx(Vec.sub(a, b), [-3, -3, -3])
  })

  it('scale', () => {
    approx(Vec.scale(Vec.create(1, 2, 3), 2), [2, 4, 6])
  })

  it('dot', () => {
    expect(Vec.dot(Vec.create(1, 2, 3), Vec.create(4, 5, 6))).toBe(32)
  })

  it('cross', () => {
    const i = Vec.create(1, 0, 0)
    const j = Vec.create(0, 1, 0)
    approx(Vec.cross(i, j), [0, 0, 1])
    approx(Vec.cross(j, i), [0, 0, -1])
  })

  it('norm', () => {
    expect(Vec.norm(Vec.create(3, 4))).toBeCloseTo(5)
  })

  it('normalize', () => {
    const v = Vec.normalize(Vec.create(3, 4))
    expect(Vec.norm(v)).toBeCloseTo(1)
    approx(v, [0.6, 0.8])
  })

  it('normalize zero vector', () => {
    approx(Vec.normalize(Vec.zeros(3)), [0, 0, 0])
  })

  it('distance', () => {
    expect(Vec.distance(Vec.create(0, 0), Vec.create(3, 4))).toBeCloseTo(5)
  })

  it('lerp', () => {
    const a = Vec.create(0, 0)
    const b = Vec.create(10, 20)
    approx(Vec.lerp(a, b, 0), [0, 0])
    approx(Vec.lerp(a, b, 1), [10, 20])
    approx(Vec.lerp(a, b, 0.5), [5, 10])
  })

  it('axpy', () => {
    const x = Vec.create(1, 2, 3)
    const y = Vec.create(10, 20, 30)
    approx(Vec.axpy(2, x, y), [12, 24, 36])
  })

  it('addInto', () => {
    const out = Vec.zeros(3)
    const a = Vec.create(1, 2, 3)
    const b = Vec.create(4, 5, 6)
    Vec.addInto(out, a, b)
    approx(out, [5, 7, 9])
  })

  it('scaleInto', () => {
    const out = Vec.zeros(3)
    Vec.scaleInto(out, Vec.create(1, 2, 3), 4)
    approx(out, [4, 8, 12])
  })

  it('axpyInto', () => {
    const out = Vec.zeros(3)
    Vec.axpyInto(out, 2, Vec.create(1, 2, 3), Vec.create(10, 20, 30))
    approx(out, [12, 24, 36])
  })

  it('dot with 2d vectors', () => {
    expect(Vec.dot(Vec.create(3, 4), Vec.create(1, 2))).toBe(11)
  })

  it('dot with 4d vectors', () => {
    expect(Vec.dot(Vec.create(1, 2, 3, 4), Vec.create(5, 6, 7, 8))).toBe(70)
  })

  it('dot generic fallback (5d)', () => {
    const a = Vec.create(1, 2, 3, 4, 5)
    const b = Vec.create(5, 4, 3, 2, 1)
    expect(Vec.dot(a, b)).toBe(35)
  })

  it('add/sub with unrolled tail (5 elements)', () => {
    const a = Vec.create(1, 2, 3, 4, 5)
    const b = Vec.create(10, 20, 30, 40, 50)
    approx(Vec.add(a, b), [11, 22, 33, 44, 55])
    approx(Vec.sub(a, b), [-9, -18, -27, -36, -45])
  })

  it('scale with unrolled tail (5 elements)', () => {
    approx(Vec.scale(Vec.create(1, 2, 3, 4, 5), 3), [3, 6, 9, 12, 15])
  })

  it('lerp with unrolled tail (5 elements)', () => {
    const a = Vec.create(0, 0, 0, 0, 0)
    const b = Vec.create(10, 20, 30, 40, 50)
    approx(Vec.lerp(a, b, 0.5), [5, 10, 15, 20, 25])
  })

  it('axpy with unrolled tail (5 elements)', () => {
    const x = Vec.create(1, 2, 3, 4, 5)
    const y = Vec.create(10, 20, 30, 40, 50)
    approx(Vec.axpy(2, x, y), [12, 24, 36, 48, 60])
  })

  it('add/sub with exact multiple of 4', () => {
    const a = Vec.create(1, 2, 3, 4, 5, 6, 7, 8)
    const b = Vec.create(8, 7, 6, 5, 4, 3, 2, 1)
    approx(Vec.add(a, b), [9, 9, 9, 9, 9, 9, 9, 9])
    approx(Vec.sub(a, b), [-7, -5, -3, -1, 1, 3, 5, 7])
  })

  it('norm of zero vector', () => {
    expect(Vec.norm(Vec.zeros(3))).toBe(0)
  })

  it('distance between same points', () => {
    const v = Vec.create(1, 2, 3)
    expect(Vec.distance(v, v)).toBe(0)
  })

  it('cross product orthogonality', () => {
    const a = Vec.create(1, 2, 3)
    const b = Vec.create(4, 5, 6)
    const c = Vec.cross(a, b)
    expect(Vec.dot(a, c)).toBeCloseTo(0)
    expect(Vec.dot(b, c)).toBeCloseTo(0)
  })
})
