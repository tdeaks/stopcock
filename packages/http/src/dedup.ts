export type DedupCache = {
  get(key: string): Promise<unknown> | undefined
  set(key: string, promise: Promise<unknown>): void
  invalidate(url: string): void
}

export function createDedupCache(windowMs = 0): DedupCache {
  const cache = new Map<string, Promise<unknown>>()

  return {
    get(key) { return cache.get(key) },
    set(key, promise) {
      cache.set(key, promise)
      promise.finally(() => {
        if (windowMs > 0) {
          setTimeout(() => cache.delete(key), windowMs)
        } else {
          cache.delete(key)
        }
      })
    },
    invalidate(url) {
      const mutationPath = url.split('?')[0]
      for (const key of cache.keys()) {
        const cachedUrl = key.slice(key.indexOf(':') + 1)
        const cachedPath = cachedUrl.split('?')[0]
        if (cachedPath === mutationPath || cachedPath.startsWith(mutationPath + '/')) {
          cache.delete(key)
        }
      }
    },
  }
}

export function dedupKey(method: string, url: string): string {
  return `${method}:${url}`
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isMutation(method: string): boolean {
  return MUTATION_METHODS.has(method)
}
