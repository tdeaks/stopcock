import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { route } from '@stopcock/server'
import { VALIDATE_META_KEY, type ValidateMeta } from '@stopcock/server-validate'
import { zod } from '../index'

describe('validate metadata flow', () => {
  it('exposes ValidateMeta on the route via mw.meta', () => {
    const def = route.post('/posts')
      .use(zod.body(z.object({ title: z.string() })))
      .handler(() => ({ ok: true }))

    expect(def.middlewares).toHaveLength(1)
    const meta = def.middlewares[0]!.meta?.[VALIDATE_META_KEY] as ValidateMeta | undefined
    expect(meta?.source).toBe('body')
    const schema = meta?.toJsonSchema?.()
    expect(schema).toMatchObject({ type: 'object' })
  })

  it('preserves middleware order across multiple .use calls', () => {
    const def = route.get('/posts')
      .use(zod.query(z.object({ q: z.string() })))
      .use(zod.params(z.object({})))
      .handler(() => ({ ok: true }))

    expect(def.middlewares).toHaveLength(2)
    const sources = def.middlewares.map(
      (m) => (m.meta?.[VALIDATE_META_KEY] as ValidateMeta).source,
    )
    expect(sources).toEqual(['query', 'params'])
  })
})
