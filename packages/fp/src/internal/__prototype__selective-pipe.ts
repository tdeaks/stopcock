/**
 * Prototype: an adaptive execution selector for the runtime pipe.
 *
 * Experiment scaffolding, not a real module -- same `__prototype__` marker as
 * `internal/__prototype__data-last.ts`. Not listed in module-manifest.ts, so
 * nothing here reaches package.json's exports map. Companion bench:
 * benchmarks/src/fusion-tier-decision.bench.ts's "select" rows.
 *
 * Question the decision suite (fusion-tier-decision.bench.ts) put numbers on:
 * the compact fused engine (`@stopcock/fp/fusion`) loses 2.5-4x to plain
 * sequential closure calls on typical pipeline shapes, but wins by 10x-961x
 * on exactly two shape classes, and only at larger n:
 *
 *   1. a take/takeUntil sink with at least one element op (map/filter/...)
 *      ahead of it in the same stream segment -- fusion skips building the
 *      full intermediate array(s) and stops the whole pipeline the moment
 *      the count is reached.
 *   2. a find/findIndex/findMap/some/none/every sink -- fusion again halts
 *      every upstream stage, not just the terminal one, the moment the
 *      match/verdict is known.
 *
 * Everything else -- plain map/filter/reduce chains, scan, sortBy, uniq,
 * flatMap, and (see below) head -- fusion's generic one-executor-fits-all
 * `interpret` loses to calling each tagged op's own specialized closure
 * directly, because that closure *is* the same loop array.ts's data-first
 * branch runs, minus interpret's per-segment dispatch.
 *
 * This selector picks per call, cheaply:
 *
 *   - classify the op chain once (which sink is at the end, and does an
 *     element op precede a bounded sink), cached on step-reference identity
 *     exactly like compact-runtime.ts's own plan cache (planFor) -- four
 *     slots, round-robin, so a churny call site cannot grow it;
 *   - at call time, if the chain classified as a winning shape AND the input
 *     is a real array AND its length clears THRESHOLD, run the real compact
 *     fused engine (`compactPipe`, the same production entry point
 *     `@stopcock/fp/fusion`'s `pipe` uses) -- not a reimplementation;
 *   - otherwise apply every op as a plain sequential closure call. Tagged ops
 *     (`A.map(f)`, etc.) work fine called directly: `registerTrustedOperator`
 *     returns the same closure it tags, and that closure is array.ts's own
 *     loop, not a fusion-only stub. This is what makes the "else" branch a
 *     fair comparison to the bench's `naive` row rather than a strawman.
 *
 * head is deliberately excluded from the winning-sink set despite being
 * early-exit *shaped* (bounded-consumption sink at chain's end). Per
 * facts.generated.ts, OP_HEAD's cardinality is CARD_MATERIALIZER, not
 * CARD_SINK: buildCompactPlan closes the stream before it and runs it as a
 * whole-array boundary call (see fusion-tier-decision.bench.ts's shape-15
 * comment -- only `hand` actually halts the preceding filter early; fused
 * does not). Classifying head as a winning sink would route it to fused at
 * large n for zero early-exit benefit and the same 2.5-4x loss every other
 * non-winning shape pays. Excluding it is required, not merely conservative.
 *
 * THRESHOLD, likewise, is not classifier-perfect: a `find`-ended chain is
 * classified identically whether the match sits near the front or the back
 * of the data (that's a data property, not a chain-shape property), so a
 * late-hit find still routes to fused above THRESHOLD. Per the decision
 * suite's own numbers that is not a regression -- late-hit find costs a full
 * pass either way, and fused and naive come out close there -- but it means
 * "winning shape" reads as "shape capable of winning", not "guaranteed to".
 */
import { trustedOperatorEntry } from './provenance'
import { CARD_SINK, compactCardinality, isCompactRegistered } from './compact/facts.generated'
import { compactPipe } from './compact-runtime'
import {
  OP_EVERY,
  OP_FIND,
  OP_FIND_INDEX,
  OP_FIND_MAP,
  OP_NONE,
  OP_SOME,
  OP_TAKE,
  OP_TAKE_UNTIL,
} from '../opcodes'

/**
 * n at which a winning-shape chain is worth routing through the fused
 * engine. Justified against fusion-tier-decision.bench.ts's own size grid
 * (10 / 1,000 / 100,000): both winning classes lose to naive at n=10 and win
 * big by n=1,000, so the crossover sits somewhere in (10, 1_000]. See the
 * companion probe in the bench's "select" section (and this experiment's
 * final report) for the narrower measurement that landed on 1,000 -- the
 * fused engine's fixed per-call overhead (plan lookup, interpret's dispatch)
 * is amortized by n=1,000 for both classes, and neither class showed a
 * materially better crossover below that.
 */
export const SELECTIVE_PIPE_THRESHOLD = 1000

// `any`, not `unknown`, deliberately: callers pass concretely-typed tagged
// ops (`A.map(f): (arr: readonly A[]) => B[]`), and `unknown` here would
// make every one of them a contravariance error at the call site. This is
// the prototype's public surface, not internal logic -- runtime behaviour
// does not care either way.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Op = (value: any) => any

const isBoundedTakeOp = (op: number): boolean => op === OP_TAKE || op === OP_TAKE_UNTIL

const isEarlyExitSinkOp = (op: number): boolean =>
  op === OP_FIND ||
  op === OP_FIND_INDEX ||
  op === OP_FIND_MAP ||
  op === OP_SOME ||
  op === OP_NONE ||
  op === OP_EVERY

/**
 * Does this op chain contain an early-exit-winning sink? One pass: a
 * take/takeUntil counts only once at least one element op (map/filter/
 * flatMap/...) precedes it in the same unbroken stream -- a materializing
 * boundary (sortBy, uniq, ...) between them resets that, since it forces the
 * whole array to exist before the bounded op ever runs. A find-class sink
 * counts unconditionally: it is always the terminal op, so there is nothing
 * to reset for.
 */
function classify(ops: readonly unknown[]): boolean {
  let sawElementOp = false
  for (let i = 0; i < ops.length; i++) {
    const entry = trustedOperatorEntry(ops[i])
    if (entry === undefined) {
      sawElementOp = false
      continue
    }
    const op = entry.op
    if (isBoundedTakeOp(op) && sawElementOp) return true
    if (isEarlyExitSinkOp(op)) return true
    sawElementOp = isCompactRegistered(op) && compactCardinality(op) < CARD_SINK
  }
  return false
}

/**
 * Bounded classification cache: four slots keyed on exact step-reference
 * identity, round-robin eviction. Same shape as compact-runtime.ts's own
 * `planFor` cache -- mirrored rather than shared, since that cache stores a
 * built `BoundPlan` and this one stores a boolean, but the identity-keying
 * and bound are copied from it deliberately rather than reinvented.
 */
const CACHE_SIZE = 4
interface CacheEntry {
  readonly steps: readonly unknown[]
  readonly winning: boolean
}
const cache: Array<CacheEntry | undefined> = [undefined, undefined, undefined, undefined]
let clock = 0

const sameSteps = (left: readonly unknown[], right: readonly unknown[]): boolean => {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function classifyCached(ops: readonly unknown[]): boolean {
  for (const entry of cache) {
    if (entry !== undefined && sameSteps(entry.steps, ops)) return entry.winning
  }
  const winning = classify(ops)
  cache[clock++ % CACHE_SIZE] = { steps: ops.slice(), winning }
  return winning
}

/**
 * Adaptive pipe: fused engine for winning shapes at scale, plain sequential
 * closure calls otherwise. `ops` stay data-last closures throughout --
 * tagged or not, each is just called with the previous result.
 */
export function selectivePipe(input: unknown, ...ops: readonly Op[]): unknown {
  if (ops.length === 0) return input
  if (Array.isArray(input) && input.length >= SELECTIVE_PIPE_THRESHOLD && classifyCached(ops)) {
    return compactPipe(input, ...ops)
  }
  let acc = input
  for (let i = 0; i < ops.length; i++) acc = ops[i]!(acc)
  return acc
}

/** Exposed for tests/bench that need a cold cache between runs. */
export const resetSelectivePipeCache = (): void => {
  cache.fill(undefined)
  clock = 0
}
