import { defineMiddleware } from '@stopcock/server'
import { BadInput } from '../errors/domain'

export const withBody = <S>(parse: (raw: unknown) => S) =>
  defineMiddleware<{ body: S }, BadInput>(async (ctx) => {
    let raw: unknown
    try { raw = await ctx.request.json() } catch { throw new BadInput(['invalid JSON']) }
    return { body: parse(raw) }
  })
