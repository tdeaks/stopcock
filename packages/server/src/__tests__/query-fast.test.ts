import { describe, it, expect, vi } from 'vitest'
import { of } from '@stopcock/async'
import { queryGetFast } from '../query-fast'
import { createApp } from '../router/router'

const noFallback = () => {
  throw new Error('fallback should not be called')
}

describe('queryGetFast', () => {
  it('returns null on empty query', () => {
    expect(queryGetFast('', 'x', noFallback)).toBeNull()
  })

  it('returns null when key absent', () => {
    expect(queryGetFast('a=1&b=2', 'c', noFallback)).toBeNull()
  })

  it('extracts first key value', () => {
    expect(queryGetFast('include=teams&page=2', 'include', noFallback)).toBe('teams')
  })

  it('extracts middle key value', () => {
    expect(queryGetFast('a=1&include=teams&z=9', 'include', noFallback)).toBe('teams')
  })

  it('extracts last key value', () => {
    expect(queryGetFast('a=1&b=2&include=teams', 'include', noFallback)).toBe('teams')
  })

  it('returns empty string for bare key at end', () => {
    expect(queryGetFast('a=1&flag', 'flag', noFallback)).toBe('')
  })

  it('returns empty string for bare key followed by &', () => {
    expect(queryGetFast('flag&a=1', 'flag', noFallback)).toBe('')
  })

  it('returns empty string for empty value', () => {
    expect(queryGetFast('q=&page=1', 'q', noFallback)).toBe('')
  })

  it('returns first occurrence when key repeated', () => {
    expect(queryGetFast('x=1&x=2&x=3', 'x', noFallback)).toBe('1')
  })

  it('does not match key as substring of another key', () => {
    expect(queryGetFast('abc=1&c=2', 'c', noFallback)).toBe('2')
    expect(queryGetFast('abc=1', 'c', noFallback)).toBeNull()
    expect(queryGetFast('foobar=1&bar=2', 'bar', noFallback)).toBe('2')
  })

  it('handles value containing = (no fallback needed)', () => {
    expect(queryGetFast('token=abc=def&x=1', 'token', noFallback)).toBe('abc=def')
  })

  it('falls back when value contains %', () => {
    const fallback = vi.fn(() => 'decoded value')
    expect(queryGetFast('q=hello%20world&page=1', 'q', fallback)).toBe('decoded value')
    expect(fallback).toHaveBeenCalledOnce()
  })

  it('falls back when value contains +', () => {
    const fallback = vi.fn(() => 'hello world')
    expect(queryGetFast('q=hello+world', 'q', fallback)).toBe('hello world')
    expect(fallback).toHaveBeenCalledOnce()
  })

  it('does not fall back when % or + is in a different key value', () => {
    // Looking up 'page'; only 'q' has %.
    expect(queryGetFast('q=a%20b&page=2', 'page', noFallback)).toBe('2')
  })

  it('does not match on non-boundary positions', () => {
    // 'foo' appears in middle of 'thefoo' but not at a key boundary.
    expect(queryGetFast('thefoo=1&bar=2', 'foo', noFallback)).toBeNull()
  })
})

const fetch = (app: ReturnType<typeof createApp>, path: string) =>
  app.fetch(new Request(`http://x${path}`))

describe('ctx.queryGet', () => {
  it('reads a single key from the request URL', async () => {
    const app = createApp().get('/search', (ctx) => of(async () => (ctx as any).queryGet('q')))
    const res = await fetch(app, '/search?q=alpha')
    expect(await res.json()).toBe('alpha')
  })

  it('returns null for absent key', async () => {
    const app = createApp().get('/search', (ctx) => of(async () => (ctx as any).queryGet('missing')))
    const res = await fetch(app, '/search?q=alpha')
    expect(await res.json()).toBeNull()
  })

  it('returns null when query string absent entirely', async () => {
    const app = createApp().get('/health', (ctx) => of(async () => (ctx as any).queryGet('q')))
    const res = await fetch(app, '/health')
    expect(await res.json()).toBeNull()
  })

  it('decodes via fallback when value is percent-encoded', async () => {
    const app = createApp().get('/search', (ctx) => of(async () => (ctx as any).queryGet('q')))
    const res = await fetch(app, '/search?q=hello%20world')
    expect(await res.json()).toBe('hello world')
  })

  it('caches query string so a second call does not reparse the URL', async () => {
    const app = createApp().get('/search', (ctx) => of(async () => ({
      include: (ctx as any).queryGet('include'),
      page: (ctx as any).queryGet('page'),
    })))
    const res = await fetch(app, '/search?include=teams&page=2')
    expect(await res.json()).toEqual({ include: 'teams', page: '2' })
  })

  it('strips fragment before parsing', async () => {
    const app = createApp().get('/search', (ctx) => of(async () => (ctx as any).queryGet('q')))
    const res = await fetch(app, '/search?q=alpha#frag')
    expect(await res.json()).toBe('alpha')
  })
})
