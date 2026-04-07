import { shallowRef, onScopeDispose, type Ref } from 'vue'
import type { Store, Accessor } from './types.js'

/**
 * Returns a readonly ref that updates when the store slice changes.
 *
 *   const name = useStore(store, s => s.user.name)
 *   // in template: {{ name }}
 */
export function useStore<S extends object, A>(store: Store<S>, accessor: Accessor<S, A>): Readonly<Ref<A>>
export function useStore<S extends object>(store: Store<S>): Readonly<Ref<S>>
export function useStore<S extends object, A>(store: Store<S>, accessor?: Accessor<S, A>): Readonly<Ref<S | A>> {
  const ref = shallowRef(accessor ? store.get(accessor) : store.get()) as Ref<S | A>

  const unsub = accessor
    ? store.subscribe(accessor, (next) => { ref.value = next })
    : store.subscribe((next) => { ref.value = next })

  onScopeDispose(unsub)

  return ref
}
