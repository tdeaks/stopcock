import { tryCompileFlow } from './fuse'

export function flow<A, B>(f1: (a: A) => B): (a: A) => B
export function flow<A, B, C>(f1: (a: A) => B, f2: (b: B) => C): (a: A) => C
export function flow<A, B, C, D>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D): (a: A) => D
export function flow<A, B, C, D, E>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E): (a: A) => E
export function flow<A, B, C, D, E, F>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F): (a: A) => F
export function flow<A, B, C, D, E, F, G>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G): (a: A) => G
export function flow<A, B, C, D, E, F, G, H>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H): (a: A) => H
export function flow<A, B, C, D, E, F, G, H, I>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I): (a: A) => I
export function flow<A, B, C, D, E, F, G, H, I, J>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J): (a: A) => J
export function flow<A, B, C, D, E, F, G, H, I, J, K>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K): (a: A) => K
export function flow<A, B, C, D, E, F, G, H, I, J, K, L>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L): (a: A) => L
export function flow<A, B, C, D, E, F, G, H, I, J, K, L, M>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M): (a: A) => M
export function flow<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N): (a: A) => N
export function flow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O): (a: A) => O
export function flow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P): (a: A) => P
export function flow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P, f16: (p: P) => Q): (a: A) => Q
export function flow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P, f16: (p: P) => Q, f17: (q: Q) => R): (a: A) => R
export function flow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P, f16: (p: P) => Q, f17: (q: Q) => R, f18: (r: R) => S): (a: A) => S
export function flow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P, f16: (p: P) => Q, f17: (q: Q) => R, f18: (r: R) => S, f19: (s: S) => T): (a: A) => T
export function flow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U>(f1: (a: A) => B, f2: (b: B) => C, f3: (c: C) => D, f4: (d: D) => E, f5: (e: E) => F, f6: (f: F) => G, f7: (g: G) => H, f8: (h: H) => I, f9: (i: I) => J, f10: (j: J) => K, f11: (k: K) => L, f12: (l: L) => M, f13: (m: M) => N, f14: (n: N) => O, f15: (o: O) => P, f16: (p: P) => Q, f17: (q: Q) => R, f18: (r: R) => S, f19: (s: S) => T, f20: (t: T) => U): (a: A) => U
export function flow(...fns: Array<(x: unknown) => unknown>): (a: unknown) => unknown {
  const len = fns.length
  if (len === 1) return fns[0]
  if (len === 2) { const [f1, f2] = fns; return (a) => f2(f1(a)) }
  if (len === 3) { const [f1, f2, f3] = fns; return (a) => f3(f2(f1(a))) }

  // Try tagged fusion compilation first
  const compiled = tryCompileFlow(fns)
  if (compiled) return compiled

  // Untagged. Return a direct composition closure (no fuse per call)
  if (len === 4) { const [f1, f2, f3, f4] = fns; return (a) => f4(f3(f2(f1(a)))) }
  if (len === 5) { const [f1, f2, f3, f4, f5] = fns; return (a) => f5(f4(f3(f2(f1(a))))) }
  if (len === 6) { const [f1, f2, f3, f4, f5, f6] = fns; return (a) => f6(f5(f4(f3(f2(f1(a)))))) }
  return (a: unknown) => { let r = a; for (let i = 0; i < len; i++) r = (fns[i] as any)(r); return r }
}
