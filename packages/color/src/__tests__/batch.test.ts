import { afterEach, describe, expect, it } from 'vite-plus/test'
import { accelerate, decelerate } from '@stopcock/la/accel'
import { rgb } from '../create'
import { convert } from '../convert'
import { simulate } from '../cvd'
import { toGamut } from '../gamut'
import {
  applyMatrix3x3,
  applyTransfer,
  convertBuffer,
  simulateBuffer,
  toGamutBuffer,
} from '../batch'
import type { Color, ColorSpace } from '../types'

const spaces: ColorSpace[] = [
  'srgb',
  'linear-srgb',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'p3',
  'xyz-d50',
  'xyz-d65',
]

const fixtures = [
  rgb(0.1, 0.2, 0.3),
  rgb(0.9, 0.1, 0.4),
  rgb(0.2, 0.8, 0.6),
  rgb(1, 1, 1),
  rgb(0, 0, 0),
]

const bufferFrom = (colors: Color[]): Float64Array => {
  const out = new Float64Array(colors.length * 3)
  for (let i = 0; i < colors.length; i++) out.set(colors[i].channels, i * 3)
  return out
}

const expectBufferClose = (actual: Float64Array, expected: Float64Array, eps = 1e-8) => {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < actual.length; i++)
    expect(
      Math.abs(actual[i] - expected[i]),
      `index ${i}: ${actual[i]} vs ${expected[i]}`,
    ).toBeLessThanOrEqual(eps)
}

afterEach(() => {
  decelerate()
})

describe('applyMatrix3x3', () => {
  const identity = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])

  it('applies identity without changing values', () => {
    const src = new Float64Array([0.1, 0.2, 0.3, 0.8, 0.7, 0.6])
    expectBufferClose(applyMatrix3x3(identity, src), src)
  })

  it('matches manual matrix math', () => {
    const src = new Float64Array([1, 2, 3, 4, 5, 6])
    const m = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(Array.from(applyMatrix3x3(m, src))).toEqual([14, 32, 50, 32, 77, 122])
  })

  it('uses the Float64 accelerator at and above the threshold only', () => {
    const calls: number[] = []
    const fake = {
      dot: () => 0,
      axpy: () => {},
      matmul: () => {},
      convolve1d: () => {},
      colorMatrix3x3: () => {},
      colorMatrix3x3Float: (_m: Float64Array, _src: Float64Array, dst: Float64Array, n: number) => {
        calls.push(n)
        dst.fill(0.25)
      },
    } as any
    accelerate(fake)

    const below = applyMatrix3x3(identity, new Float64Array(45).fill(1))
    expect(calls).toEqual([])
    expect(below[0]).toBe(1)

    const above = applyMatrix3x3(identity, new Float64Array(48).fill(1))
    expect(calls).toEqual([16])
    expect(above[0]).toBe(0.25)
  })
})

describe('applyTransfer', () => {
  it('applies a function to every channel', () => {
    const src = new Float64Array([1, 2, 3])
    expect(Array.from(applyTransfer((v) => v * 2, src))).toEqual([2, 4, 6])
  })
})

describe('convertBuffer', () => {
  it('matches convert() for every color-space pair', () => {
    for (const sourceSpace of spaces) {
      const sourceColors = fixtures.map((color) => convert(color, sourceSpace))
      const src = bufferFrom(sourceColors)

      for (const targetSpace of spaces) {
        const actual = convertBuffer(src, sourceSpace, targetSpace)
        const expected = bufferFrom(sourceColors.map((color) => convert(color, targetSpace)))
        expectBufferClose(actual, expected, 1e-7)
      }
    }
  })

  it('round-trips srgb through oklch', () => {
    const src = bufferFrom(fixtures)
    const mid = convertBuffer(src, 'srgb', 'oklch')
    const back = convertBuffer(mid, 'oklch', 'srgb')
    expectBufferClose(back, src, 5e-7)
  })

  it('does not reuse byte-source cache after an oklab buffer is mutated', () => {
    const src = new Float64Array([1, 0, 0])
    const mid = convertBuffer(src, 'srgb', 'oklab')
    mid[1] += 0.01
    const actual = convertBuffer(mid, 'oklab', 'srgb')
    const expected = convert({ space: 'oklab', channels: mid, alpha: 1 }, 'srgb')
    expectBufferClose(actual, expected.channels, 1e-10)
  })

  it('supports caller-provided output buffers', () => {
    const src = new Float64Array([0.1, 0.2, 0.3])
    const out = new Float64Array(3)
    expect(convertBuffer(src, 'srgb', 'linear-srgb', out)).toBe(out)
    expect(out[0]).toBeGreaterThan(0)
  })
})

describe('simulateBuffer', () => {
  it('matches simulate() for known fixtures', () => {
    const src = bufferFrom(fixtures)
    const actual = simulateBuffer(src, 'srgb', 'deuteranopia', 0.75)
    const expected = bufferFrom(fixtures.map((color) => simulate(color, 'deuteranopia', 0.75)))
    expectBufferClose(actual, expected, 1e-7)
  })

  it('supports achromatopsia', () => {
    const src = bufferFrom(fixtures)
    const actual = simulateBuffer(src, 'srgb', 'achromatopsia')
    const expected = bufferFrom(fixtures.map((color) => simulate(color, 'achromatopsia')))
    expectBufferClose(actual, expected, 1e-7)
  })
})

describe('toGamutBuffer', () => {
  it('matches toGamut() per pixel', () => {
    const wide = fixtures.map((color) => convert(color, 'p3'))
    const src = bufferFrom(wide)
    const actual = toGamutBuffer(src, 'p3', 'srgb')
    const expected = bufferFrom(wide.map((color) => toGamut(color, 'srgb')))
    expectBufferClose(actual, expected, 1e-7)
  })
})
