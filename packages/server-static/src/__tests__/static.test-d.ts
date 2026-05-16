import { describe, it, expectTypeOf } from 'vitest'
import type { ServerPlugin } from '@stopcock/server'
import { staticFiles, type StaticFilesOptions } from '../index'

describe('staticFiles types', () => {
  it('exports an app plugin', () => {
    const options: StaticFilesOptions = { dir: '/tmp/public', prefix: '/assets' }
    expectTypeOf(staticFiles(options)).toMatchTypeOf<ServerPlugin>()
  })
})
