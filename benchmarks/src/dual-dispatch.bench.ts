/**
 * Dual-dispatch decision suite. Phase 0 of
 * docs/superpowers/plans/2026-08-24-dual-performance-first.md.
 *
 * Question: if one exported name answers both call shapes (data-first
 * `op(data, ...args)` and curried `op(...args)(data)`), which dispatch shape
 * pays least, per op class? Successor to the deleted
 * prototype-data-last.bench.ts (b23e09c^), inverted: the shipped single-form
 * operators are now the baseline and the dual candidates are on trial.
 *
 * Candidates, each hand-written here exactly as codegen/dual-inline.ts would
 * emit it:
 *
 *   base     - the shipped curried-only operator (A.map, M.add, ...). The
 *              current figures. Cannot appear in data-first rows.
 *   delegate - `if (arguments.length >= 2) return op(rest)(data)`; the
 *              curried branch returns a closure byte-identical to base.
 *              Smallest emission; data-first pays one closure alloc.
 *   inline   - both bodies inlined behind the branch. Biggest emission;
 *              no extra frames on either path.
 *   shared   - dispatch plus one hoisted impl function both branches call.
 *              Middle size; curried application pays an extra frame, so it
 *              can NOT satisfy the plan's invariant 1 and must win row 3
 *              outright to stay in contention.
 *
 * Row kinds per op:
 *   1. hoisted pipe application - the invariant row. Steps hoisted, applied
 *      through root pipe. Must be flat across candidates or the candidate
 *      is dead.
 *   2. construction per call - `op(f)(data)` fresh each iteration; the
 *      factory-branch tax, the thing 71351e4 measured against generic
 *      dual() and that this suite re-measures against bare branches.
 *   3. direct data-first call - the new capability, vs remeda (pays its own
 *      purry dispatch, the competitive bar), ramda, and native.
 *
 * string.slice is the ambiguous-arity case (curried `slice(0, 5)` and
 * data-first `slice(str, 0)` both arrive as 2 args): its candidate
 * dispatches on `typeof a0 === 'string'`, the predicate form Phase 1's
 * ambiguity audit will emit for that whole class.
 *
 * Correctness proven at import time: every candidate agrees with base (and
 * with native) on every sampled op before anything is timed.
 */
import { bench, describe } from 'vite-plus/test'
import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'
import * as M from '@stopcock/fp/math'
import * as O from '@stopcock/fp/object'
import * as S from '@stopcock/fp/string'
import * as Ra from 'ramda'
import * as Re from 'remeda'
import { getData } from './setup'

const SIZES = [100, 10_000] as const

const double = (x: number): number => x * 2
const isOver = (x: number): boolean => x > 0.5

// ---------------------------------------------------------------------------
// Candidates: array streaming (map, filter)
// ---------------------------------------------------------------------------

const mapDelegate = function mapDelegate(a0: any, a1?: any): any {
  if (arguments.length >= 2) return mapDelegate(a1)(a0)
  return function (arr: any) {
    const len = arr.length,
      out = new Array(len)
    for (let i = 0; i < len; i++) out[i] = a0(arr[i])
    return out
  }
}

const mapInline = function mapInline(a0: any, a1?: any): any {
  if (arguments.length >= 2) {
    const len = a0.length,
      out = new Array(len)
    for (let i = 0; i < len; i++) out[i] = a1(a0[i])
    return out
  }
  return function (arr: any) {
    const len = arr.length,
      out = new Array(len)
    for (let i = 0; i < len; i++) out[i] = a0(arr[i])
    return out
  }
}

function mapImpl(arr: any, f: any): any {
  const len = arr.length,
    out = new Array(len)
  for (let i = 0; i < len; i++) out[i] = f(arr[i])
  return out
}
const mapShared = function mapShared(a0: any, a1?: any): any {
  if (arguments.length >= 2) return mapImpl(a0, a1)
  return function (arr: any) {
    return mapImpl(arr, a0)
  }
}

const filterDelegate = function filterDelegate(a0: any, a1?: any): any {
  if (arguments.length >= 2) return filterDelegate(a1)(a0)
  return function (arr: any) {
    const out: any[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const v = arr[i]
      if (a0(v)) out.push(v)
    }
    return out
  }
}

const filterInline = function filterInline(a0: any, a1?: any): any {
  if (arguments.length >= 2) {
    const out: any[] = []
    for (let i = 0, len = a0.length; i < len; i++) {
      const v = a0[i]
      if (a1(v)) out.push(v)
    }
    return out
  }
  return function (arr: any) {
    const out: any[] = []
    for (let i = 0, len = arr.length; i < len; i++) {
      const v = arr[i]
      if (a0(v)) out.push(v)
    }
    return out
  }
}

function filterImpl(arr: any, pred: any): any {
  const out: any[] = []
  for (let i = 0, len = arr.length; i < len; i++) {
    const v = arr[i]
    if (pred(v)) out.push(v)
  }
  return out
}
const filterShared = function filterShared(a0: any, a1?: any): any {
  if (arguments.length >= 2) return filterImpl(a0, a1)
  return function (arr: any) {
    return filterImpl(arr, a0)
  }
}

// ---------------------------------------------------------------------------
// Candidates: array indexed (take)
// ---------------------------------------------------------------------------

const takeDelegate = function takeDelegate(a0: any, a1?: any): any {
  if (arguments.length >= 2) return takeDelegate(a1)(a0)
  return function (arr: any) {
    const len = arr.length
    if (a0 <= 0) return []
    return arr.slice(0, a0 > len ? len : a0)
  }
}

const takeInline = function takeInline(a0: any, a1?: any): any {
  if (arguments.length >= 2) {
    const len = a0.length
    if (a1 <= 0) return []
    return a0.slice(0, a1 > len ? len : a1)
  }
  return function (arr: any) {
    const len = arr.length
    if (a0 <= 0) return []
    return arr.slice(0, a0 > len ? len : a0)
  }
}

function takeImpl(arr: any, n: any): any {
  const len = arr.length
  if (n <= 0) return []
  return arr.slice(0, n > len ? len : n)
}
const takeShared = function takeShared(a0: any, a1?: any): any {
  if (arguments.length >= 2) return takeImpl(a0, a1)
  return function (arr: any) {
    return takeImpl(arr, a0)
  }
}

// ---------------------------------------------------------------------------
// Candidates: scalar (add)
// ---------------------------------------------------------------------------

const addDelegate = function addDelegate(a0: any, a1?: any): any {
  if (arguments.length >= 2) return addDelegate(a1)(a0)
  return function (a: any) {
    return a + a0
  }
}

const addInline = function addInline(a0: any, a1?: any): any {
  if (arguments.length >= 2) return a0 + a1
  return function (a: any) {
    return a + a0
  }
}

function addImpl(a: any, b: any): any {
  return a + b
}
const addShared = function addShared(a0: any, a1?: any): any {
  if (arguments.length >= 2) return addImpl(a0, a1)
  return function (a: any) {
    return addImpl(a, a0)
  }
}

// ---------------------------------------------------------------------------
// Candidates: object (pick)
// ---------------------------------------------------------------------------
// One simple shared body across candidates (plain own-key copy). The shipped
// O.pick carries null-proto/define machinery, so its construction row is a
// reference point, not a same-body baseline; candidate-vs-candidate is the
// comparison that decides anything here.

const pickDelegate = function pickDelegate(a0: any, a1?: any): any {
  if (arguments.length >= 2) return pickDelegate(a1)(a0)
  return function (value: any) {
    const out: any = {}
    for (let i = 0; i < a0.length; i++) {
      const key = a0[i]
      if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = value[key]
    }
    return out
  }
}

const pickInline = function pickInline(a0: any, a1?: any): any {
  if (arguments.length >= 2) {
    const out: any = {}
    for (let i = 0; i < a1.length; i++) {
      const key = a1[i]
      if (Object.prototype.hasOwnProperty.call(a0, key)) out[key] = a0[key]
    }
    return out
  }
  return function (value: any) {
    const out: any = {}
    for (let i = 0; i < a0.length; i++) {
      const key = a0[i]
      if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = value[key]
    }
    return out
  }
}

function pickImpl(value: any, keys: any): any {
  const out: any = {}
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = value[key]
  }
  return out
}
const pickShared = function pickShared(a0: any, a1?: any): any {
  if (arguments.length >= 2) return pickImpl(a0, a1)
  return function (value: any) {
    return pickImpl(value, a0)
  }
}

// ---------------------------------------------------------------------------
// Candidate: string slice, the ambiguous-arity class (predicate dispatch)
// ---------------------------------------------------------------------------

const slicePredicate = function slicePredicate(a0: any, a1?: any, a2?: any): any {
  if (typeof a0 === 'string') return a0.slice(a1, a2)
  return function (value: string) {
    return value.slice(a0, a1)
  }
}

// ---------------------------------------------------------------------------
// Import-time correctness: every candidate agrees with base before timing
// ---------------------------------------------------------------------------

const check = getData<number>('numbers', 100)
const checkObj = { id: 1, name: 'x', active: true, extra: 9 }
const PICK_KEYS = ['id', 'name'] as const
const CHECK_STR = 'stopcock-dual-dispatch'

function assertSame(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`dual-dispatch.bench: ${label} mismatch`)
  }
}

{
  const expected = A.map(double)(check)
  for (const [label, op] of [
    ['map delegate', mapDelegate],
    ['map inline', mapInline],
    ['map shared', mapShared],
  ] as const) {
    assertSame(`${label} curried`, op(double)(check), expected)
    assertSame(`${label} data-first`, op(check, double), expected)
  }
  const expectedFilter = A.filter(isOver)(check)
  for (const [label, op] of [
    ['filter delegate', filterDelegate],
    ['filter inline', filterInline],
    ['filter shared', filterShared],
  ] as const) {
    assertSame(`${label} curried`, op(isOver)(check), expectedFilter)
    assertSame(`${label} data-first`, op(check, isOver), expectedFilter)
  }
  const expectedTake = A.take(50)(check)
  for (const [label, op] of [
    ['take delegate', takeDelegate],
    ['take inline', takeInline],
    ['take shared', takeShared],
  ] as const) {
    assertSame(`${label} curried`, op(50)(check), expectedTake)
    assertSame(`${label} data-first`, op(check, 50), expectedTake)
  }
  const expectedAdd = M.add(3)(5)
  for (const [label, op] of [
    ['add delegate', addDelegate],
    ['add inline', addInline],
    ['add shared', addShared],
  ] as const) {
    assertSame(`${label} curried`, op(3)(5), expectedAdd)
    assertSame(`${label} data-first`, op(5, 3), expectedAdd)
  }
  const expectedPick = { id: 1, name: 'x' }
  for (const [label, op] of [
    ['pick delegate', pickDelegate],
    ['pick inline', pickInline],
    ['pick shared', pickShared],
  ] as const) {
    assertSame(`${label} curried`, op(PICK_KEYS)(checkObj), expectedPick)
    assertSame(`${label} data-first`, op(checkObj, PICK_KEYS), expectedPick)
  }
  assertSame('slice predicate curried', slicePredicate(2, 8)(CHECK_STR), S.slice(2, 8)(CHECK_STR))
  assertSame('slice predicate data-first', slicePredicate(CHECK_STR, 2, 8), CHECK_STR.slice(2, 8))
  assertSame('slice predicate data-first open end', slicePredicate(CHECK_STR, 2), CHECK_STR.slice(2))
}

// ---------------------------------------------------------------------------
// 1. Hoisted pipe application (the invariant row)
// ---------------------------------------------------------------------------

const hBaseMap = A.map(double)
const hBaseFilter = A.filter(isOver)
const hDelegateMap = mapDelegate(double)
const hDelegateFilter = filterDelegate(isOver)
const hInlineMap = mapInline(double)
const hInlineFilter = filterInline(isOver)
const hSharedMap = mapShared(double)
const hSharedFilter = filterShared(isOver)

describe.each(SIZES)('1. hoisted pipe: map->filter — n=%i', (n) => {
  const data = getData<number>('numbers', n)

  bench('base (shipped single-form)', () => pipe(data, hBaseMap, hBaseFilter))
  bench('delegate', () => pipe(data, hDelegateMap, hDelegateFilter))
  bench('inline', () => pipe(data, hInlineMap, hInlineFilter))
  bench('shared', () => pipe(data, hSharedMap, hSharedFilter))
})

// Scalar ops are the one class whose curried closure is applied per element
// in user loops, so shared's extra frame shows up here or nowhere.
const hAddBase = M.add(3)
const hAddDelegate = addDelegate(3)
const hAddInline = addInline(3)
const hAddShared = addShared(3)

describe('1b. hoisted curried application: add(3) applied per call', () => {
  bench('base (shipped single-form)', () => hAddBase(5))
  bench('delegate', () => hAddDelegate(5))
  bench('inline', () => hAddInline(5))
  bench('shared', () => hAddShared(5))
})

// ---------------------------------------------------------------------------
// 2. Construction per call (the factory-branch tax)
// ---------------------------------------------------------------------------

describe.each(SIZES)('2. construction per call: map(f)(xs) — n=%i', (n) => {
  const data = getData<number>('numbers', n)

  bench('base (shipped single-form)', () => A.map(double)(data))
  bench('delegate', () => mapDelegate(double)(data))
  bench('inline', () => mapInline(double)(data))
  bench('shared', () => mapShared(double)(data))
})

describe('2. construction per call: small ops — n=10000', () => {
  const data = getData<number>('numbers', 10_000)
  const obj = checkObj

  bench('take: base', () => A.take(50)(data))
  bench('take: delegate', () => takeDelegate(50)(data))
  bench('take: inline', () => takeInline(50)(data))
  bench('take: shared', () => takeShared(50)(data))

  bench('add: base M.add(3)(5)', () => M.add(3)(5))
  bench('add: delegate', () => addDelegate(3)(5))
  bench('add: inline', () => addInline(3)(5))
  bench('add: shared', () => addShared(3)(5))

  bench('pick: base O.pick (different body, reference)', () => O.pick(PICK_KEYS)(obj))
  bench('pick: delegate', () => pickDelegate(PICK_KEYS)(obj))
  bench('pick: inline', () => pickInline(PICK_KEYS)(obj))
  bench('pick: shared', () => pickShared(PICK_KEYS)(obj))

  bench('slice: base S.slice(2,8)(s)', () => S.slice(2, 8)(CHECK_STR))
  bench('slice: predicate', () => slicePredicate(2, 8)(CHECK_STR))
})

// ---------------------------------------------------------------------------
// 3. Direct data-first call (the new capability, vs the field)
// ---------------------------------------------------------------------------

describe.each(SIZES)('3. data-first: map(xs, f) — n=%i', (n) => {
  const data = getData<number>('numbers', n)

  bench('delegate', () => mapDelegate(data, double))
  bench('inline', () => mapInline(data, double))
  bench('shared', () => mapShared(data, double))
  bench('remeda Re.map(xs, f)', () => Re.map(data, double))
  bench('ramda Ra.map(f, xs)', () => Ra.map(double, data))
  bench('native xs.map(f)', () => data.map(double))
})

describe('3. data-first: small ops — n=10000', () => {
  const data = getData<number>('numbers', 10_000)
  const obj = checkObj

  bench('take: delegate', () => takeDelegate(data, 50))
  bench('take: inline', () => takeInline(data, 50))
  bench('take: shared', () => takeShared(data, 50))
  bench('take: remeda Re.take(xs, 50)', () => Re.take(data, 50))

  bench('add: delegate', () => addDelegate(5, 3))
  bench('add: inline', () => addInline(5, 3))
  bench('add: shared', () => addShared(5, 3))
  bench('add: remeda Re.add(5, 3)', () => Re.add(5, 3))
  bench('add: ramda Ra.add(3, 5)', () => Ra.add(3, 5))

  bench('pick: delegate', () => pickDelegate(obj, PICK_KEYS))
  bench('pick: inline', () => pickInline(obj, PICK_KEYS))
  bench('pick: shared', () => pickShared(obj, PICK_KEYS))
  bench('pick: remeda Re.pick(obj, keys)', () => Re.pick(obj, PICK_KEYS as any))

  bench('slice: predicate slicePredicate(s, 2, 8)', () => slicePredicate(CHECK_STR, 2, 8))
  bench('slice: native s.slice(2, 8)', () => CHECK_STR.slice(2, 8))
})
