import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import type { NodePath, Scope } from '@babel/traverse'
import * as t from '@babel/types'
import MagicString from 'magic-string'
import { collectPrunableImports, planImportPrune, type ReplacedRange } from './prune-imports'
import {
  BOUNDARY_OPS,
  FINAL_BOUNDARY_OPS,
  SUPPORTED_OP_NAMES,
  TERMINAL_OPS,
  bindingSlots,
  callbackArity,
  isBareOp,
  isRegistryOpName,
} from './ops'
import {
  DEFAULT_OPTION_NONE_LOCAL,
  generateFusedBody,
  generateFusedLoop,
  generateFusedRunner,
  generateFusedTailBody,
  type Step,
} from './codegen'
import type {
  CompilerSemantics,
  DiagnosticSite,
  StopcockCompilerOptions,
  TransformResult,
} from './types'

const traverse: typeof _traverse =
  (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse

const DEFAULT_IMPORT_SOURCES = ['@stopcock/fp']
const OPTION_TERMINALS = new Set(['find', 'findIndex', 'findMap', 'head', 'last', 'min', 'max'])
const PURE_SORT_OPS = new Set(['sort', 'sortBy', 'sortAsc', 'sortDesc'])

interface Bindings {
  readonly pipeLocals: Set<string>
  readonly flowLocals: Set<string>
  readonly compileLocals: Set<string>
  readonly compilePureLocals: Set<string>
  readonly rootNamespaceLocals: Set<string>
  readonly compileNamespaceLocals: Set<string>
  readonly arrayNamespaceLocals: Set<string>
  /** Local identifier -> canonical @stopcock/fp/array export name. */
  readonly arrayOpLocals: Map<string, string>
}

function arraySourcesFor(
  importSources: readonly string[],
  configured: readonly string[] | undefined,
): readonly string[] {
  if (configured) return configured
  return importSources.map((source) => `${source.replace(/\/+$/, '')}/array`)
}

function compileSourcesFor(
  importSources: readonly string[],
  configured: readonly string[] | undefined,
): readonly string[] {
  const specialistSources =
    configured ?? importSources.map((source) => `${source.replace(/\/+$/, '')}/compile`)
  return [...new Set([...importSources, ...specialistSources])]
}

function uniqueLocal(source: string, preferred: string): string {
  let candidate = preferred
  let suffix = 2
  while (new RegExp(`\\b${candidate}\\b`, 'u').test(source)) {
    candidate = `${preferred}_${suffix}`
    suffix++
  }
  return candidate
}

function arrayConstructorForScope(scope: Scope): string | undefined {
  // A lexical `new Array(n)` is the fast allocation shape in both target
  // engines. Babel's binding table lets us use it hygienically: if user code
  // binds Array anywhere visible from the call, retain the intrinsic
  // array-literal allocation lane instead.
  return scope.getBinding('Array') === undefined ? 'Array' : undefined
}

function globalUndefinedIsUnbound(scope: Scope): boolean {
  return scope.getBinding('undefined') === undefined
}

function hasConstantLocalSource(source: t.Expression, scope: Scope): boolean {
  if (!t.isIdentifier(source)) return false
  const binding = scope.getBinding(source.name)
  // A parameter is already evaluated when its function is entered, so using
  // it directly cannot reorder a source read past callback construction. A
  // constant outer `let`/`const` can still be in its TDZ when this function is
  // called; retain the source alias there so the original error/effect order
  // is preserved.
  return binding?.kind === 'param' && binding.constant
}

const GENERATED_TAIL_LOCAL =
  /\b_(?:src|i|len0|v0|cbT0|sum0|reduceCb0|reduceAcc0|scanCb0|scanAcc0|scanOut0|takeUntilCb0|takeUntilOut0)\b/u

function canSpliceTailStatements(code: string, returnParent: NodePath | null): boolean {
  return returnParent?.isBlockStatement() === true && !GENERATED_TAIL_LOCAL.test(code)
}

function activeRootSource(program: t.Program, importSources: readonly string[]): string {
  for (const statement of program.body) {
    if (
      t.isImportDeclaration(statement) &&
      importSources.includes(statement.source.value) &&
      statement.importKind !== 'type'
    ) {
      return statement.source.value
    }
  }
  return importSources[0] ?? '@stopcock/fp'
}

function usesOptionTerminal(steps: readonly Step[]): boolean {
  return steps.some((step) => OPTION_TERMINALS.has(step.name))
}

function retainedPortablePureRewrite(steps: readonly Step[]): string | undefined {
  for (let index = 0; index < steps.length - 1; index++) {
    if (PURE_SORT_OPS.has(steps[index].name) && steps[index + 1].name === 'take') {
      return 'sort followed by take uses the runtime bounded top-k rewrite'
    }
  }

  for (let index = 1; index < steps.length; index++) {
    if (steps[index].name !== 'length') continue
    let cursor = index - 1
    while (cursor >= 0 && steps[cursor].name === 'map') cursor--
    if (cursor < index - 1 && (cursor < 0 || BOUNDARY_OPS.has(steps[cursor].name))) {
      return 'map followed by length uses the runtime callback-elision rewrite'
    }
  }
  return undefined
}

function collectBindings(
  program: t.Program,
  importSources: readonly string[],
  arrayImportSources: readonly string[],
  compileImportSources: readonly string[],
): Bindings {
  const bindings: Bindings = {
    pipeLocals: new Set(),
    flowLocals: new Set(),
    compileLocals: new Set(),
    compilePureLocals: new Set(),
    rootNamespaceLocals: new Set(),
    compileNamespaceLocals: new Set(),
    arrayNamespaceLocals: new Set(),
    arrayOpLocals: new Map(),
  }
  for (const stmt of program.body) {
    if (!t.isImportDeclaration(stmt)) continue
    if (stmt.importKind === 'type') continue

    const isRootSource = importSources.includes(stmt.source.value)
    const isArraySource = arrayImportSources.includes(stmt.source.value)
    const isCompileSource = compileImportSources.includes(stmt.source.value)
    if (!isRootSource && !isArraySource && !isCompileSource) continue

    for (const spec of stmt.specifiers) {
      if (t.isImportNamespaceSpecifier(spec)) {
        if (isRootSource) bindings.rootNamespaceLocals.add(spec.local.name)
        if (isCompileSource) bindings.compileNamespaceLocals.add(spec.local.name)
        if (isArraySource) bindings.arrayNamespaceLocals.add(spec.local.name)
        continue
      }
      if (!t.isImportSpecifier(spec) || spec.importKind === 'type') continue
      const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
      if (isRootSource || isCompileSource) {
        if (imported === 'pipe') bindings.pipeLocals.add(spec.local.name)
        else if (imported === 'flow') bindings.flowLocals.add(spec.local.name)
        else if (imported === 'compile') bindings.compileLocals.add(spec.local.name)
        else if (imported === 'compilePure') {
          bindings.compilePureLocals.add(spec.local.name)
        }
      }
      if (isArraySource) bindings.arrayOpLocals.set(spec.local.name, imported)
    }
  }
  return bindings
}

function isVisibleModuleBinding(
  name: string,
  candidates: ReadonlySet<string> | ReadonlyMap<string, string>,
  scope: Scope,
): boolean {
  return candidates.has(name) && scope.getBinding(name)?.kind === 'module'
}

function isPipeCallee(node: t.CallExpression['callee'], bindings: Bindings, scope: Scope): boolean {
  if (t.isSuper(node) || t.isImport(node) || t.isV8IntrinsicIdentifier(node)) return false
  if (t.isIdentifier(node)) {
    return isVisibleModuleBinding(node.name, bindings.pipeLocals, scope)
  }
  if (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.object) &&
    t.isIdentifier(node.property) &&
    node.property.name === 'pipe'
  ) {
    return isVisibleModuleBinding(node.object.name, bindings.rootNamespaceLocals, scope)
  }
  return false
}

function isDeferredCallee(
  node: t.CallExpression['callee'],
  bindings: Bindings,
  scope: Scope,
): 'flow' | 'compile' | 'compilePure' | undefined {
  if (t.isSuper(node) || t.isImport(node) || t.isV8IntrinsicIdentifier(node)) return undefined
  if (t.isIdentifier(node)) {
    if (isVisibleModuleBinding(node.name, bindings.flowLocals, scope)) return 'flow'
    if (isVisibleModuleBinding(node.name, bindings.compileLocals, scope)) return 'compile'
    if (isVisibleModuleBinding(node.name, bindings.compilePureLocals, scope)) {
      return 'compilePure'
    }
  }
  if (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.object) &&
    t.isIdentifier(node.property)
  ) {
    if (
      !isVisibleModuleBinding(node.object.name, bindings.rootNamespaceLocals, scope) &&
      !isVisibleModuleBinding(node.object.name, bindings.compileNamespaceLocals, scope)
    ) {
      return undefined
    }
    if (node.property.name === 'flow') return 'flow'
    if (node.property.name === 'compile') return 'compile'
    if (node.property.name === 'compilePure') return 'compilePure'
  }
  return undefined
}

function resolveStepOpName(
  callee: t.CallExpression['callee'],
  bindings: Bindings,
  scope: Scope,
): string | undefined {
  if (t.isSuper(callee) || t.isImport(callee) || t.isV8IntrinsicIdentifier(callee)) return undefined
  if (t.isIdentifier(callee)) {
    if (!isVisibleModuleBinding(callee.name, bindings.arrayOpLocals, scope)) {
      return undefined
    }
    return bindings.arrayOpLocals.get(callee.name)
  }
  if (!t.isMemberExpression(callee) || callee.computed) return undefined
  if (!t.isIdentifier(callee.property)) return undefined
  const opName = callee.property.name
  const object = callee.object
  if (
    t.isIdentifier(object) &&
    isVisibleModuleBinding(object.name, bindings.arrayNamespaceLocals, scope)
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
  return bindingSlots(name)?.length ?? -1
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
 * A step is either an invocation (`A.map(fn)` or `map(fn)`) or, for ops the registry
 * marks as having no bound slots at all, a bare member reference
 * (`A.sum` or `sum`) -- those are exported as the tagged step value itself,
 * and invoking them (`A.sum()`) calls the runtime's data-first form with no
 * data, which throws. That must stay unchanged, not "fixed" silently.
 */
function analyzeStep(stepNode: t.Node, bindings: Bindings, scope: Scope): StepAnalysis {
  let opName: string | undefined
  let invoked: boolean
  let args: readonly t.Expression[] = []

  if (t.isCallExpression(stepNode)) {
    opName = resolveStepOpName(stepNode.callee, bindings, scope)
    invoked = true
    args = stepNode.arguments as t.Expression[]
  } else if (t.isMemberExpression(stepNode) || t.isIdentifier(stepNode)) {
    opName = resolveStepOpName(stepNode, bindings, scope)
    invoked = false
  } else {
    return { ok: false, args: [], reason: 'step is not an imported array op reference' }
  }

  if (opName === undefined) {
    return { ok: false, args: [], reason: 'unrecognized step (not an imported array op)' }
  }
  if (!SUPPORTED_OP_NAMES.has(opName)) {
    const reason = isRegistryOpName(opName)
      ? `unsupported op: ${opName}`
      : `unknown op: ${opName} (not a registered @stopcock/fp/array operator, cannot fuse)`
    return { ok: false, args: [], name: opName, reason }
  }

  if (isBareOp(opName)) {
    if (invoked) {
      return {
        ok: false,
        args: [],
        name: opName,
        reason: `${opName}: must be used bare, not invoked -- invoking it calls the data-first form with no data and throws`,
      }
    }
    return { ok: true, name: opName, args: [] }
  }

  if (!invoked) {
    return {
      ok: false,
      args: [],
      name: opName,
      reason: `${opName}: requires arguments, cannot be used bare`,
    }
  }
  if (args.some((a) => t.isSpreadElement(a))) {
    return { ok: false, args: [], name: opName, reason: `${opName}: spread arguments` }
  }
  const expected = expectedArgCount(opName)
  if (args.length !== expected) {
    return {
      ok: false,
      args: [],
      name: opName,
      reason: `${opName}: unexpected arg count ${args.length}`,
    }
  }
  return { ok: true, name: opName, args }
}

interface StepsResult {
  readonly ok: boolean
  readonly steps?: Step[]
  readonly reason?: string
  /**
   * Operators recognised before the collector gave up. A rejected site that
   * used real operators is still worth describing: without these it produces
   * no receipt at all and becomes invisible to coverage.
   */
  readonly partialNames?: readonly string[]
}

/** Validates and collects a flat step list, enforcing that a terminal op (if any) is last. */
function collectSteps(
  stepNodes: readonly t.Expression[],
  bindings: Bindings,
  scope: Scope,
): StepsResult {
  const steps: Step[] = []
  for (let i = 0; i < stepNodes.length; i++) {
    const check = analyzeStep(stepNodes[i], bindings, scope)
    const recognised = steps.map((step) => step.name)
    if (!check.ok) return { ok: false, reason: check.reason, partialNames: recognised }
    const opName = check.name!
    if (i < stepNodes.length - 1 && (TERMINAL_OPS.has(opName) || FINAL_BOUNDARY_OPS.has(opName))) {
      return {
        ok: false,
        reason: `${opName}: terminal op must be the last step`,
        partialNames: [...recognised, opName],
      }
    }
    steps.push({ name: opName, node: stepNodes[i], args: check.args })
  }
  return { ok: true, steps }
}

/**
 * Transforms a validated `flow(...)`/`compile(...)` call site with >= 2
 * step arguments into an array runner performing the fused loop. The
 * compiler deliberately does not materialize generic iterables: iterable
 * pipelines belong to the Iter/AsyncIter surfaces and hidden Array.from
 * coercion would add an allocation while obscuring the accepted domain.
 * Single-step call sites remain deferred because flow(fn) and compile(fn)
 * still have distinct runtime identity semantics.
 */
function tryTransformDeferred(
  kind: 'flow' | 'compile' | 'compilePure',
  call: t.CallExpression,
  bindings: Bindings,
  scope: Scope,
  code: string,
  optionNoneLocal: string,
): {
  readonly code?: string
  readonly steps?: number
  readonly reason?: string
  readonly needsOptionImport?: boolean
} {
  if (call.arguments.some((a) => t.isSpreadElement(a))) {
    return { reason: 'spread arguments in flow()/compile() call' }
  }
  const stepNodes = call.arguments as t.Expression[]
  if (stepNodes.length < (kind === 'flow' ? 2 : 1)) {
    return {
      reason: `deferred to a later compiler wave: ${kind === 'flow' ? 'flow() needs at least 2 steps to preserve single-step identity' : 'no steps'}`,
    }
  }
  const collected = collectSteps(stepNodes, bindings, scope)
  if (!collected.ok) {
    return { reason: `deferred to a later compiler wave: ${collected.reason}` }
  }
  const steps = collected.steps!
  if (kind === 'compilePure') {
    const retainedRewrite = retainedPortablePureRewrite(steps)
    if (retainedRewrite) {
      return {
        reason: `retained portable compilePure optimization: ${retainedRewrite}`,
      }
    }
  }
  return {
    code: generateFusedRunner(
      code,
      steps,
      optionNoneLocal,
      arrayConstructorForScope(scope),
      globalUndefinedIsUnbound(scope),
    ),
    steps: steps.length,
    needsOptionImport: usesOptionTerminal(steps),
  }
}

export function transformStopcockPipelines(
  code: string,
  id: string,
  options: StopcockCompilerOptions = {},
): TransformResult {
  const importSources = options.importSources ?? DEFAULT_IMPORT_SOURCES
  const arrayImportSources = arraySourcesFor(importSources, options.arrayImportSources)
  const compileImportSources = compileSourcesFor(importSources, options.compileImportSources)
  const diagnosticsLevel = options.diagnostics ?? false
  const semantics: CompilerSemantics = options.assumePure === true ? 'pure' : 'exact'
  const candidateSources = new Set([
    ...importSources,
    ...arrayImportSources,
    ...compileImportSources,
  ])

  // The host plugin sees every included JS/TS file. Most application files
  // do not import Stopcock at all, so avoid paying Babel parse/traverse costs
  // unless an exact configured module specifier is present in the source.
  if (![...candidateSources].some((source) => code.includes(source))) {
    return { code, map: null, semantics, diagnostics: [] }
  }

  let ast: t.File
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', ...(id.endsWith('x') ? (['jsx'] as const) : [])],
    })
  } catch {
    return { code, map: null, semantics, diagnostics: [] }
  }

  const bindings = collectBindings(
    ast.program,
    importSources,
    arrayImportSources,
    compileImportSources,
  )
  const hasAnyBinding =
    bindings.pipeLocals.size > 0 ||
    bindings.rootNamespaceLocals.size > 0 ||
    bindings.flowLocals.size > 0 ||
    bindings.compileLocals.size > 0 ||
    bindings.compilePureLocals.size > 0 ||
    bindings.compileNamespaceLocals.size > 0
  if (!hasAnyBinding) {
    return { code, map: null, semantics, diagnostics: [] }
  }

  const magicString = new MagicString(code)
  // Ranges the transform replaced. A reference inside one of these no longer
  // exists in the output, which is what makes import pruning safe to decide.
  const replacedRanges: ReplacedRange[] = []
  let prunedSpecifiers = 0
  const recordReplaced = (start: number, end: number): void => {
    replacedRanges.push({ start, end })
  }
  const diagnostics: DiagnosticSite[] = []
  const optionNoneLocal = uniqueLocal(code, DEFAULT_OPTION_NONE_LOCAL)
  let changed = false
  let needsOptionImport = false

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee
      if (t.isV8IntrinsicIdentifier(callee)) return

      const deferred = isDeferredCallee(callee, bindings, path.scope)
      if (deferred) {
        const call = path.node
        const result = tryTransformDeferred(
          deferred,
          call,
          bindings,
          path.scope,
          code,
          optionNoneLocal,
        )
        if (result.code) {
          recordReplaced(call.start!, call.end!)
          magicString.overwrite(call.start!, call.end!, result.code)
          changed = true
          needsOptionImport ||= result.needsOptionImport === true
          if (diagnosticsLevel !== false) {
            diagnostics.push(site(call, id, true, result.steps!, semantics))
          }
          path.skip()
          return
        }
        if (diagnosticsLevel !== false) {
          diagnostics.push(
            site(
              call,
              id,
              false,
              call.arguments.length,
              semantics,
              `${deferred}(): ${result.reason}`,
            ),
          )
        }
        if (diagnosticsLevel === 'error') {
          throw new Error(
            `fp-compiler: skipped ${deferred}() at ${id}:${call.loc?.start.line}: ${result.reason}`,
          )
        }
        return
      }

      if (!isPipeCallee(callee, bindings, path.scope)) return

      const call = path.node
      const structural = analyzeSteps(call)
      if (!structural.ok) {
        if (structural.reason !== 'no steps' && diagnosticsLevel !== false) {
          diagnostics.push(
            site(call, id, false, call.arguments.length - 1, semantics, structural.reason),
          )
          if (diagnosticsLevel === 'error') {
            throw new Error(
              `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${structural.reason}`,
            )
          }
        }
        return
      }

      const sourceNode = call.arguments[0] as t.Expression
      const stepNodes = call.arguments.slice(1) as t.Expression[]
      const collected = collectSteps(stepNodes, bindings, path.scope)

      if (!collected.ok) {
        if (diagnosticsLevel !== false) {
          diagnostics.push(
            site(
              call,
              id,
              false,
              stepNodes.length,
              semantics,
              collected.reason,
              collected.steps?.map((step) => step.name) ?? collected.partialNames,
            ),
          )
          if (diagnosticsLevel === 'error') {
            throw new Error(
              `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${collected.reason}`,
            )
          }
        }
        return
      }
      const steps = collected.steps!
      needsOptionImport ||= usesOptionTerminal(steps)

      // Splicing the loop's statements directly into an already-existing
      // function body (instead of through the generic IIFE fallback) keeps
      // this to a single call frame, same as a hand-written loop -- an
      // extra frame means V8 has to tier up two functions under warmup
      // instead of one, which can leave the loop un-vectorized. Only safe
      // where the call owns a complete statement/tail position: an arrow's
      // expression body, the sole argument of a return statement, a lone
      // declaration initializer, or a discarded expression statement.
      const sourceText = code.slice(sourceNode.start!, sourceNode.end!)
      const parent = path.parentPath
      const arrayConstructorExpression = arrayConstructorForScope(path.scope)
      const hasGlobalUndefined = globalUndefinedIsUnbound(path.scope)
      if (
        parent?.isVariableDeclarator() &&
        parent.node.init === call &&
        parent.parentPath?.isVariableDeclaration() &&
        parent.parentPath.node.declarations.length === 1 &&
        parent.parentPath.parentPath?.isBlockStatement()
      ) {
        // A lone declaration statement can host the loop directly while
        // preserving the original declaration text and scope. This avoids an
        // IIFE for common `const result = pipe(...)` sites, which otherwise
        // forces JavaScriptCore to tier a second function before optimizing
        // the hot loop.
        const declaration = parent.parentPath.node
        const { stmts, resultVar } = generateFusedBody(
          code,
          sourceText,
          steps,
          optionNoneLocal,
          undefined,
          arrayConstructorExpression,
          hasGlobalUndefined,
        )
        const prefix = code.slice(declaration.start!, call.start!)
        const suffix = code.slice(call.end!, declaration.end!)
        recordReplaced(call.start!, call.end!)
        magicString.overwrite(
          declaration.start!,
          declaration.end!,
          `${stmts}\n${prefix}${resultVar}${suffix}`,
        )
      } else if (
        parent?.isExpressionStatement() &&
        parent.node.expression === call &&
        parent.parentPath?.isBlockStatement()
      ) {
        // The result is discarded, so the fused statements can replace the
        // expression statement without a wrapper call.
        const { stmts } = generateFusedBody(
          code,
          sourceText,
          steps,
          optionNoneLocal,
          undefined,
          arrayConstructorExpression,
          hasGlobalUndefined,
        )
        recordReplaced(parent.node.start!, parent.node.end!)
        magicString.overwrite(parent.node.start!, parent.node.end!, `{\n${stmts}\n}`)
      } else if (parent?.isArrowFunctionExpression() && parent.node.body === call) {
        const tailBody = generateFusedTailBody(
          code,
          sourceText,
          steps,
          optionNoneLocal,
          undefined,
          arrayConstructorExpression,
          hasConstantLocalSource(sourceNode, path.scope),
        )
        if (tailBody !== undefined) {
          recordReplaced(call.start!, call.end!)
          magicString.overwrite(call.start!, call.end!, `{\n${tailBody}\n}`)
        } else {
          const { stmts, resultVar } = generateFusedBody(
            code,
            sourceText,
            steps,
            optionNoneLocal,
            undefined,
            arrayConstructorExpression,
            hasGlobalUndefined,
          )
          recordReplaced(call.start!, call.end!)
          magicString.overwrite(call.start!, call.end!, `{\n${stmts}\nreturn ${resultVar};\n}`)
        }
      } else if (parent?.isReturnStatement() && parent.node.argument === call) {
        const tailBody = generateFusedTailBody(
          code,
          sourceText,
          steps,
          optionNoneLocal,
          undefined,
          arrayConstructorExpression,
          hasConstantLocalSource(sourceNode, path.scope),
        )
        const returnStart = parent.node.start!
        const returnEnd = parent.node.end!
        if (tailBody !== undefined) {
          const needsHygieneBlock =
            tailBody.includes('\n') && !canSpliceTailStatements(code, parent.parentPath)
          magicString.overwrite(
            returnStart,
            returnEnd,
            needsHygieneBlock ? `{\n${tailBody}\n}` : tailBody,
          )
        } else {
          const { stmts, resultVar } = generateFusedBody(
            code,
            sourceText,
            steps,
            optionNoneLocal,
            undefined,
            arrayConstructorExpression,
            hasGlobalUndefined,
          )
          recordReplaced(returnStart, returnEnd)
          magicString.overwrite(returnStart, returnEnd, `{\n${stmts}\nreturn ${resultVar};\n}`)
        }
      } else {
        const generated = generateFusedLoop(
          code,
          sourceText,
          steps,
          optionNoneLocal,
          arrayConstructorExpression,
          hasGlobalUndefined,
        )
        recordReplaced(call.start!, call.end!)
        magicString.overwrite(call.start!, call.end!, generated)
      }
      changed = true
      if (diagnosticsLevel !== false) {
        diagnostics.push(
          site(
            call,
            id,
            true,
            steps.length,
            semantics,
            undefined,
            steps.map((step) => step.name),
          ),
        )
      }
      path.skip()
    },
  })

  if (!changed) {
    return {
      code,
      map: null,
      semantics,
      diagnostics: diagnosticsLevel === false ? [] : diagnostics,
    }
  }

  // Only after every site is decided: a reference that a fallback site still
  // needs must never be pruned because a sibling site fused.
  if (replacedRanges.length > 0) {
    const references: { name: string; position: number }[] = []
    traverse(ast, {
      Identifier(path) {
        if (!path.isReferencedIdentifier()) return
        if (path.node.start == null) return
        references.push({ name: path.node.name, position: path.node.start })
      },
    })
    const prunableSources = new Set([
      ...importSources,
      ...arrayImportSources,
      ...compileImportSources,
    ])
    const edits = planImportPrune({
      imports: collectPrunableImports(ast.program, prunableSources),
      references,
      replaced: replacedRanges,
      code,
    })
    for (const edit of edits) {
      if (edit.kind === 'declaration') magicString.remove(edit.start, edit.end)
      else magicString.remove(edit.start, edit.end)
    }
    prunedSpecifiers = edits.length
  }

  if (needsOptionImport) {
    const imports = ast.program.body.filter(t.isImportDeclaration)
    const lastImport = imports[imports.length - 1]
    const source = activeRootSource(ast.program, importSources)
    const declaration = `\nimport { none as ${optionNoneLocal} } from ${JSON.stringify(source)}`
    if (lastImport?.end != null) magicString.appendLeft(lastImport.end, declaration)
    else magicString.prepend(`${declaration.slice(1)}\n`)
  }

  return {
    code: magicString.toString(),
    map: magicString.generateMap({ source: id, includeContent: true, hires: true }),
    semantics,
    diagnostics: diagnosticsLevel === false ? [] : diagnostics,
  }
}

function site(
  node: t.CallExpression,
  id: string,
  transformed: boolean,
  steps: number,
  semantics: CompilerSemantics,
  reason?: string,
  opNames?: readonly string[],
): DiagnosticSite {
  return {
    id,
    line: node.loc?.start.line ?? 0,
    column: node.loc?.start.column ?? 0,
    transformed,
    steps,
    semantics,
    reason,
    opNames,
  }
}

// callbackArity is re-exported for consumers building host adapters that
// need to validate op shape before this wave's transform runs.
export { callbackArity }
