import { describe, expect, it } from 'vite-plus/test'
import {
  noEagerArrayChains,
  noLegacyApi,
  noRootModuleImports,
  preferOptionPartials,
  type AstNode,
  type ReportDescriptor,
  type RuleContext,
  type RuleModule,
} from '../index'

const identifier = (name: string): AstNode => ({ type: 'Identifier', name })
const literal = (value: string): AstNode => ({ type: 'Literal', value })

const run = <Options extends readonly unknown[]>(
  rule: RuleModule<Options>,
  event: string,
  node: AstNode,
  options: Options,
): readonly ReportDescriptor[] => {
  const reports: ReportDescriptor[] = []
  const context: RuleContext<Options> = {
    options,
    report: (report) => reports.push(report),
  }
  rule.create(context)[event]?.(node)
  return reports
}

describe('no-legacy-api', () => {
  it('reports and fixes removed subpaths', () => {
    const source = literal('@stopcock/fp/dual-lite')
    const reports = run(
      noLegacyApi,
      'ImportDeclaration',
      { type: 'ImportDeclaration', source, specifiers: [] },
      [],
    )
    expect(reports[0]?.messageId).toBe('legacySubpath')
    const fix = reports[0]?.fix?.({
      replaceText: (_node, text) => ({ text }),
    })
    expect(fix).toEqual({ text: '"@stopcock/fp/dual"' })
  })

  it('reports semantic module migrations without applying an unsafe fix', () => {
    const reports = run(
      noLegacyApi,
      'ImportDeclaration',
      {
        type: 'ImportDeclaration',
        source: literal('@stopcock/fp/stream'),
        specifiers: [],
      },
      [],
    )
    expect(reports[0]?.messageId).toBe('manualSubpath')
    expect(reports[0]?.fix).toBeUndefined()
  })

  it('renames compatible exports while preserving the local binding', () => {
    const reports = run(
      noLegacyApi,
      'ImportDeclaration',
      {
        type: 'ImportDeclaration',
        source: literal('@stopcock/fp/result'),
        specifiers: [
          {
            type: 'ImportSpecifier',
            imported: identifier('orElseWith'),
            local: identifier('recover'),
          },
        ],
      },
      [],
    )
    const fix = reports[0]?.fix?.({
      replaceText: (_node, text) => ({ text }),
    })
    expect(reports[0]?.messageId).toBe('renamedExport')
    expect(fix).toEqual({ text: 'orElse as recover' })
  })

  it('reports removed Logic imports without a fix', () => {
    const reports = run(
      noLegacyApi,
      'ImportDeclaration',
      {
        type: 'ImportDeclaration',
        source: literal('@stopcock/fp/logic'),
        specifiers: [],
      },
      [],
    )
    expect(reports[0]?.messageId).toBe('removedSubpath')
    expect(reports[0]?.fix).toBeUndefined()
  })
})

describe('no-root-module-imports', () => {
  it('allows the slim root and points module namespaces at subpaths', () => {
    const reports = run(
      noRootModuleImports,
      'ImportDeclaration',
      {
        type: 'ImportDeclaration',
        source: literal('@stopcock/fp'),
        specifiers: [
          {
            type: 'ImportSpecifier',
            imported: identifier('pipe'),
            local: identifier('pipe'),
          },
          {
            type: 'ImportSpecifier',
            imported: identifier('A'),
            local: identifier('A'),
          },
        ],
      },
      [],
    )
    expect(reports).toHaveLength(1)
    expect(reports[0]?.messageId).toBe('moduleImport')
    expect(reports[0]?.data).toEqual({ name: 'A', module: 'array' })
  })
})

describe('no-eager-array-chains', () => {
  it('reports the outer eager chain once', () => {
    const mapCall: AstNode = {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: identifier('values'),
        property: identifier('map'),
      },
    }
    const filterMember: AstNode = {
      type: 'MemberExpression',
      object: mapCall,
      property: identifier('filter'),
    }
    const filterCall: AstNode = {
      type: 'CallExpression',
      callee: filterMember,
    }
    const reports = run(noEagerArrayChains, 'CallExpression', filterCall, [])
    expect(reports).toHaveLength(1)
    expect(reports[0]?.data).toEqual({ chain: 'map -> filter' })
  })
})

describe('prefer-option-partials', () => {
  it('tracks aliased namespace imports and suggests the Option-first API', () => {
    const reports: ReportDescriptor[] = []
    const context: RuleContext = {
      options: [],
      report: (report) => reports.push(report),
    }
    const listeners = preferOptionPartials.create(context)
    listeners.ImportDeclaration?.({
      type: 'ImportDeclaration',
      source: literal('@stopcock/fp/array'),
      specifiers: [
        {
          type: 'ImportNamespaceSpecifier',
          local: identifier('ArrayFp'),
        },
      ],
    })
    listeners.CallExpression?.({
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: identifier('ArrayFp'),
        property: identifier('headOrUndefined'),
      },
    })
    expect(reports).toHaveLength(1)
    expect(reports[0]?.data).toEqual({
      name: 'ArrayFp.headOrUndefined',
      replacement: 'ArrayFp.head',
    })
  })
})
