import { dual } from './dual'

// Arity 1. Tagged for scalar JIT
export const isEmpty = dual(1, (s: string): boolean => s === '', { op: 'strIsEmpty' })
export const length = dual(1, (s: string): number => s.length, { op: 'strLength' })
export const trim = dual(1, (s: string): string => s.trim(), { op: 'trim' })
export const trimStart = dual(1, (s: string): string => s.trimStart(), { op: 'trimStart' })
export const trimEnd = dual(1, (s: string): string => s.trimEnd(), { op: 'trimEnd' })
export const toLowerCase = dual(1, (s: string): string => s.toLowerCase(), { op: 'toLowerCase' })
export const toUpperCase = dual(1, (s: string): string => s.toUpperCase(), { op: 'toUpperCase' })

// Arity 2. Tagged for scalar JIT
export const startsWith: {
  (s: string, search: string): boolean
  (search: string): (s: string) => boolean
} = dual(2, (s: string, search: string) => s.startsWith(search))

export const endsWith: {
  (s: string, search: string): boolean
  (search: string): (s: string) => boolean
} = dual(2, (s: string, search: string) => s.endsWith(search))

export const includes: {
  (s: string, search: string): boolean
  (search: string): (s: string) => boolean
} = dual(2, (s: string, search: string) => s.includes(search))

export const split: {
  (s: string, sep: string): string[]
  (sep: string): (s: string) => string[]
} = dual(2, (s: string, sep: string) => s.split(sep), { op: 'split' })

export const repeat: {
  (s: string, n: number): string
  (n: number): (s: string) => string
} = dual(2, (s: string, n: number) => s.repeat(n))

// Arity 3
export const slice: {
  (s: string, start: number, end: number): string
  (start: number, end: number): (s: string) => string
} = dual(3, (s: string, start: number, end: number) => s.slice(start, end))

export const replaceAll: {
  (s: string, search: string, replacement: string): string
  (search: string, replacement: string): (s: string) => string
} = dual(3, (s: string, search: string, replacement: string) => s.replaceAll(search, replacement))
