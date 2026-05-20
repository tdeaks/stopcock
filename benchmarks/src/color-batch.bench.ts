import { bench, describe } from 'vitest'
import { convertBuffer } from '../../packages/color/src/index'

const makeRgbBuffer = (pixels: number): Float64Array => {
  const out = new Float64Array(pixels * 3)
  for (let i = 0; i < out.length; i += 3) {
    const seed = i / 3
    out[i] = ((seed * 17) & 255) / 255
    out[i + 1] = ((seed * 37 + 11) & 255) / 255
    out[i + 2] = ((seed * 73 + 29) & 255) / 255
  }
  return out
}

const rgb1080p = makeRgbBuffer(1920 * 1080)
const oklab1080p = new Float64Array(rgb1080p.length)
const out1080p = new Float64Array(rgb1080p.length)

describe('color batch conversion', () => {
  bench('1080p srgb -> oklab -> srgb', () => {
    convertBuffer(rgb1080p, 'srgb', 'oklab', oklab1080p)
    convertBuffer(oklab1080p, 'oklab', 'srgb', out1080p)
  })
})
