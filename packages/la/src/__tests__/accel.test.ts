import { describe, it, expect } from 'vitest'
import { accelerate, decelerate, isAccelerated, getDot, getAxpy, getMatmul, getConvolve1d, getColorMatrix3x3 } from '../accel'

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
  })

  it('accelerate enables and decelerate disables', () => {
    const fake = {
      dot: () => 0,
      axpy: () => {},
      matmul: () => {},
      convolve1d: () => {},
      colorMatrix3x3: () => {},
    } as any
    accelerate(fake)
    expect(isAccelerated()).toBe(true)
    expect(getDot()).toBe(fake.dot)
    expect(getAxpy()).toBe(fake.axpy)
    expect(getMatmul()).toBe(fake.matmul)
    expect(getConvolve1d()).toBe(fake.convolve1d)
    expect(getColorMatrix3x3()).toBe(fake.colorMatrix3x3)
    decelerate()
    expect(isAccelerated()).toBe(false)
    expect(getDot()).toBeNull()
  })
})
