/**
 * Root `pipe`: sequential, left to right, one call per step.
 *
 * In 1.x this fused automatically. It no longer does. Fusion is now something
 * you ask for by name, through `@stopcock/fp/fusion` or
 * `@stopcock/fp/fusion/optimized`, which have meant exactly that since they
 * shipped and continue to.
 *
 * The change is semantics-preserving: the same steps over the same input give
 * the same result. What changes is that intermediate arrays are no longer
 * elided, and callbacks run stage by stage rather than interleaved per element.
 * If you were relying on fusion for throughput, import it explicitly.
 *
 * One caveat, because the two facts read as contradictory otherwise:
 * `@stopcock/fp-compiler` lowers this call into a fused loop at build time. So
 * "stage by stage" describes what this function does at runtime, and a build
 * with that plugin enabled will interleave callbacks and stop calling upstream
 * ones at an early-exit terminal. Results are identical either way; callback
 * counts and order are not. It matters only for effectful callbacks, and the
 * compiler's README documents it.
 */

type Fn = (value: unknown) => unknown

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
export function pipe(a?: unknown, ...steps: readonly Fn[]): unknown {
  // A real rest parameter, not `arguments`: the engine builds this array
  // with define, not set, semantics, so a step's own construction can't be
  // hijacked by an inherited accessor on Array.prototype (see
  // internal/sequential.ts's header). Declared directly here, and applied
  // with its own loop, rather than forwarding to sequentialPipe through a
  // second rest-collect and spread call -- that double allocation is what
  // made this slower than the frozen pre-hot-identity dispatch baseline
  // before. `steps[i](value)` is a property-access call on purpose, never
  // hoisted into a local first, so an opaque step still observes the step
  // vector itself as `this`, matching @stopcock/fp-compiler's own codegen.
  if (steps.length === 0) return a
  let current = steps[0](a)
  for (let i = 1; i < steps.length; i++) current = steps[i](current)
  return current
}
