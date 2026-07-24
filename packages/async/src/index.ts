import * as TaskApi from './task-namespace'
import type { Task as TaskValue } from './task'

export type Task<A, E = never> = TaskValue<A, E>
export type { RetryOptions, BackoffStrategy } from './types'
export type {
  AsyncSource,
  AsyncMapper,
  AsyncPredicate,
  ConcurrentMapOptions,
} from './async-iter'
export { CancelledError, TimeoutError } from './types'
export * as AsyncIter from './async-iter'
export const Task = TaskApi

export {
  of,
  resolve,
  reject,
  fromPromise,
  tryPromise,
  fromAsyncThrowable,
  fromResult,
  fromOption,
  delay,
  never,
  map,
  flatMap,
  tap,
  mapError,
  catchError,
  flatMapError,
  match,
  run,
  runSafe,
  runWithCancel,
} from './task'

export { all, allSettled, race, any, parallel, sequential } from './concurrency'
export { retry, timeout, fallback } from './resilience'
export { throttle, debounce, rateLimit } from './flow'
export { mapAsync, filterAsync, forEachAsync, reduceAsync, collectAsync } from './array'
