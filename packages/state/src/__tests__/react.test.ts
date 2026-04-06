// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { create } from '../index.js'
import { useStore } from '../react.js'

type State = { count: number; name: string }
const initial = (): State => ({ count: 0, name: 'Tom' })

describe('useStore (React)', () => {
  it('returns full state', () => {
    const store = create(initial())
    const { result } = renderHook(() => useStore(store))
    expect(result.current).toEqual(initial())
  })

  it('returns sliced value via accessor', () => {
    const store = create(initial())
    const { result } = renderHook(() => useStore(store, s => s.count))
    expect(result.current).toBe(0)
  })

  it('re-renders when state changes', () => {
    const store = create(initial())
    const { result } = renderHook(() => useStore(store, s => s.count))
    expect(result.current).toBe(0)
    act(() => store.set(s => s.count, 5))
    expect(result.current).toBe(5)
  })

  it('does not re-render for unrelated changes', () => {
    const store = create(initial())
    let renderCount = 0
    const { result } = renderHook(() => {
      renderCount++
      return useStore(store, s => s.count)
    })
    expect(result.current).toBe(0)
    const before = renderCount
    act(() => store.set(s => s.name, 'Alice'))
    expect(renderCount).toBe(before) // no re-render
    expect(result.current).toBe(0)
  })

  it('multiple hooks on the same store get correct values', () => {
    const store = create(initial())
    const { result: countResult } = renderHook(() => useStore(store, s => s.count))
    const { result: nameResult } = renderHook(() => useStore(store, s => s.name))
    expect(countResult.current).toBe(0)
    expect(nameResult.current).toBe('Tom')
    act(() => store.set(s => s.count, 10))
    expect(countResult.current).toBe(10)
    expect(nameResult.current).toBe('Tom')
  })

  it('unmounting cleans up subscription', () => {
    const store = create(initial())
    const { unmount } = renderHook(() => useStore(store, s => s.count))
    unmount()
    // should not throw or leak
    store.set(s => s.count, 99)
  })

  it('full state hook re-renders on any change', () => {
    const store = create(initial())
    const { result } = renderHook(() => useStore(store))
    act(() => store.set(s => s.name, 'Alice'))
    expect((result.current as State).name).toBe('Alice')
  })
})
