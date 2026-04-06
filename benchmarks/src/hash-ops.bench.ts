import { bench, describe } from 'vitest'
import { sha256, md5, xxhash32, crc32, toHex, toBase64, hmac } from '@stopcock/hash'

const makeData = (n: number) => {
  const d = new Uint8Array(n)
  for (let i = 0; i < n; i++) d[i] = (i * 37 + 13) & 255
  return d
}

const d64 = makeData(64)
const d1k = makeData(1024)
const d10k = makeData(10_240)
const d100k = makeData(102_400)
const d1m = makeData(1_048_576)

// -- SHA-256 --

describe('sha256', () => {
  bench('64B', () => sha256(d64))
  bench('1K', () => sha256(d1k))
  bench('10K', () => sha256(d10k))
  bench('100K', () => sha256(d100k))
  bench('1M', () => sha256(d1m))
})

// -- MD5 --

describe('md5', () => {
  bench('64B', () => md5(d64))
  bench('1K', () => md5(d1k))
  bench('10K', () => md5(d10k))
  bench('100K', () => md5(d100k))
  bench('1M', () => md5(d1m))
})

// -- xxHash32 --

describe('xxhash32', () => {
  bench('64B', () => xxhash32(d64))
  bench('1K', () => xxhash32(d1k))
  bench('10K', () => xxhash32(d10k))
  bench('100K', () => xxhash32(d100k))
  bench('1M', () => xxhash32(d1m))
})

// -- CRC32 --

describe('crc32', () => {
  bench('64B', () => crc32(d64))
  bench('1K', () => crc32(d1k))
  bench('10K', () => crc32(d10k))
  bench('100K', () => crc32(d100k))
  bench('1M', () => crc32(d1m))
})

// -- Utilities --

const hash32 = sha256(d1k)

describe('toHex', () => {
  bench('32B (sha256 output)', () => toHex(hash32))
})

describe('toBase64', () => {
  bench('32B', () => toBase64(hash32))
  bench('1K', () => toBase64(d1k))
})

// -- HMAC --

describe('hmac-sha256', () => {
  bench('64B', () => hmac(sha256, d64, d64))
  bench('1K', () => hmac(sha256, d64, d1k))
})
