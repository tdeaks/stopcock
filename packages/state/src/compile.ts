import { prop, index, composeLens, type Lens } from '@stopcock/fp'
import type { Path } from '@stopcock/diff'

export type Compiled<S, A> = { readonly lens: Lens<S, A>; readonly path: Path }

const refCache = new WeakMap<Function, Compiled<any, any>>()
const pathCache = new Map<string, Compiled<any, any>>()

function pathKey(p: Path): string {
  return JSON.stringify(p)
}

function tracePath<S>(accessor: (state: S) => unknown): Path {
  const path: (string | number)[] = []
  const handler: ProxyHandler<object> = {
    get(_, key) {
      if (typeof key === 'symbol') return undefined
      path.push(/^\d+$/.test(key) ? Number(key) : key)
      return new Proxy(Object.create(null), handler)
    },
  }
  accessor(new Proxy(Object.create(null), handler) as S)
  return path
}

function segmentLens(seg: string | number): Lens<any, any> {
  return typeof seg === 'number' ? index(seg) : prop(seg as never)
}

export function buildLens<S, A>(segments: Path): Lens<S, A> {
  let result: Lens<any, any> = segmentLens(segments[0])
  for (let i = 1; i < segments.length; i++) {
    result = composeLens(result, segmentLens(segments[i]))
  }
  return result as Lens<S, A>
}

export function compile<S, A>(accessor: (s: S) => A): Compiled<S, A> {
  let entry = refCache.get(accessor)
  if (entry) return entry as Compiled<S, A>

  const path = tracePath(accessor)
  if (path.length === 0) throw new Error('Accessor must access at least one property')

  const key = pathKey(path)
  entry = pathCache.get(key)
  if (!entry) {
    entry = { lens: buildLens(path), path }
    pathCache.set(key, entry)
  }
  refCache.set(accessor, entry)
  return entry as Compiled<S, A>
}

export function clearCache() {
  pathCache.clear()
}

/** True if an operation at `opPath` could affect a subscriber at `subPath` */
export function overlaps(subPath: Path, opPath: Path): boolean {
  const len = Math.min(subPath.length, opPath.length)
  for (let i = 0; i < len; i++) {
    if (subPath[i] !== opPath[i]) return false
  }
  return true
}
