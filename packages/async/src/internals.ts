import { CancelledError } from './types'

export function linkedController(parent?: AbortSignal): AbortController {
  const controller = new AbortController()
  if (parent) {
    if (parent.aborted) {
      controller.abort(parent.reason)
    } else {
      const onAbort = () => controller.abort(parent.reason)
      parent.addEventListener('abort', onAbort, { once: true })
      controller.signal.addEventListener('abort', () => {
        parent.removeEventListener('abort', onAbort)
      }, { once: true })
    }
  }
  return controller
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason ?? new CancelledError()); return }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason ?? new CancelledError())
    }, { once: true })
  })
}

export class Semaphore {
  private permits: number
  private queue: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve()
    }
    return new Promise<void>(resolve => this.queue.push(resolve))
  }

  release(): void {
    const next = this.queue.shift()
    if (next) next()
    else this.permits++
  }
}
