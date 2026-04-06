import { describe, it, expect } from 'vitest'
import {
  create, clone, fromRGBA,
  rgbToHsl, hslToRgb, rgbToGray, grayscale,
  brightness, contrast, invert, threshold, sepia, saturate,
  convolve, blur, gaussianBlur, sharpen, edgeDetect,
  resize, crop, flipH, flipV, rotate90,
  histogram, equalize,
  houghLines, lineToEndpoints, connectedComponents,
} from '../index'
import type { Image } from '../types'

const fill = (img: Image, r: number, g: number, b: number, a = 255) => {
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a
  }
  return img
}

const px = (img: Image, x: number, y: number) => {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] as const
}

describe('create', () => {
  it('creates blank image', () => {
    const img = create(4, 4)
    expect(img.width).toBe(4)
    expect(img.height).toBe(4)
    expect(img.data.length).toBe(64)
    expect(img.data.every(v => v === 0)).toBe(true)
  })

  it('clones image', () => {
    const img = fill(create(2, 2), 100, 150, 200)
    const c = clone(img)
    expect(c.data).toEqual(img.data)
    c.data[0] = 0
    expect(img.data[0]).toBe(100)
  })

  it('fromRGBA copies data', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
    const img = fromRGBA(data, 2, 2)
    expect(px(img, 0, 0)).toEqual([255, 0, 0, 255])
    expect(px(img, 1, 0)).toEqual([0, 255, 0, 255])
  })
})

describe('color', () => {
  it('rgbToHsl and back', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0)
    expect(h).toBeCloseTo(0)
    expect(s).toBeCloseTo(1)
    expect(l).toBeCloseTo(0.5)
    const [r, g, b] = hslToRgb(h, s, l)
    expect(r).toBe(255)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })

  it('rgbToGray luminance', () => {
    expect(rgbToGray(255, 255, 255)).toBe(255)
    expect(rgbToGray(0, 0, 0)).toBe(0)
    const g = rgbToGray(100, 150, 200)
    expect(g).toBeGreaterThan(0)
    expect(g).toBeLessThan(255)
  })

  it('grayscale all channels equal', () => {
    const img = fill(create(2, 2), 100, 150, 200)
    const gs = grayscale(img)
    const [r, g, b] = px(gs, 0, 0)
    expect(r).toBe(g)
    expect(g).toBe(b)
  })
})

describe('filters', () => {
  it('brightness increases values', () => {
    const img = fill(create(2, 2), 100, 100, 100)
    const b = brightness(img, 50)
    expect(px(b, 0, 0)[0]).toBe(150)
  })

  it('brightness clamps at 255', () => {
    const img = fill(create(2, 2), 200, 200, 200)
    const b = brightness(img, 100)
    expect(px(b, 0, 0)[0]).toBe(255)
  })

  it('invert', () => {
    const img = fill(create(2, 2), 100, 150, 200)
    const inv = invert(img)
    expect(px(inv, 0, 0)).toEqual([155, 105, 55, 255])
  })

  it('threshold', () => {
    const img = create(2, 1)
    img.data.set([50, 50, 50, 255, 200, 200, 200, 255])
    const t = threshold(img, 128)
    expect(px(t, 0, 0)[0]).toBe(0)
    expect(px(t, 1, 0)[0]).toBe(255)
  })

  it('sepia produces warm tones', () => {
    const img = fill(create(2, 2), 100, 100, 100)
    const s = sepia(img)
    const [r, g, b] = px(s, 0, 0)
    expect(r).toBeGreaterThanOrEqual(g)
    expect(g).toBeGreaterThanOrEqual(b)
  })
})

describe('convolution', () => {
  it('blur reduces contrast', () => {
    const img = create(4, 4)
    // checkerboard
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const v = (x + y) % 2 === 0 ? 255 : 0
        const i = (y * 4 + x) * 4
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255
      }
    }
    const blurred = blur(img, 1)
    const center = px(blurred, 1, 1)[0]
    expect(center).toBeGreaterThan(0)
    expect(center).toBeLessThan(255)
  })
})

describe('transform', () => {
  it('resize changes dimensions', () => {
    const img = fill(create(4, 4), 128, 128, 128)
    const r = resize(img, 2, 2)
    expect(r.width).toBe(2)
    expect(r.height).toBe(2)
    expect(px(r, 0, 0)[0]).toBe(128)
  })

  it('crop extracts region', () => {
    const img = create(4, 4)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const i = (y * 4 + x) * 4
        img.data[i] = x * 60; img.data[i + 1] = y * 60; img.data[i + 2] = 0; img.data[i + 3] = 255
      }
    const c = crop(img, 1, 1, 2, 2)
    expect(c.width).toBe(2)
    expect(c.height).toBe(2)
    expect(px(c, 0, 0)[0]).toBe(60)
    expect(px(c, 0, 0)[1]).toBe(60)
  })

  it('flipH mirrors horizontally', () => {
    const img = create(2, 1)
    img.data.set([255, 0, 0, 255, 0, 255, 0, 255])
    const f = flipH(img)
    expect(px(f, 0, 0)).toEqual([0, 255, 0, 255])
    expect(px(f, 1, 0)).toEqual([255, 0, 0, 255])
  })

  it('flipV mirrors vertically', () => {
    const img = create(1, 2)
    img.data.set([255, 0, 0, 255, 0, 255, 0, 255])
    const f = flipV(img)
    expect(px(f, 0, 0)).toEqual([0, 255, 0, 255])
    expect(px(f, 0, 1)).toEqual([255, 0, 0, 255])
  })

  it('rotate90 swaps dimensions', () => {
    const img = create(4, 2)
    const r = rotate90(img)
    expect(r.width).toBe(2)
    expect(r.height).toBe(4)
  })
})

describe('histogram', () => {
  it('histogram counts', () => {
    const img = fill(create(2, 2), 100, 150, 200)
    const h = histogram(img)
    expect(h.r[100]).toBe(4)
    expect(h.g[150]).toBe(4)
    expect(h.b[200]).toBe(4)
  })

  it('equalize produces full range', () => {
    const img = fill(create(4, 4), 128, 128, 128)
    const eq = equalize(img)
    expect(eq.width).toBe(4)
  })
})

describe('1x1 image', () => {
  const mk = () => {
    const img = create(1, 1)
    img.data.set([100, 150, 200, 255])
    return img
  }

  it('all filters work on 1x1', () => {
    const img = mk()
    expect(brightness(img, 10).data.length).toBe(4)
    expect(contrast(img, 50).data.length).toBe(4)
    expect(invert(img).data.length).toBe(4)
    expect(threshold(img, 128).data.length).toBe(4)
    expect(sepia(img).data.length).toBe(4)
    expect(saturate(img, 1.5).data.length).toBe(4)
  })

  it('blur/sharpen/edgeDetect on 1x1', () => {
    const img = mk()
    expect(blur(img, 1).data.length).toBe(4)
    expect(gaussianBlur(img, 1).data.length).toBe(4)
    expect(sharpen(img).data.length).toBe(4)
    expect(edgeDetect(img).data.length).toBe(4)
  })

  it('resize to 1x1', () => {
    const img = fill(create(4, 4), 128, 128, 128)
    const r = resize(img, 1, 1)
    expect(r.width).toBe(1)
    expect(r.height).toBe(1)
    expect(r.data.length).toBe(4)
    expect(r.data[0]).toBe(128)
  })

  it('flipH/flipV/rotate90 on 1x1', () => {
    const img = mk()
    expect(flipH(img).data).toEqual(img.data)
    expect(flipV(img).data).toEqual(img.data)
    const r = rotate90(img)
    expect(r.width).toBe(1)
    expect(r.height).toBe(1)
    expect(r.data).toEqual(img.data)
  })
})

describe('invalid image validation', () => {
  const bad = { data: new Uint8ClampedArray(0), width: 0, height: 0 } as Image
  const mismatch = { data: new Uint8ClampedArray(8), width: 1, height: 1 } as Image

  it('filters throw on 0-dimension image', () => {
    expect(() => brightness(bad, 10)).toThrow('width and height must be positive')
    expect(() => contrast(bad, 10)).toThrow('width and height must be positive')
    expect(() => invert(bad)).toThrow('width and height must be positive')
    expect(() => threshold(bad, 128)).toThrow('width and height must be positive')
    expect(() => sepia(bad)).toThrow('width and height must be positive')
    expect(() => saturate(bad, 1)).toThrow('width and height must be positive')
  })

  it('transforms throw on 0-dimension image', () => {
    expect(() => resize(bad, 2, 2)).toThrow('width and height must be positive')
    expect(() => flipH(bad)).toThrow('width and height must be positive')
    expect(() => flipV(bad)).toThrow('width and height must be positive')
    expect(() => rotate90(bad)).toThrow('width and height must be positive')
  })

  it('convolution throws on 0-dimension image', () => {
    expect(() => blur(bad, 1)).toThrow('width and height must be positive')
    expect(() => gaussianBlur(bad, 1)).toThrow('width and height must be positive')
    expect(() => sharpen(bad)).toThrow('width and height must be positive')
    expect(() => edgeDetect(bad)).toThrow('width and height must be positive')
  })

  it('data length mismatch throws', () => {
    expect(() => brightness(mismatch, 10)).toThrow("doesn't match")
    expect(() => blur(mismatch, 1)).toThrow("doesn't match")
    expect(() => flipH(mismatch)).toThrow("doesn't match")
  })

  it('resize with invalid target dimensions throws', () => {
    const img = fill(create(2, 2), 128, 128, 128)
    expect(() => resize(img, 0, 2)).toThrow('width and height must be positive')
    expect(() => resize(img, 2, -1)).toThrow('width and height must be positive')
  })

  it('blur with invalid radius throws', () => {
    const img = fill(create(2, 2), 128, 128, 128)
    expect(() => blur(img, 0)).toThrow('must be positive')
    expect(() => blur(img, -1)).toThrow('must be positive')
    expect(() => gaussianBlur(img, 0)).toThrow('must be positive')
  })
})

describe('crop clamping', () => {
  it('clamps out-of-bounds x/y to image bounds', () => {
    const img = fill(create(4, 4), 100, 100, 100)
    const c = crop(img, -5, -5, 2, 2)
    expect(c.width).toBe(2)
    expect(c.height).toBe(2)
  })

  it('clamps out-of-bounds w/h to remaining space', () => {
    const img = fill(create(4, 4), 100, 100, 100)
    const c = crop(img, 2, 2, 100, 100)
    expect(c.width).toBe(2)
    expect(c.height).toBe(2)
  })

  it('crop entirely outside returns empty image', () => {
    const img = fill(create(4, 4), 100, 100, 100)
    const c = crop(img, 10, 10, 5, 5)
    expect(c.width).toBe(0)
    expect(c.height).toBe(0)
  })
})

describe('2x2 exact pixel filters', () => {
  const mk = () => {
    const img = create(2, 2)
    // px(0,0)=100,150,200,255  px(1,0)=50,75,100,255
    // px(0,1)=200,100,50,255   px(1,1)=0,0,0,255
    img.data.set([
      100, 150, 200, 255, 50, 75, 100, 255,
      200, 100, 50, 255, 0, 0, 0, 255,
    ])
    return img
  }

  it('brightness +50', () => {
    const out = brightness(mk(), 50)
    expect(px(out, 0, 0)).toEqual([150, 200, 250, 255])
    expect(px(out, 1, 1)).toEqual([50, 50, 50, 255])
  })

  it('brightness clamps to 255', () => {
    const out = brightness(mk(), 200)
    expect(px(out, 0, 0)).toEqual([255, 255, 255, 255])
  })

  it('invert', () => {
    const out = invert(mk())
    expect(px(out, 0, 0)).toEqual([155, 105, 55, 255])
    expect(px(out, 1, 1)).toEqual([255, 255, 255, 255])
  })

  it('threshold at 100', () => {
    const out = threshold(mk(), 100)
    // rgbToGray(100,150,200) = round(0.299*100 + 0.587*150 + 0.114*200) = round(29.9+88.05+22.8) = round(140.75) = 141 >= 100 => 255
    expect(px(out, 0, 0)[0]).toBe(255)
    // rgbToGray(0,0,0) = 0 < 100 => 0
    expect(px(out, 1, 1)[0]).toBe(0)
  })

  it('sepia produces warm tone ordering (r >= g >= b)', () => {
    const out = sepia(mk())
    const [r, g, b] = px(out, 0, 0)
    expect(r).toBeGreaterThanOrEqual(g)
    expect(g).toBeGreaterThanOrEqual(b)
  })
})

describe('houghLines', () => {
  it('detects a horizontal line', () => {
    // 10x10 black image with a white horizontal line at y=5
    const img = create(10, 10)
    for (let x = 0; x < 10; x++) {
      const i = (5 * 10 + x) * 4
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255
    }
    const lines = houghLines(img, { threshold: 5 })
    expect(lines.length).toBeGreaterThan(0)
    // horizontal line: theta should be near pi/2 (90 degrees)
    const best = lines[0]
    expect(best.theta).toBeCloseTo(Math.PI / 2, 0.5)
    expect(Math.abs(best.rho)).toBeCloseTo(5, 1)
  })

  it('detects a vertical line', () => {
    const img = create(10, 10)
    for (let y = 0; y < 10; y++) {
      const i = (y * 10 + 3) * 4
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255
    }
    const lines = houghLines(img, { threshold: 5 })
    expect(lines.length).toBeGreaterThan(0)
    // vertical line: theta should be near 0 or near pi (both represent vertical)
    const best = lines[0]
    const thetaFromVertical = Math.min(best.theta, Math.PI - best.theta)
    expect(thetaFromVertical).toBeLessThan(0.2)
  })

  it('returns empty for blank image', () => {
    const img = create(10, 10)
    const lines = houghLines(img, { threshold: 1 })
    expect(lines).toEqual([])
  })

  it('works data-last', () => {
    const img = create(10, 10)
    for (let x = 0; x < 10; x++) {
      const i = (5 * 10 + x) * 4
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255
    }
    const fn = houghLines({ threshold: 5 })
    const lines = fn(img)
    expect(lines.length).toBeGreaterThan(0)
  })
})

describe('lineToEndpoints', () => {
  it('returns two points', () => {
    const [a, b] = lineToEndpoints({ rho: 5, theta: Math.PI / 2, votes: 10 }, 10, 10)
    expect(typeof a.x).toBe('number')
    expect(typeof b.y).toBe('number')
  })
})

describe('connectedComponents', () => {
  it('finds two separate blobs', () => {
    // 10x10 image with two 2x2 white squares
    const img = create(10, 10)
    // blob 1 at (1,1)
    for (const [x, y] of [[1,1],[2,1],[1,2],[2,2]]) {
      const i = (y * 10 + x) * 4
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255
    }
    // blob 2 at (7,7)
    for (const [x, y] of [[7,7],[8,7],[7,8],[8,8]]) {
      const i = (y * 10 + x) * 4
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255
    }
    const result = connectedComponents(img)
    expect(result.components.length).toBe(2)
    expect(result.components[0].area).toBe(4)
    expect(result.components[1].area).toBe(4)
  })

  it('one connected region', () => {
    // L-shape
    const img = create(5, 5)
    for (const [x, y] of [[0,0],[1,0],[0,1],[0,2]]) {
      const i = (y * 5 + x) * 4
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255
    }
    const result = connectedComponents(img)
    expect(result.components.length).toBe(1)
    expect(result.components[0].area).toBe(4)
  })

  it('returns empty for blank image', () => {
    const result = connectedComponents(create(5, 5))
    expect(result.components).toEqual([])
  })

  it('bbox and centroid are correct', () => {
    const img = create(10, 10)
    // 3x2 block at (2,3)
    for (const [x, y] of [[2,3],[3,3],[4,3],[2,4],[3,4],[4,4]]) {
      const i = (y * 10 + x) * 4
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255
    }
    const result = connectedComponents(img)
    expect(result.components.length).toBe(1)
    const c = result.components[0]
    expect(c.bbox).toEqual({ x: 2, y: 3, w: 3, h: 2 })
    expect(c.centroid).toEqual({ x: 3, y: 4 }) // mean of x: (2+3+4+2+3+4)/6=3, y: (3+3+3+4+4+4)/6=3.5 rounds to 4
    expect(c.area).toBe(6)
  })
})

describe('convolve with identity kernel', () => {
  it('identity kernel preserves pixel values exactly', () => {
    const img = create(3, 3)
    img.data.set([
      10, 20, 30, 255,   40, 50, 60, 255,   70, 80, 90, 255,
      100, 110, 120, 255, 130, 140, 150, 255, 160, 170, 180, 255,
      190, 200, 210, 255, 220, 230, 240, 255, 250, 245, 235, 255,
    ])
    const identity = [[0, 0, 0], [0, 1, 0], [0, 0, 0]]
    const out = convolve(img, identity, 1)
    expect(px(out, 0, 0)).toEqual([10, 20, 30, 255])
    expect(px(out, 1, 1)).toEqual([130, 140, 150, 255])
    expect(px(out, 2, 2)).toEqual([250, 245, 235, 255])
  })

  it('identity kernel on uniform image returns same values', () => {
    const img = fill(create(4, 4), 77, 88, 99)
    const out = convolve(img, [[0, 0, 0], [0, 1, 0], [0, 0, 0]], 1)
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++)
        expect(px(out, x, y)).toEqual([77, 88, 99, 255])
  })
})

describe('contrast pixel-level', () => {
  it('contrast 0 is a no-op', () => {
    const img = create(2, 2)
    img.data.set([50, 100, 200, 255, 0, 128, 255, 255, 10, 20, 30, 255, 250, 240, 230, 255])
    const out = contrast(img, 0)
    // f = (259 * 255) / (255 * 259) = 1.0, so output = 1*(v-128)+128 = v
    expect(px(out, 0, 0)).toEqual([50, 100, 200, 255])
    expect(px(out, 1, 0)).toEqual([0, 128, 255, 255])
    expect(px(out, 0, 1)).toEqual([10, 20, 30, 255])
    expect(px(out, 1, 1)).toEqual([250, 240, 230, 255])
  })

  it('contrast 255 maps everything to 0 or 255', () => {
    const img = create(2, 1)
    img.data.set([50, 200, 128, 255, 127, 129, 0, 255])
    const out = contrast(img, 255)
    // f = (259 * 510) / (255 * 4) = huge, pushes everything far from 128
    const [r0, g0, b0] = px(out, 0, 0)
    expect(r0).toBe(0)     // 50 < 128 => 0
    expect(g0).toBe(255)   // 200 > 128 => 255
    expect(b0).toBe(128)   // 128 is midpoint => stays 128
    const [r1, g1] = px(out, 1, 0)
    expect(r1).toBe(0)     // 127 < 128 => 0
    expect(g1).toBe(255)   // 129 > 128 => 255
  })

  it('negative contrast pulls values toward 128', () => {
    const img = create(1, 1)
    img.data.set([0, 255, 128, 255])
    const out = contrast(img, -100)
    const [r, g, b] = px(out, 0, 0)
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(128)
    expect(g).toBeGreaterThan(128)
    expect(g).toBeLessThan(255)
    expect(b).toBe(128)
  })
})

describe('saturate edge cases', () => {
  it('saturate 0 produces grayscale (r === g === b)', () => {
    const img = create(2, 2)
    img.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 100, 200, 50, 255])
    const out = saturate(img, 0)
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const [r, g, b] = px(out, x, y)
        expect(r).toBe(g)
        expect(g).toBe(b)
      }
  })

  it('saturate 1 is a no-op', () => {
    const img = create(2, 1)
    img.data.set([100, 150, 200, 255, 50, 75, 25, 255])
    const out = saturate(img, 1)
    // round-trip through HSL may lose a bit, but should be within 1
    for (let x = 0; x < 2; x++) {
      const [ri, gi, bi] = px(img, x, 0)
      const [ro, go, bo] = px(out, x, 0)
      expect(Math.abs(ri - ro)).toBeLessThanOrEqual(1)
      expect(Math.abs(gi - go)).toBeLessThanOrEqual(1)
      expect(Math.abs(bi - bo)).toBeLessThanOrEqual(1)
    }
  })

  it('saturate high value pushes saturation to max', () => {
    const img = create(1, 1)
    img.data.set([150, 100, 100, 255])
    const out = saturate(img, 100)
    const [r, g, b] = px(out, 0, 0)
    // high multiplier should max out saturation; red channel should dominate more
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
    // with max saturation, the less-dominant channels should be closer to 0 or further from r
    const spread = r - Math.min(g, b)
    expect(spread).toBeGreaterThan(50)
  })

  it('saturate on already-gray pixel is a no-op', () => {
    const img = create(1, 1)
    img.data.set([128, 128, 128, 255])
    const out = saturate(img, 5)
    expect(px(out, 0, 0)).toEqual([128, 128, 128, 255])
  })
})

describe('gaussianBlur pixel checks', () => {
  it('uniform image stays uniform', () => {
    const img = fill(create(5, 5), 100, 100, 100)
    const out = gaussianBlur(img, 2)
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++)
        expect(px(out, x, y)[0]).toBe(100)
  })

  it('blurs a single bright pixel into neighbors', () => {
    const img = fill(create(5, 5), 0, 0, 0)
    const ci = (2 * 5 + 2) * 4
    img.data[ci] = 255; img.data[ci + 1] = 255; img.data[ci + 2] = 255; img.data[ci + 3] = 255
    const out = gaussianBlur(img, 1)
    // center should still be brightest
    const center = px(out, 2, 2)[0]
    expect(center).toBeGreaterThan(0)
    // neighbors should pick up some light
    const neighbor = px(out, 1, 2)[0]
    expect(neighbor).toBeGreaterThan(0)
    expect(neighbor).toBeLessThan(center)
    // diagonal neighbors should be dimmer than direct neighbors
    const diag = px(out, 1, 1)[0]
    expect(diag).toBeLessThanOrEqual(neighbor)
    // far pixels should be 0 since radius=1 kernel is only 3x3
    expect(px(out, 0, 0)[0]).toBe(0)
  })
})

describe('edgeDetect on gradient', () => {
  it('sobel detects edges in a horizontal gradient', () => {
    const img = create(8, 8)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const v = Math.round((x / 7) * 255)
        const i = (y * 8 + x) * 4
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255
      }
    const out = edgeDetect(img)
    // interior pixels should have non-zero edge response due to gradient
    let nonZero = 0
    for (let y = 1; y < 7; y++)
      for (let x = 1; x < 7; x++)
        if (px(out, x, y)[0] > 0) nonZero++
    expect(nonZero).toBeGreaterThan(0)
  })

  it('uniform image produces zero edges', () => {
    const img = fill(create(5, 5), 128, 128, 128)
    const out = edgeDetect(img)
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++)
        expect(px(out, x, y)[0]).toBe(0)
  })
})

describe('equalize on skewed histogram', () => {
  it('equalizing a narrow-range image produces wider spread', () => {
    // all pixels clustered in 100-110 range
    const img = create(10, 10)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 100 + (i / 4) % 11  // values 100..110
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255
    }
    const before = histogram(img)
    const eq = equalize(img)
    const after = histogram(eq)

    // count how many distinct values are used
    const distinctBefore = before.r.filter(v => v > 0).length
    const distinctAfter = after.r.filter(v => v > 0).length
    expect(distinctAfter).toBeGreaterThanOrEqual(distinctBefore)

    // the range should be wider
    let minAfter = 255, maxAfter = 0
    for (let i = 0; i < 256; i++) {
      if (after.r[i] > 0) {
        if (i < minAfter) minAfter = i
        if (i > maxAfter) maxAfter = i
      }
    }
    expect(maxAfter - minAfter).toBeGreaterThan(10)
  })

  it('already-uniform image is mostly unchanged', () => {
    // single value => equalize maps it to a single value
    const img = fill(create(4, 4), 50, 50, 50)
    const eq = equalize(img)
    const h = histogram(eq)
    const usedBins = h.r.filter(v => v > 0).length
    expect(usedBins).toBe(1)
  })
})

describe('lineToEndpoints coordinates', () => {
  it('horizontal line at y=5 gives correct y coords', () => {
    // theta=pi/2, rho=5 => cos=0, sin=1 => x0=0, y0=5
    const [a, b] = lineToEndpoints({ rho: 5, theta: Math.PI / 2, votes: 10 }, 10, 10)
    // for theta=pi/2: x0 = cos(pi/2)*5 ~ 0, y0 = sin(pi/2)*5 = 5
    // endpoints: (x0 - len*sin, y0 + len*cos) and (x0 + len*sin, y0 - len*cos)
    // sin(pi/2)=1, cos(pi/2)~0 => (-10, 5) and (10, 5)
    expect(a.y).toBe(5)
    expect(b.y).toBe(5)
    expect(a.x).toBe(-10)
    expect(b.x).toBe(10)
  })

  it('vertical line at x=3 gives correct x coords', () => {
    // theta=0, rho=3 => cos=1, sin=0 => x0=3, y0=0
    const [a, b] = lineToEndpoints({ rho: 3, theta: 0, votes: 10 }, 10, 10)
    expect(a.x).toBe(3)
    expect(b.x).toBe(3)
    // y should span: y0 + len*cos(0) = 10 and y0 - len*cos(0) = -10
    expect(a.y).toBe(10)
    expect(b.y).toBe(-10)
  })
})

describe('resize interpolation on known pattern', () => {
  it('upscale 2x2 to 4x4 interpolates corners', () => {
    const img = create(2, 2)
    // top-left=0, top-right=255, bottom-left=255, bottom-right=0
    img.data.set([
      0, 0, 0, 255,     255, 255, 255, 255,
      255, 255, 255, 255, 0, 0, 0, 255,
    ])
    const out = resize(img, 4, 4)
    expect(out.width).toBe(4)
    expect(out.height).toBe(4)
    // corners of the resized image should retain original corner values
    expect(px(out, 0, 0)[0]).toBe(0)
    expect(px(out, 3, 0)[0]).toBe(255)
    expect(px(out, 0, 3)[0]).toBe(255)
    expect(px(out, 3, 3)[0]).toBe(0)
    // mid-top should be interpolated between 0 and 255
    const midTop = px(out, 1, 0)[0]
    expect(midTop).toBeGreaterThan(0)
    expect(midTop).toBeLessThan(255)
  })

  it('downscale 4x4 stripes to 2x2 averages', () => {
    const img = create(4, 4)
    // vertical stripes: columns 0,1 = black, columns 2,3 = white
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const v = x < 2 ? 0 : 255
        const i = (y * 4 + x) * 4
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255
      }
    const out = resize(img, 2, 2)
    // left column samples from black region, right from white
    expect(px(out, 0, 0)[0]).toBe(0)
    expect(px(out, 1, 0)[0]).toBe(255)
  })

  it('resize preserves alpha', () => {
    const img = create(2, 2)
    img.data.set([255, 0, 0, 128, 0, 255, 0, 128, 0, 0, 255, 128, 255, 255, 0, 128])
    const out = resize(img, 4, 4)
    // corners should have alpha 128
    expect(px(out, 0, 0)[3]).toBe(128)
    expect(px(out, 3, 3)[3]).toBe(128)
  })
})

