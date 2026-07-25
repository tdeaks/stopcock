import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import {
  DIRECT_LEAF_POLICIES_V1,
  directLeafPolicyForV1,
  renderDirectLeafV1,
  type DirectLeafPolicyV1,
} from './direct-leaf'
import { transformModuleV1 } from './dual-inline'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const generatedArray = readFileSync(join(root, 'src', 'array.ts'), 'utf8')

const policy = directLeafPolicyForV1('array', 'map') as DirectLeafPolicyV1

const declarationOf = (source: string, name: string): string => {
  const start = source.indexOf(`export const ${name}: {`)
  if (start < 0) throw new Error(`no declaration for ${name}`)
  const end = source.indexOf('\n} as any', start)
  return source.slice(start, end + '\n} as any'.length)
}

describe('direct-leaf policy', () => {
  it('pilots exactly one operation', () => {
    expect(DIRECT_LEAF_POLICIES_V1.map((entry) => `${entry.module}.${entry.name}`)).toEqual([
      'array.map',
    ])
  })

  it('keeps the single-entry strong cache as recorded compatibility debt', () => {
    expect(policy.cache).toBe('single-entry-strong')
  })

  it('records why construction stays inline', () => {
    expect(policy.construction).toBe('inline')
    expect(policy.constructionReason).toMatch(/JSC|V8/u)
  })

  const render = (overrides: Partial<DirectLeafPolicyV1> = {}) =>
    renderDirectLeafV1({
      policy: { ...policy, ...overrides },
      declaration: 'export const map: { <A, B>(arr: readonly A[], f: (a: A) => B): B[] }',
      opcode: 1,
      params: ['arr', 'f'],
      bodyCode: 'return arr.map(f)',
    })

  it('renders a leaf that reads no cache, tag, or operator identity', () => {
    const rendered = render()
    const leaf = rendered.slice(
      rendered.indexOf('function runMap'),
      rendered.indexOf('let constructMapFn'),
    )
    for (const forbidden of ['_op', '_fn', 'constructMapFn', 'constructMapOperator']) {
      expect(leaf).not.toContain(forbidden)
    }
  })

  it('renders no cache state when a policy asks for none', () => {
    const rendered = render({ cache: 'none' })
    expect(rendered).not.toContain('constructMapFn')
    expect(rendered).toContain('_dl._op = 1')
  })

  it('can still render the isolated construction form it measured and rejected', () => {
    const rendered = render({ construction: 'isolated' })
    expect(rendered).toContain('function constructMap(_a0: any): any {')
    expect(rendered).toContain('return constructMap(arguments[0])')
  })
})

describe('generated array module', () => {
  it('sends both paths through the shared leaf and never executes inline', () => {
    const declaration = declarationOf(generatedArray, 'map')
    expect(declaration).toContain('if (arguments.length >= 2)')
    expect(declaration).toContain('return runMap(_a0, _a1)')
    expect(declaration).toContain('return runMap(data, _a0)')
    expect(declaration).not.toContain('new Array(')
  })

  it('keeps every cache and tag read off the direct path', () => {
    const declaration = declarationOf(generatedArray, 'map')
    const direct = declaration.slice(
      declaration.indexOf('if (arguments.length >= 2)'),
      declaration.indexOf('const _a0 = arguments[0]\n'),
    )
    for (const forbidden of ['_op', '_fn', 'constructMapFn', 'constructMapOperator']) {
      expect(direct).not.toContain(forbidden)
    }
    const leaf = generatedArray.slice(
      generatedArray.indexOf('function runMap('),
      generatedArray.indexOf('let constructMapFn'),
    )
    expect(leaf).not.toContain('_op')
  })

  it('leaves every other operation on its previous generated shape', () => {
    for (const name of ['filter', 'mapWithIndex', 'mapWhile']) {
      const declaration = declarationOf(generatedArray, name)
      expect(declaration).toContain(`= function ${name}(_arg0?: any, _arg1?: any)`)
      expect(declaration).toContain('if (arguments.length < 2)')
    }
  })

  it('reproduces byte for byte from the checked-in definitions', () => {
    const definitions = readFileSync(join(root, 'codegen', 'defs', 'array.ts'), 'utf8')
    const expected = `${transformModuleV1(definitions, 'array')}\n\nexport * from './array-extra'\n`
    expect(generatedArray).toBe(expected)
  })
})
