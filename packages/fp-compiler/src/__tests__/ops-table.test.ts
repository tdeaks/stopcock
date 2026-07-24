import { describe, expect, it } from 'vitest'
import * as ArrayOps from '../../../fp/src/array'
import { REGISTERED_OP_CODES, requireOpMeta } from '../../../fp/src/registry'
import { OPS_TABLE } from '../ops-table'

describe('ops-table snapshot', () => {
  it('matches the public @stopcock/fp/array operators in the live registry', () => {
    const publicArrayExports = new Set(Object.keys(ArrayOps))
    const live = REGISTERED_OP_CODES
      .map(requireOpMeta)
      .filter((meta) => publicArrayExports.has(meta.name))
      .map((meta) => ({
        name: meta.name,
        callbackArity: meta.callbackArity,
        bindings: meta.bindings,
      }))
    expect(OPS_TABLE).toEqual(live)
  })
})
