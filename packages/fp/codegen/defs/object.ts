import { dual } from './dual'
import type { PathSegments, PathValue, PathValueOrDefault } from './types'

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k)
}

function emptyObj() {
  return {};
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function mergeDeep(left, right, leftWins) {
  let out = Object.assign(emptyObj(), left);
  let ks = Object.keys(right);
  for (let i = 0, i_finish = ks.length; i < i_finish; ++i) {
    let k = ks[i];
    let outV = out[k];
    let rightV = right[k];
    if (isPlainObject(outV) && isPlainObject(rightV)) {
      out[k] = mergeDeep(outV, rightV, leftWins);
    } else if (leftWins && hasOwn(out, k)) {
      
    } else {
      out[k] = rightV;
    }
  }
  return out;
}

function keys(obj) {
  return Object.keys(obj);
}

type RuntimePath = string | PathSegments

const pathSegmentCache = new Map<string, readonly PropertyKey[]>()

function pathSegments(path: RuntimePath): readonly PropertyKey[] {
  if (typeof path !== 'string') return path
  const cached = pathSegmentCache.get(path)
  if (cached) return cached
  const segments = path.split('.')
  pathSegmentCache.set(path, segments)
  return segments
}

function readPath(obj: any, path: RuntimePath) {
  if (typeof path === 'string' && path.indexOf('.') === -1) {
    return obj == null ? undefined : obj[path]
  }
  const segments = pathSegments(path)
  if (segments.length === 1) {
    return obj == null ? undefined : obj[segments[0]]
  }
  if (segments.length === 2) {
    if (obj == null) return undefined
    const next = obj[segments[0]]
    return next == null ? undefined : next[segments[1]]
  }
  if (segments.length === 3) {
    if (obj == null) return undefined
    const next = obj[segments[0]]
    if (next == null) return undefined
    const last = next[segments[1]]
    return last == null ? undefined : last[segments[2]]
  }
  let current = obj
  for (const seg of segments) {
    if (current == null) return undefined
    current = current[seg]
  }
  return current
}

// ReScript wrappers, arity 2
export const pick: {
  <T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>
  <T extends Record<string, unknown>, K extends keyof T>(keys: K[]): (obj: T) => Pick<T, K>
} = dual(2, (obj: any, ks: any) => {
  let out = emptyObj();
  for (let i = 0, i_finish = ks.length; i < i_finish; ++i) {
    let k = ks[i];
    if (hasOwn(obj, k)) {
      out[k] = obj[k];
    }
  }
  return out;
})

export const omit: {
  <T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>
  <T extends Record<string, unknown>, K extends keyof T>(keys: K[]): (obj: T) => Omit<T, K>
} = dual(2, (obj: any, ks: any) => {
  var idx = {}, i = 0, len = ks.length;
    while (i < len) { idx[ks[i]] = 1; i++; }
    var out = {};
    for (var k in obj) {
      if (!idx.hasOwnProperty(k)) out[k] = obj[k];
    }
    return out;
})

export const dissoc: {
  <T extends Record<string, unknown>>(obj: T, key: string): Partial<T>
  (key: string): <T extends Record<string, unknown>>(obj: T) => Partial<T>
} = dual(2, (obj: any, key: any) => {
  let out = emptyObj();
  let allKeys = Object.keys(obj);
  for (let i = 0, i_finish = allKeys.length; i < i_finish; ++i) {
    let k = allKeys[i];
    if (k !== key) {
      out[k] = obj[k];
    }
  }
  return out;
})

export const mergeDeepLeft: {
  <A extends object, B extends object>(a: A, b: B): A & B
  <B extends object>(b: B): <A extends object>(a: A) => A & B
} = dual(2, (a: any, b: any) => {
  return mergeDeep(a, b, true);
})

export const mergeDeepRight: {
  <A extends object, B extends object>(a: A, b: B): A & B
  <B extends object>(b: B): <A extends object>(a: A) => A & B
} = dual(2, (a: any, b: any) => {
  return mergeDeep(a, b, false);
})

// ReScript wrappers, arity 3
export const assoc: {
  <T extends Record<string, unknown>, V>(obj: T, key: string, value: V): T & Record<string, V>
  <T extends Record<string, unknown>, V>(key: string, value: V): (obj: T) => T & Record<string, V>
} = function assoc() {
  if (arguments.length >= 3) {
    const obj = arguments[0],
      key = arguments[1],
      value = arguments[2]
    const out = { ...obj }
    out[key] = value
    return out
  }
  const _a0 = arguments[0]
  const _a1 = arguments[1]
  const _dl: any = function (data: any) {
    const obj = data,
      key = _a0,
      value = _a1
    const out = { ...obj }
    out[key] = value
    return out
  }
  return _dl
} as any

export const mergeWith: {
  <T, V>(a: T, b: T, resolver: (l: V, r: V) => V): T
  <T, V>(b: T, resolver: (l: V, r: V) => V): (a: T) => T
} = dual(3, (a: any, b: any, resolver: any) => {
  let out = Object.assign(emptyObj(), a);
  let ks = Object.keys(b);
  for (let i = 0, i_finish = ks.length; i < i_finish; ++i) {
    let k = ks[i];
    if (hasOwn(out, k)) {
      out[k] = resolver(out[k], b[k]);
    } else {
      out[k] = b[k];
    }
  }
  return out;
})

// Pure TypeScript: path
export const path: {
  <T, P extends string>(obj: T, path: P): PathValue<T, P> | undefined
  <T, P extends PathSegments>(obj: T, path: P): PathValue<T, P> | undefined
  <P extends string>(path: P): <T>(obj: T) => PathValue<T, P> | undefined
  <P extends PathSegments>(path: P): <T>(obj: T) => PathValue<T, P> | undefined
} = function path() {
  if (arguments.length >= 2) {
    const obj = arguments[0],
      p = arguments[1]
    return readPath(obj, p)
  }
  const _a0 = arguments[0]
  const segments = pathSegments(_a0)
  const _dl: any = function (data: any) {
    return readPath(data, segments)
  }
  return _dl
} as any

// Pure TypeScript: pathOr
export const pathOr: {
  <T, P extends string, D>(obj: T, path: P, defaultValue: D): PathValueOrDefault<T, P, D>
  <T, P extends PathSegments, D>(obj: T, path: P, defaultValue: D): PathValueOrDefault<T, P, D>
  <P extends string, D>(path: P, defaultValue: D): <T>(obj: T) => PathValueOrDefault<T, P, D>
  <P extends PathSegments, D>(path: P, defaultValue: D): <T>(obj: T) => PathValueOrDefault<T, P, D>
} = function pathOr() {
  if (arguments.length >= 3) {
    const obj = arguments[0],
      p = arguments[1],
      defaultValue = arguments[2]
    const result = readPath(obj, p)
    return result === undefined ? defaultValue : result
  }
  const _a0 = arguments[0]
  const _a1 = arguments[1]
  const segments = pathSegments(_a0)
  const _dl: any = function (data: any) {
    const defaultValue = _a1
    const result = readPath(data, segments)
    return result === undefined ? defaultValue : result
  }
  return _dl
} as any

// Pure TypeScript: evolve
export const evolve: {
  <T extends Record<string, unknown>>(
    obj: T,
    transformations: Partial<{ [K in keyof T]: (v: T[K]) => T[K] }>,
  ): T
  <T extends Record<string, unknown>>(
    transformations: Partial<{ [K in keyof T]: (v: T[K]) => T[K] }>,
  ): (obj: T) => T
} = dual(2, (obj: any, transformations: any) => {
  const result = { ...obj }
  for (const key of Object.keys(transformations)) {
    if (key in result) {
      result[key] = transformations[key](result[key])
    }
  }
  return result
})
