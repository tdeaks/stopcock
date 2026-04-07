import { describe, it, expect } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { create } from '../index.js'
import { useStore } from '../vue.js'

type State = { count: number; name: string }
const initial = (): State => ({ count: 0, name: 'Tom' })

describe('useStore (Vue)', () => {
  it('returns ref with full state', () => {
    const store = create(initial())
    const scope = effectScope()
    const ref = scope.run(() => useStore(store))!
    expect(ref.value).toEqual(initial())
    scope.stop()
  })

  it('returns ref with sliced value', () => {
    const store = create(initial())
    const scope = effectScope()
    const ref = scope.run(() => useStore(store, s => s.count))!
    expect(ref.value).toBe(0)
    scope.stop()
  })

  it('ref updates when store changes', () => {
    const store = create(initial())
    const scope = effectScope()
    const ref = scope.run(() => useStore(store, s => s.count))!
    expect(ref.value).toBe(0)
    store.set(s => s.count, 42)
    expect(ref.value).toBe(42)
    scope.stop()
  })

  it('ref does not update for unrelated changes', () => {
    const store = create(initial())
    const scope = effectScope()
    const ref = scope.run(() => useStore(store, s => s.count))!
    store.set(s => s.name, 'Alice')
    expect(ref.value).toBe(0) // unchanged
    scope.stop()
  })

  it('scope.stop() cleans up subscription', () => {
    const store = create(initial())
    const scope = effectScope()
    const ref = scope.run(() => useStore(store, s => s.count))!
    scope.stop()
    store.set(s => s.count, 99)
    // ref is stale after stop — value should still be 0
    expect(ref.value).toBe(0)
  })

  it('full state ref updates on any change', () => {
    const store = create(initial())
    const scope = effectScope()
    const ref = scope.run(() => useStore(store))!
    store.set(s => s.name, 'Alice')
    expect((ref.value as State).name).toBe('Alice')
    scope.stop()
  })

  it('multiple refs on same store', () => {
    const store = create(initial())
    const scope = effectScope()
    const countRef = scope.run(() => useStore(store, s => s.count))!
    const nameRef = scope.run(() => useStore(store, s => s.name))!
    store.set(s => s.count, 10)
    expect(countRef.value).toBe(10)
    expect(nameRef.value).toBe('Tom')
    scope.stop()
  })
})
