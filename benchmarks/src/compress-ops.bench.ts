import { bench, describe } from 'vitest'
import { RLE, LZ77, Huffman, Deflate } from '@stopcock/compress'

// Test data: pseudo-random with some repetition (compressible)
const makeData = (n: number) => {
  const d = new Uint8Array(n)
  for (let i = 0; i < n; i++) d[i] = ((i * 7 + 13) & 63) + (i % 100 < 30 ? 0 : 64)
  return d
}

// Highly repetitive data (best case for RLE/LZ77)
const makeRepetitive = (n: number) => {
  const d = new Uint8Array(n)
  for (let i = 0; i < n; i++) d[i] = i % 4
  return d
}

const data1k = makeData(1024)
const data10k = makeData(10_240)
const data100k = makeData(102_400)
const rep1k = makeRepetitive(1024)
const rep10k = makeRepetitive(10_240)

// Pre-encode for decode benchmarks
const rleEnc1k = RLE.encode(rep1k)
const rleEnc10k = RLE.encode(rep10k)
const lz1k = LZ77.encode(data1k)
const lz10k = LZ77.encode(data10k)
const huff1k = Huffman.encode(data1k)
const huff10k = Huffman.encode(data10k)
const defl1k = Deflate.compress(data1k)
const defl10k = Deflate.compress(data10k)

// -- RLE --

describe('RLE.encode', () => {
  bench('1K repetitive', () => RLE.encode(rep1k))
  bench('10K repetitive', () => RLE.encode(rep10k))
  bench('1K mixed', () => RLE.encode(data1k))
})

describe('RLE.decode', () => {
  bench('1K', () => RLE.decode(rleEnc1k))
  bench('10K', () => RLE.decode(rleEnc10k))
})

// -- LZ77 --

describe('LZ77.encode', () => {
  bench('1K', () => LZ77.encode(data1k))
  bench('10K', () => LZ77.encode(data10k))
  bench('100K', () => LZ77.encode(data100k))
})

describe('LZ77.decode', () => {
  bench('1K', () => LZ77.decode(lz1k))
  bench('10K', () => LZ77.decode(lz10k))
})

// -- Huffman --

describe('Huffman.encode', () => {
  bench('1K', () => Huffman.encode(data1k))
  bench('10K', () => Huffman.encode(data10k))
})

describe('Huffman.decode', () => {
  bench('1K', () => Huffman.decode(huff1k.encoded, huff1k.tree))
  bench('10K', () => Huffman.decode(huff10k.encoded, huff10k.tree))
})

// -- Deflate (LZ77 + Huffman) --

describe('Deflate.compress', () => {
  bench('1K', () => Deflate.compress(data1k))
  bench('10K', () => Deflate.compress(data10k))
})

describe('Deflate.decompress', () => {
  bench('1K', () => Deflate.decompress(defl1k))
  bench('10K', () => Deflate.decompress(defl10k))
})
