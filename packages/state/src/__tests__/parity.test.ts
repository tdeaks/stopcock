import { describe, it, expect } from 'vitest'
import { create } from '../index.js'
import { createStore as zustandCreate } from 'zustand/vanilla'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import { createStore as jotaiCreateStore } from 'jotai/vanilla'
import { atom } from 'jotai'

type State = {
  user: { name: string; email: string }
  todos: { id: number; text: string; done: boolean }[]
  count: number
}

const initial = (): State => ({
  user: { name: 'Tom', email: 'tom@test.com' },
  todos: [
    { id: 1, text: 'Write tests', done: false },
    { id: 2, text: 'Ship it', done: true },
  ],
  count: 0,
})

describe('parity: set shallow value', () => {
  it('stopcock and zustand produce the same result', () => {
    const sc = create(initial())
    const zu = zustandCreate<State>()(() => initial())

    sc.set(s => s.count, 42)
    zu.setState({ count: 42 })

    expect(sc.get()).toEqual(zu.getState())
  })
})

describe('parity: set deep path', () => {
  it('stopcock and zustand produce the same result', () => {
    const sc = create(initial())
    const zu = zustandCreate<State>()(() => initial())

    sc.set(s => s.user.name, 'Alice')
    zu.setState(s => ({ user: { ...s.user, name: 'Alice' } }))

    expect(sc.get()).toEqual(zu.getState())
  })
})

describe('parity: multiple sequential sets', () => {
  it('stopcock and zustand produce the same result', () => {
    const sc = create(initial())
    const zu = zustandCreate<State>()(() => initial())

    sc.set(s => s.count, 1)
    sc.set(s => s.user.name, 'Alice')
    sc.set(s => s.user.email, 'alice@test.com')

    zu.setState({ count: 1 })
    zu.setState(s => ({ user: { ...s.user, name: 'Alice' } }))
    zu.setState(s => ({ user: { ...s.user, email: 'alice@test.com' } }))

    expect(sc.get()).toEqual(zu.getState())
  })
})

describe('parity: update draft vs RTK reducer', () => {
  it('stopcock update and RTK Immer produce the same result', () => {
    const sc = create(initial())

    const todoSlice = createSlice({
      name: 'state',
      initialState: initial(),
      reducers: {
        toggleTodo: (state, action: { payload: number }) => {
          const todo = state.todos.find(t => t.id === action.payload)
          if (todo) todo.done = !todo.done
        },
        addTodo: (state, action: { payload: { id: number; text: string } }) => {
          state.todos.push({ ...action.payload, done: false })
        },
        setName: (state, action: { payload: string }) => {
          state.user.name = action.payload
        },
      },
    })
    const rtk = configureStore({ reducer: todoSlice.reducer })

    // toggle todo 1
    sc.update(s => s.todos, draft => {
      const todo = draft.find((t: any) => t.id === 1)
      if (todo) todo.done = !todo.done
    })
    rtk.dispatch(todoSlice.actions.toggleTodo(1))
    expect(sc.get()).toEqual(rtk.getState())

    // add a todo
    sc.update(draft => {
      draft.todos.push({ id: 3, text: 'New todo', done: false })
    })
    rtk.dispatch(todoSlice.actions.addTodo({ id: 3, text: 'New todo' }))
    expect(sc.get()).toEqual(rtk.getState())

    // set name
    sc.update(draft => { draft.user.name = 'Alice' })
    rtk.dispatch(todoSlice.actions.setName('Alice'))
    expect(sc.get()).toEqual(rtk.getState())
  })
})

describe('parity: replace entire state', () => {
  it('stopcock and zustand produce the same result', () => {
    const sc = create(initial())
    const zu = zustandCreate<State>()(() => initial())

    const next: State = {
      user: { name: 'Alice', email: 'alice@new.com' },
      todos: [],
      count: 99,
    }

    sc.replace(next)
    zu.setState(next, true)

    expect(sc.get()).toEqual(zu.getState())
  })
})

describe('parity: subscriber notifications', () => {
  it('stopcock and zustand notify on relevant changes with same values', () => {
    const scValues: number[] = []
    const zuValues: number[] = []

    const sc = create(initial())
    sc.subscribe(s => s.count, (next) => scValues.push(next))

    // zustand vanilla subscribe takes (listener), not (selector, listener)
    // so we manually select inside the listener
    const zu = zustandCreate<State>()(() => initial())
    let zuPrevCount = zu.getState().count
    zu.subscribe((state) => {
      if (state.count !== zuPrevCount) {
        zuValues.push(state.count)
        zuPrevCount = state.count
      }
    })

    sc.set(s => s.count, 1)
    zu.setState({ count: 1 })

    sc.set(s => s.count, 2)
    zu.setState({ count: 2 })

    sc.set(s => s.count, 5)
    zu.setState({ count: 5 })

    expect(scValues).toEqual(zuValues)
    expect(scValues).toEqual([1, 2, 5])
  })

  it('stopcock and zustand do not notify on unrelated changes', () => {
    const scCalls: number[] = []
    const zuCalls: number[] = []

    const sc = create(initial())
    sc.subscribe(s => s.count, (next) => scCalls.push(next))

    const zu = zustandCreate<State>()(() => initial())
    let zuPrevCount = zu.getState().count
    zu.subscribe((state) => {
      if (state.count !== zuPrevCount) {
        zuCalls.push(state.count)
        zuPrevCount = state.count
      }
    })

    // change name, not count
    sc.set(s => s.user.name, 'Alice')
    zu.setState(s => ({ user: { ...s.user, name: 'Alice' } }))

    expect(scCalls).toEqual([])
    expect(zuCalls).toEqual([])
  })
})

describe('parity: noop updates', () => {
  it('setting the same value does not change state reference', () => {
    const sc = create(initial())
    const zu = zustandCreate<State>()(() => initial())

    const scBefore = sc.get()
    sc.set(s => s.count, 0) // same value
    expect(sc.get()).toBe(scBefore)

    // zustand always creates new state even for noop — this is a difference
    // but the values should still be equal
    zu.setState({ count: 0 })
    expect(zu.getState()).toEqual(sc.get())
  })
})

describe('parity: read after write', () => {
  it('stopcock and zustand see writes immediately', () => {
    const sc = create(initial())
    const zu = zustandCreate<State>()(() => initial())

    sc.set(s => s.count, 42)
    zu.setState({ count: 42 })

    expect(sc.get(s => s.count)).toBe(42)
    expect(zu.getState().count).toBe(42)
  })
})

describe('parity: jotai atom equivalence', () => {
  it('stopcock slice and jotai atom produce the same sequence', () => {
    const scValues: number[] = []
    const jValues: number[] = []

    const sc = create(initial())
    sc.subscribe(s => s.count, (next) => scValues.push(next))

    const countAtom = atom(0)
    const jStore = jotaiCreateStore()
    jStore.sub(countAtom, () => jValues.push(jStore.get(countAtom)))

    sc.set(s => s.count, 1)
    jStore.set(countAtom, 1)

    sc.set(s => s.count, 2)
    jStore.set(countAtom, 2)

    sc.set(s => s.count, 10)
    jStore.set(countAtom, 10)

    expect(scValues).toEqual(jValues)
  })
})

describe('parity: over / transform', () => {
  it('stopcock over and zustand setState(fn) produce the same result', () => {
    const sc = create(initial())
    const zu = zustandCreate<State>()(() => initial())

    sc.over(s => s.count, n => n + 10)
    zu.setState(s => ({ count: s.count + 10 }))

    expect(sc.get()).toEqual(zu.getState())

    sc.over(s => s.count, n => n * 2)
    zu.setState(s => ({ count: s.count * 2 }))

    expect(sc.get()).toEqual(zu.getState())
  })
})

describe('parity: batch produces same final state', () => {
  it('batch of sets equals sequential sets', () => {
    const sequential = create(initial())
    const batched = create(initial())

    sequential.set(s => s.count, 1)
    sequential.set(s => s.user.name, 'Alice')
    sequential.set(s => s.count, 2)

    batched.batch(() => {
      batched.set(s => s.count, 1)
      batched.set(s => s.user.name, 'Alice')
      batched.set(s => s.count, 2)
    })

    expect(batched.get()).toEqual(sequential.get())
  })
})
