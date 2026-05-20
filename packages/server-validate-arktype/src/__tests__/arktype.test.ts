import { describe, it, expect } from 'vitest'
import { type } from 'arktype'
import { arktype } from '../index'

const task = <A>(thunk: () => Promise<A>) => ({ _tag: 'Task' as const, run: thunk })
const fakeCtx = (body: unknown) => ({
  request: new Request('http://x/posts', { method: 'POST', body: JSON.stringify(body) }),
  params: {},
})

const inner = (ctx: any) => task(async () => ctx.body)

describe('arktype adapter', () => {
  const mw = arktype.body(type({ title: 'string > 0' }))

  it('accepts valid input', async () => {
    const out = await mw(inner)(fakeCtx({ title: 'hi' }) as any).run()
    expect(out).toEqual({ title: 'hi' })
  })

  it('throws ValidationError with normalized issues', async () => {
    try {
      await mw(inner)(fakeCtx({ title: '' }) as any).run()
      expect.unreachable()
    } catch (e: any) {
      expect(e._tag).toBe('ValidationError')
      expect(e.source).toBe('body')
      expect(e.issues[0].path).toContain('title')
    }
  })
})
