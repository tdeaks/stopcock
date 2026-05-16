/**
 * AOT-specialise the route table into a single matcher function.
 *
 * Strategy:
 *   - Per-method dispatch via if/else
 *   - Static paths: Map lookup
 *   - Dynamic paths sharing a common pattern with a varying final segment
 *     collapse into ONE regex + switch (prefix-sharing optimisation)
 *   - Remaining dynamic paths merged into a single alternation regex with
 *     marker groups (the RegExpRouter trick)
 *
 * The matcher mutates a pre-allocated scratch object instead of allocating
 * one per match. Callers read fields synchronously inside fetch and copy
 * what they need before any `await`, so no concurrency hazard.
 */

export type RouteSpec = {
  method: string
  path: string
  paramNames: string[]
  pattern: RegExp
}

/** Mutable scratch returned by the matcher. Caller reads fields synchronously. */
export type MatchScratch = {
  index: number
  /** Eagerly-materialised params from structural dispatch. Takes precedence over m/offsets when non-null. */
  params: Record<string, string> | null
  /** Raw regex exec result, or null for static + structural hits. */
  m: RegExpExecArray | null
  /** Param-name list, in order, parallel to the regex's capture groups. */
  paramNames: readonly string[]
  /** Capture-group offset for each param. Same length as paramNames. */
  paramOffsets: readonly number[]
}

export type MatcherFn = (method: string, path: string) => MatchScratch | null

const isStatic = (path: string): boolean => !path.includes(':')
const safeForDQ = (s: string): boolean => !/["\\\r\n]/.test(s)
const dq = (s: string): string => (safeForDQ(s) ? `"${s}"` : JSON.stringify(s))

const MAP_THRESHOLD = 4

// Find groups of routes that share the same "shape" but differ only in a
// single literal suffix segment. For example:
//   /users/:id/posts/0
//   /users/:id/posts/1
//   ...
//   /users/:id/posts/9
// All share shape `/users/:id/posts/<literal>` and only the trailing literal
// varies. We emit one regex for the shape with the literal captured, then
// dispatch via switch.
//
// Conservative: only group if the differing segment is the last segment and
// is literal (no `:`).

type SharedGroup = {
  /** Indices into `routes`, ordered by registration. */
  indices: number[]
  /** Path with the trailing literal segment replaced by `*`. */
  shape: string
  /** Each route's trailing literal value, parallel to indices. */
  literals: string[]
  paramNames: string[]
}

const buildShape = (path: string): { shape: string; tail: string | null; paramNames: string[] } | null => {
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return null
  const last = segments[segments.length - 1]!
  if (last.startsWith(':')) return null
  // Last segment must be a pure literal (no inner colon)
  if (last.includes(':')) return null
  const prefix = segments.slice(0, -1)
  if (prefix.length === 0) return null
  const paramNames = prefix.filter((s) => s.startsWith(':')).map((s) => s.slice(1))
  // Shape: replace param segments with $, keep literal segments
  const shape = '/' + prefix.map((s) => (s.startsWith(':') ? '$' : s)).join('/') + '/*'
  return { shape, tail: last, paramNames }
}

const groupBySharedPrefix = (routes: RouteSpec[], indices: number[]): { groups: SharedGroup[]; leftover: number[] } => {
  const groups = new Map<string, SharedGroup>()
  const leftover: number[] = []
  for (const i of indices) {
    const r = routes[i]!
    const built = buildShape(r.path)
    if (!built) { leftover.push(i); continue }
    let g = groups.get(built.shape)
    if (!g) {
      g = { indices: [], shape: built.shape, literals: [], paramNames: built.paramNames }
      groups.set(built.shape, g)
    }
    g.indices.push(i)
    g.literals.push(built.tail!)
  }
  // Only "use" a group if it has 2+ members; otherwise the single member
  // goes back to the leftover bucket for normal merged-regex treatment.
  const useful: SharedGroup[] = []
  for (const g of groups.values()) {
    if (g.indices.length >= 2) useful.push(g)
    else leftover.push(...g.indices)
  }
  return { groups: useful, leftover }
}

/** Build a regex source from a shape like `/users/$/posts/*` */
const shapeToRegexSource = (shape: string): string => {
  // Each `$` becomes ([^/]+); the trailing `*` becomes ([^/]+) for the literal capture
  const segs = shape.split('/').filter((_, idx) => idx > 0)
  const body = segs.map((s) => {
    if (s === '$' || s === '*') return '\\/([^/]+)'
    return '\\/' + s.replace(/[.+*?^$()[\]{}|\\]/g, '\\$&')
  }).join('')
  return '^' + body + '\\/?$'
}

type CompilePlan = {
  /** Full source for `new Function`: includes "use strict", SCRATCH var, and `return function ...`. */
  source: string
  /** Just the function body content (between the function curly braces). Used by build-time codegen. */
  functionBody: string
  /** Pre-built data passed to the closure: static lookup Maps + literal switch Maps. */
  closureData: Record<string, unknown>
  /** Metadata for the caller to construct ctx (paramNames per route index). */
  routes: RouteSpec[]
}

export const generateMatcherSource = (routes: RouteSpec[]): CompilePlan => {
  const byMethod = new Map<string, number[]>()
  routes.forEach((r, i) => {
    const list = byMethod.get(r.method) ?? []
    list.push(i)
    byMethod.set(r.method, list)
  })

  const closureData: Record<string, unknown> = {}
  const bodyLines: string[] = []
  bodyLines.push('  var m, idx;')

  // Emit the matcher logic for a single (method, first-char-bucket) cell.
  // Indentation is parameterised so we can nest inside a switch.
  const emitCell = (method: string, indices: number[], bucketKey: string, indent: string) => {
    const staticIdxs = indices.filter((i) => isStatic(routes[i]!.path))
    const dynamicIdxs = indices.filter((i) => !isStatic(routes[i]!.path))

    // Static dispatch. Path is normalised at fetch entry (no trailing slash),
    // so we only need one entry per route.
    if (staticIdxs.length >= MAP_THRESHOLD) {
      const map = new Map<string, number>()
      for (const i of staticIdxs) map.set(routes[i]!.path, i)
      const varName = `S_${method}_${bucketKey}`
      closureData[varName] = map
      bodyLines.push(`${indent}idx = ${varName}.get(path);`)
      bodyLines.push(`${indent}if (idx !== undefined) { SCRATCH.index = idx; SCRATCH.m = null; SCRATCH.params = null; SCRATCH.paramNames = EMPTY_ARR; SCRATCH.paramOffsets = EMPTY_ARR; return SCRATCH; }`)
    } else {
      for (const i of staticIdxs) {
        const p = routes[i]!.path
        bodyLines.push(`${indent}if (path === ${dq(p)}) { SCRATCH.index = ${i}; SCRATCH.m = null; SCRATCH.params = null; SCRATCH.paramNames = EMPTY_ARR; SCRATCH.paramOffsets = EMPTY_ARR; return SCRATCH; }`)
      }
    }

    const { groups, leftover } = groupBySharedPrefix(routes, dynamicIdxs)

    groups.forEach((g, gi) => {
      // Structural dispatch: walk path with startsWith + indexOf instead of regex.
      // Path normalisation happens at fetch entry, so we don't accept trailing /.
      const literalMap = new Map<string, number>()
      g.literals.forEach((lit, k) => literalMap.set(lit, g.indices[k]!))
      const litMapVar = `L_${method}_${bucketKey}_${gi}`
      closureData[litMapVar] = literalMap

      // Parse the shape into a sequence of [LiteralSeg | ParamSeg, ...]
      // ending with a LiteralCapture (the trailing `*`).
      const segs = g.shape.split('/').filter(Boolean) // e.g. ['users', '$', 'posts', '*']

      // Walk the shape, emitting code that consumes path and captures param values.
      // `pos` is either a constant number (folded) or the name of a runtime var.
      bodyLines.push(`${indent}// shape: ${g.shape}`)
      bodyLines.push(`${indent}_block: {`)
      const ind = `${indent}  `

      let constPos: number | null = 0
      let varPos: string | null = null
      const renderPos = () => (constPos !== null ? String(constPos) : varPos!)
      const renderPosPlus = (n: number) => (constPos !== null ? String(constPos + n) : `(${varPos} + ${n})`)
      const paramVarOf: Record<string, string> = {}
      let paramCount = 0

      // Pre-condition tracking:
      //  - posPointsToSlash: the byte at `pos` is known to be '/'. A following
      //    literal can skip the leading-slash char.
      //  - slashAlreadyConsumed: pos is right AFTER a '/'. A following param
      //    can skip its leading-slash check.
      let posPointsToSlash = false   // true after consumeParam (indexOf landed on /)
      let slashAlreadyConsumed = false // true after literal with folded trailing /

      const consumeLiteral = (lit: string, nextIsParam: boolean) => {
        // Body of the literal segment (may skip the leading '/' if we know it's there).
        // Trailing '/' is folded in when next is a param.
        const skipLead = posPointsToSlash
        const prefix = skipLead ? '' : '/'
        const suffix = nextIsParam ? '/' : ''
        const piece = `${prefix}${lit}${suffix}`
        const startAt = skipLead ? renderPosPlus(1) : renderPos()
        bodyLines.push(`${ind}if (!path.startsWith(${dq(piece)}, ${startAt})) break _block;`)
        const advance = (skipLead ? 1 : 0) + piece.length
        if (constPos !== null) constPos += advance
        else varPos = renderPosPlus(advance)
        slashAlreadyConsumed = nextIsParam
        posPointsToSlash = false
      }

      const consumeParam = (name: string, isLast: boolean) => {
        if (!slashAlreadyConsumed) {
          bodyLines.push(`${ind}if (path.charCodeAt(${renderPos()}) !== 47) break _block;`) // '/'
        }
        const startVar = `s${paramCount}`
        const endVar = `e${paramCount}`
        paramCount += 1
        bodyLines.push(`${ind}var ${startVar} = ${slashAlreadyConsumed ? renderPos() : renderPosPlus(1)};`)
        slashAlreadyConsumed = false
        if (isLast) {
          bodyLines.push(`${ind}var ${endVar} = path.length;`)
          posPointsToSlash = false
        } else {
          bodyLines.push(`${ind}var ${endVar} = path.indexOf('/', ${startVar});`)
          bodyLines.push(`${ind}if (${endVar} === -1) break _block;`)
          posPointsToSlash = true // indexOf landed on '/'
        }
        const paramVar = `pv_${paramCount}`
        bodyLines.push(`${ind}var ${paramVar} = path.slice(${startVar}, ${endVar});`)
        paramVarOf[name] = paramVar
        constPos = null
        varPos = endVar
      }

      for (let si = 0; si < segs.length - 1; si++) {
        const seg = segs[si]!
        const next = segs[si + 1]!
        if (seg === '$') {
          const pname = g.paramNames[Object.keys(paramVarOf).length]!
          consumeParam(pname, false)
        } else {
          // Both `$` (param) and `*` (discriminator) need a leading '/' next,
          // so we can fold the trailing slash into this literal in either case.
          consumeLiteral(seg, next === '$' || next === '*')
        }
      }
      // Final segment: literal discriminator. Capture remainder of path.
      if (slashAlreadyConsumed) {
        bodyLines.push(`${ind}var litStart = ${renderPos()};`)
      } else if (posPointsToSlash) {
        bodyLines.push(`${ind}var litStart = ${renderPosPlus(1)};`)
      } else {
        bodyLines.push(`${ind}if (path.charCodeAt(${renderPos()}) !== 47) break _block;`)
        bodyLines.push(`${ind}var litStart = ${renderPosPlus(1)};`)
      }
      bodyLines.push(`${ind}var lit = path.slice(litStart);`)
      bodyLines.push(`${ind}idx = ${litMapVar}.get(lit);`)
      bodyLines.push(`${ind}if (idx !== undefined) {`)
      bodyLines.push(`${ind}  SCRATCH.index = idx;`)
      // Build params object eagerly (cheap; structural dispatch is fast enough
      // that we lose nothing by not deferring).
      const paramFields = g.paramNames.map((n) => `${dq(n)}: ${paramVarOf[n]!}`).join(', ')
      bodyLines.push(`${ind}  SCRATCH.params = { ${paramFields} };`)
      bodyLines.push(`${ind}  SCRATCH.m = null;`)
      bodyLines.push(`${ind}  SCRATCH.paramNames = EMPTY_ARR; SCRATCH.paramOffsets = EMPTY_ARR;`)
      bodyLines.push(`${ind}  return SCRATCH;`)
      bodyLines.push(`${ind}}`)
      bodyLines.push(`${indent}}`)
    })

    // Leftover routes (no prefix-sharing): emit one structural dispatcher each.
    // This eliminates regex entirely from the matcher for typical route tables.
    for (const i of leftover) {
      const r = routes[i]!
      const segs = r.path.split('/').filter(Boolean)
      const labelId = `_lo_${i}`
      bodyLines.push(`${indent}// route ${i}: ${r.method} ${r.path}`)
      bodyLines.push(`${indent}${labelId}: {`)
      const ind = `${indent}  `
      let constPos: number | null = 0
      let varPos: string | null = null
      const renderPos = () => (constPos !== null ? String(constPos) : varPos!)
      const renderPosPlus = (n: number) => (constPos !== null ? String(constPos + n) : `(${varPos} + ${n})`)
      const paramVarOf: Record<string, string> = {}
      let pi = 0
      let slashConsumed = false
      for (let si = 0; si < segs.length; si++) {
        const seg = segs[si]!
        const isLastSeg = si === segs.length - 1
        const next = isLastSeg ? null : segs[si + 1]!
        if (seg.startsWith(':')) {
          const pname = seg.slice(1)
          if (!slashConsumed) {
            bodyLines.push(`${ind}if (path.charCodeAt(${renderPos()}) !== 47) break ${labelId};`)
          }
          const startVar = `s${pi}_${i}`
          const endVar = `e${pi}_${i}`
          pi++
          bodyLines.push(`${ind}var ${startVar} = ${slashConsumed ? renderPos() : renderPosPlus(1)};`)
          slashConsumed = false
          if (isLastSeg) {
            bodyLines.push(`${ind}var ${endVar} = path.length;`)
            bodyLines.push(`${ind}if (path.indexOf('/', ${startVar}) !== -1) break ${labelId};`)
          } else {
            bodyLines.push(`${ind}var ${endVar} = path.indexOf('/', ${startVar});`)
            bodyLines.push(`${ind}if (${endVar} === -1) break ${labelId};`)
          }
          const paramVar = `pv${pi}_${i}`
          bodyLines.push(`${ind}var ${paramVar} = path.slice(${startVar}, ${endVar});`)
          bodyLines.push(`${ind}if (${paramVar}.length === 0) break ${labelId};`)
          paramVarOf[pname] = paramVar
          constPos = null
          varPos = endVar
        } else {
          // Literal segment. If the next segment is a param, fold the trailing
          // slash into this startsWith and skip the next char check.
          const nextIsParam = next !== null && next.startsWith(':')
          const suffix = nextIsParam ? '/' : ''
          const piece = `/${seg}${suffix}`
          bodyLines.push(`${ind}if (!path.startsWith(${dq(piece)}, ${renderPos()})) break ${labelId};`)
          if (constPos !== null) constPos += piece.length
          else varPos = renderPosPlus(piece.length)
          slashConsumed = nextIsParam
          if (isLastSeg) {
            bodyLines.push(`${ind}if (${renderPos()} !== path.length) break ${labelId};`)
          }
        }
      }
      // Match: build params object if needed
      bodyLines.push(`${ind}SCRATCH.index = ${i};`)
      if (r.paramNames.length > 0) {
        const paramFields = r.paramNames.map((n) => `${dq(n)}: ${paramVarOf[n]!}`).join(', ')
        bodyLines.push(`${ind}SCRATCH.params = { ${paramFields} };`)
      } else {
        bodyLines.push(`${ind}SCRATCH.params = null;`)
      }
      bodyLines.push(`${ind}SCRATCH.m = null; SCRATCH.paramNames = EMPTY_ARR; SCRATCH.paramOffsets = EMPTY_ARR;`)
      bodyLines.push(`${ind}return SCRATCH;`)
      bodyLines.push(`${indent}}`)
    }
  }

  // Bucket a method's routes by the char-code at position 1 (just after the
  // leading `/`). Wildcard routes (very rare; we don't have any in this PoC)
  // would need a fallthrough bucket; for now every path has a literal first
  // char.
  const bucketByFirstChar = (indices: number[]): Map<number, number[]> => {
    const byChar = new Map<number, number[]>()
    for (const i of indices) {
      const p = routes[i]!.path
      const c = p.length > 1 ? p.charCodeAt(1) : 0
      const list = byChar.get(c) ?? []
      list.push(i)
      byChar.set(c, list)
    }
    return byChar
  }

  let firstMethod = true
  for (const [method, indices] of byMethod) {
    bodyLines.push(`  ${firstMethod ? 'if' : 'else if'} (method === ${dq(method)}) {`)
    firstMethod = false

    const byChar = bucketByFirstChar(indices)
    // Inline switch when the bucket has 2+ first-chars; otherwise emit
    // unconditional cell (a single bucket means the switch saves nothing).
    if (byChar.size >= 2) {
      bodyLines.push(`    switch (path.charCodeAt(1)) {`)
      for (const [c, sub] of byChar) {
        const chr = c >= 32 && c < 127 ? String.fromCharCode(c) : `\\u${c.toString(16).padStart(4, '0')}`
        bodyLines.push(`      case ${c}: { // '${chr}'`)
        emitCell(method, sub, `c${c}`, '        ')
        bodyLines.push(`        break;`)
        bodyLines.push(`      }`)
      }
      bodyLines.push(`    }`)
    } else {
      // Single bucket — no switch overhead.
      for (const [, sub] of byChar) {
        emitCell(method, sub, 'all', '    ')
      }
    }

    bodyLines.push('  }')
  }

  bodyLines.push('  return null;')

  closureData['EMPTY_ARR'] = Object.freeze([])

  const functionBody = bodyLines.join('\n')
  const source = [
    '"use strict";',
    'var SCRATCH = { index: 0, params: null, m: null, paramNames: EMPTY_ARR, paramOffsets: EMPTY_ARR };',
    'return function match(method, path) {',
    functionBody,
    '};',
  ].join('\n')

  return { source, functionBody, closureData, routes }
}

export const compileMatcher = (routes: RouteSpec[]): MatcherFn => {
  const plan = generateMatcherSource(routes)
  const names = Object.keys(plan.closureData)
  const values = names.map((n) => plan.closureData[n])
  const factory = new Function(...names, plan.source)
  return factory(...values) as MatcherFn
}
