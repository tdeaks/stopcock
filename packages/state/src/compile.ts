import { prop, index, composeLens, type Lens } from '@stopcock/fp'
import type { Path } from '@stopcock/diff'

export type Compiled<S, A> = {
  readonly lens: Lens<S, A>
  readonly path: Path
  readonly get: (state: S) => A
  readonly set: (state: S, value: A) => S
}

const refCache = new WeakMap<Function, Compiled<any, any>>()
const pathCache = new Map<string, Compiled<any, any>>()

function pathKey(p: Path): string {
  let key = ''
  for (let i = 0; i < p.length; i++) {
    if (i > 0) key += '.'
    key += p[i]
  }
  return key
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

// --- direct get/set, bypassing lens function chain ---

function makeGetter(path: Path): (state: any) => any {
  if (path.length === 1) { const k = path[0]; return (s) => s[k] }
  if (path.length === 2) { const a = path[0], b = path[1]; return (s) => s[a][b] }
  if (path.length === 3) { const a = path[0], b = path[1], c = path[2]; return (s) => s[a][b][c] }
  return (s) => { let r = s; for (let i = 0; i < path.length; i++) r = r[path[i]]; return r }
}

function cloneLevel(obj: any): any {
  return Array.isArray(obj) ? obj.slice() : Object.assign({}, obj)
}

function makeSetter(path: Path): (state: any, value: any) => any {
  // Depth 1: root is always object (S extends object), skip cloneLevel branch
  if (path.length === 1) {
    const k = path[0]
    return (s, v) => ({ ...s, [k]: v })
  }
  // Depth 2: root is object, second level might be array
  if (path.length === 2) {
    const a = path[0], b = path[1]
    return (s, v) => ({ ...s, [a]: (Array.isArray(s[a]) ? setIdx(s[a], b as number, v) : { ...s[a], [b]: v }) })
  }
  // General case
  return (s, v) => {
    const root = { ...s }
    let cursor: any = root
    for (let i = 0; i < path.length - 1; i++) {
      cursor[path[i]] = cloneLevel(cursor[path[i]])
      cursor = cursor[path[i]]
    }
    cursor[path[path.length - 1]] = v
    return root
  }
}

function setIdx(arr: any[], idx: number, value: any): any[] {
  const copy = arr.slice()
  copy[idx] = value
  return copy
}

export function compile<S, A>(accessor: (s: S) => A): Compiled<S, A> {
  let entry = refCache.get(accessor)
  if (entry) return entry as Compiled<S, A>

  const path = tracePath(accessor)
  if (path.length === 0) throw new Error('Accessor must access at least one property')

  const key = pathKey(path)
  entry = pathCache.get(key)
  if (!entry) {
    entry = {
      lens: buildLens(path),
      path,
      get: makeGetter(path),
      set: makeSetter(path),
    }
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
