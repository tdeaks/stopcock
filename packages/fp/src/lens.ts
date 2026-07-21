import { dual } from './dual-lite'
import type { PathSegments, PathValue } from './types'

export type Lens<S, A> = {
  readonly _tag: 'Lens'
  readonly get: (s: S) => A
  readonly set: (s: S, a: A) => S
}

export function lens<S, A>(get: (s: S) => A, set: (s: S, a: A) => S): Lens<S, A> {
  return { _tag: 'Lens', get, set }
}

export function prop<S, K extends keyof S>(key: K): Lens<S, S[K]> {
  return lens(
    (s) => s[key],
    (s, a) => ({ ...s, [key]: a }),
  )
}

export function index<A>(i: number): Lens<A[], A> {
  return lens(
    (s) => s[i],
    (s, a) => {
      const c = [...s]
      c[i] = a
      return c
    },
  )
}

export function path<S, K1 extends keyof S>(k1: K1): Lens<S, S[K1]>
export function path<S, K1 extends keyof S, K2 extends keyof S[K1]>(
  k1: K1,
  k2: K2,
): Lens<S, S[K1][K2]>
export function path<S, K1 extends keyof S, K2 extends keyof S[K1], K3 extends keyof S[K1][K2]>(
  k1: K1,
  k2: K2,
  k3: K3,
): Lens<S, S[K1][K2][K3]>
export function path<S, P extends PathSegments>(keys: P): Lens<S, PathValue<S, P>>
export function path(...keysOrPath: Array<PropertyKey | PathSegments>): Lens<any, any> {
  const keys = (
    keysOrPath.length === 1 && Array.isArray(keysOrPath[0]) ? keysOrPath[0] : keysOrPath
  ) as readonly PropertyKey[]
  const cloneContainer = (value: any, nextKey?: PropertyKey) => {
    if (Array.isArray(value)) return value.slice()
    if (value != null && typeof value === 'object') return { ...value }
    return typeof nextKey === 'number' ? [] : {}
  }

  return lens(
    (s) => {
      let current: any = s
      for (const key of keys) {
        if (current == null) return undefined
        current = current[key]
      }
      return current
    },
    (s, a) => {
      if (keys.length === 0) return a
      if (keys.length === 1) {
        const root = cloneContainer(s)
        root[keys[0]] = a
        return root
      }
      const root = cloneContainer(s, keys[0])
      let parent: any = root
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i]
        parent[key] = cloneContainer(parent[key], keys[i + 1])
        parent = parent[key]
      }
      parent[keys[keys.length - 1]] = a
      return root
    },
  )
}

export const lensProp = prop
export const lensIndex = index
export const lensPath = path

export const view: {
  <S, A>(s: S, lens: Lens<S, A>): A
  <S, A>(lens: Lens<S, A>): (s: S) => A
} = dual(2, <S, A>(s: S, l: Lens<S, A>): A => l.get(s))

export const set: {
  <S, A>(s: S, lens: Lens<S, A>, a: A): S
  <S, A>(lens: Lens<S, A>, a: A): (s: S) => S
} = dual(3, <S, A>(s: S, l: Lens<S, A>, a: A): S => l.set(s, a))

export const over: {
  <S, A>(s: S, lens: Lens<S, A>, f: (a: A) => A): S
  <S, A>(lens: Lens<S, A>, f: (a: A) => A): (s: S) => S
} = dual(3, <S, A>(s: S, l: Lens<S, A>, f: (a: A) => A): S => l.set(s, f(l.get(s))))

export function compose<S, A, B>(outer: Lens<S, A>, inner: Lens<A, B>): Lens<S, B> {
  return lens(
    (s) => inner.get(outer.get(s)),
    (s, b) => outer.set(s, inner.set(outer.get(s), b)),
  )
}
