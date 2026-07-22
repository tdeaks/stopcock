import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import MagicString from 'magic-string'
import { SUPPORTED_OP_NAMES, TERMINAL_OPS, callbackArity, isBareOp, isRegistryOpName } from './ops'
import { generateFusedBody, generateFusedLoop, type Step } from './codegen'
import type { DiagnosticSite, StopcockCompilerOptions, TransformResult } from './types'

const traverse: typeof _traverse = (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse

const DEFAULT_IMPORT_SOURCES = ['@stopcock/fp']

interface Bindings {
  readonly pipeLocals: Set<string>
  readonly flowLocals: Set<string>
  readonly compileLocals: Set<string>
  /** local name -> canonical namespace ('A' | 'M' | 'N') */
  readonly namespaceLocals: Map<string, string>
  readonly moduleNamespaceLocals: Set<string>
}

function collectBindings(program: t.Program, importSources: readonly string[]): Bindings {
  const bindings: Bindings = {
    pipeLocals: new Set(),
    flowLocals: new Set(),
    compileLocals: new Set(),
    namespaceLocals: new Map(),
    moduleNamespaceLocals: new Set(),
  }
  for (const stmt of program.body) {
    if (!t.isImportDeclaration(stmt)) continue
    if (!importSources.includes(stmt.source.value)) continue
    for (const spec of stmt.specifiers) {
      if (t.isImportNamespaceSpecifier(spec)) {
        bindings.moduleNamespaceLocals.add(spec.local.name)
        continue
      }
      if (!t.isImportSpecifier(spec)) continue
      const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
      if (imported === 'pipe') bindings.pipeLocals.add(spec.local.name)
      else if (imported === 'flow') bindings.flowLocals.add(spec.local.name)
      else if (imported === 'compile') bindings.compileLocals.add(spec.local.name)
      else if (imported === 'A' || imported === 'M' || imported === 'N') {
        bindings.namespaceLocals.set(spec.local.name, imported)
      }
    }
  }
  return bindings
}

function isPipeCallee(node: t.CallExpression['callee'], bindings: Bindings): boolean {
  if (t.isSuper(node) || t.isImport(node) || t.isV8IntrinsicIdentifier(node)) return false
  if (t.isIdentifier(node)) return bindings.pipeLocals.has(node.name)
  if (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.object) &&
    t.isIdentifier(node.property) &&
    node.property.name === 'pipe'
  ) {
    return bindings.moduleNamespaceLocals.has(node.object.name)
  }
  return false
}

function isDeferredCallee(node: t.CallExpression['callee'], bindings: Bindings): 'flow' | 'compile' | undefined {
  if (t.isSuper(node) || t.isImport(node) || t.isV8IntrinsicIdentifier(node)) return undefined
  if (t.isIdentifier(node)) {
    if (bindings.flowLocals.has(node.name)) return 'flow'
    if (bindings.compileLocals.has(node.name)) return 'compile'
  }
  if (t.isMemberExpression(node) && !node.computed && t.isIdentifier(node.object) && t.isIdentifier(node.property)) {
    if (!bindings.moduleNamespaceLocals.has(node.object.name)) return undefined
    if (node.property.name === 'flow') return 'flow'
    if (node.property.name === 'compile') return 'compile'
  }
  return undefined
}

function resolveStepOpName(callee: t.CallExpression['callee'], bindings: Bindings): string | undefined {
  if (t.isSuper(callee) || t.isImport(callee) || t.isV8IntrinsicIdentifier(callee)) return undefined
  if (!t.isMemberExpression(callee) || callee.computed) return undefined
  if (!t.isIdentifier(callee.property)) return undefined
  const opName = callee.property.name
  const object = callee.object
  if (t.isIdentifier(object) && bindings.namespaceLocals.has(object.name)) return opName
  if (
    t.isMemberExpression(object) &&
    !object.computed &&
    t.isIdentifier(object.object) &&
    t.isIdentifier(object.property) &&
    bindings.moduleNamespaceLocals.has(object.object.name) &&
    (object.property.name === 'A' || object.property.name === 'M' || object.property.name === 'N')
  ) {
    return opName
  }
  return undefined
}

interface Analysis {
  readonly ok: boolean
  readonly reason?: string
  readonly steps?: Step[]
}

// Arg count for ops that are always invoked (bare-eligible ops like `sum`
// are handled separately: any invocation of those is a hard failure).
function expectedArgCount(name: string): number {
  if (name === 'count') return 1
  if (name === 'reduce') return 2
  return 1
}

function analyzeSteps(call: t.CallExpression): Analysis {
  if (call.arguments.some((a) => t.isSpreadElement(a))) {
    return { ok: false, reason: 'spread arguments in pipe() call' }
  }
  if (call.arguments.length < 2) return { ok: false, reason: 'no steps' }
  return { ok: true }
}

interface StepAnalysis {
  readonly ok: boolean
  readonly reason?: string
  readonly name?: string
  readonly args: readonly t.Expression[]
}

/**
 * A step is either an invocation (`A.map(fn)`) or, for ops the registry
 * marks as having no bound slots at all, a bare member reference
 * (`A.sum`) -- those are exported as the tagged step value itself, and
 * invoking them (`A.sum()`) calls the runtime's data-first form with no
 * data, which throws. That must stay unchanged, not "fixed" silently.
 */
function analyzeStep(stepNode: t.Node, bindings: Bindings): StepAnalysis {
  let opName: string | undefined
  let invoked: boolean
  let args: readonly t.Expression[] = []

  if (t.isCallExpression(stepNode)) {
    opName = resolveStepOpName(stepNode.callee, bindings)
    invoked = true
    args = stepNode.arguments as t.Expression[]
  } else if (t.isMemberExpression(stepNode)) {
    opName = resolveStepOpName(stepNode, bindings)
    invoked = false
  } else {
    return { ok: false, args: [], reason: 'step is not a namespace op reference' }
  }

  if (opName === undefined) {
    return { ok: false, args: [], reason: 'unrecognized step (not a namespace op call)' }
  }
  if (!SUPPORTED_OP_NAMES.has(opName)) {
    const reason = isRegistryOpName(opName)
      ? `unsupported op: ${opName}`
      : `unknown op: ${opName} (not a registered @stopcock/fp op, cannot fuse)`
    return { ok: false, args: [], name: opName, reason }
  }

  if (isBareOp(opName)) {
    if (invoked) {
      return {
        ok: false,
        args: [],
        name: opName,
        reason: `${opName}: must be used bare (as A.${opName}), not invoked -- A.${opName}() calls the runtime's data-first form with no data and throws`,
      }
    }
    return { ok: true, name: opName, args: [] }
  }

  if (!invoked) {
    return { ok: false, args: [], name: opName, reason: `${opName}: requires arguments, cannot be used bare` }
  }
  if (args.some((a) => t.isSpreadElement(a))) {
    return { ok: false, args: [], name: opName, reason: `${opName}: spread arguments` }
  }
  const expected = expectedArgCount(opName)
  if (args.length !== expected) {
    return { ok: false, args: [], name: opName, reason: `${opName}: unexpected arg count ${args.length}` }
  }
  return { ok: true, name: opName, args }
}

interface StepsResult {
  readonly ok: boolean
  readonly steps?: Step[]
  readonly reason?: string
}

/** Validates and collects a flat step list, enforcing that a terminal op (if any) is last. */
function collectSteps(stepNodes: readonly t.Expression[], bindings: Bindings): StepsResult {
  const steps: Step[] = []
  for (let i = 0; i < stepNodes.length; i++) {
    const check = analyzeStep(stepNodes[i], bindings)
    if (!check.ok) return { ok: false, reason: check.reason }
    const opName = check.name!
    if (i < stepNodes.length - 1 && TERMINAL_OPS.has(opName)) {
      return { ok: false, reason: `${opName}: terminal op must be the last step` }
    }
    steps.push({ name: opName, node: stepNodes[i], args: check.args })
  }
  return { ok: true, steps }
}

// Mirrors compile.ts's toArrayInput: arrays pass through unchanged, other
// iterables are materialized via Array.from, everything else (a plain
// object, a number, ...) passes through as-is for the runtime to reject the
// same way the untransformed call would have.
const TO_ARRAY_INPUT_EXPR = (name: string): string =>
  `(Array.isArray(${name}) ? ${name} : (${name} != null && typeof ${name} === 'object' && Symbol.iterator in ${name}) ? Array.from(${name}) : ${name})`

/**
 * Transforms a validated `flow(...)`/`compile(...)` call site with >= 2
 * step arguments into an arrow function performing the fused loop,
 * matching compileInternal's multi-step path (buildPlan -> portable
 * dispatch) including toArrayInput coercion at the boundary. flow(fn) and
 * compile(fn) with exactly one step diverge in real semantics -- flow
 * returns the bare fn with no coercion at all, compile wraps it in
 * toArrayInput -- so single-step call sites are deliberately left to the
 * diagnostic path below rather than risk picking the wrong one.
 */
function tryTransformDeferred(
  call: t.CallExpression,
  bindings: Bindings,
  code: string,
): { readonly code?: string; readonly steps?: number; readonly reason?: string } {
  if (call.arguments.some((a) => t.isSpreadElement(a))) {
    return { reason: 'spread arguments in flow()/compile() call' }
  }
  const stepNodes = call.arguments as t.Expression[]
  if (stepNodes.length < 2) {
    return { reason: 'deferred to a later compiler wave: fewer than 2 steps' }
  }
  const collected = collectSteps(stepNodes, bindings)
  if (!collected.ok) {
    return { reason: `deferred to a later compiler wave: ${collected.reason}` }
  }
  const steps = collected.steps!
  const sourceText = TO_ARRAY_INPUT_EXPR('_in')
  const { stmts, resultVar } = generateFusedBody(code, sourceText, steps)
  const generated = ['(_in) => {', stmts, `return ${resultVar};`, '}'].join('\n')
  return { code: generated, steps: steps.length }
}

export function transformStopcockPipelines(
  code: string,
  id: string,
  options: StopcockCompilerOptions = {},
): TransformResult {
  const importSources = options.importSources ?? DEFAULT_IMPORT_SOURCES
  const diagnosticsLevel = options.diagnostics ?? false

  let ast: t.File
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', ...(id.endsWith('x') ? (['jsx'] as const) : [])],
    })
  } catch {
    return { code, map: null, diagnostics: [] }
  }

  const bindings = collectBindings(ast.program, importSources)
  const hasAnyBinding =
    bindings.pipeLocals.size > 0 ||
    bindings.moduleNamespaceLocals.size > 0 ||
    bindings.flowLocals.size > 0 ||
    bindings.compileLocals.size > 0
  if (!hasAnyBinding) {
    return { code, map: null, diagnostics: [] }
  }

  const magicString = new MagicString(code)
  const diagnostics: DiagnosticSite[] = []
  let changed = false

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee
      if (t.isV8IntrinsicIdentifier(callee)) return

      const deferred = isDeferredCallee(callee, bindings)
      if (deferred) {
        const call = path.node
        const result = tryTransformDeferred(call, bindings, code)
        if (result.code) {
          magicString.overwrite(call.start!, call.end!, result.code)
          changed = true
          if (diagnosticsLevel !== false) {
            diagnostics.push(site(call, id, true, result.steps!))
          }
          path.skip()
          return
        }
        if (diagnosticsLevel !== false) {
          diagnostics.push(site(call, id, false, call.arguments.length, `${deferred}(): ${result.reason}`))
        }
        return
      }

      if (!isPipeCallee(callee, bindings)) return

      const call = path.node
      const structural = analyzeSteps(call)
      if (!structural.ok) {
        if (structural.reason !== 'no steps' && diagnosticsLevel !== false) {
          diagnostics.push(site(call, id, false, call.arguments.length - 1, structural.reason))
          if (diagnosticsLevel === 'error') {
            throw new Error(`fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${structural.reason}`)
          }
        }
        return
      }

      const sourceNode = call.arguments[0] as t.Expression
      const stepNodes = call.arguments.slice(1) as t.Expression[]
      const collected = collectSteps(stepNodes, bindings)

      if (!collected.ok) {
        if (diagnosticsLevel !== false) {
          diagnostics.push(site(call, id, false, stepNodes.length, collected.reason))
          if (diagnosticsLevel === 'error') {
            throw new Error(`fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${collected.reason}`)
          }
        }
        return
      }
      const steps = collected.steps!

      // Splicing the loop's statements directly into an already-existing
      // function body (instead of through the generic IIFE fallback) keeps
      // this to a single call frame, same as a hand-written loop -- an
      // extra frame means V8 has to tier up two functions under warmup
      // instead of one, which can leave the loop un-vectorized. Only safe
      // where the call is *exactly* the tail expression: an arrow's
      // expression body, or the sole argument of a return statement.
      const sourceText = code.slice(sourceNode.start!, sourceNode.end!)
      const parent = path.parentPath
      if (parent?.isArrowFunctionExpression() && parent.node.body === call) {
        const { stmts, resultVar } = generateFusedBody(code, sourceText, steps)
        magicString.overwrite(call.start!, call.end!, `{\n${stmts}\nreturn ${resultVar};\n}`)
      } else if (parent?.isReturnStatement() && parent.node.argument === call) {
        const { stmts, resultVar } = generateFusedBody(code, sourceText, steps)
        const returnStart = parent.node.start!
        const returnEnd = parent.node.end!
        magicString.overwrite(returnStart, returnEnd, `{\n${stmts}\nreturn ${resultVar};\n}`)
      } else {
        const generated = generateFusedLoop(code, sourceText, steps)
        magicString.overwrite(call.start!, call.end!, generated)
      }
      changed = true
      if (diagnosticsLevel !== false) {
        diagnostics.push(site(call, id, true, steps.length))
      }
      path.skip()
    },
  })

  if (!changed) return { code, map: null, diagnostics: diagnosticsLevel === false ? [] : diagnostics }

  return {
    code: magicString.toString(),
    map: magicString.generateMap({ source: id, includeContent: true, hires: true }),
    diagnostics: diagnosticsLevel === false ? [] : diagnostics,
  }
}

function site(node: t.CallExpression, id: string, transformed: boolean, steps: number, reason?: string): DiagnosticSite {
  return {
    id,
    line: node.loc?.start.line ?? 0,
    column: node.loc?.start.column ?? 0,
    transformed,
    steps,
    reason,
  }
}

// callbackArity is re-exported for consumers building host adapters that
// need to validate op shape before this wave's transform runs.
export { callbackArity }
