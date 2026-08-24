/**
 * Dual Inliner. Emits dual-form (data-first and curried) factories from
 * bodies written against dual()'s data-first shape.
 *
 * Usage: bun run codegen/dual-inline.ts
 * Input:  codegen/defs/*.ts   (human-written, uses dual())
 * Output: src/*.ts            (generated, one dual factory per op)
 *
 * Every arity-2+ op answers both call shapes under one name:
 * `op(data, ...args)` returns the result, `op(...args)` returns the curried
 * step. Dispatch is a bare `arguments.length` branch, emitted per op by the
 * measured policy of docs/superpowers/plans/2026-08-24-dual-performance-first.md
 * (Phase 0 ledger):
 *
 *   delegate - loop-bodied ops. The data-first branch re-enters the curried
 *              form (`return op(...cfg)(data)`); the curried branch returns
 *              a closure byte-identical to the old single-form emission
 *              (invariant 1). Smallest bytes; the one extra closure per
 *              data-first call is invisible next to the loop it runs.
 *   inline   - loop-free, short bodies (scalar-class ops), where the
 *              inlined body is smaller than the delegation call and the
 *              delegation tax was the only measurable one. Both branches
 *              carry the body; the curried closure stays byte-identical.
 *
 * No generic dual() wrapper appears in shipped output -- the Phase 0 bench
 * showed the old arity-check tax was the wrapper machinery, never the
 * branch. Generated factories carry no runtime tag (no `_op`/`_fn`/`_a1`/
 * `_a2`, no `registerTrustedOperator`): `@stopcock/fp-compiler` recognises
 * operators by import name at build time, never by a runtime marker.
 */

import { type Parser, type ParseResult, seq, map, string as pStr, char, run } from './parse'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..')
const DEFS_DIR = join(ROOT, 'codegen', 'defs')
const SRC_DIR = join(ROOT, 'src')

const GENERATED_MODULES = ['array', 'boolean', 'math'] as const
type GeneratedModule = (typeof GENERATED_MODULES)[number]

// --- Brace-counting utilities ---

function findMatchingClose(src: string, openPos: number): number {
  const open = src[openPos]
  const close = open === '(' ? ')' : open === '{' ? '}' : open === '[' ? ']' : ''
  let depth = 1
  let i = openPos + 1
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(src, i)
      continue
    }
    if (ch === open) depth++
    else if (ch === close) depth--
    i++
  }
  return i - 1
}

function skipString(src: string, pos: number): number {
  const quote = src[pos]
  let i = pos + 1
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2
      continue
    }
    if (src[i] === quote) return i + 1
    if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
      i = findMatchingClose(src, i + 1) + 1
      continue
    }
    i++
  }
  return i
}

// Find the top-level comma or closing paren after a position, respecting nesting
function findTopLevelSep(src: string, start: number): { pos: number; ch: string } {
  let i = start
  let depth = 0
  let angleDepth = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(src, i)
      continue
    }
    if (ch === '(' || ch === '{' || ch === '[') {
      depth++
      i++
      continue
    }
    if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) return { pos: i, ch }
      depth--
      i++
      continue
    }
    // Track angle brackets for generics: <A, B>
    if (ch === '<' && depth === 0) {
      angleDepth++
      i++
      continue
    }
    if (ch === '>' && angleDepth > 0) {
      angleDepth--
      i++
      continue
    }
    if (ch === ',' && depth === 0 && angleDepth === 0) return { pos: i, ch }
    i++
  }
  return { pos: src.length, ch: '' }
}

// --- Parser combinators (built on @stopcock/parse) ---

interface DualCall {
  name: string
  typeAnnotation: string
  arity: number
  bodyStr: string
  bodyIsRef: boolean
  tag: string | null
  fullMatch: string
  startIdx: number
  endIdx: number
}

interface InlineBody {
  params: string[]
  bodyText: string
  isExpression: boolean
}

// Primitives. Lift low-level char parsers into @stopcock/parse Parser types

const ws: Parser<null> = (input, pos) => {
  let i = pos
  while (i < input.length && ' \t\n\r'.includes(input[i])) i++
  return { success: true, value: null, remaining: input.slice(i), position: i }
}

/** Consume a balanced bracket group, return inner content */
const innerOf: Parser<string> = (input, pos) => {
  const ch = input[pos]
  if (ch !== '(' && ch !== '{' && ch !== '[')
    return { success: false, expected: 'opening bracket', position: pos }
  const end = findMatchingClose(input, pos)
  return {
    success: true,
    value: input.slice(pos + 1, end),
    remaining: input.slice(end + 1),
    position: end + 1,
  }
}

/** Consume until a top-level comma or closing delimiter, return trimmed content */
const untilSep: Parser<{ text: string; sep: string }> = (input, pos) => {
  const { pos: endPos, ch } = findTopLevelSep(input, pos)
  return {
    success: true,
    value: { text: input.slice(pos, endPos).trim(), sep: ch },
    remaining: input.slice(endPos),
    position: endPos,
  }
}

/** Match angle brackets <...>, return inner content */
const angleBlock: Parser<string> = (input, pos) => {
  if (input[pos] !== '<') return { success: false, expected: '<', position: pos }
  let depth = 1,
    i = pos + 1
  while (i < input.length && depth > 0) {
    if (input[i] === '<') depth++
    else if (input[i] === '>') depth--
    i++
  }
  return {
    success: true,
    value: input.slice(pos + 1, i - 1),
    remaining: input.slice(i),
    position: i,
  }
}

/** Match a single-quoted string, return content (without quotes) */
const singleQuoted: Parser<string> = (input, pos) => {
  if (input[pos] !== "'") return { success: false, expected: "'", position: pos }
  const end = input.indexOf("'", pos + 1)
  if (end === -1) return { success: false, expected: "closing '", position: pos }
  return {
    success: true,
    value: input.slice(pos + 1, end),
    remaining: input.slice(end + 1),
    position: end + 1,
  }
}

// Optional trailing comma before a closing delimiter
const optComma: Parser<null> = (input, pos) => {
  const r = char(',')(input, pos)
  return r.success
    ? { success: true, value: null, remaining: r.remaining, position: r.position }
    : { success: true, value: null, remaining: input.slice(pos), position: pos }
}

// Tag parser: { op: 'name' } → name (tolerates a trailing comma: { op: 'name', })
const tagP: Parser<string> = map(
  seq(ws, char('{'), ws, pStr('op'), ws, char(':'), ws, singleQuoted, ws, optComma, ws, char('}')),
  ([, , , , , , , name]) => name,
)

// Dual call parser: export const NAME: Type = dual(arity, body, {op: 'tag'})
const dualCallP: Parser<DualCall> = (input, pos) => {
  const exportMatch = input.slice(pos).match(/^export\s+const\s+(\w+)/)
  if (!exportMatch) return { success: false, expected: 'export const', position: pos }

  const name = exportMatch[1]
  const nameEnd = pos + exportMatch[0].length
  const dualIdx = input.indexOf('= dual(', nameEnd)
  if (dualIdx === -1) return { success: false, expected: '= dual(', position: nameEnd }

  // Type annotation between name and = dual(
  const between = input.slice(nameEnd, dualIdx).trim()
  const typeAnnotation = between.startsWith(':') ? between.slice(1).trim() : ''

  // Parse inside dual(...)
  const parenPos = dualIdx + '= dual'.length
  const innerR = innerOf(input, parenPos)
  if (!innerR.success) return innerR as ParseResult<DualCall>
  const inner = innerR.value

  // Split inner by top-level seps: arity, body, tag?
  const a1 = untilSep(inner, 0)
  if (!a1.success) return a1 as ParseResult<DualCall>
  const arity = parseInt(a1.value.text, 10)

  const a2 = untilSep(inner, a1.position + 1)
  if (!a2.success) return a2 as ParseResult<DualCall>
  const bodyStr = a2.value.text

  // Optional tag
  let tag: string | null = null
  if (a2.value.sep === ',') {
    const tagR = tagP(inner, a2.position + 1)
    if (tagR.success) tag = tagR.value
  }

  const bodyIsRef = /^[A-Za-z_$][\w$.]*$/.test(bodyStr)

  return {
    success: true,
    value: {
      name,
      typeAnnotation,
      arity,
      bodyStr,
      bodyIsRef,
      tag,
      fullMatch: input.slice(pos, innerR.position),
      startIdx: pos,
      endIdx: innerR.position,
    },
    remaining: input.slice(innerR.position),
    position: innerR.position,
  }
}

// Arrow function parser: <G>(params): Ret => body
const arrowFnP: Parser<InlineBody> = (input, pos) => {
  let cursor = pos

  // Optional generic prefix <A, B>
  if (input[cursor] === '<') {
    const r = angleBlock(input, cursor)
    if (!r.success) return r as ParseResult<InlineBody>
    cursor = r.position
    while (cursor < input.length && ' \t\n\r'.includes(input[cursor])) cursor++
  }

  // Parameter list (...)
  const paramsR = innerOf(input, cursor)
  if (!paramsR.success) return paramsR as ParseResult<InlineBody>
  cursor = paramsR.position

  // Split params by top-level commas, extract names (strip type annotations)
  const params: string[] = []
  let pi = 0
  const paramStr = paramsR.value
  while (pi < paramStr.length) {
    const sep = findTopLevelSep(paramStr, pi)
    const chunk = paramStr.slice(pi, sep.pos).trim()
    if (chunk) {
      const pname = chunk.split(/\s*:/)[0].trim()
      if (pname) params.push(pname)
    }
    if (sep.ch !== ',') break
    pi = sep.pos + 1
  }

  // Skip optional return type annotation before =>
  let after = input.slice(cursor).trim()
  let trimOff =
    input.length -
    input.slice(cursor).trimStart().length -
    (input.length - input.slice(cursor).length)
  cursor += input.slice(cursor).length - after.length

  if (after.startsWith(':') && !after.startsWith('=>')) {
    let depth = 0,
      i = 1
    while (i < after.length - 1) {
      const ch = after[i]
      if ('<({['.includes(ch)) {
        depth++
        i++
        continue
      }
      if ('>)}]'.includes(ch)) {
        depth--
        i++
        continue
      }
      if (ch === '=' && after[i + 1] === '>' && depth === 0) {
        after = after.slice(i)
        cursor += i
        break
      }
      i++
    }
  }

  // Expect =>
  const arrowMatch = after.match(/^\s*=>/)
  if (!arrowMatch) return { success: false, expected: '=>', position: cursor }
  cursor += arrowMatch[0].length
  let rest = input.slice(cursor).trim()
  cursor = input.length - rest.length

  // Block body or expression body
  if (rest.startsWith('{')) {
    const blockR = innerOf(input, cursor)
    if (!blockR.success) return blockR as ParseResult<InlineBody>
    return {
      success: true,
      value: { params, bodyText: blockR.value.trim(), isExpression: false },
      remaining: input.slice(blockR.position),
      position: blockR.position,
    }
  }
  return {
    success: true,
    value: { params, bodyText: rest, isExpression: true },
    remaining: '',
    position: input.length,
  }
}

// Convenience: run a parser and return the value or null
const tryParse = <T>(parser: Parser<T>, input: string): T | null => {
  const r = run(parser, input.trim())
  return r.success ? r.value : null
}

// --- Code Generator ---

function typeDecl(name: string, annotation: string): string {
  return annotation ? `export const ${name}: ${annotation}` : `export const ${name}`
}

function generateArity1(dc: DualCall): string {
  const decl = typeDecl(dc.name, dc.typeAnnotation)
  if (dc.bodyIsRef) {
    return `${decl} = ${dc.bodyStr}\n`
  }
  const { params, bodyText, isExpression } = tryParse(arrowFnP, dc.bodyStr)!
  const bodyCode = isExpression ? `return ${bodyText}` : bodyText
  return `${decl} = function ${dc.name}(${params.join(': any, ')}: any) { ${bodyCode} } as any\n`
}

// --- Dual emission ---
//
// codegen/defs/*.ts writes each arity>=2 op's type as a two-branch (or, for
// refinement-narrowing ops, four-branch) call-signature object: the
// data-first branch(es) first, the data-last (curried) branch(es) last.
// Dual emission ships the annotation whole; the single-form world used to
// filter it down to the curried branches, and that filter went with it.

/**
 * The Phase 0 policy (2026-08-24-dual-performance-first.md, ledger): inline
 * when the body has no loop and is short enough that the inlined body beats
 * the delegation call on bytes; delegate otherwise. Per-op overrides land
 * here when a bench row earns one.
 */
function dispatchPolicy(bodyText: string): 'delegate' | 'inline' {
  if (/\b(for|while)\s*\(/.test(bodyText)) return 'delegate'
  return bodyText.length <= 200 ? 'inline' : 'delegate'
}

function generateArityN(dc: DualCall): string {
  if (dc.bodyIsRef) return generateArityNRef(dc, dc.arity)
  return generateArityNInline(dc)
}

function generateArityNRef(dc: DualCall, n: number): string {
  const ref = dc.bodyStr
  const decl = typeDecl(dc.name, dc.typeAnnotation)
  const factoryParams = Array.from({ length: n - 1 }, (_, i) => `_a${i}`)
  const factoryArgs = [
    `${factoryParams[0]}: any`,
    ...factoryParams.slice(1).map((p) => `${p}?: any`),
    '__df?: any',
  ].join(', ')
  const callArgs = ['data', ...factoryParams].join(', ')
  const dataFirstArgs = [...factoryParams, '__df'].join(', ')

  return `${decl} = function ${dc.name}(${factoryArgs}): any {
  if (arguments.length >= ${n}) return ${ref}(${dataFirstArgs})
  return function (data: any) {
    return ${ref}(${callArgs})
  }
} as any\n`
}

function generateArityNInline(dc: DualCall): string {
  const { params, bodyText, isExpression } = tryParse(arrowFnP, dc.bodyStr)!
  const bodyCode = isExpression ? `return ${bodyText}` : bodyText
  const decl = typeDecl(dc.name, dc.typeAnnotation)

  const dataParam = params[0]
  const factoryParams = params.slice(1)
  const n = dc.arity

  if (dispatchPolicy(bodyText) === 'inline') {
    // Neutral slots plus per-branch aliases: the def's own param names stay
    // usable in both branches without TDZ traps, and the curried closure
    // text stays byte-identical to the single-form emission (invariant 1).
    const slotArgs = ['a0: any', ...params.slice(1).map((_, i) => `a${i + 1}?: any`)].join(', ')
    const dataFirstAliases = params.map((p, i) => `${p} = a${i}`).join(',\n      ')
    const curriedAliases = factoryParams.map((p, i) => `${p} = a${i}`).join(',\n    ')

    return `${decl} = function ${dc.name}(${slotArgs}): any {
  if (arguments.length >= ${n}) {
    const ${dataFirstAliases}
    ${bodyCode}
  }
  const ${curriedAliases}
  return function (${dataParam}: any) {
    ${bodyCode}
  }
} as any\n`
  }

  // Delegate: the factory keeps the single-form shape (the def's own config
  // param names, the identical curried closure) with the data-first branch
  // prepended. On that path the config names hold shifted slots (the first
  // config param carries the data); the delegation call restores the order.
  const factoryArgs = [
    `${factoryParams[0]}: any`,
    ...factoryParams.slice(1).map((p) => `${p}?: any`),
    '__df?: any',
  ].join(', ')
  const delegationCfg = [...factoryParams.slice(1), '__df'].join(', ')

  return `${decl} = function ${dc.name}(${factoryArgs}): any {
  if (arguments.length >= ${n}) return ${dc.name}(${delegationCfg})(${factoryParams[0]})
  return function (${dataParam}: any) {
    ${bodyCode}
  }
} as any\n`
}

function generateDecl(dc: DualCall): string {
  if (dc.arity <= 1) return generateArity1(dc)
  return generateArityN(dc)
}

// --- Module Transformer ---

export function transformModuleV1(src: string, moduleName: GeneratedModule): string {
  void moduleName
  const lines = src.split('\n')
  const outputLines: string[] = []

  // Add header
  outputLines.push('// Auto-generated by codegen/dual-inline.ts. Do not edit')
  outputLines.push('// Source of truth: codegen/defs/')
  outputLines.push('')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Skip dual import
    if (/import\s*\{[^}]*dual[^}]*\}\s*from\s*'\.\/dual/.test(line)) {
      i++
      continue
    }

    // Check if this starts an export const with dual()
    if (line.match(/^export\s+const\s+\w+/)) {
      let declText = line
      let j = i + 1

      while (j < lines.length && !isDeclarationComplete(declText)) {
        declText += '\n' + lines[j]
        j++
      }

      if (declText.includes('= dual(')) {
        const dc = tryParse(dualCallP, declText)
        if (dc) {
          outputLines.push(generateDecl(dc))
          i = j
          continue
        }
      }

      for (let k = i; k < j; k++) outputLines.push(lines[k])
      i = j
      continue
    }

    outputLines.push(line)
    i++
  }

  return outputLines.join('\n')
}

const countBraces = (source: string): number => {
  let depth = 0
  for (const character of source) {
    if ('({['.includes(character)) depth++
    else if (')}]'.includes(character)) depth--
  }
  return depth
}

function isDeclarationComplete(text: string): boolean {
  // A declaration is complete when all braces/parens are balanced
  // and it doesn't end with an obvious continuation (open brace, comma at end, etc.)
  const depth = countBraces(text)
  if (depth !== 0) return false
  const trimmed = text.trimEnd()
  // Must end with a closing paren/brace or a simple expression
  return !trimmed.endsWith(',') && !trimmed.endsWith('=>')
}

// --- Main ---

const processModule = (mod: GeneratedModule) => {
  const src = readFileSync(join(DEFS_DIR, `${mod}.ts`), 'utf8')
  const transformed = transformModuleV1(src, mod)
  const output = mod === 'array' ? `${transformed}\n\nexport * from './array-extra'\n` : transformed
  const dualCount = (src.match(/= dual\(/g) || []).length
  mkdirSync(SRC_DIR, { recursive: true })
  writeFileSync(join(SRC_DIR, `${mod}.ts`), output)
  console.log(`  ${mod}.ts: ${dualCount} dual() calls`)
  return dualCount
}

if (import.meta.main) {
  const requestedModules = process.argv.slice(2)
  const modules =
    requestedModules.length === 0
      ? [...GENERATED_MODULES]
      : GENERATED_MODULES.filter((module) => requestedModules.includes(module))
  let totalFns = 0
  for (const moduleName of modules) totalFns += processModule(moduleName)
  console.log(`\nGenerated ${modules.length} modules, ${totalFns} functions inlined → src/`)
}
/// <reference types="bun" />
