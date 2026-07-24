import { child, children, importSource, importedName, localName, memberName, nameOf } from './ast'
import type { RuleModule } from './types'

type PartialModule = 'array' | 'number' | 'object'

interface PartialReplacement {
  readonly replacement: string
}

const PARTIALS: Readonly<Record<PartialModule, Readonly<Record<string, string>>>> = {
  array: {
    headOrUndefined: 'head',
    lastOrUndefined: 'last',
    nthOrUndefined: 'nth',
    findOrUndefined: 'find',
    findIndexOrUndefined: 'findIndex',
    findMapOrUndefined: 'findMap',
    onlyOrUndefined: 'only',
    indexOfOrUndefined: 'indexOf',
    lastIndexOfOrUndefined: 'lastIndexOf',
    findLastOrUndefined: 'findLast',
    findLastIndexOrUndefined: 'findLastIndex',
    minOrUndefined: 'min',
    maxOrUndefined: 'max',
    meanByOrUndefined: 'meanBy',
  },
  number: {
    meanOrUndefined: 'mean',
    weightedMeanOrUndefined: 'weightedMean',
    medianOrUndefined: 'median',
    minOrUndefined: 'min',
    maxOrUndefined: 'max',
    minMaxOrUndefined: 'minMax',
    varianceOrUndefined: 'variance',
    variancePopulationOrUndefined: 'variancePopulation',
    varianceSampleOrUndefined: 'varianceSample',
    standardDeviationOrUndefined: 'standardDeviation',
    standardDeviationPopulationOrUndefined: 'standardDeviationPopulation',
    standardDeviationSampleOrUndefined: 'standardDeviationSample',
    quantileOrUndefined: 'quantile',
    percentileOrUndefined: 'percentile',
  },
  object: {
    getPathOrUndefined: 'getPath',
  },
}

const ROOT_NAMESPACES: Readonly<Record<string, PartialModule>> = {
  A: 'array',
  N: 'number',
  Obj: 'object',
}

const SUBPATHS: Readonly<Record<string, PartialModule>> = {
  '@stopcock/fp/array': 'array',
  '@stopcock/fp/number': 'number',
  '@stopcock/fp/object': 'object',
}

export const preferOptionPartials: RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer Option-returning partial APIs over undefined escape hatches',
      recommended: true,
    },
    schema: [],
    messages: {
      preferOption:
        'Prefer Option-returning "{{replacement}}" over "{{name}}" when absence is expected.',
    },
  },
  create(context) {
    const namespaces = new Map<string, PartialModule>()
    const functions = new Map<string, PartialReplacement>()

    return {
      ImportDeclaration(node) {
        const source = importSource(node)
        if (source === undefined) return
        const subpathModule = SUBPATHS[source]

        for (const specifier of children(node, 'specifiers')) {
          const local = localName(specifier)
          if (local === undefined) continue

          if (source === '@stopcock/fp' && specifier.type === 'ImportSpecifier') {
            const imported = importedName(specifier)
            const module = imported === undefined ? undefined : ROOT_NAMESPACES[imported]
            if (module !== undefined) namespaces.set(local, module)
            continue
          }

          if (subpathModule === undefined) continue
          if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaces.set(local, subpathModule)
          } else if (specifier.type === 'ImportSpecifier') {
            const imported = importedName(specifier)
            const replacement =
              imported === undefined ? undefined : PARTIALS[subpathModule][imported]
            if (imported !== undefined && replacement !== undefined) {
              functions.set(local, {
                replacement,
              })
            }
          }
        }
      },
      CallExpression(node) {
        const callee = child(node, 'callee')
        const directName = nameOf(callee)
        const direct = directName === undefined ? undefined : functions.get(directName)
        if (direct !== undefined && directName !== undefined) {
          context.report({
            node,
            messageId: 'preferOption',
            data: {
              name: directName,
              replacement: direct.replacement,
            },
          })
          return
        }

        if (callee?.type !== 'MemberExpression') return
        const object = nameOf(child(callee, 'object'))
        const method = memberName(callee)
        if (object === undefined || method === undefined) return
        const module = namespaces.get(object)
        if (module === undefined) return
        const replacement = PARTIALS[module][method]
        if (replacement === undefined) return
        context.report({
          node,
          messageId: 'preferOption',
          data: {
            name: `${object}.${method}`,
            replacement: `${object}.${replacement}`,
          },
        })
      },
    }
  },
}
