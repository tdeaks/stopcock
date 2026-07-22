import { describe, expect, it } from 'vitest'
import { REGISTERED_OP_CODES, requireOpMeta } from '../../../fp/src/registry'
import { OPS_TABLE } from '../ops-table'

describe('ops-table snapshot', () => {
  it('matches the live @stopcock/fp registry', () => {
    const live = REGISTERED_OP_CODES.map((op) => {
      const meta = requireOpMeta(op)
      return { name: meta.name, callbackArity: meta.callbackArity, bindingCount: meta.bindings.length }
    })
    expect(OPS_TABLE).toEqual(live)
  })
})
