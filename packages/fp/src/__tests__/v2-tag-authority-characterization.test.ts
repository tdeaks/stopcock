import { describe, expect, it } from 'vite-plus/test'
import { buildPlan } from '../plan'
import { REGISTERED_OP_CODES } from '../registry'

interface Characterization {
  readonly publicOpcode: number
  readonly observedPlanOpcode: number
  readonly forgedBinding: unknown
  readonly observedBinding: unknown
}

describe('Stopcock 1.x public-tag authority characterization', () => {
  it('demonstrates that every valid public opcode and binding is currently trusted', () => {
    const characterization: Characterization[] = REGISTERED_OP_CODES.map((publicOpcode) => {
      const forgedBinding = Object.freeze({ marker: publicOpcode })
      const forged = Object.assign((value: unknown) => value, {
        _op: publicOpcode,
        _fn: forgedBinding,
      })
      const plan = buildPlan([forged])
      return {
        publicOpcode,
        observedPlanOpcode: plan.shape.codes[0],
        forgedBinding,
        observedBinding: plan.bindings[0].fn,
      }
    })

    expect(characterization.map(({ publicOpcode }) => publicOpcode)).toEqual(REGISTERED_OP_CODES)
    expect(characterization).toHaveLength(REGISTERED_OP_CODES.length)
    expect(
      characterization.every(
        ({ publicOpcode, observedPlanOpcode }) => observedPlanOpcode === publicOpcode,
      ),
    ).toBe(true)
    expect(
      characterization.every(
        ({ forgedBinding, observedBinding }) => observedBinding === forgedBinding,
      ),
    ).toBe(true)
  })
})
