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
  canonicalOpName,
  callbackArity,
  compilerOperatorFact,
  isBareOp,
  isRegistryOpName,
} from './ops'
import {
  createStaticCompilerPlan,
  DEFAULT_OPTION_NONE_LOCAL,
  generateStaticPlanBody,
  generateStaticPlanRunner,
  generateStaticPlanTailBody,
  type Step,
} from './codegen'
import {
  concatMappedCode,
  renderFilePatches,
  sourceCode,
  type FilePatch,
  type MappedCode,
} from './mapped-code'
import {
  segmentKindsForOperatorFacts,
  type OpaqueReceiverAbi,
  type StaticCompilerPlanV1,
} from './plan-ir'
import {
  COMPILER_EMITTER_ABI_V1_HASH,
  OPERATOR_MANIFEST_V1_HASH,
} from './ops-table'
import type { ReceiptReasonCodeV1 } from './receipt-schema.generated'
import type {
  CompilerFallbackTier,
  CompilerSemantics,
  DiagnosticSite,
  StopcockCompilerOptions,
  TransformResult,
} from './types'

const traverse: typeof _traverse =
  (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse

/** Specifiers whose `pipe`/`flow`/`compile` the compiler will fuse away. */
const DEFAULT_IMPORT_SOURCES = ['@stopcock/fp', '@stopcock/fp/fusion']
const DEFAULT_ARRAY_IMPORT_SOURCES = ['@stopcock/fp/array']
const DEFAULT_COMPILE_IMPORT_SOURCES = ['@stopcock/fp/compile', '@stopcock/fp/fusion']
const OPTION_IMPORT_SOURCE = '@stopcock/fp'
const OPTION_TERMINALS = new Set(['find', 'findIndex', 'findMap', 'head', 'last', 'min', 'max'])

interface Bindings {
  readonly pipeLocals: Set<string>
  readonly flowLocals: Set<string>
  readonly compileLocals: Set<string>
  readonly compilePureLocals: Set<string>
  /** Namespace local -> facade exports that the exact source really exposes. */
  readonly facadeNamespaceExports: Map<string, ReadonlySet<FacadeExport>>
  readonly arrayNamespaceLocals: Set<string>
  /** Local identifier -> canonical @stopcock/fp/array export name. */
  readonly arrayOpLocals: Map<string, string>
  /** Imported pipe/flow/compile binding or namespace -> exact module source. */
  readonly sourceByLocal: Map<string, string>
  /** Named imported facade binding -> exact public export before local aliasing. */
  readonly exportByLocal: Map<string, FacadeExport>
}

type FacadeExport =
  | 'pipe'
  | 'fusedPipe'
  | 'flow'
  | 'fusedFlow'
  | 'compile'
  | 'compilePure'

const FIRST_PARTY_FACADE_EXPORTS = new Map<string, ReadonlySet<FacadeExport>>([
  ['@stopcock/fp', new Set<FacadeExport>(['pipe', 'flow'])],
  ['@stopcock/fp/compile', new Set<FacadeExport>(['compile', 'compilePure'])],
  [
    '@stopcock/fp/fusion',
    new Set<FacadeExport>(['pipe', 'fusedPipe', 'flow', 'fusedFlow', 'compile']),
  ],
])

function facadeExportsFor(
  source: string,
  isRootSource: boolean,
  isCompileSource: boolean,
): ReadonlySet<FacadeExport> {
  const firstParty = FIRST_PARTY_FACADE_EXPORTS.get(source)
  if (firstParty !== undefined) return firstParty

  /*
   * Unknown sources exist only because the caller configured them. Their two
   * explicit source lists are the capability declaration; no unconfigured
   * spelling is inferred.
   */
  const exports = new Set<FacadeExport>()
  if (isRootSource) {
    exports.add('pipe')
    exports.add('flow')
  }
  if (isCompileSource) {
    exports.add('compile')
    exports.add('compilePure')
  }
  return exports
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
  if (configured) return configured
  return [
    ...new Set([
      ...importSources,
      ...importSources.map((source) => `${source.replace(/\/+$/, '')}/compile`),
    ]),
  ]
}

function uniqueLocal(program: t.Program, preferred: string): string {
  const names = new Set<string>()
  t.traverseFast(program, (node) => {
    if (t.isIdentifier(node)) names.add(node.name)
  })
  let candidate = preferred
  let suffix = 2
  while (names.has(candidate)) {
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

function lexicalArrayExclusion(scope: Scope): string | undefined {
  if (scope.getBinding('Array') === undefined) return undefined
  return (
    'static lowering declines a visible lexical Array binding because the ' +
    'runtime operator resolves the module realm Array constructor'
  )
}

function plannedBoundaryIntrinsicExclusion(
  scope: Scope,
  steps: readonly Step[],
  sourceTier: CompilerFallbackTier,
): string | undefined {
  if (
    sourceTier !== 'compact' ||
    !steps.some((step) => step.name === 'without') ||
    scope.getBinding('Set') === undefined
  ) {
    return undefined
  }
  return (
    'static lowering declines a visible lexical Set binding because the ' +
    'source-tier without plan resolves the module realm Set constructor'
  )
}

function globalUndefinedIsUnbound(scope: Scope): boolean {
  return scope.getBinding('undefined') === undefined
}

function hasConstantLocalSource(source: t.Expression, scope: Scope): boolean {
  if (!t.isIdentifier(source)) return false
  const binding = scope.getBinding(source.name)
  return binding?.kind === 'param' && binding.constant
}

const GENERATED_TAIL_LOCAL =
  /\b_(?:src|i|len0|v0|cbT0|sum0|reduceCb0|reduceAcc0|scanCb0|scanAcc0|scanOut0|takeUntilCb0|takeUntilOut0)\b/u

function canSpliceTailStatements(code: string, returnParent: NodePath | null): boolean {
  return returnParent?.isBlockStatement() === true && !GENERATED_TAIL_LOCAL.test(code)
}

function generatedBodyCollision(
  generated: string,
  originalCall: t.CallExpression,
  scope: Scope,
): string | undefined {
  const compilerLocals = new Set<string>()
  const declarations = /\b(?:const|let|var)\s+(_[A-Za-z0-9_$]*)/gu
  for (const match of generated.matchAll(declarations)) compilerLocals.add(match[1])
  const arrowParameters = /\(\s*(_[A-Za-z0-9_$]*)\s*\)\s*=>/gu
  for (const match of generated.matchAll(arrowParameters)) compilerLocals.add(match[1])
  const originalIdentifiers = new Set<string>()
  t.traverseFast(originalCall, (node) => {
    if (t.isIdentifier(node)) originalIdentifiers.add(node.name)
  })
  for (const name of compilerLocals) {
    if (scope.hasBinding(name) || originalIdentifiers.has(name)) {
      return name
    }
  }
  return undefined
}

function generatedOuterLabel(path: NodePath<t.CallExpression>): string {
  const activeLabels = new Set<string>()
  let parent: NodePath | null = path.parentPath
  while (parent !== null) {
    if (parent.isLabeledStatement()) activeLabels.add(parent.node.label.name)
    parent = parent.parentPath
  }
  let candidate = '_outer'
  let suffix = 0
  while (activeLabels.has(candidate)) candidate = `_outer${++suffix}`
  return candidate
}

function containsOuterAwaitOrYield(node: t.Node | null | undefined): boolean {
  if (node == null) return false
  if (t.isAwaitExpression(node) || t.isYieldExpression(node)) return true
  // Function bodies own their await/yield grammar. Computed method keys do
  // not: they execute while the enclosing object/class expression is built.
  if (t.isFunction(node)) {
    if (
      (t.isObjectMethod(node) || t.isClassMethod(node) || t.isClassPrivateMethod(node)) &&
      node.computed &&
      containsOuterAwaitOrYield(node.key)
    ) {
      return true
    }
    return false
  }
  // Do not skip a class wholesale. `extends`, computed keys, decorators and
  // static initialization execute in the enclosing context; recursive
  // function handling above still excludes method bodies.
  for (const key of t.VISITOR_KEYS[node.type] ?? []) {
    const value = (node as unknown as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      if (
        value.some(
          (item) =>
            item !== null &&
            typeof item === 'object' &&
            'type' in item &&
            containsOuterAwaitOrYield(item as t.Node),
        )
      ) {
        return true
      }
    } else if (
      value !== null &&
      typeof value === 'object' &&
      'type' in value &&
      containsOuterAwaitOrYield(value as t.Node)
    ) {
      return true
    }
  }
  return false
}

function usesOptionTerminal(steps: readonly Step[]): boolean {
  return steps.some((step) => OPTION_TERMINALS.has(step.name))
}

function staticallyProducesPrimitiveNumber(node: t.Expression): boolean {
  if (t.isNumericLiteral(node)) return true
  if (!t.isUnaryExpression(node)) return false
  if (node.operator === '+') {
    // Unary plus either throws during the already-observable operator
    // construction or produces a primitive number.
    return true
  }
  return node.operator === '-' && staticallyProducesPrimitiveNumber(node.argument)
}

function fusedNumericFallbackReason(
  steps: readonly Step[],
  sourceTier: CompilerFallbackTier,
): string | undefined {
  if (sourceTier === 'sequential') return undefined
  const unsafeStep = steps.find(
    (step) =>
      (step.name === 'take' || step.name === 'drop') &&
      (step.args[0] === undefined || !staticallyProducesPrimitiveNumber(step.args[0])),
  )
  return unsafeStep === undefined
    ? undefined
    : `${unsafeStep.name}: a fused stream requires a statically primitive-number count; coercible counts retain the source-selected runtime fallback`
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
    facadeNamespaceExports: new Map(),
    arrayNamespaceLocals: new Set(),
    arrayOpLocals: new Map(),
    sourceByLocal: new Map(),
    exportByLocal: new Map(),
  }
  for (const stmt of program.body) {
    if (!t.isImportDeclaration(stmt)) continue
    if (stmt.importKind === 'type') continue

    const isRootSource = importSources.includes(stmt.source.value)
    const isArraySource = arrayImportSources.includes(stmt.source.value)
    const isCompileSource = compileImportSources.includes(stmt.source.value)
    if (!isRootSource && !isArraySource && !isCompileSource) continue
    const facadeExports = facadeExportsFor(
      stmt.source.value,
      isRootSource,
      isCompileSource,
    )

    for (const spec of stmt.specifiers) {
      if (t.isImportNamespaceSpecifier(spec)) {
        if (facadeExports.size > 0) {
          bindings.facadeNamespaceExports.set(spec.local.name, facadeExports)
        }
        if (isArraySource) bindings.arrayNamespaceLocals.add(spec.local.name)
        if (facadeExports.size > 0) {
          bindings.sourceByLocal.set(spec.local.name, stmt.source.value)
        }
        continue
      }
      if (!t.isImportSpecifier(spec) || spec.importKind === 'type') continue
      const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
      if (facadeExports.has(imported as FacadeExport)) {
        if (imported === 'pipe' || imported === 'fusedPipe') {
          bindings.pipeLocals.add(spec.local.name)
        } else if (imported === 'flow' || imported === 'fusedFlow') {
          bindings.flowLocals.add(spec.local.name)
        }
        else if (imported === 'compile') bindings.compileLocals.add(spec.local.name)
        else if (imported === 'compilePure') {
          bindings.compilePureLocals.add(spec.local.name)
        }
        bindings.sourceByLocal.set(spec.local.name, stmt.source.value)
        bindings.exportByLocal.set(spec.local.name, imported as FacadeExport)
      }
      if (isArraySource) bindings.arrayOpLocals.set(spec.local.name, imported)
    }
  }
  return bindings
}

function isVisibleNamespaceExport(
  name: string,
  exported: FacadeExport,
  bindings: Bindings,
  scope: Scope,
): boolean {
  return (
    bindings.facadeNamespaceExports.get(name)?.has(exported) === true &&
    scope.getBinding(name)?.kind === 'module'
  )
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
    (node.property.name === 'pipe' || node.property.name === 'fusedPipe')
  ) {
    return isVisibleNamespaceExport(
      node.object.name,
      node.property.name as 'pipe' | 'fusedPipe',
      bindings,
      scope,
    )
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
      (node.property.name === 'flow' || node.property.name === 'fusedFlow') &&
      isVisibleNamespaceExport(
        node.object.name,
        node.property.name as 'flow' | 'fusedFlow',
        bindings,
        scope,
      )
    ) return 'flow'
    if (
      node.property.name === 'compile' &&
      isVisibleNamespaceExport(node.object.name, 'compile', bindings, scope)
    ) return 'compile'
    if (
      node.property.name === 'compilePure' &&
      isVisibleNamespaceExport(node.object.name, 'compilePure', bindings, scope)
    ) return 'compilePure'
  }
  return undefined
}

function sourceForCallee(
  node: t.CallExpression['callee'],
  bindings: Bindings,
): string | undefined {
  if (t.isIdentifier(node)) return bindings.sourceByLocal.get(node.name)
  if (t.isMemberExpression(node) && t.isIdentifier(node.object)) {
    return bindings.sourceByLocal.get(node.object.name)
  }
  return undefined
}

function exportForCallee(
  node: t.CallExpression['callee'],
  bindings: Bindings,
): string | undefined {
  if (t.isIdentifier(node)) return bindings.exportByLocal.get(node.name)
  if (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isIdentifier(node.object) &&
    t.isIdentifier(node.property) &&
    bindings.facadeNamespaceExports
      .get(node.object.name)
      ?.has(node.property.name as FacadeExport) === true
  ) {
    return node.property.name
  }
  return undefined
}

function sourceIdentityForCallee(
  node: t.CallExpression['callee'],
  bindings: Bindings,
): Pick<DiagnosticSite, 'sourceSpecifier' | 'sourceExport'> {
  return {
    sourceSpecifier: sourceForCallee(node, bindings),
    sourceExport: exportForCallee(node, bindings),
  }
}

function fallbackTierFor(
  kind: 'pipe' | 'flow' | 'compile' | 'compilePure',
  node: t.CallExpression['callee'],
  bindings: Bindings,
  configured: StopcockCompilerOptions['fallbackTiers'],
): CompilerFallbackTier {
  const source = sourceForCallee(node, bindings)
  if (source !== undefined && configured?.[source] !== undefined) {
    return configured[source]
  }
  if (
    source === '@stopcock/fp/fusion' ||
    source === '@stopcock/fp/compile'
  ) {
    return 'compact'
  }
  if (source === '@stopcock/fp' && kind !== 'compile' && kind !== 'compilePure') {
    return 'sequential'
  }
  // A configured wrapper can expose any implementation. Until it declares a
  // stronger tier contract, retain the compiler schema's conservative tier.
  return 'compiler'
}

function fallbackTierForRawSource(
  code: string,
  candidates: ReadonlySet<string>,
  configured: StopcockCompilerOptions['fallbackTiers'],
): CompilerFallbackTier {
  const importSource =
    [...code.matchAll(/\b(?:from\s*)?['"]([^'"]+)['"]/gu)]
      .map((match) => match[1])
      .find((source) => candidates.has(source))
  if (importSource === undefined) return 'compiler'
  if (configured?.[importSource] !== undefined) return configured[importSource]
  if (
    importSource === '@stopcock/fp/fusion' ||
    importSource === '@stopcock/fp/compile'
  ) return 'compact'
  if (importSource === '@stopcock/fp') return 'sequential'
  return 'compiler'
}

function isProvenReceiverInsensitive(node: t.Expression, scope: Scope): boolean {
  if (t.isArrowFunctionExpression(node)) return true
  if (!t.isIdentifier(node)) return false
  const binding = scope.getBinding(node.name)
  if (binding === undefined || !binding.constant || binding.constantViolations.length > 0) {
    return false
  }
  if (!binding.path.isVariableDeclarator()) return false
  return t.isArrowFunctionExpression(binding.path.node.init)
}

function opaqueReceiverFor(
  callee: t.CallExpression['callee'],
  residual: t.Expression,
  bindings: Bindings,
  scope: Scope,
): { readonly receiver?: OpaqueReceiverAbi; readonly reason?: string } {
  // An arrow's lexical receiver is invariant under property/bare/call
  // invocation, so every facade can lower it without reproducing an internal
  // receiver object.
  if (isProvenReceiverInsensitive(residual, scope)) {
    return { receiver: 'receiver-insensitive' }
  }
  const source = sourceForCallee(callee, bindings)
  if (source === '@stopcock/fp') {
    // Root sequential pipe invokes through its real rest-step array. The plan
    // retains every actual step value and reconstructs that exact vector.
    return { receiver: 'step-vector' }
  }
  return {
    reason:
      'opaque receiver ABI is path-dependent for this facade; only a proven arrow or root sequential step vector is safe',
  }
}

function containsUnshadowedDirectEval(ast: t.File): boolean {
  let found = false
  traverse(ast, {
    CallExpression(path) {
      if (
        t.isIdentifier(path.node.callee, { name: 'eval' }) &&
        path.scope.getBinding('eval') === undefined
      ) {
        found = true
        path.stop()
      }
    },
  })
  return found
}

function staleCompilerSelection(
  options: StopcockCompilerOptions,
): { readonly reason: string; readonly reasonCode: ReceiptReasonCodeV1 } | undefined {
  if (
    options.expectedSemanticManifestHash !== undefined &&
    options.expectedSemanticManifestHash !== OPERATOR_MANIFEST_V1_HASH
  ) {
    return {
      reason: `stale semantic manifest: expected ${options.expectedSemanticManifestHash}, compiler has ${OPERATOR_MANIFEST_V1_HASH}`,
      reasonCode: 'stale-semantic-hash',
    }
  }
  if (
    options.expectedLoweringAbiHash !== undefined &&
    options.expectedLoweringAbiHash !== COMPILER_EMITTER_ABI_V1_HASH
  ) {
    return {
      reason: `stale lowering ABI: expected ${options.expectedLoweringAbiHash}, compiler has ${COMPILER_EMITTER_ABI_V1_HASH}`,
      reasonCode: 'stale-lowering-hash',
    }
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
  /** A syntactically present, unresolved unary step rather than a malformed known op. */
  readonly opaque?: boolean
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
    return {
      ok: false,
      opaque: true,
      args: [],
      reason: 'unrecognized step (not an imported array op)',
    }
  }

  if (opName === undefined) {
    return {
      ok: false,
      opaque: true,
      args: [],
      reason: 'unrecognized step (not an imported array op)',
    }
  }
  opName = canonicalOpName(opName)
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
  /** One final opaque unary step executed after the compiled static prefix. */
  readonly residual?: t.Expression
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
  allowFinalResidual = false,
): StepsResult {
  const steps: Step[] = []
  let terminalName: string | undefined
  for (let i = 0; i < stepNodes.length; i++) {
    const check = analyzeStep(stepNodes[i], bindings, scope)
    const recognised = steps.map((step) => step.name)
    if (!check.ok) {
      const recognisedIncludingRejected =
        check.name === undefined ? recognised : [...recognised, check.name]
      if (
        allowFinalResidual &&
        check.opaque === true &&
        i === stepNodes.length - 1 &&
        steps.length > 0
      ) {
        if (steps.some((step) => BOUNDARY_OPS.has(step.name) || step.name === 'reduce')) {
          return {
            ok: false,
            reason:
              'prefix residual lowering does not yet admit materialization boundaries or reduce',
            partialNames: recognised,
          }
        }
        return { ok: true, steps, residual: stepNodes[i] }
      }
      return {
        ok: false,
        reason: check.reason,
        partialNames: recognisedIncludingRejected,
      }
    }
    if (terminalName !== undefined) {
      return {
        ok: false,
        reason: `${terminalName}: terminal op must be the last step`,
        partialNames: [...recognised, check.name!],
      }
    }
    const opName = check.name!
    const fact = compilerOperatorFact(opName)
    if (fact === undefined) {
      return {
        ok: false,
        reason: `${opName}: generated compiler fact is unavailable`,
        partialNames: [...recognised, opName],
      }
    }
    steps.push({ name: opName, node: stepNodes[i], args: check.args, fact })
    if (TERMINAL_OPS.has(opName) || FINAL_BOUNDARY_OPS.has(opName)) {
      terminalName = opName
      if (!allowFinalResidual && i < stepNodes.length - 1) {
        return {
          ok: false,
          reason: `${opName}: terminal op must be the last step`,
          partialNames: [...recognised, opName],
        }
      }
    }
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
  semantics: CompilerSemantics,
  sourceTier: CompilerFallbackTier,
  staleSelection:
    | { readonly reason: string; readonly reasonCode: ReceiptReasonCodeV1 }
    | undefined,
  directEval: boolean,
  outerLabel: string,
): {
  readonly emitted?: MappedCode
  readonly plan?: StaticCompilerPlanV1
  readonly steps?: number
  readonly reason?: string
  readonly opNames?: readonly string[]
  readonly reasonCodes?: readonly ReceiptReasonCodeV1[]
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
    return {
      reason: `deferred to a later compiler wave: ${collected.reason}`,
      opNames: collected.partialNames,
    }
  }
  const steps = collected.steps!
  const numericFallback = fusedNumericFallbackReason(steps, sourceTier)
  if (numericFallback !== undefined) {
    return {
      reason: numericFallback,
      reasonCodes: ['materialization-boundary'],
      opNames: steps.map((step) => step.name),
    }
  }
  if (staleSelection !== undefined) {
    return {
      reason: staleSelection.reason,
      reasonCodes: [staleSelection.reasonCode],
      opNames: steps.map((step) => step.name),
    }
  }
  if (directEval) {
    return {
      reason:
        'static lowering declines unshadowed direct eval because generated lexical bindings would change its observable scope',
      reasonCodes: ['strict-scope-exclusion'],
      opNames: steps.map((step) => step.name),
    }
  }
  if (stepNodes.some((step) => containsOuterAwaitOrYield(step))) {
    return {
      reason:
        'deferred constructor wrapper cannot move an outer await or yield out of its owning function',
      opNames: steps.map((step) => step.name),
    }
  }
  const intrinsicExclusion =
    lexicalArrayExclusion(scope) ?? plannedBoundaryIntrinsicExclusion(scope, steps, sourceTier)
  if (intrinsicExclusion !== undefined) {
    return {
      reason: intrinsicExclusion,
      reasonCodes: ['strict-scope-exclusion'],
      opNames: steps.map((step) => step.name),
    }
  }
  const plan = createStaticCompilerPlan({
    siteKind: kind,
    mode: kind === 'compilePure' ? 'pure' : semantics,
    sourceTier,
    call,
    steps,
  })
  const emitted = generateStaticPlanRunner(
    code,
    plan,
    optionNoneLocal,
    arrayConstructorForScope(scope),
    globalUndefinedIsUnbound(scope),
    outerLabel,
  )
  const collision = generatedBodyCollision(emitted.code, call, scope)
  if (collision !== undefined) {
    return {
      reason: `static runner lowering declined because generated local ${collision} is not hygienic in this scope`,
      reasonCodes: ['strict-scope-exclusion'],
      opNames: steps.map((step) => step.name),
    }
  }
  return {
    emitted,
    plan,
    steps: steps.length,
    opNames: steps.map((step) => step.name),
    needsOptionImport: usesOptionTerminal(steps),
  }
}

export function transformStopcockPipelines(
  code: string,
  id: string,
  options: StopcockCompilerOptions = {},
): TransformResult {
  const importSources = options.importSources ?? DEFAULT_IMPORT_SOURCES
  const arrayImportSources =
    options.arrayImportSources ??
    (options.importSources === undefined
      ? DEFAULT_ARRAY_IMPORT_SOURCES
      : arraySourcesFor(importSources, undefined))
  const compileImportSources =
    options.compileImportSources ??
    (options.importSources === undefined
      ? DEFAULT_COMPILE_IMPORT_SOURCES
      : compileSourcesFor(importSources, undefined))
  const diagnosticsLevel = options.diagnostics ?? false
  const semantics: CompilerSemantics = options.assumePure === true ? 'pure' : 'exact'
  const staleSelection = staleCompilerSelection(options)
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
  } catch (error) {
    const reason = `candidate source could not be parsed: ${
      error instanceof Error ? error.message : String(error)
    }`
    if (diagnosticsLevel === 'error') {
      throw new Error(`fp-compiler: ${reason}`)
    }
    return {
      code,
      map: null,
      semantics,
      diagnostics:
        diagnosticsLevel === false
          ? []
          : [
              {
                id,
                line: 0,
                column: 0,
                endLine: 0,
                endColumn: 0,
                transformed: false,
                steps: 0,
                semantics,
                reason,
                opNames: [],
                segmentKinds: [],
                reasonCodes: ['compiler-defect'],
                fallbackTier: fallbackTierForRawSource(
                  code,
                  candidateSources,
                  options.fallbackTiers,
                ),
              },
            ],
    }
  }

  const bindings = collectBindings(
    ast.program,
    importSources,
    arrayImportSources,
    compileImportSources,
  )
  const hasAnyBinding =
    bindings.pipeLocals.size > 0 ||
    bindings.facadeNamespaceExports.size > 0 ||
    bindings.flowLocals.size > 0 ||
    bindings.compileLocals.size > 0 ||
    bindings.compilePureLocals.size > 0
  if (!hasAnyBinding) {
    return { code, map: null, semantics, diagnostics: [] }
  }

  /*
   * Direct eval is a file-level exclusion, not merely a property of the
   * candidate call. Static lowering can splice `var` bindings into an existing
   * function/program environment, add an Option import, and prune runtime
   * imports. An eval elsewhere in the file can observe every one of those
   * changes by a dynamically constructed name. Keeping the exclusion at the
   * whole parsed module is deliberately conservative and makes all emit lanes
   * and later import edits share one auditable scope rule.
   */
  const hasUnshadowedDirectEval = containsUnshadowedDirectEval(ast)

  const magicString = new MagicString(code)
  const filePatches: FilePatch[] = []
  const overwriteMapped = (
    start: number,
    end: number,
    mapped: MappedCode | string,
    anchor = start,
  ): void => {
    const replacement =
      typeof mapped === 'string' ? { code: mapped, sourceFragments: [] } : mapped
    magicString.overwrite(start, end, replacement.code)
    filePatches.push({
      start,
      end,
      anchor,
      code: replacement.code,
      sourceFragments: replacement.sourceFragments,
    })
  }
  const removeMapped = (start: number, end: number): void => {
    magicString.remove(start, end)
    filePatches.push({
      start,
      end,
      anchor: start,
      code: '',
      sourceFragments: [],
    })
  }
  const insertMapped = (index: number, text: string): void => {
    magicString.appendLeft(index, text)
    filePatches.push({
      start: index,
      end: index,
      anchor: index,
      code: text,
      sourceFragments: [],
    })
  }
  // Ranges the transform replaced. A reference inside one of these no longer
  // exists in the output, which is what makes import pruning safe to decide.
  const replacedRanges: ReplacedRange[] = []
  let prunedSpecifiers = 0
  const recordReplaced = (start: number, end: number): void => {
    replacedRanges.push({ start, end })
  }
  const diagnostics: DiagnosticSite[] = []
  const optionNoneLocal = uniqueLocal(ast.program, DEFAULT_OPTION_NONE_LOCAL)
  let changed = false
  let needsOptionImport = false

  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee
      if (t.isV8IntrinsicIdentifier(callee)) return

      const deferred = isDeferredCallee(callee, bindings, path.scope)
      if (deferred) {
        const call = path.node
        const sourceIdentity = sourceIdentityForCallee(callee, bindings)
        const fallbackTier = fallbackTierFor(
          deferred,
          callee,
          bindings,
          options.fallbackTiers,
        )
        const result = tryTransformDeferred(
          deferred,
          call,
          bindings,
          path.scope,
          code,
          optionNoneLocal,
          semantics,
          fallbackTier,
          staleSelection,
          hasUnshadowedDirectEval,
          generatedOuterLabel(path),
        )
        if (result.emitted && result.plan) {
          recordReplaced(call.start!, call.end!)
          overwriteMapped(call.start!, call.end!, result.emitted, call.start!)
          changed = true
          needsOptionImport ||= result.needsOptionImport === true
          if (diagnosticsLevel !== false) {
            diagnostics.push(
              site(
                call,
                id,
                true,
                result.steps!,
                result.plan.mode,
                undefined,
                result.opNames,
                {
                  ...sourceIdentity,
                  segmentKinds: result.plan.segmentKinds,
                  loweringId: result.plan.loweringId,
                  operatorFacts: result.plan.operatorFacts,
                },
              ),
            )
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
              deferred === 'compilePure' ? 'pure' : semantics,
              `${deferred}(): ${result.reason}`,
              result.opNames,
              {
                ...sourceIdentity,
                fallbackTier,
                reasonCodes: result.reasonCodes,
                operatorFacts:
                  result.opNames === undefined
                    ? undefined
                    : result.opNames.flatMap((name) => {
                        const fact = compilerOperatorFact(name)
                        return fact === undefined ? [] : [fact]
                      }),
              },
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
      const sourceIdentity = sourceIdentityForCallee(callee, bindings)
      const fallbackTier = fallbackTierFor(
        'pipe',
        callee,
        bindings,
        options.fallbackTiers,
      )
      const structural = analyzeSteps(call)
      if (!structural.ok) {
        if (structural.reason !== 'no steps' && diagnosticsLevel !== false) {
          diagnostics.push(
            site(
              call,
              id,
              false,
              call.arguments.length - 1,
              semantics,
              structural.reason,
              undefined,
              { ...sourceIdentity, fallbackTier },
            ),
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
      const collected = collectSteps(stepNodes, bindings, path.scope, true)

      if (!collected.ok) {
        if (diagnosticsLevel !== false) {
          const hasOnlyOpaqueStep =
            (collected.partialNames?.length ?? 0) === 0 &&
            collected.reason?.includes('unrecognized step') === true
          diagnostics.push(
            site(
              call,
              id,
              false,
              stepNodes.length,
              semantics,
              collected.reason,
              collected.steps?.map((step) => step.name) ?? collected.partialNames,
              {
                ...sourceIdentity,
                fallbackTier,
                ...(hasOnlyOpaqueStep
                  ? {
                      segmentKinds: ['opaque'] as const,
                      reasonCodes: ['opaque-callback'] as const,
                    }
                  : {}),
              },
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
      const residual = collected.residual
      const numericFallback = fusedNumericFallbackReason(steps, fallbackTier)
      if (numericFallback !== undefined) {
        if (diagnosticsLevel !== false) {
          diagnostics.push(
            site(
              call,
              id,
              false,
              stepNodes.length,
              semantics,
              numericFallback,
              steps.map((step) => step.name),
              {
                ...sourceIdentity,
                reasonCodes: ['materialization-boundary'],
                fallbackTier,
                operatorFacts: steps.map((step) => step.fact),
              },
            ),
          )
        }
        if (diagnosticsLevel === 'error') {
          throw new Error(
            `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${numericFallback}`,
          )
        }
        return
      }
      let hasNestedManagedSite = false
      path.traverse({
        CallExpression(nestedPath) {
          const nestedCallee = nestedPath.node.callee
          if (
            isPipeCallee(nestedCallee, bindings, nestedPath.scope) ||
            isDeferredCallee(nestedCallee, bindings, nestedPath.scope) !== undefined
          ) {
            hasNestedManagedSite = true
            nestedPath.skip()
          }
        },
      })
      if (hasNestedManagedSite) {
        const reason =
          'nested managed pipeline requires its own ordered lowering before the containing site can be compiled'
        if (diagnosticsLevel !== false) {
          const facts = steps.map((step) => step.fact)
          diagnostics.push(
            site(
              call,
              id,
              false,
              stepNodes.length,
              semantics,
              reason,
              steps.map((step) => step.name),
              {
                ...sourceIdentity,
                segmentKinds: [
                  ...segmentKindsForOperatorFacts(
                    facts,
                    fallbackTier === 'sequential'
                      ? 'sequential-stages'
                      : 'fused-streams',
                    fallbackTier,
                  ),
                  ...(residual === undefined ? [] : (['opaque'] as const)),
                ],
                reasonCodes: [
                  'unsupported-layout',
                  ...(residual === undefined ? [] : (['opaque-callback'] as const)),
                ],
                fallbackTier,
                operatorFacts: facts,
              },
            ),
          )
        }
        if (diagnosticsLevel === 'error') {
          throw new Error(
            `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${reason}`,
          )
        }
        /*
         * Do not skip this path: Babel must continue into the nested site so
         * it can be transformed and reported independently. The containing
         * runtime call remains visible as a tier-specific fallback.
         */
        return
      }
      if (staleSelection !== undefined) {
        if (diagnosticsLevel !== false) {
          diagnostics.push(
            site(
              call,
              id,
              false,
              stepNodes.length,
              semantics,
              staleSelection.reason,
              steps.map((step) => step.name),
              {
                ...sourceIdentity,
                reasonCodes: [staleSelection.reasonCode],
                fallbackTier,
                operatorFacts: steps.map((step) => step.fact),
              },
            ),
          )
        }
        if (diagnosticsLevel === 'error') {
          throw new Error(
            `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${staleSelection.reason}`,
          )
        }
        return
      }
      if (hasUnshadowedDirectEval) {
        const reason =
          'static lowering declines unshadowed direct eval because generated lexical bindings would change its observable scope'
        const reasonCodes: ReceiptReasonCodeV1[] = ['strict-scope-exclusion']
        if (residual !== undefined) reasonCodes.push('opaque-callback')
        if (diagnosticsLevel !== false) {
          diagnostics.push(
            site(
              call,
              id,
              false,
              stepNodes.length,
              semantics,
              reason,
              steps.map((step) => step.name),
              {
                ...sourceIdentity,
                reasonCodes,
                fallbackTier,
                operatorFacts: steps.map((step) => step.fact),
              },
            ),
          )
        }
        if (diagnosticsLevel === 'error') {
          throw new Error(
            `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${reason}`,
          )
        }
        return
      }
      const intrinsicExclusion =
        lexicalArrayExclusion(path.scope) ??
        plannedBoundaryIntrinsicExclusion(path.scope, steps, fallbackTier)
      if (intrinsicExclusion !== undefined) {
        const reasonCodes: ReceiptReasonCodeV1[] = ['strict-scope-exclusion']
        if (residual !== undefined) reasonCodes.push('opaque-callback')
        if (diagnosticsLevel !== false) {
          diagnostics.push(
            site(
              call,
              id,
              false,
              stepNodes.length,
              semantics,
              intrinsicExclusion,
              steps.map((step) => step.name),
              {
                ...sourceIdentity,
                reasonCodes,
                fallbackTier,
                operatorFacts: steps.map((step) => step.fact),
              },
            ),
          )
        }
        if (diagnosticsLevel === 'error') {
          throw new Error(
            `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${intrinsicExclusion}`,
          )
        }
        return
      }
      let opaqueReceiver: OpaqueReceiverAbi | undefined
      if (residual !== undefined) {
        const receiver = opaqueReceiverFor(callee, residual, bindings, path.scope)
        if (receiver.receiver === undefined) {
          if (diagnosticsLevel !== false) {
            diagnostics.push(
              site(
                call,
                id,
                false,
                stepNodes.length,
                semantics,
                receiver.reason,
                steps.map((step) => step.name),
                {
                  ...sourceIdentity,
                  segmentKinds: [
                    ...steps.map((step) =>
                      step.fact.compilerPipelineRole === 'boundary' ? 'boundary' : 'stream',
                    ),
                    'opaque',
                  ],
                  reasonCodes: ['opaque-callback', 'unsupported-layout'],
                  fallbackTier,
                  operatorFacts: steps.map((step) => step.fact),
                },
              ),
            )
          }
          if (diagnosticsLevel === 'error') {
            throw new Error(
              `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${receiver.reason}`,
            )
          }
          return
        }
        opaqueReceiver = receiver.receiver
      }
      const planParent = path.parentPath
      const plan = createStaticCompilerPlan({
        siteKind: 'pipe',
        mode: semantics,
        sourceTier: fallbackTier,
        call,
        source: sourceNode,
        steps,
        sourceAlreadyEvaluated: hasConstantLocalSource(sourceNode, path.scope),
        ...(residual === undefined
          ? {}
          : {
              residual,
              opaqueReceiver: opaqueReceiver!,
            }),
      })

      // Splicing the loop's statements directly into an already-existing
      // function body (instead of through the generic IIFE fallback) keeps
      // this to a single call frame, same as a hand-written loop -- an
      // extra frame means V8 has to tier up two functions under warmup
      // instead of one, which can leave the loop un-vectorized. Only safe
      // where the call owns a complete statement/tail position: an arrow's
      // expression body, the sole argument of a return statement, a lone
      // declaration initializer, or a discarded expression statement.
      const parent = planParent
      const arrayConstructorExpression = arrayConstructorForScope(path.scope)
      const hasGlobalUndefined = globalUndefinedIsUnbound(path.scope)
      // The statement that actually sits in a Program or BlockStatement body.
      // For `export const r = pipe(...)` that is the export declaration, not
      // the declaration inside it: splicing between `export` and `const` would
      // not parse.
      const declarationPath =
        parent?.isVariableDeclarator() &&
        parent.node.init === call &&
        parent.parentPath?.isVariableDeclaration() &&
        parent.parentPath.node.declarations.length === 1
          ? parent.parentPath
          : undefined
      const hostPath =
        declarationPath === undefined
          ? undefined
          : declarationPath.parentPath?.isExportNamedDeclaration() ||
              declarationPath.parentPath?.isExportDefaultDeclaration()
            ? declarationPath.parentPath
            : declarationPath
      const statementSafeHost =
        (hostPath !== undefined &&
          (hostPath.parentPath?.isBlockStatement() || hostPath.parentPath?.isProgram())) ||
        (parent?.isExpressionStatement() &&
          parent.node.expression === call &&
          (parent.parentPath?.isBlockStatement() || parent.parentPath?.isProgram())) ||
        (parent?.isArrowFunctionExpression() && parent.node.body === call) ||
        (parent?.isReturnStatement() && parent.node.argument === call)

      if (residual !== undefined && !statementSafeHost) {
        const reason =
          'prefix residual lowering requires a declaration, expression statement, arrow body, or return host'
        if (diagnosticsLevel !== false) {
          diagnostics.push(
            site(
              call,
              id,
              false,
              stepNodes.length,
              semantics,
              reason,
              steps.map((step) => step.name),
              {
                ...sourceIdentity,
                segmentKinds: plan.segmentKinds,
                reasonCodes: ['host-restriction', 'opaque-callback'],
                fallbackTier,
              },
            ),
          )
        }
        if (diagnosticsLevel === 'error') {
          throw new Error(
            `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${reason}`,
          )
        }
        return
      }

      const plannedBody = generateStaticPlanBody(
        code,
        plan,
        optionNoneLocal,
        arrayConstructorExpression,
        hasGlobalUndefined,
        generatedOuterLabel(path),
      )
      const collision = generatedBodyCollision(
        plannedBody.stmts,
        call,
        path.scope,
      )
      if (collision !== undefined) {
        const reason = `static lowering declined because generated local ${collision} is not hygienic in this scope`
        const reasonCodes: ReceiptReasonCodeV1[] = ['strict-scope-exclusion']
        if (residual !== undefined) reasonCodes.push('opaque-callback')
        if (diagnosticsLevel !== false) {
          diagnostics.push(
            site(
              call,
              id,
              false,
              stepNodes.length,
              semantics,
              reason,
              steps.map((step) => step.name),
              {
                ...sourceIdentity,
                segmentKinds: plan.segmentKinds,
                reasonCodes,
                fallbackTier,
                operatorFacts: plan.operatorFacts,
              },
            ),
          )
        }
        if (diagnosticsLevel === 'error') {
          throw new Error(
            `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${reason}`,
          )
        }
        return
      }
      const generateBody = () => plannedBody
      const hygienicTailBody = (candidate: MappedCode | undefined): MappedCode | undefined =>
        candidate !== undefined &&
        generatedBodyCollision(
          candidate.code,
          call,
          path.scope,
        ) === undefined
          ? candidate
          : undefined

      if (
        hostPath !== undefined &&
        (hostPath.parentPath?.isBlockStatement() || hostPath.parentPath?.isProgram())
      ) {
        // A lone declaration statement can host the loop directly while
        // preserving the original declaration text and scope. This avoids an
        // IIFE for common `const result = pipe(...)` sites, which otherwise
        // forces JavaScriptCore to tier a second function before optimizing
        // the hot loop.
        //
        // Program bodies host statements just as well as block bodies, and
        // module-level `export const r = pipe(...)` is common enough that
        // excluding it meant the most ordinary shape in a module always paid
        // for a wrapper call.
        const declaration = hostPath.node
        const body = generateBody()
        recordReplaced(call.start!, call.end!)
        overwriteMapped(
          declaration.start!,
          declaration.end!,
          concatMappedCode([
            { code: body.stmts, sourceFragments: body.sourceFragments },
            '\n',
            sourceCode(code, declaration.start!, call.start!),
            body.resultVar,
            sourceCode(code, call.end!, declaration.end!),
          ]),
          call.start!,
        )
      } else if (
        parent?.isExpressionStatement() &&
        parent.node.expression === call &&
        (parent.parentPath?.isBlockStatement() || parent.parentPath?.isProgram())
      ) {
        // The result is discarded, so the fused statements can replace the
        // expression statement without a wrapper call.
        const body = generateBody()
        recordReplaced(parent.node.start!, parent.node.end!)
        overwriteMapped(
          parent.node.start!,
          parent.node.end!,
          concatMappedCode([
            '{\n',
            { code: body.stmts, sourceFragments: body.sourceFragments },
            '\n}',
          ]),
          call.start!,
        )
      } else if (parent?.isArrowFunctionExpression() && parent.node.body === call) {
        const tailBody =
          residual === undefined
            ? hygienicTailBody(
                generateStaticPlanTailBody(
                  code,
                  plan,
                  optionNoneLocal,
                  arrayConstructorExpression,
                ),
              )
            : undefined
        if (tailBody !== undefined) {
          recordReplaced(call.start!, call.end!)
          overwriteMapped(
            call.start!,
            call.end!,
            concatMappedCode(['{\n', tailBody, '\n}']),
            call.start!,
          )
        } else {
          const body = generateBody()
          recordReplaced(call.start!, call.end!)
          overwriteMapped(
            call.start!,
            call.end!,
            concatMappedCode([
              '{\n',
              { code: body.stmts, sourceFragments: body.sourceFragments },
              `\nreturn ${body.resultVar};\n}`,
            ]),
            call.start!,
          )
        }
      } else if (parent?.isReturnStatement() && parent.node.argument === call) {
        const tailBody =
          residual === undefined
            ? hygienicTailBody(
                generateStaticPlanTailBody(
                  code,
                  plan,
                  optionNoneLocal,
                  arrayConstructorExpression,
                ),
              )
            : undefined
        const returnStart = parent.node.start!
        const returnEnd = parent.node.end!
        if (tailBody !== undefined) {
          const needsHygieneBlock =
            tailBody.code.includes('\n') && !canSpliceTailStatements(code, parent.parentPath)
          recordReplaced(returnStart, returnEnd)
          overwriteMapped(
            returnStart,
            returnEnd,
            needsHygieneBlock
              ? concatMappedCode(['{\n', tailBody, '\n}'])
              : tailBody,
            call.start!,
          )
        } else {
          const body = generateBody()
          recordReplaced(returnStart, returnEnd)
          overwriteMapped(
            returnStart,
            returnEnd,
            concatMappedCode([
              '{\n',
              { code: body.stmts, sourceFragments: body.sourceFragments },
              `\nreturn ${body.resultVar};\n}`,
            ]),
            call.start!,
          )
        }
      } else {
        if (
          containsOuterAwaitOrYield(sourceNode) ||
          stepNodes.some((step) => containsOuterAwaitOrYield(step))
        ) {
          const reason =
            'expression wrapper cannot move an outer await or yield out of its owning function'
          if (diagnosticsLevel !== false) {
            diagnostics.push(
              site(
                call,
                id,
                false,
                stepNodes.length,
                semantics,
                reason,
                steps.map((step) => step.name),
                {
                  ...sourceIdentity,
                  segmentKinds: plan.segmentKinds,
                  reasonCodes: ['host-restriction'],
                  fallbackTier,
                  operatorFacts: plan.operatorFacts,
                },
              ),
            )
          }
          if (diagnosticsLevel === 'error') {
            throw new Error(
              `fp-compiler: skipped pipe() at ${id}:${call.loc?.start.line}: ${reason}`,
            )
          }
          return
        }
        const body = generateBody()
        const generated = concatMappedCode([
          '(() => {\n',
          { code: body.stmts, sourceFragments: body.sourceFragments },
          `\nreturn ${body.resultVar};\n})()`,
        ])
        recordReplaced(call.start!, call.end!)
        overwriteMapped(call.start!, call.end!, generated, call.start!)
      }
      needsOptionImport ||= usesOptionTerminal(steps)
      changed = true
      if (diagnosticsLevel !== false) {
        diagnostics.push(
          site(
            call,
            id,
            true,
            stepNodes.length,
            semantics,
            residual === undefined ? undefined : 'compiled static prefix with one opaque unary tail',
            steps.map((step) => step.name),
            {
              ...sourceIdentity,
              segmentKinds: plan.segmentKinds,
              loweringId: plan.loweringId,
              reasonCodes: residual === undefined ? [] : ['opaque-callback'],
              operatorFacts: plan.operatorFacts,
            },
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

  // Only after every site is decided, inspect the program we will actually
  // emit. Position-based liveness over the input is insufficient: callback,
  // boundary, and residual expressions are re-emitted from inside a replaced
  // call range and therefore remain live even though their original positions
  // do not.
  if (replacedRanges.length > 0) {
    const prunableSources = new Set([
      ...importSources,
      ...arrayImportSources,
      ...compileImportSources,
    ])
    let edits: ReturnType<typeof planImportPrune> = []
    try {
      const emitted = magicString.toString()
      const emittedAst = parse(emitted, {
        sourceType: 'module',
        plugins: ['typescript', ...(id.endsWith('x') ? (['jsx'] as const) : [])],
      })
      const references: { name: string; position: number }[] = []
      traverse(emittedAst, {
        Identifier(referencePath) {
          if (!referencePath.isReferencedIdentifier()) return
          if (referencePath.node.start == null) return
          references.push({
            name: referencePath.node.name,
            position: referencePath.node.start,
          })
        },
        JSXIdentifier(referencePath) {
          const parent = referencePath.parent
          const isRootMember =
            t.isJSXMemberExpression(parent) && parent.object === referencePath.node
          const isElementName =
            (t.isJSXOpeningElement(parent) || t.isJSXClosingElement(parent)) &&
            parent.name === referencePath.node
          if (!isRootMember && !isElementName) return
          if (referencePath.node.start == null) return
          references.push({
            name: referencePath.node.name,
            position: referencePath.node.start,
          })
        },
      })
      edits = planImportPrune({
        imports: collectPrunableImports(ast.program, prunableSources),
        references,
        // Every reference came from the emitted program, so none needs to be
        // discounted by an input replacement range.
        replaced: [],
        code,
      })
    } catch {
      // Fail closed. Retaining a now-unused import costs bytes; deleting a live
      // one changes the program. A malformed provisional output must not make
      // import pruning guess.
      edits = []
    }
    const removalRanges: Array<{ start: number; end: number }> = []
    for (const edit of [...edits].sort((left, right) => left.start - right.start)) {
      const previous = removalRanges[removalRanges.length - 1]
      if (previous !== undefined && edit.start <= previous.end) {
        previous.end = Math.max(previous.end, edit.end)
      } else {
        removalRanges.push({ start: edit.start, end: edit.end })
      }
    }
    for (const removal of removalRanges) {
      removeMapped(removal.start, removal.end)
    }
    prunedSpecifiers = edits.length
  }

  if (needsOptionImport) {
    const imports = ast.program.body.filter(t.isImportDeclaration)
    const lastImport = imports[imports.length - 1]
    const declaration = `\nimport { none as ${optionNoneLocal} } from ${JSON.stringify(OPTION_IMPORT_SOURCE)}`
    if (lastImport?.end != null) insertMapped(lastImport.end, declaration)
    else insertMapped(0, `${declaration.slice(1)}\n`)
  }

  const rendered = renderFilePatches(code, id, filePatches)
  if (rendered.code !== magicString.toString()) {
    throw new Error('fp-compiler: mapped file renderer diverged from provisional output')
  }
  return {
    code: rendered.code,
    map: rendered.map,
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
  metadata: Pick<
    DiagnosticSite,
    | 'segmentKinds'
    | 'loweringId'
    | 'operatorFacts'
    | 'reasonCodes'
    | 'fallbackTier'
    | 'sourceSpecifier'
    | 'sourceExport'
  > = {},
): DiagnosticSite {
  return {
    id,
    line: node.loc?.start.line ?? 0,
    column: node.loc?.start.column ?? 0,
    endLine: node.loc?.end.line ?? 0,
    endColumn: node.loc?.end.column ?? 0,
    transformed,
    steps,
    semantics,
    reason,
    opNames,
    ...metadata,
  }
}

// callbackArity is re-exported for consumers building host adapters that
// need to validate op shape before this wave's transform runs.
export { callbackArity }
