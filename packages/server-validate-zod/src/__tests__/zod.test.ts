import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { ValidationError } from '@stopcock/server/validate'
import { zod } from '../index'

const task = <A>(thunk: () => Promise<A>) => ({ _tag: 'Task' as const, run: thunk })
const fakeCtx = (body: unknown) => ({
  request: new Request('http://x/posts', { method: 'POST', body: JSON.stringify(body) }),
  params: {},
})

const inner = (ctx: any) => task(async () => ctx.body)

describe('zod adapter', () => {
  const mw = zod.body(z.object({ title: z.string().min(1) }))

  it('accepts valid input', async () => {
    const out = await mw(inner)(fakeCtx({ title: 'hi' }) as any).run()
    expect(out).toEqual({ title: 'hi' })
  })

  it('throws ValidationError with normalized issues on invalid input', async () => {
    await expect(mw(inner)(fakeCtx({ title: '' }) as any).run())
      .rejects.toMatchObject({
        _tag: 'ValidationError',
        source: 'body',
        issues: [{ path: ['title'] }],
      })
  })

  it('rejects malformed JSON body', async () => {
    const ctx = {
      request: new Request('http://x/posts', { method: 'POST', body: 'not json' }),
      params: {},
    }
    await expect(mw(inner)(ctx as any).run()).rejects.toBeInstanceOf(ValidationError)
  })
})
