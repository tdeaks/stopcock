// The checked-in table is generated from definition-only semantic and
// lowering records. This module derives every compiler classification from
// that projection; it does not restate runtime registry facts.
import {
  BOUNDARY_OP_NAMES,
  ELEMENT_OP_NAMES,
  FINAL_BOUNDARY_OP_NAMES,
  OPS_TABLE,
  TERMINAL_OP_NAMES,
  type OpEmit,
  type OpsTableEntry,
} from './ops-table'

export type ElementOpName = (typeof ELEMENT_OP_NAMES)[number]
export type TerminalOpName = (typeof TERMINAL_OP_NAMES)[number]
export type BoundaryOpName = (typeof BOUNDARY_OP_NAMES)[number]

export const ELEMENT_OPS: ReadonlySet<string> = new Set(ELEMENT_OP_NAMES)
export const TERMINAL_OPS: ReadonlySet<string> = new Set(TERMINAL_OP_NAMES)
export const BOUNDARY_OPS: ReadonlySet<string> = new Set(BOUNDARY_OP_NAMES)
export const FINAL_BOUNDARY_OPS: ReadonlySet<string> = new Set(FINAL_BOUNDARY_OP_NAMES)

export type CompilerOperatorFact = Pick<
  OpsTableEntry,
  | 'name'
  | 'bindings'
  | 'semanticId'
  | 'semanticRevision'
  | 'inputDomain'
  | 'outputDomain'
  | 'cardinality'
  | 'loweringId'
  | 'loweringRevision'
  | 'compilerPipelineRole'
>

const operatorFacts = new Map(
  OPS_TABLE.map((entry) => [entry.name, entry satisfies CompilerOperatorFact] as const),
)

/** Generated semantic/lowering fact for a statically resolved operator. */
export function compilerOperatorFact(name: string): CompilerOperatorFact | undefined {
  return operatorFacts.get(name)
}

const emitByName = new Map(OPS_TABLE.map((entry) => [entry.name, entry.emit]))

/** The compiled emission template for a statically resolved operator. */
export function opEmitFor(name: string): OpEmit | undefined {
  return emitByName.get(name)
}

/** Ops this wave's fuser can lower, keyed by name for source-level lookup. */
export const SUPPORTED_OP_NAMES: ReadonlySet<string> = new Set([
  ...ELEMENT_OPS,
  ...TERMINAL_OPS,
  ...BOUNDARY_OPS,
])

const nameToArity = new Map<string, 0 | 1 | 2>()
const nameToBindings = new Map<string, readonly ('fn' | 'a1' | 'a2')[]>()
const bareOps = new Set<string>()
for (const entry of OPS_TABLE) {
  if (!SUPPORTED_OP_NAMES.has(entry.name)) continue
  nameToArity.set(entry.name, entry.callbackArity)
  nameToBindings.set(entry.name, entry.bindings)
  // Ops with no bound slots at all (registry bindings: []) are exported as
  // the tagged step value itself (e.g. `sum._op = 41`), not a factory you
  // call to produce one. Used bare in a pipeline: `A.sum`, never `A.sum()`
  // -- invoking them calls the data-first form with no data and throws.
  if (entry.bindings.length === 0) bareOps.add(entry.name)
}

/** Number of user-supplied callback/value arguments the op invokes, per the registry. */
export function callbackArity(name: string): 0 | 1 | 2 | undefined {
  return nameToArity.get(name)
}

/** Tagged step slots captured by the data-last operator factory. */
export function bindingSlots(name: string): readonly ('fn' | 'a1' | 'a2')[] | undefined {
  return nameToBindings.get(name)
}

/** True for ops that are used bare as a pipe step (no call), like `A.sum`. */
export function isBareOp(name: string): boolean {
  return bareOps.has(name)
}

/**
 * Names that are re-exports of another operator rather than operators of their
 * own. `A.first` *is* `A.head` -- the same tagged function under a second
 * name -- so a pipeline step written with the alias lowers to the operator it
 * points at. Resolving here rather than minting a second opcode keeps one
 * runtime function with one tag.
 */
const OPERATOR_ALIASES: ReadonlyMap<string, string> = new Map([
  ['first', 'head'],
  ['firstOrUndefined', 'headOrUndefined'],
])

/** Canonical operator name for a step's imported name. */
export function canonicalOpName(name: string): string {
  return OPERATOR_ALIASES.get(name) ?? name
}

/** True if `name` is a registered public array op, even if unsupported this wave. */
export function isRegistryOpName(name: string): boolean {
  return OPS_TABLE.some((entry) => entry.name === name)
}
