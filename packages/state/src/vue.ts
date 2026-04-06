import { shallowRef, onScopeDispose, type Ref } from 'vue'
import type { Store, Accessor } from './types.js'
import type { Resource, ResourceState, Mutation, MutationState } from './resource.js'

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

export function useResource<T>(r: Resource<T>): Readonly<Ref<ResourceState<T>>> {
  const ref = shallowRef(r.get()) as Ref<ResourceState<T>>
  const unsub = r.subscribe((next) => { ref.value = next })
  onScopeDispose(unsub)
  return ref
}

export function useMutation<I, O>(m: Mutation<I, O>): Readonly<Ref<MutationState<O>>> {
  const ref = shallowRef(m.get()) as Ref<MutationState<O>>
  const unsub = m.subscribe((next) => { ref.value = next })
  onScopeDispose(unsub)
  return ref
}
