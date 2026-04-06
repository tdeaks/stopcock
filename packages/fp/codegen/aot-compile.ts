/**
 * AOT Compiler — generates pre-compiled fusion functions at build time.
 * Dogfoods @stopcock/fp for all data transformation.
 *
 * Usage: bun run codegen/aot-compile.ts
 * Output: src/fp/aot-compiled.ts
 */

import { pipe, flow, A } from '../src'
import {
  OP_MAP, OP_FILTER, OP_TAKE, OP_DROP, OP_TAKE_WHILE, OP_DROP_WHILE, OP_FLAT_MAP,
  OP_REJECT, OP_REDUCE, OP_FOR_EACH, OP_EVERY, OP_SOME, OP_FIND, OP_FIND_INDEX,
  OP_NONE, OP_COUNT,
  OP_HEAD, OP_LAST, OP_LENGTH, OP_IS_EMPTY, OP_TAIL, OP_INIT,
  OP_REVERSE, OP_UNIQ_INLINE, OP_JOIN, OP_FLATTEN,
  OP_SUM, OP_MIN, OP_MAX,
  OP_SORT_ASC, OP_SORT_DESC,
  isTerminalOp, isAccessorOp,
} from '../src/opcodes'

// --- Reusable point-free helpers ---

const opNames: Record<number, string> = {
  [OP_MAP]: 'map', [OP_FILTER]: 'filter', [OP_TAKE]: 'take', [OP_DROP]: 'drop',
  [OP_TAKE_WHILE]: 'takeWhile', [OP_DROP_WHILE]: 'dropWhile', [OP_FLAT_MAP]: 'flatMap',
  [OP_REJECT]: 'reject', [OP_REDUCE]: 'reduce', [OP_FOR_EACH]: 'forEach',
  [OP_EVERY]: 'every', [OP_SOME]: 'some', [OP_FIND]: 'find', [OP_FIND_INDEX]: 'findIndex',
  [OP_NONE]: 'none', [OP_COUNT]: 'count',
  [OP_HEAD]: 'head', [OP_LAST]: 'last', [OP_LENGTH]: 'length', [OP_IS_EMPTY]: 'isEmpty',
  [OP_TAIL]: 'tail', [OP_INIT]: 'init', [OP_REVERSE]: 'reverse',
  [OP_UNIQ_INLINE]: 'uniq', [OP_JOIN]: 'join', [OP_FLATTEN]: 'flatten',
  [OP_SUM]: 'sum', [OP_MIN]: 'min', [OP_MAX]: 'max',
  [OP_SORT_ASC]: 'sortAsc', [OP_SORT_DESC]: 'sortDesc',
}

const opName = (op: number): string => opNames[op] ?? `op${op}`
const patternName = flow(A.map(opName), A.join('_'))
const patternComment = flow(A.map(opName), A.join(' → '))
const getKey = A.reduce((k: number, op: number) => k * 256 + op * 2, 0)

// --- Code generation (mirrors jitCompile logic) ---

type ArrayMode = 'push' | 'prealloc'

function generateBody(ops: number[], len: number, mode: ArrayMode = 'push'): { params: string[]; code: string } {
  const lastOp = ops[len - 1]
  const hasTerminal = isTerminalOp(lastOp)
  const hasAccessor = isAccessorOp(lastOp)
  const streamLen = (hasTerminal || hasAccessor) ? len - 1 : len
  const streamOps = ops.slice(0, streamLen)

  const knownSize = pipe(streamOps, A.every((op: number) => op === OP_MAP))
  const usePrealloc = mode === 'prealloc' && knownSize && !hasTerminal

  const params = [
    'src',
    ...Array.from({ length: len }, (_, i) => `f${i}`),
    ...(hasTerminal && lastOp === OP_REDUCE ? ['init'] : []),
  ]

  const stateVars = pipe(
    [...streamOps.entries()],
    A.flatMap(([i, op]: [number, number]) => [
      ...(op === OP_TAKE ? [`var c${i}=0`] : []),
      ...(op === OP_DROP ? [`var d${i}=0`] : []),
      ...(op === OP_DROP_WHILE ? [`var dw${i}=true`] : []),
    ]),
  )

  const resultVar =
    usePrealloc ? 'var r=new Array(src.length)' :
    !hasTerminal && !hasAccessor ? 'var r=[]' :
    hasAccessor ? 'var r=[]' :
    lastOp === OP_REDUCE ? 'var acc=init' :
    lastOp === OP_EVERY ? 'var ev=true' :
    lastOp === OP_SOME ? 'var sm=false' :
    lastOp === OP_FIND_INDEX ? 'var fi=0' :
    lastOp === OP_NONE ? 'var nn=false' :
    lastOp === OP_COUNT ? 'var cnt=0' : null

  const loopCond = pipe(
    [...streamOps.entries()],
    A.filter(([_, op]: [number, number]) => op === OP_TAKE),
    A.map(([i]: [number, number]) => `&&c${i}<f${i}`),
    A.join(''),
    extra => `i<src.length${extra}`,
  )

  const lines: string[] = [
    ...stateVars,
    ...(resultVar ? [resultVar] : []),
    `for(var i=0;${loopCond};i++){`,
    'var v=src[i]',
  ]

  let flatMapDepth = 0

  for (let i = 0; i < streamLen; i++) {
    switch (ops[i]) {
      case OP_MAP:        lines.push('v=f' + i + '(v)'); break
      case OP_FILTER:     lines.push('if(!f' + i + '(v))continue'); break
      case OP_REJECT:     lines.push('if(f' + i + '(v))continue'); break
      case OP_TAKE:       lines.push('c' + i + '++'); break
      case OP_DROP:       lines.push('if(d' + i + '<f' + i + '){d' + i + '++;continue}'); break
      case OP_TAKE_WHILE: lines.push('if(!f' + i + '(v))break'); break
      case OP_DROP_WHILE: lines.push('if(dw' + i + '){if(f' + i + '(v))continue;dw' + i + '=false}'); break
      case OP_FLAT_MAP:
        lines.push('var items' + i + '=f' + i + '(v)')
        lines.push('for(var j' + i + '=0;j' + i + '<items' + i + '.length;j' + i + '++){')
        lines.push('v=items' + i + '[j' + i + ']')
        flatMapDepth++
        break
    }
  }

  // emit / terminal
  if (hasAccessor || !hasTerminal) {
    lines.push(usePrealloc ? 'r[i]=v' : 'r.push(v)')
  } else {
    const ti = len - 1
    switch (lastOp) {
      case OP_REDUCE:     lines.push('acc=f' + ti + '(acc,v)'); break
      case OP_FOR_EACH:   lines.push('f' + ti + '(v)'); break
      case OP_EVERY:      lines.push('if(!f' + ti + '(v)){ev=false;break}'); break
      case OP_SOME:       lines.push('if(f' + ti + '(v)){sm=true;break}'); break
      case OP_FIND:       lines.push('if(f' + ti + '(v))return v'); break
      case OP_FIND_INDEX: lines.push('if(f' + ti + '(v))return fi;fi++'); break
      case OP_NONE:       lines.push('if(f' + ti + '(v)){nn=true;break}'); break
      case OP_COUNT:      lines.push('if(f' + ti + '(v))cnt++'); break
    }
  }

  lines.push(...Array(flatMapDepth).fill('}'))
  lines.push('}')

  // return
  if (hasAccessor) {
    switch (lastOp) {
      case OP_HEAD:         lines.push('return r[0]'); break
      case OP_LAST:         lines.push('return r[r.length-1]'); break
      case OP_LENGTH:       lines.push('return r.length'); break
      case OP_IS_EMPTY:     lines.push('return r.length===0'); break
      case OP_TAIL:         lines.push('return r.slice(1)'); break
      case OP_INIT:         lines.push('return r.slice(0,-1)'); break
      case OP_REVERSE:      lines.push('return r.reverse()'); break
      case OP_UNIQ_INLINE:  lines.push('return Array.from(new Set(r))'); break
      case OP_JOIN:         lines.push('return r.join(f' + (len - 1) + ')'); break
      case OP_FLATTEN:      lines.push('return r.flat()'); break
      case OP_SUM:          lines.push('var s=0;for(var si=0;si<r.length;si++)s+=r[si];return s'); break
      case OP_MIN:          lines.push('var mn=r[0];for(var mi=1;mi<r.length;mi++)if(r[mi]<mn)mn=r[mi];return mn'); break
      case OP_MAX:          lines.push('var mx=r[0];for(var mi=1;mi<r.length;mi++)if(r[mi]>mx)mx=r[mi];return mx'); break
      case OP_SORT_ASC:     lines.push('return r.slice().sort(function(a,b){return a-b})'); break
      case OP_SORT_DESC:    lines.push('return r.slice().sort(function(a,b){return b-a})'); break
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

  return { params, code: pipe(lines, A.join(';')) }
}

// --- Pattern definitions ---

const M = OP_MAP, F = OP_FILTER, T = OP_TAKE, D = OP_DROP, R = OP_REJECT
const TW = OP_TAKE_WHILE, DW = OP_DROP_WHILE, FM = OP_FLAT_MAP
const RD = OP_REDUCE, FE = OP_FOR_EACH, EV = OP_EVERY, SM = OP_SOME
const FN = OP_FIND, FI = OP_FIND_INDEX, NO = OP_NONE, CT = OP_COUNT
const HD = OP_HEAD, LS = OP_LAST, LN = OP_LENGTH, IE = OP_IS_EMPTY
const TL = OP_TAIL, IN = OP_INIT, RV = OP_REVERSE
const UQ = OP_UNIQ_INLINE, SU = OP_SUM, MN = OP_MIN, MX = OP_MAX
const SA = OP_SORT_ASC, SD = OP_SORT_DESC

const patterns: number[][] = [
  [M], [F], [T], [D], [R], [TW], [DW], [FM],
  [F, M], [M, F], [F, T], [M, T], [D, M], [D, F], [F, R], [R, M],
  [FM, T], [FM, F], [FM, M], [M, FM], [F, FM],
  [F, M, T], [M, F, T], [D, F, M], [F, M, R], [F, R, T],
  [D, M, T], [D, F, T], [F, FM, T],
  [D, F, M, T], [F, M, FM, F],
  [F, M, FM, F, T],
  [RD], [F, RD], [M, RD], [F, M, RD],
  [FE], [M, FE], [F, FE],
  [EV], [F, EV], [M, EV],
  [SM], [F, SM], [M, SM],
  [FN], [F, FN], [M, FN],
  [FI], [F, FI], [M, FI],
  [NO], [F, NO],
  [CT], [F, CT],
  [F, HD], [F, LS], [F, LN], [F, IE],
  [M, HD], [M, LS], [M, LN],
  [F, M, HD], [F, M, LS], [F, M, LN],
  [F, M, SU], [F, M, MN], [F, M, MX],
  [F, SU], [F, MN], [F, MX],
  [M, SU], [M, MN], [M, MX],
  [F, RV], [M, RV],
  [F, UQ], [M, UQ],
  [F, M, SA], [F, M, SD],
  [F, TL], [F, IN],
]

// --- Named chain exports ---

const chainExports: { name: string; ops: number[] }[] = [
  { name: 'filterMap', ops: [F, M] },
  { name: 'mapFilter', ops: [M, F] },
  { name: 'filterTake', ops: [F, T] },
  { name: 'mapTake', ops: [M, T] },
  { name: 'filterMapTake', ops: [F, M, T] },
  { name: 'mapFilterTake', ops: [M, F, T] },
  { name: 'dropFilterMap', ops: [D, F, M] },
  { name: 'dropFilterMapTake', ops: [D, F, M, T] },
  { name: 'filterReduce', ops: [F, RD] },
  { name: 'mapReduce', ops: [M, RD] },
  { name: 'filterMapReduce', ops: [F, M, RD] },
  { name: 'filterFind', ops: [F, FN] },
  { name: 'mapFind', ops: [M, FN] },
  { name: 'filterEvery', ops: [F, EV] },
  { name: 'filterSome', ops: [F, SM] },
  { name: 'mapEvery', ops: [M, EV] },
  { name: 'mapSome', ops: [M, SM] },
  { name: 'filterHead', ops: [F, HD] },
  { name: 'filterLast', ops: [F, LS] },
  { name: 'filterCount', ops: [F, LN] },
  { name: 'filterSum', ops: [F, SU] },
  { name: 'mapSum', ops: [M, SU] },
  { name: 'filterMapSum', ops: [F, M, SU] },
  { name: 'filterMin', ops: [F, MN] },
  { name: 'filterMax', ops: [F, MX] },
  { name: 'mapMin', ops: [M, MN] },
  { name: 'mapMax', ops: [M, MX] },
  { name: 'filterMapHead', ops: [F, M, HD] },
  { name: 'filterMapLast', ops: [F, M, LS] },
]

// --- Generate runner for a pattern ---

const generateRunner = (name: string, len: number, hasReduce: boolean): string[] =>
  hasReduce ? [
    `const run_${name}: CompiledRunner = (src, fns, a1s) => {`,
    `  const args = [src]`,
    `  for (let i = 0; i < ${len}; i++) args.push(fns[i])`,
    `  args.push(a1s[${len - 1}])`,
    `  return ${name}.apply(null, args)`,
    `}`,
  ] : len <= 5 ? [
    `const run_${name}: CompiledRunner = (src, fns) => ${name}(src,${Array.from({ length: len }, (_, i) => `fns[${i}]`).join(',')})`,
  ] : [
    `const run_${name}: CompiledRunner = (src, fns) => {`,
    `  const args = [src]`,
    `  for (let i = 0; i < ${len}; i++) args.push(fns[i])`,
    `  return ${name}.apply(null, args)`,
    `}`,
  ]

// --- Generate pattern block (function + runner) ---

const generatePattern = (ops: number[]): string[] => {
  const len = ops.length
  const name = patternName(ops)
  const pushBody = generateBody(ops, len, 'push')
  const preallocBody = generateBody(ops, len, 'prealloc')
  const hasReduce = isTerminalOp(ops[len - 1]) && ops[len - 1] === OP_REDUCE

  return [
    `// ${patternComment(ops)}`,
    ...(pushBody.code === preallocBody.code
      ? [`const ${name} = function(${pipe(pushBody.params, A.join(','))}) {${pushBody.code}}`]
      : [
          `const ${name} = _isV8`,
          `  ? function(${pipe(preallocBody.params, A.join(','))}) {${preallocBody.code}}`,
          `  : function(${pipe(pushBody.params, A.join(','))}) {${pushBody.code}}`,
        ]),
    '',
    ...generateRunner(name, len, hasReduce),
    '',
  ]
}

// --- Assemble output ---

const header = [
  '// Auto-generated by codegen/aot-compile.ts — do not edit',
  '// Contains both Bun-optimized (push) and V8-optimized (prealloc) variants',
  '',
  'type CompiledRunner = (source: any[], fns: any[], a1s: any[]) => any',
  '',
  '// Runtime detection — Bun uses JSC, Node/Deno use V8',
  'const _isV8 = typeof (globalThis as any).Bun === "undefined"',
  '',
]

const cacheEntries = pipe(
  patterns,
  A.map(ops => `  [${getKey(ops)}, run_${patternName(ops)}],`),
  A.join('\n'),
)

const chainLines = pipe(
  chainExports,
  A.map(({ name, ops }) => `export { ${patternName(ops)} as ${name} }`),
)

const unified = pipe(
  [
    ...header,
    ...pipe(patterns, A.flatMap(generatePattern)),
    `export const aotCache = new Map<number, CompiledRunner>([`,
    cacheEntries,
    `])`,
    '',
    '// --- Named chain exports (zero fusion overhead) ---',
    '',
    ...chainLines,
    '',
  ],
  A.join('\n'),
)

const diffCount = pipe(
  patterns,
  A.filter(ops => generateBody(ops, ops.length, 'push').code !== generateBody(ops, ops.length, 'prealloc').code),
  a => a.length,
)

await Bun.write(
  new URL('../src/aot-compiled.ts', import.meta.url).pathname,
  unified,
)

console.log(`Generated ${patterns.length} AOT patterns (${diffCount} V8-branched) + ${chainExports.length} named chains → src/aot-compiled.ts`)
