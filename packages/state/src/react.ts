import { useSyncExternalStore, useRef, useCallback } from 'react'
import type { Store, Accessor } from './types.js'
import type { Resource, ResourceState, Mutation, MutationState } from './resource.js'

export function useStore<S extends object>(store: Store<S>): S
export function useStore<S extends object, A>(store: Store<S>, accessor: Accessor<S, A>): A
export function useStore<S extends object, A>(store: Store<S>, accessor?: Accessor<S, A>): S | A {
  if (!accessor) {
    return useSyncExternalStore(
      (cb) => store.subscribe(cb as any),
      () => store.get(),
    )
  }

  const accessorRef = useRef(accessor)
  accessorRef.current = accessor

  const subscribe = useCallback(
    (cb: () => void) => store.subscribe(accessorRef.current, cb as any),
    [store],
  )
  const getSnapshot = useCallback(
    () => store.get(accessorRef.current),
    [store],
  )

  return useSyncExternalStore(subscribe, getSnapshot)
}

export function useResource<T>(resource: Resource<T>): ResourceState<T> & {
  isLoading: boolean
  isOk: boolean
  isError: boolean
  isIdle: boolean
  refetch: () => void
  abort: () => void
} {
  const state = useSyncExternalStore(
    (cb) => resource.subscribe(cb as any),
    () => resource.get(),
  )

  return {
    ...state,
    isLoading: state.status === 'loading',
    isOk: state.status === 'ok',
    isError: state.status === 'error',
    isIdle: state.status === 'idle',
    refetch: resource.refetch,
    abort: resource.abort,
  }
}

export function useMutation<I, O>(m: Mutation<I, O>): MutationState<O> & {
  run: (input: I) => Promise<O>
  abort: () => void
  reset: () => void
} {
  const state = useSyncExternalStore(
    (cb) => m.subscribe(cb as any),
    () => m.get(),
  )

  return {
    ...state,
    run: m.run,
    abort: m.abort,
    reset: m.reset,
  }
}
