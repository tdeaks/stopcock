import { dual } from './dual'
import {
  OP_COUNT,
  OP_DROP,
  OP_DROP_WHILE,
  OP_EVERY,
  OP_FIND,
  OP_FLAT_MAP,
  OP_FOR_EACH,
  OP_MAP,
  OP_FILTER,
  OP_REDUCE,
  OP_SCAN_STREAM,
  OP_SOME,
  OP_TAKE_STREAM,
  OP_TAKE_WHILE,
} from './opcodes'
import { requireOpMeta, type OpCode } from './registry'
import { buildPlanFromOps, type BoundStep, type StepBinding } from './plan'
import { dispatchAndTrack, resolveStreamEntry, resolveIterableStreamEntry, triggerStreamEagerGeneration } from './compile'
import type { ShapeEntry } from './shape-entry'

export interface Stream<A> {
  [Symbol.iterator](): Iterator<A>
}

/** One node in Stream's persistent plan chain: O(1) append (see appendNode),
 * structurally shared across every Stream derived from the same prefix.
 * Terminal operations flatten the chain (nodesToOps, memoized per tail
 * node) into a BoundPlan and run it through the same ShapeEntry/tier
 * machinery pipe() and compile() use. */
interface PlanNode {
  readonly op: OpCode
  readonly binding: StepBinding
  readonly prev: PlanNode | null
}

interface Flattened {
  readonly ops: readonly BoundStep[]
  readonly bindings: readonly StepBinding[]
}

const EMPTY_OPS: readonly BoundStep[] = Object.freeze([])
const EMPTY_FLATTENED: Flattened = Object.freeze({ ops: EMPTY_OPS, bindings: Object.freeze([]) })
const flattenedCache = new WeakMap<PlanNode, Flattened>()

/** Flattens the persistent node chain into parallel ops/bindings arrays in
 * one pass, memoized per tail node (PlanNode is never mutated after
 * construction by convention, so this runs at most once per distinct
 * chain, however many terminals run over it — including a second
 * `.map(o => o.binding)` pass, which used to happen on every terminal
 * call even on a cache hit). Deliberately NOT Object.freeze'd: measured
 * ~0.5us per call on V8 for arrays this size (freezing forces dictionary-
 * mode elements), which dominates the entire flatten+dispatch cost on a
 * cache miss — i.e. on every call for a Stream chain rebuilt fresh each
 * time, the common `pipe(Stream.from(x), Stream.map(f), ...)` style.
 * Nothing outside this module ever holds onto or mutates these arrays. */
function flatten(tail: PlanNode | null): Flattened {
  if (tail === null) return EMPTY_FLATTENED
  const cached = flattenedCache.get(tail)
  if (cached) return cached
  const ops: BoundStep[] = []
  const bindings: StepBinding[] = []
  for (let n: PlanNode | null = tail; n; n = n.prev) {
    ops.push({ op: n.op, binding: n.binding })
    bindings.push(n.binding)
  }
  ops.reverse()
  bindings.reverse()
  const result: Flattened = { ops, bindings }
  flattenedCache.set(tail, result)
  return result
}

/** Back-compat helper for call sites that only need the ops (StreamIterator). */
function nodesToOps(tail: PlanNode | null): readonly BoundStep[] {
  return flatten(tail).ops
}

class PipelineStream<A> implements Stream<A> {
  constructor(
    readonly source: Iterable<any>,
    readonly tail: PlanNode | null,
  ) {}

  [Symbol.iterator](): Iterator<A> {
    return new StreamIterator(this.source, nodesToOps(this.tail)) as Iterator<A>
  }
}

const make = <A>(iter: () => Iterator<A>): Stream<A> => ({ [Symbol.iterator]: iter })

const isPipeline = <A>(stream: Stream<A>): stream is PipelineStream<A> => stream instanceof PipelineStream

/** O(1) append: extends the tail if `stream` is already a PipelineStream
 * over the same source, otherwise starts a fresh chain rooted at `stream`
 * as the source (mirrors the old appendStep's fold-in-place behavior). */
function appendNode<B>(stream: Stream<any>, op: OpCode, binding: StepBinding): Stream<B> {
  return isPipeline(stream)
    ? new PipelineStream<B>(stream.source, { op, binding, prev: stream.tail })
    : new PipelineStream<B>(stream, { op, binding, prev: null })
}

// --- Pull-based iterator state machine ---------------------------------
//
// Backs Stream's own [Symbol.iterator] (laziness and re-iterability: each
// call constructs a fresh StreamIterator over a fresh source iterator, so
// infinite sources and multiple independent traversals both work) and the
// terminal fallback for non-array-backed sources. Mirrors lower.ts's
// buildGenericStreamRunner stage-for-stage but pulls one source element at
// a time instead of looping an array by index, and maintains an explicit
// stack of active flatMap frames instead of recursing — so a `take`,
// `find`, thrown callback, or an external `.return()` closes every
// still-open inner iterator, not just the outermost source.
interface FlatMapFrame {
  readonly iter: Iterator<unknown>
  readonly next: number
}

class StreamIterator implements Iterator<unknown> {
  private readonly srcIter: Iterator<unknown>
  private readonly ops: readonly BoundStep[]
  private readonly len: number
  private readonly takeCount: number[]
  private readonly dropCount: number[]
  private readonly dropWhileActive: boolean[]
  private readonly scanAcc: unknown[]
  private readonly stack: FlatMapFrame[] = []
  private finished = false

  constructor(source: Iterable<unknown>, ops: readonly BoundStep[]) {
    this.srcIter = source[Symbol.iterator]()
    this.ops = ops
    this.len = ops.length
    this.takeCount = new Array(this.len).fill(0)
    this.dropCount = new Array(this.len).fill(0)
    this.dropWhileActive = ops.map((step) => step.op === OP_DROP_WHILE)
    this.scanAcc = ops.map((step) => (step.op === OP_SCAN_STREAM ? step.binding.a1 : undefined))
  }

  private closeAll(): void {
    for (let i = this.stack.length - 1; i >= 0; i--) this.stack[i].iter.return?.()
    this.stack.length = 0
    this.srcIter.return?.()
  }

  private halt(): IteratorResult<unknown> {
    this.finished = true
    this.closeAll()
    return { done: true, value: undefined }
  }

  next(): IteratorResult<unknown> {
    if (this.finished) return { done: true, value: undefined }
    // A thrown callback error unwinds out of this method directly, not
    // through a native for-of body — the engine's own IteratorClose never
    // triggers for that case, so close every open iterator ourselves
    // before letting the error propagate.
    try {
      return this.advance()
    } catch (e) {
      if (!this.finished) {
        this.finished = true
        this.closeAll()
      }
      throw e
    }
  }

  private advance(): IteratorResult<unknown> {
    outer: for (;;) {
      let value: unknown
      let s: number

      if (this.stack.length > 0) {
        const top = this.stack[this.stack.length - 1]!
        const r = top.iter.next()
        if (r.done) {
          this.stack.pop()
          continue outer
        }
        value = r.value
        s = top.next
      } else {
        const r = this.srcIter.next()
        if (r.done) {
          this.finished = true
          return { done: true, value: undefined }
        }
        value = r.value
        s = 0
      }

      for (;;) {
        if (s >= this.len) return { done: false, value }
        const step = this.ops[s]!
        const b = step.binding

        switch (step.op) {
          case OP_MAP:
            value = (b.fn as (v: unknown) => unknown)(value)
            s++
            continue
          case OP_FILTER:
            if (!(b.fn as (v: unknown) => boolean)(value)) continue outer
            s++
            continue
          case OP_FLAT_MAP: {
            const inner = (b.fn as (v: unknown) => Iterable<unknown>)(value)
            this.stack.push({ iter: inner[Symbol.iterator](), next: s + 1 })
            continue outer
          }
          case OP_TAKE_STREAM: {
            const n = b.fn as number
            if (n <= 0) return this.halt()
            this.takeCount[s]!++
            if (this.takeCount[s]! >= n) {
              // No more pulls will ever happen after this element: safe to
              // release every open iterator now rather than wait for an
              // external .return() that may never come.
              this.finished = true
              this.closeAll()
            }
            s++
            continue
          }
          case OP_DROP:
            if (this.dropCount[s]! < (b.fn as number)) {
              this.dropCount[s]!++
              continue outer
            }
            s++
            continue
          case OP_TAKE_WHILE:
            if (!(b.fn as (v: unknown) => boolean)(value)) return this.halt()
            s++
            continue
          case OP_DROP_WHILE:
            if (this.dropWhileActive[s]) {
              if ((b.fn as (v: unknown) => boolean)(value)) continue outer
              this.dropWhileActive[s] = false
            }
            s++
            continue
          case OP_SCAN_STREAM: {
            const acc = (b.fn as (acc: unknown, v: unknown) => unknown)(this.scanAcc[s], value)
            this.scanAcc[s] = acc
            value = acc
            s++
            continue
          }
          default:
            throw new Error(`stream: unsupported op ${step.op} (${requireOpMeta(step.op).name})`)
        }
      }
    }
  }

  return(value?: unknown): IteratorResult<unknown> {
    if (!this.finished) {
      this.finished = true
      this.closeAll()
    }
    return { done: true, value }
  }
}

// --- Terminal dispatch: array-backed, materialize+array, or iterable-tiered ----
//
// A Stream over an array lowers straight into the array-domain Plan IR:
// same ShapeEntry lookup by execution identity, same tier-0 switch
// interpreter, same tier-1/2 promotion with consumed-element accounting as
// pipe(). Every op Stream's own vocabulary can append (map/filter/flatMap/
// take/drop/takeWhile/dropWhile/scan, plus one optional trailing sink) is
// 'array'-domain and never a materializer, so buildPlanFromOps always
// yields exactly one segment and never reorders bindings — the ShapeEntry
// for a given (opcode sequence[, trailing sink opcode]) is fully
// determined by that sequence alone, independent of a call site's actual
// closures. So it's cached by opcode sequence, not by tail-node identity:
// a Stream chain rebuilt fresh from the same operators on every call (the
// common `pipe(Stream.from(x), Stream.map(f), ...)` shape) still hits the
// cache, the same way pipe()'s own opcode-keyed front cache does for bare
// pipe — only the *first* sighting of a given shape pays buildPlanFromOps/
// planShapeKey; every later one is a Map lookup, no string/array rebuild.
//
// A non-array source has two paths, chosen per-shape:
//   - No early-termination op anywhere in the chain (or the synthetic
//     sink): the terminal will drain every element regardless, so
//     Array.from(source) once and dispatch through the exact same
//     array-backed entry/cache above — correct (nothing was going to stop
//     early) and it's the array executor, full stop.
//   - An early-termination op is present (take/takeWhile/takeUntil/
//     mapWhile/flatMap/find/every/some — see registry.ts's
//     `earlyTermination` flag): materializing first could hang forever on
//     an infinite source or waste work on an expensive one, so this
//     dispatches through a *separate* ShapeEntry keyed with the 'iterable'
//     source-kind discriminator (see shape-entry.ts's executionIdentityKey
//     and resolveIterableStreamEntry) — tier 0 is a fused push loop
//     (lower.ts's buildIterableStreamRunner) pulling the source with a
//     plain for-of, and it promotes through the exact same
//     dispatchAndTrack thresholds as every other entry once it's been
//     exercised enough (see jit-chunk.ts's generateIterableRunner for the
//     tier-1 codegen). `break`-ing the for-of on early exit triggers the
//     engine's own IteratorClose either way.
//
// A cache key packs the opcode sequence (plus the sink's opcode, if any)
// into a single number when short enough to fit, falling back to a string
// only for long chains — the same trick pipe.ts's front cache uses to
// avoid string allocation on the hot path.
const KEY_BASE = 128
const KEY_MAX_LEN = 6

type StreamKey = number | string

function streamKey(ops: readonly BoundStep[], extraOp?: OpCode): StreamKey {
  const len = ops.length + (extraOp === undefined ? 0 : 1)
  if (len <= KEY_MAX_LEN) {
    let key = 0
    for (let i = 0; i < ops.length; i++) key = key * KEY_BASE + ops[i]!.op
    if (extraOp !== undefined) key = key * KEY_BASE + extraOp
    return key
  }
  let key = ''
  for (let i = 0; i < ops.length; i++) {
    key += ops[i]!.op
    key += ','
  }
  if (extraOp !== undefined) key += 's' + extraOp
  return key
}

function hasEarlyTermination(ops: readonly BoundStep[], extra?: BoundStep): boolean {
  for (let i = 0; i < ops.length; i++) if (requireOpMeta(ops[i]!.op).earlyTermination) return true
  return extra !== undefined && requireOpMeta(extra.op).earlyTermination
}

const shapeEntryCache = new Map<StreamKey, ShapeEntry>()
const iterableShapeEntryCache = new Map<StreamKey, ShapeEntry>()

export function __debugCacheSizes(): { shapeEntryCache: number; iterableShapeEntryCache: number } {
  return { shapeEntryCache: shapeEntryCache.size, iterableShapeEntryCache: iterableShapeEntryCache.size }
}

function entryFor(ops: readonly BoundStep[], extra?: BoundStep): ShapeEntry {
  const key = streamKey(ops, extra?.op)
  const cached = shapeEntryCache.get(key)
  if (cached) return cached
  const entry = resolveStreamEntry(buildPlanFromOps(extra ? [...ops, extra] : ops).shape)
  shapeEntryCache.set(key, entry)
  return entry
}

function iterableEntryFor(ops: readonly BoundStep[], extra?: BoundStep): ShapeEntry {
  const key = streamKey(ops, extra?.op)
  const cached = iterableShapeEntryCache.get(key)
  if (cached) return cached
  const entry = resolveIterableStreamEntry(buildPlanFromOps(extra ? [...ops, extra] : ops).shape)
  iterableShapeEntryCache.set(key, entry)
  return entry
}

function bindingsFor(ops: readonly BoundStep[], bindings: readonly StepBinding[], extra?: BoundStep): readonly StepBinding[] {
  return extra ? [...bindings, extra.binding] : bindings
}

/** Resolves a Stream's operator chain (plus an optional synthetic terminal
 * node, e.g. OP_REDUCE) and picks the fastest correct execution path for
 * `source`. Shared by every terminal (toArray/reduce/first/last/count/
 * every/some/find/forEach). */
function runTerminal(stream: Stream<any>, extra?: BoundStep): unknown {
  const source = isPipeline(stream) ? stream.source : (stream as Iterable<unknown>)
  const { ops, bindings } = flatten(isPipeline(stream) ? stream.tail : null)

  if (Array.isArray(source)) {
    return dispatchAndTrack(entryFor(ops, extra), source, bindingsFor(ops, bindings, extra))
  }
  if (!hasEarlyTermination(ops, extra)) {
    return dispatchAndTrack(entryFor(ops, extra), Array.from(source), bindingsFor(ops, bindings, extra))
  }
  return dispatchAndTrack(iterableEntryFor(ops, extra), source, bindingsFor(ops, bindings, extra))
}

/** Test-only: resolves the ShapeEntry a Stream's operator chain would
 * dispatch through on an array-backed source, without executing it.
 * Mirrors compile.ts's __shapeEntryForSteps for pipe. */
export function __entryForStream(stream: Stream<any>): ShapeEntry {
  const { ops } = flatten(isPipeline(stream) ? stream.tail : null)
  return entryFor(ops)
}

/** Test-only: resolves the ShapeEntry a Stream's operator chain would
 * dispatch through over a non-array, early-termination source — the
 * 'iterable' source-kind sibling of __entryForStream, distinct by
 * construction (see resolveIterableStreamEntry). */
export function __entryForIterableStream(stream: Stream<any>): ShapeEntry {
  const { ops } = flatten(isPipeline(stream) ? stream.tail : null)
  return iterableEntryFor(ops)
}

// --- Creators ---

export const from = <A>(iterable: Iterable<A>): Stream<A> => new PipelineStream<A>(iterable, null)

export const range = (start: number, end: number): Stream<number> =>
  make(function* () {
    for (let i = start; i < end; i++) yield i
  })

export const iterate = <A>(f: (a: A) => A, seed: A): Stream<A> =>
  make(function* () {
    let current = seed
    while (true) {
      yield current
      current = f(current)
    }
  })

export const repeat = <A>(value: A): Stream<A> =>
  make(function* () {
    while (true) yield value
  })

export const empty = <A = never>(): Stream<A> => make(function* () {})

// --- Transformers ---

export const map: {
  <A, B>(stream: Stream<A>, f: (a: A) => B): Stream<B>
  <A, B>(f: (a: A) => B): (stream: Stream<A>) => Stream<B>
} = dual(2, <A, B>(stream: Stream<A>, f: (a: A) => B): Stream<B> => appendNode(stream, OP_MAP, { fn: f })) as any

export const filter: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A>
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A> => appendNode(stream, OP_FILTER, { fn: pred })) as any

export const flatMap: {
  <A, B>(stream: Stream<A>, f: (a: A) => Stream<B>): Stream<B>
  <A, B>(f: (a: A) => Stream<B>): (stream: Stream<A>) => Stream<B>
} = dual(
  2,
  <A, B>(stream: Stream<A>, f: (a: A) => Stream<B>): Stream<B> => appendNode(stream, OP_FLAT_MAP, { fn: f }),
) as any

export const take: {
  <A>(stream: Stream<A>, n: number): Stream<A>
  (n: number): <A>(stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, n: number): Stream<A> => appendNode(stream, OP_TAKE_STREAM, { fn: n })) as any

export const drop: {
  <A>(stream: Stream<A>, n: number): Stream<A>
  (n: number): <A>(stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, n: number): Stream<A> => appendNode(stream, OP_DROP, { fn: n })) as any

export const takeWhile: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A>
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A> => appendNode(stream, OP_TAKE_WHILE, { fn: pred }),
) as any

export const dropWhile: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A>
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A> => appendNode(stream, OP_DROP_WHILE, { fn: pred }),
) as any

export const scan: {
  <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): Stream<B>
  <A, B>(f: (acc: B, a: A) => B, init: B): (stream: Stream<A>) => Stream<B>
} = dual(
  3,
  <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): Stream<B> =>
    appendNode(stream, OP_SCAN_STREAM, { fn: f, a1: init }),
) as any

export const chunk: {
  <A>(stream: Stream<A>, n: number): Stream<A[]>
  (n: number): <A>(stream: Stream<A>) => Stream<A[]>
} = dual(2, <A>(stream: Stream<A>, n: number): Stream<A[]> => {
  if (n < 1) throw new Error(`chunk: size must be >= 1, got ${n}`)

  return make(function* () {
    let buf: A[] = []
    for (const a of stream) {
      buf.push(a)
      if (buf.length === n) {
        yield buf
        buf = []
      }
    }
    if (buf.length > 0) yield buf
  })
}) as any

export const zip: {
  <A, B>(stream: Stream<A>, other: Stream<B>): Stream<[A, B]>
  <B>(other: Stream<B>): <A>(stream: Stream<A>) => Stream<[A, B]>
} = dual(
  2,
  <A, B>(stream: Stream<A>, other: Stream<B>): Stream<[A, B]> =>
    make(function* () {
      const itA = stream[Symbol.iterator]()
      const itB = other[Symbol.iterator]()
      while (true) {
        const a = itA.next()
        const b = itB.next()
        if (a.done || b.done) return
        yield [a.value, b.value]
      }
    }),
) as any

export const concat: {
  <A>(stream: Stream<A>, other: Stream<A>): Stream<A>
  <A>(other: Stream<A>): (stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, other: Stream<A>): Stream<A> =>
    make(function* () {
      yield* stream
      yield* other
    }),
) as any

export const distinct = <A>(stream: Stream<A>): Stream<A> =>
  make(function* () {
    const seen = new Set<A>()
    for (const a of stream) {
      if (!seen.has(a)) {
        seen.add(a)
        yield a
      }
    }
  })

export const distinctN: {
  <A>(stream: Stream<A>, maxSize: number): Stream<A>
  (maxSize: number): <A>(stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, maxSize: number): Stream<A> =>
    make(function* () {
      const seen = new Set<A>()
      for (const a of stream) {
        if (!seen.has(a)) {
          if (seen.size >= maxSize) seen.clear()
          seen.add(a)
          yield a
        }
      }
    }),
) as any

export const intersperse: {
  <A>(stream: Stream<A>, sep: A): Stream<A>
  <A>(sep: A): (stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, sep: A): Stream<A> =>
    make(function* () {
      let firstValue = true
      for (const a of stream) {
        if (!firstValue) yield sep
        firstValue = false
        yield a
      }
    }),
) as any

// --- Stream.compile: reusable Iterable-to-Stream function ---------------
//
// Building the operator chain once and reusing it across many inputs is
// itself the reuse signal, same as compile()/compilePure() for pipe: the
// shape and its fixed callback vector get tier-1/2 generation requested
// eagerly here rather than waiting on the adaptive execution/consumed-
// element thresholds a bare (uncompiled) Stream chain relies on.
export function compile<A, B>(
  ...ops: ReadonlyArray<(s: Stream<any>) => Stream<any>>
): (input: Iterable<A>) => Stream<B> {
  let built: Stream<any> = new PipelineStream<any>([], null)
  for (const op of ops) built = op(built)
  const tail = isPipeline(built) ? built.tail : null
  const { ops: chainOps, bindings } = flatten(tail)
  triggerStreamEagerGeneration(entryFor(chainOps), bindings)
  // The compiled function is reusable over any Iterable<A>, not just
  // arrays: when the chain has an early-termination op, a non-array input
  // at call time drives the separate iterable-sourced entry (runTerminal
  // above), so that entry's tier-1/2 generation is just as much the reuse
  // signal here as the array-backed one.
  if (hasEarlyTermination(chainOps)) triggerStreamEagerGeneration(iterableEntryFor(chainOps), bindings)
  return (input: Iterable<A>) => new PipelineStream<B>(input, tail)
}

// --- Terminals ---
//
// Every terminal below just resolves the synthetic sink node (if any) and
// hands off to runTerminal, which picks array-backed / materialize+array /
// push-loop per the shape (see runTerminal's doc comment above).

export const toArray = <A>(stream: Stream<A>): A[] => runTerminal(stream) as A[]

export const collect = toArray

export const reduce: {
  <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): B
  <A, B>(f: (acc: B, a: A) => B, init: B): (stream: Stream<A>) => B
} = dual(3, <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): B =>
  runTerminal(stream, { op: OP_REDUCE, binding: { fn: f, a1: init } }) as B) as any

export const first = <A>(stream: Stream<A>): A | undefined =>
  runTerminal(stream, { op: OP_FIND, binding: { fn: () => true } }) as A | undefined

export const last = <A>(stream: Stream<A>): A | undefined =>
  runTerminal(stream, { op: OP_REDUCE, binding: { fn: (_acc: unknown, v: unknown) => v, a1: undefined } }) as
    | A
    | undefined

export const count = <A>(stream: Stream<A>): number =>
  runTerminal(stream, { op: OP_COUNT, binding: { fn: () => true } }) as number

export const every: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => boolean
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean =>
  runTerminal(stream, { op: OP_EVERY, binding: { fn: pred } }) as boolean) as any

export const some: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => boolean
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean =>
  runTerminal(stream, { op: OP_SOME, binding: { fn: pred } }) as boolean) as any

export const find: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): A | undefined
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => A | undefined
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): A | undefined =>
  runTerminal(stream, { op: OP_FIND, binding: { fn: pred } }) as A | undefined) as any

export const forEach: {
  <A>(stream: Stream<A>, f: (a: A) => void): void
  <A>(f: (a: A) => void): (stream: Stream<A>) => void
} = dual(2, <A>(stream: Stream<A>, f: (a: A) => void): void => {
  runTerminal(stream, { op: OP_FOR_EACH, binding: { fn: f } })
}) as any
