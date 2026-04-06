import { dual } from './dual'
import * as RS from './Object.gen'
import type { PathValue } from './types'

// ReScript wrappers — arity 2
export const pick: {
  <T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>
  <T extends Record<string, unknown>, K extends keyof T>(keys: K[]): (obj: T) => Pick<T, K>
} = dual(2, RS.pick)

export const omit: {
  <T extends Record<string, unknown>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>
  <T extends Record<string, unknown>, K extends keyof T>(keys: K[]): (obj: T) => Omit<T, K>
} = dual(2, RS.omit)

export const dissoc: {
  <T extends Record<string, unknown>>(obj: T, key: string): Partial<T>
  (key: string): <T extends Record<string, unknown>>(obj: T) => Partial<T>
} = dual(2, RS.dissoc)

export const mergeDeepLeft: {
  <A extends object, B extends object>(a: A, b: B): A & B
  <B extends object>(b: B): <A extends object>(a: A) => A & B
} = dual(2, RS.mergeDeepLeft)

export const mergeDeepRight: {
  <A extends object, B extends object>(a: A, b: B): A & B
  <B extends object>(b: B): <A extends object>(a: A) => A & B
} = dual(2, RS.mergeDeepRight)

// ReScript wrappers — arity 3
export const assoc: {
  <T extends Record<string, unknown>, V>(obj: T, key: string, value: V): T & Record<string, V>
  <T extends Record<string, unknown>, V>(key: string, value: V): (obj: T) => T & Record<string, V>
} = dual(3, RS.assoc)

export const mergeWith: {
  <T, V>(a: T, b: T, resolver: (l: V, r: V) => V): T
  <T, V>(b: T, resolver: (l: V, r: V) => V): (a: T) => T
} = dual(3, RS.mergeWith)

// Pure TypeScript — path
export const path: {
  <T, P extends string>(obj: T, path: P): PathValue<T, P> | undefined
  <T, P extends string>(path: P): (obj: T) => PathValue<T, P> | undefined
} = dual(2, (obj: any, p: string) => {
  const segments = p.split('.')
  let current = obj
  for (const seg of segments) {
    if (current == null) return undefined
    current = current[seg]
  }
  return current
})

// Pure TypeScript — pathOr
export const pathOr: {
  <T, P extends string, D>(obj: T, path: P, defaultValue: D): PathValue<T, P> | D
  <T, P extends string, D>(path: P, defaultValue: D): (obj: T) => PathValue<T, P> | D
} = dual(3, (obj: any, p: string, defaultValue: any) => {
  const result = path(obj, p)
  return result === undefined ? defaultValue : result
})

// Pure TypeScript — evolve
export const evolve: {
  <T extends Record<string, unknown>>(obj: T, transformations: Partial<{ [K in keyof T]: (v: T[K]) => T[K] }>): T
  <T extends Record<string, unknown>>(transformations: Partial<{ [K in keyof T]: (v: T[K]) => T[K] }>): (obj: T) => T
} = dual(2, (obj: any, transformations: any) => {
  const result = { ...obj }
  for (const key of Object.keys(transformations)) {
    if (key in result) {
      result[key] = transformations[key](result[key])
    }
  }
  return result
})
