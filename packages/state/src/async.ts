import type { Store } from './types.js'

export type AsyncActionConfig<S extends object, A> = {
  task: { run: (signal?: AbortSignal) => Promise<A> }
  onStart?: (store: Store<S>) => void
  onSuccess: (store: Store<S>, result: A) => void
  onError?: (store: Store<S>, error: unknown) => void
  onFinally?: (store: Store<S>) => void
}

export function asyncAction<S extends object, A>(
  store: Store<S>,
  config: AsyncActionConfig<S, A>,
): { abort(): void; result: Promise<A> } {
  const controller = new AbortController()

  if (config.onStart) config.onStart(store)

  const result = config.task.run(controller.signal).then(
    (value) => {
      config.onSuccess(store, value)
      return value
    },
    (error) => {
      if (config.onError) config.onError(store, error)
      throw error
    },
  ).finally(() => {
    if (config.onFinally) config.onFinally(store)
  })

  return {
    abort: () => controller.abort(),
    result,
  }
}
