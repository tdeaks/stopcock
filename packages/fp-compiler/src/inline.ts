// Decides whether a callback argument can be inlined directly into the
// fused loop body (no function call at runtime) versus must be hoisted
// into a temp and called normally.
import * as t from '@babel/types'

const RESERVED_NAME = /^_(v|i|src|cb|n|acc|out|take|drop|dw|found|every|some|cnt|m|init)\d*$/

export interface InlinePlan {
  readonly params: readonly string[]
  readonly bodyStart: number
  readonly bodyEnd: number
}

export interface TextReplacement {
  readonly start: number
  readonly end: number
  readonly text: string
}

export interface DirectInlineRender {
  readonly text: string
  readonly sourceFragments: readonly {
    readonly generatedStart: number
    readonly generatedEnd: number
    readonly sourceStart: number
    readonly sourceEnd: number
  }[]
}

function containsDisallowed(node: t.Node | null | undefined): boolean {
  if (!node) return false
  if (
    t.isThisExpression(node) ||
    t.isSuper(node) ||
    t.isAwaitExpression(node) ||
    t.isYieldExpression(node) ||
    (t.isIdentifier(node) && node.name === 'arguments')
  ) {
    return true
  }
  // Function/class boundaries other than nested arrows get their own this/
  // arguments scope, so stop descending into their bodies.
  if (
    (t.isFunctionExpression(node) || t.isFunctionDeclaration(node) || t.isClassExpression(node) || t.isClassDeclaration(node)) &&
    node !== undefined
  ) {
    return false
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'range' || key === 'leadingComments' || key === 'trailingComments' || key === 'extra') continue
    const value = (node as any)[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item.type === 'string' && containsDisallowed(item)) return true
      }
    } else if (value && typeof value.type === 'string') {
      if (containsDisallowed(value)) return true
    }
  }
  return false
}

function containsNamedIdentifier(
  node: t.Node | null | undefined,
  names: ReadonlySet<string>,
): boolean {
  if (node == null) return false
  if (t.isIdentifier(node) && names.has(node.name)) return true
  for (const key of t.VISITOR_KEYS[node.type] ?? []) {
    const value = (node as unknown as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      if (
        value.some(
          (item) =>
            item != null &&
            typeof item === 'object' &&
            'type' in item &&
            containsNamedIdentifier(item as t.Node, names),
        )
      ) return true
    } else if (
      value != null &&
      typeof value === 'object' &&
      'type' in value &&
      containsNamedIdentifier(value as t.Node, names)
    ) return true
  }
  return false
}

/**
 * Arrow parameters are mutable bindings. Direct substitution turns `x += 1`
 * into an assignment to a generated loop value (or leaves a free `x`), while
 * the block lane currently uses immutable aliases. Keep every parameter-write
 * form on the ordinary callback-call lane instead. The target scan is
 * deliberately conservative around patterns and nested scopes: declining an
 * inline opportunity is safe; missing a write is not.
 */
function containsParameterWrite(
  node: t.Node | null | undefined,
  params: ReadonlySet<string>,
): boolean {
  if (node == null) return false
  if (
    t.isAssignmentExpression(node) &&
    containsNamedIdentifier(node.left, params)
  ) return true
  if (
    t.isUpdateExpression(node) &&
    containsNamedIdentifier(node.argument, params)
  ) return true
  for (const key of t.VISITOR_KEYS[node.type] ?? []) {
    const value = (node as unknown as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      if (
        value.some(
          (item) =>
            item != null &&
            typeof item === 'object' &&
            'type' in item &&
            containsParameterWrite(item as t.Node, params),
        )
      ) return true
    } else if (
      value != null &&
      typeof value === 'object' &&
      'type' in value &&
      containsParameterWrite(value as t.Node, params)
    ) return true
  }
  return false
}

/**
 * Returns an inline plan when `node` is an arrow function whose body is a
 * single expression with only plain identifier params (no default/rest/
 * destructure), and no this/arguments/super/await/yield anywhere in the
 * body. Returns undefined otherwise, meaning: hoist to a temp and call it.
 */
export function planInline(node: t.Node): InlinePlan | undefined {
  if (!t.isArrowFunctionExpression(node)) return undefined
  if (t.isBlockStatement(node.body)) return undefined
  if (node.async) return undefined
  const params: string[] = []
  for (const p of node.params) {
    if (!t.isIdentifier(p)) return undefined
    if (RESERVED_NAME.test(p.name)) return undefined
    params.push(p.name)
  }
  if (containsDisallowed(node.body)) return undefined
  if (containsParameterWrite(node.body, new Set(params))) return undefined
  if (node.body.start == null || node.body.end == null) return undefined
  return { params, bodyStart: node.body.start, bodyEnd: node.body.end }
}

function collectDirectReplacements(
  node: t.Node,
  parent: t.Node,
  grandparent: t.Node | undefined,
  replacementsByParam: ReadonlyMap<string, string>,
  replacements: TextReplacement[],
): boolean {
  // A nested lexical scope can capture the callback parameter. Keeping the
  // existing block-scoped alias is required in that case so every invocation
  // gets a distinct binding. The direct lane is deliberately restricted to
  // plain expression trees where replacing a parameter reference with the
  // already-loaded loop value is semantics preserving.
  if (
    t.isFunction(node) ||
    t.isClass(node) ||
    t.isJSX(node) ||
    t.isDoExpression(node)
  ) {
    return false
  }

  if (t.isIdentifier(node)) {
    const replacement = replacementsByParam.get(node.name)
    if (replacement !== undefined) {
      if (
        t.isObjectProperty(parent) &&
        parent.shorthand &&
        (parent.key === node || parent.value === node)
      ) {
        return false
      }
      if (t.isReferenced(node, parent, grandparent)) {
        if (node.start == null || node.end == null) return false
        /*
         * `x()` calls a function held in a lexical binding with `undefined`
         * as its receiver. Substituting an indexed input directly would emit
         * `_src[i]()` and observably pass `_src` as `this`. A comma expression
         * preserves the bare-reference call/tag semantics for every
         * replacement shape without adding a callback allocation.
         */
        const stripsReferenceReceiver =
          ((t.isCallExpression(parent) || t.isOptionalCallExpression(parent)) &&
            parent.callee === node) ||
          (t.isTaggedTemplateExpression(parent) && parent.tag === node)
        replacements.push({
          start: node.start,
          end: node.end,
          text: stripsReferenceReceiver ? `(0, ${replacement})` : replacement,
        })
      }
    }
  }

  const keys = t.VISITOR_KEYS[node.type] ?? []
  for (const key of keys) {
    const value = (node as unknown as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        if (
          child != null &&
          typeof child === 'object' &&
          'type' in child &&
          !collectDirectReplacements(
            child as t.Node,
            node,
            parent,
            replacementsByParam,
            replacements,
          )
        ) {
          return false
        }
      }
    } else if (
      value != null &&
      typeof value === 'object' &&
      'type' in value &&
      !collectDirectReplacements(
        value as t.Node,
        node,
        parent,
        replacementsByParam,
        replacements,
      )
    ) {
      return false
    }
  }
  return true
}

/**
 * Renders one expression from a simple arrow callback with references to its
 * parameters replaced by existing loop locals. This avoids creating a fresh
 * lexical block in the hottest generated loops. Expressions containing a
 * nested scope or shorthand property fall back to the block-scoped lane.
 */
export function renderDirectInlineExpressionMapped(
  callback: t.Node,
  expression: t.Expression,
  code: string,
  inputVars: readonly string[],
): DirectInlineRender | undefined {
  const plan = planInline(callback)
  if (!plan || !t.isArrowFunctionExpression(callback)) return undefined
  if (plan.params.length > inputVars.length) return undefined
  if (expression.start == null || expression.end == null) return undefined

  const replacementsByParam = new Map<string, string>()
  plan.params.forEach((param, index) => {
    replacementsByParam.set(param, inputVars[index])
  })
  const replacements: TextReplacement[] = []
  const expressionParent =
    t.isArrayExpression(callback.body) &&
    callback.body.elements.includes(expression)
      ? callback.body
      : callback
  const expressionGrandparent =
    expressionParent === callback ? undefined : callback
  if (
    !collectDirectReplacements(
      expression,
      expressionParent,
      expressionGrandparent,
      replacementsByParam,
      replacements,
    )
  ) {
    return undefined
  }

  let rendered = ''
  let cursor = expression.start
  const sourceFragments: DirectInlineRender['sourceFragments'][number][] = []
  for (const replacement of replacements.sort((left, right) => left.start - right.start)) {
    if (replacement.start < cursor) return undefined
    if (cursor < replacement.start) {
      const generatedStart = rendered.length
      rendered += code.slice(cursor, replacement.start)
      sourceFragments.push({
        generatedStart,
        generatedEnd: rendered.length,
        sourceStart: cursor,
        sourceEnd: replacement.start,
      })
    }
    rendered += replacement.text
    cursor = replacement.end
  }
  if (cursor < expression.end) {
    const generatedStart = rendered.length
    rendered += code.slice(cursor, expression.end)
    sourceFragments.push({
      generatedStart,
      generatedEnd: rendered.length,
      sourceStart: cursor,
      sourceEnd: expression.end,
    })
  }
  return { text: rendered, sourceFragments }
}

export function renderDirectInlineExpression(
  callback: t.Node,
  expression: t.Expression,
  code: string,
  inputVars: readonly string[],
): string | undefined {
  return renderDirectInlineExpressionMapped(callback, expression, code, inputVars)?.text
}

export function renderDirectInline(
  callback: t.Node,
  code: string,
  inputVars: readonly string[],
): string | undefined {
  if (
    !t.isArrowFunctionExpression(callback) ||
    !t.isExpression(callback.body)
  ) {
    return undefined
  }
  return renderDirectInlineExpression(
    callback,
    callback.body,
    code,
    inputVars,
  )
}

export function renderDirectInlineMapped(
  callback: t.Node,
  code: string,
  inputVars: readonly string[],
): DirectInlineRender | undefined {
  if (!t.isArrowFunctionExpression(callback) || !t.isExpression(callback.body)) {
    return undefined
  }
  return renderDirectInlineExpressionMapped(callback, callback.body, code, inputVars)
}
