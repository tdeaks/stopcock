import { describe, it, expect, vi } from 'vitest'
import { create, computed } from '../index.js'

type State = {
  todos: { text: string; done: boolean }[]
  filter: string
  unrelated: number
}

const initial = (): State => ({
  todos: [
    { text: 'one', done: false },
    { text: 'two', done: true },
    { text: 'three', done: false },
  ],
  filter: 'all',
  unrelated: 0,
})

describe('computed', () => {
  it('get() returns derived value', () => {
    const store = create(initial())
    const remaining = computed(store, s => s.todos, ts => ts.filter(t => !t.done).length)
    expect(remaining.get()).toBe(2)
  })

  it('get() returns cached value on repeated calls', () => {
    const store = create(initial())
    let calls = 0
    const c = computed(store, s => s.todos, ts => { calls++; return ts.length })
    c.get()
    c.get()
    c.get()
    expect(calls).toBe(1)
  })

  it('re-derives when source slice changes', () => {
    const store = create(initial())
    const remaining = computed(store, s => s.todos, ts => ts.filter(t => !t.done).length)
    expect(remaining.get()).toBe(2)
    store.over(s => s.todos, ts => ts.map(t => ({ ...t, done: true })))
    expect(remaining.get()).toBe(0)
  })

  it('does not re-derive when unrelated state changes', () => {
    const store = create(initial())
    let calls = 0
    const c = computed(store, s => s.todos, ts => { calls++; return ts.length })
    c.get()
    calls = 0
    store.set(s => s.unrelated, 99)
    c.get()
    expect(calls).toBe(0)
  })

  it('subscribe() notifies when derived value changes', () => {
    const store = create(initial())
    const remaining = computed(store, s => s.todos, ts => ts.filter(t => !t.done).length)
    const listener = vi.fn()
    remaining.subscribe(listener)
    store.over(s => s.todos, ts => [...ts, { text: 'four', done: false }])
    expect(listener).toHaveBeenCalledWith(3, 2)
  })

  it('subscribe() does not notify when derivation produces same value', () => {
    const store = create(initial())
    const count = computed(store, s => s.todos, ts => ts.length)
    const listener = vi.fn()
    count.subscribe(listener)
    store.over(s => s.todos, ts => ts.map((t, i) => i === 0 ? { ...t, text: 'changed' } : t))
    expect(listener).not.toHaveBeenCalled()
  })

  it('custom equality function', () => {
    const store = create(initial())
    const texts = computed(
      store,
      s => s.todos,
      ts => ts.map(t => t.text),
      (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
    )
    const listener = vi.fn()
    texts.subscribe(listener)
    store.over(s => s.todos, ts => ts.map((t, i) => i === 0 ? { ...t, done: !t.done } : t))
    expect(listener).not.toHaveBeenCalled()
  })

  it('destroy() stops updates and unsubscribes', () => {
    const store = create(initial())
    let calls = 0
    const c = computed(store, s => s.todos, ts => { calls++; return ts.length })
    c.get()
    calls = 0
    c.destroy()
    store.over(s => s.todos, ts => [...ts, { text: 'new', done: false }])
    c.get()
    expect(calls).toBe(0)
  })

  it('initial value is available immediately', () => {
    const store = create(initial())
    const c = computed(store, s => s.todos, ts => ts.length)
    expect(c.get()).toBe(3)
  })

  it('works with batched updates', () => {
    const store = create(initial())
    let calls = 0
    const c = computed(store, s => s.todos, ts => { calls++; return ts.filter(t => !t.done).length })
    c.get()
    calls = 0
    const listener = vi.fn()
    c.subscribe(listener)
    store.batch(() => {
      store.over(s => s.todos, ts => [...ts, { text: 'a', done: false }])
      store.over(s => s.todos, ts => [...ts, { text: 'b', done: false }])
    })
    expect(calls).toBe(1)
    expect(c.get()).toBe(4)
  })
})
