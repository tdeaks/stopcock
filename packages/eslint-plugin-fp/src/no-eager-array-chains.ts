import { child, memberName } from './ast'
import type { AstNode, RuleModule } from './types'

export interface EagerChainOptions {
  readonly minimumLength?: number
  readonly methods?: readonly string[]
}

const DEFAULT_METHODS = [
  'map',
  'filter',
  'flatMap',
  'reduce',
  'some',
  'every',
  'find',
  'findIndex',
  'forEach',
]

const isParentChain = (node: AstNode): boolean => {
  const parent = node.parent
  if (parent?.type !== 'MemberExpression' || child(parent, 'object') !== node) return false
  const grandparent = parent.parent
  return grandparent?.type === 'CallExpression' && child(grandparent, 'callee') === parent
}

const chain = (node: AstNode, methods: ReadonlySet<string>): readonly string[] => {
  const output: string[] = []
  let current: AstNode | undefined = node
  while (current?.type === 'CallExpression') {
    const callee = child(current, 'callee')
    if (callee?.type !== 'MemberExpression') break
    const method = memberName(callee)
    if (method === undefined || !methods.has(method)) break
    output.push(method)
    current = child(callee, 'object')
  }
  return output.reverse()
}

export const noEagerArrayChains: RuleModule<readonly [EagerChainOptions?]> = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Flag eager callback chains that can be expressed as a fused FP pipeline',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          minimumLength: { type: 'integer', minimum: 2 },
          methods: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      eagerChain:
        'Eager chain "{{chain}}" creates intermediates; consider pipe/Iter or a compiled plan.',
    },
  },
  create(context) {
    const options = context.options[0]
    const minimumLength = Math.max(2, Math.floor(options?.minimumLength ?? 2))
    const methods = new Set(options?.methods ?? DEFAULT_METHODS)
    return {
      CallExpression(node) {
        if (isParentChain(node)) return
        const methodsInChain = chain(node, methods)
        if (methodsInChain.length < minimumLength) return
        context.report({
          node,
          messageId: 'eagerChain',
          data: { chain: methodsInChain.join(' -> ') },
        })
      },
    }
  },
}
