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
  /** The compact fusion engine itself stays under its gzip ceiling. */
  | 'size:engine'
  /** What a consumer's bundle carries: packed topology, root and untagged paths. */
  | 'size:consumer'
  /** Compiled output against the frozen reference emitter. */
  | 'parity:compiler'
  /** Iter and typed-array execution against frozen baselines. */
  | 'parity:iter'
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
    script: 'perf-profile-gate.ts',
    kind: 'timing',
    group: 'quality',
    checks: 'the machine matches a recorded profile and is quiet enough to time on',
  }),
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
    script: 's9-compact-size-gate.ts',
    kind: 'deterministic',
    group: 'size:engine',
    checks: 'compact fusion stays under its hard gate and carries no debug or registry',
  }),
  Object.freeze({
    script: 's3b-untagged-size-gate.ts',
    kind: 'deterministic',
    group: 'size:consumer',
    checks: 'non-fusible flows keep the opcode table out of consumer bundles',
  }),
  Object.freeze({
    script: 'compiler-perf-sessions-gate.ts',
    kind: 'timing',
    group: 'parity:compiler',
    checks: 'each compiler corpus row on the median of five fresh-process sessions',
  }),
  Object.freeze({
    script: 's10-hand-loop-gate.ts',
    kind: 'timing',
    group: 'hand-loop',
    checks: 'reusable reduce and early-exit shapes against hand-written loops',
  }),
  Object.freeze({
    script: 's10-prototype-pack-gate.ts',
    kind: 'deterministic',
    group: 'size:consumer',
    checks: 'the exact packed optimizer footprint and the S10J topology decision it implies',
  }),
  Object.freeze({
    script: 'iter-array-kernel-gate.ts',
    kind: 'timing',
    group: 'parity:iter',
    checks: 'shipped Iter kernels against hand loops, and the subpath size exception',
  }),
  Object.freeze({
    script: 'iter-typed-array-kernel-gate.ts',
    kind: 'timing',
    group: 'parity:iter',
    checks: 'shipped typed-array Iter kernels against hand-written indexed loops',
  }),
  Object.freeze({
    script: 'pipe-dispatch-gate.ts',
    kind: 'timing',
    group: 'hand-loop',
    checks: 'current dispatch against the frozen pre-hot-identity baseline',
  }),
  Object.freeze({
    script: 'iter-perf-gate.ts',
    kind: 'timing',
    group: 'parity:iter',
    checks: 'Iter release floors',
  }),
  Object.freeze({
    script: 'iter-broad-perf-gate.ts',
    kind: 'timing',
    group: 'parity:iter',
    checks: 'broad Iter frozen-baseline geomean and per-row floors',
  }),
  Object.freeze({
    script: 'iter-compiled-perf-gate.ts',
    kind: 'timing',
    group: 'parity:iter',
    checks: 'phase 4: compiled Iter chains against the same chains through the uncompiled runtime',
  }),
  Object.freeze({
    script: 'typed-array-perf-gate.ts',
    kind: 'timing',
    group: 'parity:iter',
    checks: 'typed-array families against frozen and native references',
  }),
  Object.freeze({
    script: 'compiler-perf-gate.ts',
    kind: 'timing',
    group: 'parity:compiler',
    checks: 'stratified compiler execution',
  }),
  Object.freeze({
    script: 'compiler-operation-perf-gate.ts',
    kind: 'timing',
    group: 'parity:compiler',
    checks: 'per-operation compiler execution',
  }),
  Object.freeze({
    script: 'core-utilities-perf-gate.ts',
    kind: 'timing',
    group: 'quality',
    checks: 'core utility operations against their frozen before-state',
  }),
  Object.freeze({
    script: 'data-functional-perf-gate.ts',
    kind: 'timing',
    group: 'quality',
    checks: 'data and functional operations against their frozen before-state',
  }),
  Object.freeze({
    script: 'scalar-text-hash-perf-gate.ts',
    kind: 'timing',
    group: 'quality',
    checks: 'scalar, text, and hash operations against their frozen before-state',
  }),
  Object.freeze({
    script: 'structural-perf-gate.ts',
    kind: 'timing',
    group: 'quality',
    checks: 'structural operations against their frozen before-state',
  }),
  Object.freeze({
    script: 'third-wave-perf-gate.ts',
    kind: 'timing',
    group: 'quality',
    checks: 'the third-wave corpus and its pinned row projection',
  }),
  Object.freeze({
    script: 'transducer-collector-without-perf-gate.ts',
    kind: 'timing',
    group: 'quality',
    checks: 'transducer and collector hot paths',
  }),
  Object.freeze({
    script: 'allocation-perf-gate.ts',
    kind: 'timing',
    group: 'allocation',
    checks: 'retained heap and allocation families per engine',
  }),
])

export const GATE_SCRIPTS: readonly string[] = Object.freeze(GATES.map((gate) => gate.script))
