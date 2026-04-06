import { dual } from './dual'
import * as RS from './Array.gen'
type Dict<A> = Record<string, A>
import { sum as nSum, min as nMin, max as nMax } from './number'

// Arity 1 — tagged for fusion engine (accessor ops get inlined in pipe)
export const head: <A>(arr: A[]) => A | undefined = dual(1, (a: any[]) => a[0], { op: 'head' })
export const last: <A>(arr: A[]) => A | undefined = dual(1, (a: any[]) => a[a.length - 1], { op: 'last' })
export const tail: <A>(arr: A[]) => A[] = dual(1, RS.tail, { op: 'tail' })
export const init: <A>(arr: A[]) => A[] = dual(1, RS.init, { op: 'init' })
export const isEmpty: <A>(arr: A[]) => boolean = dual(1, RS.isEmpty, { op: 'isEmpty' })
export const length: <A>(arr: A[]) => number = dual(1, RS.length, { op: 'length' })
export const reverse: <A>(arr: A[]) => A[] = dual(1, RS.reverse, { op: 'reverse' })
export const flatten: <A>(arr: A[][]) => A[] = dual(1, RS.flatten, { op: 'flatten' })
export const first: <A>(arr: A[]) => A | undefined = dual(1, (a: any[]) => a[0], { op: 'head' })

// Standalone generators (no dual)
export const range: (start: number, end: number) => number[] = RS.range
export const sort: (arr: number[]) => number[] = dual(1, RS.sort, { op: 'sort' })
export const transpose: <A>(arr: A[][]) => A[][] = RS.transpose

export const repeat: {
  <A>(value: A, n: number): A[]
  <A>(n: number): (value: A) => A[]
} = dual(2, (value: any, n: number) => RS.repeat(value, n), { op: 'repeat' })

export const times: {
  <A>(f: (i: number) => A, n: number): A[]
  (n: number): <A>(f: (i: number) => A) => A[]
} = dual(2, (f: any, n: number) => RS.times(f, n), { op: 'times' })

export const unfold: {
  <A, B>(f: (seed: B) => [A, B] | undefined, seed: B): A[]
  <A, B>(seed: B): (f: (seed: B) => [A, B] | undefined) => A[]
} = dual(2, (f: any, seed: any) => RS.unfold(f, seed), { op: 'unfold' })

export const xprod: {
  <A, B>(a: A[], b: B[]): [A, B][]
  <B>(b: B[]): <A>(a: A[]) => [A, B][]
} = dual(2, RS.xprod, { op: 'xprod' })

// Arity 2
export const map: {
  <A, B>(arr: A[], f: (a: A) => B): B[]
  <A, B>(f: (a: A) => B): (arr: A[]) => B[]
} = dual(2, (arr: any[], f: any) => {
  const len = arr.length, out = new Array(len)
  for (let i = 0; i < len; i++) out[i] = f(arr[i])
  return out
}, { op: 'map' })

export const mapWithIndex: {
  <A, B>(arr: A[], f: (a: A, i: number) => B): B[]
  <A, B>(f: (a: A, i: number) => B): (arr: A[]) => B[]
} = dual(2, (arr: any[], f: any) => {
  const len = arr.length, out = new Array(len)
  for (let i = 0; i < len; i++) out[i] = f(arr[i], i)
  return out
}, { op: 'mapWithIndex' })

export const filter: {
  <A>(arr: A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: A[]) => A[]
} = dual(2, (arr: any[], pred: any) => {
  const out: any[] = []
  for (let i = 0, len = arr.length; i < len; i++) {
    const v = arr[i]
    if (pred(v)) out.push(v)
  }
  return out
}, { op: 'filter' })

export const filterWithIndex: {
  <A>(arr: A[], pred: (a: A, i: number) => boolean): A[]
  <A>(pred: (a: A, i: number) => boolean): (arr: A[]) => A[]
} = dual(2, (arr: any[], pred: any) => {
  const out: any[] = []
  for (let i = 0, len = arr.length; i < len; i++) {
    const v = arr[i]
    if (pred(v, i)) out.push(v)
  }
  return out
}, { op: 'filterWithIndex' })

export const flatMap: {
  <A, B>(arr: A[], f: (a: A) => B[]): B[]
  <A, B>(f: (a: A) => B[]): (arr: A[]) => B[]
} = dual(2, (arr: any[], f: any) => {
  const out: any[] = []
  for (let i = 0, len = arr.length; i < len; i++) {
    const r = f(arr[i])
    for (let j = 0, rlen = r.length; j < rlen; j++) out.push(r[j])
  }
  return out
}, { op: 'flatMap' })

export const find: {
  <A>(arr: A[], pred: (a: A) => boolean): A | undefined
  <A>(pred: (a: A) => boolean): (arr: A[]) => A | undefined
} = dual(2, (arr: any[], pred: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    const v = arr[i]
    if (pred(v)) return v
  }
  return undefined
}, { op: 'find' })

export const findIndex: {
  <A>(arr: A[], pred: (a: A) => boolean): number | undefined
  <A>(pred: (a: A) => boolean): (arr: A[]) => number | undefined
} = dual(2, (arr: any[], pred: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    if (pred(arr[i])) return i
  }
  return undefined
}, { op: 'findIndex' })

export const every: {
  <A>(arr: A[], pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (arr: A[]) => boolean
} = dual(2, (arr: any[], pred: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    if (!pred(arr[i])) return false
  }
  return true
}, { op: 'every' })

export const some: {
  <A>(arr: A[], pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (arr: A[]) => boolean
} = dual(2, (arr: any[], pred: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    if (pred(arr[i])) return true
  }
  return false
}, { op: 'some' })

export const includes: {
  <A>(arr: A[], value: A): boolean
  <A>(value: A): (arr: A[]) => boolean
} = dual(2, (arr: any[], value: any) => arr.includes(value), { op: 'includes' })

export const sortBy: {
  <A>(arr: A[], cmp: (a: A, b: A) => number): A[]
  <A>(cmp: (a: A, b: A) => number): (arr: A[]) => A[]
} = dual(2, RS.sortBy, { op: 'sortBy' })

export const takeSortedBy: {
  <A>(arr: A[], k: number, cmp: (a: A, b: A) => number): A[]
  <A>(k: number, cmp: (a: A, b: A) => number): (arr: A[]) => A[]
} = dual(3, RS.takeSortedBy)

export const uniq: <A>(arr: A[]) => A[] = dual(1, RS.uniq, { op: 'uniq' })

export const uniqBy: {
  <A, B>(arr: A[], f: (a: A) => B): A[]
  <A, B>(f: (a: A) => B): (arr: A[]) => A[]
} = dual(2, RS.uniqBy, { op: 'uniqBy' })

export const take: {
  <A>(arr: A[], n: number): A[]
  (n: number): <A>(arr: A[]) => A[]
} = dual(2, RS.take, { op: 'take' })

export const drop: {
  <A>(arr: A[], n: number): A[]
  (n: number): <A>(arr: A[]) => A[]
} = dual(2, RS.drop, { op: 'drop' })

export const takeWhile: {
  <A>(arr: A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: A[]) => A[]
} = dual(2, RS.takeWhile, { op: 'takeWhile' })

export const dropWhile: {
  <A>(arr: A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: A[]) => A[]
} = dual(2, RS.dropWhile, { op: 'dropWhile' })

export const chunk: {
  <A>(arr: A[], n: number): A[][]
  (n: number): <A>(arr: A[]) => A[][]
} = dual(2, RS.chunk, { op: 'chunk' })

export const slidingWindow: {
  <A>(arr: A[], n: number): A[][]
  (n: number): <A>(arr: A[]) => A[][]
} = dual(2, RS.slidingWindow, { op: 'slidingWindow' })

export const intersperse: {
  <A>(arr: A[], sep: A): A[]
  <A>(sep: A): (arr: A[]) => A[]
} = dual(2, RS.intersperse, { op: 'intersperse' })

export const forEach: {
  <A>(arr: A[], f: (a: A) => void): void
  <A>(f: (a: A) => void): (arr: A[]) => void
} = dual(2, (arr: any[], f: any) => {
  for (let i = 0, len = arr.length; i < len; i++) f(arr[i])
}, { op: 'forEach' })

export const forEachWithIndex: {
  <A>(arr: A[], f: (a: A, i: number) => void): void
  <A>(f: (a: A, i: number) => void): (arr: A[]) => void
} = dual(2, (arr: any[], f: any) => {
  for (let i = 0, len = arr.length; i < len; i++) f(arr[i], i)
}, { op: 'forEachWithIndex' })

export const groupBy: {
  <A>(arr: A[], f: (a: A) => string): Dict<A[]>
  <A>(f: (a: A) => string): (arr: A[]) => Dict<A[]>
} = dual(2, RS.groupBy, { op: 'groupBy' })

export const partition: {
  <A>(arr: A[], pred: (a: A) => boolean): [A[], A[]]
  <A>(pred: (a: A) => boolean): (arr: A[]) => [A[], A[]]
} = dual(2, RS.partition, { op: 'partition' })

export const aperture: {
  <A>(arr: A[], n: number): A[][]
  (n: number): <A>(arr: A[]) => A[][]
} = dual(2, RS.aperture, { op: 'aperture' })

export const intersection: {
  <A>(a: A[], b: A[]): A[]
  <A>(b: A[]): (a: A[]) => A[]
} = dual(2, RS.intersection, { op: 'intersection' })

export const union: {
  <A>(a: A[], b: A[]): A[]
  <A>(b: A[]): (a: A[]) => A[]
} = dual(2, RS.union, { op: 'union' })

export const difference: {
  <A>(a: A[], b: A[]): A[]
  <A>(b: A[]): (a: A[]) => A[]
} = dual(2, RS.difference, { op: 'difference' })

export const symmetricDifference: {
  <A>(a: A[], b: A[]): A[]
  <A>(b: A[]): (a: A[]) => A[]
} = dual(2, RS.symmetricDifference, { op: 'symmetricDifference' })

// Arity 3
export const reduce: {
  <A, B>(arr: A[], f: (acc: B, a: A) => B, init: B): B
  <A, B>(f: (acc: B, a: A) => B, init: B): (arr: A[]) => B
} = dual(3, (arr: any[], f: any, init: any) => {
  let acc = init
  for (let i = 0, len = arr.length; i < len; i++) acc = f(acc, arr[i])
  return acc
}, { op: 'reduce' })

export const reduceRight: {
  <A, B>(arr: A[], f: (acc: B, a: A) => B, init: B): B
  <A, B>(f: (acc: B, a: A) => B, init: B): (arr: A[]) => B
} = dual(3, (arr: any[], f: any, init: any) => {
  let acc = init
  for (let i = arr.length - 1; i >= 0; i--) acc = f(acc, arr[i])
  return acc
}, { op: 'reduceRight' })

export const zip: {
  <A, B>(a: A[], b: B[]): [A, B][]
  <B>(b: B[]): <A>(a: A[]) => [A, B][]
} = dual(2, RS.zip, { op: 'zip' })

export const zipWith: {
  <A, B, C>(a: A[], b: B[], f: (a: A, b: B) => C): C[]
  <A, B, C>(b: B[], f: (a: A, b: B) => C): (a: A[]) => C[]
} = dual(3, RS.zipWith, { op: 'zipWith' })

export const adjust: {
  <A>(arr: A[], index: number, f: (a: A) => A): A[]
  <A>(index: number, f: (a: A) => A): (arr: A[]) => A[]
} = dual(3, RS.adjust, { op: 'adjust' })

export const update: {
  <A>(arr: A[], index: number, value: A): A[]
  <A>(index: number, value: A): (arr: A[]) => A[]
} = dual(3, RS.update, { op: 'update' })

export const insert: {
  <A>(arr: A[], index: number, value: A): A[]
  <A>(index: number, value: A): (arr: A[]) => A[]
} = dual(3, RS.insert, { op: 'insert' })

export const remove: {
  <A>(arr: A[], index: number, count: number): A[]
  (index: number, count: number): <A>(arr: A[]) => A[]
} = dual(3, RS.remove, { op: 'remove' })

export const scan: {
  <A, B>(arr: A[], f: (acc: B, a: A) => B, init: B): B[]
  <A, B>(f: (acc: B, a: A) => B, init: B): (arr: A[]) => B[]
} = dual(3, RS.scan, { op: 'scan' })

// Array numeric terminals (JIT-inlined in pipe)
export const sum: (arr: number[]) => number = dual(1, nSum, { op: 'sum' })
export const min: (arr: number[]) => number = dual(1, nMin, { op: 'min' })
export const max: (arr: number[]) => number = dual(1, nMax, { op: 'max' })

// Sort specializations (JIT-inlined in pipe)
export const sortAsc: (arr: number[]) => number[] = dual(1, (arr: number[]) => [...arr].sort((a, b) => a - b), { op: 'sortAsc' })
export const sortDesc: (arr: number[]) => number[] = dual(1, (arr: number[]) => [...arr].sort((a, b) => b - a), { op: 'sortDesc' })

// --- Newly exposed from Array.res ---

// Arity 1
export const dropRepeats: <A>(arr: A[]) => A[] = dual(1, RS.dropRepeats, { op: 'dropRepeats' })
export const shuffle: <A>(arr: A[]) => A[] = RS.shuffle
export const only: <A>(arr: A[]) => A | undefined = RS.only
export const mergeAll: <A>(arr: A[]) => A = RS.mergeAll
export const unnest: <A>(arr: A[][]) => A[] = RS.unnest

// Arity 2 — fuseable
export const reject: {
  <A>(arr: A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: A[]) => A[]
} = dual(2, RS.reject, { op: 'reject' })

export const none: {
  <A>(arr: A[], pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (arr: A[]) => boolean
} = dual(2, RS.none, { op: 'none' })

export const count: {
  <A>(arr: A[], pred: (a: A) => boolean): number
  <A>(pred: (a: A) => boolean): (arr: A[]) => number
} = dual(2, RS.count, { op: 'count' })

// Arity 2 — non-fuseable
export const append: {
  <A>(arr: A[], value: A): A[]
  <A>(value: A): (arr: A[]) => A[]
} = dual(2, RS.append)

export const prepend: {
  <A>(arr: A[], value: A): A[]
  <A>(value: A): (arr: A[]) => A[]
} = dual(2, RS.prepend)

export const concat: {
  <A>(a: A[], b: A[]): A[]
  <A>(b: A[]): (a: A[]) => A[]
} = dual(2, RS.concat)

export const nth: {
  <A>(arr: A[], index: number): A | undefined
  (index: number): <A>(arr: A[]) => A | undefined
} = dual(2, RS.nth)

export const indexOf: {
  <A>(arr: A[], value: A): number | undefined
  <A>(value: A): (arr: A[]) => number | undefined
} = dual(2, RS.indexOf)

export const lastIndexOf: {
  <A>(arr: A[], value: A): number | undefined
  <A>(value: A): (arr: A[]) => number | undefined
} = dual(2, RS.lastIndexOf)

export const findLast: {
  <A>(arr: A[], pred: (a: A) => boolean): A | undefined
  <A>(pred: (a: A) => boolean): (arr: A[]) => A | undefined
} = dual(2, RS.findLast)

export const findLastIndex: {
  <A>(arr: A[], pred: (a: A) => boolean): number | undefined
  <A>(pred: (a: A) => boolean): (arr: A[]) => number | undefined
} = dual(2, RS.findLastIndex)

export const without: {
  <A>(arr: A[], values: A[]): A[]
  <A>(values: A[]): (arr: A[]) => A[]
} = dual(2, RS.without)

export const pluck: {
  <A, B>(arr: A[], key: string): B[]
  (key: string): <A, B>(arr: A[]) => B[]
} = dual(2, RS.pluck)

export const dropRepeatsBy: {
  <A, B>(arr: A[], f: (a: A) => B): A[]
  <A, B>(f: (a: A) => B): (arr: A[]) => A[]
} = dual(2, RS.dropRepeatsBy)

export const dropRepeatsWith: {
  <A>(arr: A[], eq: (a: A, b: A) => boolean): A[]
  <A>(eq: (a: A, b: A) => boolean): (arr: A[]) => A[]
} = dual(2, RS.dropRepeatsWith)

export const dropLast: {
  <A>(arr: A[], n: number): A[]
  (n: number): <A>(arr: A[]) => A[]
} = dual(2, RS.dropLast)

export const dropLastWhile: {
  <A>(arr: A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: A[]) => A[]
} = dual(2, RS.dropLastWhile)

export const takeLast: {
  <A>(arr: A[], n: number): A[]
  (n: number): <A>(arr: A[]) => A[]
} = dual(2, RS.takeLast)

export const takeLastWhile: {
  <A>(arr: A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: A[]) => A[]
} = dual(2, RS.takeLastWhile)

export const splitAt: {
  <A>(arr: A[], index: number): [A[], A[]]
  (index: number): <A>(arr: A[]) => [A[], A[]]
} = dual(2, RS.splitAt)

export const splitWhen: {
  <A>(arr: A[], pred: (a: A) => boolean): [A[], A[]]
  <A>(pred: (a: A) => boolean): (arr: A[]) => [A[], A[]]
} = dual(2, RS.splitWhen)

export const splitWhenever: {
  <A>(arr: A[], pred: (a: A) => boolean): A[][]
  <A>(pred: (a: A) => boolean): (arr: A[]) => A[][]
} = dual(2, RS.splitWhenever)

export const join: {
  (arr: string[], sep: string): string
  (sep: string): (arr: string[]) => string
} = dual(2, RS.join)

export const uniqWith: {
  <A>(arr: A[], eq: (a: A, b: A) => boolean): A[]
  <A>(eq: (a: A, b: A) => boolean): (arr: A[]) => A[]
} = dual(2, RS.uniqWith)

export const groupWith: {
  <A>(arr: A[], eq: (a: A, b: A) => boolean): A[][]
  <A>(eq: (a: A, b: A) => boolean): (arr: A[]) => A[][]
} = dual(2, RS.groupWith)

export const indexBy: {
  <A>(arr: A[], f: (a: A) => string): Dict<A>
  <A>(f: (a: A) => string): (arr: A[]) => Dict<A>
} = dual(2, RS.indexBy)

export const collectBy: {
  <A>(arr: A[], f: (a: A) => string): A[][]
  <A>(f: (a: A) => string): (arr: A[]) => A[][]
} = dual(2, RS.collectBy)

export const sample: {
  <A>(arr: A[], n: number): A[]
  (n: number): <A>(arr: A[]) => A[]
} = dual(2, RS.sample)

export const hasAtLeast: {
  <A>(arr: A[], n: number): boolean
  (n: number): <A>(arr: A[]) => boolean
} = dual(2, RS.hasAtLeast)

export const meanBy: {
  <A>(arr: A[], f: (a: A) => number): number
  <A>(f: (a: A) => number): (arr: A[]) => number
} = dual(2, RS.meanBy)

export const sumBy: {
  <A>(arr: A[], f: (a: A) => number): number
  <A>(f: (a: A) => number): (arr: A[]) => number
} = dual(2, RS.sumBy)

export const mapToObj: {
  <A, B>(arr: A[], f: (a: A) => [string, B]): Dict<B>
  <A, B>(f: (a: A) => [string, B]): (arr: A[]) => Dict<B>
} = dual(2, RS.mapToObj)

export const zipObj: {
  <A>(keys: string[], values: A[]): Dict<A>
  <A>(values: A[]): (keys: string[]) => Dict<A>
} = dual(2, RS.zipObj)

export const groupByProp: {
  <A>(arr: A[], prop: string): Dict<A[]>
  (prop: string): <A>(arr: A[]) => Dict<A[]>
} = dual(2, RS.groupByProp)

export const arrayStartsWith: {
  <A>(arr: A[], prefix: A[]): boolean
  <A>(prefix: A[]): (arr: A[]) => boolean
} = dual(2, RS.arrayStartsWith)

export const arrayEndsWith: {
  <A>(arr: A[], suffix: A[]): boolean
  <A>(suffix: A[]): (arr: A[]) => boolean
} = dual(2, RS.arrayEndsWith)

export const sortedIndex: (arr: number[], value: number) => number = RS.sortedIndex

export const sortedLastIndex: (arr: number[], value: number) => number = RS.sortedLastIndex

export const pair: <A, B>(a: A, b: B) => [A, B] = RS.pair

// Arity 3
export const withoutBy: {
  <A>(arr: A[], values: A[], f: (a: A) => string): A[]
  <A>(values: A[], f: (a: A) => string): (arr: A[]) => A[]
} = dual(3, RS.withoutBy)

export const slice: {
  <A>(arr: A[], start: number, end: number): A[]
  (start: number, end: number): <A>(arr: A[]) => A[]
} = dual(3, RS.slice)

export const swap: {
  <A>(arr: A[], i: number, j: number): A[]
  (i: number, j: number): <A>(arr: A[]) => A[]
} = dual(3, RS.swap)

export const insertAll: {
  <A>(arr: A[], index: number, values: A[]): A[]
  <A>(index: number, values: A[]): (arr: A[]) => A[]
} = dual(3, RS.insertAll)

export const unionBy: {
  <A>(a: A[], b: A[], f: (a: A) => string): A[]
  <A>(b: A[], f: (a: A) => string): (a: A[]) => A[]
} = dual(3, RS.unionBy)

export const unionWith: {
  <A>(a: A[], b: A[], eq: (a: A, b: A) => boolean): A[]
  <A>(b: A[], eq: (a: A, b: A) => boolean): (a: A[]) => A[]
} = dual(3, RS.unionWith)

export const intersectionBy: {
  <A>(a: A[], b: A[], f: (a: A) => string): A[]
  <A>(b: A[], f: (a: A) => string): (a: A[]) => A[]
} = dual(3, RS.intersectionBy)

export const differenceBy: {
  <A>(a: A[], b: A[], f: (a: A) => string): A[]
  <A>(b: A[], f: (a: A) => string): (a: A[]) => A[]
} = dual(3, RS.differenceBy)

export const differenceWith: {
  <A>(a: A[], b: A[], eq: (a: A, b: A) => boolean): A[]
  <A>(b: A[], eq: (a: A, b: A) => boolean): (a: A[]) => A[]
} = dual(3, RS.differenceWith)

export const symmetricDifferenceBy: {
  <A>(a: A[], b: A[], f: (a: A) => string): A[]
  <A>(b: A[], f: (a: A) => string): (a: A[]) => A[]
} = dual(3, RS.symmetricDifferenceBy)

export const symmetricDifferenceWith: {
  <A>(a: A[], b: A[], eq: (a: A, b: A) => boolean): A[]
  <A>(b: A[], eq: (a: A, b: A) => boolean): (a: A[]) => A[]
} = dual(3, RS.symmetricDifferenceWith)

export const sortedIndexBy: {
  <A>(arr: A[], value: A, f: (a: A) => number): number
  <A>(value: A, f: (a: A) => number): (arr: A[]) => number
} = dual(3, RS.sortedIndexBy)

export const sortedIndexWith: {
  <A>(arr: A[], pred: (a: A) => boolean): number
  <A>(pred: (a: A) => boolean): (arr: A[]) => number
} = dual(2, RS.sortedIndexWith)

export const sortedLastIndexBy: {
  <A>(arr: A[], value: A, f: (a: A) => number): number
  <A>(value: A, f: (a: A) => number): (arr: A[]) => number
} = dual(3, RS.sortedLastIndexBy)

export const mapAccum: {
  <A, B, C>(arr: A[], f: (acc: B, a: A) => [B, C], init: B): [B, C[]]
  <A, B, C>(f: (acc: B, a: A) => [B, C], init: B): (arr: A[]) => [B, C[]]
} = dual(3, RS.mapAccum)

export const mapAccumRight: {
  <A, B, C>(arr: A[], f: (acc: B, a: A) => [B, C], init: B): [B, C[]]
  <A, B, C>(f: (acc: B, a: A) => [B, C], init: B): (arr: A[]) => [B, C[]]
} = dual(3, RS.mapAccumRight)

// Arity 4
export const reduceBy: {
  <A, B>(arr: A[], keyFn: (a: A) => string, reducer: (acc: B, a: A) => B, init: B): Dict<B>
  <A, B>(keyFn: (a: A) => string, reducer: (acc: B, a: A) => B, init: B): (arr: A[]) => Dict<B>
} = dual(4, RS.reduceBy)

export const reduceWhile: {
  <A, B>(arr: A[], pred: (acc: B, a: A) => boolean, f: (acc: B, a: A) => B, init: B): B
  <A, B>(pred: (acc: B, a: A) => boolean, f: (acc: B, a: A) => B, init: B): (arr: A[]) => B
} = dual(4, RS.reduceWhile)

export const splice: {
  <A>(arr: A[], start: number, deleteCount: number, items: A[]): A[]
  <A>(start: number, deleteCount: number, items: A[]): (arr: A[]) => A[]
} = dual(4, RS.splice)
