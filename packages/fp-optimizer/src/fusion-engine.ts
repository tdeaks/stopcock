// pipe() routes tagged pipelines through the same buildPlan/lowerShape
// machinery and shape cache as compile(). Direct arity dispatch (2-6 args)
// avoids allocating a steps array. Two caches sit in front of compile():
// a 4-entry identity cache keyed on exact callback references (zero-alloc
// hit: skips straight to a bound runner), and, behind that, a front cache
// keyed on the opcode sequence alone. The opcode sequence determines the
// Plan shape (segments derive only from each op's registry metadata, never
// from bound values), so an opcode-key hit reaches the shape runner without
// paying buildPlan/planShapeKey/shapeCache-lookup on every call -- this is
// what fixes fresh-closure-per-call pipelines (e.g. inline arrows in a
// loop), which used to miss the identity cache every time and pay full
// compile() per call. See docs/superpowers/plans/
// 2026-07-21-stopcock-fp-absolute-performance-implementation.md, "Runtime
// caches".
import { compile, dispatchAndTrack, planAndLowerFast, type Runner } from './compile'
import { vetOperator, type VettedOperatorV1 } from '@stopcock/fp/abi'
import { extractBinding, type StepBinding } from '@stopcock/fp/abi'
import type { ShapeEntry } from './shape-entry'

/**
 * Authority comes from the private provenance table, never from a public
 * `_op` field. A forged tag makes a step opaque, not fused.
 */
const _entry = vetOperator
const _opOf = (fn: unknown): number => vetOperator(fn)?.op ?? 0
const _hasOp = (fn: unknown): boolean => _opOf(fn) > 0

/**
 * Cheap negative filter for the untagged fast path.
 *
 * Generated code always writes the public `_op` alongside registering the
 * operator, so a trusted operator always has one. A function without `_op`
 * therefore cannot be trusted, and a plain composition can skip the hot-entry
 * check and two WeakMap lookups that used to run before it.
 *
 * This is a fusion decision, not an authority decision: a forged `_op` still
 * has to pass the private table before anything fuses, and deleting `_op` from
 * a trusted operator makes it run generically rather than fused, which changes
 * speed and not results.
 */
const _mayBeTagged = (fn: unknown): boolean =>
  (fn as { _op?: unknown } | undefined)?._op !== undefined

// Two shapes share this slot type: a plain Runner (untagged/opaque fallback,
// from compile()) or a (ShapeEntry, bindings) pair (tagged fast path). The
// latter avoids allocating a wrapper closure per store -- on churny call
// sites (fresh closures per call, so this slot is written far more often
// than it's read) that closure would almost always be thrown away unread.
interface CacheEntry {
  readonly fns: readonly unknown[]
  readonly runner?: Runner
  readonly entry?: ShapeEntry
  readonly bindings?: readonly StepBinding[]
  used: number
}

const CACHE_SIZE = 4
const cache: Array<CacheEntry | undefined> = [undefined, undefined, undefined, undefined]
// Direct reference to the most recently used identity. `cacheSlot()` never
// evicts this entry while it is hot, so this does not retain a fifth callback
// set beyond the four-entry cache bound.
let hotEntry: CacheEntry | undefined
let clock = 0

// Front cache: opcode-sequence key -> ShapeEntry, the canonical portable
// runner cell for that shape. It never holds callbacks: PortableRunner takes
// bindings per call (see lower.ts).
//
// Two keying schemes share the cache: sequences of up to NUM_KEY_MAX_LEN
// steps (pipe's direct run2-run5 arities, i.e. every argc<=6 call) pack the
// opcodes into a single number in a Map<number, ...> -- no string
// allocation on the hot path. Opcodes are small positive integers (see
// opcodes.ts; OP_CODES tops out under NUM_KEY_BASE), so packing them as
// base-NUM_KEY_BASE digits is collision-free: each digit occupies its own
// place value and is always in [1, NUM_KEY_BASE), so no digit can borrow
// into a neighboring position, and since every packed opcode is >=1 a
// shorter sequence's key can never reach the value range a longer sequence
// occupies (see the opcodes.test.ts range assertion). Longer sequences
// (argc>6 varargs form) fall back to the original comma-joined string key.
const FRONT_CACHE_LIMIT = 256
export const NUM_KEY_BASE = 256
export const NUM_KEY_MAX_LEN = 5
const frontCacheNum = new Map<number, ShapeEntry>()
const frontCacheStr = new Map<string, ShapeEntry>()

function frontCacheSet<K>(cache: Map<K, ShapeEntry>, key: K, entry: ShapeEntry): void {
  cache.set(key, entry)
  if (cache.size > FRONT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

/**
 * Test-only cache reset. Both caches here are keyed independently of the
 * shape-entry map, so clearing that alone leaves a shape warm and makes an
 * observation of cold selection impossible.
 */
export function __resetFusionCaches(): void {
  frontCacheNum.clear()
  frontCacheStr.clear()
  for (let i = 0; i < CACHE_SIZE; i++) cache[i] = undefined as unknown as CacheEntry
  hotEntry = undefined
}

function matchesArgs(fns: readonly unknown[], args: ArrayLike<unknown>, argc: number): boolean {
  if (fns.length !== argc - 1) return false
  for (let i = 0; i < fns.length; i++) if (fns[i] !== args[i + 1]) return false
  return true
}

function touch(entry: CacheEntry): CacheEntry {
  entry.used = ++clock
  return entry
}

function lookupCache(
  args: ArrayLike<unknown>,
  argc: number,
  hotAlreadyChecked = false,
): CacheEntry | undefined {
  for (let i = 0; i < CACHE_SIZE; i++) {
    const entry = cache[i]
    if (hotAlreadyChecked && entry === hotEntry) continue
    if (entry && matchesArgs(entry.fns, args, argc)) {
      hotEntry = entry
      return touch(entry)
    }
  }
  return undefined
}

function cacheSlot(): number {
  let slot = 0
  let oldest = Infinity
  for (let i = 0; i < CACHE_SIZE; i++) {
    const entry = cache[i]
    if (!entry) return i
    if (entry === hotEntry) continue
    if (entry.used < oldest) {
      oldest = entry.used
      slot = i
    }
  }
  return slot
}

function storeCacheRunner(fns: readonly unknown[], runner: Runner): void {
  const slot = cacheSlot()
  const stored = { fns, runner, used: ++clock }
  cache[slot] = stored
  hotEntry = stored
}

function storeCacheTagged(
  fns: readonly unknown[],
  entry: ShapeEntry,
  bindings: readonly StepBinding[],
): void {
  const slot = cacheSlot()
  const stored = { fns, entry, bindings, used: ++clock }
  cache[slot] = stored
  hotEntry = stored
}

function runCached(cached: CacheEntry, input: unknown): unknown {
  if (cached.entry) return dispatchAndTrack(cached.entry, input, cached.bindings!)
  return cached.runner!(input)
}

/** Fixed two-step miss path: avoids the generic argument/opcode loops for the
 * most common inline pipeline arity while preserving the same bounded caches. */
function runTagged2(a: unknown, f1: any, f2: any): unknown {
  const fns = [f1, f2]
  const e1 = _entry(f1)
  const e2 = _entry(f2)
  const op1 = e1 === undefined ? 0 : e1.op
  const op2 = e2 === undefined ? 0 : e2.op
  if (
    !Number.isSafeInteger(op1) ||
    op1 <= 0 ||
    op1 >= NUM_KEY_BASE ||
    !Number.isSafeInteger(op2) ||
    op2 <= 0 ||
    op2 >= NUM_KEY_BASE
  ) {
    const runner = compile(f1, f2)
    storeCacheRunner(fns, runner)
    return runner(a)
  }

  const numKey = op1 * NUM_KEY_BASE + op2
  let entry = frontCacheNum.get(numKey)
  let bindings: readonly StepBinding[]
  if (entry) {
    bindings = [extractBinding(e1!), extractBinding(e2!)]
  } else {
    const built = planAndLowerFast(fns)
    entry = built.entry
    bindings = built.bindings
    frontCacheSet(frontCacheNum, numKey, entry)
  }

  storeCacheTagged(fns, entry, bindings)
  return dispatchAndTrack(entry, a, bindings)
}

function runTagged3(a: unknown, f1: any, f2: any, f3: any): unknown {
  const fns = [f1, f2, f3]
  const e1 = _entry(f1)
  const e2 = _entry(f2)
  const op1 = e1 === undefined ? 0 : e1.op
  const op2 = e2 === undefined ? 0 : e2.op
  const e3 = _entry(f3)
  const op3 = e3 === undefined ? 0 : e3.op
  if (
    !Number.isSafeInteger(op1) ||
    op1 <= 0 ||
    op1 >= NUM_KEY_BASE ||
    !Number.isSafeInteger(op2) ||
    op2 <= 0 ||
    op2 >= NUM_KEY_BASE ||
    !Number.isSafeInteger(op3) ||
    op3 <= 0 ||
    op3 >= NUM_KEY_BASE
  ) {
    const runner = compile(f1, f2, f3)
    storeCacheRunner(fns, runner)
    return runner(a)
  }

  const numKey = (op1 * NUM_KEY_BASE + op2) * NUM_KEY_BASE + op3
  let entry = frontCacheNum.get(numKey)
  let bindings: readonly StepBinding[]
  if (entry) {
    bindings = [extractBinding(e1!), extractBinding(e2!), extractBinding(e3!)]
  } else {
    const built = planAndLowerFast(fns)
    entry = built.entry
    bindings = built.bindings
    frontCacheSet(frontCacheNum, numKey, entry)
  }

  storeCacheTagged(fns, entry, bindings)
  return dispatchAndTrack(entry, a, bindings)
}

function runTagged4(a: unknown, f1: any, f2: any, f3: any, f4: any): unknown {
  const fns = [f1, f2, f3, f4]
  const e1 = _entry(f1)
  const e2 = _entry(f2)
  const op1 = e1 === undefined ? 0 : e1.op
  const op2 = e2 === undefined ? 0 : e2.op
  const e3 = _entry(f3)
  const e4 = _entry(f4)
  const op3 = e3 === undefined ? 0 : e3.op
  const op4 = e4 === undefined ? 0 : e4.op
  if (
    !Number.isSafeInteger(op1) ||
    op1 <= 0 ||
    op1 >= NUM_KEY_BASE ||
    !Number.isSafeInteger(op2) ||
    op2 <= 0 ||
    op2 >= NUM_KEY_BASE ||
    !Number.isSafeInteger(op3) ||
    op3 <= 0 ||
    op3 >= NUM_KEY_BASE ||
    !Number.isSafeInteger(op4) ||
    op4 <= 0 ||
    op4 >= NUM_KEY_BASE
  ) {
    const runner = compile(f1, f2, f3, f4)
    storeCacheRunner(fns, runner)
    return runner(a)
  }

  const numKey = ((op1 * NUM_KEY_BASE + op2) * NUM_KEY_BASE + op3) * NUM_KEY_BASE + op4
  let entry = frontCacheNum.get(numKey)
  let bindings: readonly StepBinding[]
  if (entry) {
    bindings = [extractBinding(e1!), extractBinding(e2!), extractBinding(e3!), extractBinding(e4!)]
  } else {
    const built = planAndLowerFast(fns)
    entry = built.entry
    bindings = built.bindings
    frontCacheSet(frontCacheNum, numKey, entry)
  }

  storeCacheTagged(fns, entry, bindings)
  return dispatchAndTrack(entry, a, bindings)
}

function runTagged5(a: unknown, f1: any, f2: any, f3: any, f4: any, f5: any): unknown {
  const fns = [f1, f2, f3, f4, f5]
  const e1 = _entry(f1)
  const e2 = _entry(f2)
  const op1 = e1 === undefined ? 0 : e1.op
  const op2 = e2 === undefined ? 0 : e2.op
  const e3 = _entry(f3)
  const e4 = _entry(f4)
  const e5 = _entry(f5)
  const op3 = e3 === undefined ? 0 : e3.op
  const op4 = e4 === undefined ? 0 : e4.op
  const op5 = e5 === undefined ? 0 : e5.op
  if (
    !Number.isSafeInteger(op1) ||
    op1 <= 0 ||
    op1 >= NUM_KEY_BASE ||
    !Number.isSafeInteger(op2) ||
    op2 <= 0 ||
    op2 >= NUM_KEY_BASE ||
    !Number.isSafeInteger(op3) ||
    op3 <= 0 ||
    op3 >= NUM_KEY_BASE ||
    !Number.isSafeInteger(op4) ||
    op4 <= 0 ||
    op4 >= NUM_KEY_BASE ||
    !Number.isSafeInteger(op5) ||
    op5 <= 0 ||
    op5 >= NUM_KEY_BASE
  ) {
    const runner = compile(f1, f2, f3, f4, f5)
    storeCacheRunner(fns, runner)
    return runner(a)
  }

  const numKey =
    (((op1 * NUM_KEY_BASE + op2) * NUM_KEY_BASE + op3) * NUM_KEY_BASE + op4) * NUM_KEY_BASE + op5
  let entry = frontCacheNum.get(numKey)
  let bindings: readonly StepBinding[]
  if (entry) {
    bindings = [
      extractBinding(e1!),
      extractBinding(e2!),
      extractBinding(e3!),
      extractBinding(e4!),
      extractBinding(f5),
    ]
  } else {
    const built = planAndLowerFast(fns)
    entry = built.entry
    bindings = built.bindings
    frontCacheSet(frontCacheNum, numKey, entry)
  }

  storeCacheTagged(fns, entry, bindings)
  return dispatchAndTrack(entry, a, bindings)
}

// Runs a tagged multi-step pipeline. Identity cache first (zero-alloc hit).
// On identity miss, tries the opcode-keyed front cache: if every step is
// tagged, the opcode sequence alone picks the shape runner, so bindings are
// extracted directly (no buildPlan, no shapeCache lookup). Untagged/opaque
// steps bail to the original compile() path, which still populates the
// identity cache for that call site.
function runTagged(
  a: unknown,
  args: ArrayLike<unknown>,
  argc: number,
  hotAlreadyChecked = false,
): unknown {
  const cached = lookupCache(args, argc, hotAlreadyChecked)
  if (cached) return runCached(cached, a)

  const len = argc - 1
  const fns = new Array(len)
  const useNumKey = len <= NUM_KEY_MAX_LEN
  let numKey = 0
  let strKey = ''
  let allTagged = true
  const entries: Array<VettedOperatorV1 | undefined> = new Array(len)
  for (let i = 0; i < len; i++) {
    const step = args[i + 1]
    fns[i] = step
    if (!allTagged) continue
    const entry = _entry(step)
    entries[i] = entry
    const op = entry === undefined ? 0 : entry.op
    if (!Number.isSafeInteger(op) || op <= 0) allTagged = false
    else if (useNumKey && op >= NUM_KEY_BASE) allTagged = false
    else if (useNumKey) {
      numKey = numKey * NUM_KEY_BASE + op
    } else {
      strKey += op
      strKey += ','
    }
  }

  if (!allTagged) {
    const runner = compile(...fns)
    storeCacheRunner(fns, runner)
    return runner(a)
  }

  let entry: ShapeEntry
  let bindings: readonly StepBinding[]
  const cachedEntry = useNumKey ? frontCacheNum.get(numKey) : frontCacheStr.get(strKey)
  if (cachedEntry) {
    entry = cachedEntry
    const bound = new Array(len)
    for (let i = 0; i < len; i++) bound[i] = extractBinding(entries[i]!)
    bindings = bound
  } else {
    const built = planAndLowerFast(fns)
    entry = built.entry
    bindings = built.bindings
    if (useNumKey) frontCacheSet(frontCacheNum, numKey, entry)
    else frontCacheSet(frontCacheStr, strKey, entry)
  }

  // Read entry.run at call time. The identity slot stores entry + bindings
  // directly, avoiding a wrapper allocation while keeping callback bindings
  // out of the shared shape cache.
  storeCacheTagged(fns, entry, bindings)
  return dispatchAndTrack(entry, a, bindings)
}

export function pipe<A, B>(a: A, f1: (a: A) => B): B
export function pipe<A, B, C>(a: A, f1: (a: A) => B, f2: (b: B) => C): C
export function pipe<A, B, C, D>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): D
export function pipe<A, B, C, D, E>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
): E
export function pipe<A, B, C, D, E, F>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
): F
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
): G
export function pipe<A, B, C, D, E, F, G, H>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
): H
export function pipe<A, B, C, D, E, F, G, H, I>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
): I
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
): J
export function pipe<A, B, C, D, E, F, G, H, I, J, K>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
): K
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
  f11: (k: K) => L,
): L
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
  f11: (k: K) => L,
  f12: (l: L) => M,
): M
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
  f11: (k: K) => L,
  f12: (l: L) => M,
  f13: (m: M) => N,
): N
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
  f11: (k: K) => L,
  f12: (l: L) => M,
  f13: (m: M) => N,
  f14: (n: N) => O,
): O
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
  f11: (k: K) => L,
  f12: (l: L) => M,
  f13: (m: M) => N,
  f14: (n: N) => O,
  f15: (o: O) => P,
): P
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
  f11: (k: K) => L,
  f12: (l: L) => M,
  f13: (m: M) => N,
  f14: (n: N) => O,
  f15: (o: O) => P,
  f16: (p: P) => Q,
): Q
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
  f11: (k: K) => L,
  f12: (l: L) => M,
  f13: (m: M) => N,
  f14: (n: N) => O,
  f15: (o: O) => P,
  f16: (p: P) => Q,
  f17: (q: Q) => R,
): R
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
  f11: (k: K) => L,
  f12: (l: L) => M,
  f13: (m: M) => N,
  f14: (n: N) => O,
  f15: (o: O) => P,
  f16: (p: P) => Q,
  f17: (q: Q) => R,
  f18: (r: R) => S,
): S
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
  f11: (k: K) => L,
  f12: (l: L) => M,
  f13: (m: M) => N,
  f14: (n: N) => O,
  f15: (o: O) => P,
  f16: (p: P) => Q,
  f17: (q: Q) => R,
  f18: (r: R) => S,
  f19: (s: S) => T,
): T
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U>(
  a: A,
  f1: (a: A) => B,
  f2: (b: B) => C,
  f3: (c: C) => D,
  f4: (d: D) => E,
  f5: (e: E) => F,
  f6: (f: F) => G,
  f7: (g: G) => H,
  f8: (h: H) => I,
  f9: (i: I) => J,
  f10: (j: J) => K,
  f11: (k: K) => L,
  f12: (l: L) => M,
  f13: (m: M) => N,
  f14: (n: N) => O,
  f15: (o: O) => P,
  f16: (p: P) => Q,
  f17: (q: Q) => R,
  f18: (r: R) => S,
  f19: (s: S) => T,
  f20: (t: T) => U,
): U
export function pipe(a?: unknown, f1?: any, f2?: any, f3?: any, f4?: any, f5?: any): unknown {
  const argc = arguments.length
  if (argc <= 1) return a

  if (argc === 2) return f1(a)

  if (argc === 3) {
    if (!_mayBeTagged(f1) && !_mayBeTagged(f2)) return f2(f1(a))
    const cached = hotEntry
    const cachedFns = cached?.fns
    if (cached && cachedFns?.length === 2 && cachedFns[0] === f1 && cachedFns[1] === f2) {
      if (cached.entry) {
        cached.entry.execCount++
        return cached.entry.run(a, cached.bindings!)
      }
      return cached.runner!(a)
    }
    if (!_hasOp(f1) && !_hasOp(f2)) return f2(f1(a))
    return runTagged2(a, f1, f2)
  }
  if (argc === 4) {
    if (!_mayBeTagged(f1) && !_mayBeTagged(f2) && !_mayBeTagged(f3)) return f3(f2(f1(a)))
    const cached = hotEntry
    const cachedFns = cached?.fns
    if (
      cached &&
      cachedFns?.length === 3 &&
      cachedFns[0] === f1 &&
      cachedFns[1] === f2 &&
      cachedFns[2] === f3
    ) {
      if (cached.entry) {
        cached.entry.execCount++
        return cached.entry.run(a, cached.bindings!)
      }
      return cached.runner!(a)
    }
    if (!_hasOp(f1) && !_hasOp(f2) && !_hasOp(f3)) return f3(f2(f1(a)))
    return runTagged3(a, f1, f2, f3)
  }
  if (argc === 5) {
    if (!_mayBeTagged(f1) && !_mayBeTagged(f2) && !_mayBeTagged(f3) && !_mayBeTagged(f4)) {
      return f4(f3(f2(f1(a))))
    }
    const cached = hotEntry
    const cachedFns = cached?.fns
    if (
      cached &&
      cachedFns?.length === 4 &&
      cachedFns[0] === f1 &&
      cachedFns[1] === f2 &&
      cachedFns[2] === f3 &&
      cachedFns[3] === f4
    ) {
      if (cached.entry) {
        cached.entry.execCount++
        return cached.entry.run(a, cached.bindings!)
      }
      return cached.runner!(a)
    }
    if (!_hasOp(f1) && !_hasOp(f2) && !_hasOp(f3) && !_hasOp(f4)) return f4(f3(f2(f1(a))))
    return runTagged4(a, f1, f2, f3, f4)
  }
  if (argc === 6) {
    if (
      !_mayBeTagged(f1) &&
      !_mayBeTagged(f2) &&
      !_mayBeTagged(f3) &&
      !_mayBeTagged(f4) &&
      !_mayBeTagged(f5)
    ) {
      return f5(f4(f3(f2(f1(a)))))
    }
    const cached = hotEntry
    const cachedFns = cached?.fns
    if (
      cached &&
      cachedFns?.length === 5 &&
      cachedFns[0] === f1 &&
      cachedFns[1] === f2 &&
      cachedFns[2] === f3 &&
      cachedFns[3] === f4 &&
      cachedFns[4] === f5
    ) {
      if (cached.entry) {
        cached.entry.execCount++
        return cached.entry.run(a, cached.bindings!)
      }
      return cached.runner!(a)
    }
    if (!_hasOp(f1) && !_hasOp(f2) && !_hasOp(f3) && !_hasOp(f4) && !_hasOp(f5))
      return f5(f4(f3(f2(f1(a)))))
    return runTagged5(a, f1, f2, f3, f4, f5)
  }

  // argc > 6: general path, no fixed formals
  const cached = hotEntry
  if (cached && matchesArgs(cached.fns, arguments, argc)) {
    if (cached.entry) {
      cached.entry.execCount++
      return cached.entry.run(a, cached.bindings!)
    }
    return cached.runner!(a)
  }
  let anyTagged = false
  for (let i = 1; i < argc; i++) {
    if (_hasOp(arguments[i])) {
      anyTagged = true
      break
    }
  }
  if (!anyTagged) {
    let r: any = a
    for (let i = 1; i < argc; i++) r = arguments[i](r)
    return r
  }
  return runTagged(a, arguments, argc, true)
}
