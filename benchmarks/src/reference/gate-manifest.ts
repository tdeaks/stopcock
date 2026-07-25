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
 */

export type GateKind =
  /** Deterministic: bytes, structure, schema. Safe on a busy machine. */
  | 'deterministic'
  /** Timing. Needs a qualified quiet machine to mean anything. */
  | 'timing'

export interface GateEntry {
  readonly script: string
  readonly kind: GateKind
  /** Why this gate exists, in one line. */
  readonly checks: string
}

export const GATES: readonly GateEntry[] = Object.freeze([
  Object.freeze({
    script: 'perf-profile-gate.ts',
    kind: 'timing',
    checks: 'the machine matches a recorded profile and is quiet enough to time on',
  }),
  Object.freeze({
    script: 'fp-package-size-gate.ts',
    kind: 'deterministic',
    checks: 'packed topology and per-artifact shared-runtime ceilings',
  }),
  Object.freeze({
    script: 's3b-untagged-size-gate.ts',
    kind: 'deterministic',
    checks: 'non-fusible flows keep the opcode table out of consumer bundles',
  }),
  Object.freeze({
    script: 's6-facade-gate.ts',
    kind: 'deterministic',
    checks: 'direct entries retain no engine and debug stays absent unless imported',
  }),
  Object.freeze({
    script: 'iter-array-kernel-gate.ts',
    kind: 'timing',
    checks: 'shipped Iter kernels against hand loops, and the subpath size exception',
  }),
  Object.freeze({
    script: 'pipe-dispatch-gate.ts',
    kind: 'timing',
    checks: 'current dispatch against the frozen pre-hot-identity baseline',
  }),
  Object.freeze({
    script: 'iter-perf-gate.ts',
    kind: 'timing',
    checks: 'Iter release floors',
  }),
  Object.freeze({
    script: 'iter-broad-perf-gate.ts',
    kind: 'timing',
    checks: 'broad Iter frozen-baseline geomean and per-row floors',
  }),
  Object.freeze({
    script: 'typed-array-perf-gate.ts',
    kind: 'timing',
    checks: 'typed-array families against frozen and native references',
  }),
  Object.freeze({
    script: 'portable-perf-gate.ts',
    kind: 'timing',
    checks: 'the portable corpus against the frozen reference emitter',
  }),
  Object.freeze({
    script: 'portable-callback-churn-gate.ts',
    kind: 'timing',
    checks: 'callback churn on fresh-closure call sites',
  }),
  Object.freeze({
    script: 'compiler-perf-gate.ts',
    kind: 'timing',
    checks: 'stratified compiler execution',
  }),
  Object.freeze({
    script: 'compiler-operation-perf-gate.ts',
    kind: 'timing',
    checks: 'per-operation compiler execution',
  }),
  Object.freeze({
    script: 'core-utilities-perf-gate.ts',
    kind: 'timing',
    checks: 'core utility operations against their frozen before-state',
  }),
  Object.freeze({
    script: 'data-functional-perf-gate.ts',
    kind: 'timing',
    checks: 'data and functional operations against their frozen before-state',
  }),
  Object.freeze({
    script: 'scalar-text-hash-perf-gate.ts',
    kind: 'timing',
    checks: 'scalar, text, and hash operations against their frozen before-state',
  }),
  Object.freeze({
    script: 'structural-perf-gate.ts',
    kind: 'timing',
    checks: 'structural operations against their frozen before-state',
  }),
  Object.freeze({
    script: 'third-wave-perf-gate.ts',
    kind: 'timing',
    checks: 'the third-wave corpus and its pinned row projection',
  }),
  Object.freeze({
    script: 'transducer-collector-without-perf-gate.ts',
    kind: 'timing',
    checks: 'transducer and collector hot paths',
  }),
  Object.freeze({
    script: 's5b-construction-gate.ts',
    kind: 'timing',
    checks: 'optional operator-cache candidates and their recorded dispositions',
  }),
  Object.freeze({
    script: 'allocation-perf-gate.ts',
    kind: 'timing',
    checks: 'retained heap and allocation families per engine',
  }),
])

export const GATE_SCRIPTS: readonly string[] = Object.freeze(GATES.map((gate) => gate.script))
