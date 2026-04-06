import { dual } from './dual'

type Dict<A> = { [id: string]: A }

export const keys: <A>(d: Dict<A>) => string[] = Object.keys as any
export const values: <A>(d: Dict<A>) => A[] = Object.values as any
export const toEntries: <A>(d: Dict<A>) => [string, A][] = Object.entries as any
export function isEmpty<A>(d: Dict<A>): boolean { for (const _ in d) return false; return true }
export function fromEntries<A>(entries: [string, A][]): Dict<A> {
  const out: any = {}
  for (let i = 0, len = entries.length; i < len; i++) out[entries[i][0]] = entries[i][1]
  return out
}

export const map: {
  <A, B>(d: Dict<A>, f: (a: A, key: string) => B): Dict<B>
  <A, B>(f: (a: A, key: string) => B): (d: Dict<A>) => Dict<B>
} = dual(2, (d: any, f: any) => {
  const out: any = {}
  for (const k in d) out[k] = f(d[k], k)
  return out
})

export const filter: {
  <A>(d: Dict<A>, pred: (a: A, key: string) => boolean): Dict<A>
  <A>(pred: (a: A, key: string) => boolean): (d: Dict<A>) => Dict<A>
} = dual(2, (d: any, pred: any) => {
  const out: any = {}
  for (const k in d) if (pred(d[k], k)) out[k] = d[k]
  return out
})

export const get: {
  <A>(d: Dict<A>, key: string): A | undefined
  (key: string): <A>(d: Dict<A>) => A | undefined
} = dual(2, (d: any, key: string) => key in d ? d[key] : undefined)

export const merge: {
  <A>(a: Dict<A>, b: Dict<A>): Dict<A>
  <A>(b: Dict<A>): (a: Dict<A>) => Dict<A>
} = dual(2, (a: any, b: any) => {
  const out: any = {}
  for (const k in a) out[k] = a[k]
  for (const k in b) out[k] = b[k]
  return out
})
