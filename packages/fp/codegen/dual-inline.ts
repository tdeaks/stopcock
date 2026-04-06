/**
 * Dual Inliner — eliminates runtime dual() dispatch by inlining bodies at build time.
 *
 * Usage: bun run codegen/dual-inline.ts
 * Input:  codegen/defs/*.ts   (human-written, uses dual())
 * Output: src/*.ts            (generated, body inlined into dispatch functions)
 */

import { pipe, flow, A } from '../src'
import { OP_CODES } from '../src/opcodes'
import {
  type Parser, type ParseResult,
  seq, map, optional, regex, string as pStr, char, alt, run,
} from '@stopcock/parse'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..')
const DEFS_DIR = join(ROOT, 'codegen', 'defs')
const SRC_DIR = join(ROOT, 'src')

const RESCRIPT_DIR = join(ROOT, 'src')

const MODULES = ['array', 'string', 'dict', 'object', 'logic', 'boolean', 'math', 'number']

// Maps defs module → rescript module name (for RS.* resolution)
const RS_MODULE_MAP: Record<string, string> = {
  array: 'Array',
  object: 'Object',
  logic: 'Logic',
  boolean: 'Boolean',
  math: 'Math',
}

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
    if (src[i] === '\\') { i += 2; continue }
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
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(src, i); continue }
    if (ch === '(' || ch === '{' || ch === '[') { depth++; i++; continue }
    if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) return { pos: i, ch }
      depth--; i++; continue
    }
    // Track angle brackets for generics: <A, B>
    if (ch === '<' && depth === 0) { angleDepth++; i++; continue }
    if (ch === '>' && angleDepth > 0) { angleDepth--; i++; continue }
    if (ch === ',' && depth === 0 && angleDepth === 0) return { pos: i, ch }
    i++
  }
  return { pos: src.length, ch: '' }
}

// --- ReScript .res.js body resolver ---

interface RSFunction {
  params: string[]
  body: string
}

function parseResJs(filePath: string): Map<string, RSFunction> {
  let src: string
  try { src = readFileSync(filePath, 'utf8') } catch { return new Map() }

  const fns = new Map<string, RSFunction>()
  const aliases = new Map<string, string>()
  let i = 0

  while (i < src.length) {
    // Pattern A: function NAME(PARAMS) { BODY }
    const fnMatch = src.slice(i).match(/^function\s+(\w+)\s*\(/)
    if (fnMatch) {
      const name = fnMatch[1]
      const paramStart = i + fnMatch[0].length - 1
      const paramClose = findMatchingClose(src, paramStart)
      const params = src.slice(paramStart + 1, paramClose).split(',').map(p => p.trim()).filter(Boolean)

      // Find the opening { after )
      let bi = paramClose + 1
      while (bi < src.length && src[bi] !== '{') bi++
      if (bi < src.length) {
        const bodyClose = findMatchingClose(src, bi)
        const body = src.slice(bi + 1, bodyClose).trim()
        fns.set(name, { params, body })
        i = bodyClose + 1
        continue
      }
    }

    // Pattern B: let NAME = (function(PARAMS) { BODY });
    const letFnMatch = src.slice(i).match(/^let\s+(\w+)\s*=\s*\(function\s*\(/)
    if (letFnMatch) {
      const name = letFnMatch[1]
      const fnStart = i + letFnMatch[0].indexOf('(function')
      const outerParenStart = i + letFnMatch[0].indexOf('(function') - 0
      // Find the ( before 'function'
      let pp = i + src.slice(i).indexOf('(function')
      const outerClose = findMatchingClose(src, pp)

      // Inside: function(PARAMS) { BODY }
      const inner = src.slice(pp + 1, outerClose)
      const innerParamMatch = inner.match(/^function\s*\(/)
      if (innerParamMatch) {
        const paramStart = innerParamMatch[0].length - 1
        const paramClose = findMatchingClose(inner, paramStart)
        const params = inner.slice(paramStart + 1, paramClose).split(',').map(p => p.trim()).filter(Boolean)

        let bi = paramClose + 1
        while (bi < inner.length && inner[bi] !== '{') bi++
        if (bi < inner.length) {
          const bodyClose = findMatchingClose(inner, bi)
          const body = inner.slice(bi + 1, bodyClose).trim()
          fns.set(name, { params, body })
        }
      }
      i = outerClose + 1
      continue
    }

    // Pattern C: let NAME = EXISTING;
    const aliasMatch = src.slice(i).match(/^let\s+(\w+)\s*=\s*([A-Za-z_$][\w$]*)\s*;/)
    if (aliasMatch) {
      aliases.set(aliasMatch[1], aliasMatch[2])
      i += aliasMatch[0].length
      continue
    }

    // Advance to next line
    const nl = src.indexOf('\n', i)
    i = nl === -1 ? src.length : nl + 1
  }

  // Resolve aliases
  for (const [alias, target] of aliases) {
    const resolved = fns.get(target)
    if (resolved) fns.set(alias, resolved)
  }

  return fns
}

function usesRescriptRuntime(body: string): boolean {
  return /Primitive_|Belt_|Caml_/.test(body)
}

// Pre-load all RS function maps
const rsFunctionMaps = new Map(
  pipe(
    Object.entries(RS_MODULE_MAP),
    A.map(([mod, rsName]: [string, string]) =>
      [mod, parseResJs(join(RESCRIPT_DIR, `${rsName}.res.js`))] as [string, Map<string, RSFunction>]
    ),
  )
)

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

// Primitives — lift low-level char parsers into @stopcock/parse Parser types

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
  return { success: true, value: input.slice(pos + 1, end), remaining: input.slice(end + 1), position: end + 1 }
}

/** Consume until a top-level comma or closing delimiter, return trimmed content */
const untilSep: Parser<{ text: string; sep: string }> = (input, pos) => {
  const { pos: endPos, ch } = findTopLevelSep(input, pos)
  return { success: true, value: { text: input.slice(pos, endPos).trim(), sep: ch }, remaining: input.slice(endPos), position: endPos }
}

/** Match angle brackets <...>, return inner content */
const angleBlock: Parser<string> = (input, pos) => {
  if (input[pos] !== '<') return { success: false, expected: '<', position: pos }
  let depth = 1, i = pos + 1
  while (i < input.length && depth > 0) { if (input[i] === '<') depth++; else if (input[i] === '>') depth--; i++ }
  return { success: true, value: input.slice(pos + 1, i - 1), remaining: input.slice(i), position: i }
}

/** Match a single-quoted string, return content (without quotes) */
const singleQuoted: Parser<string> = (input, pos) => {
  if (input[pos] !== "'") return { success: false, expected: "'", position: pos }
  const end = input.indexOf("'", pos + 1)
  if (end === -1) return { success: false, expected: "closing '", position: pos }
  return { success: true, value: input.slice(pos + 1, end), remaining: input.slice(end + 1), position: end + 1 }
}

// Tag parser: { op: 'name' } → name
const tagP: Parser<string> = map(
  seq(ws, char('{'), ws, pStr('op'), ws, char(':'), ws, singleQuoted, ws, char('}')),
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
    value: { name, typeAnnotation, arity, bodyStr, bodyIsRef, tag,
             fullMatch: input.slice(pos, innerR.position),
             startIdx: pos, endIdx: innerR.position },
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
  let trimOff = input.length - input.slice(cursor).trimStart().length - (input.length - input.slice(cursor).length)
  cursor += input.slice(cursor).length - after.length

  if (after.startsWith(':') && !after.startsWith('=>')) {
    let depth = 0, i = 1
    while (i < after.length - 1) {
      const ch = after[i]
      if ('<({['.includes(ch)) { depth++; i++; continue }
      if ('>)}]'.includes(ch)) { depth--; i++; continue }
      if (ch === '=' && after[i + 1] === '>' && depth === 0) { after = after.slice(i); cursor += i; break }
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
    return { success: true, value: { params, bodyText: blockR.value.trim(), isExpression: false },
             remaining: input.slice(blockR.position), position: blockR.position }
  }
  return { success: true, value: { params, bodyText: rest, isExpression: true },
           remaining: '', position: input.length }
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

function generateArity1Tagged(dc: DualCall): string {
  const opcode = dc.tag ? (OP_CODES[dc.tag] ?? 0) : 0
  const decl = typeDecl(dc.name, dc.typeAnnotation)

  if (dc.bodyIsRef) {
    return `${decl} = /* @__PURE__ */ (() => {
  const _f: any = ${dc.bodyStr}
  _f._op = ${opcode}
  return _f
})()\n`
  }

  const { params, bodyText, isExpression } = tryParse(arrowFnP, dc.bodyStr)!
  const bodyCode = isExpression ? `return ${bodyText}` : bodyText

  return `${decl} = /* @__PURE__ */ (() => {
  const _f: any = function ${dc.name}(${params.join(': any, ')}: any) { ${bodyCode} }
  _f._op = ${opcode}
  return _f
})()\n`
}

function generateArity1Untagged(dc: DualCall): string {
  const decl = typeDecl(dc.name, dc.typeAnnotation)
  if (dc.bodyIsRef) {
    return `${decl} = ${dc.bodyStr}\n`
  }
  const { params, bodyText, isExpression } = tryParse(arrowFnP, dc.bodyStr)!
  const bodyCode = isExpression ? `return ${bodyText}` : bodyText
  return `${decl} = function ${dc.name}(${params.join(': any, ')}: any) { ${bodyCode} } as any\n`
}

function generateArityN(dc: DualCall): string {
  const n = dc.arity
  const opcode = dc.tag ? (OP_CODES[dc.tag] ?? 0) : 0
  const hasTag = dc.tag !== null && opcode > 0

  if (dc.bodyIsRef) {
    return generateArityNRef(dc, n, opcode, hasTag)
  }
  return generateArityNInline(dc, n, opcode, hasTag)
}

function generateArityNRef(dc: DualCall, n: number, opcode: number, hasTag: boolean): string {
  const ref = dc.bodyStr
  const argsList = Array.from({ length: n }, (_, i) => `arguments[${i}]`).join(', ')
  const curryCapture = Array.from({ length: n - 1 }, (_, i) => `const _a${i} = arguments[${i}]`).join('; ')
  const curryCall = `${ref}(data, ${Array.from({ length: n - 1 }, (_, i) => `_a${i}`).join(', ')})`
  const decl = typeDecl(dc.name, dc.typeAnnotation)

  let closureProps = ''
  if (hasTag) {
    closureProps = `\n    _dl._op = ${opcode}`
    closureProps += `\n    _dl._fn = _a0`
    if (n >= 3) closureProps += `\n    _dl._a1 = _a1`
    if (n >= 4) closureProps += `\n    _dl._a2 = _a2`
  }

  return `${decl} = function ${dc.name}() {
  if (arguments.length >= ${n}) return ${ref}(${argsList})
  ${curryCapture}
  const _dl: any = (data: any) => ${curryCall}${closureProps}
  return _dl
} as any\n`
}

function generateArityNInline(dc: DualCall, n: number, opcode: number, hasTag: boolean): string {
  const { params, bodyText, isExpression } = tryParse(arrowFnP, dc.bodyStr)!
  const bodyCode = isExpression ? `return ${bodyText}` : bodyText
  const decl = typeDecl(dc.name, dc.typeAnnotation)

  // Data-first path: const param0 = arguments[0], param1 = arguments[1], ...
  const dfAssign = params.map((p, i) => `${p} = arguments[${i}]`).join(', ')

  // Data-last path: capture curried args, closure receives data as first param
  const curryAssign = params.slice(1).map((p, i) => `${p} = _a${i}`).join(', ')
  const captureLines = params.slice(1).map((p, i) => `const _a${i} = arguments[${i}]`).join('; ')
  const dlAssign = `const ${params[0]} = data, ${curryAssign}`

  let closureProps = ''
  if (hasTag) {
    closureProps += `\n    _dl._op = ${opcode}`
    closureProps += `\n    _dl._fn = _a0`
    if (n >= 3) closureProps += `\n    _dl._a1 = _a1`
    if (n >= 4) closureProps += `\n    _dl._a2 = _a2`
  }

  return `${decl} = function ${dc.name}() {
  if (arguments.length >= ${n}) {
    const ${dfAssign}
    ${bodyCode}
  }
  ${captureLines}
  const _dl: any = function(data: any) {
    ${dlAssign}
    ${bodyCode}
  }${closureProps}
  return _dl
} as any\n`
}

function tryResolveRS(dc: DualCall, rsMap: Map<string, RSFunction> | undefined): DualCall {
  if (!dc.bodyIsRef || !rsMap) return dc

  // Body is like "RS.take" or "RS.sort" — extract the function name after "RS."
  const rsMatch = dc.bodyStr.match(/^RS\.(\w+)$/)
  if (!rsMatch) return dc

  const rsName = rsMatch[1]
  const resolved = rsMap.get(rsName)
  if (!resolved) return dc

  // Skip functions that use ReScript runtime
  if (usesRescriptRuntime(resolved.body)) return dc

  // Convert to an inline body that the existing generator can handle
  const paramList = resolved.params.join(': any, ') + (resolved.params.length ? ': any' : '')
  const inlineBody = `(${paramList}) => {\n  ${resolved.body}\n}`

  return { ...dc, bodyStr: inlineBody, bodyIsRef: false }
}

function generateDecl(dc: DualCall, rsMap?: Map<string, RSFunction>): string {
  const resolved = tryResolveRS(dc, rsMap)
  if (resolved.arity <= 1) {
    return resolved.tag ? generateArity1Tagged(resolved) : generateArity1Untagged(resolved)
  }
  return generateArityN(resolved)
}

// --- Module Transformer ---

function collectRSHelpers(generatedCode: string, rsMap: Map<string, RSFunction>, exportedNames: Set<string>): string {
  const helpers: string[] = []
  const emitted = new Set<string>()

  // Iteratively resolve — helpers may reference other helpers
  let changed = true
  let code = generatedCode
  while (changed) {
    changed = false
    const found = pipe(
      [...rsMap.entries()],
      A.filter(([name]: [string, RSFunction]) => !emitted.has(name) && !exportedNames.has(name)),
      A.filter(([name]: [string, RSFunction]) => {
        const pat = new RegExp(`\\b${name}\\b`)
        return pat.test(code) || helpers.some(h => pat.test(h))
      }),
      A.filter(([_, fn]: [string, RSFunction]) => !usesRescriptRuntime(fn.body)),
      A.map(([name, fn]: [string, RSFunction]) => {
        emitted.add(name)
        return `function ${name}(${pipe(fn.params, A.join(', '))}) {\n  ${fn.body}\n}`
      }),
    )
    if (found.length > 0) {
      helpers.push(...found)
      code += '\n' + pipe(found, A.join('\n'))
      changed = true
    }
  }

  return helpers.length > 0
    ? '// Internal helpers (auto-extracted from ReScript compiled output)\n' + pipe(helpers, A.join('\n\n')) + '\n\n'
    : ''
}

function transformModule(src: string, rsMap?: Map<string, RSFunction>): { output: string; rsResolved: number; rsKept: number } {
  const lines = src.split('\n')
  const outputLines: string[] = []
  let rsResolved = 0
  let rsKept = 0
  let hasUnresolvedRS = false

  const deferredRSImports: string[] = []

  // Add header
  outputLines.push('// @ts-nocheck')
  outputLines.push('// Auto-generated by codegen/dual-inline.ts — do not edit')
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

    // Defer RS import lines — emit later only if needed
    if (/import\s+\*\s+as\s+RS\s+from\s+/.test(line)) {
      deferredRSImports.push(line)
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
          // Try to resolve RS reference
          const resolved = tryResolveRS(dc, rsMap)
          if (dc.bodyIsRef && dc.bodyStr.startsWith('RS.') && !resolved.bodyIsRef) {
            rsResolved++
          } else if (dc.bodyIsRef && dc.bodyStr.startsWith('RS.')) {
            rsKept++
            hasUnresolvedRS = true
          }
          outputLines.push(generateDecl(dc, rsMap))
          i = j
          continue
        }
      }

      // Not a dual call — check if it references RS directly (non-dual RS usage)
      if (declText.includes('RS.')) hasUnresolvedRS = true

      for (let k = i; k < j; k++) outputLines.push(lines[k])
      i = j
      continue
    }

    // Non-export lines that reference RS
    if (line.includes('RS.')) hasUnresolvedRS = true

    outputLines.push(line)
    i++
  }

  // Insert RS imports at the top (after header) if any unresolved references remain
  if (hasUnresolvedRS && deferredRSImports.length > 0) {
    outputLines.splice(3, 0, ...deferredRSImports)
  }

  let output = outputLines.join('\n')

  // Collect and prepend internal helpers referenced by inlined RS bodies
  if (rsMap && rsResolved > 0) {
    // Gather names that are exported from this module
    const exportedNames = new Set<string>()
    for (const line of outputLines) {
      const m = line.match(/^export\s+(?:const|function)\s+(\w+)/)
      if (m) exportedNames.add(m[1])
    }
    const helpers = collectRSHelpers(output, rsMap, exportedNames)
    if (helpers) {
      // Insert after header and imports
      const insertIdx = output.indexOf('\n\n', output.indexOf('// Source of truth'))
      if (insertIdx !== -1) {
        output = output.slice(0, insertIdx + 2) + helpers + output.slice(insertIdx + 2)
      }
    }
  }

  return { output, rsResolved, rsKept }
}

const countBraces = (s: string): number =>
  pipe([...s], A.reduce((d: number, ch: string) =>
    '({['.includes(ch) ? d + 1 : ')}]'.includes(ch) ? d - 1 : d, 0))

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

const processModule = (mod: string) => {
  const src = readFileSync(join(DEFS_DIR, `${mod}.ts`), 'utf8')
  const { output, rsResolved, rsKept } = transformModule(src, rsFunctionMaps.get(mod))
  const dualCount = (src.match(/= dual\(/g) || []).length
  writeFileSync(join(SRC_DIR, `${mod}.ts`), output)
  const rsInfo = rsResolved > 0 ? ` (${rsResolved} RS bodies auto-inlined${rsKept > 0 ? `, ${rsKept} kept as ref` : ''})` : ''
  console.log(`  ${mod}.ts: ${dualCount} dual() calls${rsInfo}`)
  return { dualCount, rsResolved, rsKept }
}

const totals = pipe(
  MODULES,
  A.map(processModule),
  A.reduce(
    (acc, r) => ({ fns: acc.fns + r.dualCount, rs: acc.rs + r.rsResolved, kept: acc.kept + r.rsKept }),
    { fns: 0, rs: 0, kept: 0 },
  ),
)

console.log(`\nGenerated ${MODULES.length} modules, ${totals.fns} functions inlined`)
console.log(`RS bodies: ${totals.rs} auto-inlined, ${totals.kept} kept as ref (runtime deps) → src/`)
