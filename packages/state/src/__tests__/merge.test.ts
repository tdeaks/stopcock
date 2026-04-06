import { describe, it, expect, vi } from 'vitest'
import { create, history } from '../index.js'

type State = {
  user: { name: string; email: string }
  count: number
  flag: boolean
}

const initial = (): State => ({
  user: { name: 'Tom', email: 'tom@test.com' },
  count: 0,
  flag: false,
})

describe('merge', () => {
  it('merges a single key', () => {
    const store = create(initial())
    store.merge({ count: 42 })
    expect(store.get(s => s.count)).toBe(42)
    expect(store.get(s => s.user.name)).toBe('Tom')
  })

  it('merges multiple keys', () => {
    const store = create(initial())
    store.merge({ count: 10, flag: true })
    expect(store.get(s => s.count)).toBe(10)
    expect(store.get(s => s.flag)).toBe(true)
    expect(store.get(s => s.user.name)).toBe('Tom')
  })

  it('skips noop when all values unchanged', () => {
    const store = create(initial())
    const listener = vi.fn()
    store.subscribe(listener)
    store.merge({ count: 0 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('only notifies affected subscribers', () => {
    const store = create(initial())
    const countListener = vi.fn()
    const nameListener = vi.fn()
    store.subscribe(s => s.count, countListener)
    store.subscribe(s => s.user.name, nameListener)
    store.merge({ count: 5 })
    expect(countListener).toHaveBeenCalledWith(5, 0)
    expect(nameListener).not.toHaveBeenCalled()
  })

  it('does not fire unrelated subscribers with many subs', () => {
    const store = create({ a: 1, b: 2, c: 3, d: 4 })
    const calls: string[] = []
    store.subscribe(s => s.a, () => calls.push('a'))
    store.subscribe(s => s.b, () => calls.push('b'))
    store.subscribe(s => s.c, () => calls.push('c'))
    store.subscribe(s => s.d, () => calls.push('d'))
    store.merge({ b: 99 })
    expect(calls).toEqual(['b'])
  })

  it('works with middleware', () => {
    const h = history<State>()
    const store = create(initial(), { middleware: [h.middleware] })
    store.merge({ count: 10 })
    expect(store.get(s => s.count)).toBe(10)
    h.undo(store)
    expect(store.get(s => s.count)).toBe(0)
  })

  it('middleware can reject merge', () => {
    const store = create(initial(), { middleware: [() => null] })
    store.merge({ count: 99 })
    expect(store.get(s => s.count)).toBe(0)
  })

  it('works within batch', () => {
    const store = create(initial())
    const listener = vi.fn()
    store.subscribe(listener)
    store.batch(() => {
      store.merge({ count: 1 })
      store.merge({ flag: true })
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.get(s => s.count)).toBe(1)
    expect(store.get(s => s.flag)).toBe(true)
  })

  it('fires onCommit with patch', () => {
    const commits: any[] = []
    const store = create(initial(), {
      onCommit: (patch, prev, next) => commits.push({ patch, prev, next }),
    })
    store.merge({ count: 42 })
    expect(commits).toHaveLength(1)
    expect(commits[0].patch.ops[0].path).toEqual(['count'])
    expect(commits[0].next.count).toBe(42)
  })

  it('get() sees merge immediately', () => {
    const store = create(initial())
    store.merge({ count: 7 })
    expect(store.get(s => s.count)).toBe(7)
  })
})
