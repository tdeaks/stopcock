import { describe, it, expect } from 'vitest'
import { of } from '@stopcock/async'
import { createApp } from '../router/router'
import { compileJsonSerializerWithBytes } from '../compile-json'

const schema = {
  type: 'object',
  properties: { id: { type: 'string' }, ok: { type: 'boolean' } },
  required: ['id', 'ok'],
} as const

describe('dispatch — byteLength propagation', () => {
  it('emits byteLength when schema-driven serializer produces ASCII body', async () => {
    const app = createApp().get(
      '/x',
      (_ctx) => of(async () => ({ id: 'abc', ok: true })),
      undefined,
      { serializer: compileJsonSerializerWithBytes(schema as never) },
    )
    const result = await app.dispatch('GET', '/x', new Request('http://x/x'))
    if ('then' in result) throw new Error('expected sync result')
    expect(result.kind).toBe('value')
    if (result.kind !== 'value') return
    expect(result.body).toBe('{"id":"abc","ok":true}')
    expect(result.byteLength).toBe(result.body.length)
  })

  it('emits byteLength=null when serializer detects non-ASCII', async () => {
    const app = createApp().get(
      '/x',
      (_ctx) => of(async () => ({ id: 'José', ok: true })),
      undefined,
      { serializer: compileJsonSerializerWithBytes(schema as never) },
    )
    const result = await app.dispatch('GET', '/x', new Request('http://x/x'))
    if ('then' in result) throw new Error('expected sync result')
    expect(result.kind).toBe('value')
    if (result.kind !== 'value') return
    expect(result.byteLength).toBeNull()
  })

  it('emits byteLength=null when there is no schema serializer', async () => {
    const app = createApp().get('/x', (_ctx) => of(async () => ({ id: 'abc', ok: true })))
    const result = await app.dispatch('GET', '/x', new Request('http://x/x'))
    if ('then' in result) throw new Error('expected sync result')
    expect(result.kind).toBe('value')
    if (result.kind !== 'value') return
    expect(result.body).toBe('{"id":"abc","ok":true}')
    expect(result.byteLength).toBeNull()
  })

  it('static routes pre-compute byteLength for ASCII bodies', async () => {
    const app = createApp().get(
      '/health',
      (_ctx) => of(async () => ({ ok: true })),
      undefined,
      { staticBody: '{"ok":true}' },
    )
    const result = app.dispatch('GET', '/health', new Request('http://x/health'))
    if ('then' in result) throw new Error('expected sync result')
    expect(result.kind).toBe('static')
    if (result.kind !== 'static') return
    expect(result.body).toBe('{"ok":true}')
    expect(result.byteLength).toBe(11)
  })

  it('static routes leave byteLength=null for non-ASCII bodies', async () => {
    const app = createApp().get(
      '/health',
      (_ctx) => of(async () => ({ msg: 'café' })),
      undefined,
      { staticBody: '{"msg":"café"}' },
    )
    const result = app.dispatch('GET', '/health', new Request('http://x/health'))
    if ('then' in result) throw new Error('expected sync result')
    expect(result.kind).toBe('static')
    if (result.kind !== 'static') return
    expect(result.byteLength).toBeNull()
  })
})
