import { describe, it, expect, vi } from 'vitest'
import { create, logger, history, devtools } from '../index.js'
import type { Patch } from '@stopcock/diff'

type State = { count: number; name: string }
const initial = (): State => ({ count: 0, name: 'Tom' })

describe('logger middleware', () => {
  it('logs with collapsed option', () => {
    const gc = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {})
    const ge = vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
    const ct = vi.spyOn(console, 'table').mockImplementation(() => {})
    const store = create(initial(), { middleware: [logger({ collapsed: true })] })
    store.set(s => s.count, 1)
    expect(gc).toHaveBeenCalled()
    gc.mockRestore(); ge.mockRestore(); ct.mockRestore()
  })

  it('logs individual ops when table=false', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const gc = vi.spyOn(console, 'group').mockImplementation(() => {})
    const ge = vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
    const store = create(initial(), { middleware: [logger({ table: false })] })
    store.set(s => s.count, 1)
    expect(log).toHaveBeenCalled()
    log.mockRestore(); gc.mockRestore(); ge.mockRestore()
  })
})

describe('history middleware', () => {
  it('canUndo / canRedo reflect state', () => {
    const h = history<State>()
    const store = create(initial(), { middleware: [h.middleware] })
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
    store.set(s => s.count, 1)
    expect(h.canUndo).toBe(true)
    h.undo(store)
    expect(h.canRedo).toBe(true)
    expect(h.canUndo).toBe(false)
  })

  it('new change after undo clears redo stack', () => {
    const h = history<State>()
    const store = create(initial(), { middleware: [h.middleware] })
    store.set(s => s.count, 1)
    store.set(s => s.count, 2)
    h.undo(store)
    store.set(s => s.count, 99)
    expect(h.canRedo).toBe(false)
  })

  it('respects maxDepth', () => {
    const h = history<State>({ maxDepth: 2 })
    const store = create(initial(), { middleware: [h.middleware] })
    store.set(s => s.count, 1)
    store.set(s => s.count, 2)
    store.set(s => s.count, 3)
    // only 2 undos available
    h.undo(store)
    expect(store.get(s => s.count)).toBe(2)
    h.undo(store)
    expect(store.get(s => s.count)).toBe(1)
    // no more undos
    h.undo(store)
    expect(store.get(s => s.count)).toBe(1)
  })

  it('undo on empty stack is a noop', () => {
    const h = history<State>()
    const store = create(initial(), { middleware: [h.middleware] })
    h.undo(store) // should not throw
    expect(store.get(s => s.count)).toBe(0)
  })

  it('redo on empty stack is a noop', () => {
    const h = history<State>()
    const store = create(initial(), { middleware: [h.middleware] })
    h.redo(store)
    expect(store.get(s => s.count)).toBe(0)
  })
})

describe('onCommit', () => {
  it('fires with patch, prev, and next state', () => {
    const commits: { patch: Patch; prev: State; next: State }[] = []
    const store = create(initial(), {
      onCommit: (patch, prev, next) => commits.push({ patch, prev, next }),
    })
    store.set(s => s.count, 42)
    expect(commits).toHaveLength(1)
    expect(commits[0].prev.count).toBe(0)
    expect(commits[0].next.count).toBe(42)
    expect(commits[0].patch.ops.length).toBeGreaterThan(0)
  })

  it('fires once per batch', () => {
    const commits: Patch[] = []
    const store = create(initial(), {
      onCommit: (patch) => commits.push(patch),
    })
    store.batch(() => {
      store.set(s => s.count, 1)
      store.set(s => s.name, 'Alice')
    })
    expect(commits).toHaveLength(1)
  })

  it('does not fire when middleware rejects', () => {
    const commits: Patch[] = []
    const store = create(initial(), {
      middleware: [() => null],
      onCommit: (patch) => commits.push(patch),
    })
    store.set(s => s.count, 1)
    expect(commits).toHaveLength(0)
  })
})

describe('devtools', () => {
  it('returns noop when no extension is present', () => {
    const dt = devtools<State>('test')
    expect(dt.onCommit).toBeTypeOf('function')
    expect(dt.connect).toBeTypeOf('function')
    // should not throw
    dt.onCommit({} as Patch, initial(), initial())
    dt.connect(create(initial()))
  })

  it('connects to extension when available', () => {
    const send = vi.fn()
    const init = vi.fn()
    const subscribe = vi.fn()
    ;(globalThis as any).window = {
      __REDUX_DEVTOOLS_EXTENSION__: {
        connect: () => ({ send, init, subscribe }),
      },
    }
    try {
      const dt = devtools<State>('TestStore')
      const store = create(initial(), { onCommit: dt.onCommit })
      dt.connect(store)
      expect(init).toHaveBeenCalledWith(initial())

      store.set(s => s.count, 5)
      expect(send).toHaveBeenCalledTimes(1)
      const label = send.mock.calls[0][0].type
      expect(label).toContain('count')
    } finally {
      delete (globalThis as any).window
    }
  })
})

describe('middleware transforms', () => {
  it('middleware can transform a patch', () => {
    // middleware that doubles any count replace
    const doubler = (patch: Patch): Patch => {
      const ops = patch.ops.map(op => {
        if (op.op === 'replace' && op.path[0] === 'count') {
          return { ...op, newValue: (op.newValue as number) * 2 }
        }
        return op
      })
      return { _tag: 'Patch', ops }
    }
    const store = create(initial(), { middleware: [doubler] })
    store.set(s => s.count, 5)
    expect(store.get(s => s.count)).toBe(10)
  })
})
