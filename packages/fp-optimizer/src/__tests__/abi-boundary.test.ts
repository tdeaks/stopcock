import { describe, expect, it } from 'vite-plus/test'
import * as A from '@stopcock/fp/array'
import * as abi from '@stopcock/fp/abi'
import { negotiate, runExactFallback, vetOperator, vetPipeline } from '@stopcock/fp/abi'
import * as optimizer from '../abi-entry'
import { __compileVettedPlanForTest } from '../compile'
import { pipe } from '../fusion-engine'
import { buildOptimizerPlan, compatibilityCandidateForPlan } from '../abi-compatibility'
import { beginSelectionTrace, endSelectionTrace } from '../selection-trace'
import { evaluateInstalledOptimizerPair } from '../abi-compatibility'
import { OPTIMIZER_ABI_EXPECTATIONS } from '../abi-expectations.generated'

/**
 * S10X boundary evidence.
 *
 * The extraction is only worth anything if the boundary holds: provenance must
 * not leak, a mismatched pair must not run a specialized runner, and the answer
 * must not depend on which side served it.
 */

const double = (x: number) => x * 2
const big = (x: number) => x > 2

describe('the ABI does not leak authority', () => {
  it('exposes no way to register an operator or mint a fact', () => {
    // `is*`/`has*`/`get*` are queries. The first version of this flagged
    // `isCompactRegistered`, which reads the fact table and changes nothing.
    for (const name of Object.keys(abi)) {
      if (/^(is|has|get)[A-Z]/u.test(name)) continue
      // `OP_*` are numeric opcode constants, not entry points. Skipping them
      // is not a loophole: the forgery property below still runs against every
      // exported function, and `OP_FIND_OR_UNDEFINED` spells "define" only by
      // accident.
      if (name.startsWith('OP_')) continue
      expect(name).not.toMatch(/register|define|mint|install|addOperator/iu)
    }
  })

  it('cannot be made to trust a forged operator through any export', () => {
    // The name check above is a smell test. This is the property: run every
    // exported function against a forgery and it must still not authenticate.
    const forged = Object.assign((x: readonly number[]) => x, { _op: 1, fn: double })
    for (const [name, value] of Object.entries(abi)) {
      if (typeof value !== 'function' || name === 'runExactFallback') continue
      try {
        ;(value as (...args: readonly unknown[]) => unknown)(forged)
      } catch {
        // Rejecting the argument outright is a fine outcome.
      }
    }
    expect(vetOperator(forged)).toBeUndefined()
    expect(vetPipeline([forged]).fullyTrusted).toBe(false)
  })

  it('refuses a forged public tag exactly as FP does', () => {
    // A plain function wearing an `_op` field is what a forgery looks like.
    const forged = Object.assign((x: readonly number[]) => x, { _op: 1, fn: double })
    expect(vetOperator(forged)).toBeUndefined()

    const plan = vetPipeline([forged])
    expect(plan.fullyTrusted).toBe(false)
  })

  it('marks a genuine operator trusted and returns only data', () => {
    const entry = vetOperator(A.map(double))
    expect(entry).toBeDefined()
    expect(typeof entry?.op).toBe('number')
    // Only the vetted binding data crosses; no private table handle comes with it.
    expect(
      Object.keys(entry as object).every((key) => ['op', 'fn', 'a1', 'a2'].includes(key)),
    ).toBe(true)
  })

  it('separates public diagnostics from private quota authority', () => {
    const numeric = A.take(2)
    expect((numeric as { _op?: number })._op).toBe(abi.OP_TAKE)
    expect(vetOperator(numeric)).toMatchObject({ op: abi.OP_TAKE, fn: 2 })
    expect(vetPipeline([numeric]).codes).toEqual([abi.OP_TAKE])

    const coercible = A.take({ valueOf: () => 2 } as unknown as number)
    expect((coercible as { _op?: number })._op).toBe(abi.OP_TAKE)
    expect(vetOperator(coercible)).toMatchObject({ op: abi.OP_NON_FUSEABLE })
    const plan = vetPipeline([coercible])
    expect(plan.fullyTrusted).toBe(true)
    expect(plan.codes).toEqual([abi.OP_NON_FUSEABLE])
    expect(plan.bindings[0].opaqueFn).toBe(coercible)
  })

  it('still executes a forged step, just never as a specialized runner', () => {
    const forged = Object.assign((xs: readonly number[]) => xs.map(double), { _op: 1, fn: double })
    expect(pipe([1, 2, 3], forged as never)).toEqual([2, 4, 6])
  })
})

describe('identity negotiation fails closed', () => {
  it('agrees with the installed FP', () => {
    expect(optimizer.negotiationFailure).toBeUndefined()
    expect(() => optimizer.assertCompatible()).not.toThrow()
  })

  it.each([
    ['abiVersion', { ...abi.OPTIMIZER_ABI_IDENTITY, abiVersion: 99 }],
    ['protocolVersion', { ...abi.OPTIMIZER_ABI_IDENTITY, protocolVersion: 99 }],
    ['semanticManifestHash', { ...abi.OPTIMIZER_ABI_IDENTITY, semanticManifestHash: 'sha256:0' }],
    ['runnerSchemaHash', { ...abi.OPTIMIZER_ABI_IDENTITY, runnerSchemaHash: 'sha256:0' }],
    ['bindingSchemaHash', { ...abi.OPTIMIZER_ABI_IDENTITY, bindingSchemaHash: 'sha256:0' }],
    ['consumeSchemaHash', { ...abi.OPTIMIZER_ABI_IDENTITY, consumeSchemaHash: 'sha256:0' }],
    ['executionContractHash', { ...abi.OPTIMIZER_ABI_IDENTITY, executionContractHash: 'sha256:0' }],
  ])('rejects a mismatched %s', (_field, candidate) => {
    expect(negotiate(candidate)).toBeDefined()
  })

  it('does not accept a merely well-shaped identity', () => {
    // Structural duck-typing is the failure mode: an optimizer built against
    // different facts still presents the right shape.
    expect(
      negotiate({ ...abi.OPTIMIZER_ABI_IDENTITY, semanticManifestHash: 'sha256:wrong' }),
    ).toBeDefined()
  })

  it('uses a generated optimizer expectation distinct from the runtime bank identity', () => {
    expect(optimizer.abiIdentity).toEqual(OPTIMIZER_ABI_EXPECTATIONS.fpIdentity)
    expect(optimizer.bankIdentity).toEqual(OPTIMIZER_ABI_EXPECTATIONS.optimizerBank)
  })

  it('binds the bank to the same semantic manifest it negotiates on', () => {
    expect(optimizer.bankIdentity.semanticManifestHash).toBe(
      abi.OPTIMIZER_ABI_IDENTITY.semanticManifestHash,
    )
  })

  it('compares the captured installed FP identity rather than the optimizer expectation', () => {
    const local = vetPipeline([])
    expect(
      evaluateInstalledOptimizerPair({
        instanceToken: local.instanceToken,
        identity: { ...local.identity, protocolVersion: local.identity.protocolVersion + 1 },
      }),
    ).toMatchObject({ eligible: false, reason: 'FP protocol version differs' })
    expect(
      evaluateInstalledOptimizerPair({
        instanceToken: local.instanceToken,
        identity: local.identity,
      }),
    ).toEqual({ eligible: true })
    expect(
      evaluateInstalledOptimizerPair(
        { instanceToken: local.instanceToken, identity: local.identity },
        { ...optimizer.bankIdentity, bankHash: 'sha256:swapped-bank' },
      ),
    ).toMatchObject({ eligible: false, reason: 'optimizer bank hash differs' })
  })
})

describe('specialized execution uses the public compatibility decision', () => {
  const steps = [A.map(double), A.filter(big)]
  const plan = buildOptimizerPlan(steps, 'exact')
  const baseline = compatibilityCandidateForPlan(plan, 'exact')
  const input = [1, 2, 3, 4]

  const mismatches = [
    [
      'FP ABI',
      {
        ...baseline,
        fpIdentity: { ...baseline.fpIdentity, abiVersion: baseline.fpIdentity.abiVersion + 1 },
      },
    ],
    [
      'FP protocol',
      {
        ...baseline,
        fpIdentity: {
          ...baseline.fpIdentity,
          protocolVersion: baseline.fpIdentity.protocolVersion + 1,
        },
      },
    ],
    [
      'FP semantic manifest',
      {
        ...baseline,
        fpIdentity: { ...baseline.fpIdentity, semanticManifestHash: 'sha256:foreign' },
      },
    ],
    [
      'FP runner schema',
      { ...baseline, fpIdentity: { ...baseline.fpIdentity, runnerSchemaHash: 'sha256:foreign' } },
    ],
    [
      'FP binding schema',
      { ...baseline, fpIdentity: { ...baseline.fpIdentity, bindingSchemaHash: 'sha256:foreign' } },
    ],
    [
      'FP consume schema',
      { ...baseline, fpIdentity: { ...baseline.fpIdentity, consumeSchemaHash: 'sha256:foreign' } },
    ],
    [
      'FP execution contract',
      {
        ...baseline,
        fpIdentity: { ...baseline.fpIdentity, executionContractHash: 'sha256:foreign' },
      },
    ],
    [
      'optimizer bank hash',
      { ...baseline, optimizerBank: { ...baseline.optimizerBank, bankHash: 'sha256:foreign' } },
    ],
    [
      'optimizer bank schema',
      {
        ...baseline,
        optimizerBank: {
          ...baseline.optimizerBank,
          schemaVersion: baseline.optimizerBank.schemaVersion + 1,
        },
      },
    ],
    ['requested semantic mode', { ...baseline, requestedMode: 'pure' as const }],
    ['unsupported layout', { ...baseline, layout: 'sparse-array' }],
    [
      'malformed binding cardinality',
      {
        ...baseline,
        shape: { ...baseline.shape, bindingCount: baseline.shape.bindingCount + 1 },
      },
    ],
    [
      'non-integer opcode',
      {
        ...baseline,
        shape: { ...baseline.shape, codes: [baseline.shape.codes[0], Number.NaN] },
      },
    ],
    [
      'non-contiguous segments',
      {
        ...baseline,
        shape: {
          ...baseline.shape,
          segments: baseline.shape.segments.map((segment, index) =>
            index === 0 ? { ...segment, startIndex: segment.startIndex + 1 } : segment,
          ),
        },
      },
    ],
    ['opaque or foreign provenance', { ...baseline, fullyTrusted: false }],
    ['duplicate FP instance token', { ...baseline, fpInstanceToken: Object.freeze({}) }],
  ] as const

  it.each(mismatches)(
    '%s falls back without an executed specialized event',
    (_label, candidate) => {
      const decision = optimizer.evaluateCompatibility(candidate)
      expect(decision.eligible).toBe(false)

      beginSelectionTrace()
      const runner = __compileVettedPlanForTest(plan, 'exact', candidate)
      expect(runner(input)).toEqual(runExactFallback(plan, input))
      expect(endSelectionTrace().filter((event) => event.phase === 'executed')).toEqual([])
    },
  )

  it('accepts a compatible pure plan only when pure is requested', () => {
    const purePlan = buildOptimizerPlan(steps, 'pure')
    const pureCandidate = compatibilityCandidateForPlan(purePlan, 'pure')
    expect(optimizer.evaluateCompatibility(pureCandidate)).toEqual({ eligible: true })
    expect(
      optimizer.evaluateCompatibility({ ...pureCandidate, requestedMode: 'exact' }),
    ).toMatchObject({
      eligible: false,
    })
  })
})

describe('the exact fallback answers identically', () => {
  it.each([
    ['map -> filter', [A.map(double), A.filter(big)]],
    [
      'map -> filter -> reduce',
      [A.map(double), A.filter(big), A.reduce((a: number, b: number) => a + b, 0)],
    ],
    ['filter -> map -> take', [A.filter(big), A.map(double), A.take(2)]],
    ['find', [A.map(double), A.find((x: number) => x > 4)]],
  ])('%s', (_label, steps) => {
    const input = [1, 2, 3, 4, 5]
    const viaOptimizer = (pipe as (...args: readonly unknown[]) => unknown)(input, ...steps)
    const viaFallback = runExactFallback(vetPipeline(steps), input)
    expect(viaOptimizer).toEqual(viaFallback)
  })
})
