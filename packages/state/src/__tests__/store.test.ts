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
