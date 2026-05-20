import { describe, it, expect } from 'vitest'
import { HeadersShim, KNOWN_LOWER } from '../adapters/node'

const shim = (raw: Record<string, string | string[] | undefined>) =>
  new HeadersShim(raw as never)

describe('HeadersShim', () => {
  it('returns null for absent header', () => {
    expect(shim({}).get('authorization')).toBeNull()
  })

  it('looks up by canonical mixed-case', () => {
    expect(shim({ 'content-type': 'application/json' }).get('Content-Type')).toBe('application/json')
  })

  it('looks up by all-caps', () => {
    expect(shim({ authorization: 'Bearer x' }).get('AUTHORIZATION')).toBe('Bearer x')
  })

  it('looks up by lowercase', () => {
    expect(shim({ cookie: 'a=1' }).get('cookie')).toBe('a=1')
  })

  it('falls back for unknown header name (case-insensitive)', () => {
    expect(shim({ 'x-custom-thing': 'v' }).get('X-Custom-Thing')).toBe('v')
  })

  it('joins multi-value headers', () => {
    expect(shim({ 'set-cookie': ['a=1', 'b=2'] }).get('Set-Cookie')).toBe('a=1, b=2')
  })

  it('returns null when raw value is undefined', () => {
    expect(shim({ authorization: undefined }).get('authorization')).toBeNull()
  })
})

describe('KNOWN_LOWER table', () => {
  it('contains every seeded header in lowercase form', () => {
    const expected = [
      'authorization', 'content-type', 'content-length', 'cookie', 'accept',
      'accept-encoding', 'user-agent', 'host',
      'x-forwarded-for', 'x-request-id', 'x-trace-id',
      'accept-language', 'if-none-match', 'x-csrf-token',
    ]
    for (const lc of expected) expect(KNOWN_LOWER[lc]).toBe(lc)
  })

  it('seeds canonical mixed-case variants', () => {
    expect(KNOWN_LOWER['Content-Type']).toBe('content-type')
    expect(KNOWN_LOWER['X-Request-Id']).toBe('x-request-id')
    expect(KNOWN_LOWER['Accept-Encoding']).toBe('accept-encoding')
  })

  it('seeds all-caps variants', () => {
    expect(KNOWN_LOWER['AUTHORIZATION']).toBe('authorization')
    expect(KNOWN_LOWER['HOST']).toBe('host')
  })

  it('uses null prototype (no inherited properties)', () => {
    expect(Object.getPrototypeOf(KNOWN_LOWER)).toBeNull()
    expect(KNOWN_LOWER['toString']).toBeUndefined()
  })
})
