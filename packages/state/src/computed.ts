import type { Store, Accessor, Listener, Unsubscribe } from './types.js'

export interface Computed<D> {
  get(): D
  subscribe(listener: Listener<D>): Unsubscribe
  destroy(): void
}

export function computed<S extends object, A, D>(
  store: Store<S>,
  accessor: Accessor<S, A>,
  derive: (slice: A) => D,
  eq: (a: D, b: D) => boolean = (a, b) => a === b,
): Computed<D> {
  let cached: D = derive(store.get(accessor))
  let dirty = false
  let destroyed = false
  let listeners: Listener<D>[] = []

  const unsub = store.subscribe(accessor, () => {
    if (destroyed) return
    dirty = true
    const prev = cached
    cached = derive(store.get(accessor))
    dirty = false
    if (!eq(prev, cached)) {
      for (const fn of listeners) {
        try { fn(cached, prev) } catch {}
      }
    }
  })

  return {
    get() {
      if (dirty && !destroyed) {
        cached = derive(store.get(accessor))
        dirty = false
      }
      return cached
    },
    subscribe(listener: Listener<D>): Unsubscribe {
      listeners.push(listener)
      return () => { listeners = listeners.filter(l => l !== listener) }
    },
    destroy() {
      destroyed = true
      listeners = []
      unsub()
    },
  }
}
