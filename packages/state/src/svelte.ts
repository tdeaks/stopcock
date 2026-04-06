import type { Store, Accessor } from './types.js'
import type { Resource, ResourceState, Mutation, MutationState } from './resource.js'

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

export function resourceStore<T>(r: Resource<T>): SvelteReadable<ResourceState<T>> {
  return {
    subscribe(fn: (value: ResourceState<T>) => void) {
      fn(r.get())
      return r.subscribe((next) => fn(next))
    },
  }
}

export function mutationStore<I, O>(m: Mutation<I, O>): SvelteReadable<MutationState<O>> {
  return {
    subscribe(fn: (value: MutationState<O>) => void) {
      fn(m.get())
      return m.subscribe((next) => fn(next))
    },
  }
}
