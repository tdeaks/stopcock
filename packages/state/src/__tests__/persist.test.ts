import { describe, it, expect, vi, beforeEach } from 'vitest'
import { create } from '../index.js'
import { persist, type Storage } from '../persist.js'

type State = { count: number; name: string; secret: string }
const initial = (): State => ({ count: 0, name: 'Tom', secret: 'hidden' })

function mockStorage(): Storage & { data: Record<string, string> } {
  const data: Record<string, string> = {}
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = value },
    removeItem: (key) => { delete data[key] },
  }
}

describe('persist', () => {
  it('saves state to storage on commit', () => {
    const storage = mockStorage()
    const p = persist<State>('test', { storage })
    const store = create(initial(), { onCommit: p.onCommit })
    store.set(s => s.count, 5)
    const saved = JSON.parse(storage.data['test'])
    expect(saved.s.count).toBe(5)
    expect(saved.v).toBe(0)
  })

  it('hydrates state from storage', () => {
    const storage = mockStorage()
    storage.data['test'] = JSON.stringify({ v: 0, s: { count: 42, name: 'Alice', secret: 'x' } })
    const p = persist<State>('test', { storage })
    const store = create(initial(), { onCommit: p.onCommit })
    p.hydrate(store)
    expect(store.get(s => s.count)).toBe(42)
    expect(store.get(s => s.name)).toBe('Alice')
  })

  it('hydrate is a noop when no persisted data', () => {
    const storage = mockStorage()
    const p = persist<State>('test', { storage })
    const store = create(initial(), { onCommit: p.onCommit })
    p.hydrate(store)
    expect(store.get()).toEqual(initial())
  })

  it('include: only persists specified keys', () => {
    const storage = mockStorage()
    const p = persist<State>('test', { storage, include: ['count', 'name'] })
    const store = create(initial(), { onCommit: p.onCommit })
    store.set(s => s.count, 10)
    const saved = JSON.parse(storage.data['test'])
    expect(saved.s).toEqual({ count: 10, name: 'Tom' })
    expect(saved.s.secret).toBeUndefined()
  })

  it('include: hydrate merges partial state', () => {
    const storage = mockStorage()
    storage.data['test'] = JSON.stringify({ v: 0, s: { count: 99 } })
    const p = persist<State>('test', { storage, include: ['count'] })
    const store = create(initial(), { onCommit: p.onCommit })
    p.hydrate(store)
    expect(store.get(s => s.count)).toBe(99)
    expect(store.get(s => s.name)).toBe('Tom') // untouched
  })

  it('exclude: omits specified keys', () => {
    const storage = mockStorage()
    const p = persist<State>('test', { storage, exclude: ['secret'] })
    const store = create(initial(), { onCommit: p.onCommit })
    store.set(s => s.count, 7)
    const saved = JSON.parse(storage.data['test'])
    expect(saved.s.secret).toBeUndefined()
    expect(saved.s.count).toBe(7)
  })

  it('version + migrate upgrades persisted state', () => {
    const storage = mockStorage()
    storage.data['test'] = JSON.stringify({ v: 1, s: { count: 5, name: 'Old', secret: 'x' } })
    const p = persist<State>('test', {
      storage,
      version: 2,
      migrate: (persisted, oldVersion) => {
        expect(oldVersion).toBe(1)
        return { ...persisted, name: persisted.name + ' (migrated)' }
      },
    })
    const store = create(initial(), { onCommit: p.onCommit })
    p.hydrate(store)
    expect(store.get(s => s.name)).toBe('Old (migrated)')
    expect(store.get(s => s.count)).toBe(5)
  })

  it('does not migrate when version matches', () => {
    const storage = mockStorage()
    storage.data['test'] = JSON.stringify({ v: 1, s: initial() })
    const migrate = vi.fn((s: any) => s)
    const p = persist<State>('test', { storage, version: 1, migrate })
    const store = create(initial(), { onCommit: p.onCommit })
    p.hydrate(store)
    expect(migrate).not.toHaveBeenCalled()
  })

  it('clear removes persisted data', () => {
    const storage = mockStorage()
    storage.data['test'] = 'something'
    const p = persist<State>('test', { storage })
    p.clear()
    expect(storage.data['test']).toBeUndefined()
  })

  it('custom serialize/deserialize', () => {
    const storage = mockStorage()
    const serialize = vi.fn(JSON.stringify)
    const deserialize = vi.fn(JSON.parse)
    const p = persist<State>('test', { storage, serialize, deserialize })
    const store = create(initial(), { onCommit: p.onCommit })
    store.set(s => s.count, 1)
    expect(serialize).toHaveBeenCalled()
    p.hydrate(store)
    expect(deserialize).toHaveBeenCalled()
  })

  it('gracefully handles missing storage (SSR)', () => {
    const p = persist<State>('test', { storage: undefined as any })
    const store = create(initial())
    // should not throw
    p.hydrate(store)
    expect(store.get()).toEqual(initial())
  })
})
