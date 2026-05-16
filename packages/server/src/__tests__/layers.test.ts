import { describe, it, expect } from 'vitest'
import {
  defineRepository, defineService, defineController, defineRoutes,
  LAYER_KIND, LAYER_NAME,
} from '../define/layers'

describe('layer factories', () => {
  it('stamps LAYER_KIND and LAYER_NAME on the factory', () => {
    const make = defineService('auth', () => ({ login: () => 'ok' }))
    expect((make as any)[LAYER_KIND]).toBe('Service')
    expect((make as any)[LAYER_NAME]).toBe('auth')
  })

  it('each layer kind gets its own brand', () => {
    expect((defineRepository('x', () => ({}))  as any)[LAYER_KIND]).toBe('Repository')
    expect((defineService('x',    () => ({}))  as any)[LAYER_KIND]).toBe('Service')
    expect((defineController('x', () => ({}))  as any)[LAYER_KIND]).toBe('Controller')
    expect((defineRoutes('x',     () => [])    as any)[LAYER_KIND]).toBe('Routes')
  })

  it('factory threads deps to build and returns the impl', () => {
    const make = defineRepository('posts', ({ db }: { db: string }) => ({
      tag: `repo-of-${db}`,
    }))
    expect(make({ db: 'pg' })).toEqual({ tag: 'repo-of-pg' })
  })

  it('symbol keys do not appear in Object.keys', () => {
    const make = defineService('x', () => ({}))
    expect(Object.keys(make)).toEqual([])
    expect(Object.getOwnPropertySymbols(make)).toContain(LAYER_KIND)
    expect(Object.getOwnPropertySymbols(make)).toContain(LAYER_NAME)
  })
})
