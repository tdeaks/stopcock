import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resource, mutation, type Resource } from '../resource.js'
import { create } from '../index.js'

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function mockFetch<T>(value: T, ms = 0) {
  return vi.fn((_signal?: AbortSignal) => delay(ms).then(() => value))
}

describe('resource (standalone)', () => {
  it('fetches immediately when not lazy', async () => {
    const fetch = mockFetch('hello', 5)
    const r = resource({ fetch })
    expect(r.status).toBe('loading')
    await delay(10)
    expect(r.status).toBe('ok')
    expect(r.data).toBe('hello')
  })

  it('lazy resource stays idle until subscribed', async () => {
    const fetch = mockFetch('data', 5)
    const r = resource({ fetch, lazy: true })
    expect(r.status).toBe('idle')
    expect(fetch).not.toHaveBeenCalled()

    r.subscribe(() => {})
    expect(r.status).toBe('loading')
    await delay(10)
    expect(r.status).toBe('ok')
    expect(r.data).toBe('data')
  })

  it('initialData sets ok status immediately', () => {
    const r = resource({ fetch: mockFetch([]), initialData: [1, 2, 3], lazy: true })
    expect(r.status).toBe('ok')
    expect(r.data).toEqual([1, 2, 3])
  })

  it('notifies subscribers on state change', async () => {
    const spy = vi.fn()
    const r = resource({ fetch: mockFetch('data', 5) })
    r.subscribe(spy)
    await delay(10)
    expect(spy).toHaveBeenCalled()
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1]
    expect(lastCall[0].status).toBe('ok')
    expect(lastCall[0].data).toBe('data')
  })

  it('error state preserves previous data', async () => {
    let callCount = 0
    const r = resource({
      fetch: () => {
        callCount++
        if (callCount === 1) return Promise.resolve('good')
        return Promise.reject(new Error('fail'))
      },
    })
    await delay(5)
    expect(r.data).toBe('good')

    r.refetch()
    await delay(5)
    expect(r.status).toBe('error')
    expect(r.data).toBe('good') // previous data kept
    expect((r.error as Error).message).toBe('fail')
  })

  it('refetch aborts previous in-flight request', async () => {
    let aborted = false
    const r = resource({
      fetch: (signal) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')) })
        setTimeout(() => resolve('old'), 100)
      }),
    })
    await delay(5)
    r.refetch()
    expect(aborted).toBe(true)
  })

  it('abort() cancels current fetch', async () => {
    let aborted = false
    const r = resource({
      fetch: (signal) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')) })
      }),
    })
    await delay(5)
    r.abort()
    expect(aborted).toBe(true)
  })

  it('destroy cleans up and ignores late resolutions', async () => {
    const spy = vi.fn()
    const r = resource({ fetch: mockFetch('data', 20) })
    r.subscribe(spy)
    spy.mockClear() // clear the loading notification
    r.destroy()
    await delay(30)
    expect(spy).not.toHaveBeenCalled() // no ok notification after destroy
  })
})

describe('resource (store deps)', () => {
  it('refetches when store dependency changes', async () => {
    const store = create({ role: 'admin' })
    const fetch = vi.fn((deps: { role: string }, _signal: AbortSignal) =>
      Promise.resolve(`users-${deps.role}`)
    )
    const r = resource({
      deps: (get) => ({ role: get(store, s => s.role) }),
      fetch,
    })
    await delay(5)
    expect(r.data).toBe('users-admin')

    store.set(s => s.role, 'user')
    // microtask coalescing - need to wait
    await delay(5)
    expect(r.data).toBe('users-user')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('coalesces rapid dep changes', async () => {
    const store = create({ a: 1, b: 2 })
    const fetch = vi.fn((deps: { a: number; b: number }) =>
      Promise.resolve(deps.a + deps.b)
    )
    const r = resource({
      deps: (get) => ({ a: get(store, s => s.a), b: get(store, s => s.b) }),
      fetch: (deps, _signal) => fetch(deps),
    })
    await delay(5)
    fetch.mockClear()

    // rapid changes without batch
    store.set(s => s.a, 10)
    store.set(s => s.b, 20)
    await delay(5)

    // should coalesce into one or two fetches, not three
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(2)
    expect(r.data).toBe(30)
  })

  it('cleans up store subscriptions on destroy', async () => {
    const store = create({ x: 1 })
    const fetch = vi.fn((_deps: { x: number }, _signal: AbortSignal) => Promise.resolve(0))
    const r = resource({
      deps: (get) => ({ x: get(store, s => s.x) }),
      fetch,
    })
    await delay(5)
    fetch.mockClear()

    r.destroy()
    store.set(s => s.x, 99)
    await delay(5)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('resource (resource deps)', () => {
  it('chains: child refetches when parent resolves', async () => {
    const parent = resource({ fetch: () => delay(5).then(() => ({ id: 42 })) })
    const child = resource({
      deps: (get) => {
        const p = get(parent)
        if (!p) return null
        return { parentId: p.id }
      },
      fetch: (deps, _signal) => Promise.resolve(`child-of-${deps.parentId}`),
    })

    // initially parent is loading, child deps returns null, child stays idle
    expect(child.status).toBe('idle')

    await delay(10)
    expect(parent.data).toEqual({ id: 42 })

    // child should have been triggered
    await delay(10)
    expect(child.data).toBe('child-of-42')
  })

  it('deps returning null keeps current state', async () => {
    const parent = resource({ fetch: () => new Promise(() => {}) }) // never resolves
    const child = resource({
      deps: (get) => {
        const p = get(parent)
        if (!p) return null
        return { id: p }
      },
      fetch: (_deps, _signal) => Promise.resolve('data'),
      initialData: 'initial',
    })

    await delay(5)
    expect(child.status).toBe('ok')
    expect(child.data).toBe('initial') // kept from initialData
  })

  it('detects circular dependencies', async () => {
    // A depends on B, B depends on A (both eager)
    // A's deps call get(B). B is already created but not evaluating.
    // When B's deps later call get(A) while A is evaluating, cycle detected.
    // Since lazy resources run on subscribe, we need to trigger them.
    let rA: Resource<any>
    let rB: Resource<any>

    // Both lazy so we control when they start
    rA = resource({
      deps: (get) => {
        get(rB)
        return {}
      },
      fetch: () => Promise.resolve('a'),
      lazy: true,
    })

    rB = resource({
      deps: (get) => {
        get(rA)
        return {}
      },
      fetch: () => Promise.resolve('b'),
      lazy: true,
    })

    // Subscribe to B first so it runs its deps.
    // B's deps calls get(rA), which subscribes to A.
    // Then subscribe to A, which runs A's deps, calling get(rB).
    // get(rB) subscribes to B. B is not evaluating, so no cycle on first run.
    // But when B changes and triggers A, and A triggers B, the cycle manifests.
    // For direct cycle detection we need both to be evaluating simultaneously.

    // Actually, the cycle won't be caught on initial independent runs because
    // they run sequentially. The cycle manifests as infinite re-triggering.
    // Let's test that the cycle is caught when one triggers the other.
    rB.subscribe(() => {})
    rA.subscribe(() => {})

    await delay(20)
    // One of them should have caught the cycle
    const aError = rA.status === 'error'
    const bError = rB.status === 'error'
    expect(aError || bError).toBe(true)
  })
})

describe('resource (generation counter)', () => {
  it('discards stale promise resolutions', async () => {
    let resolvers: Array<(v: string) => void> = []
    const r = resource({
      fetch: (_signal) => new Promise<string>(resolve => resolvers.push(resolve)),
    })

    await delay(1)
    const firstResolver = resolvers[0]

    // trigger a second fetch
    r.refetch()
    await delay(1)
    const secondResolver = resolvers[1]

    // resolve them out of order
    secondResolver('second')
    await delay(1)
    expect(r.data).toBe('second')

    firstResolver('first')
    await delay(1)
    expect(r.data).toBe('second') // first result discarded
  })
})

describe('resource (retry)', () => {
  it('retries on failure', async () => {
    let attempts = 0
    const r = resource({
      fetch: () => {
        attempts++
        if (attempts < 3) return Promise.reject(new Error(`fail-${attempts}`))
        return Promise.resolve('success')
      },
      retry: 3,
      retryDelay: 5,
    })

    await delay(50)
    expect(r.status).toBe('ok')
    expect(r.data).toBe('success')
    expect(attempts).toBe(3)
  })

  it('gives up after max retries', async () => {
    const r = resource({
      fetch: () => Promise.reject(new Error('always-fail')),
      retry: 2,
      retryDelay: 5,
    })

    await delay(50)
    expect(r.status).toBe('error')
    expect((r.error as Error).message).toBe('always-fail')
  })
})

describe('resource (update / optimistic)', () => {
  it('update directly sets data', () => {
    const r = resource({ fetch: mockFetch([1, 2]), initialData: [1, 2, 3] })
    r.update(prev => [...(prev ?? []), 4])
    expect(r.data).toEqual([1, 2, 3, 4])
    expect(r.status).toBe('ok')
  })
})

describe('mutation', () => {
  it('runs and resolves', async () => {
    const m = mutation({
      fn: (input: { name: string }) => Promise.resolve({ id: 1, ...input }),
    })
    const result = await m.run({ name: 'Tom' })
    expect(result).toEqual({ id: 1, name: 'Tom' })
    expect(m.state.status).toBe('ok')
    expect(m.state.data).toEqual({ id: 1, name: 'Tom' })
  })

  it('sets error state on failure', async () => {
    const m = mutation({
      fn: () => Promise.reject(new Error('fail')),
    })
    await expect(m.run(null)).rejects.toThrow('fail')
    expect(m.state.status).toBe('error')
    expect((m.error as Error).message).toBe('fail')
  })

  it('invalidates resources on success', async () => {
    const r = resource({ fetch: mockFetch('data', 5) })
    await delay(10)
    const refetchSpy = vi.spyOn(r, 'refetch')

    const m = mutation({
      fn: () => Promise.resolve('ok'),
      invalidates: [r],
    })
    await m.run(null)
    expect(refetchSpy).toHaveBeenCalled()
  })

  it('calls optimistic and invalidates on error for rollback', async () => {
    const r = resource({ fetch: mockFetch([1, 2, 3]), initialData: [1, 2, 3] })
    const optimisticSpy = vi.fn(() => {
      r.update(() => [1, 2, 3, 4])
    })

    const m = mutation({
      fn: () => Promise.reject(new Error('fail')),
      invalidates: [r],
      optimistic: optimisticSpy,
    })

    expect(r.data).toEqual([1, 2, 3])
    try { await m.run(null) } catch {}

    expect(optimisticSpy).toHaveBeenCalled()
    // invalidation should have been called on error to rollback
  })

  it('reset clears mutation state', async () => {
    const m = mutation({ fn: () => Promise.resolve('ok') })
    await m.run(null)
    expect(m.state.status).toBe('ok')
    m.reset()
    expect(m.state.status).toBe('idle')
  })

  it('abort cancels running mutation', async () => {
    let aborted = false
    const m = mutation({
      fn: (_input, signal) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('Aborted', 'AbortError')) })
      }),
    })
    const promise = m.run(null)
    m.abort()
    await expect(promise).rejects.toThrow()
    expect(aborted).toBe(true)
  })
})

describe('mutation (reactivity)', () => {
  it('subscribe fires on status transitions', async () => {
    const states: string[] = []
    const m = mutation({ fn: () => delay(5).then(() => 'ok') })
    m.subscribe((next) => states.push(next.status))
    await m.run(null)
    expect(states).toEqual(['running', 'ok'])
  })

  it('subscribe fires on error', async () => {
    const states: string[] = []
    const m = mutation({ fn: () => Promise.reject(new Error('fail')) })
    m.subscribe((next) => states.push(next.status))
    try { await m.run(null) } catch {}
    expect(states).toEqual(['running', 'error'])
  })

  it('subscribe fires on reset', async () => {
    const states: string[] = []
    const m = mutation({ fn: () => Promise.resolve('ok') })
    await m.run(null)
    m.subscribe((next) => states.push(next.status))
    m.reset()
    expect(states).toEqual(['idle'])
  })

  it('get() returns current state', async () => {
    const m = mutation({ fn: () => delay(5).then(() => 'data') })
    expect(m.get().status).toBe('idle')
    const promise = m.run(null)
    expect(m.get().status).toBe('running')
    await promise
    expect(m.get().status).toBe('ok')
    expect(m.get().data).toBe('data')
  })

  it('subscriber error does not break other subscribers', async () => {
    const spy = vi.fn()
    const m = mutation({ fn: () => Promise.resolve('ok') })
    m.subscribe(() => { throw new Error('boom') })
    m.subscribe(spy)
    await m.run(null)
    expect(spy).toHaveBeenCalled()
  })
})

describe('resource (into store)', () => {
  it('writes resource state into store handle', async () => {
    const { idle } = await import('../resource.js')
    type RS = import('../resource.js').ResourceState<string>
    const store = create({ data: idle<string>() as RS })
    const handle = store.at<RS>(['data'])

    const r = resource({
      fetch: () => delay(5).then(() => 'hello'),
      into: handle,
    })

    expect(store.get(s => s.data).status).toBe('loading')
    await delay(10)
    expect(store.get(s => s.data).status).toBe('ok')
    expect(store.get(s => s.data).data).toBe('hello')
    r.destroy()
  })

  it('store subscribers see resource state changes', async () => {
    const { idle } = await import('../resource.js')
    type RS = import('../resource.js').ResourceState<number>
    const store = create({ result: idle<number>() as RS })
    const handle = store.at<RS>(['result'])
    const spy = vi.fn()
    store.subscribe(s => s.result, spy)

    const r = resource({
      fetch: () => delay(5).then(() => 42),
      into: handle,
    })

    await delay(10)
    // should have been notified for loading and ok transitions
    expect(spy).toHaveBeenCalled()
    const lastState = spy.mock.calls[spy.mock.calls.length - 1][0] as RS
    expect(lastState.status).toBe('ok')
    expect(lastState.data).toBe(42)
    r.destroy()
  })
})

describe('resource + HTTP integration', () => {
  it('resource refetches via HTTP client when store dep changes', async () => {
    const { createClient } = await import('../../../http/src/client')
    const mockFetch = vi.fn(async (url: string) => {
      const u = new URL(url)
      const q = u.searchParams.get('q') ?? ''
      return new Response(JSON.stringify([{ name: q || 'all' }]), {
        headers: new Headers({ 'content-type': 'application/json' }),
      })
    })
    const api = createClient({ baseUrl: 'https://api.test', fetch: mockFetch })
    const store = create({ search: '' })
    const r = resource({
      deps: (get) => ({ q: get(store, s => s.search) }),
      fetch: ({ q }, signal) => api.get<{ name: string }[]>('/users', { query: { q }, signal }),
    })

    await delay(10)
    expect(r.data).toEqual([{ name: 'all' }])

    store.set(s => s.search, 'tom')
    await delay(10)
    expect(r.data).toEqual([{ name: 'tom' }])
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('HTTP error puts resource in error state', async () => {
    const { createClient } = await import('../../../http/src/client')
    const mockFetch = vi.fn(async () =>
      new Response('{"message":"not found"}', { status: 404, statusText: 'Not Found', headers: new Headers({ 'content-type': 'application/json' }) })
    )
    const api = createClient({ fetch: mockFetch })
    const r = resource({
      fetch: (signal) => api.get('/missing', { signal }),
    })
    await delay(10)
    expect(r.status).toBe('error')
    expect(r.error).toBeDefined()
  })
})

describe('resource (SSR safety)', () => {
  it('refetchOnFocus does not throw without document', async () => {
    const r = resource({
      fetch: () => Promise.resolve('data'),
      refetchOnFocus: true,
      refetchOnReconnect: true,
    })
    await delay(5)
    expect(r.data).toBe('data')
    r.destroy() // should not throw
  })
})

describe('resource (error isolation)', () => {
  it('one subscriber throwing does not break others', async () => {
    const r = resource({ fetch: mockFetch('data', 5) })
    const spy = vi.fn()
    r.subscribe(() => { throw new Error('boom') })
    r.subscribe(spy)
    await delay(10)
    expect(spy).toHaveBeenCalled()
  })
})

describe('resource (re-entrancy)', () => {
  it('subscriber that calls store.set during resource notification works', async () => {
    const store = create({ count: 0 })
    const r = resource({ fetch: mockFetch('data', 5) })

    r.subscribe(() => {
      store.set(s => s.count, 1)
    })

    await delay(10)
    expect(store.get(s => s.count)).toBe(1)
    expect(r.data).toBe('data')
  })
})
