import { err, ok, type Result } from '@stopcock/fp/result'

export type NodeCallback<A, E = unknown> = (
  error: E | null | undefined,
  value: A,
) => void

export type NodeResultCallback<A, E> = (
  error: E | null,
  value?: A,
) => void

/**
 * Adapts one Node-style registration to a Promise of Result.
 *
 * There is intentionally no cancellation or task runtime here. Only the first
 * callback (or synchronous throw) settles the returned native Promise.
 */
export function fromNodeCallback<A>(
  register: (callback: NodeCallback<A>) => void,
): Promise<Result<A, unknown>>
export function fromNodeCallback<A, E>(
  register: (callback: NodeCallback<A>) => void,
  onError: (error: unknown) => E,
): Promise<Result<A, E>>
export function fromNodeCallback<A, E>(
  register: (callback: NodeCallback<A>) => void,
  onError?: (error: unknown) => E,
): Promise<Result<A, unknown>> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: Result<A, unknown>): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const mapError = (error: unknown): unknown =>
      onError ? onError(error) : error

    try {
      register((error, value) => {
        if (settled) return
        finish(error == null ? ok(value) : err(mapError(error)))
      })
    } catch (error) {
      if (settled) return
      finish(err(mapError(error)))
    }
  })
}

export function liftNodeCallback<
  Args extends readonly unknown[],
  A,
>(
  fn: (...args: [...Args, NodeCallback<A>]) => void,
): (...args: Args) => Promise<Result<A, unknown>>
export function liftNodeCallback<
  Args extends readonly unknown[],
  A,
  E,
>(
  fn: (...args: [...Args, NodeCallback<A>]) => void,
  onError: (error: unknown) => E,
): (...args: Args) => Promise<Result<A, E>>
export function liftNodeCallback<
  Args extends readonly unknown[],
  A,
  E,
>(
  fn: (...args: [...Args, NodeCallback<A>]) => void,
  onError?: (error: unknown) => E,
): (...args: Args) => Promise<Result<A, unknown>> {
  return (...args) =>
    fromNodeCallback(
      (callback) => fn(...args, callback),
      onError ?? ((error) => error),
    )
}

/**
 * Calls a Node-style callback synchronously. Err supplies no value; Ok
 * supplies null as the error.
 */
export function resultToNodeCallback<A, E>(
  value: Result<A, E>,
  callback: NodeResultCallback<A, E>,
): void {
  if (value._tag === 1) callback(null, value.value)
  else callback(value.error)
}
