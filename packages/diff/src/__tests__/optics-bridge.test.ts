import { describe, it, expect } from 'vitest'
import { toLens, fromLens, fromTraversal } from '../optics-bridge'
import { prop, view, set } from '@stopcock/fp'
import type { Lens, Traversal } from '@stopcock/fp'

describe('toLens', () => {
  it('returns null for empty path', () => {
    const op = { op: 'replace' as const, path: [] as const, oldValue: 1, newValue: 2 }
    expect(toLens(op)).toBeNull()
  })

  it('creates lens for all-string path', () => {
    const op = { op: 'replace' as const, path: ['user', 'name'] as const, oldValue: 'a', newValue: 'b' }
    const l = toLens(op)
    expect(l).not.toBeNull()
    expect(l!.get({ user: { name: 'Tom' } })).toBe('Tom')
    expect(l!.set({ user: { name: 'Tom' } }, 'Alice')).toEqual({ user: { name: 'Alice' } })
  })

  it('mixed-path lens setter handles single-segment path', () => {
    const op = { op: 'replace' as const, path: [0] as const, oldValue: 'a', newValue: 'b' }
    const l = toLens(op)
    expect(l).not.toBeNull()
    expect(l!.get(['x', 'y'])).toBe('x')
    expect(l!.set(['x', 'y'], 'z')).toEqual(['z', 'y'])
  })

  it('creates lens for mixed path (with numeric segments)', () => {
    const op = { op: 'replace' as const, path: ['items', 0, 'name'] as const, oldValue: 'a', newValue: 'b' }
    const l = toLens(op)
    expect(l).not.toBeNull()
    const data = { items: [{ name: 'first' }, { name: 'second' }] }
    expect(l!.get(data)).toBe('first')
    const updated = l!.set(data, 'changed')
    expect(updated.items[0].name).toBe('changed')
    expect(updated.items[1].name).toBe('second')
  })
})

describe('fromLens', () => {
  it('returns null for identical views', () => {
    const l = prop<{ a: number }, 'a'>('a')
    const result = fromLens({ a: 1 }, l, { a: 1 })
    expect(result).toBeNull()
  })

  it('returns patch for different views', () => {
    const l = prop<{ a: number }, 'a'>('a')
    const result = fromLens({ a: 1 }, l, { a: 2 })
    expect(result).not.toBeNull()
    expect(result!.ops).toHaveLength(1)
    expect(result!.ops[0].op).toBe('replace')
  })
})

describe('fromTraversal', () => {
  it('creates patch from traversal modifications', () => {
    const t: Traversal<number[], number> = {
      getAll: (s) => [...s],
      modify: (s, f) => s.map(f),
    }
    const p = fromTraversal([1, 2, 3], t, n => n * 2)
    expect(p.ops).toHaveLength(3)
    for (const op of p.ops) {
      expect(op.op).toBe('replace')
    }
  })

  it('skips unchanged elements', () => {
    const t: Traversal<number[], number> = {
      getAll: (s) => [...s],
      modify: (s, f) => s.map(f),
    }
    const p = fromTraversal([1, 2, 3], t, n => n > 2 ? n * 2 : n)
    expect(p.ops).toHaveLength(1)
    expect((p.ops[0] as any).newValue).toBe(6)
  })
})
