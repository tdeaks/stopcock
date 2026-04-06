import { describe, it, expect, vi } from 'vitest'
import { create, logger, history } from '../index.js'

type State = {
  user: { name: string; email: string }
  todos: { text: string; done: boolean }[]
  count: number
}

const initial = (): State => ({
  user: { name: 'Tom', email: 'tom@example.com' },
  todos: [{ text: 'Ship it', done: false }],
  count: 0,
})

describe('create', () => {
  it('reads full state', () => {
    const store = create(initial())
    expect(store.get()).toEqual(initial())
  })

  it('reads a slice via accessor', () => {
    const store = create(initial())
    expect(store.get(s => s.user.name)).toBe('Tom')
  })

  it('reads nested paths', () => {
    const store = create(initial())
    expect(store.get(s => s.todos)).toEqual([{ text: 'Ship it', done: false }])
  })
})

describe('set', () => {
  it('sets a value at a path', () => {
    const store = create(initial())
    store.set(s => s.user.name, 'Thomas')
    expect(store.get(s => s.user.name)).toBe('Thomas')
  })

  it('skips noop updates', () => {
    const store = create(initial())
    const listener = vi.fn()
    store.subscribe(s => s.user.name, listener)
    store.set(s => s.user.name, 'Tom')
    expect(listener).not.toHaveBeenCalled()
  })

  it('preserves unrelated state', () => {
    const store = create(initial())
    store.set(s => s.user.name, 'Thomas')
    expect(store.get(s => s.count)).toBe(0)
    expect(store.get(s => s.user.email)).toBe('tom@example.com')
  })
})

describe('over', () => {
  it('transforms a value', () => {
    const store = create(initial())
    store.over(s => s.count, n => n + 1)
    expect(store.get(s => s.count)).toBe(1)
  })
})

describe('update', () => {
  it('applies mutations from a draft', () => {
    const store = create(initial())
    store.update(s => {
      s.user.name = 'Thomas'
      s.count = 5
    })
    expect(store.get(s => s.user.name)).toBe('Thomas')
    expect(store.get(s => s.count)).toBe(5)
  })

  it('handles array mutations', () => {
    const store = create(initial())
    store.update(s => {
      s.todos.push({ text: 'Test it', done: false })
    })
    expect(store.get(s => s.todos)).toHaveLength(2)
    expect(store.get(s => s.todos)[1].text).toBe('Test it')
  })
})

describe('subscribe', () => {
  it('notifies on relevant changes', () => {
    const store = create(initial())
    const listener = vi.fn()
    store.subscribe(s => s.user.name, listener)
    store.set(s => s.user.name, 'Thomas')
    expect(listener).toHaveBeenCalledWith('Thomas', 'Tom')
  })

  it('does not notify on unrelated changes', () => {
    const store = create(initial())
    const listener = vi.fn()
    store.subscribe(s => s.user.name, listener)
    store.set(s => s.count, 99)
    expect(listener).not.toHaveBeenCalled()
  })

  it('root subscriber fires on any change', () => {
    const store = create(initial())
    const listener = vi.fn()
    store.subscribe(listener)
    store.set(s => s.count, 1)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes', () => {
    const store = create(initial())
    const listener = vi.fn()
    const unsub = store.subscribe(s => s.count, listener)
    unsub()
    store.set(s => s.count, 99)
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies when ancestor path changes via update', () => {
    const store = create(initial())
    const listener = vi.fn()
    store.subscribe(s => s.user.name, listener)
    store.update(s => { s.user.name = 'Thomas' })
    expect(listener).toHaveBeenCalledWith('Thomas', 'Tom')
  })
})

describe('middleware', () => {
  it('logger runs without blocking', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const gc = vi.spyOn(console, 'group').mockImplementation(() => {})
    const ge = vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
    const ct = vi.spyOn(console, 'table').mockImplementation(() => {})
    const store = create(initial(), { middleware: [logger()] })
    store.set(s => s.count, 1)
    expect(gc).toHaveBeenCalled()
    log.mockRestore(); gc.mockRestore(); ge.mockRestore(); ct.mockRestore()
  })

  it('middleware can reject a patch', () => {
    const reject = () => null
    const store = create(initial(), { middleware: [reject] })
    store.set(s => s.count, 99)
    expect(store.get(s => s.count)).toBe(0)
  })
})

describe('replace', () => {
  it('replaces entire state', () => {
    const store = create(initial())
    store.replace({ user: { name: 'Alice', email: 'alice@test.com' }, todos: [], count: 42 })
    expect(store.get(s => s.user.name)).toBe('Alice')
    expect(store.get(s => s.count)).toBe(42)
  })

  it('notifies affected subscribers', () => {
    const store = create(initial())
    const nameListener = vi.fn()
    const countListener = vi.fn()
    store.subscribe(s => s.user.name, nameListener)
    store.subscribe(s => s.count, countListener)
    store.replace({ ...initial(), user: { name: 'Alice', email: 'tom@example.com' } })
    expect(nameListener).toHaveBeenCalledWith('Alice', 'Tom')
    expect(countListener).not.toHaveBeenCalled()
  })
})

describe('batch', () => {
  it('notifies subscribers once for multiple mutations', () => {
    const store = create(initial())
    const listener = vi.fn()
    store.subscribe(listener)
    store.batch(() => {
      store.set(s => s.user.name, 'Alice')
      store.set(s => s.count, 5)
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('get() sees intermediate state during batch', () => {
    const store = create(initial())
    store.batch(() => {
      store.set(s => s.count, 1)
      expect(store.get(s => s.count)).toBe(1)
    })
  })

  it('error in callback rolls back', () => {
    const store = create(initial())
    expect(() => {
      store.batch(() => {
        store.set(s => s.count, 99)
        throw new Error('oops')
      })
    }).toThrow('oops')
    expect(store.get()).toEqual(initial())
  })
})

describe('history', () => {
  it('undo restores previous state', () => {
    const h = history<State>()
    const store = create(initial(), { middleware: [h.middleware] })
    store.set(s => s.count, 1)
    h.undo(store)
    expect(store.get(s => s.count)).toBe(0)
  })

  it('undo then redo', () => {
    const h = history<State>()
    const store = create(initial(), { middleware: [h.middleware] })
    store.set(s => s.count, 1)
    h.undo(store)
    h.redo(store)
    expect(store.get(s => s.count)).toBe(1)
  })
})

describe('at', () => {
  it('reads and writes via path', () => {
    const store = create(initial())
    const handle = store.at<string>(['user', 'name'])
    expect(handle.get()).toBe('Tom')
    handle.set('Alice')
    expect(store.get(s => s.user.name)).toBe('Alice')
  })

  it('preserves arrays with numeric index', () => {
    const store = create(initial())
    store.at(['todos', 0, 'text']).set('changed')
    expect(Array.isArray(store.get(s => s.todos))).toBe(true)
  })
})

describe('scoped update', () => {
  it('mutates only the targeted subtree', () => {
    const store = create(initial())
    store.update(s => s.user, draft => { draft.name = 'Alice' })
    expect(store.get(s => s.user.name)).toBe('Alice')
    expect(store.get(s => s.count)).toBe(0)
  })
})

describe('destroy', () => {
  it('clears all subscribers', () => {
    const store = create(initial())
    const listener = vi.fn()
    store.subscribe(s => s.count, listener)
    store.destroy()
    store.set(s => s.count, 99)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('trie pruning', () => {
  it('unsubscribing and re-subscribing to same path works correctly', () => {
    const store = create(initial())
    const spy = vi.fn()
    const unsub = store.subscribe(s => s.user.name, spy)
    unsub()
    const spy2 = vi.fn()
    store.subscribe(s => s.user.name, spy2)
    store.set(s => s.user.name, 'Alice')
    expect(spy).not.toHaveBeenCalled()
    expect(spy2).toHaveBeenCalledWith('Alice', 'Tom')
  })

  it('partial unsub does not prune shared parent', () => {
    const store = create(initial())
    const nameSpy = vi.fn()
    const emailSpy = vi.fn()
    const nameUnsub = store.subscribe(s => s.user.name, nameSpy)
    store.subscribe(s => s.user.email, emailSpy)
    nameUnsub()
    store.set(s => s.user.email, 'new@test.com')
    expect(emailSpy).toHaveBeenCalledTimes(1)
    expect(nameSpy).not.toHaveBeenCalled()
  })

  it('many subscribe/unsubscribe cycles work correctly', () => {
    const store = create(initial())
    for (let i = 0; i < 1000; i++) {
      const unsub = store.subscribe(s => s.user.name, () => {})
      unsub()
    }
    const spy = vi.fn()
    store.subscribe(s => s.user.name, spy)
    store.set(s => s.user.name, 'Alice')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('re-entrancy', () => {
  it('subscriber that calls set() during notify fires each listener once', () => {
    const store = create(initial())
    const nameListener = vi.fn()
    store.subscribe(s => s.count, () => {
      store.set(s => s.user.name, 'Alice')
    })
    store.subscribe(s => s.user.name, nameListener)
    store.set(s => s.count, 1)
    expect(nameListener).toHaveBeenCalledTimes(1)
    expect(nameListener).toHaveBeenCalledWith('Alice', 'Tom')
    expect(store.get(s => s.user.name)).toBe('Alice')
  })

  it('subscriber that unsubscribes another during notify does not corrupt iteration', () => {
    const store = create(initial())
    const spy = vi.fn()
    let unsub: () => void
    store.subscribe(s => s.count, () => { unsub() })
    unsub = store.subscribe(s => s.count, spy)
    store.set(s => s.count, 1)
    // spy may or may not fire (depends on iteration order), but no crash
    expect(store.get(s => s.count)).toBe(1)
  })

  it('nested re-entrant sets all produce correct final state', () => {
    const store = create(initial())
    store.subscribe(s => s.count, (next) => {
      if (next === 1) store.set(s => s.user.name, 'Alice')
    })
    store.subscribe(s => s.user.name, (next) => {
      if (next === 'Alice') store.set(s => s.user.email, 'alice@test.com')
    })
    store.set(s => s.count, 1)
    expect(store.get(s => s.count)).toBe(1)
    expect(store.get(s => s.user.name)).toBe('Alice')
    expect(store.get(s => s.user.email)).toBe('alice@test.com')
  })

  it('re-entrant set sees updated state via get()', () => {
    const store = create(initial())
    let observed: number | undefined
    store.subscribe(s => s.count, () => {
      store.set(s => s.user.name, 'Alice')
      observed = store.get(s => s.count)
    })
    store.set(s => s.count, 42)
    expect(observed).toBe(42)
  })

  it('re-entrant set during batch notification is queued', () => {
    const store = create(initial())
    const emailSpy = vi.fn()
    store.subscribe(s => s.count, () => {
      store.set(s => s.user.email, 'new@test.com')
    })
    store.subscribe(s => s.user.email, emailSpy)
    store.batch(() => {
      store.set(s => s.count, 1)
      store.set(s => s.user.name, 'Alice')
    })
    expect(emailSpy).toHaveBeenCalledTimes(1)
    expect(store.get(s => s.user.email)).toBe('new@test.com')
  })
})

describe('merge', () => {
  it('applies partial state', () => {
    const store = create(initial())
    store.merge({ count: 42 })
    expect(store.get(s => s.count)).toBe(42)
    expect(store.get(s => s.user.name)).toBe('Tom') // untouched
  })

  it('notifies affected subscribers', () => {
    const store = create(initial())
    const spy = vi.fn()
    store.subscribe(s => s.count, spy)
    store.merge({ count: 5 })
    expect(spy).toHaveBeenCalledWith(5, 0)
  })

  it('does not notify unaffected subscribers', () => {
    const store = create(initial())
    const spy = vi.fn()
    store.subscribe(s => s.user.name, spy)
    store.merge({ count: 99 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('works inside batch', () => {
    const store = create(initial())
    const spy = vi.fn()
    store.subscribe(spy)
    store.batch(() => {
      store.merge({ count: 1 })
      store.merge({ count: 2 })
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(store.get(s => s.count)).toBe(2)
  })

  it('middleware can reject merge', () => {
    const store = create(initial(), { middleware: [() => null] })
    store.merge({ count: 99 })
    expect(store.get(s => s.count)).toBe(0)
  })
})

describe('array mutations via update', () => {
  it('splice removes and inserts correctly', () => {
    const store = create({ items: ['a', 'b', 'c', 'd'] })
    store.update(s => s.items, draft => { draft.splice(1, 2, 'x') })
    expect(store.get(s => s.items)).toEqual(['a', 'x', 'd'])
  })

  it('sort produces correct final state', () => {
    const store = create({ nums: [3, 1, 4, 1, 5, 9] })
    store.update(s => s.nums, draft => { draft.sort((a, b) => a - b) })
    expect(store.get(s => s.nums)).toEqual([1, 1, 3, 4, 5, 9])
  })

  it('reverse produces correct final state', () => {
    const store = create({ items: ['a', 'b', 'c'] })
    store.update(s => s.items, draft => { draft.reverse() })
    expect(store.get(s => s.items)).toEqual(['c', 'b', 'a'])
  })

  it('sort + history undo restores original order', () => {
    const h = history<{ nums: number[] }>()
    const store = create({ nums: [3, 1, 2] }, { middleware: [h.middleware] })
    store.update(s => s.nums, draft => { draft.sort((a, b) => a - b) })
    expect(store.get(s => s.nums)).toEqual([1, 2, 3])
    h.undo(store)
    expect(store.get(s => s.nums)).toEqual([3, 1, 2])
  })

  it('batch with array mutations produces single notification', () => {
    const store = create({ items: [1, 2, 3] })
    const spy = vi.fn()
    store.subscribe(spy)
    store.batch(() => {
      store.update(s => s.items, draft => { draft.push(4) })
      store.update(s => s.items, draft => { draft.push(5) })
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(store.get(s => s.items)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('error isolation', () => {

  it('global subscriber throwing does not break other subscribers', () => {
    const store = create(initial())
    const spy = vi.fn()
    store.subscribe(() => { throw new Error('global boom') })
    store.subscribe(s => s.count, spy)
    expect(() => store.set(s => s.count, 1)).toThrow('global boom')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('all subscribers fire even when one throws', () => {
    const store = create(initial())
    const spy = vi.fn()
    store.subscribe(s => s.count, () => { throw new Error('boom') })
    store.subscribe(s => s.count, spy)
    expect(() => store.set(s => s.count, 1)).toThrow('boom')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('first error is rethrown when no onError handler', () => {
    const store = create(initial())
    store.subscribe(s => s.count, () => { throw new Error('first') })
    store.subscribe(s => s.count, () => { throw new Error('second') })
    expect(() => store.set(s => s.count, 1)).toThrow('first')
  })

  it('onError receives each error and suppresses rethrow', () => {
    const errors: unknown[] = []
    const store = create(initial(), { onError: (e) => errors.push(e) })
    store.subscribe(s => s.count, () => { throw new Error('a') })
    store.subscribe(s => s.count, () => { throw new Error('b') })
    store.set(s => s.count, 1) // should not throw
    expect(errors).toHaveLength(2)
    expect((errors[0] as Error).message).toBe('a')
    expect((errors[1] as Error).message).toBe('b')
  })

  it('state is committed even when subscriber throws', () => {
    const store = create(initial())
    store.subscribe(s => s.count, () => { throw new Error('boom') })
    try { store.set(s => s.count, 99) } catch {}
    expect(store.get(s => s.count)).toBe(99)
  })
})
