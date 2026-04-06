import { describe, it, expect, vi } from 'vitest'
import { create } from '../index.js'
import { slice, readable } from '../svelte.js'

type State = { count: number; name: string }
const initial = (): State => ({ count: 0, name: 'Tom' })

describe('svelte: slice', () => {
  it('fires immediately with current value', () => {
    const store = create(initial())
    const s = slice(store, s => s.count)
    const fn = vi.fn()
    s.subscribe(fn)
    expect(fn).toHaveBeenCalledWith(0)
  })

  it('fires on change', () => {
    const store = create(initial())
    const s = slice(store, s => s.count)
    const values: number[] = []
    s.subscribe(v => values.push(v))
    store.set(s => s.count, 5)
    expect(values).toEqual([0, 5])
  })

  it('returns unsub function', () => {
    const store = create(initial())
    const s = slice(store, s => s.count)
    const fn = vi.fn()
    const unsub = s.subscribe(fn)
    unsub()
    store.set(s => s.count, 99)
    expect(fn).toHaveBeenCalledTimes(1) // only the initial call
  })

  it('does not fire for unrelated changes', () => {
    const store = create(initial())
    const s = slice(store, s => s.count)
    const values: number[] = []
    s.subscribe(v => values.push(v))
    store.set(s => s.name, 'Alice')
    expect(values).toEqual([0]) // only initial
  })
})

describe('svelte: readable', () => {
  it('fires immediately with full state', () => {
    const store = create(initial())
    const r = readable(store)
    const fn = vi.fn()
    r.subscribe(fn)
    expect(fn).toHaveBeenCalledWith(initial())
  })

  it('fires on any change', () => {
    const store = create(initial())
    const r = readable(store)
    const calls: State[] = []
    r.subscribe(v => calls.push(v))
    store.set(s => s.count, 1)
    expect(calls).toHaveLength(2) // initial + update
    expect(calls[1].count).toBe(1)
  })
})
