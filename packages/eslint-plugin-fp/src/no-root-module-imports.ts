import { children, importSource, importedName } from './ast'
import type { RuleModule } from './types'

export interface RootImportOptions {
  readonly allow?: readonly string[]
}

const ALLOWED_ROOT_EXPORTS = new Set([
  'Fn',
  'LazyValue',
  'pipe',
  'flow',
  'dual',
  'compile',
  'compilePure',
  'explain',
  'PipelineExplanation',
  'PureRewrite',
  'Runner',
  'None',
  'Option',
  'Some',
  'optionFromNullable',
  'isNone',
  'isSome',
  'none',
  'some',
  'Err',
  'Ok',
  'Result',
  'err',
  'isErr',
  'isOk',
  'ok',
])

const MODULE_HINTS: Readonly<Record<string, string>> = {
  A: 'array',
  Arr: 'array',
  B: 'boolean',
  D: 'record',
  Dict: 'record',
  getOptimizerStats: 'compile',
  G: 'guard',
  M: 'math',
  N: 'number',
  Obj: 'object',
  OptimizerStats: 'compile',
  O: 'option',
  R: 'result',
  S: 'string',
  Stream: 'iter',
  resetOptimizerStats: 'compile',
}

export const noRootModuleImports: RuleModule<readonly [RootImportOptions?]> = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Keep the FP root import slim and use focused module subpaths',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          allow: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      moduleImport: 'Import "{{name}}" from "@stopcock/fp/{{module}}" instead of the root.',
      unknownImport:
        '"{{name}}" is not part of the slim FP 2 root API; migrate to its focused replacement API.',
      namespaceImport:
        'Namespace and default imports from "@stopcock/fp" defeat the slim root API.',
    },
  },
  create(context) {
    const allowed = new Set([...ALLOWED_ROOT_EXPORTS, ...(context.options[0]?.allow ?? [])])
    return {
      ImportDeclaration(node) {
        if (importSource(node) !== '@stopcock/fp') return
        for (const specifier of children(node, 'specifiers')) {
          if (specifier.type !== 'ImportSpecifier') {
            context.report({ node: specifier, messageId: 'namespaceImport' })
            continue
          }
          const imported = importedName(specifier)
          if (imported === undefined || allowed.has(imported)) continue
          const module = MODULE_HINTS[imported]
          context.report({
            node: specifier,
            messageId: module === undefined ? 'unknownImport' : 'moduleImport',
            data: module === undefined ? { name: imported } : { name: imported, module },
          })
        }
      },
    }
  },
}
