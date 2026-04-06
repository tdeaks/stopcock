import { aotCache } from './aot-compiled'
import {
  OP_MAP, OP_FILTER, OP_TAKE, OP_DROP, OP_TAKE_WHILE, OP_DROP_WHILE, OP_FLAT_MAP,
  OP_REJECT, OP_REDUCE, OP_FOR_EACH, OP_EVERY, OP_SOME, OP_FIND, OP_FIND_INDEX,
  OP_NONE, OP_COUNT, OP_SORT_BY, OP_SORT,
  OP_HEAD, OP_LAST, OP_LENGTH, OP_IS_EMPTY, OP_TAIL, OP_INIT,
  OP_REVERSE, OP_SORT_INLINE, OP_UNIQ_INLINE, OP_JOIN, OP_FLATTEN,
  OP_SUM, OP_MIN, OP_MAX,
  OP_STR_TRIM, OP_STR_LOWER, OP_STR_UPPER, OP_STR_TRIM_START, OP_STR_TRIM_END,
  OP_STR_SPLIT, OP_STR_LENGTH, OP_STR_IS_EMPTY,
  OP_DICT_KEYS, OP_DICT_VALUES, OP_DICT_IS_EMPTY,
  OP_MATH_ADD, OP_MATH_SUBTRACT, OP_MATH_MULTIPLY, OP_MATH_DIVIDE,
  OP_MATH_NEGATE, OP_MATH_INC, OP_MATH_DEC,
  OP_GUARD_IS_NUMBER, OP_GUARD_IS_STRING, OP_GUARD_IS_BOOLEAN,
  OP_GUARD_IS_NIL, OP_GUARD_IS_ARRAY, OP_GUARD_IS_OBJECT, OP_GUARD_IS_FUNCTION,
  OP_SORT_ASC, OP_SORT_DESC,
  isFuseableOrTerminal, isTerminalOp, isAccessorOp, isFuseableOp, isScalarOp,
} from './opcodes'

const HALT = Symbol('HALT')

// Quickselect + sort for sort→take(k) fusion
function takeSorted(arr: any[], k: number, cmp: (a: any, b: any) => number): any[] {
  const n = arr.length
  if (k <= 0) return []
  if (k >= n) return arr.slice().sort(cmp)
  const work = arr.slice()
  let lo = 0, hi = n - 1
  while (lo < hi) {
    const pivot = work[lo + ((hi - lo) >> 1)]
    let i = lo, j = hi
    while (i <= j) {
      while (cmp(work[i], pivot) < 0) i++
      while (cmp(work[j], pivot) > 0) j--
      if (i <= j) { const tmp = work[i]; work[i] = work[j]; work[j] = tmp; i++; j-- }
    }
    if (j < k - 1) lo = i
    else if (i > k - 1) hi = j
    else break
  }
  const result = work.slice(0, k)
  result.sort(cmp)
  return result
}

// --- JIT Compiler ---

const isTagged = (fn: any): boolean => typeof fn._op === 'number' && fn._op > 0

type Step = { op: number; fn: any; args?: any[] }
type CompiledRunner = (source: any[], fns: any[], a1s: any[]) => any

const compiledCache = new Map<number, CompiledRunner>()

// CSP check — can we use new Function()?
let canJIT = true
try { new Function('return 1')() } catch { canJIT = false }

function getOpsKey(ops: number[], len: number): number {
  let key = 0
  for (let i = 0; i < len; i++) key = key * 16 + ops[i]
  return key
}

// Callback opcode for introspection — 0 means "no opcode, call the function"
function callbackOp(fn: any): number {
  return (fn && typeof fn._op === 'number' && fn._op > 0) ? fn._op : 0
}

// --- toString() callback inlining ---

const INLINE_CACHE = new Map<Function, string | null>()

const ALLOWED_IDENTS = new Set([
  'typeof', 'instanceof', 'undefined', 'null', 'true', 'false',
  'NaN', 'Infinity', 'Math', 'Array', 'Object', 'Number', 'String', 'Boolean',
  'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'void',
])

const DANGEROUS_RE = /\b(new|delete|throw|await|yield|import|eval)\b/

function tryInlineSource(fn: any): string | null {
  if (typeof fn !== 'function') return null
  const cached = INLINE_CACHE.get(fn)
  if (cached !== undefined) return cached

  let src: string
  try { src = Function.prototype.toString.call(fn) } catch { INLINE_CACHE.set(fn, null); return null }

  if (src.includes('[native code]')) { INLINE_CACHE.set(fn, null); return null }

  // Match: x => expr, (x) => expr
  const m = src.match(/^\(?(\w+)\)?\s*=>\s*(.+)$/)
  if (!m) { INLINE_CACHE.set(fn, null); return null }

  const param = m[1]
  const body = m[2].trim()

  if (body.startsWith('{')) { INLINE_CACHE.set(fn, null); return null }
  if (DANGEROUS_RE.test(body)) { INLINE_CACHE.set(fn, null); return null }

  const idents = body.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g)
  if (idents) {
    for (let i = 0; i < idents.length; i++) {
      if (idents[i] !== param && !ALLOWED_IDENTS.has(idents[i])) {
        INLINE_CACHE.set(fn, null)
        return null
      }
    }
  }

  const inlined = body.replace(new RegExp('\\b' + param + '\\b', 'g'), 'v')
  INLINE_CACHE.set(fn, inlined)
  return inlined
}

// Two-param variant for reduce: (acc, x) => expr
const REDUCE_INLINE_CACHE = new Map<Function, string | null>()

function tryInlineReduceSource(fn: any): string | null {
  if (typeof fn !== 'function') return null
  const cached = REDUCE_INLINE_CACHE.get(fn)
  if (cached !== undefined) return cached

  let src: string
  try { src = Function.prototype.toString.call(fn) } catch { REDUCE_INLINE_CACHE.set(fn, null); return null }

  if (src.includes('[native code]')) { REDUCE_INLINE_CACHE.set(fn, null); return null }

  // Match: (a, b) => expr
  const m = src.match(/^\((\w+)\s*,\s*(\w+)\)\s*=>\s*(.+)$/)
  if (!m) { REDUCE_INLINE_CACHE.set(fn, null); return null }

  const [, p1, p2, body] = m
  const trimmed = body.trim()

  if (trimmed.startsWith('{')) { REDUCE_INLINE_CACHE.set(fn, null); return null }
  if (DANGEROUS_RE.test(trimmed)) { REDUCE_INLINE_CACHE.set(fn, null); return null }

  const idents = trimmed.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g)
  if (idents) {
    for (let i = 0; i < idents.length; i++) {
      if (idents[i] !== p1 && idents[i] !== p2 && !ALLOWED_IDENTS.has(idents[i])) {
        REDUCE_INLINE_CACHE.set(fn, null)
        return null
      }
    }
  }

  // Replace first param → acc, second param → v
  let inlined = trimmed
    .replace(new RegExp('\\b' + p1 + '\\b', 'g'), 'acc')
    .replace(new RegExp('\\b' + p2 + '\\b', 'g'), 'v')

  REDUCE_INLINE_CACHE.set(fn, inlined)
  return inlined
}

// Emit inlined code for a known callback opcode, or fall back to function call
// filter keeps items where pred(v) is true → skip when pred(v) is false
function emitFilterInline(cbOp: number, fnIdx: string, inlineSrc?: string | null): string {
  if (inlineSrc) return 'if(!(' + inlineSrc + '))continue'
  switch (cbOp) {
    case OP_GUARD_IS_NUMBER:   return "if(typeof v!=='number')continue"
    case OP_GUARD_IS_STRING:   return "if(typeof v!=='string')continue"
    case OP_GUARD_IS_BOOLEAN:  return "if(typeof v!=='boolean')continue"
    case OP_GUARD_IS_NIL:      return 'if(v!=null)continue'
    case OP_GUARD_IS_ARRAY:    return 'if(!Array.isArray(v))continue'
    case OP_GUARD_IS_OBJECT:   return "if(typeof v!=='object'||v===null||Array.isArray(v))continue"
    case OP_GUARD_IS_FUNCTION: return "if(typeof v!=='function')continue"
    default: return 'if(!' + fnIdx + '(v))continue'
  }
}

// reject removes items where pred(v) is true → skip when pred(v) is true
function emitRejectInline(cbOp: number, fnIdx: string, inlineSrc?: string | null): string {
  if (inlineSrc) return 'if(' + inlineSrc + ')continue'
  switch (cbOp) {
    case OP_GUARD_IS_NUMBER:   return "if(typeof v==='number')continue"
    case OP_GUARD_IS_STRING:   return "if(typeof v==='string')continue"
    case OP_GUARD_IS_BOOLEAN:  return "if(typeof v==='boolean')continue"
    case OP_GUARD_IS_NIL:      return 'if(v==null)continue'
    case OP_GUARD_IS_ARRAY:    return 'if(Array.isArray(v))continue'
    default: return 'if(' + fnIdx + '(v))continue'
  }
}

function emitMapInline(cbOp: number, fnIdx: string, inlineSrc?: string | null): string {
  if (inlineSrc) return 'v=' + inlineSrc
  switch (cbOp) {
    case OP_MATH_ADD:      return 'v=v+' + fnIdx
    case OP_MATH_SUBTRACT: return 'v=v-' + fnIdx
    case OP_MATH_MULTIPLY: return 'v=v*' + fnIdx
    case OP_MATH_DIVIDE:   return 'v=v/' + fnIdx
    case OP_MATH_NEGATE:   return 'v=-v'
    case OP_MATH_INC:      return 'v=v+1'
    case OP_MATH_DEC:      return 'v=v-1'
    case OP_STR_TRIM:      return 'v=v.trim()'
    case OP_STR_LOWER:     return 'v=v.toLowerCase()'
    case OP_STR_UPPER:     return 'v=v.toUpperCase()'
    default: return 'v=' + fnIdx + '(v)'
  }
}

function jitCompile(ops: number[], len: number, cbOps?: number[], inlineSrcs?: (string | null)[]): CompiledRunner {
  const lastOp = ops[len - 1]
  const hasTerminal = isTerminalOp(lastOp)
  const hasAccessor = isAccessorOp(lastOp)
  const streamLen = (hasTerminal || hasAccessor) ? len - 1 : len

  // Detect all-maps → function composition
  let allMaps = !hasTerminal && !hasAccessor
  if (allMaps) { for (let i = 0; i < len; i++) { if (ops[i] !== OP_MAP) { allMaps = false; break } } }
  if (allMaps && len > 1) {
    const n = len
    return (src, fns) => {
      let composed = fns[0]
      for (let k = 1; k < n; k++) {
        const prev = composed, next = fns[k]
        composed = (x: any) => next(prev(x))
      }
      const r = new Array(src.length)
      for (let i = 0; i < src.length; i++) r[i] = composed(src[i])
      return r
    }
  }

  if (!canJIT) return interpretedFallback(ops, len)

  const hasReduce = hasTerminal && lastOp === OP_REDUCE
  const params: string[] = hasReduce ? ['src', 'fns', 'init'] : ['src', 'fns']

  // Build function body
  const lines: string[] = []

  // Extract callbacks from fns array into local vars
  for (let i = 0; i < len; i++) lines.push('var f' + i + '=fns[' + i + ']')

  // State vars
  for (let i = 0; i < streamLen; i++) {
    if (ops[i] === OP_TAKE) lines.push('var c' + i + '=0')
    if (ops[i] === OP_DROP) lines.push('var d' + i + '=0')
    if (ops[i] === OP_DROP_WHILE) lines.push('var dw' + i + '=true')
  }

  // Result var — pre-alloc for map-only chains (no filter/take/flatMap changes length)
  let canPrealloc = !hasTerminal && !hasAccessor
  if (canPrealloc) { for (let i = 0; i < streamLen; i++) { if (ops[i] !== OP_MAP) { canPrealloc = false; break } } }
  if (!hasTerminal) lines.push(canPrealloc ? 'var r=new Array(src.length)' : 'var r=[]')
  else if (lastOp === OP_REDUCE) lines.push('var acc=init')
  else if (lastOp === OP_EVERY) lines.push('var ev=true')
  else if (lastOp === OP_SOME) lines.push('var sm=false')
  else if (lastOp === OP_FIND_INDEX) lines.push('var fi=0')
  else if (lastOp === OP_NONE) lines.push('var nn=false')
  else if (lastOp === OP_COUNT) lines.push('var cnt=0')

  // Loop condition — add early exit for take ops
  let cond = 'i<src.length'
  for (let i = 0; i < streamLen; i++) {
    if (ops[i] === OP_TAKE) cond += '&&c' + i + '<f' + i
  }

  lines.push('for(var i=0;' + cond + ';i++){')
  lines.push('var v=src[i]')

  // Track flatMap nesting depth
  let flatMapDepth = 0

  // Stream ops
  for (let i = 0; i < streamLen; i++) {
    switch (ops[i]) {
      case OP_MAP:
        lines.push(emitMapInline(cbOps ? cbOps[i] : 0, 'f' + i, inlineSrcs?.[i]))
        break
      case OP_FILTER:
        lines.push(emitFilterInline(cbOps ? cbOps[i] : 0, 'f' + i, inlineSrcs?.[i]))
        break
      case OP_REJECT:
        lines.push(emitRejectInline(cbOps ? cbOps[i] : 0, 'f' + i, inlineSrcs?.[i]))
        break
      case OP_TAKE:
        lines.push('c' + i + '++')
        break
      case OP_DROP:
        lines.push('if(d' + i + '<f' + i + '){d' + i + '++;continue}')
        break
      case OP_TAKE_WHILE: {
        const s = inlineSrcs?.[i]
        lines.push(s ? 'if(!(' + s + '))break' : 'if(!f' + i + '(v))break')
        break
      }
      case OP_DROP_WHILE: {
        const s = inlineSrcs?.[i]
        lines.push(s
          ? 'if(dw' + i + '){if(' + s + ')continue;dw' + i + '=false}'
          : 'if(dw' + i + '){if(f' + i + '(v))continue;dw' + i + '=false}')
      }
        break
      case OP_FLAT_MAP:
        lines.push('var items' + i + '=f' + i + '(v)')
        lines.push('for(var j' + i + '=0;j' + i + '<items' + i + '.length;j' + i + '++){')
        lines.push('v=items' + i + '[j' + i + ']')
        flatMapDepth++
        break
      // Math stream ops — inline arithmetic
      case OP_MATH_ADD:      lines.push('v=v+f' + i); break
      case OP_MATH_SUBTRACT: lines.push('v=v-f' + i); break
      case OP_MATH_MULTIPLY: lines.push('v=v*f' + i); break
      case OP_MATH_DIVIDE:   lines.push('v=v/f' + i); break
      case OP_MATH_NEGATE:   lines.push('v=-v'); break
      case OP_MATH_INC:      lines.push('v=v+1'); break
      case OP_MATH_DEC:      lines.push('v=v-1'); break
      // Guard predicate ops — inline typeof (used inside filter)
      case OP_GUARD_IS_NUMBER:   lines.push("if(typeof v!=='number')continue"); break
      case OP_GUARD_IS_STRING:   lines.push("if(typeof v!=='string')continue"); break
      case OP_GUARD_IS_BOOLEAN:  lines.push("if(typeof v!=='boolean')continue"); break
      case OP_GUARD_IS_NIL:      lines.push('if(v!=null)continue'); break
      case OP_GUARD_IS_ARRAY:    lines.push('if(!Array.isArray(v))continue'); break
      case OP_GUARD_IS_OBJECT:   lines.push("if(typeof v!=='object'||v===null||Array.isArray(v))continue"); break
      case OP_GUARD_IS_FUNCTION: lines.push("if(typeof v!=='function')continue"); break
    }
  }

  // Emit / terminal
  if (!hasTerminal) {
    lines.push(canPrealloc ? 'r[i]=v' : 'r.push(v)')
  } else {
    const ti = len - 1
    switch (lastOp) {
      case OP_REDUCE: {
        const rs = inlineSrcs?.[ti]
        lines.push(rs ? 'acc=' + rs : 'acc=f' + ti + '(acc,v)')
        break
      }
      case OP_FOR_EACH:   lines.push('f' + ti + '(v)'); break
      case OP_EVERY: {
        const s = inlineSrcs?.[ti]
        lines.push(s ? 'if(!(' + s + ')){ev=false;break}' : 'if(!f' + ti + '(v)){ev=false;break}')
        break
      }
      case OP_SOME: {
        const s = inlineSrcs?.[ti]
        lines.push(s ? 'if(' + s + '){sm=true;break}' : 'if(f' + ti + '(v)){sm=true;break}')
        break
      }
      case OP_FIND: {
        const s = inlineSrcs?.[ti]
        lines.push(s ? 'if(' + s + ')return v' : 'if(f' + ti + '(v))return v')
        break
      }
      case OP_FIND_INDEX: {
        const s = inlineSrcs?.[ti]
        lines.push(s ? 'if(' + s + ')return fi;fi++' : 'if(f' + ti + '(v))return fi;fi++')
        break
      }
      case OP_NONE: {
        const s = inlineSrcs?.[ti]
        lines.push(s ? 'if(' + s + '){nn=true;break}' : 'if(f' + ti + '(v)){nn=true;break}')
        break
      }
      case OP_COUNT: {
        const s = inlineSrcs?.[ti]
        lines.push(s ? 'if(' + s + ')cnt++' : 'if(f' + ti + '(v))cnt++')
        break
      }
    }
  }

  // Close flatMap nesting
  for (let d = 0; d < flatMapDepth; d++) lines.push('}')

  // Close for loop
  lines.push('}')

  // Return
  if (hasAccessor) {
    // Accessor ops transform the collected result array
    switch (lastOp) {
      case OP_HEAD:         lines.push('return r[0]'); break
      case OP_LAST:         lines.push('return r[r.length-1]'); break
      case OP_LENGTH:       lines.push('return r.length'); break
      case OP_IS_EMPTY:     lines.push('return r.length===0'); break
      case OP_TAIL:         lines.push('return r.slice(1)'); break
      case OP_INIT:         lines.push('return r.slice(0,-1)'); break
      case OP_REVERSE:      lines.push('return r.reverse()'); break
      case OP_SORT_INLINE:  lines.push('return r.sort(f' + (len - 1) + ')'); break
      case OP_UNIQ_INLINE:  lines.push('return Array.from(new Set(r))'); break
      case OP_JOIN:         lines.push('return r.join(f' + (len - 1) + ')'); break
      case OP_FLATTEN:      lines.push('return r.flat()'); break
      case OP_SUM:          lines.push('var s=0;for(var si=0;si<r.length;si++)s+=r[si];return s'); break
      case OP_MIN:          lines.push('var mn=r[0];for(var mi=1;mi<r.length;mi++)if(r[mi]<mn)mn=r[mi];return mn'); break
      case OP_MAX:          lines.push('var mx=r[0];for(var mi=1;mi<r.length;mi++)if(r[mi]>mx)mx=r[mi];return mx'); break
      // String accessor ops
      case OP_STR_TRIM:       lines.push('return r.trim()'); break
      case OP_STR_LOWER:      lines.push('return r.toLowerCase()'); break
      case OP_STR_UPPER:      lines.push('return r.toUpperCase()'); break
      case OP_STR_TRIM_START: lines.push('return r.trimStart()'); break
      case OP_STR_TRIM_END:   lines.push('return r.trimEnd()'); break
      case OP_STR_SPLIT:      lines.push('return r.split(f' + (len - 1) + ')'); break
      case OP_STR_LENGTH:     lines.push('return r.length'); break
      case OP_STR_IS_EMPTY:   lines.push("return r===''"); break
      // Dict accessor ops
      case OP_DICT_KEYS:      lines.push('return Object.keys(r)'); break
      case OP_DICT_VALUES:    lines.push('return Object.values(r)'); break
      case OP_DICT_IS_EMPTY:  lines.push('return Object.keys(r).length===0'); break
      // Sort specialization
      case OP_SORT_ASC:       lines.push('return r.slice().sort(function(a,b){return a-b})'); break
      case OP_SORT_DESC:      lines.push('return r.slice().sort(function(a,b){return b-a})'); break
    }
  } else if (!hasTerminal) {
    lines.push('return r')
  } else {
    switch (lastOp) {
      case OP_REDUCE:     lines.push('return acc'); break
      case OP_FOR_EACH:   break
      case OP_EVERY:      lines.push('return ev'); break
      case OP_SOME:       lines.push('return sm'); break
      case OP_FIND:       lines.push('return undefined'); break
      case OP_FIND_INDEX: lines.push('return undefined'); break
      case OP_NONE:       lines.push('return !nn'); break
      case OP_COUNT:      lines.push('return cnt'); break
    }
  }

  const code = lines.join(';')
  const jitFn = new Function(...params, code)

  return hasReduce
    ? (source: any[], fns: any[], a1s: any[]) => jitFn(source, fns, a1s[len - 1])
    : (source: any[], fns: any[]) => jitFn(source, fns)
}

// --- Interpreted fallback (for CSP environments) ---

function interpretedFallback(ops: number[], len: number): CompiledRunner {
  return (source, fns, a1s) => {
    const lastOp = ops[len - 1]
    const hasTerminal = isTerminalOp(lastOp)
    const streamLen = hasTerminal ? len - 1 : len

    const state: any[] = new Array(streamLen)
    for (let s = 0; s < streamLen; s++) {
      if (ops[s] === OP_DROP) state[s] = 0
      else if (ops[s] === OP_DROP_WHILE) state[s] = true
      else if (ops[s] === OP_TAKE) state[s] = 0
    }

    // Terminal setup
    let acc: any, result: any, idx = 0, everyResult = true, someResult = false
    if (hasTerminal && lastOp === OP_REDUCE) acc = a1s[len - 1]

    const out: any[] = hasTerminal ? [] : []
    const useOut = !hasTerminal

    outer:
    for (let i = 0; i < source.length; i++) {
      let val = source[i]

      for (let s = 0; s < streamLen; s++) {
        switch (ops[s]) {
          case OP_MAP: val = fns[s](val); break
          case OP_FILTER: if (!fns[s](val)) continue outer; break
          case OP_REJECT: if (fns[s](val)) continue outer; break
          case OP_MATH_ADD: val = val + fns[s]; break
          case OP_MATH_SUBTRACT: val = val - fns[s]; break
          case OP_MATH_MULTIPLY: val = val * fns[s]; break
          case OP_MATH_DIVIDE: val = val / fns[s]; break
          case OP_MATH_NEGATE: val = -val; break
          case OP_MATH_INC: val = val + 1; break
          case OP_MATH_DEC: val = val - 1; break
          case OP_TAKE: if (state[s] >= fns[s]) break outer; state[s]++; break
          case OP_DROP: if (state[s] < fns[s]) { state[s]++; continue outer } break
          case OP_TAKE_WHILE: if (!fns[s](val)) break outer; break
          case OP_DROP_WHILE: if (state[s]) { if (fns[s](val)) continue outer; state[s] = false } break
          case OP_FLAT_MAP: {
            const items = fns[s](val)
            for (let j = 0; j < items.length; j++) {
              let v = items[j]
              for (let s2 = s + 1; s2 < streamLen; s2++) {
                switch (ops[s2]) {
                  case OP_MAP: v = fns[s2](v); break
                  case OP_FILTER: if (!fns[s2](v)) { v = HALT; break } break
                  case OP_TAKE: if (state[s2] >= fns[s2]) break outer; state[s2]++; break
                }
                if (v === HALT) break
              }
              if (v !== HALT) {
                if (useOut) out.push(v)
                else if (hasTerminal) {
                  switch (lastOp) {
                    case OP_REDUCE: acc = fns[len - 1](acc, v); break
                    case OP_FOR_EACH: fns[len - 1](v); break
                    case OP_EVERY: if (!fns[len - 1](v)) { everyResult = false; break outer } break
                    case OP_SOME: if (fns[len - 1](v)) { someResult = true; break outer } break
                    case OP_FIND: if (fns[len - 1](v)) { result = v; break outer } break
                    case OP_FIND_INDEX: if (fns[len - 1](v)) { result = idx; break outer } idx++; break
                    case OP_NONE: if (fns[len - 1](v)) { someResult = true; break outer } break
                    case OP_COUNT: if (fns[len - 1](v)) idx++; break
                  }
                }
              }
            }
            continue outer
          }
        }
      }

      // Emit
      if (useOut) out.push(val)
      else if (hasTerminal) {
        switch (lastOp) {
          case OP_REDUCE: acc = fns[len - 1](acc, val); break
          case OP_FOR_EACH: fns[len - 1](val); break
          case OP_EVERY: if (!fns[len - 1](val)) { everyResult = false; break outer } break
          case OP_SOME: if (fns[len - 1](val)) { someResult = true; break outer } break
          case OP_FIND: if (fns[len - 1](val)) { result = val; break outer } break
          case OP_FIND_INDEX: if (fns[len - 1](val)) { result = idx; break outer } idx++; break
          case OP_NONE: if (fns[len - 1](val)) { someResult = true; break outer } break
          case OP_COUNT: if (fns[len - 1](val)) idx++; break
        }
      }
    }

    if (useOut) return out
    switch (lastOp) {
      case OP_REDUCE: return acc
      case OP_FOR_EACH: return undefined
      case OP_EVERY: return everyResult
      case OP_SOME: return someResult
      case OP_FIND: return result
      case OP_FIND_INDEX: return result
      case OP_NONE: return !someResult
      case OP_COUNT: return idx
    }
  }
}

// --- Main entry points ---

// Reusable op buffer
const opBuf = new Int8Array(32)

const inlinedCache = new Map<string, CompiledRunner>()

function getOrCompile(tagged: any[], start: number, end: number): { runner: CompiledRunner; len: number } {
  const len = end - start
  let key = 0
  const cbOps: number[] = new Array(len)
  const inlineSrcs: (string | null)[] = new Array(len)
  let hasInline = false
  for (let i = 0; i < len; i++) {
    const t = tagged[start + i]
    const op = t._op
    const cbOp = callbackOp(t._fn)
    opBuf[i] = op
    cbOps[i] = cbOp
    key = key * 256 + op * 2 + (cbOp > 0 ? 1 : 0)
    if (cbOp > 0) key = key * 128 + cbOp
    // Try toString() inlining for untagged callbacks
    if (cbOp === 0 && t._fn) {
      // Use reduce-specific parser for OP_REDUCE
      inlineSrcs[i] = op === OP_REDUCE ? tryInlineReduceSource(t._fn) : tryInlineSource(t._fn)
      if (inlineSrcs[i]) hasInline = true
    } else {
      inlineSrcs[i] = null
    }
  }

  let hasCbIntrospection = false
  for (let i = 0; i < len; i++) { if (cbOps[i] > 0) { hasCbIntrospection = true; break } }

  // Inlined pipelines get a string-keyed cache (specialised to callback source)
  if (hasInline) {
    let skey = ''
    for (let i = 0; i < len; i++) skey += opBuf[i] + ':' + (cbOps[i] || '') + ':' + (inlineSrcs[i] || '') + '|'
    let runner = inlinedCache.get(skey)
    if (!runner) {
      const ops: number[] = new Array(len)
      for (let i = 0; i < len; i++) ops[i] = opBuf[i]
      runner = jitCompile(ops, len, cbOps, inlineSrcs)
      inlinedCache.set(skey, runner)
    }
    return { runner, len }
  }

  let runner = compiledCache.get(key)
  if (runner === undefined) {
    if (hasCbIntrospection) {
      const ops: number[] = new Array(len)
      for (let i = 0; i < len; i++) ops[i] = opBuf[i]
      runner = jitCompile(ops, len, cbOps)
      compiledCache.set(key, runner)
    } else {
      let baseKey = 0
      for (let i = 0; i < len; i++) baseKey = baseKey * 256 + opBuf[i] * 2
      runner = aotCache.get(baseKey)
      if (!runner) {
        const ops: number[] = new Array(len)
        for (let i = 0; i < len; i++) ops[i] = opBuf[i]
        runner = jitCompile(ops, len)
      }
      compiledCache.set(key, runner)
    }
  }

  return { runner, len }
}

// Shared buffers — avoid per-call allocations (safe: JIT extracts locals before any callback runs)
const _fns: any[] = new Array(32)
const _a1s: any[] = new Array(32)

// MRU cache: skip getOrCompile + extraction when same pipeline is called repeatedly
let _mruLen = 0
const _mruCbs: any[] = new Array(32)
const _mruOps: number[] = new Array(32)
const _mruFns: any[] = new Array(32)
const _mruA1s: any[] = new Array(32)
let _mruRunner: CompiledRunner | null = null

function runSegment(data: any[], tagged: any[], start: number, end: number): any {
  const len = end - start

  // MRU hit: same callback references + opcodes as last call → skip all scanning/extraction
  // Compare both _fn and _op to avoid collisions between accessor ops (head/last/etc share _fn === undefined)
  if (_mruRunner && _mruLen === len &&
      tagged[start + len - 1]._fn === _mruCbs[len - 1] &&
      tagged[start + len - 1]._op === _mruOps[len - 1]) {
    let hit = true
    for (let i = 0; i < len - 1; i++) {
      if (tagged[start + i]._fn !== _mruCbs[i] || tagged[start + i]._op !== _mruOps[i]) { hit = false; break }
    }
    if (hit) return _mruRunner(data, _mruFns, _mruA1s)
  }

  // Only populate MRU on first call or pipeline length change — avoids store overhead on repeated misses
  const updateMru = !_mruRunner || _mruLen !== len

  const { runner } = getOrCompile(tagged, start, end)
  for (let i = 0; i < len; i++) {
    const t = tagged[start + i]
    const cb = t._fn
    const cbOp = callbackOp(cb)
    if (cbOp >= OP_MATH_ADD && cbOp <= OP_MATH_DEC && cb._fn !== undefined) {
      _fns[i] = cb._fn
    } else {
      _fns[i] = cb
    }
    _a1s[i] = t._a1
    if (updateMru) {
      _mruCbs[i] = cb
      _mruOps[i] = t._op
      _mruFns[i] = _fns[i]
      _mruA1s[i] = _a1s[i]
    }
  }
  if (updateMru) { _mruLen = len; _mruRunner = runner }
  return runner(data, _fns, _a1s)
}

export function tryCompileFlow(fns: Array<(x: unknown) => unknown>): ((a: unknown) => unknown) | null {
  const tagged = fns as any[]
  for (let i = 0; i < tagged.length; i++) {
    if (!isTagged(tagged[i]) || !isFuseableOrTerminal(tagged[i]._op)) return null
  }

  const { runner } = getOrCompile(tagged, 0, tagged.length)

  // Pre-extract at definition time — zero allocation per call
  const liveFns: any[] = new Array(tagged.length)
  const liveA1s: any[] = new Array(tagged.length)
  for (let i = 0; i < tagged.length; i++) {
    liveFns[i] = tagged[i]._fn
    liveA1s[i] = tagged[i]._a1
  }
  return (a: unknown) => runner(a as any[], liveFns, liveA1s)
}

// --- Scalar JIT ---

type ScalarRunner = (val: any, fns: any[]) => any
const scalarCache = new Map<number, ScalarRunner>()

function scalarJitCompile(ops: number[], len: number): ScalarRunner {
  if (!canJIT) return scalarFallback(ops, len)

  const params: string[] = ['v']
  for (let i = 0; i < len; i++) params.push('f' + i)

  const lines: string[] = []
  for (let i = 0; i < len; i++) {
    switch (ops[i]) {
      // Math
      case OP_MATH_ADD:      lines.push('v=v+f' + i); break
      case OP_MATH_SUBTRACT: lines.push('v=v-f' + i); break
      case OP_MATH_MULTIPLY: lines.push('v=v*f' + i); break
      case OP_MATH_DIVIDE:   lines.push('v=v/f' + i); break
      case OP_MATH_NEGATE:   lines.push('v=-v'); break
      case OP_MATH_INC:      lines.push('v=v+1'); break
      case OP_MATH_DEC:      lines.push('v=v-1'); break
      // String
      case OP_STR_TRIM:       lines.push('v=v.trim()'); break
      case OP_STR_LOWER:      lines.push('v=v.toLowerCase()'); break
      case OP_STR_UPPER:      lines.push('v=v.toUpperCase()'); break
      case OP_STR_TRIM_START: lines.push('v=v.trimStart()'); break
      case OP_STR_TRIM_END:   lines.push('v=v.trimEnd()'); break
      case OP_STR_SPLIT:      lines.push('v=v.split(f' + i + ')'); break
      case OP_STR_LENGTH:     lines.push('v=v.length'); break
      case OP_STR_IS_EMPTY:   lines.push("v=v===''"); break
      // Dict
      case OP_DICT_KEYS:      lines.push('v=Object.keys(v)'); break
      case OP_DICT_VALUES:    lines.push('v=Object.values(v)'); break
      case OP_DICT_IS_EMPTY:  lines.push('v=Object.keys(v).length===0'); break
      // Guard (as boolean transform)
      case OP_GUARD_IS_NUMBER:   lines.push("v=typeof v==='number'"); break
      case OP_GUARD_IS_STRING:   lines.push("v=typeof v==='string'"); break
      case OP_GUARD_IS_BOOLEAN:  lines.push("v=typeof v==='boolean'"); break
      case OP_GUARD_IS_NIL:      lines.push('v=v==null'); break
      case OP_GUARD_IS_ARRAY:    lines.push('v=Array.isArray(v)'); break
      case OP_GUARD_IS_OBJECT:   lines.push("v=typeof v==='object'&&v!==null&&!Array.isArray(v)"); break
      case OP_GUARD_IS_FUNCTION: lines.push("v=typeof v==='function'"); break
      default:
        // Unknown scalar op — call the function directly
        lines.push('v=f' + i + '(v)'); break
    }
  }
  lines.push('return v')

  const code = lines.join(';')
  const jitFn = new Function(...params, code)

  return (val, fns) => {
    switch (len) {
      case 1: return jitFn(val, fns[0])
      case 2: return jitFn(val, fns[0], fns[1])
      case 3: return jitFn(val, fns[0], fns[1], fns[2])
      case 4: return jitFn(val, fns[0], fns[1], fns[2], fns[3])
      case 5: return jitFn(val, fns[0], fns[1], fns[2], fns[3], fns[4])
      default: {
        const args: any[] = [val]
        for (let i = 0; i < len; i++) args.push(fns[i])
        return jitFn.apply(null, args)
      }
    }
  }
}

function scalarFallback(ops: number[], len: number): ScalarRunner {
  return (val, fns) => {
    let v = val
    for (let i = 0; i < len; i++) {
      switch (ops[i]) {
        case OP_MATH_ADD:      v = v + fns[i]; break
        case OP_MATH_SUBTRACT: v = v - fns[i]; break
        case OP_MATH_MULTIPLY: v = v * fns[i]; break
        case OP_MATH_DIVIDE:   v = v / fns[i]; break
        case OP_MATH_NEGATE:   v = -v; break
        case OP_MATH_INC:      v = v + 1; break
        case OP_MATH_DEC:      v = v - 1; break
        case OP_STR_TRIM:       v = v.trim(); break
        case OP_STR_LOWER:      v = v.toLowerCase(); break
        case OP_STR_UPPER:      v = v.toUpperCase(); break
        case OP_STR_TRIM_START: v = v.trimStart(); break
        case OP_STR_TRIM_END:   v = v.trimEnd(); break
        case OP_STR_SPLIT:      v = v.split(fns[i]); break
        case OP_STR_LENGTH:     v = v.length; break
        case OP_STR_IS_EMPTY:   v = v === ''; break
        case OP_DICT_KEYS:      v = Object.keys(v); break
        case OP_DICT_VALUES:    v = Object.values(v); break
        case OP_DICT_IS_EMPTY:  v = Object.keys(v).length === 0; break
        default: v = fns[i](v); break
      }
    }
    return v
  }
}

function runScalar(data: any, tagged: any[], start: number, end: number): any {
  const len = end - start
  let key = 0
  for (let i = 0; i < len; i++) key = key * 256 + tagged[start + i]._op

  let runner = scalarCache.get(key)
  if (runner === undefined) {
    const ops: number[] = new Array(len)
    for (let i = 0; i < len; i++) ops[i] = tagged[start + i]._op
    runner = scalarJitCompile(ops, len)
    scalarCache.set(key, runner)
  }

  const fns: any[] = new Array(len)
  for (let i = 0; i < len; i++) fns[i] = tagged[start + i]._fn
  return runner(data, fns)
}

export function fuse(a: unknown, fns: Array<(x: unknown) => unknown>): unknown {
  if (fns.length === 0) return a

  const tagged = fns as any[]

  // Single scan: classify the entire pipeline
  // lane: 0=not-started, 1=arrayOps, 2=scalarOps, 3=mixed-fuseable, -1=has-untagged/unknown
  let lane = 0
  for (let i = 0; i < tagged.length; i++) {
    const t = tagged[i]
    if (typeof t._op !== 'number' || t._op <= 0) { lane = -1; break }
    const op = t._op
    if (isFuseableOp(op) || isTerminalOp(op) || isAccessorOp(op)) {
      if (lane === 2) lane = 3
      else if (lane === 0) lane = 1
    } else if (isScalarOp(op)) {
      if (lane === 1) lane = 3
      else if (lane === 0) lane = 2
    } else { lane = -1; break }
  }

  if (lane === 2) return runScalar(a, tagged, 0, tagged.length)
  if (lane >= 1) return runSegment(a as any[], tagged, 0, tagged.length)

  // Slow path: mixed tagged/untagged, materialization boundaries
  let data: any = a
  let i = 0

  while (i < tagged.length) {
    const fn = tagged[i]

    if (!isTagged(fn) || !isFuseableOrTerminal(fn._op)) {
      // Sort→take fusion
      const op = isTagged(fn) ? fn._op : -1
      if ((op === OP_SORT_BY || op === OP_SORT || op === OP_SORT_ASC || op === OP_SORT_DESC) && i + 1 < tagged.length) {
        const next = tagged[i + 1]
        if (isTagged(next) && next._op === OP_TAKE) {
          const cmp = op === OP_SORT_BY ? fn._fn
            : op === OP_SORT_DESC ? ((a: number, b: number) => b - a)
            : ((a: number, b: number) => a - b)
          data = takeSorted(data as any[], next._fn, cmp)
          i += 2
          continue
        }
      }
      data = fn(data)
      i++
      continue
    }

    const segStart = i
    while (i < tagged.length) {
      const f = tagged[i]
      if (!isTagged(f) || !isFuseableOrTerminal(f._op)) break
      const term = isTerminalOp(f._op)
      i++
      if (term) break
    }

    data = runSegment(data as any[], tagged, segStart, i)
  }

  return data
}

// Direct array-ops dispatch — skips classification when caller already verified
export function fuseArray(a: any[], fns: any[], len?: number): any {
  return runSegment(a, fns, 0, len ?? fns.length)
}

