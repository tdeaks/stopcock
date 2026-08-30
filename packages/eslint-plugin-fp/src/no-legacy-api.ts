import { child, children, importSource, importedName, localName, nameOf } from './ast'
import type { RuleModule } from './types'

const MANUAL_SUBPATHS: Readonly<Record<string, string>> = {
  '@stopcock/fp/stream': '@stopcock/fp/iter',
  '@stopcock/fp/dict': '@stopcock/fp/record',
  '@stopcock/fp/lens': '@stopcock/fp/optic',
}

const REMOVED_SUBPATHS = new Set([
  '@stopcock/fp/dual',
  '@stopcock/fp/dual-lite',
  '@stopcock/fp/logic',
])

const ROOT_RENAMES: Readonly<Record<string, string>> = {
  explainPipeline: 'explain',
}

const SUBPATH_RENAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '@stopcock/fp/option': {
    orElseWith: 'orElse',
  },
  '@stopcock/fp/result': {
    orElseWith: 'orElse',
  },
}

const REMOVED_SUBPATH_EXPORTS: Readonly<Record<string, ReadonlySet<string>>> = {
  '@stopcock/fp/option': new Set(['getWithDefault']),
  '@stopcock/fp/result': new Set(['tryCatchAsync']),
}

const LEGACY_ROOT_EXPORTS = new Set([
  'Stream',
  'D',
  'Dict',
  'Logic',
  'Lens',
  'compileJit',
  'JitUnavailableError',
  'explainRunner',
  'explainSteps',
  'tryCatchAsync',
  'getWithDefault',
])

export const noLegacyApi: RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow FP 1 runtime JIT and removed module entry points',
      recommended: true,
    },
    schema: [],
    fixable: 'code',
    messages: {
      legacySubpath: 'Replace legacy "{{legacy}}" with "{{replacement}}".',
      manualSubpath: 'Legacy "{{legacy}}" requires a manual migration to "{{replacement}}".',
      removedSubpath: 'Legacy "{{legacy}}" was removed and has no single FP 2 replacement.',
      renamedExport: 'Replace legacy "{{legacy}}" with "{{replacement}}".',
      removedSubpathExport:
        '"{{name}}" was removed from "{{module}}" and requires a manual migration.',
      legacyRoot: '"{{name}}" was removed from the FP 2 root API.',
      legacyCall: 'Runtime JIT API "{{name}}" is unavailable in FP 2; use the AOT compiler.',
    },
  },
  create(context) {
    const legacyCalls = new Set<string>()
    return {
      ImportDeclaration(node) {
        const source = importSource(node)
        if (source === undefined) return
        const manualReplacement = MANUAL_SUBPATHS[source]
        if (manualReplacement !== undefined) {
          const sourceNode = child(node, 'source')
          if (sourceNode === undefined) return
          context.report({
            node: sourceNode,
            messageId: 'manualSubpath',
            data: { legacy: source, replacement: manualReplacement },
          })
        }
        if (REMOVED_SUBPATHS.has(source)) {
          const sourceNode = child(node, 'source')
          if (sourceNode === undefined) return
          context.report({
            node: sourceNode,
            messageId: 'removedSubpath',
            data: { legacy: source },
          })
        }

        for (const specifier of children(node, 'specifiers')) {
          if (specifier.type !== 'ImportSpecifier') continue
          const imported = importedName(specifier)
          if (imported === undefined) continue
          const local = localName(specifier)
          if (source === '@stopcock/fp') {
            const renamed = ROOT_RENAMES[imported]
            if (renamed !== undefined) {
              context.report({
                node: specifier,
                messageId: 'renamedExport',
                data: { legacy: imported, replacement: renamed },
                fix: (fixer) => fixer.replaceText(specifier, `${renamed} as ${local ?? imported}`),
              })
              continue
            }
            if (!LEGACY_ROOT_EXPORTS.has(imported)) continue
            if (imported === 'compileJit' && local !== undefined) {
              legacyCalls.add(local)
            }
            context.report({
              node: specifier,
              messageId: 'legacyRoot',
              data: { name: imported },
            })
            continue
          }

          const renamed = SUBPATH_RENAMES[source]?.[imported]
          if (renamed !== undefined) {
            context.report({
              node: specifier,
              messageId: 'renamedExport',
              data: { legacy: imported, replacement: renamed },
              fix: (fixer) => fixer.replaceText(specifier, `${renamed} as ${local ?? imported}`),
            })
          } else if (REMOVED_SUBPATH_EXPORTS[source]?.has(imported) === true) {
            context.report({
              node: specifier,
              messageId: 'removedSubpathExport',
              data: { name: imported, module: source },
            })
          }
        }
      },
      CallExpression(node) {
        const callee = child(node, 'callee')
        const name = nameOf(callee)
        if (name === undefined || !legacyCalls.has(name)) return
        context.report({
          node,
          messageId: 'legacyCall',
          data: { name },
        })
      },
    }
  },
}
