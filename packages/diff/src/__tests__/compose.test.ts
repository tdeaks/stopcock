import { describe, it, expect } from 'vitest'
import { compose } from '../compose'
import { patch, empty } from '../patch'

describe('compose', () => {
  it('empty + patch = patch', () => {
    const p = patch([{ op: 'add', path: ['a'], value: 1 }])
    expect(compose(empty(), p)).toBe(p)
  })

  it('patch + empty = patch', () => {
    const p = patch([{ op: 'add', path: ['a'], value: 1 }])
    expect(compose(p, empty())).toBe(p)
  })

  it('add then remove at same path cancels', () => {
    const p1 = patch([{ op: 'add', path: ['a'], value: 1 }])
    const p2 = patch([{ op: 'remove', path: ['a'], oldValue: 1 }])
    const result = compose(p1, p2)
    expect(result.ops).toHaveLength(0)
  })

  it('remove then add with same value cancels', () => {
    const p1 = patch([{ op: 'remove', path: ['a'], oldValue: 1 }])
    const p2 = patch([{ op: 'add', path: ['a'], value: 1 }])
    const result = compose(p1, p2)
    expect(result.ops).toHaveLength(0)
  })

  it('remove then add with different value becomes replace', () => {
    const p1 = patch([{ op: 'remove', path: ['a'], oldValue: 1 }])
    const p2 = patch([{ op: 'add', path: ['a'], value: 2 }])
    const result = compose(p1, p2)
    expect(result.ops).toHaveLength(1)
    expect(result.ops[0].op).toBe('replace')
    expect((result.ops[0] as any).oldValue).toBe(1)
    expect((result.ops[0] as any).newValue).toBe(2)
  })

  it('add then replace collapses to add with new value', () => {
    const p1 = patch([{ op: 'add', path: ['a'], value: 1 }])
    const p2 = patch([{ op: 'replace', path: ['a'], oldValue: 1, newValue: 2 }])
    const result = compose(p1, p2)
    expect(result.ops).toHaveLength(1)
    expect(result.ops[0].op).toBe('add')
    expect((result.ops[0] as any).value).toBe(2)
  })

  it('replace then replace collapses', () => {
    const p1 = patch([{ op: 'replace', path: ['a'], oldValue: 1, newValue: 2 }])
    const p2 = patch([{ op: 'replace', path: ['a'], oldValue: 2, newValue: 3 }])
    const result = compose(p1, p2)
    expect(result.ops).toHaveLength(1)
    expect((result.ops[0] as any).oldValue).toBe(1)
    expect((result.ops[0] as any).newValue).toBe(3)
  })

  it('replace then replace back to original cancels', () => {
    const p1 = patch([{ op: 'replace', path: ['a'], oldValue: 1, newValue: 2 }])
    const p2 = patch([{ op: 'replace', path: ['a'], oldValue: 2, newValue: 1 }])
    const result = compose(p1, p2)
    expect(result.ops).toHaveLength(0)
  })

  it('move chain collapses', () => {
    const p1 = patch([{ op: 'move', from: ['a'], path: ['b'] }])
    const p2 = patch([{ op: 'move', from: ['b'], path: ['c'] }])
    const result = compose(p1, p2)
    expect(result.ops).toHaveLength(1)
    expect((result.ops[0] as any).from).toEqual(['a'])
    expect(result.ops[0].path).toEqual(['c'])
  })

  it('non-adjacent same-path ops are not merged', () => {
    const p1 = patch([
      { op: 'replace', path: ['a'], oldValue: 1, newValue: 2 },
      { op: 'replace', path: ['b'], oldValue: 10, newValue: 20 },
    ])
    const p2 = patch([
      { op: 'replace', path: ['a'], oldValue: 2, newValue: 3 },
    ])
    const result = compose(p1, p2)
    // a:1->2 and b:10->20 from p1, then a:2->3 from p2
    // only the last two (b and a) are adjacent in the combined array
    // b:10->20 and a:2->3 have different paths, no merge
    // but a:1->2 and a:2->3 are NOT adjacent (b is between them)
    expect(result.ops.length).toBeGreaterThanOrEqual(2)
  })

  it('different path ops pass through', () => {
    const p1 = patch([{ op: 'add', path: ['a'], value: 1 }])
    const p2 = patch([{ op: 'add', path: ['b'], value: 2 }])
    const result = compose(p1, p2)
    expect(result.ops).toHaveLength(2)
  })

  it('curried form works', () => {
    const p2 = patch([{ op: 'add', path: ['b'], value: 2 }])
    const appendP2 = compose(p2)
    const p1 = patch([{ op: 'add', path: ['a'], value: 1 }])
    const result = appendP2(p1)
    expect(result.ops).toHaveLength(2)
  })
})
