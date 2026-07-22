// Snapshots the subset of @stopcock/fp's registry this compiler needs
// (name, callbackArity, bindings length) into a checked-in TS module.
// The registry itself is not part of @stopcock/fp's public entry, so a
// packed consumer of @stopcock/fp-compiler can't import it at runtime --
// this file is the published surface instead. ops-table.test.ts asserts
// it stays in sync with the live workspace registry; drift fails CI.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { REGISTERED_OP_CODES, requireOpMeta } from '../../fp/src/registry'

interface OpsTableEntry {
  readonly name: string
  readonly callbackArity: 0 | 1 | 2
  readonly bindingCount: number
}

const entries: OpsTableEntry[] = REGISTERED_OP_CODES.map((op) => {
  const meta = requireOpMeta(op)
  return { name: meta.name, callbackArity: meta.callbackArity, bindingCount: meta.bindings.length }
})

const out = `// GENERATED FILE -- do not edit by hand.
// Run \`bun run scripts/gen-ops-table.ts\` from packages/fp-compiler to regenerate.
// Source of truth: packages/fp/src/registry.ts (REGISTERED_OP_CODES).

export interface OpsTableEntry {
  readonly name: string
  readonly callbackArity: 0 | 1 | 2
  readonly bindingCount: number
}

export const OPS_TABLE: readonly OpsTableEntry[] = ${JSON.stringify(entries, null, 2)}
`

const outPath = fileURLToPath(new URL('../src/ops-table.ts', import.meta.url))
writeFileSync(outPath, out)
console.log(`wrote ${entries.length} ops to ${outPath}`)
