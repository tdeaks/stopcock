import { describe, it, expect } from 'vitest'
import { recordMutations } from '../draft.js'
import { create } from '../index.js'

describe('recordMutations', () => {
  it('records a replace for property set', () => {
    const obj = { name: 'Tom', age: 30 }
    const { draft, finish } = recordMutations(obj)
    draft.name = 'Alice'
    const patch = finish()
    expect(patch.ops).toEqual([
      { op: 'replace', path: ['name'], oldValue: 'Tom', newValue: 'Alice' },
    ])
    // original untouched
    expect(obj.name).toBe('Tom')
  })

  it('records nested property changes', () => {
    const obj = { user: { name: 'Tom', email: 'tom@test.com' } }
    const { draft, finish } = recordMutations(obj)
    draft.user.name = 'Alice'
    const patch = finish()
    expect(patch.ops).toEqual([
      { op: 'replace', path: ['user', 'name'], oldValue: 'Tom', newValue: 'Alice' },
    ])
    expect(obj.user.name).toBe('Tom')
  })

  it('records an add for new property', () => {
    const obj: Record<string, unknown> = { a: 1 }
    const { draft, finish } = recordMutations(obj)
    ;(draft as any).b = 2
    const patch = finish()
    expect(patch.ops).toEqual([
      { op: 'add', path: ['b'], value: 2 },
    ])
  })

  it('records a remove for delete', () => {
    const obj = { a: 1, b: 2 }
    const { draft, finish } = recordMutations(obj)
    delete (draft as any).b
    const patch = finish()
    expect(patch.ops).toEqual([
      { op: 'remove', path: ['b'], oldValue: 2 },
    ])
    expect(obj.b).toBe(2)
  })

  it('records array push via index', () => {
    const obj = { items: [1, 2] }
    const { draft, finish } = recordMutations(obj)
    draft.items.push(3)
    const patch = finish()
    // push sets index 2 (add) and updates length (replace)
    const addOp = patch.ops.find(op => op.op === 'add' && op.path.length === 2)
    expect(addOp).toBeDefined()
    expect((addOp as any).value).toBe(3)
  })

  it('skips noop sets', () => {
    const obj = { x: 5 }
    const { draft, finish } = recordMutations(obj)
    draft.x = 5
    expect(finish().ops).toEqual([])
  })

  it('reads own writes', () => {
    const obj = { x: 1 }
    const { draft } = recordMutations(obj)
    draft.x = 99
    expect(draft.x).toBe(99)
    // original unchanged
    expect(obj.x).toBe(1)
  })

  it('applies basePath prefix', () => {
    const obj = { name: 'Tom' }
    const { draft, finish } = recordMutations(obj, ['user'])
    draft.name = 'Alice'
    expect(finish().ops[0].path).toEqual(['user', 'name'])
  })

  it('handles multiple mutations', () => {
    const obj = { a: 1, b: 2, c: 3 }
    const { draft, finish } = recordMutations(obj)
    draft.a = 10
    draft.b = 20
    const patch = finish()
    expect(patch.ops).toHaveLength(2)
  })
})

describe('recordMutations: array methods', () => {
  it('splice — remove one element', () => {
    const obj = { items: ['a', 'b', 'c'] }
    const { draft, finish } = recordMutations(obj)
    draft.items.splice(1, 1)
    const patch = finish()
    expect(obj.items).toEqual(['a', 'b', 'c'])
    // verify result is correct by reading draft
    expect([...draft.items]).toEqual(['a', 'c'])
    expect(patch.ops.length).toBeGreaterThan(0)
  })

  it('splice — insert element', () => {
    const obj = { items: [1, 2, 3] }
    const { draft, finish } = recordMutations(obj)
    draft.items.splice(1, 0, 99)
    expect([...draft.items]).toEqual([1, 99, 2, 3])
    const patch = finish()
    expect(patch.ops.length).toBeGreaterThan(0)
    expect(obj.items).toEqual([1, 2, 3])
  })

  it('splice — replace element', () => {
    const obj = { items: ['x', 'y', 'z'] }
    const { draft, finish } = recordMutations(obj)
    draft.items.splice(1, 1, 'Y')
    expect([...draft.items]).toEqual(['x', 'Y', 'z'])
    const patch = finish()
    const replaceOps = patch.ops.filter(op => op.op === 'replace')
    expect(replaceOps.length).toBeGreaterThan(0)
  })

  it('pop removes last element', () => {
    const obj = { items: [1, 2, 3] }
    const { draft, finish } = recordMutations(obj)
    const popped = draft.items.pop()
    expect(popped).toBe(3)
    expect([...draft.items]).toEqual([1, 2])
    const patch = finish()
    expect(patch.ops.length).toBeGreaterThan(0)
    expect(obj.items).toEqual([1, 2, 3])
  })

  it('shift removes first element', () => {
    const obj = { items: [1, 2, 3] }
    const { draft, finish } = recordMutations(obj)
    const shifted = draft.items.shift()
    expect(shifted).toBe(1)
    expect([...draft.items]).toEqual([2, 3])
    const patch = finish()
    expect(patch.ops.length).toBeGreaterThan(0)
    expect(obj.items).toEqual([1, 2, 3])
  })

  it('unshift adds to front', () => {
    const obj = { items: [2, 3] }
    const { draft, finish } = recordMutations(obj)
    draft.items.unshift(1)
    expect([...draft.items]).toEqual([1, 2, 3])
    const patch = finish()
    expect(patch.ops.length).toBeGreaterThan(0)
    expect(obj.items).toEqual([2, 3])
  })

  it('reverse reverses in place', () => {
    const obj = { items: [1, 2, 3] }
    const { draft, finish } = recordMutations(obj)
    draft.items.reverse()
    expect([...draft.items]).toEqual([3, 2, 1])
    const patch = finish()
    expect(patch.ops.length).toBeGreaterThan(0)
    expect(obj.items).toEqual([1, 2, 3])
  })

  it('sort sorts in place', () => {
    const obj = { items: [3, 1, 2] }
    const { draft, finish } = recordMutations(obj)
    draft.items.sort()
    expect([...draft.items]).toEqual([1, 2, 3])
    const patch = finish()
    expect(patch.ops.length).toBeGreaterThan(0)
    expect(obj.items).toEqual([3, 1, 2])
  })

  it('sort with comparator', () => {
    const obj = { items: [{ v: 3 }, { v: 1 }, { v: 2 }] }
    const { draft, finish } = recordMutations(obj)
    draft.items.sort((a: any, b: any) => a.v - b.v)
    expect(draft.items.map((x: any) => x.v)).toEqual([1, 2, 3])
    const patch = finish()
    expect(patch.ops.length).toBeGreaterThan(0)
  })

  it('array methods in store.update produce correct state', () => {
    const store = create({ items: [1, 2, 3, 4, 5] })

    store.update((draft: any) => { draft.items.splice(1, 2) })
    expect(store.get((s: any) => s.items)).toEqual([1, 4, 5])

    store.update((draft: any) => { draft.items.reverse() })
    expect(store.get((s: any) => s.items)).toEqual([5, 4, 1])

    store.update((draft: any) => { draft.items.sort((a: number, b: number) => a - b) })
    expect(store.get((s: any) => s.items)).toEqual([1, 4, 5])

    store.update((draft: any) => { draft.items.pop() })
    expect(store.get((s: any) => s.items)).toEqual([1, 4])

    store.update((draft: any) => { draft.items.unshift(0) })
    expect(store.get((s: any) => s.items)).toEqual([0, 1, 4])

    store.update((draft: any) => { draft.items.shift() })
    expect(store.get((s: any) => s.items)).toEqual([1, 4])
  })
})
