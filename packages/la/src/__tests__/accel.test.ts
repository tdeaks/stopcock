import { describe, it, expect } from 'vite-plus/test'
import {
  accelerate,
  decelerate,
  isAccelerated,
  getDot,
  getAxpy,
  getMatmul,
  getConvolve1d,
  getColorMatrix3x3,
  getColorMatrix3x3Float,
} from '../accel'

describe('accel', () => {
  it('starts unaccelerated', () => {
    expect(isAccelerated()).toBe(false)
  })

  it('getters return null when not accelerated', () => {
    decelerate()
    expect(getDot()).toBeNull()
    expect(getAxpy()).toBeNull()
    expect(getMatmul()).toBeNull()
    expect(getConvolve1d()).toBeNull()
    expect(getColorMatrix3x3()).toBeNull()
    expect(getColorMatrix3x3Float()).toBeNull()
  })

  it('accelerate enables and decelerate disables', () => {
    const fake = {
      dot: () => 0,
      axpy: () => {},
      matmul: () => {},
      convolve1d: () => {},
      colorMatrix3x3: () => {},
      colorMatrix3x3Float: () => {},
    } as any
    accelerate(fake)
    expect(isAccelerated()).toBe(true)
    expect(getDot()).toBe(fake.dot)
    expect(getAxpy()).toBe(fake.axpy)
    expect(getMatmul()).toBe(fake.matmul)
    expect(getConvolve1d()).toBe(fake.convolve1d)
    expect(getColorMatrix3x3()).toBe(fake.colorMatrix3x3)
    expect(getColorMatrix3x3Float()).toBe(fake.colorMatrix3x3Float)
    decelerate()
    expect(isAccelerated()).toBe(false)
    expect(getDot()).toBeNull()
  })
})
