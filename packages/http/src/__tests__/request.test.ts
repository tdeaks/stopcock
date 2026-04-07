import { describe, it, expect } from 'vitest'
import { substitutePath, serializeQuery, buildUrl, resolveHeaders, serializeBody } from '../request.js'

describe('substitutePath', () => {
  it('replaces named params', () => {
    expect(substitutePath('/users/:id', { id: '123' })).toBe('/users/123')
  })

  it('replaces multiple params', () => {
    expect(substitutePath('/users/:userId/posts/:postId', { userId: '1', postId: '42' })).toBe('/users/1/posts/42')
  })

  it('encodes param values', () => {
    expect(substitutePath('/search/:q', { q: 'hello world' })).toBe('/search/hello%20world')
  })

  it('throws on missing param', () => {
    expect(() => substitutePath('/users/:id', {})).toThrow('Missing path param: id')
  })

  it('returns path unchanged with no params', () => {
    expect(substitutePath('/users')).toBe('/users')
  })
})

describe('serializeQuery', () => {
  it('serializes simple params', () => {
    expect(serializeQuery({ q: 'test', page: 1 })).toContain('q=test')
    expect(serializeQuery({ q: 'test', page: 1 })).toContain('page=1')
  })

  it('filters undefined and null', () => {
    expect(serializeQuery({ q: 'test', x: undefined, y: null })).toBe('?q=test')
  })

  it('handles arrays as repeated keys', () => {
    const result = serializeQuery({ tags: ['a', 'b'] })
    expect(result).toContain('tags=a')
    expect(result).toContain('tags=b')
  })

  it('returns empty string for no params', () => {
    expect(serializeQuery(undefined)).toBe('')
    expect(serializeQuery({})).toBe('')
  })

  it('returns empty string when all filtered', () => {
    expect(serializeQuery({ a: undefined, b: null })).toBe('')
  })
})

describe('buildUrl', () => {
  it('joins base and path', () => {
    expect(buildUrl('https://api.com', '/users')).toBe('https://api.com/users')
  })

  it('handles trailing slash on base', () => {
    expect(buildUrl('https://api.com/', '/users')).toBe('https://api.com/users')
  })

  it('works without base', () => {
    expect(buildUrl(undefined, '/users')).toBe('/users')
  })

  it('substitutes params and appends query', () => {
    expect(buildUrl('https://api.com', '/users/:id', { id: '42' }, { fields: 'name' }))
      .toBe('https://api.com/users/42?fields=name')
  })
})

describe('resolveHeaders', () => {
  it('merges config and request headers', async () => {
    const result = await resolveHeaders({ 'Accept': 'application/json' }, { 'X-Custom': 'value' })
    expect(result).toEqual({ 'Accept': 'application/json', 'X-Custom': 'value' })
  })

  it('request headers override config', async () => {
    const result = await resolveHeaders({ 'Accept': 'text/html' }, { 'Accept': 'application/json' })
    expect(result.Accept).toBe('application/json')
  })

  it('calls function headers', async () => {
    const result = await resolveHeaders(() => ({ Authorization: 'Bearer tok' }), undefined)
    expect(result.Authorization).toBe('Bearer tok')
  })

  it('calls async function headers', async () => {
    const result = await resolveHeaders(async () => ({ Authorization: 'Bearer async-tok' }), undefined)
    expect(result.Authorization).toBe('Bearer async-tok')
  })
})

describe('serializeBody', () => {
  it('stringifies objects as JSON', () => {
    const { body, contentType } = serializeBody({ name: 'Tom' })
    expect(body).toBe('{"name":"Tom"}')
    expect(contentType).toBe('application/json')
  })

  it('passes through strings', () => {
    const { body, contentType } = serializeBody('raw')
    expect(body).toBe('raw')
    expect(contentType).toBeUndefined()
  })

  it('returns null for undefined', () => {
    expect(serializeBody(undefined).body).toBeNull()
  })

  it('returns null for null', () => {
    expect(serializeBody(null).body).toBeNull()
  })
})
