import { describe, it, expect } from 'vitest'
import { invert } from '../invert'
import { diff } from '../diff'
import { applyUnsafe } from '../apply'
import { patch } from '../patch'

describe('invert', () => {
  it('inverts add to remove', () => {
    const p = patch([{ op: 'add', path: ['a'], value: 1 }])
    const inv = invert(p)
    expect(inv.ops[0].op).toBe('remove')
    expect((inv.ops[0] as any).oldValue).toBe(1)
  })

  it('inverts remove to add', () => {
    const p = patch([{ op: 'remove', path: ['a'], oldValue: 1 }])
    const inv = invert(p)
    expect(inv.ops[0].op).toBe('add')
    expect((inv.ops[0] as any).value).toBe(1)
  })

  it('inverts replace by swapping old and new', () => {
    const p = patch([{ op: 'replace', path: ['a'], oldValue: 1, newValue: 2 }])
    const inv = invert(p)
    expect(inv.ops[0].op).toBe('replace')
    expect((inv.ops[0] as any).oldValue).toBe(2)
    expect((inv.ops[0] as any).newValue).toBe(1)
  })

  it('inverts move by swapping from and path', () => {
    const p = patch([{ op: 'move', from: ['a'], path: ['b'] }])
    const inv = invert(p)
    expect((inv.ops[0] as any).from).toEqual(['b'])
    expect(inv.ops[0].path).toEqual(['a'])
  })

  it('inverts rename by swapping keys', () => {
    const p = patch([{ op: 'rename', path: [], oldKey: 'a', newKey: 'b' }])
    const inv = invert(p)
    expect((inv.ops[0] as any).oldKey).toBe('b')
    expect((inv.ops[0] as any).newKey).toBe('a')
  })

  it('test is unchanged', () => {
    const op = { op: 'test' as const, path: ['a'], value: 1 }
    const p = patch([op])
    const inv = invert(p)
    expect(inv.ops[0]).toBe(op)
  })

  it('reverses op order', () => {
    const p = patch([
      { op: 'add', path: ['a'], value: 1 },
      { op: 'add', path: ['b'], value: 2 },
    ])
    const inv = invert(p)
    expect(inv.ops[0].path).toEqual(['b'])
    expect(inv.ops[1].path).toEqual(['a'])
  })

  it('roundtrip: apply then apply inverted restores original', () => {
    const a = { x: 1, y: [1, 2, 3], z: { nested: true } }
    const b = { x: 2, y: [1, 3], z: { nested: false, extra: 'hi' } }
    const p = diff(a, b)
    const result = applyUnsafe(a, p)
    expect(result).toEqual(b)
    const restored = applyUnsafe(result, invert(p))
    expect(restored).toEqual(a)
  })
})
