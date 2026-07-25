/**
 * Iter Array terminal-fused kernel generator.
 *
 * The generic Iter executor pushes every produced value through an `emit`
 * callback. That callback is shared by fifteen terminals, so it stays
 * polymorphic and the terminal's own state (an output array, a reducer
 * accumulator, an early-exit flag) lives in a closure the loop cannot keep in
 * registers.
 *
 * A kernel is one (terminal, shape) pair rendered as a single indexed loop over
 * a plain Array with the terminal's behavior inlined at the emission point.
 * There is no callback, no per-value closure entry, and no step dispatch.
 *
 * The model and render functions are pure so the emitted shape is testable
 * without running the generator. Only shapes admitted here ever leave the
 * generic path; every other (terminal, shape) pair keeps generic execution and
 * is recorded as such in the disposition manifest.
 *
 * Usage: bun run codegen/iter-kernels.ts
 * Output: src/iter-kernels.ts, codegen/generated/iter-kernel-manifest-v1.json
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ITER_KERNEL_OPS_V1 = Object.freeze({
  map: 0,
  filter: 1,
  filterMap: 2,
  flatMap: 3,
  take: 4,
  drop: 5,
  takeWhile: 6,
  dropWhile: 7,
  scan: 8,
} as const)

export type IterKernelOpV1 = keyof typeof ITER_KERNEL_OPS_V1

/**
 * Terminals that are fused. `a` and `b` are the terminal's own arguments; a
 * kernel only declares the ones it reads, so an unused argument costs nothing.
 */
export const ITER_KERNEL_TERMINALS_V1 = Object.freeze([
  'toArray',
  'toArrayInto',
  'reduce',
  'find',
  'findOrUndefined',
  'some',
  'every',
  'count',
  'forEach',
  'first',
  'firstOrUndefined',
  'last',
  'lastOrUndefined',
  'nth',
  'nthOrUndefined',
] as const)

export type IterKernelTerminalV1 = (typeof ITER_KERNEL_TERMINALS_V1)[number]

/**
 * The terminals that need their own kernel. `find`/`findOrUndefined`,
 * `first`/`firstOrUndefined`, `last`/`lastOrUndefined`, and `nth`/`nthOrUndefined`
 * differ only in how a missing result is reported, so one kernel serves each
 * pair and returns `ITER_KERNEL_MISSING` when nothing was produced. That is
 * four fewer functions in the published subpath for identical behavior.
 */
export const ITER_KERNEL_FUNCTION_TERMINALS_V1 = Object.freeze([
  'toArray',
  'toArrayInto',
  'reduce',
  'find',
  'some',
  'every',
  'count',
  'forEach',
  'first',
  'last',
  'nth',
] as const)

export type IterKernelFunctionTerminalV1 = (typeof ITER_KERNEL_FUNCTION_TERMINALS_V1)[number]

export const iterKernelFunctionTerminalV1 = (
  terminal: IterKernelTerminalV1,
): IterKernelFunctionTerminalV1 =>
  (terminal.endsWith('OrUndefined')
    ? terminal.slice(0, -'OrUndefined'.length)
    : terminal) as IterKernelFunctionTerminalV1

/** Starting shapes. Each is a bounded op sequence of at most three stages. */
export const ITER_KERNEL_SHAPES_V1: readonly (readonly IterKernelOpV1[])[] = Object.freeze(
  [
    ['map'],
    ['filter'],
    ['filterMap'],
    ['take'],
    ['drop'],
    ['takeWhile'],
    ['dropWhile'],
    ['scan'],
    ['map', 'filter'],
    ['map', 'filter', 'take'],
    ['filter', 'map', 'take'],
    ['filterMap', 'take'],
    ['scan', 'filterMap'],
    ['flatMap', 'map', 'filter'],
  ].map((shape) => Object.freeze(shape as readonly IterKernelOpV1[])),
)

export const iterKernelShapeIdV1 = (shape: readonly IterKernelOpV1[]): string => shape.join('-')

/**
 * Which source a kernel loops over. The loop body is identical either way; what
 * differs is that they are separate functions, so an element read specialises
 * on one source kind. Sharing one function measured a 0.53 geomean on the Array
 * rows once typed arrays reached the same call site.
 */
export type IterKernelSourceV1 = 'array' | 'typed-array'

export const ITER_KERNEL_SOURCES_V1: readonly IterKernelSourceV1[] = Object.freeze([
  'array',
  'typed-array',
])

export const iterKernelIdV1 = (
  terminal: IterKernelTerminalV1,
  shape: readonly IterKernelOpV1[],
  source: IterKernelSourceV1 = 'array',
): string => `iter/${source}/${iterKernelShapeIdV1(shape)}/${terminal}`

/**
 * `$` separates stage names because `filterMap-take` and `filter-map-take` are
 * different shapes whose camel-cased names are not.
 */
export const iterKernelFunctionNameV1 = (
  terminal: IterKernelTerminalV1,
  shape: readonly IterKernelOpV1[],
  source: IterKernelSourceV1 = 'array',
): string =>
  `${source === 'array' ? 'kernel' : 'viewKernel'}$${shape.join('$')}$${iterKernelFunctionTerminalV1(terminal)}`

export const iterKernelLookupKeyV1 = (
  terminal: IterKernelTerminalV1,
  shape: readonly IterKernelOpV1[],
): number =>
  iterArrayShapeCodeV1(shape) * 16 +
  ITER_KERNEL_FUNCTION_TERMINALS_V1.indexOf(iterKernelFunctionTerminalV1(terminal))

export const iterArrayShapeCodeV1 = (shape: readonly IterKernelOpV1[]): number => {
  if (shape.length === 0 || shape.length > 3) return -1
  let code = 0
  for (const op of shape) code = code * 16 + ITER_KERNEL_OPS_V1[op] + 1
  return code
}

// --- disposition policy ---

export type IterKernelDispositionV1 = 'shipped' | 'generic-fallback' | `stopped:${string}`

export interface IterKernelDispositionRecordV1 {
  readonly kernelId: string
  readonly terminal: IterKernelTerminalV1
  readonly shape: readonly IterKernelOpV1[]
  readonly shapeCode: number
  readonly disposition: IterKernelDispositionV1
  readonly reason: string
}

/**
 * The admitted (shape, terminal) pairs.
 *
 * Selection is bounded by bytes, not by taste. Every kernel is a distinct
 * function in the published `iter` subpath, and that subpath has a 5% gzip
 * ceiling, so the complete 15x14 matrix cannot ship. What ships is the set
 * whose measured gain over the shared emit path is largest per byte: the
 * pipeline shapes that dominate real lazy-array use, crossed with the
 * terminals that either allocate per value or exit early.
 *
 * Everything outside this table keeps generic execution. That is a complete,
 * tested path, not a gap.
 */
export const ITER_KERNEL_SHIPPED_V1: Readonly<Record<string, readonly IterKernelTerminalV1[]>> =
  Object.freeze({
    map: ITER_KERNEL_TERMINALS_V1,
    filter: ITER_KERNEL_TERMINALS_V1,
    'map-filter': ITER_KERNEL_TERMINALS_V1,
    'map-filter-take': ITER_KERNEL_TERMINALS_V1,
    'filterMap-take': ITER_KERNEL_TERMINALS_V1,
  })

/**
 * The typed-array rows, which are a strict subset of the Array ones.
 *
 * A kernel and `%TypedArrayPrototype%[@@iterator]` disagree about exactly one
 * thing: a callback that detaches the buffer mid-traversal, where iteration
 * throws and an indexed loop stops. That is closed by checking the source
 * length after the traversal, and the check is only conclusive for a terminal
 * that consumes the whole source — a terminal that stops on its own answer, or
 * a shape carrying take, cannot tell an early exit from a detachment. Those
 * rows iterate.
 */
export const ITER_TYPED_ARRAY_TERMINALS_V1: readonly IterKernelTerminalV1[] = Object.freeze([
  'toArray',
  'toArrayInto',
  'reduce',
  'count',
  'forEach',
  'last',
  'lastOrUndefined',
])

export const ITER_TYPED_ARRAY_SHIPPED_V1: Readonly<
  Record<string, readonly IterKernelTerminalV1[]>
> = Object.freeze({
  map: ITER_TYPED_ARRAY_TERMINALS_V1,
  filter: ITER_TYPED_ARRAY_TERMINALS_V1,
  'map-filter': ITER_TYPED_ARRAY_TERMINALS_V1,
})

const shippedFor = (
  source: IterKernelSourceV1,
  shape: readonly IterKernelOpV1[],
): readonly IterKernelTerminalV1[] =>
  (source === 'array' ? ITER_KERNEL_SHIPPED_V1 : ITER_TYPED_ARRAY_SHIPPED_V1)[
    iterKernelShapeIdV1(shape)
  ] ?? []

const stopReason = (
  source: IterKernelSourceV1,
  terminal: IterKernelTerminalV1,
  shape: readonly IterKernelOpV1[],
): string => {
  if (source === 'array') {
    return 'generic execution retained: every kernel is a distinct function in the published iter subpath, and admitting this shape too would push the subpath further past its 5% gzip ceiling without a comparable measured gain'
  }
  if (!ITER_TYPED_ARRAY_TERMINALS_V1.includes(terminal)) {
    return 'generic iteration retained: this terminal can stop on its own answer, so a short traversal does not prove the buffer was detached and the post-traversal detachment check cannot be trusted'
  }
  if (shape.includes('take') || shape.includes('takeWhile')) {
    return 'generic iteration retained: take ends the traversal on its own count, so a short traversal does not prove the buffer was detached'
  }
  return 'generic iteration retained: the Array row is itself unshipped, so there is no kernel to specialise for a view'
}

export const iterKernelDispositionV1 = (
  terminal: IterKernelTerminalV1,
  shape: readonly IterKernelOpV1[],
  source: IterKernelSourceV1 = 'array',
): { readonly disposition: IterKernelDispositionV1; readonly reason: string } => {
  if (shippedFor(source, shape).includes(terminal)) {
    return {
      disposition: 'shipped',
      reason:
        source === 'array'
          ? 'indexed Array kernel, terminal inlined at the emission point, measured against a hand loop'
          : 'indexed typed-array kernel, admitted only through the canonical-view seam and closed by a post-traversal detachment check, measured against a hand loop over the same view',
    }
  }
  return { disposition: 'generic-fallback', reason: stopReason(source, terminal, shape) }
}

export const iterKernelManifestV1 = (
  source: IterKernelSourceV1 = 'array',
): readonly IterKernelDispositionRecordV1[] =>
  ITER_KERNEL_TERMINALS_V1.flatMap((terminal) =>
    ITER_KERNEL_SHAPES_V1.map((shape) => {
      const { disposition, reason } = iterKernelDispositionV1(terminal, shape, source)
      return {
        kernelId: iterKernelIdV1(terminal, shape, source),
        terminal,
        shape,
        shapeCode: iterArrayShapeCodeV1(shape),
        disposition,
        reason,
      }
    }),
  )

// --- pure renderers ---

interface TerminalRenderV1 {
  /** Statements hoisted above the source loop. */
  readonly setup: string
  /** Emission with the produced value already bound to an identifier. */
  readonly emit: (value: string, breakStatement: string) => string
  readonly result: string
  readonly readsA: boolean
  readonly readsB: boolean
  /**
   * True when emission always leaves the loop. A `take` whose downstream always
   * leaves needs no trailing limit check, and emitting one would be dead code.
   */
  readonly exitsAlways: boolean
}

const TERMINAL_RENDERS_V1: Readonly<Record<IterKernelFunctionTerminalV1, TerminalRenderV1>> = {
  toArray: {
    setup: 'const out: unknown[] = []',
    emit: (value) => `out.push(${value})`,
    result: 'out',
    readsA: false,
    readsB: false,
    exitsAlways: false,
  },
  toArrayInto: {
    setup: 'const out = a as unknown[]',
    emit: (value) => `out.push(${value})`,
    result: 'out',
    readsA: true,
    readsB: false,
    exitsAlways: false,
  },
  reduce: {
    setup: 'const reducer = a as KernelReducer\nlet state = b\nlet at = 0',
    emit: (value) => `state = reducer(state, ${value}, at++)`,
    result: 'state',
    readsA: true,
    readsB: true,
    exitsAlways: false,
  },
  find: {
    setup:
      'const predicate = a as KernelPredicate\nlet at = 0\nlet result: unknown = ITER_KERNEL_MISSING',
    emit: (value, brk) => `if (predicate(${value}, at++)) {\nresult = ${value}\n${brk}\n}`,
    result: 'result',
    readsA: true,
    readsB: false,
    exitsAlways: false,
  },
  some: {
    setup: 'const predicate = a as KernelPredicate\nlet at = 0\nlet result = false',
    emit: (value, brk) => `if (predicate(${value}, at++)) {\nresult = true\n${brk}\n}`,
    result: 'result',
    readsA: true,
    readsB: false,
    exitsAlways: false,
  },
  every: {
    setup: 'const predicate = a as KernelPredicate\nlet at = 0\nlet result = true',
    emit: (value, brk) => `if (!predicate(${value}, at++)) {\nresult = false\n${brk}\n}`,
    result: 'result',
    readsA: true,
    readsB: false,
    exitsAlways: false,
  },
  count: {
    setup: 'let total = 0',
    emit: () => 'total++',
    result: 'total',
    readsA: false,
    readsB: false,
    exitsAlways: false,
  },
  forEach: {
    setup: 'const effect = a as KernelEffect\nlet at = 0',
    emit: (value) => `effect(${value}, at++)`,
    result: 'undefined',
    readsA: true,
    readsB: false,
    exitsAlways: false,
  },
  first: {
    setup: 'let result: unknown = ITER_KERNEL_MISSING',
    emit: (value, brk) => `result = ${value}\n${brk}`,
    result: 'result',
    readsA: false,
    readsB: false,
    exitsAlways: true,
  },
  last: {
    setup: 'let result: unknown = ITER_KERNEL_MISSING',
    emit: (value) => `result = ${value}`,
    result: 'result',
    readsA: false,
    readsB: false,
    exitsAlways: false,
  },
  nth: {
    setup: 'const wanted = a as number\nlet at = 0\nlet result: unknown = ITER_KERNEL_MISSING',
    emit: (value, brk) => `if (at++ === wanted) {\nresult = ${value}\n${brk}\n}`,
    result: 'result',
    readsA: true,
    readsB: false,
    exitsAlways: false,
  },
}

/**
 * Per-stage state hoisted above the source loop. Callback indexes, take/drop
 * counts, the dropWhile latch, and the scan accumulator are all per-stage and
 * per-traversal, exactly as the generic executor's state arrays are.
 */
const renderStageSetupV1 = (op: IterKernelOpV1, stage: number): string => {
  switch (op) {
    case 'map':
    case 'filterMap':
    case 'flatMap':
      return `const fn${stage} = steps[${stage}].fn as KernelUnary\nlet index${stage} = 0`
    case 'filter':
    case 'takeWhile':
      return `const fn${stage} = steps[${stage}].fn as KernelPredicate\nlet index${stage} = 0`
    case 'dropWhile':
      return `const fn${stage} = steps[${stage}].fn as KernelPredicate\nlet index${stage} = 0\nlet dropping${stage} = true`
    case 'take':
    case 'drop':
      return `const limit${stage} = steps[${stage}].count as number\nlet taken${stage} = 0`
    case 'scan':
      return `const fn${stage} = steps[${stage}].fn as KernelReducer\nlet index${stage} = 0\nlet state${stage} = steps[${stage}].initial`
  }
}

/**
 * True when a value entering `stage` always reaches the terminal's emission,
 * so nothing after the recursive call at `stage` can run.
 */
const alwaysEmitsFromV1 = (
  shape: readonly IterKernelOpV1[],
  stage: number,
  terminalExitsAlways: boolean,
): boolean =>
  terminalExitsAlways && shape.slice(stage + 1).every((op) => op === 'map' || op === 'scan')

const renderStagesV1 = (
  shape: readonly IterKernelOpV1[],
  stage: number,
  value: string,
  breakStatement: string,
  terminalExitsAlways: boolean,
  emit: (value: string) => string,
): string => {
  if (stage === shape.length) return emit(value)
  const next = (nextValue: string): string =>
    renderStagesV1(shape, stage + 1, nextValue, breakStatement, terminalExitsAlways, emit)

  switch (shape[stage]) {
    case 'map':
      return `const value${stage} = fn${stage}(${value}, index${stage}++)\n${next(`value${stage}`)}`
    case 'filter':
      return `if (fn${stage}(${value}, index${stage}++)) {\n${next(value)}\n}`
    case 'filterMap':
      return `const option${stage} = fn${stage}(${value}, index${stage}++) as Option<unknown>\nif (option${stage}._tag === 1) {\nconst value${stage} = option${stage}.value\n${next(`value${stage}`)}\n}`
    case 'flatMap':
      return `for (const value${stage} of fn${stage}(${value}, index${stage}++) as Iterable<unknown>) {\n${next(`value${stage}`)}\n}`
    case 'take': {
      const head = `if (taken${stage} >= limit${stage}) ${breakStatement}\ntaken${stage}++\n${next(value)}`
      return alwaysEmitsFromV1(shape, stage, terminalExitsAlways)
        ? head
        : `${head}\nif (taken${stage} >= limit${stage}) ${breakStatement}`
    }
    case 'drop':
      return `if (taken${stage} < limit${stage}) taken${stage}++\nelse {\n${next(value)}\n}`
    case 'takeWhile':
      return `if (!fn${stage}(${value}, index${stage}++)) ${breakStatement}\n${next(value)}`
    case 'dropWhile':
      return `if (!dropping${stage} || !fn${stage}(${value}, index${stage}++)) {\ndropping${stage} = false\n${next(value)}\n}`
    case 'scan':
      return `state${stage} = fn${stage}(state${stage}, ${value}, index${stage}++)\n${next(`state${stage}`)}`
  }
}

export interface IterKernelModelV1 {
  readonly terminal: IterKernelTerminalV1
  readonly shape: readonly IterKernelOpV1[]
  readonly source?: IterKernelSourceV1
}

export const renderIterKernelV1 = (model: IterKernelModelV1): string => {
  const terminal = TERMINAL_RENDERS_V1[iterKernelFunctionTerminalV1(model.terminal)]
  const shape = model.shape
  // A nested flatMap loop makes an unlabelled break ambiguous. Only label when
  // something can actually break, so no unused label is emitted.
  const nested = shape.includes('flatMap')
  const breakStatement = nested ? 'break source' : 'break'
  const body = renderStagesV1(shape, 0, 'value', breakStatement, terminal.exitsAlways, (value) =>
    terminal.emit(value, breakStatement),
  )
  const needsLabel = nested && body.includes('break source')
  const source = model.source ?? 'array'
  const parameters = [
    `source: ${source === 'array' ? 'readonly unknown[]' : 'ArrayLike<unknown>'}`,
    'steps: readonly IterKernelStep[]',
  ]
  if (terminal.readsB) parameters.push('a: unknown', 'b: unknown')
  else if (terminal.readsA) parameters.push('a: unknown')

  const setup = shape.map((op, stage) => renderStageSetupV1(op, stage)).join('\n')
  return `function ${iterKernelFunctionNameV1(model.terminal, shape, source)}(${parameters.join(', ')}): unknown {
${setup}
${terminal.setup}
${needsLabel ? 'source: ' : ''}for (let cursor = 0; cursor < source.length; cursor++) {
const value = source[cursor]
${body}
}
return ${terminal.result}
}`
}

const MODULE_HEADER_V1 = `/**
 * GENERATED by codegen/iter-kernels.ts. Do not edit.
 *
 * One indexed Array loop per (terminal, shape) pair, with the terminal inlined
 * at the emission point so no value crosses a shared emit callback. Selection
 * is bounded: anything not in this table executes on the generic Iter path.
 */`

export const renderIterKernelsModuleV1 = (
  records: readonly IterKernelDispositionRecordV1[],
  viewRecords: readonly IterKernelDispositionRecordV1[] = [],
): string => {
  // One kernel serves both members of an Option/undefined terminal pair, so
  // emit each distinct function exactly once.
  const shipped = records.filter((record) => record.disposition === 'shipped')
  const emitted = new Map<string, IterKernelDispositionRecordV1>()
  for (const record of shipped) {
    const name = iterKernelFunctionNameV1(record.terminal, record.shape)
    if (!emitted.has(name)) emitted.set(name, record)
  }

  const shippedViews = viewRecords.filter((record) => record.disposition === 'shipped')
  const emittedViews = new Map<string, IterKernelDispositionRecordV1>()
  for (const record of shippedViews) {
    const name = iterKernelFunctionNameV1(record.terminal, record.shape, 'typed-array')
    if (!emittedViews.has(name)) emittedViews.set(name, record)
  }

  const usesOption = shipped.some((record) => record.shape.includes('filterMap'))
  const optionImport = usesOption ? `import type { Option } from './option'` : ''

  const terminalConstants = ITER_KERNEL_FUNCTION_TERMINALS_V1.map(
    (terminal, index) =>
      `export const ITER_TERMINAL_${terminal.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()} = ${index}`,
  ).join('\n')

  const opConstants = (Object.keys(ITER_KERNEL_OPS_V1) as IterKernelOpV1[])
    .map(
      (op) =>
        `export const ITER_${op.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()} = ${ITER_KERNEL_OPS_V1[op]}`,
    )
    .join('\n')

  const kernels = [...emitted.values()]
    .map((record) => renderIterKernelV1({ terminal: record.terminal, shape: record.shape }))
    .join('\n\n')

  const entries = [...emitted.entries()]
    .map(([name, record]) => `[${iterKernelLookupKeyV1(record.terminal, record.shape)}, ${name}],`)
    .join('\n')

  const viewKernels = [...emittedViews.values()]
    .map((record) =>
      renderIterKernelV1({
        terminal: record.terminal,
        shape: record.shape,
        source: 'typed-array',
      }),
    )
    .join('\n\n')

  const viewEntries = [...emittedViews.entries()]
    .map(([name, record]) => `[${iterKernelLookupKeyV1(record.terminal, record.shape)}, ${name}],`)
    .join('\n')

  const viewSection =
    emittedViews.size === 0
      ? ''
      : `
export type IterViewKernel = (
  source: ArrayLike<unknown>,
  steps: readonly IterKernelStep[],
  a?: unknown,
  b?: unknown,
) => unknown

${viewKernels}

/**
 * Separate from ARRAY_KERNELS on purpose. The bodies are identical, but one
 * function that reads elements from both a plain Array and a view specialises
 * for neither, which measured a 0.53 geomean on the Array rows.
 */
const VIEW_KERNELS = new Map<number, IterViewKernel>([
${viewEntries}
])

export const iterViewKernel = (
  shapeCode: number,
  terminal: number,
): IterViewKernel | undefined =>
  shapeCode < 0 ? undefined : VIEW_KERNELS.get(shapeCode * 16 + terminal)
`

  return `${MODULE_HEADER_V1}

${optionImport}

${opConstants}

${terminalConstants}

/**
 * The observable facts a kernel reads from a plan step. Kernels never read
 * fusion state, provenance, or operator identity.
 */
export interface IterKernelStep {
  readonly op: number
  readonly fn?: unknown
  readonly count?: number
  readonly initial?: unknown
}

/** Returned by a kernel whose terminal produced nothing. */
export const ITER_KERNEL_MISSING: unknown = Symbol('stopcock.iter.missing')

type KernelUnary = (value: unknown, index: number) => unknown
type KernelPredicate = (value: unknown, index: number) => boolean
type KernelReducer = (state: unknown, value: unknown, index: number) => unknown
type KernelEffect = (value: unknown, index: number) => void

export type IterArrayKernel = (
  source: readonly unknown[],
  steps: readonly IterKernelStep[],
  a?: unknown,
  b?: unknown,
) => unknown

/**
 * Bounded positional encoding of a plan's op sequence. Shapes longer than three
 * stages are never admitted, so \`-1\` means "generic path".
 */
export const iterArrayShapeCode = (steps: readonly IterKernelStep[]): number => {
  const length = steps.length
  if (length === 0 || length > 3) return -1
  let code = 0
  for (let index = 0; index < length; index++) code = code * 16 + steps[index].op + 1
  return code
}

${kernels}

const ARRAY_KERNELS = new Map<number, IterArrayKernel>([
${entries}
])

export const iterArrayKernel = (
  shapeCode: number,
  terminal: number,
): IterArrayKernel | undefined =>
  shapeCode < 0 ? undefined : ARRAY_KERNELS.get(shapeCode * 16 + terminal)
${viewSection}`
}

// --- generator ---

const FP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const manifestDocument = (
  protocol: string,
  records: readonly IterKernelDispositionRecordV1[],
): string =>
  `${JSON.stringify(
    {
      protocol,
      protocolVersion: 1,
      terminals: ITER_KERNEL_TERMINALS_V1,
      shapes: ITER_KERNEL_SHAPES_V1.map((shape) => iterKernelShapeIdV1(shape)),
      expectedRows: ITER_KERNEL_TERMINALS_V1.length * ITER_KERNEL_SHAPES_V1.length,
      shippedRows: records.filter((record) => record.disposition === 'shipped').length,
      rows: records.map((record) => ({
        kernelId: record.kernelId,
        terminal: record.terminal,
        shape: iterKernelShapeIdV1(record.shape),
        shapeCode: record.shapeCode,
        disposition: record.disposition,
        reason: record.reason,
      })),
    },
    null,
    2,
  )}\n`

if (import.meta.main) {
  const records = iterKernelManifestV1()
  const viewRecords = iterKernelManifestV1('typed-array')
  writeFileSync(
    join(FP_ROOT, 'src', 'iter-kernels.ts'),
    renderIterKernelsModuleV1(records, viewRecords),
  )
  mkdirSync(join(FP_ROOT, 'codegen', 'generated'), { recursive: true })
  writeFileSync(
    join(FP_ROOT, 'codegen', 'generated', 'iter-kernel-manifest-v1.json'),
    manifestDocument('stopcock.iter-kernel-manifest', records),
  )
  writeFileSync(
    join(FP_ROOT, 'codegen', 'generated', 'iter-typed-array-kernel-manifest-v1.json'),
    manifestDocument('stopcock.iter-typed-array-kernel-manifest', viewRecords),
  )
  const shipped = records.filter((record) => record.disposition === 'shipped').length
  const shippedViews = viewRecords.filter((record) => record.disposition === 'shipped').length
  console.log(`  iter-kernels.ts: ${shipped} shipped of ${records.length} Array matrix rows`)
  console.log(`  iter-kernels.ts: ${shippedViews} shipped of ${viewRecords.length} view rows`)
}
