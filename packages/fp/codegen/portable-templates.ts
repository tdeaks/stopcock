/**
 * Portable template generator. Emits src/portable-templates.ts: checked-in,
 * hand-shaped fused loop functions for the highest-frequency stream-segment
 * shapes (chains of map/filter/reject/filterMap, optionally take-limited,
 * plus the highest-value sink fusions). No runtime codegen — this script
 * runs at build time only; the emitted file is plain TypeScript.
 *
 * Usage: bun run codegen/portable-templates.ts
 */
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..')
const OUT = join(ROOT, 'src', 'portable-templates.ts')

// Must match src/opcodes.ts.
const OP_MAP = 1
const OP_FILTER = 2
const OP_TAKE = 3
const OP_FLAT_MAP = 7
const OP_REDUCE = 8
const OP_EVERY = 10
const OP_SOME = 11
const OP_FIND = 12
const OP_FIND_INDEX = 13
const OP_FILTER_MAP = 14
const OP_REJECT = 16
const OP_NONE = 17
const OP_COUNT = 18
const OP_FIND_MAP = 22
const OP_SUM = 41

type StageKind = 'map' | 'filter' | 'reject' | 'filterMap'

const STAGES: { kind: StageKind; op: number }[] = [
  { kind: 'map', op: OP_MAP },
  { kind: 'filter', op: OP_FILTER },
  { kind: 'reject', op: OP_REJECT },
  { kind: 'filterMap', op: OP_FILTER_MAP },
]

function chainsUpToLength(maxLen: number): { kind: StageKind; op: number }[][] {
  const out: { kind: StageKind; op: number }[][] = []
  const build = (prefix: { kind: StageKind; op: number }[]): void => {
    if (prefix.length > 0) out.push(prefix)
    if (prefix.length === maxLen) return
    for (const s of STAGES) build([...prefix, s])
  }
  build([])
  return out
}

interface EmittedFn {
  readonly name: string
  readonly code: string
}

const CALLBACK_LANES = 4
const CALLBACK_LANE_MIN_LENGTH = 512

/**
 * V8 speculatively inlines a monomorphic callback at each direct callsite.
 * A shared shape template is intentionally reused by many independently
 * compiled pipelines, so changing callback identities can otherwise
 * invalidate every callsite in the loop at once. Split the handful of
 * callback-dense, highest-frequency templates across a bounded bank of
 * static loop bodies. Bindings are weakly assigned to a lane; there is no
 * runtime code generation and no user callback is retained. Bun/JSC keeps
 * the direct body for small arrays, where its callsite does not suffer the
 * V8 deopt and an extra lane call would dominate the useful work.
 */
function emitCallbackLanes(fn: EmittedFn, bunDirectForAllSizes = false): EmittedFn {
  const laneFns = Array.from({ length: CALLBACK_LANES }, (_, lane) =>
    fn.code.replace(`export function ${fn.name}(`, `function ${fn.name}_lane${lane}(`),
  ).join('\n')
  const lastLane = CALLBACK_LANES - 1
  const declarations = `const ${fn.name}_lanes = new WeakMap<object, number>()
let ${fn.name}_nextLane = 0
`
  const bodyStart = fn.code.indexOf('{\n')
  if (bodyStart === -1 || !fn.code.endsWith('}\n')) {
    throw new Error(`portable template has no function body: ${fn.name}`)
  }
  const cases = Array.from(
    { length: CALLBACK_LANES - 1 },
    (_, lane) =>
      `      case ${lane}: return ${fn.name}_lane${lane}(src, bindings, offset, limit, meta)`,
  ).join('\n')
  const useLanes = bunDirectForAllSizes
    ? '!IS_BUN_RUNTIME'
    : `!IS_BUN_RUNTIME || src.length >= ${CALLBACK_LANE_MIN_LENGTH}`
  const dispatch = `  if (${useLanes}) {
    let lane = ${fn.name}_lanes.get(bindings)
    if (lane === undefined) {
      lane = ${fn.name}_nextLane
      ${fn.name}_nextLane = (${fn.name}_nextLane + 1) & ${lastLane}
      ${fn.name}_lanes.set(bindings, lane)
    }
    switch (lane) {
${cases}
      default: return ${fn.name}_lane${lastLane}(src, bindings, offset, limit, meta)
    }
  }
`
  const directSmall = fn.code.slice(0, bodyStart + 2) + dispatch + fn.code.slice(bodyStart + 2)
  return {
    name: fn.name,
    code: `${laneFns}\n${declarations}\n${directSmall}`,
  }
}

function usesCallbackLanesForArray(
  chain: readonly { kind: StageKind; op: number }[],
  withLimit: boolean,
): boolean {
  if (withLimit) return false
  const key = chain.map((stage) => stage.op).join(',')
  return (
    key === `${OP_MAP}` ||
    key === `${OP_FILTER}` ||
    key === `${OP_MAP},${OP_FILTER}` ||
    key === `${OP_MAP},${OP_FLAT_MAP}` ||
    key === `${OP_FILTER},${OP_FILTER_MAP}`
  )
}

function usesCallbackLanesForSink(
  chain: readonly { kind: StageKind; op: number }[],
  sink: SinkKind,
): boolean {
  if (sink !== 'reduce' && sink !== 'find') return false
  const key = chain.map((stage) => stage.op).join(',')
  return (
    key === `${OP_FILTER}` ||
    key === `${OP_MAP},${OP_FILTER}` ||
    key === `${OP_FILTER},${OP_FILTER_MAP}`
  )
}

/** Emits the per-stage transform for one chain step, threading value `v${i}`. */
function emitStage(
  stage: { kind: StageKind; op: number },
  i: number,
  prevVar: string,
): { lines: string[]; varName: string } {
  const f = `f${i}`
  switch (stage.kind) {
    case 'map':
      return { lines: [`const v${i} = ${f}(${prevVar})`], varName: `v${i}` }
    case 'filter':
      return { lines: [`if (!${f}(${prevVar})) continue`], varName: prevVar }
    case 'reject':
      return { lines: [`if (${f}(${prevVar})) continue`], varName: prevVar }
    case 'filterMap':
      return {
        lines: [`const v${i} = ${f}(${prevVar})`, `if (v${i} == null) continue`],
        varName: `v${i}`,
      }
  }
}

function nameFor(codes: readonly number[], suffix: string): string {
  return `t_${codes.join('_')}${suffix}`
}

function emitArrayTemplate(
  chain: { kind: StageKind; op: number }[],
  withLimit: boolean,
): EmittedFn {
  const codes = [...chain.map((s) => s.op), ...(withLimit ? [OP_TAKE] : [])]
  const name = nameFor(codes, withLimit ? '_lim' : '')
  const binds = chain
    .map((_, i) => `  const f${i} = bindings[offset + ${i}].fn as (v: unknown) => unknown`)
    .join('\n')
  const lines: string[] = []
  let cur = 'x'
  for (let i = 0; i < chain.length; i++) {
    const r = emitStage(chain[i], i, cur)
    lines.push(...r.lines)
    cur = r.varName
  }
  // withLimit reports the exact number of source elements actually read on
  // early exit: `src[i]` is read every iteration before the limit check, so
  // breaking at index i means i+1 elements were read -- take(1) over a
  // million elements must credit 1, not the source length, for accurate
  // tier-promotion accounting (see compile.ts's dispatchAndTrack). When the
  // loop runs to completion instead, the caller's pre-set src.length default
  // (lower.ts) is already correct and this template leaves it alone.
  const limitCheck = withLimit
    ? `      if (limit !== -1 && out.length === limit) {
        if (meta) meta.consumed = i + 1
        break
      }\n`
    : ''
  // Every public array operator snapshots the source length before its first
  // callback. Besides preserving that observable mutation boundary for fused
  // pipelines, hoisting the read keeps it out of every hot-loop condition.
  const code = `export function ${name}(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
${binds}
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
${lines.map((l) => '    ' + l).join('\n')}
${limitCheck}    out.push(${cur})
  }
  return out
}
`
  return { name, code }
}

type SinkKind =
  | 'reduce'
  | 'count'
  | 'sum'
  | 'every'
  | 'some'
  | 'find'
  | 'findIndex'
  | 'none'
  | 'findMap'

const SINK_OPS: Readonly<Record<SinkKind, number>> = {
  reduce: OP_REDUCE,
  count: OP_COUNT,
  sum: OP_SUM,
  every: OP_EVERY,
  some: OP_SOME,
  find: OP_FIND,
  findIndex: OP_FIND_INDEX,
  none: OP_NONE,
  findMap: OP_FIND_MAP,
}

const SHORT_CIRCUIT_SINKS: readonly SinkKind[] = [
  'every',
  'some',
  'find',
  'findIndex',
  'none',
  'findMap',
]

function emitSinkTemplate(
  chain: readonly { kind: StageKind; op: number }[],
  sink: SinkKind,
): EmittedFn {
  const sinkOp = SINK_OPS[sink]
  const codes = [...chain.map((stage) => stage.op), sinkOp]
  const name = nameFor(codes, `_${sink}`)
  const binds = chain
    .map((_, i) => `  const f${i} = bindings[offset + ${i}].fn as (v: unknown) => unknown`)
    .join('\n')
  const lines: string[] = []
  let finalVar = 'x'
  for (let i = 0; i < chain.length; i++) {
    const stage = emitStage(chain[i], i, finalVar)
    lines.push(...stage.lines)
    finalVar = stage.varName
  }
  const stageLines = lines.map((line) => `    ${line}`).join('\n')
  const sinkIndex = chain.length
  const bindBlock = binds.length > 0 ? `${binds}\n` : ''

  if (sink === 'reduce') {
    const code = `export function ${name}(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
${bindBlock}  const fr = bindings[offset + ${sinkIndex}].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + ${sinkIndex}].a1
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
${stageLines}
    acc = fr(acc, ${finalVar})
  }
  return acc
}
`
    return { name, code }
  }
  if (sink === 'count') {
    const code = `export function ${name}(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
${bindBlock}  const fs = bindings[offset + ${sinkIndex}].fn as (v: unknown) => boolean
  let count = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
${stageLines}
    if (fs(${finalVar})) count++
  }
  return count
}
`
    return { name, code }
  }
  if (sink === 'sum') {
    // sum: cross-segment fusion (stream chain of length 1 immediately followed
    // by the OP_SUM materializer boundary). No binding needed for sum itself.
    const code = `export function ${name}(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
${bindBlock}  let sum = 0
  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
${stageLines}
    sum += ${finalVar} as number
  }
  return sum
}
`
    return { name, code }
  }

  const sinkBind = `  const fs = bindings[offset + ${sinkIndex}].fn as (v: unknown) => unknown`
  const earlyMeta = `if (meta) meta.consumed = i + 1`
  let sinkBody = ''
  let fallback = ''
  switch (sink) {
    case 'every':
      sinkBody = `if (!fs(${finalVar})) {
      ${earlyMeta}
      return false
    }`
      fallback = 'true'
      break
    case 'some':
      sinkBody = `if (fs(${finalVar})) {
      ${earlyMeta}
      return true
    }`
      fallback = 'false'
      break
    case 'find':
      sinkBody = `if (fs(${finalVar})) {
      ${earlyMeta}
      return optionSome(${finalVar})
    }`
      fallback = 'optionNone'
      break
    case 'findIndex':
      sinkBody = `if (fs(${finalVar})) {
      ${earlyMeta}
      return optionSome(index)
    }
    index++`
      fallback = 'optionNone'
      break
    case 'none':
      sinkBody = `if (fs(${finalVar})) {
      ${earlyMeta}
      return false
    }`
      fallback = 'true'
      break
    case 'findMap':
      sinkBody = `const mapped = fs(${finalVar})
    if (mapped != null) {
      ${earlyMeta}
      return optionSome(mapped)
    }`
      fallback = 'optionNone'
      break
  }
  const indexDeclaration = sink === 'findIndex' ? '  let index = 0\n' : ''
  const code = `export function ${name}(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
${bindBlock}${sinkBind}
${indexDeclaration}  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
${stageLines}
    ${sinkBody}
  }
  return ${fallback}
}
`
  return { name, code }
}

/** Emits a direct flatMap collection loop, optionally preceded by map. */
function emitFlatMapCollectTemplate(withMap: boolean): EmittedFn {
  const codes = withMap ? [OP_MAP, OP_FLAT_MAP] : [OP_FLAT_MAP]
  const name = nameFor(codes, '')
  const mapBind = withMap ? `  const fm = bindings[offset].fn as (v: unknown) => unknown\n` : ''
  const flatMapOffset = withMap ? 1 : 0
  const sourceValue = withMap ? 'fm(x)' : 'x'
  const code = `export function ${name}(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
${mapBind}  const ff = bindings[offset + ${flatMapOffset}].fn as (v: unknown) => Iterable<unknown>
  const sourceLength = src.length
  const out: unknown[] = []
  for (let i = 0; i < sourceLength; i++) {
    const x = src[i]
    const items = ff(${sourceValue})
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) out.push(items[j])
    } else {
      for (const item of items) out.push(item)
    }
  }
  return out
}
`
  return { name, code }
}

type LongFlatMapSink = 'collect' | 'reduce' | 'find'

/**
 * Emits the corpus's common long shape as one nested loop. Keeping this
 * explicit avoids the combinatorial code-size cost of generating arbitrary
 * flatMap trees while removing the generic stage-machine dispatch from the
 * shape that dominates the 4+ stage corpus.
 */
function emitLongFlatMapTemplate(sink: LongFlatMapSink): EmittedFn {
  const sinkOp = sink === 'reduce' ? OP_REDUCE : sink === 'find' ? OP_FIND : undefined
  const codes = [
    OP_MAP,
    OP_FLAT_MAP,
    OP_FILTER,
    OP_FILTER_MAP,
    ...(sinkOp === undefined ? [] : [sinkOp]),
  ]
  const name = nameFor(codes, sink === 'collect' ? '' : `_${sink}`)
  const sinkBindings =
    sink === 'reduce'
      ? `  const fs = bindings[offset + 4].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 4].a1
`
      : sink === 'find'
        ? `  const fs = bindings[offset + 4].fn as (v: unknown) => boolean
`
        : `  const out: unknown[] = []
`
  const consume =
    sink === 'reduce'
      ? '      acc = fs(acc, mapped)'
      : sink === 'find'
        ? `      if (fs(mapped)) {
        if (meta) meta.consumed = i + 1
        return optionSome(mapped)
      }`
        : '      out.push(mapped)'
  const fallback = sink === 'reduce' ? 'acc' : sink === 'find' ? 'optionNone' : 'out'
  const code = `export function ${name}(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const fm = bindings[offset].fn as (v: unknown) => unknown
  const ff = bindings[offset + 1].fn as (v: unknown) => Iterable<unknown>
  const fp = bindings[offset + 2].fn as (v: unknown) => boolean
  const fmo = bindings[offset + 3].fn as (v: unknown) => unknown
${sinkBindings}  const sourceLength = src.length
  for (let i = 0; i < sourceLength; i++) {
    const items = ff(fm(src[i]))
    if (Array.isArray(items)) {
      const itemLength = items.length
      for (let j = 0; j < itemLength; j++) {
        const item = items[j]
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
${consume}
      }
    } else {
      for (const item of items) {
        if (!fp(item)) continue
        const mapped = fmo(item)
        if (mapped == null) continue
${consume}
      }
    }
  }
  return ${fallback}
}
`
  return { name, code }
}

function sinkManifestEntry(
  chain: readonly { kind: StageKind; op: number }[],
  sink: SinkKind,
  fn: EmittedFn,
): string {
  const opcodes = [...chain.map((stage) => stage.op), SINK_OPS[sink]]
  if (sink === 'sum') {
    return `  { key: '${chain[0].op}>SUM', opcodes: [${opcodes.join(', ')}], kind: 'sum', run: ${fn.name} }`
  }
  return `  { key: '${opcodes.join(',')}', opcodes: [${opcodes.join(', ')}], kind: '${sink}', run: ${fn.name} }`
}

function longSinkManifestEntry(sink: Exclude<LongFlatMapSink, 'collect'>, fn: EmittedFn): string {
  const sinkOp = sink === 'reduce' ? OP_REDUCE : OP_FIND
  const opcodes = [OP_MAP, OP_FLAT_MAP, OP_FILTER, OP_FILTER_MAP, sinkOp]
  return `  { key: '${opcodes.join(',')}', opcodes: [${opcodes.join(', ')}], kind: '${sink}', run: ${fn.name} }`
}

function main(): void {
  const chains = chainsUpToLength(3)
  const fns: EmittedFn[] = []
  const manifestArray: string[] = []
  const manifestSink: string[] = []
  const sinkKeys = new Set<string>()

  const addSink = (chain: readonly { kind: StageKind; op: number }[], sink: SinkKind): void => {
    const key = [...chain.map((stage) => stage.op), SINK_OPS[sink]].join(',')
    if (sinkKeys.has(key)) return
    sinkKeys.add(key)
    const emitted = emitSinkTemplate(chain, sink)
    const fn = usesCallbackLanesForSink(chain, sink) ? emitCallbackLanes(emitted) : emitted
    fns.push(fn)
    manifestSink.push(sinkManifestEntry(chain, sink, fn))
  }

  for (const chain of chains) {
    const emittedNoLimit = emitArrayTemplate(chain, false)
    const noLimit = usesCallbackLanesForArray(chain, false)
      ? emitCallbackLanes(emittedNoLimit)
      : emittedNoLimit
    const withLimit = emitArrayTemplate(chain, true)
    fns.push(noLimit, withLimit)
    const codesNoLimit = chain.map((s) => s.op)
    const codesLimit = [...codesNoLimit, OP_TAKE]
    manifestArray.push(
      `  { key: '${codesNoLimit.join(',')}', opcodes: [${codesNoLimit.join(', ')}], run: ${noLimit.name} }`,
    )
    manifestArray.push(
      `  { key: '${codesLimit.join(',')}', opcodes: [${codesLimit.join(', ')}], run: ${withLimit.name} }`,
    )
  }

  // Direct reducing and short-circuit sinks should never pay for the generic
  // state object/switch machine.
  for (const sink of ['reduce', 'count', ...SHORT_CIRCUIT_SINKS] as const) addSink([], sink)

  // Preserve the existing one-stage reduce/count/sum coverage and extend
  // every ordinary one-stage transform to every short-circuit sink.
  for (const base of STAGES) {
    for (const sink of ['reduce', 'count', 'sum', ...SHORT_CIRCUIT_SINKS] as const) {
      addSink([base], sink)
    }
  }

  // Two high-frequency two-stage shapes: the corpus sentinel and the suffix
  // left after a boundary in the long flatMap corpus.
  const criticalChains = [
    [STAGES[0], STAGES[1]], // map -> filter
    [STAGES[1], STAGES[3]], // filter -> filterMap
  ] as const
  for (const chain of criticalChains) {
    for (const sink of ['reduce', 'count', ...SHORT_CIRCUIT_SINKS] as const) {
      addSink(chain, sink)
    }
  }

  // Bounded flatMap coverage: standalone/prefixed collection and the exact
  // long corpus shape for collect/reduce/find.
  for (const withMap of [false, true]) {
    const emitted = emitFlatMapCollectTemplate(withMap)
    const fn = withMap ? emitCallbackLanes(emitted) : emitted
    fns.push(fn)
    const opcodes = withMap ? [OP_MAP, OP_FLAT_MAP] : [OP_FLAT_MAP]
    manifestArray.push(
      `  { key: '${opcodes.join(',')}', opcodes: [${opcodes.join(', ')}], run: ${fn.name} }`,
    )
  }
  const longCollect = emitLongFlatMapTemplate('collect')
  fns.push(emitCallbackLanes(longCollect))
  manifestArray.push(
    `  { key: '${[OP_MAP, OP_FLAT_MAP, OP_FILTER, OP_FILTER_MAP].join(',')}', opcodes: [${[
      OP_MAP,
      OP_FLAT_MAP,
      OP_FILTER,
      OP_FILTER_MAP,
    ].join(', ')}], run: ${longCollect.name} }`,
  )
  for (const sink of ['reduce', 'find'] as const) {
    const fn = emitCallbackLanes(emitLongFlatMapTemplate(sink), sink === 'find')
    fns.push(fn)
    const key = [
      OP_MAP,
      OP_FLAT_MAP,
      OP_FILTER,
      OP_FILTER_MAP,
      sink === 'reduce' ? OP_REDUCE : OP_FIND,
    ].join(',')
    if (sinkKeys.has(key)) throw new Error(`duplicate portable-template key: ${key}`)
    sinkKeys.add(key)
    manifestSink.push(longSinkManifestEntry(sink, fn))
  }

  const header = `// GENERATED FILE. Do not edit by hand — run \`bun run codegen\` to regenerate.
// Hand-shaped fused loop templates for high-frequency stream-segment
// shapes: short linear chains, reducing/short-circuit sinks, and a bounded
// set of flatMap-heavy shapes. Looked up by opcode-shape key from
// src/lower.ts before falling back to the generic stage machine. Semantics
// mirror src/interpret.ts exactly.
import { type StepBinding, type ConsumeMeta } from './plan'
import { none as optionNone, some as optionSome } from './option'

const IS_BUN_RUNTIME =
  typeof (globalThis as { readonly Bun?: unknown }).Bun !== 'undefined'

export type PortableTemplateFn = (
  src: readonly unknown[],
  bindings: readonly StepBinding[],
  offset: number,
  limit: number,
  meta?: ConsumeMeta,
) => unknown

export interface ArrayTemplateEntry {
  readonly key: string
  readonly opcodes: readonly number[]
  readonly run: PortableTemplateFn
}

export interface SinkTemplateEntry {
  readonly key: string
  readonly opcodes: readonly number[]
  readonly kind: '${(['reduce', 'count', 'sum', ...SHORT_CIRCUIT_SINKS] as readonly string[]).join(
    "' | '",
  )}'
  readonly run: PortableTemplateFn
}

`
  const body = fns.map((f) => f.code).join('\n')
  const manifest = `export const ARRAY_TEMPLATES: readonly ArrayTemplateEntry[] = [
${manifestArray.join(',\n')},
]

export const SINK_TEMPLATES: readonly SinkTemplateEntry[] = [
${manifestSink.join(',\n')},
]
`

  writeFileSync(OUT, header + body + '\n' + manifest)
  console.log(`portable-templates: emitted ${fns.length} templates to ${OUT}`)
}

main()
