import { bench, describe } from 'vitest'
import { create, computed, history } from '../index.js'
import { createStore as zustandCreate } from 'zustand/vanilla'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import { createStore as jotaiCreateStore } from 'jotai/vanilla'
import { atom } from 'jotai'

// -- shared state shape --

type State = {
  user: { name: string; email: string; settings: { theme: string; lang: string } }
  todos: { id: number; text: string; done: boolean }[]
  count: number
}

function largeState(n: number): State {
  return {
    user: { name: 'Tom', email: 'tom@test.com', settings: { theme: 'dark', lang: 'en' } },
    todos: Array.from({ length: n }, (_, i) => ({ id: i, text: `todo ${i}`, done: i % 3 === 0 })),
    count: 0,
  }
}

// -- zustand setup --

function zustandStore(n: number) {
  return zustandCreate<State>()(() => largeState(n))
}

// -- RTK setup --

const slice = createSlice({
  name: 'state',
  initialState: largeState(10_000),
  reducers: {
    setCount: (state, action: { payload: number }) => { state.count = action.payload },
    setTheme: (state, action: { payload: string }) => { state.user.settings.theme = action.payload },
    toggleTodo: (state, action: { payload: number }) => { state.todos[action.payload].done = !state.todos[action.payload].done },
  },
})

function rtkStore(n: number) {
  return configureStore({
    reducer: createSlice({
      name: 'state',
      initialState: largeState(n),
      reducers: {
        setCount: (state, action: { payload: number }) => { state.count = action.payload },
        setTheme: (state, action: { payload: string }) => { state.user.settings.theme = action.payload },
        toggleTodo: (state, action: { payload: number }) => { state.todos[action.payload].done = !state.todos[action.payload].done },
      },
    }).reducer,
  })
}

// -- jotai setup --

function jotaiStore() {
  const countAtom = atom(0)
  const store = jotaiCreateStore()
  store.set(countAtom, 0)
  return { store, countAtom }
}

// ================================================================
// BENCHMARKS
// ================================================================

// --- set shallow ---

describe('set shallow value', () => {
  const sc = create(largeState(10_000))
  const scMerge = create(largeState(10_000))
  const zu = zustandStore(10_000)
  const rtk = rtkStore(10_000)
  const { store: jStore, countAtom } = jotaiStore()
  const rtkSlice = createSlice({
    name: 's', initialState: largeState(10_000),
    reducers: { setCount: (s, a: { payload: number }) => { s.count = a.payload } },
  })

  bench('stopcock set', () => {
    sc.set(s => s.count, Math.random())
  })

  bench('stopcock merge', () => {
    scMerge.merge({ count: Math.random() })
  })

  bench('zustand', () => {
    zu.setState({ count: Math.random() })
  })

  bench('RTK', () => {
    rtk.dispatch(rtkSlice.actions.setCount(Math.random()))
  })

  bench('jotai', () => {
    jStore.set(countAtom, Math.random())
  })
})

// --- set deep path ---

describe('set deep path', () => {
  const sc = create(largeState(10_000))
  const zu = zustandStore(10_000)
  const rtk = rtkStore(10_000)
  const rtkSlice = createSlice({
    name: 's', initialState: largeState(10_000),
    reducers: { setTheme: (s, a: { payload: string }) => { s.user.settings.theme = a.payload } },
  })

  bench('stopcock', () => {
    sc.set(s => s.user.settings.theme, Math.random() > 0.5 ? 'dark' : 'light')
  })

  bench('zustand', () => {
    zu.setState(s => ({ user: { ...s.user, settings: { ...s.user.settings, theme: Math.random() > 0.5 ? 'dark' : 'light' } } }))
  })

  bench('RTK', () => {
    rtk.dispatch(rtkSlice.actions.setTheme(Math.random() > 0.5 ? 'dark' : 'light'))
  })
})

// --- subscribe + set (notification cost) ---

describe('set with 1 subscriber', () => {
  const sc = create(largeState(10_000))
  sc.subscribe(s => s.count, () => {})

  const zu = zustandStore(10_000)
  zu.subscribe((s) => s.count, () => {})

  const { store: jStore, countAtom } = jotaiStore()
  jStore.sub(countAtom, () => {})

  bench('stopcock', () => {
    sc.set(s => s.count, Math.random())
  })

  bench('zustand', () => {
    zu.setState({ count: Math.random() })
  })

  bench('jotai', () => {
    jStore.set(countAtom, Math.random())
  })
})

describe('set with 100 unrelated subscribers', () => {
  const sc = create(largeState(10_000))
  for (let i = 0; i < 100; i++) sc.subscribe(s => s.todos[i], () => {})

  const zu = zustandStore(10_000)
  for (let i = 0; i < 100; i++) {
    const idx = i
    zu.subscribe((s) => s.todos[idx], () => {})
  }

  bench('stopcock - set count', () => {
    sc.set(s => s.count, Math.random())
  })

  bench('zustand - set count', () => {
    zu.setState({ count: Math.random() })
  })
})

// --- update (Immer-style draft) ---

describe('update via draft', () => {
  const sc = create(largeState(100))
  const rtk = rtkStore(100)
  const rtkSlice = createSlice({
    name: 's', initialState: largeState(100),
    reducers: { toggleTodo: (s, a: { payload: number }) => { s.todos[a.payload].done = !s.todos[a.payload].done } },
  })

  bench('stopcock', () => {
    sc.update(s => s.todos[0], draft => { draft.done = !draft.done })
  })

  bench('RTK (Immer)', () => {
    rtk.dispatch(rtkSlice.actions.toggleTodo(0))
  })
})

// --- batch ---

describe('batch 10 writes', () => {
  const sc = create(largeState(100))
  sc.subscribe(() => {})

  const zu = zustandStore(100)
  zu.subscribe(() => {})

  bench('stopcock', () => {
    sc.batch(() => { for (let i = 0; i < 10; i++) sc.set(s => s.count, i) })
  })

  bench('zustand (10 setStates)', () => {
    for (let i = 0; i < 10; i++) zu.setState({ count: i })
  })
})

// --- computed / selector ---

describe('computed / selector (cached read)', () => {
  const sc = create(largeState(10_000))
  const c = computed(sc, s => s.todos, ts => ts.filter(t => !t.done).length)

  const zu = zustandStore(10_000)
  const selector = (s: State) => s.todos.filter(t => !t.done).length
  // pre-warm
  selector(zu.getState())

  bench('stopcock computed.get()', () => {
    c.get()
  })

  bench('zustand selector(getState())', () => {
    selector(zu.getState())
  })
})

// --- history undo ---

describe('set with history middleware', () => {
  const h = history<State>({ maxDepth: 1000 })
  const sc = create(largeState(100), { middleware: [h.middleware] })

  bench('stopcock', () => {
    sc.set(s => s.count, Math.random())
  })
})

// --- replace (full diff, worst case) ---

describe('replace (small state)', () => {
  const sc = create(largeState(10))
  const zu = zustandStore(10)
  const next = largeState(10)
  next.count = 99

  bench('stopcock', () => { sc.replace(next) })
  bench('zustand', () => { zu.setState(next, true) })
})

describe('replace (large state)', () => {
  const sc = create(largeState(1_000))
  const zu = zustandStore(1_000)
  const next = largeState(1_000)
  next.count = 99

  bench('stopcock', () => { sc.replace(next) })
  bench('zustand', () => { zu.setState(next, true) })
})
