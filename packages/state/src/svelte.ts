import type { Store, Accessor } from './types.js'

type SvelteReadable<T> = { subscribe: (fn: (value: T) => void) => () => void }

/**
 * Wrap a store slice as a Svelte-compatible readable store.
 * Works with `$slice` auto-subscription syntax in Svelte components.
 *
 *   const name = slice(store, s => s.user.name)
 *   // in template: {$name}
 */
export function slice<S extends object, A>(store: Store<S>, accessor: Accessor<S, A>): SvelteReadable<A> {
  return {
    subscribe(fn: (value: A) => void) {
      fn(store.get(accessor))
      return store.subscribe(accessor, (next) => fn(next))
    },
  }
}

/**
 * Wrap the full store as a Svelte-compatible readable store.
 */
export function readable<S extends object>(store: Store<S>): SvelteReadable<S> {
  return {
    subscribe(fn: (value: S) => void) {
      fn(store.get())
      return store.subscribe((next) => fn(next))
    },
  }
}
