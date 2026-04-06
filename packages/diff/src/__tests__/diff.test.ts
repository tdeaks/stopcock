import { describe, it, expect } from 'vitest'
import { diff, diffWith } from '../diff'
import { applyUnsafe } from '../apply'

describe('diff', () => {
  it('returns empty patch for identical values', () => {
    expect(diff({ a: 1 }, { a: 1 }).ops).toHaveLength(0)
  })

  it('detects added keys', () => {
    const p = diff({ a: 1 }, { a: 1, b: 2 })
    expect(p.ops).toHaveLength(1)
    expect(p.ops[0].op).toBe('add')
  })

  it('detects removed keys', () => {
    const p = diff({ a: 1, b: 2 }, { a: 1 })
    expect(p.ops).toHaveLength(1)
    expect(p.ops[0].op).toBe('remove')
  })

  it('detects replaced values', () => {
    const p = diff({ a: 1 }, { a: 2 })
    expect(p.ops).toHaveLength(1)
    expect(p.ops[0].op).toBe('replace')
  })

  it('handles nested objects', () => {
    const a = { user: { name: 'Tom', age: 30 } }
    const b = { user: { name: 'Alice', age: 30 } }
    const p = diff(a, b)
    expect(p.ops).toHaveLength(1)
    expect(p.ops[0].path).toEqual(['user', 'name'])
  })

  it('handles arrays', () => {
    const p = diff([1, 2, 3], [1, 2, 3, 4])
    expect(p.ops.length).toBeGreaterThan(0)
    expect(applyUnsafe([1, 2, 3], p)).toEqual([1, 2, 3, 4])
  })

  it('handles array deletions', () => {
    const p = diff([1, 2, 3], [1, 3])
    expect(applyUnsafe([1, 2, 3], p)).toEqual([1, 3])
  })

  it('handles empty to non-empty array', () => {
    const p = diff([], [1, 2])
    expect(applyUnsafe([], p)).toEqual([1, 2])
  })

  it('handles non-empty to empty array', () => {
    const p = diff([1, 2], [])
    expect(applyUnsafe([1, 2], p)).toEqual([])
  })

  it('handles type changes', () => {
    const p = diff({ a: 'string' }, { a: 42 })
    expect(p.ops[0].op).toBe('replace')
  })

  it('handles deeply nested changes', () => {
    const a = { l1: { l2: { l3: { value: 'old' } } } }
    const b = { l1: { l2: { l3: { value: 'new' } } } }
    const p = diff(a, b)
    expect(p.ops[0].path).toEqual(['l1', 'l2', 'l3', 'value'])
  })

  it('detects moves in arrays', () => {
    const a = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const b = [{ id: 3 }, { id: 1 }, { id: 2 }]
    const p = diff(a, b)
    expect(applyUnsafe(a, p)).toEqual(b)
  })

  it('detects renames in objects', () => {
    const a = { oldKey: 'value' }
    const b = { newKey: 'value' }
    const p = diff(a, b)
    const renameOp = p.ops.find(op => op.op === 'rename')
    expect(renameOp).toBeDefined()
  })

  it('curried form works', () => {
    const diffFromA = diff({ a: 1 })
    const p = diffFromA({ a: 2 })
    expect(p.ops).toHaveLength(1)
  })

  it('handles mixed array/object to different type', () => {
    const p = diff({ a: [1] }, { a: { x: 1 } })
    expect(p.ops[0].op).toBe('replace')
    expect(p.ops[0].path).toEqual(['a'])
  })

  it('handles null values', () => {
    const p = diff({ a: null }, { a: 1 })
    expect(p.ops).toHaveLength(1)
  })

  it('handles rename with leftover adds and removes', () => {
    const a = { x: 'val', y: 'unique_y' }
    const b = { z: 'val', w: 'unique_w' }
    const p = diff(a, b)
    expect(applyUnsafe(a, p)).toEqual(b)
    // x->z should be a rename, y removed and w added separately
    const renames = p.ops.filter(op => op.op === 'rename')
    const removes = p.ops.filter(op => op.op === 'remove')
    const adds = p.ops.filter(op => op.op === 'add')
    expect(renames.length).toBeGreaterThanOrEqual(1)
    expect(removes.length).toBeGreaterThanOrEqual(1)
    expect(adds.length).toBeGreaterThanOrEqual(1)
  })

  it('handles both empty arrays', () => {
    const p = diff([] as any[], [] as any[])
    expect(p.ops).toHaveLength(0)
  })
})

describe('diffWith', () => {
  it('uses custom equality', () => {
    const p = diffWith({ a: 1 }, { a: 1.0001 }, { eq: (a, b) => Math.abs((a as number) - (b as number)) < 0.001 })
    expect(p.ops).toHaveLength(0)
  })

  it('disables move detection', () => {
    const a = [{ id: 1 }, { id: 2 }]
    const b = [{ id: 2 }, { id: 1 }]
    const p = diffWith(a, b, { detectMoves: false })
    const moveOps = p.ops.filter(op => op.op === 'move')
    expect(moveOps).toHaveLength(0)
  })

  it('disables rename detection', () => {
    const p = diffWith({ old: 'v' }, { new: 'v' }, { detectRenames: false })
    const renameOps = p.ops.filter(op => op.op === 'rename')
    expect(renameOps).toHaveLength(0)
  })

  it('curried form works', () => {
    const diffTo = diffWith({ a: 2 }, {})
    const p = diffTo({ a: 1 })
    expect(p.ops).toHaveLength(1)
  })
})
