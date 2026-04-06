import { bench, describe } from 'vitest'
import {
  create, brightness, contrast, invert, sepia, saturate, threshold, grayscale,
  convolve, blur, gaussianBlur, sharpen, edgeDetect,
  resize, flipH, rotate90, equalize,
} from '@stopcock/img'

// Generate test images with pseudo-random pixel data
const makeImg = (w: number, h: number) => {
  const img = create(w, h)
  for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 37 + 13) & 255
  return img
}

const img64 = makeImg(64, 64)
const img256 = makeImg(256, 256)
const img512 = makeImg(512, 512)
const img1080 = makeImg(1920, 1080)

// -- Per-pixel filters --

describe('brightness', () => {
  bench('64x64', () => brightness(img64, 20))
  bench('256x256', () => brightness(img256, 20))
  bench('1920x1080', () => brightness(img1080, 20))
})

describe('contrast', () => {
  bench('64x64', () => contrast(img64, 50))
  bench('256x256', () => contrast(img256, 50))
  bench('1920x1080', () => contrast(img1080, 50))
})

describe('invert', () => {
  bench('64x64', () => invert(img64))
  bench('256x256', () => invert(img256))
  bench('1920x1080', () => invert(img1080))
})

describe('sepia', () => {
  bench('64x64', () => sepia(img64))
  bench('256x256', () => sepia(img256))
  bench('1920x1080', () => sepia(img1080))
})

describe('grayscale', () => {
  bench('64x64', () => grayscale(img64))
  bench('256x256', () => grayscale(img256))
  bench('1920x1080', () => grayscale(img1080))
})

describe('threshold', () => {
  bench('256x256', () => threshold(img256, 128))
  bench('1920x1080', () => threshold(img1080, 128))
})

describe('saturate', () => {
  bench('64x64', () => saturate(img64, 1.5))
  bench('256x256', () => saturate(img256, 1.5))
})

// -- Convolution --

describe('convolve 3x3', () => {
  const kernel = [[0, -1, 0], [-1, 5, -1], [0, -1, 0]]
  bench('64x64', () => convolve(img64, kernel))
  bench('256x256', () => convolve(img256, kernel))
  bench('512x512', () => convolve(img512, kernel))
})

describe('convolve 5x5', () => {
  const kernel = Array.from({ length: 5 }, () => Array(5).fill(1))
  bench('64x64', () => convolve(img64, kernel, 25))
  bench('256x256', () => convolve(img256, kernel, 25))
})

describe('blur', () => {
  bench('64x64 r=2', () => blur(img64, 2))
  bench('256x256 r=2', () => blur(img256, 2))
  bench('256x256 r=5', () => blur(img256, 5))
})

describe('gaussianBlur', () => {
  bench('64x64 r=2', () => gaussianBlur(img64, 2))
  bench('256x256 r=2', () => gaussianBlur(img256, 2))
  bench('256x256 r=5', () => gaussianBlur(img256, 5))
})

describe('sharpen', () => {
  bench('256x256', () => sharpen(img256))
  bench('512x512', () => sharpen(img512))
})

describe('edgeDetect', () => {
  bench('256x256', () => edgeDetect(img256))
  bench('512x512', () => edgeDetect(img512))
})

// -- Transforms --

describe('resize', () => {
  bench('256→128', () => resize(img256, 128, 128))
  bench('512→256', () => resize(img512, 256, 256))
  bench('1080→540', () => resize(img1080, 960, 540))
})

describe('flipH', () => {
  bench('256x256', () => flipH(img256))
  bench('1920x1080', () => flipH(img1080))
})

describe('rotate90', () => {
  bench('256x256', () => rotate90(img256))
  bench('1920x1080', () => rotate90(img1080))
})

// -- Histogram --

describe('equalize', () => {
  bench('256x256', () => equalize(img256))
  bench('1920x1080', () => equalize(img1080))
})

