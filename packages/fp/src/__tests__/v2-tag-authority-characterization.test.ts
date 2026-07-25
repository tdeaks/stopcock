import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import { dual } from '../dual'
import { registerTrustedOperator, trustedOperatorEntry } from '../internal/provenance'
import { OP_NON_FUSEABLE } from '../opcodes'
import { buildPlan } from '../plan'
import { pipe } from '../pipe'
import { REGISTERED_OP_CODES } from '../registry'

/**
 * This file used to characterize the 1.x behaviour: any function carrying a
 * valid `_op` was trusted, and its `_fn`/`_a1`/`_a2` fields became kernel
 * bindings. S5A removed that authority. The public fields still exist and are
 * still readable, but only a function this package constructed can reach a
 * fused plan.
 */
describe('public tag fields no longer grant optimized execution', () => {
  it('makes every valid in-range opcode forgery generic', () => {
    const observed = REGISTERED_OP_CODES.map((publicOpcode) => {
      const forgedBinding = Object.freeze({ marker: publicOpcode })
      const forged = Object.assign((value: unknown) => value, {
        _op: publicOpcode,
        _fn: forgedBinding,
        _a1: forgedBinding,
        _a2: forgedBinding,
      })
      const plan = buildPlan([forged])
      return {
        publicOpcode,
        observedPlanOpcode: plan.shape.codes[0],
        observedBinding: plan.bindings[0].fn,
        opaqueFn: plan.bindings[0].opaqueFn,
      }
    })

    expect(observed).toHaveLength(REGISTERED_OP_CODES.length)
    expect(observed.every((row) => row.observedPlanOpcode === OP_NON_FUSEABLE)).toBe(true)
    expect(observed.every((row) => row.observedBinding === undefined)).toBe(true)
    expect(observed.every((row) => typeof row.opaqueFn === 'function')).toBe(true)
  })

  it('keeps a forged operator callable and correct through the generic path', () => {
    const forged = Object.assign((value: readonly number[]) => value.map((x) => x + 1), {
      _op: 1,
      _fn: (x: number) => x * 1000,
    })
    expect(pipe([1, 2, 3], forged)).toEqual([2, 3, 4])
  })

  it('makes an out-of-range forged opcode generic instead of throwing', () => {
    const forged = Object.assign((value: readonly number[]) => value, { _op: 1_000_000 })
    expect(buildPlan([forged]).shape.codes[0]).toBe(OP_NON_FUSEABLE)
    expect(
      pipe(
        [1, 2, 3],
        A.map((x: number) => x * 2),
        forged,
      ),
    ).toEqual([2, 4, 6])
  })

  it('keeps public dual-created operators callable but generic', () => {
    const tagged = dual(2, (arr: readonly number[], f: (x: number) => number) => arr.map(f), {
      op: 'map',
    }) as unknown as (f: (x: number) => number) => (arr: readonly number[]) => number[]
    const operator = tagged((x: number) => x * 2)
    expect((operator as unknown as { _op: number })._op).toBeGreaterThan(0)
    expect(trustedOperatorEntry(operator)).toBeUndefined()
    expect(buildPlan([operator]).shape.codes[0]).toBe(OP_NON_FUSEABLE)
    expect(operator([1, 2, 3])).toEqual([2, 4, 6])
  })
})

describe('trusted operators ignore their own public fields', () => {
  it('binds from provenance when the public fields are deleted', () => {
    const operator = A.map((x: number) => x * 3) as unknown as Record<string, unknown>
    delete operator._op
    delete operator._fn
    const plan = buildPlan([operator])
    expect(plan.shape.codes[0]).not.toBe(OP_NON_FUSEABLE)
    expect(pipe([1, 2], operator as never)).toEqual([3, 6])
  })

  it('binds from provenance when the public fields are overwritten', () => {
    const operator = A.map((x: number) => x * 3) as unknown as Record<string, unknown>
    operator._op = 2
    operator._fn = (x: number) => x * 1000
    operator._a1 = 'nonsense'
    expect(pipe([1, 2], operator as never)).toEqual([3, 6])
    expect(buildPlan([operator]).bindings[0].a1).toBeUndefined()
  })

  it('does not transfer authority to a copy of a trusted operator', () => {
    const operator = A.map((x: number) => x * 3)
    const copy = Object.assign((value: unknown) => (operator as (v: unknown) => unknown)(value), {
      ...(operator as unknown as Record<string, unknown>),
    })
    expect(buildPlan([copy]).shape.codes[0]).toBe(OP_NON_FUSEABLE)
  })

  it('keeps each call site on its own bindings', () => {
    const first = A.map((x: number) => x + 1)
    const second = A.map((x: number) => x * 100)
    expect(pipe([1, 2], first)).toEqual([2, 3])
    expect(pipe([1, 2], second)).toEqual([100, 200])
    expect(pipe([1, 2], first)).toEqual([2, 3])
  })

  it('does not reuse bindings across same-shape pipelines', () => {
    const a = pipe(
      [1, 2, 3],
      A.map((x: number) => x + 1),
      A.filter((x: number) => x > 2),
    )
    const b = pipe(
      [1, 2, 3],
      A.map((x: number) => x * 10),
      A.filter((x: number) => x > 15),
    )
    expect(a).toEqual([3, 4])
    expect(b).toEqual([20, 30])
  })
})

describe('provenance is unforgeable from outside the package', () => {
  it('is absent from the public export map', async () => {
    const root = (await import('../index')) as Record<string, unknown>
    for (const name of Object.keys(root)) {
      expect(name).not.toMatch(/provenance|registerTrusted|defineOperator/iu)
    }
  })

  it('cannot be granted by a second table', () => {
    // A duplicate install has its own WeakMap. An entry made in a foreign
    // table is invisible here.
    const foreign = new WeakMap<object, { op: number }>()
    const impostor = (value: unknown) => value
    foreign.set(impostor, { op: 1 })
    expect(trustedOperatorEntry(impostor)).toBeUndefined()
    expect(buildPlan([impostor]).shape.codes[0]).toBe(OP_NON_FUSEABLE)
  })

  it('records only what generated code passes it', () => {
    const operator = registerTrustedOperator((value: unknown) => value, 1, 'callback')
    expect(trustedOperatorEntry(operator)).toEqual({
      op: 1,
      fn: 'callback',
      a1: undefined,
      a2: undefined,
    })
  })

  it('reports nothing for non-functions', () => {
    for (const candidate of [undefined, null, 0, 'map', {}, []]) {
      expect(trustedOperatorEntry(candidate)).toBeUndefined()
    }
  })
})
