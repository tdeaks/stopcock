// Snapshots the registry metadata for operators that are actually exported
// from @stopcock/fp/array into a checked-in TS module. The registry itself
// is internal, so a packed compiler consumer cannot import it at runtime.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as ArrayOps from '../../fp/src/array'
import { REGISTERED_OP_CODES, requireOpMeta } from '../../fp/src/registry'

interface OpsTableEntry {
  readonly name: string
  readonly callbackArity: 0 | 1 | 2
  readonly bindings: readonly ('fn' | 'a1' | 'a2')[]
}

const publicArrayExports = new Set(Object.keys(ArrayOps))
const entries: OpsTableEntry[] = REGISTERED_OP_CODES
  .map(requireOpMeta)
  .filter((meta) => publicArrayExports.has(meta.name))
  .map((meta) => ({
    name: meta.name,
    callbackArity: meta.callbackArity,
    bindings: meta.bindings,
  }))

const out = `// GENERATED FILE -- do not edit by hand.
// Run \`bun run scripts/gen-ops-table.ts\` from packages/fp-compiler to regenerate.
// Sources of truth: packages/fp/src/array.ts public exports and registry metadata.

export interface OpsTableEntry {
  readonly name: string
  readonly callbackArity: 0 | 1 | 2
  readonly bindings: readonly ('fn' | 'a1' | 'a2')[]
}

export const OPS_TABLE: readonly OpsTableEntry[] = ${JSON.stringify(entries, null, 2)}
`

const outPath = fileURLToPath(new URL('../src/ops-table.ts', import.meta.url))
writeFileSync(outPath, out)
console.log(`wrote ${entries.length} ops to ${outPath}`)
