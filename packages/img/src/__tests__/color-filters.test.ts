import { describe, expect, it } from 'vite-plus/test'
import { rgb } from '@stopcock/color'
import {
  channelBufferToRgbaBytes,
  colorize,
  duotone,
  fromRGBA,
  rgbaBytesToChannelBuffer,
  simulateCVD,
  tonemapToGamut,
} from '../index'

const fixture = () =>
  fromRGBA(
    new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 64, 255, 255, 255, 0]),
    2,
    2,
  )

const px = (data: Uint8ClampedArray, pixel: number) =>
  Array.from(data.slice(pixel * 4, pixel * 4 + 4))

describe('RGBA channel buffer adapters', () => {
  it('round-trips RGBA bytes through Float64 RGB channels plus alpha', () => {
    const img = fixture()
    const { rgb: channels, alpha } = rgbaBytesToChannelBuffer(img.data)
    const out = channelBufferToRgbaBytes(channels, alpha)
    expect(Array.from(out)).toEqual(Array.from(img.data))
  })
})

describe('color batch image filters', () => {
  it('colorize preserves alpha and changes hue', () => {
    const out = colorize(fixture(), rgb(0, 0, 1))
    expect(px(out.data, 0)[3]).toBe(255)
    expect(px(out.data, 1)[3]).toBe(128)
    expect(px(out.data, 0)[2]).toBeGreaterThan(px(out.data, 0)[0])
  })

  it('duotone maps dark and light colors through OKLab interpolation', () => {
    const out = duotone(fixture(), rgb(0, 0, 0), rgb(1, 1, 1))
    expect(px(out.data, 0)[3]).toBe(255)
    expect(px(out.data, 3)[0]).toBeGreaterThanOrEqual(px(out.data, 0)[0])
  })

  it('simulateCVD preserves alpha and changes red under deuteranopia', () => {
    const out = simulateCVD(fixture(), 'deuteranopia', 1)
    expect(px(out.data, 1)[3]).toBe(128)
    expect(px(out.data, 0)[0]).toBeLessThan(255)
  })

  it('tonemapToGamut emits an image with the same dimensions and alpha', () => {
    const out = tonemapToGamut(fixture(), 'srgb', 'srgb')
    expect(out.width).toBe(2)
    expect(out.height).toBe(2)
    expect(px(out.data, 2)[3]).toBe(64)
  })
})
