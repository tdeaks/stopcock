import { dual } from './dual'
import * as RS from './Array.gen'
import { tryInlineSource } from './fuse'
type Dict<A> = Record<string, A>
import { sum as nSum, min as nMin, max as nMax } from './number'

// Arity 1. Tagged for fusion engine (accessor ops get inlined in pipe)
export const head: <A>(arr: readonly A[]) => A | undefined = dual(1, (a: any[]) => a[0], { op: 'head' })
export const last: <A>(arr: readonly A[]) => A | undefined = dual(1, (a: any[]) => a[a.length - 1], { op: 'last' })
export const tail: <A>(arr: readonly A[]) => A[] = dual(1, RS.tail, { op: 'tail' })
export const init: <A>(arr: readonly A[]) => A[] = dual(1, RS.init, { op: 'init' })
export const isEmpty: <A>(arr: readonly A[]) => boolean = dual(1, RS.isEmpty, { op: 'isEmpty' })
export const length: <A>(arr: readonly A[]) => number = dual(1, RS.length, { op: 'length' })
export const reverse: <A>(arr: readonly A[]) => A[] = dual(1, RS.reverse, { op: 'reverse' })
export const flatten: <A>(arr: readonly A[][]) => A[] = dual(1, RS.flatten, { op: 'flatten' })
export const first: <A>(arr: readonly A[]) => A | undefined = dual(1, (a: any[]) => a[0], { op: 'head' })

// Standalone generators (no dual)
export const range: (start: number, end: number) => number[] = RS.range
export const sort: (arr: readonly number[]) => number[] = dual(1, RS.sort, { op: 'sort' })
export const transpose: <A>(arr: readonly A[][]) => A[][] = RS.transpose

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
  <A, B>(a: readonly A[], b: readonly B[]): [A, B][]
  <B>(b: readonly B[]): <A>(a: readonly A[]) => [A, B][]
} = dual(2, RS.xprod, { op: 'xprod' })

// Arity 2
type MapRunner = (arr: readonly any[], f: (value: any) => any) => any[]

let mapRunnerFn: Function | null = null
let mapRunner: MapRunner | null = null
let mapOperatorFn: Function | null = null
let mapOperator: any = null

const runMapFallback: MapRunner = (arr, f) => {
  const len = arr.length, out = new Array(len)
  for (let i = 0; i < len; i++) out[i] = f(arr[i])
  return out
}

const getMapRunner = (f: (value: any) => any): MapRunner => {
  if (f === mapRunnerFn && mapRunner) return mapRunner

  const src = tryInlineSource(f)
  let runner = runMapFallback

  if (src) {
    try {
      runner = new Function(
        'arr',
        'f',
        `var len=arr.length,out=new Array(len);for(var i=0;i<len;i++){var v=arr[i];out[i]=${src}}return out`,
      ) as MapRunner
    } catch {
      runner = runMapFallback
    }
  }

  mapRunnerFn = f
  mapRunner = runner
  return runner
}

export function map<A, B>(arr: readonly A[], f: (a: A) => B): B[]
export function map<A, B>(f: (a: A) => B): (arr: readonly A[]) => B[]
export function map(): any {
  if (arguments.length >= 2) {
    const _a0 = arguments[0]
    const _a1 = arguments[1]
    return getMapRunner(_a1)(_a0, _a1)
  }
  const _a0 = arguments[0]
  if (_a0 === mapOperatorFn && mapOperator) return mapOperator
  const runner = getMapRunner(_a0)
  const _dl: any = function(data: any) {
    const arr = data, f = _a0
    return runner(arr, f)
  }
  _dl._op = 1
  _dl._fn = _a0
  mapOperatorFn = _a0
  mapOperator = _dl
  return _dl
}

export const mapWithIndex: {
  <A, B>(arr: readonly A[], f: (a: A, i: number) => B): B[]
  <A, B>(f: (a: A, i: number) => B): (arr: readonly A[]) => B[]
} = dual(2, (arr: any[], f: any) => {
  const len = arr.length, out = new Array(len)
  for (let i = 0; i < len; i++) out[i] = f(arr[i], i)
  return out
}, { op: 'mapWithIndex' })

export const filter: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, (arr: any[], pred: any) => {
  const out: any[] = []
  for (let i = 0, len = arr.length; i < len; i++) {
    const v = arr[i]
    if (pred(v)) out.push(v)
  }
  return out
}, { op: 'filter' })

export const filterWithIndex: {
  <A>(arr: readonly A[], pred: (a: A, i: number) => boolean): A[]
  <A>(pred: (a: A, i: number) => boolean): (arr: readonly A[]) => A[]
} = dual(2, (arr: any[], pred: any) => {
  const out: any[] = []
  for (let i = 0, len = arr.length; i < len; i++) {
    const v = arr[i]
    if (pred(v, i)) out.push(v)
  }
  return out
}, { op: 'filterWithIndex' })

export const flatMap: {
  <A, B>(arr: readonly A[], f: (a: A) => B[]): B[]
  <A, B>(f: (a: A) => B[]): (arr: readonly A[]) => B[]
} = dual(2, (arr: any[], f: any) => {
  const out: any[] = []
  for (let i = 0, len = arr.length; i < len; i++) {
    const r = f(arr[i])
    for (let j = 0, rlen = r.length; j < rlen; j++) out.push(r[j])
  }
  return out
}, { op: 'flatMap' })

export const find: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A | undefined
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A | undefined
} = dual(2, (arr: any[], pred: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    const v = arr[i]
    if (pred(v)) return v
  }
  return undefined
}, { op: 'find' })

export const findIndex: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): number | undefined
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => number | undefined
} = dual(2, (arr: any[], pred: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    if (pred(arr[i])) return i
  }
  return undefined
}, { op: 'findIndex' })

export const every: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => boolean
} = dual(2, (arr: any[], pred: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    if (!pred(arr[i])) return false
  }
  return true
}, { op: 'every' })

export const some: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => boolean
} = dual(2, (arr: any[], pred: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    if (pred(arr[i])) return true
  }
  return false
}, { op: 'some' })

export const includes: {
  <A>(arr: readonly A[], value: A): boolean
  <A>(value: A): (arr: readonly A[]) => boolean
} = dual(2, (arr: any[], value: any) => arr.includes(value), { op: 'includes' })

export const sortBy: {
  <A>(arr: readonly A[], cmp: (a: A, b: A) => number): A[]
  <A>(cmp: (a: A, b: A) => number): (arr: readonly A[]) => A[]
} = dual(2, RS.sortBy, { op: 'sortBy' })

export const takeSortedBy: {
  <A>(arr: readonly A[], k: number, cmp: (a: A, b: A) => number): A[]
  <A>(k: number, cmp: (a: A, b: A) => number): (arr: readonly A[]) => A[]
} = dual(3, RS.takeSortedBy)

export const uniq: <A>(arr: readonly A[]) => A[] = dual(1, RS.uniq, { op: 'uniq' })

export const uniqBy: {
  <A, B>(arr: readonly A[], f: (a: A) => B): A[]
  <A, B>(f: (a: A) => B): (arr: readonly A[]) => A[]
} = dual(2, RS.uniqBy, { op: 'uniqBy' })

export const take: {
  <A>(arr: readonly A[], n: number): A[]
  (n: number): <A>(arr: readonly A[]) => A[]
} = dual(2, RS.take, { op: 'take' })

export const drop: {
  <A>(arr: readonly A[], n: number): A[]
  (n: number): <A>(arr: readonly A[]) => A[]
} = dual(2, RS.drop, { op: 'drop' })

export const takeWhile: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, RS.takeWhile, { op: 'takeWhile' })

export const dropWhile: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, RS.dropWhile, { op: 'dropWhile' })

export const chunk: {
  <A>(arr: readonly A[], n: number): A[][]
  (n: number): <A>(arr: readonly A[]) => A[][]
} = dual(2, RS.chunk, { op: 'chunk' })

export const slidingWindow: {
  <A>(arr: readonly A[], n: number): A[][]
  (n: number): <A>(arr: readonly A[]) => A[][]
} = dual(2, RS.slidingWindow, { op: 'slidingWindow' })

export const intersperse: {
  <A>(arr: readonly A[], sep: A): A[]
  <A>(sep: A): (arr: readonly A[]) => A[]
} = dual(2, RS.intersperse, { op: 'intersperse' })

export const forEach: {
  <A>(arr: readonly A[], f: (a: A) => void): void
  <A>(f: (a: A) => void): (arr: readonly A[]) => void
} = dual(2, (arr: any[], f: any) => {
  for (let i = 0, len = arr.length; i < len; i++) f(arr[i])
}, { op: 'forEach' })

export const forEachWithIndex: {
  <A>(arr: readonly A[], f: (a: A, i: number) => void): void
  <A>(f: (a: A, i: number) => void): (arr: readonly A[]) => void
} = dual(2, (arr: any[], f: any) => {
  for (let i = 0, len = arr.length; i < len; i++) f(arr[i], i)
}, { op: 'forEachWithIndex' })

export const groupBy: {
  <A>(arr: readonly A[], f: (a: A) => string): Dict<A[]>
  <A>(f: (a: A) => string): (arr: readonly A[]) => Dict<A[]>
} = dual(2, RS.groupBy, { op: 'groupBy' })

export const partition: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): [A[], A[]]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => [A[], A[]]
} = dual(2, RS.partition, { op: 'partition' })

export const aperture: {
  <A>(arr: readonly A[], n: number): A[][]
  (n: number): <A>(arr: readonly A[]) => A[][]
} = dual(2, RS.aperture, { op: 'aperture' })

export const intersection: {
  <A>(a: readonly A[], b: readonly A[]): A[]
  <A>(b: readonly A[]): (a: readonly A[]) => A[]
} = dual(2, RS.intersection, { op: 'intersection' })

export const union: {
  <A>(a: readonly A[], b: readonly A[]): A[]
  <A>(b: readonly A[]): (a: readonly A[]) => A[]
} = dual(2, RS.union, { op: 'union' })

export const difference: {
  <A>(a: readonly A[], b: readonly A[]): A[]
  <A>(b: readonly A[]): (a: readonly A[]) => A[]
} = dual(2, RS.difference, { op: 'difference' })

export const symmetricDifference: {
  <A>(a: readonly A[], b: readonly A[]): A[]
  <A>(b: readonly A[]): (a: readonly A[]) => A[]
} = dual(2, RS.symmetricDifference, { op: 'symmetricDifference' })

// Arity 3
export const reduce: {
  <A, B>(arr: readonly A[], f: (acc: B, a: A) => B, init: B): B
  <A, B>(f: (acc: B, a: A) => B, init: B): (arr: readonly A[]) => B
} = dual(3, (arr: any[], f: any, init: any) => {
  let acc = init
  for (let i = 0, len = arr.length; i < len; i++) acc = f(acc, arr[i])
  return acc
}, { op: 'reduce' })

export const reduceRight: {
  <A, B>(arr: readonly A[], f: (acc: B, a: A) => B, init: B): B
  <A, B>(f: (acc: B, a: A) => B, init: B): (arr: readonly A[]) => B
} = dual(3, (arr: any[], f: any, init: any) => {
  let acc = init
  for (let i = arr.length - 1; i >= 0; i--) acc = f(acc, arr[i])
  return acc
}, { op: 'reduceRight' })

export const zip: {
  <A, B>(a: readonly A[], b: readonly B[]): [A, B][]
  <B>(b: readonly B[]): <A>(a: readonly A[]) => [A, B][]
} = dual(2, RS.zip, { op: 'zip' })

export const zipWith: {
  <A, B, C>(a: readonly A[], b: readonly B[], f: (a: A, b: B) => C): C[]
  <A, B, C>(b: readonly B[], f: (a: A, b: B) => C): (a: readonly A[]) => C[]
} = dual(3, RS.zipWith, { op: 'zipWith' })

export const adjust: {
  <A>(arr: readonly A[], index: number, f: (a: A) => A): A[]
  <A>(index: number, f: (a: A) => A): (arr: readonly A[]) => A[]
} = dual(3, RS.adjust, { op: 'adjust' })

export const update: {
  <A>(arr: readonly A[], index: number, value: A): A[]
  <A>(index: number, value: A): (arr: readonly A[]) => A[]
} = dual(3, RS.update, { op: 'update' })

export const insert: {
  <A>(arr: readonly A[], index: number, value: A): A[]
  <A>(index: number, value: A): (arr: readonly A[]) => A[]
} = dual(3, RS.insert, { op: 'insert' })

export const remove: {
  <A>(arr: readonly A[], index: number, count: number): A[]
  (index: number, count: number): <A>(arr: readonly A[]) => A[]
} = dual(3, RS.remove, { op: 'remove' })

export const scan: {
  <A, B>(arr: readonly A[], f: (acc: B, a: A) => B, init: B): B[]
  <A, B>(f: (acc: B, a: A) => B, init: B): (arr: readonly A[]) => B[]
} = dual(3, RS.scan, { op: 'scan' })

// Array numeric terminals (JIT-inlined in pipe)
export const sum: (arr: readonly number[]) => number = dual(1, nSum, { op: 'sum' })
export const min: (arr: readonly number[]) => number = dual(1, nMin, { op: 'min' })
export const max: (arr: readonly number[]) => number = dual(1, nMax, { op: 'max' })

// Sort specializations (JIT-inlined in pipe)
export const sortAsc: (arr: readonly number[]) => number[] = dual(1, (arr: number[]) => [...arr].sort((a, b) => a - b), { op: 'sortAsc' })
export const sortDesc: (arr: readonly number[]) => number[] = dual(1, (arr: number[]) => [...arr].sort((a, b) => b - a), { op: 'sortDesc' })

// --- Newly exposed from Array.res ---

// Arity 1
export const dropRepeats: <A>(arr: readonly A[]) => A[] = dual(1, RS.dropRepeats, { op: 'dropRepeats' })
export const shuffle: <A>(arr: readonly A[]) => A[] = RS.shuffle
export const only: <A>(arr: readonly A[]) => A | undefined = RS.only
export const mergeAll: <A>(arr: readonly A[]) => A = RS.mergeAll
export const unnest: <A>(arr: readonly A[][]) => A[] = RS.unnest

// Arity 2. Fuseable
export const reject: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, RS.reject, { op: 'reject' })

export const none: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => boolean
} = dual(2, RS.none, { op: 'none' })

export const count: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): number
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => number
} = dual(2, RS.count, { op: 'count' })

export const filterMap: {
  <A, B>(arr: readonly A[], f: (a: A) => B | null | undefined): B[]
  <A, B>(f: (a: A) => B | null | undefined): (arr: readonly A[]) => B[]
} = dual(2, (arr: any[], f: any) => {
  const out: any[] = []
  for (let i = 0, len = arr.length; i < len; i++) {
    const mapped = f(arr[i])
    if (mapped != null) out.push(mapped)
  }
  return out
}, { op: 'filterMap' })

export const findMap: {
  <A, B>(arr: readonly A[], f: (a: A) => B | null | undefined): B | undefined
  <A, B>(f: (a: A) => B | null | undefined): (arr: readonly A[]) => B | undefined
} = dual(2, (arr: any[], f: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    const mapped = f(arr[i])
    if (mapped != null) return mapped
  }
  return undefined
}, { op: 'findMap' })

export const mapWhile: {
  <A, B>(arr: readonly A[], f: (a: A) => B | null | undefined): B[]
  <A, B>(f: (a: A) => B | null | undefined): (arr: readonly A[]) => B[]
} = dual(2, (arr: any[], f: any) => {
  const out: any[] = []
  for (let i = 0, len = arr.length; i < len; i++) {
    const mapped = f(arr[i])
    if (mapped == null) break
    out.push(mapped)
  }
  return out
}, { op: 'mapWhile' })

export const takeUntil: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, (arr: any[], pred: any) => {
  const out: any[] = []
  for (let i = 0, len = arr.length; i < len; i++) {
    const value = arr[i]
    if (pred(value)) break
    out.push(value)
  }
  return out
}, { op: 'takeUntil' })

// Arity 2. Non-fuseable
export const append: {
  <A>(arr: readonly A[], value: A): A[]
  <A>(value: A): (arr: readonly A[]) => A[]
} = dual(2, RS.append)

export const prepend: {
  <A>(arr: readonly A[], value: A): A[]
  <A>(value: A): (arr: readonly A[]) => A[]
} = dual(2, RS.prepend)

export const concat: {
  <A>(a: readonly A[], b: readonly A[]): A[]
  <A>(b: readonly A[]): (a: readonly A[]) => A[]
} = dual(2, RS.concat)

export const nth: {
  <A>(arr: readonly A[], index: number): A | undefined
  (index: number): <A>(arr: readonly A[]) => A | undefined
} = dual(2, RS.nth)

export const indexOf: {
  <A>(arr: readonly A[], value: A): number | undefined
  <A>(value: A): (arr: readonly A[]) => number | undefined
} = dual(2, RS.indexOf)

export const lastIndexOf: {
  <A>(arr: readonly A[], value: A): number | undefined
  <A>(value: A): (arr: readonly A[]) => number | undefined
} = dual(2, RS.lastIndexOf)

export const findLast: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A | undefined
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A | undefined
} = dual(2, RS.findLast)

export const findLastIndex: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): number | undefined
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => number | undefined
} = dual(2, RS.findLastIndex)

export const without: {
  <A>(arr: readonly A[], values: readonly A[]): A[]
  <A>(values: readonly A[]): (arr: readonly A[]) => A[]
} = dual(2, RS.without)

export const pluck: {
  <A, B>(arr: readonly A[], key: string): B[]
  (key: string): <A, B>(arr: readonly A[]) => B[]
} = dual(2, RS.pluck)

export const dropRepeatsBy: {
  <A, B>(arr: readonly A[], f: (a: A) => B): A[]
  <A, B>(f: (a: A) => B): (arr: readonly A[]) => A[]
} = dual(2, RS.dropRepeatsBy)

export const dropRepeatsWith: {
  <A>(arr: readonly A[], eq: (a: A, b: A) => boolean): A[]
  <A>(eq: (a: A, b: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, RS.dropRepeatsWith)

export const dropLast: {
  <A>(arr: readonly A[], n: number): A[]
  (n: number): <A>(arr: readonly A[]) => A[]
} = dual(2, RS.dropLast)

export const dropLastWhile: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, RS.dropLastWhile)

export const takeLast: {
  <A>(arr: readonly A[], n: number): A[]
  (n: number): <A>(arr: readonly A[]) => A[]
} = dual(2, RS.takeLast)

export const takeLastWhile: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, RS.takeLastWhile)

export const splitAt: {
  <A>(arr: readonly A[], index: number): [A[], A[]]
  (index: number): <A>(arr: readonly A[]) => [A[], A[]]
} = dual(2, RS.splitAt)

export const splitWhen: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): [A[], A[]]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => [A[], A[]]
} = dual(2, RS.splitWhen)

export const splitWhenever: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[][]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[][]
} = dual(2, RS.splitWhenever)

export const join: {
  (arr: readonly string[], sep: string): string
  (sep: string): (arr: readonly string[]) => string
} = dual(2, RS.join)

export const uniqWith: {
  <A>(arr: readonly A[], eq: (a: A, b: A) => boolean): A[]
  <A>(eq: (a: A, b: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, RS.uniqWith)

export const groupWith: {
  <A>(arr: readonly A[], eq: (a: A, b: A) => boolean): A[][]
  <A>(eq: (a: A, b: A) => boolean): (arr: readonly A[]) => A[][]
} = dual(2, RS.groupWith)

export const indexBy: {
  <A>(arr: readonly A[], f: (a: A) => string): Dict<A>
  <A>(f: (a: A) => string): (arr: readonly A[]) => Dict<A>
} = dual(2, RS.indexBy)

export const collectBy: {
  <A>(arr: readonly A[], f: (a: A) => string): A[][]
  <A>(f: (a: A) => string): (arr: readonly A[]) => A[][]
} = dual(2, RS.collectBy)

export const sample: {
  <A>(arr: readonly A[], n: number): A[]
  (n: number): <A>(arr: readonly A[]) => A[]
} = dual(2, RS.sample)

export const hasAtLeast: {
  <A>(arr: readonly A[], n: number): boolean
  (n: number): <A>(arr: readonly A[]) => boolean
} = dual(2, RS.hasAtLeast)

export const meanBy: {
  <A>(arr: readonly A[], f: (a: A) => number): number
  <A>(f: (a: A) => number): (arr: readonly A[]) => number
} = dual(2, RS.meanBy)

export const sumBy: {
  <A>(arr: readonly A[], f: (a: A) => number): number
  <A>(f: (a: A) => number): (arr: readonly A[]) => number
} = dual(2, RS.sumBy)

export const mapToObj: {
  <A, B>(arr: readonly A[], f: (a: A) => [string, B]): Dict<B>
  <A, B>(f: (a: A) => [string, B]): (arr: readonly A[]) => Dict<B>
} = dual(2, RS.mapToObj)

export const zipObj: {
  <A>(keys: readonly string[], values: readonly A[]): Dict<A>
  <A>(values: readonly A[]): (keys: readonly string[]) => Dict<A>
} = dual(2, RS.zipObj)

export const groupByProp: {
  <A>(arr: readonly A[], prop: string): Dict<A[]>
  (prop: string): <A>(arr: readonly A[]) => Dict<A[]>
} = dual(2, RS.groupByProp)

export const arrayStartsWith: {
  <A>(arr: readonly A[], prefix: readonly A[]): boolean
  <A>(prefix: readonly A[]): (arr: readonly A[]) => boolean
} = dual(2, RS.arrayStartsWith)

export const arrayEndsWith: {
  <A>(arr: readonly A[], suffix: readonly A[]): boolean
  <A>(suffix: readonly A[]): (arr: readonly A[]) => boolean
} = dual(2, RS.arrayEndsWith)

export const sortedIndex: (arr: readonly number[], value: number) => number = RS.sortedIndex

export const sortedLastIndex: (arr: readonly number[], value: number) => number = RS.sortedLastIndex

export const pair: <A, B>(a: A, b: B) => [A, B] = RS.pair

// Arity 3
export const withoutBy: {
  <A>(arr: readonly A[], values: readonly A[], f: (a: A) => string): A[]
  <A>(values: readonly A[], f: (a: A) => string): (arr: readonly A[]) => A[]
} = dual(3, RS.withoutBy)

export const slice: {
  <A>(arr: readonly A[], start: number, end: number): A[]
  (start: number, end: number): <A>(arr: readonly A[]) => A[]
} = dual(3, RS.slice)

export const swap: {
  <A>(arr: readonly A[], i: number, j: number): A[]
  (i: number, j: number): <A>(arr: readonly A[]) => A[]
} = dual(3, RS.swap)

export const insertAll: {
  <A>(arr: readonly A[], index: number, values: readonly A[]): A[]
  <A>(index: number, values: readonly A[]): (arr: readonly A[]) => A[]
} = dual(3, RS.insertAll)

export const unionBy: {
  <A>(a: readonly A[], b: readonly A[], f: (a: A) => string): A[]
  <A>(b: readonly A[], f: (a: A) => string): (a: readonly A[]) => A[]
} = dual(3, RS.unionBy)

export const unionWith: {
  <A>(a: readonly A[], b: readonly A[], eq: (a: A, b: A) => boolean): A[]
  <A>(b: readonly A[], eq: (a: A, b: A) => boolean): (a: readonly A[]) => A[]
} = dual(3, RS.unionWith)

export const intersectionBy: {
  <A>(a: readonly A[], b: readonly A[], f: (a: A) => string): A[]
  <A>(b: readonly A[], f: (a: A) => string): (a: readonly A[]) => A[]
} = dual(3, RS.intersectionBy)

export const differenceBy: {
  <A>(a: readonly A[], b: readonly A[], f: (a: A) => string): A[]
  <A>(b: readonly A[], f: (a: A) => string): (a: readonly A[]) => A[]
} = dual(3, RS.differenceBy)

export const differenceWith: {
  <A>(a: readonly A[], b: readonly A[], eq: (a: A, b: A) => boolean): A[]
  <A>(b: readonly A[], eq: (a: A, b: A) => boolean): (a: readonly A[]) => A[]
} = dual(3, RS.differenceWith)

export const symmetricDifferenceBy: {
  <A>(a: readonly A[], b: readonly A[], f: (a: A) => string): A[]
  <A>(b: readonly A[], f: (a: A) => string): (a: readonly A[]) => A[]
} = dual(3, RS.symmetricDifferenceBy)

export const symmetricDifferenceWith: {
  <A>(a: readonly A[], b: readonly A[], eq: (a: A, b: A) => boolean): A[]
  <A>(b: readonly A[], eq: (a: A, b: A) => boolean): (a: readonly A[]) => A[]
} = dual(3, RS.symmetricDifferenceWith)

export const sortedIndexBy: {
  <A>(arr: readonly A[], value: A, f: (a: A) => number): number
  <A>(value: A, f: (a: A) => number): (arr: readonly A[]) => number
} = dual(3, RS.sortedIndexBy)

export const sortedIndexWith: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): number
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => number
} = dual(2, RS.sortedIndexWith)

export const sortedLastIndexBy: {
  <A>(arr: readonly A[], value: A, f: (a: A) => number): number
  <A>(value: A, f: (a: A) => number): (arr: readonly A[]) => number
} = dual(3, RS.sortedLastIndexBy)

export const mapAccum: {
  <A, B, C>(arr: readonly A[], f: (acc: B, a: A) => [B, C], init: B): [B, C[]]
  <A, B, C>(f: (acc: B, a: A) => [B, C], init: B): (arr: readonly A[]) => [B, C[]]
} = dual(3, RS.mapAccum)

export const mapAccumRight: {
  <A, B, C>(arr: readonly A[], f: (acc: B, a: A) => [B, C], init: B): [B, C[]]
  <A, B, C>(f: (acc: B, a: A) => [B, C], init: B): (arr: readonly A[]) => [B, C[]]
} = dual(3, RS.mapAccumRight)

// Arity 4
export const reduceBy: {
  <A, B>(arr: readonly A[], keyFn: (a: A) => string, reducer: (acc: B, a: A) => B, init: B): Dict<B>
  <A, B>(keyFn: (a: A) => string, reducer: (acc: B, a: A) => B, init: B): (arr: readonly A[]) => Dict<B>
} = dual(4, RS.reduceBy)

export const reduceWhile: {
  <A, B>(arr: readonly A[], pred: (acc: B, a: A) => boolean, f: (acc: B, a: A) => B, init: B): B
  <A, B>(pred: (acc: B, a: A) => boolean, f: (acc: B, a: A) => B, init: B): (arr: readonly A[]) => B
} = dual(4, RS.reduceWhile)

export const splice: {
  <A>(arr: readonly A[], start: number, deleteCount: number, items: readonly A[]): A[]
  <A>(start: number, deleteCount: number, items: readonly A[]): (arr: readonly A[]) => A[]
} = dual(4, RS.splice)
