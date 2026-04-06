export function throttle<Args extends unknown[], R>(
  ms: number,
  fn: (...args: Args) => R,
): (...args: Args) => R {
  let lastCall = 0
  let lastResult: R
  let pending: Args | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const throttled = (...args: Args): R => {
    const now = Date.now()
    const elapsed = now - lastCall

    if (elapsed >= ms) {
      lastCall = now
      lastResult = fn(...args)
      return lastResult
    }

    pending = args
    if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now()
        if (pending) lastResult = fn(...pending)
        pending = null
        timer = null
      }, ms - elapsed)
    }
    return lastResult
  }
  return throttled
}

type DebouncedFn<Args extends unknown[], R> = ((...args: Args) => R) & { cancel: () => void }

export function debounce<Args extends unknown[], R>(
  ms: number,
  fn: (...args: Args) => R,
): DebouncedFn<Args, R> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastResult: R

  const debounced = (...args: Args): R => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      lastResult = fn(...args)
      timer = null
    }, ms)
    return lastResult
  }
  debounced.cancel = () => {
    if (timer) { clearTimeout(timer); timer = null }
  }
  return debounced as DebouncedFn<Args, R>
}

export function rateLimit<Args extends unknown[], R>(
  count: number,
  windowMs: number,
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  let tokens = count
  const queue: Array<{ args: Args; resolve: (r: R) => void; reject: (e: unknown) => void }> = []
  let refillTimer: ReturnType<typeof setInterval> | null = null

  function startRefill() {
    if (refillTimer) return
    refillTimer = setInterval(() => {
      tokens = count
      flush()
      if (queue.length === 0 && refillTimer) {
        clearInterval(refillTimer)
        refillTimer = null
      }
    }, windowMs)
  }

  function flush() {
    while (tokens > 0 && queue.length > 0) {
      tokens--
      const item = queue.shift()!
      fn(...item.args).then(item.resolve, item.reject)
    }
  }

  return (...args: Args): Promise<R> => {
    if (tokens > 0) {
      tokens--
      startRefill()
      return fn(...args)
    }
    startRefill()
    return new Promise<R>((resolve, reject) => {
      queue.push({ args, resolve, reject })
    })
  }
}
