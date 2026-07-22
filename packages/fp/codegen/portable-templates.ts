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
const OP_REDUCE = 8
const OP_FILTER_MAP = 14
const OP_REJECT = 16
const OP_COUNT = 18
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

/** Emits the per-stage transform for one chain step, threading value `v${i}`. */
function emitStage(stage: { kind: StageKind; op: number }, i: number, prevVar: string): { lines: string[]; varName: string } {
  const f = `f${i}`
  switch (stage.kind) {
    case 'map':
      return { lines: [`const v${i} = ${f}(${prevVar})`], varName: `v${i}` }
    case 'filter':
      return { lines: [`if (!${f}(${prevVar})) continue`], varName: prevVar }
    case 'reject':
      return { lines: [`if (${f}(${prevVar})) continue`], varName: prevVar }
    case 'filterMap':
      return { lines: [`const v${i} = ${f}(${prevVar})`, `if (v${i} == null) continue`], varName: `v${i}` }
  }
}

function nameFor(codes: readonly number[], suffix: string): string {
  return `t_${codes.join('_')}${suffix}`
}

function emitArrayTemplate(chain: { kind: StageKind; op: number }[], withLimit: boolean): EmittedFn {
  const codes = [...chain.map((s) => s.op), ...(withLimit ? [OP_TAKE] : [])]
  const name = nameFor(codes, withLimit ? '_lim' : '')
  const binds = chain.map((_, i) => `  const f${i} = bindings[offset + ${i}].fn as (v: unknown) => unknown`).join('\n')
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
  const code = `export function ${name}(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown[] {
${binds}
  const out: unknown[] = []
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
${lines.map((l) => '    ' + l).join('\n')}
${limitCheck}    out.push(${cur})
  }
  return out
}
`
  return { name, code }
}

type SinkKind = 'reduce' | 'count' | 'sum'

function emitSinkTemplate(base: { kind: StageKind; op: number }, sink: SinkKind): EmittedFn {
  const sinkOp = sink === 'reduce' ? OP_REDUCE : sink === 'count' ? OP_COUNT : OP_SUM
  const codes = [base.op, sinkOp]
  const name = nameFor(codes, `_${sink}`)
  const stage = emitStage(base, 0, 'x')
  const stageLines = stage.lines.map((l) => '    ' + l).join('\n')
  const finalVar = stage.varName

  if (sink === 'reduce') {
    const code = `export function ${name}(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  const fr = bindings[offset + 1].fn as (acc: unknown, v: unknown) => unknown
  let acc: unknown = bindings[offset + 1].a1
  for (let i = 0; i < src.length; i++) {
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
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  const fs = bindings[offset + 1].fn as (v: unknown) => boolean
  let count = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
${stageLines}
    if (fs(${finalVar})) count++
  }
  return count
}
`
    return { name, code }
  }
  // sum: cross-segment fusion (stream chain of length 1 immediately followed
  // by the OP_SUM materializer boundary). No binding needed for sum itself.
  const code = `export function ${name}(src: readonly unknown[], bindings: readonly StepBinding[], offset: number, limit: number, meta?: ConsumeMeta): unknown {
  const f0 = bindings[offset].fn as (v: unknown) => unknown
  let sum = 0
  for (let i = 0; i < src.length; i++) {
    const x = src[i]
${stageLines}
    sum += ${finalVar} as number
  }
  return sum
}
`
  return { name, code }
}

function main(): void {
  const chains = chainsUpToLength(3)
  const fns: EmittedFn[] = []
  const manifestArray: string[] = []
  const manifestSink: string[] = []

  for (const chain of chains) {
    const noLimit = emitArrayTemplate(chain, false)
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

  const sinkKinds: SinkKind[] = ['reduce', 'count', 'sum']
  for (const base of STAGES) {
    for (const sink of sinkKinds) {
      const fn = emitSinkTemplate(base, sink)
      fns.push(fn)
      if (sink === 'sum') {
        manifestSink.push(
          `  { key: '${base.op}>SUM', opcodes: [${base.op}, ${OP_SUM}], kind: 'sum', run: ${fn.name} }`,
        )
      } else {
        const sinkOp = sink === 'reduce' ? OP_REDUCE : OP_COUNT
        manifestSink.push(
          `  { key: '${base.op},${sinkOp}', opcodes: [${base.op}, ${sinkOp}], kind: '${sink}', run: ${fn.name} }`,
        )
      }
    }
  }

  const header = `// GENERATED FILE. Do not edit by hand — run \`bun run codegen\` to regenerate.
// Hand-shaped fused loop templates for the highest-frequency stream-segment
// shapes: chains of map/filter/reject/filterMap (length 1-3, optionally
// take-limited) plus sink fusions (reduce/count/sum). Looked up by opcode
// shape key from src/lower.ts before falling back to the generic closure
// chain. Semantics mirror src/interpret.ts exactly.
import { type StepBinding, type ConsumeMeta } from './plan'

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
  readonly kind: 'reduce' | 'count' | 'sum'
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
  // eslint-disable-next-line no-console
  console.log(`portable-templates: emitted ${fns.length} templates to ${OUT}`)
}

main()
