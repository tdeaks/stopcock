import type { Store, Accessor, Unsubscribe } from './types.js'

// --- Types ---

export type ResourceStatus = 'idle' | 'loading' | 'ok' | 'error'

export type ResourceState<T> = {
  readonly status: ResourceStatus
  readonly data: T | undefined
  readonly error: unknown
}

export type ResourceListener<T> = (next: ResourceState<T>, prev: ResourceState<T>) => void

export interface Resource<T> {
  get(): ResourceState<T>
  readonly data: T | undefined
  readonly error: unknown
  readonly status: ResourceStatus
  readonly isLoading: boolean
  readonly isOk: boolean
  readonly isError: boolean
  readonly isIdle: boolean
  refetch(): void
  abort(): void
  subscribe(listener: ResourceListener<T>): Unsubscribe
  /** Directly set data (used by mutations for optimistic updates). */
  update(fn: (prev: T | undefined) => T): void
  destroy(): void
}

export interface Get {
  <S extends object, A>(store: Store<S>, accessor: Accessor<S, A>): A
  <T>(resource: Resource<T>): T | undefined
}

export type ResourceOptions<T> = {
  initialData?: T
  lazy?: boolean
  staleTime?: number
  refetchInterval?: number
  refetchOnFocus?: boolean
  refetchOnReconnect?: boolean
  retry?: number
  retryDelay?: number | ((attempt: number) => number)
  onSuccess?: (data: T) => void
  onError?: (error: unknown) => void
}

export type ResourceConfig<D, T> = {
  deps?: (get: Get) => D | null
  fetch: D extends void ? (signal: AbortSignal) => Promise<T> : (deps: D, signal: AbortSignal) => Promise<T>
} & ResourceOptions<T>

// --- Cycle detection ---

const evaluating = new Set<Resource<any>>()

// --- Resource ---

function isStore(x: unknown): x is Store<any> {
  return x != null && typeof x === 'object' && 'subscribe' in x && 'set' in x && 'get' in x && 'batch' in x
}

export function resource<T>(config: { fetch: (signal: AbortSignal) => Promise<T> } & ResourceOptions<T>): Resource<T>
export function resource<D, T>(config: { deps: (get: Get) => D | null; fetch: (deps: D, signal: AbortSignal) => Promise<T> } & ResourceOptions<T>): Resource<T>
export function resource<D, T>(config: ResourceConfig<D, T>): Resource<T> {
  const { deps: depsFn, retry: retryCount = 0, retryDelay = 1000, onSuccess, onError } = config
  const fetchFn = config.fetch as (deps: any, signal: AbortSignal) => Promise<T>

  let state: ResourceState<T> = config.initialData !== undefined
    ? { status: 'ok', data: config.initialData, error: undefined }
    : { status: 'idle', data: undefined, error: undefined }

  let listeners: ResourceListener<T>[] = []
  let destroyed = false
  let gen = 0
  let controller: AbortController | null = null
  let unsubs: Unsubscribe[] = []
  let coalesceScheduled = false
  let lastFetchTime = 0
  let intervalTimer: ReturnType<typeof setInterval> | null = null
  let hasSubscribers = false

  // notification guard (like store's guardedNotify)
  let notifying = false
  let pendingNotifications: Array<() => void> = []

  function setState(next: ResourceState<T>) {
    if (destroyed) return
    const prev = state
    state = next
    guardedNotify(() => {
      for (const fn of listeners) {
        try { fn(state, prev) } catch {}
      }
    })
  }

  function guardedNotify(fn: () => void) {
    if (notifying) { pendingNotifications.push(fn); return }
    notifying = true
    try { fn() } finally { notifying = false }
    while (pendingNotifications.length > 0) {
      const queue = pendingNotifications
      pendingNotifications = []
      for (let i = 0; i < queue.length; i++) {
        notifying = true
        try { queue[i]() } finally { notifying = false }
      }
    }
    // resource subscriber errors are swallowed (unlike store which rethrows)
    // since resource state changes are async, there's no meaningful caller to throw to
  }

  function teardownSubs() {
    for (let i = 0; i < unsubs.length; i++) unsubs[i]()
    unsubs = []
  }

  function scheduleRun() {
    if (destroyed || coalesceScheduled) return
    coalesceScheduled = true
    queueMicrotask(() => {
      coalesceScheduled = false
      if (destroyed) return
      run()
    })
  }

  function run() {
    if (destroyed) return

    let resolvedDeps: D | null | undefined
    if (depsFn) {
      // tear down old subscriptions before re-recording
      teardownSubs()
      const newUnsubs: Unsubscribe[] = []

      evaluating.add(self)
      try {
        const get: Get = ((first: any, second?: any) => {
          if (isStore(first)) {
            // get(store, accessor)
            const store = first as Store<any>
            const accessor = second as Accessor<any, any>
            const unsub = store.subscribe(accessor, scheduleRun as any)
            newUnsubs.push(unsub)
            return store.get(accessor)
          } else {
            // get(resource)
            const dep = first as Resource<any>
            if (evaluating.has(dep)) throw new Error('Circular resource dependency detected')
            const unsub = dep.subscribe(scheduleRun as any)
            newUnsubs.push(unsub)
            return dep.data
          }
        }) as Get
        resolvedDeps = depsFn(get)
      } catch (e) {
        evaluating.delete(self)
        // restore old subs on error? No, they were torn down. Just fail.
        setState({ status: 'error', data: state.data, error: e })
        return
      }
      evaluating.delete(self)
      unsubs = newUnsubs

      if (resolvedDeps === null) return // deps not ready, keep current state
    }

    // abort any in-flight fetch
    controller?.abort()
    controller = new AbortController()
    const myGen = ++gen
    const signal = controller.signal

    setState({ status: 'loading', data: state.data, error: undefined })

    const doFetch = (attempt: number): Promise<T> => {
      const promise = depsFn
        ? fetchFn(resolvedDeps as D, signal)
        : (config.fetch as (signal: AbortSignal) => Promise<T>)(signal)

      return promise.catch((error) => {
        if (signal.aborted) throw error
        if (attempt < retryCount) {
          const delay = typeof retryDelay === 'function' ? retryDelay(attempt) : retryDelay
          return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
              if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return }
              doFetch(attempt + 1).then(resolve, reject)
            }, delay)
            signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
          })
        }
        throw error
      })
    }

    doFetch(0).then(
      (data) => {
        if (gen !== myGen || destroyed) return
        lastFetchTime = Date.now()
        setState({ status: 'ok', data, error: undefined })
        onSuccess?.(data)
      },
      (error) => {
        if (gen !== myGen || destroyed) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', data: state.data, error })
        onError?.(error)
      },
    )
  }

  function setupInterval() {
    if (!config.refetchInterval || intervalTimer) return
    intervalTimer = setInterval(() => {
      if (destroyed) return
      if (config.staleTime && lastFetchTime && Date.now() - lastFetchTime < config.staleTime) return
      run()
    }, config.refetchInterval)
  }

  function clearInterval_() {
    if (intervalTimer) { clearInterval(intervalTimer); intervalTimer = null }
  }

  // focus/reconnect handlers
  let visibilityHandler: (() => void) | null = null
  let onlineHandler: (() => void) | null = null

  function setupBrowserHandlers() {
    if (typeof globalThis.document === 'undefined') return
    if (config.refetchOnFocus) {
      visibilityHandler = () => {
        if (document.visibilityState !== 'visible') return
        if (destroyed) return
        if (config.staleTime && lastFetchTime && Date.now() - lastFetchTime < config.staleTime) return
        run()
      }
      document.addEventListener('visibilitychange', visibilityHandler)
    }
    if (config.refetchOnReconnect && typeof globalThis.window !== 'undefined') {
      onlineHandler = () => {
        if (destroyed) return
        if (config.staleTime && lastFetchTime && Date.now() - lastFetchTime < config.staleTime) return
        run()
      }
      window.addEventListener('online', onlineHandler)
    }
  }

  const self: Resource<T> = {
    get() { return state },
    get data() { return state.data },
    get error() { return state.error },
    get status() { return state.status },
    get isLoading() { return state.status === 'loading' },
    get isOk() { return state.status === 'ok' },
    get isError() { return state.status === 'error' },
    get isIdle() { return state.status === 'idle' },

    refetch() {
      if (destroyed) return
      run()
    },

    abort() {
      controller?.abort()
    },

    update(fn: (prev: T | undefined) => T) {
      if (destroyed) return
      const next = fn(state.data)
      setState({ status: 'ok', data: next, error: undefined })
    },

    subscribe(listener: ResourceListener<T>): Unsubscribe {
      listeners.push(listener)
      const wasEmpty = !hasSubscribers
      hasSubscribers = true

      // first subscriber triggers initial fetch for lazy resources
      if (wasEmpty && config.lazy && state.status === 'idle') {
        run()
      }

      return () => {
        listeners = listeners.filter(l => l !== listener)
        hasSubscribers = listeners.length > 0
      }
    },

    destroy() {
      destroyed = true
      controller?.abort()
      teardownSubs()
      clearInterval_()
      listeners = []
      hasSubscribers = false
      if (visibilityHandler && typeof globalThis.document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityHandler)
      }
      if (onlineHandler && typeof globalThis.window !== 'undefined') {
        window.removeEventListener('online', onlineHandler)
      }
    },
  }

  // initial fetch
  if (!config.lazy) {
    run()
  }

  setupInterval()
  setupBrowserHandlers()

  return self
}

// --- Mutation ---

export type MutationStatus = 'idle' | 'running' | 'ok' | 'error'

export type MutationState<O> = {
  readonly status: MutationStatus
  readonly data: O | undefined
  readonly error: unknown
}

export type MutationConfig<I, O> = {
  fn: (input: I, signal: AbortSignal) => Promise<O>
  invalidates?: Resource<any>[]
  optimistic?: (input: I) => void
  onSuccess?: (data: O, input: I) => void
  onError?: (error: unknown, input: I) => void
}

export type MutationListener<O> = (next: MutationState<O>, prev: MutationState<O>) => void

export interface Mutation<I, O> {
  run(input: I): Promise<O>
  get(): MutationState<O>
  readonly state: MutationState<O>
  readonly isRunning: boolean
  readonly error: unknown
  abort(): void
  reset(): void
  subscribe(listener: MutationListener<O>): Unsubscribe
}

export function mutation<I, O>(config: MutationConfig<I, O>): Mutation<I, O> {
  let state: MutationState<O> = { status: 'idle', data: undefined, error: undefined }
  let controller: AbortController | null = null
  let listeners: MutationListener<O>[] = []

  function setState(next: MutationState<O>) {
    const prev = state
    state = next
    for (const fn of listeners) {
      try { fn(state, prev) } catch {}
    }
  }

  const self: Mutation<I, O> = {
    async run(input: I): Promise<O> {
      controller?.abort()
      controller = new AbortController()

      setState({ status: 'running', data: state.data, error: undefined })

      // optimistic update
      config.optimistic?.(input)

      try {
        const result = await config.fn(input, controller.signal)
        setState({ status: 'ok', data: result, error: undefined })
        config.onSuccess?.(result, input)

        if (config.invalidates) {
          for (const r of config.invalidates) r.refetch()
        }

        return result
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        setState({ status: 'error', data: state.data, error })
        config.onError?.(error, input)

        if (config.optimistic && config.invalidates) {
          for (const r of config.invalidates) r.refetch()
        }

        throw error
      }
    },

    get() { return state },
    get state() { return state },
    get isRunning() { return state.status === 'running' },
    get error() { return state.error },

    abort() { controller?.abort() },

    reset() {
      controller?.abort()
      setState({ status: 'idle', data: undefined, error: undefined })
    },

    subscribe(listener: MutationListener<O>): Unsubscribe {
      listeners.push(listener)
      return () => { listeners = listeners.filter(l => l !== listener) }
    },
  }

  return self
}
