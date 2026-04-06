import { describe, it, expect } from 'vitest'
import { patch, empty, ops, size, isEmpty } from '../patch'

describe('patch', () => {
  it('creates a patch with ops', () => {
    const p = patch([{ op: 'add', path: ['a'], value: 1 }])
    expect(p._tag).toBe('Patch')
    expect(p.ops).toHaveLength(1)
  })

  it('empty creates a patch with no ops', () => {
    const p = empty()
    expect(p._tag).toBe('Patch')
    expect(p.ops).toHaveLength(0)
  })

  it('ops extracts operations', () => {
    const o = [{ op: 'add' as const, path: ['x'], value: 1 }]
    expect(ops(patch(o))).toEqual(o)
  })

  it('size returns op count', () => {
    expect(size(empty())).toBe(0)
    expect(size(patch([{ op: 'add', path: [], value: 1 }]))).toBe(1)
  })

  it('isEmpty checks for zero ops', () => {
    expect(isEmpty(empty())).toBe(true)
    expect(isEmpty(patch([{ op: 'add', path: [], value: 1 }]))).toBe(false)
  })
})
