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
// caches and tiering".
import { compile, dispatchAndTrack, planAndLowerFast, toArrayInput, type Runner } from './compile'
import { extractBinding, type StepBinding } from './plan'
import type { ShapeEntry } from './shape-entry'

const _hasOp = (fn: any): boolean => typeof fn._op === 'number' && fn._op > 0

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
let clock = 0

// Front cache: opcode-sequence key -> ShapeEntry, the canonical mutable cell
// for that shape's execution identity (never a bare runner function: a tier
// swap or eviction on the entry must be visible through this cache too, see
// shape-entry.ts). Bounded like the shape-entry registry it sits in front
// of; never holds callbacks (PortableRunner takes bindings per call, see
// lower.ts).
//
// Two keying schemes share the cache: sequences of up to NUM_KEY_MAX_LEN
// steps (pipe's direct run2-run5 arities, i.e. every argc<=6 call) pack the
// opcodes into a single number in a Map<number, ...> -- no string
// allocation on the hot path. Opcodes are small positive integers (see
// opcodes.ts; OP_CODES tops out well under NUM_KEY_BASE), so packing them as
// base-NUM_KEY_BASE digits is collision-free: each digit occupies its own
// place value and is always in [1, NUM_KEY_BASE), so no digit can borrow
// into a neighboring position, and since every packed opcode is >=1 a
// shorter sequence's key can never reach the value range a longer sequence
// occupies (see the opcodes.test.ts range assertion). Longer sequences
// (argc>6 varargs form) fall back to the original comma-joined string key.
const FRONT_CACHE_LIMIT = 256
export const NUM_KEY_BASE = 128
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

function matchesArgs(fns: readonly unknown[], args: ArrayLike<unknown>, argc: number): boolean {
  if (fns.length !== argc - 1) return false
  for (let i = 0; i < fns.length; i++) if (fns[i] !== args[i + 1]) return false
  return true
}

function lookupCache(args: ArrayLike<unknown>, argc: number): CacheEntry | undefined {
  for (let i = 0; i < CACHE_SIZE; i++) {
    const entry = cache[i]
    if (entry && matchesArgs(entry.fns, args, argc)) {
      entry.used = ++clock
      return entry
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
    if (entry.used < oldest) {
      oldest = entry.used
      slot = i
    }
  }
  return slot
}

function storeCacheRunner(fns: readonly unknown[], runner: Runner): void {
  cache[cacheSlot()] = { fns, runner, used: ++clock }
}

function storeCacheTagged(fns: readonly unknown[], entry: ShapeEntry, bindings: readonly StepBinding[]): void {
  cache[cacheSlot()] = { fns, entry, bindings, used: ++clock }
}

// Runs a tagged multi-step pipeline. Identity cache first (zero-alloc hit).
// On identity miss, tries the opcode-keyed front cache: if every step is
// tagged, the opcode sequence alone picks the shape runner, so bindings are
// extracted directly (no buildPlan, no shapeCache lookup). Untagged/opaque
// steps bail to the original compile() path, which still populates the
// identity cache for that call site.
function runTagged(a: unknown, args: ArrayLike<unknown>, argc: number): unknown {
  const cached = lookupCache(args, argc)
  if (cached) {
    if (cached.entry) return dispatchAndTrack(cached.entry, toArrayInput(a), cached.bindings!)
    return cached.runner!(a)
  }

  const len = argc - 1
  const fns = new Array(len)
  const useNumKey = len <= NUM_KEY_MAX_LEN
  let numKey = 0
  let strKey = ''
  let allTagged = true
  for (let i = 0; i < len; i++) {
    const step = args[i + 1]
    fns[i] = step
    if (!allTagged) continue
    const op = (step as any)._op
    if (typeof op !== 'number' || op <= 0) allTagged = false
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
    for (let i = 0; i < len; i++) bound[i] = extractBinding(fns[i] as any)
    bindings = bound
  } else {
    const built = planAndLowerFast(fns)
    entry = built.entry
    bindings = built.bindings
    if (useNumKey) frontCacheSet(frontCacheNum, numKey, entry)
    else frontCacheSet(frontCacheStr, strKey, entry)
  }

  // Reads entry.run at call time on every invocation, never a captured
  // runner: a tier swap or eviction on entry is visible through the identity
  // cache the same way it is through the front caches above (the identity
  // slot stores entry + bindings directly, not a closure over them -- see
  // CacheEntry). Bare pipe is the adaptive promotion path: dispatchAndTrack
  // counts executions and consumed elements against the shared entry and
  // requests generation once a threshold crosses, but only while the entry
  // is still tier 0 -- once promoted, dispatch is a direct call with no
  // bookkeeping overhead.
  storeCacheTagged(fns, entry, bindings)
  return dispatchAndTrack(entry, toArrayInput(a), bindings)
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
export function pipe(
  a?: unknown,
  f1?: any,
  f2?: any,
  f3?: any,
  f4?: any,
  f5?: any,
): unknown {
  const argc = arguments.length
  if (argc <= 1) return a

  if (argc === 2) return f1(a)

  if (argc === 3) {
    if (!_hasOp(f1) && !_hasOp(f2)) return f2(f1(a))
    return runTagged(a, arguments, 3)
  }
  if (argc === 4) {
    if (!_hasOp(f1) && !_hasOp(f2) && !_hasOp(f3)) return f3(f2(f1(a)))
    return runTagged(a, arguments, 4)
  }
  if (argc === 5) {
    if (!_hasOp(f1) && !_hasOp(f2) && !_hasOp(f3) && !_hasOp(f4)) return f4(f3(f2(f1(a))))
    return runTagged(a, arguments, 5)
  }
  if (argc === 6) {
    if (!_hasOp(f1) && !_hasOp(f2) && !_hasOp(f3) && !_hasOp(f4) && !_hasOp(f5))
      return f5(f4(f3(f2(f1(a)))))
    return runTagged(a, arguments, 6)
  }

  // argc > 6: general path, no fixed formals
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
  return runTagged(a, arguments, argc)
}
