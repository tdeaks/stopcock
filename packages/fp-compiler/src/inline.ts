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
  if (node.body.start == null || node.body.end == null) return undefined
  return { params, bodyStart: node.body.start, bodyEnd: node.body.end }
}
