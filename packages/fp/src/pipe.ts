import { fuse, fuseArray } from './fuse'

// Fast tag check. Inlined to avoid function call overhead in hot path
const _hasOp = (fn: any): boolean => typeof fn._op === 'number' && fn._op > 0

// Fast array-op check: fuseable (1-7,16), terminal (8-13,17-18), accessor (30-43)
const _isArrayOp = (op: number): boolean =>
  (op >= 1 && op <= 18) || (op >= 30 && op <= 43)

// Shared buffer for general path. Avoids per-call array allocation
const _pipeBuf: any[] = new Array(32)

export function pipe<A, B>(a: A, f1: (a: A) => B): B
export function pipe<A, B, C>(a: A, f1: (a: A) => B, f2: (b: B) => C): C
export function pipe<A, B, C, D>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): D
export function pipe<A, B, C, D, E>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E): E
export function pipe<A, B, C, D, E, F>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F): F
export function pipe<A, B, C, D, E, F, G>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G): G
export function pipe<A, B, C, D, E, F, G, H>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H): H
export function pipe<A, B, C, D, E, F, G, H, I>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I): I
export function pipe<A, B, C, D, E, F, G, H, I, J>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J): J
export function pipe<A, B, C, D, E, F, G, H, I, J, K>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K): K
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L): L
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M): M
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N): N
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O): O
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P): P
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P, f16: (p: P) => Q): Q
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P, f16: (p: P) => Q, f17: (q: Q) => R): R
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P, f16: (p: P) => Q, f17: (q: Q) => R, f18: (r: R) => S): S
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P, f16: (p: P) => Q, f17: (q: Q) => R, f18: (r: R) => S, f19: (s: S) => T): T
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U>(a: A, f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P, f16: (p: P) => Q, f17: (q: Q) => R, f18: (r: R) => S, f19: (s: S) => T, f20: (t: T) => U): U
export function pipe(): unknown {
  const argc = arguments.length
  if (argc <= 1) return arguments[0]

  const a = arguments[0]
  const f1 = arguments[1]

  if (argc === 2) return f1(a)
  const f2 = arguments[2]
  if (argc === 3) {
    if (!_hasOp(f1) && !_hasOp(f2)) return f2(f1(a))
    return fuse(a, [f1, f2])
  }
  const f3 = arguments[3]
  if (argc === 4) {
    if (!_hasOp(f1) && !_hasOp(f2) && !_hasOp(f3)) return f3(f2(f1(a)))
    return fuse(a, [f1, f2, f3])
  }
  const f4 = arguments[4]
  if (argc === 5) {
    if (!_hasOp(f1) && !_hasOp(f2) && !_hasOp(f3) && !_hasOp(f4)) return f4(f3(f2(f1(a))))
    return fuse(a, [f1, f2, f3, f4])
  }
  if (argc === 6) {
    const f5 = arguments[5]
    if (!_hasOp(f1) && !_hasOp(f2) && !_hasOp(f3) && !_hasOp(f4) && !_hasOp(f5)) return f5(f4(f3(f2(f1(a)))))
    return fuse(a, [f1, f2, f3, f4, f5])
  }

  // General path (argc > 6): single tag check on first fn
  const len = argc - 1
  if (!(f1._op > 0)) {
    let r: any = f4(f3(f2(f1(a))))
    for (let i = 5; i < argc; i++) r = arguments[i](r)
    return r
  }

  // Tagged: populate buffer and classify
  let allArrayOps = true
  for (let i = 1; i < argc; i++) {
    const fn = arguments[i]
    _pipeBuf[i - 1] = fn
    if (allArrayOps) {
      const op = fn._op
      if (typeof op === 'number' && op > 0) {
        if (!_isArrayOp(op)) allArrayOps = false
      } else {
        allArrayOps = false
      }
    }
  }

  if (allArrayOps) return fuseArray(a, _pipeBuf, len)

  const fns = new Array(len)
  for (let i = 0; i < len; i++) fns[i] = _pipeBuf[i]
  return fuse(a, fns)
}
