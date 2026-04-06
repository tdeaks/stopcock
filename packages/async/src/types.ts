export class CancelledError extends Error {
  readonly _tag = 'CancelledError' as const
  constructor(message = 'Task was cancelled') { super(message) }
}

export class TimeoutError extends Error {
  readonly _tag = 'TimeoutError' as const
  constructor(readonly ms: number) { super(`Task timed out after ${ms}ms`) }
}

export type BackoffStrategy = 'constant' | 'linear' | 'exponential'

export type RetryOptions = {
  readonly attempts: number
  readonly delay?: number
  readonly backoff?: BackoffStrategy
  readonly jitter?: boolean
  readonly maxDelay?: number
  readonly retryIf?: (error: unknown, attempt: number) => boolean
}
