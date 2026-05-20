import { describe, it, expectTypeOf } from 'vitest'
import { route } from '../../../define/handler'
import type { ServerPlugin } from '../../../plugin'
import { serverTiming, timing, type Timing } from '../index'

describe('server timing types', () => {
  it('adds ctx.timing for route marks', () => {
    route.get('/timed').use(timing()).handler((ctx) => {
      expectTypeOf(ctx.timing).toEqualTypeOf<Timing>()
      expectTypeOf(ctx.timing.mark('db')).toEqualTypeOf<number>()
      expectTypeOf(ctx.timing.marks).toEqualTypeOf<readonly { name: string; duration: number }[]>()
      return 'ok'
    })
  })

  it('exports an app plugin for total timing', () => {
    expectTypeOf(serverTiming()).toMatchTypeOf<ServerPlugin>()
  })
})
