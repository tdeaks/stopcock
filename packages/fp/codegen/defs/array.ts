import { dual } from './dual'
type Dict<A> = Record<string, A>
import {
  max as nMax,
  maxNonEmpty as nMaxNonEmpty,
  maxOrUndefined as nMaxOrUndefined,
  min as nMin,
  minNonEmpty as nMinNonEmpty,
  minOrUndefined as nMinOrUndefined,
  sum as nSum,
} from './number'
import { none as optionNone, some as optionSome, type Option } from './option'
import { mergeSortBy, mergeSortAsc, mergeSortDesc } from './sort-kernel'

const NON_FUSEABLE_OPCODE = 0

// Structural equality (deep, arrays/dates/plain-objects), used where entries need
// value comparison rather than reference identity
function structEq(a: any, b: any): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!structEq(a[i], b[i])) return false
    return true
  }
  if (a instanceof Date && b instanceof Date) return +a === +b
  for (const k in a) if (!structEq(a[k], b[k])) return false
  for (const k in b) if (!(k in a)) return false
  return true
}

function truncate<A>(a: A[], n: number): void {
  a.length = n
}

function sameValueZero(a: unknown, b: unknown): boolean {
  return a === b || (a !== a && b !== b)
}

function pluckRaw(
  arr: readonly Readonly<Record<PropertyKey, unknown>>[],
  key: PropertyKey,
): unknown[] {
  const len = arr.length
  const out = new Array<unknown>(len)
  for (let i = 0; i < len; i++) {
    out[i] = arr[i][key]
  }
  return out
}

function sampleRaw<A>(arr: readonly A[], n: number): A[] {
  var len = arr.length
  var size = n > len ? len : n
  var copy = arr.slice()
  for (var i = len - 1; i > len - 1 - size && i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    var tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy.slice(len - size)
}

function groupByPropRaw<A extends Readonly<Record<PropertyKey, unknown>>>(
  arr: readonly A[],
  prop: keyof A,
): Dict<A[]> {
  var dict: Dict<A[]> = {}
  for (var i = 0; i < arr.length; i++) {
    var key = String(arr[i][prop])
    if (!dict[key]) dict[key] = []
    dict[key].push(arr[i])
  }
  return dict
}

// Arity 1. Tagged for fusion engine (accessor ops get inlined in pipe)
export const headOrUndefined: <A>(arr: readonly A[]) => A | undefined = dual(
  1,
  (arr: any) => arr[0],
  { op: 'headOrUndefined' },
)
export const head: <A>(arr: readonly A[]) => Option<A> = dual(
  1,
  (a: any[]) => (a.length === 0 ? optionNone : optionSome(a[0])),
  {
    op: 'head',
  },
)
export const headNonEmpty: <A>(arr: readonly [A, ...A[]]) => A = dual(
  1,
  (arr: any) => arr[0],
  { op: 'headNonEmpty' },
)

export const lastOrUndefined: <A>(arr: readonly A[]) => A | undefined = dual(
  1,
  (arr: any) => arr[arr.length - 1],
  { op: 'lastOrUndefined' },
)
export const last: <A>(arr: readonly A[]) => Option<A> = dual(
  1,
  (a: any[]) => (a.length === 0 ? optionNone : optionSome(a[a.length - 1])),
  { op: 'last' },
)
export const lastNonEmpty: <A>(arr: readonly [A, ...A[]]) => A = dual(
  1,
  (arr: any) => arr[arr.length - 1],
  { op: 'lastNonEmpty' },
)
export const tail: <A>(arr: readonly A[]) => A[] = dual(
  1,
  (arr: any) => {
    if (arr.length <= 1) {
      return []
    } else {
      return arr.slice(1)
    }
  },
  { op: 'tail' },
)
export const init: <A>(arr: readonly A[]) => A[] = dual(
  1,
  (arr: any) => {
    let len = arr.length
    if (len <= 1) {
      return []
    } else {
      return arr.slice(0, (len - 1) | 0)
    }
  },
  { op: 'init' },
)
export const isEmpty: <A>(arr: readonly A[]) => boolean = dual(
  1,
  (arr: any) => {
    return arr.length === 0
  },
  { op: 'isEmpty' },
)
export const length: <A>(arr: readonly A[]) => number = dual(
  1,
  (arr: any) => {
    return arr.length
  },
  { op: 'length' },
)
export const reverse: <A>(arr: readonly A[]) => A[] = dual(
  1,
  (arr: any) => {
    return arr.toReversed ? arr.toReversed() : arr.slice().reverse()
  },
  { op: 'reverse' },
)
export const flatten: <A>(arr: readonly A[][]) => A[] = dual(
  1,
  (arr: any) => {
    var out = []
    for (var i = 0; i < arr.length; i++) {
      var inner = arr[i]
      for (var j = 0; j < inner.length; j++) out.push(inner[j])
    }
    return out
  },
  { op: 'flatten' },
)
export const firstOrUndefined = headOrUndefined
export const first: typeof head = head

// Standalone generators (no dual)
export const range: (start: number, end: number) => number[] = (start: any, end: any) => {
  if (end <= start) return []
  const len = end - start
  const out = new Array(len)
  for (let i = 0; i < len; i++) out[i] = start + i
  return out
}
export const sort: (arr: readonly number[]) => number[] = dual(1, (arr: any) => mergeSortAsc(arr), {
  op: 'sort',
})
export const transpose: <A>(arr: readonly A[][]) => A[][] = dual(
  1,
  (arr: any) => {
    const rows = arr.length
    if (rows === 0) return []
    let cols = arr[0].length
    for (let i = 1; i < rows; i++) {
      const rowLen = arr[i].length
      if (rowLen < cols) cols = rowLen
    }
    if (cols === 0) return []
    const out = new Array(cols)
    for (let c = 0; c < cols; c++) {
      const col = new Array(rows)
      for (let r = 0; r < rows; r++) col[r] = arr[r][c]
      out[c] = col
    }
    return out
  },
  { op: 'transpose' },
)

export const repeat: {
  <A>(value: A, n: number): A[]
  <A>(n: number): (value: A) => A[]
} = dual(
  2,
  (value: any, n: number) => {
    if (n <= 0) return []
    const out = new Array(n)
    for (let i = 0; i < n; i++) out[i] = value
    return out
  },
  { op: 'repeat' },
)

export const times: {
  <A>(f: (i: number) => A, n: number): A[]
  (n: number): <A>(f: (i: number) => A) => A[]
} = dual(
  2,
  (f: any, n: number) => {
    if (n <= 0) return []
    const out = new Array(n)
    for (let i = 0; i < n; i++) out[i] = f(i)
    return out
  },
  { op: 'times' },
)

export const unfold: {
  <A, B>(f: (seed: B) => [A, B] | undefined, seed: B): A[]
  <A, B>(seed: B): (f: (seed: B) => [A, B] | undefined) => A[]
} = dual(
  2,
  (f: any, seed: any) => {
    const result: any[] = []
    let s = seed
    while (true) {
      const match = f(s)
      if (match === undefined) break
      result.push(match[0])
      s = match[1]
    }
    return result
  },
  { op: 'unfold' },
)

export const xprod: {
  <A, B>(a: readonly A[], b: readonly B[]): [A, B][]
  <B>(b: readonly B[]): <A>(a: readonly A[]) => [A, B][]
} = dual(
  2,
  (a: any, b: any) => {
    let lenA = a.length
    let lenB = b.length
    let total = (lenA * lenB) | 0
    if (total === 0) {
      return []
    }
    let out = new Array(total)
    for (let i = 0; i < lenA; ++i) {
      for (let j = 0; j < lenB; ++j) {
        out[(((i * lenB) | 0) + j) | 0] = [a[i], b[j]]
      }
    }
    return out
  },
  { op: 'xprod' },
)

// Arity 2
//
// map is the S4 direct-leaf pilot: codegen splits it into an isolated
// execution leaf and an isolated curried constructor. See
// codegen/direct-leaf.ts.
export const map: {
  <A, B>(arr: readonly A[], f: (a: A) => B): B[]
  <A, B>(f: (a: A) => B): (arr: readonly A[]) => B[]
} = dual(
  2,
  (arr: any[], f: any) => {
    const len = arr.length,
      out = new Array(len)
    for (let i = 0; i < len; i++) out[i] = f(arr[i])
    return out
  },
  { op: 'map' },
)

export const mapWithIndex: {
  <A, B>(arr: readonly A[], f: (a: A, i: number) => B): B[]
  <A, B>(f: (a: A, i: number) => B): (arr: readonly A[]) => B[]
} = dual(
  2,
  (arr: any[], f: any) => {
    const len = arr.length,
      out = new Array(len)
    for (let i = 0; i < len; i++) out[i] = f(arr[i], i)
    return out
  },
  { op: 'mapWithIndex' },
)

export const filter: {
  <A, B extends A>(arr: readonly A[], pred: (a: A) => a is B): B[]
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A, B extends A>(pred: (a: A) => a is B): (arr: readonly A[]) => B[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(
  2,
  (arr: any[], pred: any) => {
    const out: any[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const v = arr[i]
      if (pred(v)) out.push(v)
    }
    return out
  },
  { op: 'filter' },
)

export const filterWithIndex: {
  <A, B extends A>(arr: readonly A[], pred: (a: A, i: number) => a is B): B[]
  <A>(arr: readonly A[], pred: (a: A, i: number) => boolean): A[]
  <A, B extends A>(pred: (a: A, i: number) => a is B): (arr: readonly A[]) => B[]
  <A>(pred: (a: A, i: number) => boolean): (arr: readonly A[]) => A[]
} = dual(
  2,
  (arr: any[], pred: any) => {
    const out: any[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const v = arr[i]
      if (pred(v, i)) out.push(v)
    }
    return out
  },
  { op: 'filterWithIndex' },
)

export const flatMap: {
  <A, B>(arr: readonly A[], f: (a: A) => B[]): B[]
  <A, B>(f: (a: A) => B[]): (arr: readonly A[]) => B[]
} = dual(
  2,
  (arr: any[], f: any) => {
    const out: any[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const r = f(arr[i])
      for (let j = 0, rlen = r.length; j < rlen; j++) out.push(r[j])
    }
    return out
  },
  { op: 'flatMap' },
)

export const findOrUndefined: {
  <A, B extends A>(arr: readonly A[], pred: (a: A) => a is B): B | undefined
  <A>(arr: readonly A[], pred: (a: A) => boolean): A | undefined
  <A, B extends A>(pred: (a: A) => a is B): (arr: readonly A[]) => B | undefined
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A | undefined
} = dual(2, (arr: any[], pred: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    const v = arr[i]
    if (pred(v)) return v
  }
  return undefined
},
  { op: 'findOrUndefined' },
)

export const find: {
  <A, B extends A>(arr: readonly A[], pred: (a: A) => a is B): Option<B>
  <A>(arr: readonly A[], pred: (a: A) => boolean): Option<A>
  <A, B extends A>(pred: (a: A) => a is B): (arr: readonly A[]) => Option<B>
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => Option<A>
} = dual(
  2,
  (arr: any[], pred: any) => {
    for (let i = 0, len = arr.length; i < len; i++) {
      const v = arr[i]
      if (pred(v)) return optionSome(v)
    }
    return optionNone
  },
  { op: 'find' },
)

export const findIndexOrUndefined: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): number | undefined
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => number | undefined
} = dual(2, (arr: any[], pred: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    if (pred(arr[i])) return i
  }
  return undefined
},
  { op: 'findIndexOrUndefined' },
)

export const findIndex: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): Option<number>
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => Option<number>
} = dual(
  2,
  (arr: any[], pred: any) => {
    for (let i = 0, len = arr.length; i < len; i++) {
      if (pred(arr[i])) return optionSome(i)
    }
    return optionNone
  },
  { op: 'findIndex' },
)

export const every: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => boolean
} = dual(
  2,
  (arr: any[], pred: any) => {
    for (let i = 0, len = arr.length; i < len; i++) {
      if (!pred(arr[i])) return false
    }
    return true
  },
  { op: 'every' },
)

export const some: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => boolean
} = dual(
  2,
  (arr: any[], pred: any) => {
    for (let i = 0, len = arr.length; i < len; i++) {
      if (pred(arr[i])) return true
    }
    return false
  },
  { op: 'some' },
)

export const includes: {
  <A>(arr: readonly A[], value: A): boolean
  <A>(value: A): (arr: readonly A[]) => boolean
} = dual(2, (arr: any[], value: any) => arr.includes(value), { op: 'includes' })

export const sortBy: {
  <A>(arr: readonly A[], cmp: (a: A, b: A) => number): A[]
  <A>(cmp: (a: A, b: A) => number): (arr: readonly A[]) => A[]
} = dual(2, (arr: any, cmp: any) => mergeSortBy(arr, cmp), { op: 'sortBy' })

export const takeSortedBy: {
  <A>(arr: readonly A[], k: number, cmp: (a: A, b: A) => number): A[]
  <A>(k: number, cmp: (a: A, b: A) => number): (arr: readonly A[]) => A[]
} = dual(3, (arr: any, k: any, cmp: any) => {
  var n = arr.length
  if (k <= 0) return []
  if (k >= n) return mergeSortBy(arr, cmp)
  // Copy to avoid mutating input
  var work = arr.slice()
  // Quickselect: partition work so that work[0..k-1] contains the k smallest
  var lo = 0,
    hi = n - 1
  while (lo < hi) {
    var pivot = work[lo + ((hi - lo) >> 1)]
    var i = lo,
      j = hi
    while (i <= j) {
      while (cmp(work[i], pivot) < 0) i++
      while (cmp(work[j], pivot) > 0) j--
      if (i <= j) {
        var tmp = work[i]
        work[i] = work[j]
        work[j] = tmp
        i++
        j--
      }
    }
    if (j < k - 1) lo = i
    else if (i > k - 1) hi = j
    else break
  }
  // Extract first k and sort them
  return mergeSortBy(work.slice(0, k), cmp)
},
  { op: 'takeSortedBy' },
)

export const uniq: <A>(arr: readonly A[]) => A[] = dual(
  1,
  (arr: any) => {
    return Array.from(new Set(arr))
  },
  { op: 'uniq' },
)

export const uniqBy: {
  <A, B>(arr: readonly A[], f: (a: A) => B): A[]
  <A, B>(f: (a: A) => B): (arr: readonly A[]) => A[]
} = dual(
  2,
  (arr: any, f: any) => {
    var seen = new Set(),
      out = []
    for (var i = 0, len = arr.length; i < len; i++) {
      var x = arr[i],
        key = f(x)
      if (!seen.has(key)) {
        seen.add(key)
        out.push(x)
      }
    }
    return out
  },
  { op: 'uniqBy' },
)

export const take: {
  <A>(arr: readonly A[], n: number): A[]
  (n: number): <A>(arr: readonly A[]) => A[]
} = function take(_arg0?: any, _arg1?: any) {
  if (arguments.length >= 2) {
    const arr = _arg0
    const n = _arg1
    let len = arr.length
    if (n <= 0) {
      return []
    } else {
      return arr.slice(0, n > len ? len : n)
    }
  }
  const n = _arg0
  const _dl: any = function (arr: any) {
    let len = arr.length
    if (n <= 0) {
      return []
    } else {
      return arr.slice(0, n > len ? len : n)
    }
  }
  // Coercible objects, symbols, and bigints can expose repeated native
  // comparison/slice coercions. Only a primitive number is admitted to the
  // streaming fusion contract; every other value keeps the real callable as
  // an opaque stage.
  _dl._op = 3
  _dl._fn = n
  if (typeof n !== 'number') return registerTrustedOperator(_dl, NON_FUSEABLE_OPCODE, n)
  const fusedCount = n > 0 ? (n === 1 / 0 ? n : n - (n % 1)) : 0
  return registerTrustedOperator(_dl, 3, fusedCount)
} as any

export const drop: {
  <A>(arr: readonly A[], n: number): A[]
  (n: number): <A>(arr: readonly A[]) => A[]
} = function drop(_arg0?: any, _arg1?: any) {
  if (arguments.length >= 2) {
    const arr = _arg0
    const n = _arg1
    let len = arr.length
    if (n <= 0) {
      return arr.slice()
    } else if (n >= len) {
      return []
    } else {
      return arr.slice(n)
    }
  }
  const n = _arg0
  const _dl: any = function (arr: any) {
    let len = arr.length
    if (n <= 0) {
      return arr.slice()
    } else if (n >= len) {
      return []
    } else {
      return arr.slice(n)
    }
  }
  _dl._op = 4
  _dl._fn = n
  if (typeof n !== 'number') return registerTrustedOperator(_dl, NON_FUSEABLE_OPCODE, n)
  const fusedCount = n > 0 ? (n === 1 / 0 ? n : n - (n % 1)) : 0
  return registerTrustedOperator(_dl, 4, fusedCount)
} as any

export const takeWhile: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(
  2,
  (arr: any, pred: any) => {
    var out = []
    for (var i = 0, len = arr.length; i < len; i++) {
      if (!pred(arr[i])) break
      out.push(arr[i])
    }
    return out
  },
  { op: 'takeWhile' },
)

export const dropWhile: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(
  2,
  (arr: any, pred: any) => {
    for (var i = 0, len = arr.length; i < len; i++) {
      if (!pred(arr[i])) return arr.slice(i)
    }
    return []
  },
  { op: 'dropWhile' },
)

export const chunk: {
  <A>(arr: readonly A[], n: number): A[][]
  (n: number): <A>(arr: readonly A[]) => A[][]
} = dual(
  2,
  (arr: any, n: any) => {
    var len = arr.length
    if (n <= 0 || len === 0) return []
    var numChunks = ((len + n - 1) / n) | 0
    var out = new Array(numChunks)
    for (var i = 0; i < numChunks; i++) {
      out[i] = arr.slice(i * n, i * n + n)
    }
    return out
  },
  { op: 'chunk' },
)

export const slidingWindow: {
  <A>(arr: readonly A[], n: number): A[][]
  (n: number): <A>(arr: readonly A[]) => A[][]
} = dual(
  2,
  (arr: any, n: any) => {
    let len = arr.length
    if (n <= 0 || n > len) {
      return []
    }
    let numWindows = (((len - n) | 0) + 1) | 0
    let out = new Array(numWindows)
    for (let wi = 0; wi < numWindows; ++wi) {
      let win = new Array(n)
      for (let j = 0; j < n; ++j) {
        win[j] = arr[(wi + j) | 0]
      }
      out[wi] = win
    }
    return out
  },
  { op: 'slidingWindow' },
)

export const intersperse: {
  <A>(arr: readonly A[], sep: A): A[]
  <A>(sep: A): (arr: readonly A[]) => A[]
} = dual(
  2,
  (arr: any, sep: any) => {
    let len = arr.length
    if (len <= 1) {
      return arr.slice(0)
    }
    let outLen = ((len << 1) - 1) | 0
    let out = new Array(outLen)
    for (let i = 0; i < len; ++i) {
      out[i << 1] = arr[i]
      if (i < ((len - 1) | 0)) {
        out[((i << 1) + 1) | 0] = sep
      }
    }
    return out
  },
  { op: 'intersperse' },
)

export const forEach: {
  <A>(arr: readonly A[], f: (a: A) => void): void
  <A>(f: (a: A) => void): (arr: readonly A[]) => void
} = dual(
  2,
  (arr: any[], f: any) => {
    for (let i = 0, len = arr.length; i < len; i++) f(arr[i])
  },
  { op: 'forEach' },
)

export const forEachWithIndex: {
  <A>(arr: readonly A[], f: (a: A, i: number) => void): void
  <A>(f: (a: A, i: number) => void): (arr: readonly A[]) => void
} = dual(
  2,
  (arr: any[], f: any) => {
    for (let i = 0, len = arr.length; i < len; i++) f(arr[i], i)
  },
  { op: 'forEachWithIndex' },
)

export const groupBy: {
  <A>(arr: readonly A[], f: (a: A) => string): Dict<A[]>
  <A>(f: (a: A) => string): (arr: readonly A[]) => Dict<A[]>
} = dual(
  2,
  (arr: any, f: any) => {
    var out: Dict<any[]> = {}
    for (var i = 0, len = arr.length; i < len; i++) {
      var x = arr[i],
        key = f(x)
      var existing = out[key]
      if (existing !== undefined) existing.push(x)
      else out[key] = [x]
    }
    return out
  },
  { op: 'groupBy' },
)

export const partition: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): [A[], A[]]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => [A[], A[]]
} = dual(
  2,
  (arr: any, pred: any) => {
    let len = arr.length
    let pass = new Array(len)
    let fail = new Array(len)
    let pi = 0
    let fi = 0
    for (let i = 0; i < len; ++i) {
      let x = arr[i]
      if (pred(x)) {
        pass[pi] = x
        pi = (pi + 1) | 0
      } else {
        fail[fi] = x
        fi = (fi + 1) | 0
      }
    }
    truncate(pass, pi)
    truncate(fail, fi)
    return [pass, fail]
  },
  { op: 'partition' },
)

export const aperture: {
  <A>(arr: readonly A[], n: number): A[][]
  (n: number): <A>(arr: readonly A[]) => A[][]
} = dual(
  2,
  (arr: any, n: any) => {
    let len = arr.length
    if (n <= 0 || n > len) {
      return []
    }
    let numWindows = (((len - n) | 0) + 1) | 0
    let out = new Array(numWindows)
    for (let wi = 0; wi < numWindows; ++wi) {
      let win = new Array(n)
      for (let j = 0; j < n; ++j) {
        win[j] = arr[(wi + j) | 0]
      }
      out[wi] = win
    }
    return out
  },
  { op: 'aperture' },
)

export const intersection: {
  <A>(a: readonly A[], b: readonly A[]): A[]
  <A>(b: readonly A[]): (a: readonly A[]) => A[]
} = dual(
  2,
  (a: any, b: any) => {
    const included = new Set(b)
    const emitted = new Set()
    const out = []
    for (let i = 0; i < a.length; i++) {
      const value = a[i]
      if (included.has(value) && !emitted.has(value)) {
        emitted.add(value)
        out.push(value)
      }
    }
    return out
  },
  { op: 'intersection' },
)

export const union: {
  <A>(a: readonly A[], b: readonly A[]): A[]
  <A>(b: readonly A[]): (a: readonly A[]) => A[]
} = dual(
  2,
  (a: any, b: any) => {
    const seen = new Set()
    const out = []
    for (let i = 0; i < a.length; i++) {
      const value = a[i]
      if (!seen.has(value)) {
        seen.add(value)
        out.push(value)
      }
    }
    for (let i = 0; i < b.length; i++) {
      const value = b[i]
      if (!seen.has(value)) {
        seen.add(value)
        out.push(value)
      }
    }
    return out
  },
  { op: 'union' },
)

export const difference: {
  <A>(a: readonly A[], b: readonly A[]): A[]
  <A>(b: readonly A[]): (a: readonly A[]) => A[]
} = dual(
  2,
  (a: any, b: any) => {
    const excluded = new Set(b)
    const emitted = new Set()
    const out = []
    for (let i = 0; i < a.length; i++) {
      const value = a[i]
      if (!excluded.has(value) && !emitted.has(value)) {
        emitted.add(value)
        out.push(value)
      }
    }
    return out
  },
  { op: 'difference' },
)

export const symmetricDifference: {
  <A>(a: readonly A[], b: readonly A[]): A[]
  <A>(b: readonly A[]): (a: readonly A[]) => A[]
} = dual(
  2,
  (a: any, b: any) => {
    const setA = new Set(a)
    const setB = new Set(b)
    const emitted = new Set()
    const out = []
    for (let i = 0; i < a.length; i++) {
      const value = a[i]
      if (!setB.has(value) && !emitted.has(value)) {
        emitted.add(value)
        out.push(value)
      }
    }
    for (let i = 0; i < b.length; i++) {
      const value = b[i]
      if (!setA.has(value) && !emitted.has(value)) {
        emitted.add(value)
        out.push(value)
      }
    }
    return out
  },
  { op: 'symmetricDifference' },
)

// Arity 3
export const reduce: {
  <A, B>(arr: readonly A[], f: (acc: B, a: A) => B, init: B): B
  <A, B>(f: (acc: B, a: A) => B, init: B): (arr: readonly A[]) => B
} = dual(
  3,
  (arr: any[], f: any, init: any) => {
    let acc = init
    for (let i = 0, len = arr.length; i < len; i++) acc = f(acc, arr[i])
    return acc
  },
  { op: 'reduce' },
)

export const reduceRight: {
  <A, B>(arr: readonly A[], f: (acc: B, a: A) => B, init: B): B
  <A, B>(f: (acc: B, a: A) => B, init: B): (arr: readonly A[]) => B
} = dual(
  3,
  (arr: any[], f: any, init: any) => {
    let acc = init
    for (let i = arr.length - 1; i >= 0; i--) acc = f(acc, arr[i])
    return acc
  },
  { op: 'reduceRight' },
)

export const zip: {
  <A, B>(a: readonly A[], b: readonly B[]): [A, B][]
  <B>(b: readonly B[]): <A>(a: readonly A[]) => [A, B][]
} = dual(
  2,
  (a: any, b: any) => {
    var len = a.length < b.length ? a.length : b.length
    var out = new Array(len),
      i = 0
    while (i < len) {
      out[i] = [a[i], b[i]]
      i++
    }
    return out
  },
  { op: 'zip' },
)

export const zipWith: {
  <A, B, C>(a: readonly A[], b: readonly B[], f: (a: A, b: B) => C): C[]
  <A, B, C>(b: readonly B[], f: (a: A, b: B) => C): (a: readonly A[]) => C[]
} = dual(
  3,
  (a: any, b: any, f: any) => {
    let lenA = a.length
    let lenB = b.length
    let len = lenA < lenB ? lenA : lenB
    let out = new Array(len)
    for (let i = 0; i < len; ++i) {
      out[i] = f(a[i], b[i])
    }
    return out
  },
  { op: 'zipWith' },
)

export const adjust: {
  <A>(arr: readonly A[], index: number, f: (a: A) => A): A[]
  <A>(index: number, f: (a: A) => A): (arr: readonly A[]) => A[]
} = dual(
  3,
  (arr: any, index: any, f: any) => {
    let len = arr.length
    if (index < 0 || index >= len) {
      return arr.slice(0)
    }
    let out = arr.slice(0)
    out[index] = f(arr[index])
    return out
  },
  { op: 'adjust' },
)

export const update: {
  <A>(arr: readonly A[], index: number, value: A): A[]
  <A>(index: number, value: A): (arr: readonly A[]) => A[]
} = dual(
  3,
  (arr: any, index: any, value: any) => {
    var len = arr.length
    if (index < 0 || index >= len) return arr.slice()
    var out = arr.slice()
    out[index] = value
    return out
  },
  { op: 'update' },
)

export const insert: {
  <A>(arr: readonly A[], index: number, value: A): A[]
  <A>(index: number, value: A): (arr: readonly A[]) => A[]
} = dual(
  3,
  (arr: any, index: any, value: any) => {
    let len = arr.length
    let idx = index < 0 ? 0 : index > len ? len : index
    let out = new Array((len + 1) | 0)
    for (let i = 0; i < idx; ++i) {
      out[i] = arr[i]
    }
    out[idx] = value
    for (let i$1 = idx; i$1 < len; ++i$1) {
      out[(i$1 + 1) | 0] = arr[i$1]
    }
    return out
  },
  { op: 'insert' },
)

export const remove: {
  <A>(arr: readonly A[], index: number, count: number): A[]
  (index: number, count: number): <A>(arr: readonly A[]) => A[]
} = dual(
  3,
  (arr: any, index: any, count: any) => {
    let len = arr.length
    if (index < 0 || index >= len || count <= 0) {
      return arr.slice(0)
    }
    let actual = ((index + count) | 0) > len ? (len - index) | 0 : count
    let newLen = (len - actual) | 0
    let out = new Array(newLen)
    for (let i = 0; i < index; ++i) {
      out[i] = arr[i]
    }
    for (let i$1 = (index + actual) | 0; i$1 < len; ++i$1) {
      out[(i$1 - actual) | 0] = arr[i$1]
    }
    return out
  },
  { op: 'remove' },
)

export const scan: {
  <A, B>(arr: readonly A[], f: (acc: B, a: A) => B, init: B): B[]
  <A, B>(f: (acc: B, a: A) => B, init: B): (arr: readonly A[]) => B[]
} = dual(
  3,
  (arr: any, f: any, init: any) => {
    let len = arr.length
    let out = new Array((len + 1) | 0)
    let acc = init
    out[0] = init
    for (let i = 0; i < len; ++i) {
      acc = f(acc, arr[i])
      out[(i + 1) | 0] = acc
    }
    return out
  },
  { op: 'scan' },
)

// Array numeric terminals (JIT-inlined in pipe)
export const sum: (arr: readonly number[]) => number = dual(1, nSum, { op: 'sum' })
export const minOrUndefined: (arr: readonly number[]) => number | undefined = dual(
  1,
  (arr: any) => nMinOrUndefined(arr),
  { op: 'minOrUndefined' },
)
export const min: (arr: readonly number[]) => Option<number> = dual(1, nMin, { op: 'min' })
export const minNonEmpty: (arr: readonly [number, ...number[]]) => number = dual(
  1,
  (arr: any) => nMinNonEmpty(arr),
  { op: 'minNonEmpty' },
)
export const maxOrUndefined: (arr: readonly number[]) => number | undefined = dual(
  1,
  (arr: any) => nMaxOrUndefined(arr),
  { op: 'maxOrUndefined' },
)
export const max: (arr: readonly number[]) => Option<number> = dual(1, nMax, { op: 'max' })
export const maxNonEmpty: (arr: readonly [number, ...number[]]) => number = dual(
  1,
  (arr: any) => nMaxNonEmpty(arr),
  { op: 'maxNonEmpty' },
)

// Sort specializations (JIT-inlined in pipe)
export const sortAsc: (arr: readonly number[]) => number[] = dual(
  1,
  (arr: number[]) => mergeSortAsc(arr),
  { op: 'sortAsc' },
)
export const sortDesc: (arr: readonly number[]) => number[] = dual(
  1,
  (arr: number[]) => mergeSortDesc(arr),
  { op: 'sortDesc' },
)

// --- Newly exposed from Array.res ---

// Arity 1
export const dropRepeats: <A>(arr: readonly A[]) => A[] = dual(
  1,
  (arr: any) => {
    const len = arr.length
    if (len === 0) return []
    const result = [arr[0]]
    for (let i = 1; i < len; i++) {
      const x = arr[i]
      if (!structEq(x, arr[i - 1])) result.push(x)
    }
    return result
  },
  { op: 'dropRepeats' },
)
export const shuffle: <A>(arr: readonly A[]) => A[] = dual(
  1,
  (arr: any) => {
    const copy = arr.slice()
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = copy[i]
      copy[i] = copy[j]
      copy[j] = tmp
    }
    return copy
  },
  { op: 'shuffle' },
)
export const onlyOrUndefined: <A>(arr: readonly A[]) => A | undefined = dual(
  1,
  (arr: any) => (arr.length === 1 ? arr[0] : undefined),
  { op: 'onlyOrUndefined' },
)
export const only: <A>(arr: readonly A[]) => Option<A> = dual(
  1,
  (arr: any) => (arr.length === 1 ? optionSome(arr[0]) : optionNone),
  { op: 'only' },
)
export const mergeAll: <A>(arr: readonly A[]) => A = dual(
  1,
  (arr: any) => Object.assign({}, ...arr),
  { op: 'mergeAll' },
)
export const unnest: <A>(arr: readonly A[][]) => A[] = dual(
  1,
  (arr: any) => flatten(arr as any),
  { op: 'unnest' },
)

// Arity 2. Fuseable
export const reject: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(
  2,
  (arr: any, pred: any) => {
    const len = arr.length
    var out = []
    for (var i = 0; i < len; i++) {
      if (!pred(arr[i])) out.push(arr[i])
    }
    return out
  },
  { op: 'reject' },
)

export const none: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => boolean
} = dual(
  2,
  (arr: any, pred: any) => {
    const len = arr.length
    for (var i = 0; i < len; i++) {
      if (pred(arr[i])) return false
    }
    return true
  },
  { op: 'none' },
)

export const count: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): number
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => number
} = dual(
  2,
  (arr: any, pred: any) => {
    let len = arr.length
    let c = 0
    for (let i = 0; i < len; ++i) {
      if (pred(arr[i])) {
        c = (c + 1) | 0
      }
    }
    return c
  },
  { op: 'count' },
)

export const filterMap: {
  <A, B>(arr: readonly A[], f: (a: A) => B | null | undefined): B[]
  <A, B>(f: (a: A) => B | null | undefined): (arr: readonly A[]) => B[]
} = dual(
  2,
  (arr: any[], f: any) => {
    const out: any[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const mapped = f(arr[i])
      if (mapped != null) out.push(mapped)
    }
    return out
  },
  { op: 'filterMap' },
)

export const findMapOrUndefined: {
  <A, B>(arr: readonly A[], f: (a: A) => B | null | undefined): B | undefined
  <A, B>(f: (a: A) => B | null | undefined): (arr: readonly A[]) => B | undefined
} = dual(2, (arr: any[], f: any) => {
  for (let i = 0, len = arr.length; i < len; i++) {
    const mapped = f(arr[i])
    if (mapped != null) return mapped
  }
  return undefined
},
  { op: 'findMapOrUndefined' },
)

export const findMap: {
  <A, B>(arr: readonly A[], f: (a: A) => B | null | undefined): Option<NonNullable<B>>
  <A, B>(f: (a: A) => B | null | undefined): (arr: readonly A[]) => Option<NonNullable<B>>
} = dual(
  2,
  (arr: any[], f: any) => {
    for (let i = 0, len = arr.length; i < len; i++) {
      const mapped = f(arr[i])
      if (mapped != null) return optionSome(mapped)
    }
    return optionNone
  },
  { op: 'findMap' },
)

export const mapWhile: {
  <A, B>(arr: readonly A[], f: (a: A) => B | null | undefined): B[]
  <A, B>(f: (a: A) => B | null | undefined): (arr: readonly A[]) => B[]
} = dual(
  2,
  (arr: any[], f: any) => {
    const out: any[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const mapped = f(arr[i])
      if (mapped == null) break
      out.push(mapped)
    }
    return out
  },
  { op: 'mapWhile' },
)

export const takeUntil: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(
  2,
  (arr: any[], pred: any) => {
    const out: any[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const value = arr[i]
      if (pred(value)) break
      out.push(value)
    }
    return out
  },
  { op: 'takeUntil' },
)

// Arity 2. Non-fuseable
export const append: {
  <A>(arr: readonly A[], value: A): A[]
  <A>(value: A): (arr: readonly A[]) => A[]
} = dual(2, (arr: any, value: any) => {
  let len = arr.length
  let out = new Array((len + 1) | 0)
  for (let i = 0; i < len; ++i) {
    out[i] = arr[i]
  }
  out[len] = value
  return out
},
  { op: 'append' },
)

export const prepend: {
  <A>(arr: readonly A[], value: A): A[]
  <A>(value: A): (arr: readonly A[]) => A[]
} = dual(2, (arr: any, value: any) => {
  let len = arr.length
  let out = new Array((len + 1) | 0)
  out[0] = value
  for (let i = 0; i < len; ++i) {
    out[(i + 1) | 0] = arr[i]
  }
  return out
},
  { op: 'prepend' },
)

export const concat: {
  <A>(a: readonly A[], b: readonly A[]): A[]
  <A>(b: readonly A[]): (a: readonly A[]) => A[]
} = dual(2, (a: any, b: any) => {
  return a.concat(b)
},
  { op: 'concat' },
)

export const nthOrUndefined: {
  <A>(arr: readonly A[], index: number): A | undefined
  (index: number): <A>(arr: readonly A[]) => A | undefined
} = dual(2, (arr: any, n: any) => {
  var i = n < 0 ? arr.length + n : n
  return i < 0 || i >= arr.length ? undefined : arr[i]
},
  { op: 'nthOrUndefined' },
)

export const nth: {
  <A>(arr: readonly A[], index: number): Option<A>
  (index: number): <A>(arr: readonly A[]) => Option<A>
} = dual(2, (arr: any, n: any) => {
  var i = n < 0 ? arr.length + n : n
  return i < 0 || i >= arr.length ? optionNone : optionSome(arr[i])
},
  { op: 'nth' },
)

export const indexOfOrUndefined: {
  <A>(arr: readonly A[], value: A): number | undefined
  <A>(value: A): (arr: readonly A[]) => number | undefined
} = dual(2, (arr: any, val: any) => {
  var i = arr.indexOf(val)
  return i === -1 ? undefined : i
},
  { op: 'indexOfOrUndefined' },
)

export const indexOf: {
  <A>(arr: readonly A[], value: A): Option<number>
  <A>(value: A): (arr: readonly A[]) => Option<number>
} = dual(2, (arr: any, val: any) => {
  var i = arr.indexOf(val)
  return i === -1 ? optionNone : optionSome(i)
},
  { op: 'indexOf' },
)

export const lastIndexOfOrUndefined: {
  <A>(arr: readonly A[], value: A): number | undefined
  <A>(value: A): (arr: readonly A[]) => number | undefined
} = dual(2, (arr: any, val: any) => {
  var i = arr.lastIndexOf(val)
  return i === -1 ? undefined : i
},
  { op: 'lastIndexOfOrUndefined' },
)

export const lastIndexOf: {
  <A>(arr: readonly A[], value: A): Option<number>
  <A>(value: A): (arr: readonly A[]) => Option<number>
} = dual(2, (arr: any, val: any) => {
  var i = arr.lastIndexOf(val)
  return i === -1 ? optionNone : optionSome(i)
},
  { op: 'lastIndexOf' },
)

export const findLastOrUndefined: {
  <A, B extends A>(arr: readonly A[], pred: (a: A) => a is B): B | undefined
  <A>(arr: readonly A[], pred: (a: A) => boolean): A | undefined
  <A, B extends A>(pred: (a: A) => a is B): (arr: readonly A[]) => B | undefined
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A | undefined
} = dual(2, (arr: any, pred: any) => {
  for (var i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return arr[i]
  }
  return undefined
},
  { op: 'findLastOrUndefined' },
)

export const findLast: {
  <A, B extends A>(arr: readonly A[], pred: (a: A) => a is B): Option<B>
  <A>(arr: readonly A[], pred: (a: A) => boolean): Option<A>
  <A, B extends A>(pred: (a: A) => a is B): (arr: readonly A[]) => Option<B>
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => Option<A>
} = dual(2, (arr: any, pred: any) => {
  for (var i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return optionSome(arr[i])
  }
  return optionNone
},
  { op: 'findLast' },
)

export const findLastIndexOrUndefined: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): number | undefined
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => number | undefined
} = dual(2, (arr: any, pred: any) => {
  for (var i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i
  }
  return undefined
},
  { op: 'findLastIndexOrUndefined' },
)

export const findLastIndex: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): Option<number>
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => Option<number>
} = dual(2, (arr: any, pred: any) => {
  for (var i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return optionSome(i)
  }
  return optionNone
},
  { op: 'findLastIndex' },
)

const withoutCopyRaw = (arr: any): any[] => {
  const len = arr.length
  const result = new Array(len)
  for (let i = 0; i < len; ++i) result[i] = arr[i]
  return result
}

const without1Raw = (arr: any, v0: any): any[] => {
  const len = arr.length
  const result = new Array(len)
  let outputLength = 0
  const hasNaN = v0 !== v0
  for (let i = 0; i < len; ++i) {
    const x = arr[i]
    if (!(x !== x ? hasNaN : x === v0)) result[outputLength++] = x
  }
  result.length = outputLength
  return result
}

const without2Raw = (arr: any, v0: any, v1: any): any[] => {
  const len = arr.length
  const result = []
  const hasNaN = v0 !== v0 || v1 !== v1
  for (let i = 0; i < len; ++i) {
    const x = arr[i]
    if (!(x !== x ? hasNaN : x === v0 || x === v1)) result.push(x)
  }
  return result
}

const without3Raw = (arr: any, v0: any, v1: any, v2: any): any[] => {
  const len = arr.length
  const result = []
  const hasNaN = v0 !== v0 || v1 !== v1 || v2 !== v2
  for (let i = 0; i < len; ++i) {
    const x = arr[i]
    if (!(x !== x ? hasNaN : x === v0 || x === v1 || x === v2)) result.push(x)
  }
  return result
}

const without4Raw = (arr: any, v0: any, v1: any, v2: any, v3: any): any[] => {
  const len = arr.length
  const result = new Array(len)
  let outputLength = 0
  const hasNaN = v0 !== v0 || v1 !== v1 || v2 !== v2 || v3 !== v3
  for (let i = 0; i < len; ++i) {
    const x = arr[i]
    if (!(x !== x ? hasNaN : x === v0 || x === v1 || x === v2 || x === v3)) {
      result[outputLength++] = x
    }
  }
  result.length = outputLength
  return result
}

const without5Raw = (arr: any, v0: any, v1: any, v2: any, v3: any, v4: any): any[] => {
  const len = arr.length
  const result = new Array(len)
  let outputLength = 0
  const hasNaN = v0 !== v0 || v1 !== v1 || v2 !== v2 || v3 !== v3 || v4 !== v4
  for (let i = 0; i < len; ++i) {
    const x = arr[i]
    if (!(x !== x ? hasNaN : x === v0 || x === v1 || x === v2 || x === v3 || x === v4)) {
      result[outputLength++] = x
    }
  }
  result.length = outputLength
  return result
}

const without6Raw = (arr: any, v0: any, v1: any, v2: any, v3: any, v4: any, v5: any): any[] => {
  const len = arr.length
  const result = []
  const hasNaN = v0 !== v0 || v1 !== v1 || v2 !== v2 || v3 !== v3 || v4 !== v4 || v5 !== v5
  for (let i = 0; i < len; ++i) {
    const x = arr[i]
    if (
      !(x !== x ? hasNaN : x === v0 || x === v1 || x === v2 || x === v3 || x === v4 || x === v5)
    ) {
      result.push(x)
    }
  }
  return result
}

const without7Raw = (
  arr: any,
  v0: any,
  v1: any,
  v2: any,
  v3: any,
  v4: any,
  v5: any,
  v6: any,
): any[] => {
  const len = arr.length
  const result = []
  const hasNaN =
    v0 !== v0 || v1 !== v1 || v2 !== v2 || v3 !== v3 || v4 !== v4 || v5 !== v5 || v6 !== v6
  for (let i = 0; i < len; ++i) {
    const x = arr[i]
    if (
      !(x !== x
        ? hasNaN
        : x === v0 || x === v1 || x === v2 || x === v3 || x === v4 || x === v5 || x === v6)
    ) {
      result.push(x)
    }
  }
  return result
}

const without8Raw = (
  arr: any,
  v0: any,
  v1: any,
  v2: any,
  v3: any,
  v4: any,
  v5: any,
  v6: any,
  v7: any,
): any[] => {
  const len = arr.length
  const result = new Array(len)
  let outputLength = 0
  const hasNaN =
    v0 !== v0 ||
    v1 !== v1 ||
    v2 !== v2 ||
    v3 !== v3 ||
    v4 !== v4 ||
    v5 !== v5 ||
    v6 !== v6 ||
    v7 !== v7
  for (let i = 0; i < len; ++i) {
    const x = arr[i]
    if (
      !(x !== x
        ? hasNaN
        : x === v0 ||
          x === v1 ||
          x === v2 ||
          x === v3 ||
          x === v4 ||
          x === v5 ||
          x === v6 ||
          x === v7)
    ) {
      result[outputLength++] = x
    }
  }
  result.length = outputLength
  return result
}

const withoutLinearRaw = (arr: any, values: any): any[] => {
  const len = arr.length
  const valuesLength = values.length
  const result = []
  outer: for (let i = 0; i < len; ++i) {
    const x = arr[i]
    for (let j = 0; j < valuesLength; ++j) {
      if (sameValueZero(x, values[j])) continue outer
    }
    result.push(x)
  }
  return result
}

const withoutSetRaw = (arr: any, values: any): any[] => {
  const len = arr.length
  const exclude = new Set(values)
  const result = []
  for (let i = 0; i < len; ++i) {
    const x = arr[i]
    if (!exclude.has(x)) result.push(x)
  }
  return result
}

const withoutDispatchRaw = (arr: any, values: any): any[] => {
  const valuesLength = values.length
  // Once the source is moderately large, Set's SameValueZero lookup pays for
  // its construction above the fully unrolled small-exclusion kernels.
  if (arr.length >= 512 && valuesLength > 8) return withoutSetRaw(arr, values)
  switch (valuesLength) {
    case 0:
      return withoutCopyRaw(arr)
    case 1:
      return without1Raw(arr, values[0])
    case 2:
      return without2Raw(arr, values[0], values[1])
    case 3:
      return without3Raw(arr, values[0], values[1], values[2])
    case 4:
      return without4Raw(arr, values[0], values[1], values[2], values[3])
    case 5:
      return without5Raw(arr, values[0], values[1], values[2], values[3], values[4])
    case 6:
      return without6Raw(arr, values[0], values[1], values[2], values[3], values[4], values[5])
    case 7:
      return without7Raw(
        arr,
        values[0],
        values[1],
        values[2],
        values[3],
        values[4],
        values[5],
        values[6],
      )
    case 8:
      return without8Raw(
        arr,
        values[0],
        values[1],
        values[2],
        values[3],
        values[4],
        values[5],
        values[6],
        values[7],
      )
    default:
      return valuesLength <= 32 ? withoutLinearRaw(arr, values) : withoutSetRaw(arr, values)
  }
}

// values is a single array-valued argument here, not variadic -- fits the
// registry's fn binding cleanly (see opcodes.ts's OP_WITHOUT comment). Both
// call styles share the same size-specialized dispatcher.
export const without: {
  <A>(arr: readonly A[], values: readonly A[]): A[]
  <A>(values: readonly A[]): (arr: readonly A[]) => A[]
} = dual(2, withoutDispatchRaw, { op: 'without' })

export const pluck: {
  <A, K extends keyof A>(arr: readonly A[], key: K): A[K][]
  <K extends PropertyKey>(
    key: K,
  ): <A extends Readonly<Record<K, unknown>>>(arr: readonly A[]) => A[K][]
} = dual(2, (arr: any, key: any) => {
  return pluckRaw(arr, key)
},
  { op: 'pluck' },
)

export const dropRepeatsBy: {
  <A, B>(arr: readonly A[], f: (a: A) => B): A[]
  <A, B>(f: (a: A) => B): (arr: readonly A[]) => A[]
} = dual(2, (arr: any, f: any) => {
  const len = arr.length
  if (len === 0) return []
  const first = arr[0]
  const result = [first]
  let lastKey = f(first)
  for (let i = 1; i < len; i++) {
    const x = arr[i]
    const key = f(x)
    if (!structEq(key, lastKey)) {
      result.push(x)
      lastKey = key
    }
  }
  return result
},
  { op: 'dropRepeatsBy' },
)

export const dropRepeatsWith: {
  <A>(arr: readonly A[], eq: (a: A, b: A) => boolean): A[]
  <A>(eq: (a: A, b: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, (arr: any, eq: any) => {
  let len = arr.length
  if (len === 0) {
    return []
  }
  let result = [arr[0]]
  for (let i = 1; i < len; ++i) {
    let x = arr[i]
    if (!eq(arr[(i - 1) | 0], x)) {
      result.push(x)
    }
  }
  return result
},
  { op: 'dropRepeatsWith' },
)

export const dropLast: {
  <A>(arr: readonly A[], n: number): A[]
  (n: number): <A>(arr: readonly A[]) => A[]
} = dual(2, (arr: any, n: any) => {
  let len = arr.length
  if (n <= 0) {
    return arr.slice(0)
  }
  if (n >= len) {
    return []
  }
  let count = (len - n) | 0
  let out = new Array(count)
  for (let i = 0; i < count; ++i) {
    out[i] = arr[i]
  }
  return out
},
  { op: 'dropLast' },
)

export const dropLastWhile: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, (arr: any, pred: any) => {
  let len = arr.length
  let i = (len - 1) | 0
  while (i >= 0 && pred(arr[i])) {
    i = (i - 1) | 0
  }
  let count = (i + 1) | 0
  if (count === len) {
    return arr.slice(0)
  }
  if (count <= 0) {
    return []
  }
  let out = new Array(count)
  for (let j = 0; j < count; ++j) {
    out[j] = arr[j]
  }
  return out
},
  { op: 'dropLastWhile' },
)

export const takeLast: {
  <A>(arr: readonly A[], n: number): A[]
  (n: number): <A>(arr: readonly A[]) => A[]
} = dual(2, (arr: any, n: any) => {
  let len = arr.length
  if (n <= 0) {
    return []
  }
  if (n >= len) {
    return arr.slice(0)
  }
  let start = (len - n) | 0
  let out = new Array(n)
  for (let i = 0; i < n; ++i) {
    out[i] = arr[(start + i) | 0]
  }
  return out
},
  { op: 'takeLast' },
)

export const takeLastWhile: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, (arr: any, pred: any) => {
  let len = arr.length
  let i = (len - 1) | 0
  while (i >= 0 && pred(arr[i])) {
    i = (i - 1) | 0
  }
  let start = (i + 1) | 0
  let count = (len - start) | 0
  if (count <= 0) {
    return []
  }
  if (count === len) {
    return arr.slice(0)
  }
  let out = new Array(count)
  for (let j = 0; j < count; ++j) {
    out[j] = arr[(start + j) | 0]
  }
  return out
},
  { op: 'takeLastWhile' },
)

export const splitAt: {
  <A>(arr: readonly A[], index: number): [A[], A[]]
  (index: number): <A>(arr: readonly A[]) => [A[], A[]]
} = dual(2, (arr: any, index: any) => {
  var i = index < 0 ? 0 : index > arr.length ? arr.length : index
  return [arr.slice(0, i), arr.slice(i)]
},
  { op: 'splitAt' },
)

export const splitWhen: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): [A[], A[]]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => [A[], A[]]
} = dual(2, (arr: any, pred: any) => {
  let len = arr.length
  let i = 0
  let found = false
  while (i < len && !found) {
    if (pred(arr[i])) {
      found = true
    } else {
      i = (i + 1) | 0
    }
  }
  return splitAt(arr, i)
},
  { op: 'splitWhen' },
)

export const splitWhenever: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): A[][]
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => A[][]
} = dual(2, (arr: any, pred: any) => {
  let len = arr.length
  if (len === 0) {
    return []
  }
  let result = []
  let current = []
  for (let i = 0; i < len; ++i) {
    let x = arr[i]
    if (pred(x)) {
      result.push(current.slice())
      current.splice(0, current.length)
    } else {
      current.push(x)
    }
  }
  result.push(current.slice())
  return result
},
  { op: 'splitWhenever' },
)

export const join: {
  (arr: readonly string[], sep: string): string
  (sep: string): (arr: readonly string[]) => string
} = dual(2, (arr: any, sep: any) => {
  return arr.join(sep)
})

export const uniqWith: {
  <A>(arr: readonly A[], eq: (a: A, b: A) => boolean): A[]
  <A>(eq: (a: A, b: A) => boolean): (arr: readonly A[]) => A[]
} = dual(2, (arr: any, eq: any) => {
  let result = []
  for (let i = 0, i_finish = arr.length; i < i_finish; ++i) {
    let x = arr[i]
    let dup = false
    let j = 0
    while (j < result.length && !dup) {
      if (eq(result[j], x)) {
        dup = true
      }
      j = (j + 1) | 0
    }
    if (!dup) {
      result.push(x)
    }
  }
  return result
},
  { op: 'uniqWith' },
)

export const groupWith: {
  <A>(arr: readonly A[], eq: (a: A, b: A) => boolean): A[][]
  <A>(eq: (a: A, b: A) => boolean): (arr: readonly A[]) => A[][]
} = dual(2, (arr: any, eq: any) => {
  let len = arr.length
  if (len === 0) {
    return []
  }
  let result = []
  let current = [arr[0]]
  for (let i = 1; i < len; ++i) {
    let x = arr[i]
    if (eq(arr[(i - 1) | 0], x)) {
      current.push(x)
    } else {
      result.push(current.slice())
      current.splice(0, current.length, x)
    }
  }
  result.push(current.slice())
  return result
},
  { op: 'groupWith' },
)

export const indexBy: {
  <A>(arr: readonly A[], f: (a: A) => string): Dict<A>
  <A>(f: (a: A) => string): (arr: readonly A[]) => Dict<A>
} = dual(2, (arr: any, f: any) => {
  let len = arr.length
  let dict: Dict<any> = {}
  for (let i = 0; i < len; ++i) {
    let x = arr[i]
    dict[f(x)] = x
  }
  return dict
},
  { op: 'indexBy' },
)

export const collectBy: {
  <A>(arr: readonly A[], f: (a: A) => string): A[][]
  <A>(f: (a: A) => string): (arr: readonly A[]) => A[][]
} = dual(2, (arr: any, f: any) => {
  let len = arr.length
  let dict: Dict<any[]> = {}
  let keys: string[] = []
  for (let i = 0; i < len; ++i) {
    let x = arr[i]
    let key = f(x)
    let group = dict[key]
    if (group !== undefined) {
      group.push(x)
    } else {
      dict[key] = [x]
      keys.push(key)
    }
  }
  let kLen = keys.length
  let out = new Array(kLen)
  for (let i$1 = 0; i$1 < kLen; ++i$1) {
    let group$1 = dict[keys[i$1]]
    if (group$1 !== undefined) {
      out[i$1] = group$1
    } else {
      out[i$1] = []
    }
  }
  return out
},
  { op: 'collectBy' },
)

export const sample: {
  <A>(arr: readonly A[], n: number): A[]
  (n: number): <A>(arr: readonly A[]) => A[]
} = dual(2, (arr: any, n: any) => {
  return sampleRaw(arr, n)
},
  { op: 'sample' },
)

export const hasAtLeast: {
  <A>(arr: readonly A[], n: number): boolean
  (n: number): <A>(arr: readonly A[]) => boolean
} = dual(2, (arr: any, n: any) => {
  return arr.length >= n
},
  { op: 'hasAtLeast' },
)

export const meanByOrUndefined: {
  <A>(arr: readonly A[], f: (a: A) => number): number | undefined
  <A>(f: (a: A) => number): (arr: readonly A[]) => number | undefined
} = dual(2, (arr: any, f: any) => {
  let len = arr.length
  if (len === 0) {
    return undefined
  }
  let acc = 0.0
  for (let i = 0; i < len; ++i) {
    acc = acc + f(arr[i])
  }
  return acc / len
},
  { op: 'meanByOrUndefined' },
)

export const meanBy: {
  <A>(arr: readonly A[], f: (a: A) => number): Option<number>
  <A>(f: (a: A) => number): (arr: readonly A[]) => Option<number>
} = dual(2, (arr: any, f: any) => {
  const value = meanByOrUndefined(arr, f)
  return value === undefined ? optionNone : optionSome(value)
},
  { op: 'meanBy' },
)

export const meanByNonEmpty: {
  <A>(arr: readonly [A, ...A[]], f: (a: A) => number): number
  <A>(f: (a: A) => number): (arr: readonly [A, ...A[]]) => number
} = dual(2, (arr: any, f: any) => meanByOrUndefined(arr, f) as number,
  { op: 'meanByNonEmpty' },
)

export const sumBy: {
  <A>(arr: readonly A[], f: (a: A) => number): number
  <A>(f: (a: A) => number): (arr: readonly A[]) => number
} = dual(2, (arr: any, f: any) => {
  let len = arr.length
  let acc = 0.0
  for (let i = 0; i < len; ++i) {
    acc = acc + f(arr[i])
  }
  return acc
},
  { op: 'sumBy' },
)

export const mapToObj: {
  <A, B>(arr: readonly A[], f: (a: A) => [string, B]): Dict<B>
  <A, B>(f: (a: A) => [string, B]): (arr: readonly A[]) => Dict<B>
} = dual(2, (arr: any, f: any) => {
  let len = arr.length
  let dict: Dict<any> = {}
  for (let i = 0; i < len; ++i) {
    let match = f(arr[i])
    dict[match[0]] = match[1]
  }
  return dict
},
  { op: 'mapToObj' },
)

export const zipObj: {
  <A>(keys: readonly string[], values: readonly A[]): Dict<A>
  <A>(values: readonly A[]): (keys: readonly string[]) => Dict<A>
} = dual(2, (keys: any, values: any) => {
  let lenK = keys.length
  let lenV = values.length
  let len = lenK < lenV ? lenK : lenV
  let dict: Dict<any> = {}
  for (let i = 0; i < len; ++i) {
    dict[keys[i]] = values[i]
  }
  return dict
},
  { op: 'zipObj' },
)

export const groupByProp: {
  <A>(arr: readonly A[], prop: string): Dict<A[]>
  (prop: string): <A>(arr: readonly A[]) => Dict<A[]>
} = dual(2, (arr: any, prop: any) => {
  return groupByPropRaw(arr, prop)
},
  { op: 'groupByProp' },
)

export const arrayStartsWith: {
  <A>(arr: readonly A[], prefix: readonly A[]): boolean
  <A>(prefix: readonly A[]): (arr: readonly A[]) => boolean
} = dual(2, (arr: any, prefix: any) => {
  const lenA = arr.length
  const lenP = prefix.length
  if (lenP > lenA) return false
  for (let i = 0; i < lenP; i++) if (!structEq(arr[i], prefix[i])) return false
  return true
},
  { op: 'arrayStartsWith' },
)

export const arrayEndsWith: {
  <A>(arr: readonly A[], suffix: readonly A[]): boolean
  <A>(suffix: readonly A[]): (arr: readonly A[]) => boolean
} = dual(2, (arr: any, suffix: any) => {
  const lenA = arr.length
  const lenS = suffix.length
  if (lenS > lenA) return false
  const offset = lenA - lenS
  for (let i = 0; i < lenS; i++) if (!structEq(arr[offset + i], suffix[i])) return false
  return true
},
  { op: 'arrayEndsWith' },
)

export const sortedIndex: {
  (arr: readonly number[], value: number): number
  (value: number): (arr: readonly number[]) => number
} = dual(
  2,
  (arr: any, value: any) => {
    let lo = 0,
      hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid] < value) lo = mid + 1
      else hi = mid
    }
    return lo
  },
  { op: 'sortedIndex' },
)

export const sortedLastIndex: {
  (arr: readonly number[], value: number): number
  (value: number): (arr: readonly number[]) => number
} = dual(
  2,
  (arr: any, value: any) => {
    let lo = 0,
      hi = arr.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid] <= value) lo = mid + 1
      else hi = mid
    }
    return lo
  },
  { op: 'sortedLastIndex' },
)

export const pair: <A, B>(a: A, b: B) => [A, B] = (a: any, b: any) => [a, b]

// Arity 3
export const withoutBy: {
  <A>(arr: readonly A[], values: readonly A[], f: (a: A) => string): A[]
  <A>(values: readonly A[], f: (a: A) => string): (arr: readonly A[]) => A[]
} = dual(3, (arr: any, values: any, f: any) => {
  let exclude = new Set()
  for (let i = 0, i_finish = values.length; i < i_finish; ++i) {
    exclude.add(f(values[i]))
  }
  let result = []
  for (let i$1 = 0, i_finish$1 = arr.length; i$1 < i_finish$1; ++i$1) {
    let x = arr[i$1]
    if (!exclude.has(f(x))) {
      result.push(x)
    }
  }
  return result
},
  { op: 'withoutBy' },
)

export const slice: {
  <A>(arr: readonly A[], start: number, end: number): A[]
  (start: number, end: number): <A>(arr: readonly A[]) => A[]
} = dual(3, (arr: any, start: any, end_: any) => {
  let len = arr.length
  let s = start < 0 ? (((len + start) | 0) > 0 ? (len + start) | 0 : 0) : start < len ? start : len
  let e = end_ < 0 ? (((len + end_) | 0) > 0 ? (len + end_) | 0 : 0) : end_ < len ? end_ : len
  if (s >= e) {
    return []
  }
  let count = (e - s) | 0
  let out = new Array(count)
  for (let i = 0; i < count; ++i) {
    out[i] = arr[(s + i) | 0]
  }
  return out
},
  { op: 'slice' },
)

export const swap: {
  <A>(arr: readonly A[], i: number, j: number): A[]
  (i: number, j: number): <A>(arr: readonly A[]) => A[]
} = dual(3, (arr: any, i: any, j: any) => {
  let len = arr.length
  if (i < 0 || i >= len || j < 0 || j >= len) {
    return arr.slice(0)
  }
  let out = arr.slice(0)
  out[i] = arr[j]
  out[j] = arr[i]
  return out
},
  { op: 'swap' },
)

export const insertAll: {
  <A>(arr: readonly A[], index: number, values: readonly A[]): A[]
  <A>(index: number, values: readonly A[]): (arr: readonly A[]) => A[]
} = dual(3, (arr: any, index: any, values: any) => {
  let len = arr.length
  let vLen = values.length
  let idx = index < 0 ? 0 : index > len ? len : index
  let out = new Array((len + vLen) | 0)
  for (let i = 0; i < idx; ++i) {
    out[i] = arr[i]
  }
  for (let i$1 = 0; i$1 < vLen; ++i$1) {
    out[(idx + i$1) | 0] = values[i$1]
  }
  for (let i$2 = idx; i$2 < len; ++i$2) {
    out[(i$2 + vLen) | 0] = arr[i$2]
  }
  return out
},
  { op: 'insertAll' },
)

export const unionBy: {
  <A>(a: readonly A[], b: readonly A[], f: (a: A) => string): A[]
  <A>(b: readonly A[], f: (a: A) => string): (a: readonly A[]) => A[]
} = dual(3, (a: any, b: any, f: any) => {
  let seen = new Set()
  let result = []
  for (let i = 0, i_finish = a.length; i < i_finish; ++i) {
    let x = a[i]
    let k = f(x)
    if (!seen.has(k)) {
      seen.add(k)
      result.push(x)
    }
  }
  for (let i$1 = 0, i_finish$1 = b.length; i$1 < i_finish$1; ++i$1) {
    let x$1 = b[i$1]
    let k$1 = f(x$1)
    if (!seen.has(k$1)) {
      seen.add(k$1)
      result.push(x$1)
    }
  }
  return result
},
  { op: 'unionBy' },
)

export const unionWith: {
  <A>(a: readonly A[], b: readonly A[], eq: (a: A, b: A) => boolean): A[]
  <A>(b: readonly A[], eq: (a: A, b: A) => boolean): (a: readonly A[]) => A[]
} = dual(3, (a: any, b: any, eq: any) => {
  let result: any[] = []
  let addIfNew = (x: any): void => {
    let dup = false
    let j = 0
    while (j < result.length && !dup) {
      if (eq(result[j], x)) {
        dup = true
      }
      j = (j + 1) | 0
    }
    if (!dup) {
      result.push(x)
      return
    }
  }
  for (let i = 0, i_finish = a.length; i < i_finish; ++i) {
    addIfNew(a[i])
  }
  for (let i$1 = 0, i_finish$1 = b.length; i$1 < i_finish$1; ++i$1) {
    addIfNew(b[i$1])
  }
  return result
},
  { op: 'unionWith' },
)

export const intersectionBy: {
  <A>(a: readonly A[], b: readonly A[], f: (a: A) => string): A[]
  <A>(b: readonly A[], f: (a: A) => string): (a: readonly A[]) => A[]
} = dual(3, (a: any, b: any, f: any) => {
  let setB = new Set()
  for (let i = 0, i_finish = b.length; i < i_finish; ++i) {
    setB.add(f(b[i]))
  }
  let seen = new Set()
  let result = []
  for (let i$1 = 0, i_finish$1 = a.length; i$1 < i_finish$1; ++i$1) {
    let x = a[i$1]
    let k = f(x)
    if (setB.has(k) && !seen.has(k)) {
      seen.add(k)
      result.push(x)
    }
  }
  return result
},
  { op: 'intersectionBy' },
)

export const differenceBy: {
  <A>(a: readonly A[], b: readonly A[], f: (a: A) => string): A[]
  <A>(b: readonly A[], f: (a: A) => string): (a: readonly A[]) => A[]
} = dual(3, (a: any, b: any, f: any) => {
  let setB = new Set()
  for (let i = 0, i_finish = b.length; i < i_finish; ++i) {
    setB.add(f(b[i]))
  }
  let seen = new Set()
  let result = []
  for (let i$1 = 0, i_finish$1 = a.length; i$1 < i_finish$1; ++i$1) {
    let x = a[i$1]
    let k = f(x)
    if (!setB.has(k) && !seen.has(k)) {
      seen.add(k)
      result.push(x)
    }
  }
  return result
},
  { op: 'differenceBy' },
)

export const differenceWith: {
  <A>(a: readonly A[], b: readonly A[], eq: (a: A, b: A) => boolean): A[]
  <A>(b: readonly A[], eq: (a: A, b: A) => boolean): (a: readonly A[]) => A[]
} = dual(3, (a: any, b: any, eq: any) => {
  let result = []
  for (let i = 0, i_finish = a.length; i < i_finish; ++i) {
    let x = a[i]
    let found = false
    let j = 0
    while (j < b.length && !found) {
      if (eq(x, b[j])) {
        found = true
      }
      j = (j + 1) | 0
    }
    if (!found) {
      result.push(x)
    }
  }
  return result
},
  { op: 'differenceWith' },
)

export const symmetricDifferenceBy: {
  <A>(a: readonly A[], b: readonly A[], f: (a: A) => string): A[]
  <A>(b: readonly A[], f: (a: A) => string): (a: readonly A[]) => A[]
} = dual(3, (a: any, b: any, f: any) => {
  let setA = new Set()
  let setB = new Set()
  for (let i = 0, i_finish = a.length; i < i_finish; ++i) {
    setA.add(f(a[i]))
  }
  for (let i$1 = 0, i_finish$1 = b.length; i$1 < i_finish$1; ++i$1) {
    setB.add(f(b[i$1]))
  }
  let seen = new Set()
  let result = []
  for (let i$2 = 0, i_finish$2 = a.length; i$2 < i_finish$2; ++i$2) {
    let x = a[i$2]
    let k = f(x)
    if (!setB.has(k) && !seen.has(k)) {
      seen.add(k)
      result.push(x)
    }
  }
  for (let i$3 = 0, i_finish$3 = b.length; i$3 < i_finish$3; ++i$3) {
    let x$1 = b[i$3]
    let k$1 = f(x$1)
    if (!setA.has(k$1) && !seen.has(k$1)) {
      seen.add(k$1)
      result.push(x$1)
    }
  }
  return result
},
  { op: 'symmetricDifferenceBy' },
)

export const symmetricDifferenceWith: {
  <A>(a: readonly A[], b: readonly A[], eq: (a: A, b: A) => boolean): A[]
  <A>(b: readonly A[], eq: (a: A, b: A) => boolean): (a: readonly A[]) => A[]
} = dual(3, (a: any, b: any, eq: any) => {
  let result = []
  for (let i = 0, i_finish = a.length; i < i_finish; ++i) {
    let x = a[i]
    let found = false
    let j = 0
    while (j < b.length && !found) {
      if (eq(x, b[j])) {
        found = true
      }
      j = (j + 1) | 0
    }
    if (!found) {
      result.push(x)
    }
  }
  for (let i$1 = 0, i_finish$1 = b.length; i$1 < i_finish$1; ++i$1) {
    let x$1 = b[i$1]
    let found$1 = false
    let j$1 = 0
    while (j$1 < a.length && !found$1) {
      if (eq(x$1, a[j$1])) {
        found$1 = true
      }
      j$1 = (j$1 + 1) | 0
    }
    if (!found$1) {
      result.push(x$1)
    }
  }
  return result
},
  { op: 'symmetricDifferenceWith' },
)

export const sortedIndexBy: {
  <A>(arr: readonly A[], value: A, f: (a: A) => number): number
  <A>(value: A, f: (a: A) => number): (arr: readonly A[]) => number
} = dual(3, (arr: any, value: any, f: any) => {
  let target = f(value)
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    let mid = (((lo + hi) | 0) / 2) | 0
    if (f(arr[mid]) < target) {
      lo = (mid + 1) | 0
    } else {
      hi = mid
    }
  }
  return lo
},
  { op: 'sortedIndexBy' },
)

export const sortedIndexWith: {
  <A>(arr: readonly A[], pred: (a: A) => boolean): number
  <A>(pred: (a: A) => boolean): (arr: readonly A[]) => number
} = dual(2, (arr: any, pred: any) => {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    let mid = (((lo + hi) | 0) / 2) | 0
    if (pred(arr[mid])) {
      hi = mid
    } else {
      lo = (mid + 1) | 0
    }
  }
  return lo
},
  { op: 'sortedIndexWith' },
)

export const sortedLastIndexBy: {
  <A>(arr: readonly A[], value: A, f: (a: A) => number): number
  <A>(value: A, f: (a: A) => number): (arr: readonly A[]) => number
} = dual(3, (arr: any, value: any, f: any) => {
  let target = f(value)
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    let mid = (((lo + hi) | 0) / 2) | 0
    if (f(arr[mid]) <= target) {
      lo = (mid + 1) | 0
    } else {
      hi = mid
    }
  }
  return lo
},
  { op: 'sortedLastIndexBy' },
)

export const mapAccum: {
  <A, B, C>(arr: readonly A[], f: (acc: B, a: A) => [B, C], init: B): [B, C[]]
  <A, B, C>(f: (acc: B, a: A) => [B, C], init: B): (arr: readonly A[]) => [B, C[]]
} = dual(3, (arr: any, f: any, init: any) => {
  let len = arr.length
  let out = new Array(len)
  let acc = init
  for (let i = 0; i < len; ++i) {
    let match = f(acc, arr[i])
    acc = match[0]
    out[i] = match[1]
  }
  return [acc, out]
},
  { op: 'mapAccum' },
)

export const mapAccumRight: {
  <A, B, C>(arr: readonly A[], f: (acc: B, a: A) => [B, C], init: B): [B, C[]]
  <A, B, C>(f: (acc: B, a: A) => [B, C], init: B): (arr: readonly A[]) => [B, C[]]
} = dual(3, (arr: any, f: any, init: any) => {
  let len = arr.length
  let out = new Array(len)
  let acc = init
  for (let i = 0; i < len; ++i) {
    let j = (((len - 1) | 0) - i) | 0
    let match = f(acc, arr[j])
    acc = match[0]
    out[j] = match[1]
  }
  return [acc, out]
},
  { op: 'mapAccumRight' },
)

// Arity 4
export const reduceBy: {
  <A, B>(arr: readonly A[], keyFn: (a: A) => string, reducer: (acc: B, a: A) => B, init: B): Dict<B>
  <A, B>(
    keyFn: (a: A) => string,
    reducer: (acc: B, a: A) => B,
    init: B,
  ): (arr: readonly A[]) => Dict<B>
} = dual(4, (arr: any, keyFn: any, reducer: any, init: any) => {
  const dict: Record<string, any> = {}
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i]
    const key = keyFn(x)
    const acc = dict[key] !== undefined ? dict[key] : init
    dict[key] = reducer(acc, x)
  }
  return dict
},
  { op: 'reduceBy' },
)

export const reduceWhile: {
  <A, B>(arr: readonly A[], pred: (acc: B, a: A) => boolean, f: (acc: B, a: A) => B, init: B): B
  <A, B>(pred: (acc: B, a: A) => boolean, f: (acc: B, a: A) => B, init: B): (arr: readonly A[]) => B
} = dual(4, (arr: any, pred: any, f: any, init: any) => {
  let len = arr.length
  let acc = init
  let i = 0
  let continue_ = true
  while (i < len && continue_) {
    let x = arr[i]
    if (pred(acc, x)) {
      acc = f(acc, x)
      i = (i + 1) | 0
    } else {
      continue_ = false
    }
  }
  return acc
},
  { op: 'reduceWhile' },
)

export const splice: {
  <A>(arr: readonly A[], start: number, deleteCount: number, items: readonly A[]): A[]
  <A>(start: number, deleteCount: number, items: readonly A[]): (arr: readonly A[]) => A[]
} = dual(4, (arr: any, start: any, deleteCount: any, items: any) => {
  let len = arr.length
  let s = start < 0 ? (((len + start) | 0) > 0 ? (len + start) | 0 : 0) : start < len ? start : len
  let dc = deleteCount < 0 ? 0 : ((s + deleteCount) | 0) > len ? (len - s) | 0 : deleteCount
  let itemsLen = items.length
  let newLen = (((len - dc) | 0) + itemsLen) | 0
  let out = new Array(newLen)
  for (let i = 0; i < s; ++i) {
    out[i] = arr[i]
  }
  for (let i$1 = 0; i$1 < itemsLen; ++i$1) {
    out[(s + i$1) | 0] = items[i$1]
  }
  for (let i$2 = (s + dc) | 0; i$2 < len; ++i$2) {
    out[(((s + itemsLen) | 0) + ((((i$2 - s) | 0) - dc) | 0)) | 0] = arr[i$2]
  }
  return out
},
  { op: 'splice' },
)
