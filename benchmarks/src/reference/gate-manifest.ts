/**
 * Every runnable gate, and how to run it.
 *
 * The gates are scripts, and the vitest suites only exercise their evaluators.
 * That gap is not theoretical: the frozen pipe-dispatch baseline stopped
 * measuring two of its four cases for two whole stages while the reference
 * suite reported several hundred passing tests, because nothing executed the
 * script that would have said so.
 *
 * This manifest exists so a gate cannot be added and then quietly never run.
 * `gate-manifest.test.ts` fails when a runnable `*-gate.ts` is missing from
 * here, and `bun run perf:gates` executes the list.
 *
 * Gates are keyed by the invariant they guard, not by the ledger stage that
 * used to name them (s3a/s3b/s5b/s8/s9/s12p...). A stage ends; the invariant
 * it was protecting does not.
 */

export type GateKind =
  /** Deterministic: bytes, structure, schema. Safe on a busy machine. */
  | 'deterministic'
  /** Timing. Needs a qualified quiet machine to mean anything. */
  | 'timing'

export type GateGroup =
  /** What a consumer's bundle carries: packed topology, root and untagged paths. */
  | 'size:consumer'
  /** Compiled output against the frozen reference emitter. */
  | 'parity:compiler'
  /** Iter and typed-array execution against frozen baselines. */
  | 'parity:iter'
  /** Dual factories against the frozen single-form emission. */
  | 'parity:dual'
  /** Retained heap and allocation counts. */
  | 'allocation'
  /** Stopcock against the competing libraries. */
  | 'competitors'
  /** Measured directly against a hand-written loop, not another tier. */
  | 'hand-loop'
  /** Coverage, environment, and domain-specific correctness/perf floors. */
  | 'quality'

export interface GateEntry {
  readonly script: string
  readonly kind: GateKind
  readonly group: GateGroup
  /** Why this gate exists, in one line. */
  readonly checks: string
}

export const GATES: readonly GateEntry[] = Object.freeze([
  Object.freeze({
    script: 'competitor-floor-gate.ts',
    kind: 'timing',
    group: 'competitors',
    checks: 'stopcock has not fallen off a cliff against lodash, ramda, or ts-belt',
  }),
  Object.freeze({
    script: 'fp-package-size-gate.ts',
    kind: 'deterministic',
    group: 'size:consumer',
    checks: 'packed topology and per-artifact shared-runtime ceilings',
  }),
  Object.freeze({
    script: 's8-root-size-gate.ts',
    kind: 'deterministic',
    group: 'size:consumer',
    checks: 'root pipe and flow stay small and drag no optimizer in',
  }),
  Object.freeze({
    script: 's3b-untagged-size-gate.ts',
    kind: 'deterministic',
    group: 'size:consumer',
    checks: 'non-fusible flows keep the opcode table out of consumer bundles',
  }),
  Object.freeze({
    script: 'pipe-floor-gate.ts',
    kind: 'timing',
    group: 'competitors',
    checks:
      'invariant 4: plain (uncompiled) pipe chains stay within 1.2x of ramda on the decision suite\'s eager shapes -- there is no runtime fusion engine left, so this is the floor the compiler earns its keep against',
  }),
  Object.freeze({
    script: 'dual-parity-gate.ts',
    kind: 'timing',
    group: 'parity:dual',
    checks:
      'dual-performance-first invariant 3: the dual factories stay at parity (geomean >= 0.97, rows >= 0.90) with the frozen single-form emission on hoisted-pipe, construction, and hoisted-scalar rows',
  }),
  Object.freeze({
    script: 's10-prototype-pack-gate.ts',
    kind: 'deterministic',
    group: 'size:consumer',
    checks: 'the exact packed optimizer footprint and the S10J topology decision it implies',
  }),
  Object.freeze({
    script: 'pipe-dispatch-gate.ts',
    kind: 'timing',
    group: 'hand-loop',
    checks: 'current dispatch against the frozen pre-hot-identity baseline',
  }),
  Object.freeze({
    script: 'compiler-perf-gate.ts',
    kind: 'timing',
    group: 'parity:compiler',
    checks: 'stratified compiler execution',
  }),
])

export const GATE_SCRIPTS: readonly string[] = Object.freeze(GATES.map((gate) => gate.script))
