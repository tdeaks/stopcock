import { describe, it, expect } from 'vitest'
import { Type } from '@sinclair/typebox'
import { typebox } from '../index'

const task = <A>(thunk: () => Promise<A>) => ({ _tag: 'Task' as const, run: thunk })
const fakeCtx = (body: unknown) => ({
  request: new Request('http://x/posts', { method: 'POST', body: JSON.stringify(body) }),
  params: {},
})

const inner = (ctx: any) => task(async () => ctx.body)

describe('typebox adapter', () => {
  const mw = typebox.body(Type.Object({ title: Type.String({ minLength: 1 }) }))

  it('accepts valid input', async () => {
    const out = await mw(inner)(fakeCtx({ title: 'hi' }) as any).run()
    expect(out).toEqual({ title: 'hi' })
  })

  it('throws ValidationError with all issues', async () => {
    await expect(mw(inner)(fakeCtx({ title: '' }) as any).run())
      .rejects.toMatchObject({
        _tag: 'ValidationError',
        source: 'body',
      })
  })

  it('reports nested paths via JSON Pointer decoding', async () => {
    const nested = typebox.body(Type.Object({
      a: Type.Object({ b: Type.Array(Type.Number()) }),
    }))
    try {
      await nested(inner)(fakeCtx({ a: { b: ['nope'] } }) as any).run()
      expect.unreachable()
    } catch (e: any) {
      expect(e._tag).toBe('ValidationError')
      expect(e.issues[0].path).toEqual(['a', 'b', 0])
    }
  })
})
