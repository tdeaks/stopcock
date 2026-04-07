import { expectTypeOf, test } from 'vitest'
import { create, computed } from '../index.js'
import type { Store, Accessor, Middleware, Handle, Computed, OnCommit } from '../types.js'

type State = { user: { name: string; age: number }; count: number; items: string[] }
const store = create<State>({ user: { name: 'Tom', age: 30 }, count: 0, items: [] })

// --- Store.get ---

test('get() returns full state', () => {
  expectTypeOf(store.get()).toEqualTypeOf<State>()
})

test('get(accessor) infers slice type', () => {
  expectTypeOf(store.get(s => s.user.name)).toBeString()
  expectTypeOf(store.get(s => s.count)).toBeNumber()
  expectTypeOf(store.get(s => s.items)).toEqualTypeOf<string[]>()
  expectTypeOf(store.get(s => s.user)).toEqualTypeOf<{ name: string; age: number }>()
})

// --- Store.set ---

test('set accepts matching value type', () => {
  store.set(s => s.count, 5)
  store.set(s => s.user.name, 'Alice')
  store.set(s => s.items, ['a', 'b'])
})

// --- Store.over ---

test('over fn receives and returns correct type', () => {
  store.over(s => s.count, n => {
    expectTypeOf(n).toBeNumber()
    return n + 1
  })
  store.over(s => s.user.name, name => {
    expectTypeOf(name).toBeString()
    return name.toUpperCase()
  })
})

// --- Store.merge ---

test('merge accepts Partial<S>', () => {
  store.merge({ count: 1 })
  store.merge({ count: 1, items: ['x'] })
  // @ts-expect-error — unknown key
  store.merge({ unknown: true })
})

// --- Store.subscribe ---

test('subscribe with accessor provides typed prev/next', () => {
  store.subscribe(s => s.count, (next, prev) => {
    expectTypeOf(next).toBeNumber()
    expectTypeOf(prev).toBeNumber()
  })
  store.subscribe(s => s.user.name, (next, prev) => {
    expectTypeOf(next).toBeString()
    expectTypeOf(prev).toBeString()
  })
})

test('subscribe returns Unsubscribe', () => {
  const unsub = store.subscribe(() => {})
  expectTypeOf(unsub).toEqualTypeOf<() => void>()
})

// --- Store.at ---

test('at returns typed Handle', () => {
  const h = store.at<number>(['count'])
  expectTypeOf(h.get()).toBeNumber()
  expectTypeOf(h).toMatchTypeOf<Handle<number>>()
})

// --- computed ---

test('computed infers derive return type', () => {
  const c = computed(store, s => s.items, items => items.length)
  expectTypeOf(c.get()).toBeNumber()
  expectTypeOf(c).toMatchTypeOf<Computed<number>>()
})

test('computed subscribe provides typed values', () => {
  const c = computed(store, s => s.count, n => n > 0)
  c.subscribe((next, prev) => {
    expectTypeOf(next).toBeBoolean()
    expectTypeOf(prev).toBeBoolean()
  })
})

// --- Middleware type ---

test('Middleware receives Patch and State', () => {
  const mw: Middleware<State> = (patch, state) => {
    expectTypeOf(state).toEqualTypeOf<State>()
    return patch
  }
  create<State>({ user: { name: 'X', age: 0 }, count: 0, items: [] }, { middleware: [mw] })
})

// --- OnCommit type ---

test('OnCommit receives patch, prev, next', () => {
  const oc: OnCommit<State> = (patch, prev, next) => {
    expectTypeOf(prev).toEqualTypeOf<State>()
    expectTypeOf(next).toEqualTypeOf<State>()
  }
  create<State>({ user: { name: 'X', age: 0 }, count: 0, items: [] }, { onCommit: oc })
})

// --- create constraint ---

test('create requires object type', () => {
  // @ts-expect-error — number is not an object
  create(42)
  // @ts-expect-error — string is not an object
  create('hello')
})
