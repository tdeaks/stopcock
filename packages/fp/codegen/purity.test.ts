import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import { transformModuleV1 } from './dual-inline'
import {
  MANUAL_DENIED_PURE_INITIALIZERS_V1,
  MANUAL_PURE_DUAL_INITIALIZERS_V1,
  MANUAL_PURE_FREEZE_INITIALIZERS_V1,
  MANUAL_PURE_REGISTERED_DUAL_INITIALIZERS_V1,
  MANUAL_PURE_REGISTERED_INITIALIZERS_V1,
  generatedDeniedInitializerKeysV1,
  generatedPureAnnotationV1,
  generatedPureInitializerKeysV1,
  validatePureInitializerSourcePolicyV1,
  type PureInitializerSourceModuleV1,
} from './purity'

const codegenRoot = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(codegenRoot, '..')
const sourceRoot = join(packageRoot, 'src')

function productionSourceModules(directory = sourceRoot): readonly PureInitializerSourceModuleV1[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__') return []
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return productionSourceModules(path)
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) return []
    return [
      {
        module: relative(sourceRoot, path).replaceAll('\\', '/').replace(/\.ts$/u, ''),
        source: readFileSync(path, 'utf8'),
      },
    ]
  })
}

function declaration(source: string, name: string): string {
  const match = new RegExp(`export const ${name}\\b`, 'u').exec(source)
  if (!match) throw new Error(`missing export const ${name}`)
  const start = match.index
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next < 0 ? source.length : next)
}

describe('S3A pure initializer policy', () => {
  it('emits markers only for reviewed fresh generated unary functions', () => {
    const generated = new Map(
      (['array', 'math'] as const).map((moduleName) => [
        moduleName,
        transformModuleV1(
          readFileSync(join(codegenRoot, 'defs', `${moduleName}.ts`), 'utf8'),
          moduleName,
        ),
      ]),
    )

    for (const key of generatedPureInitializerKeysV1()) {
      const [moduleName, name] = key.split('.') as ['array' | 'math', string]
      expect(declaration(generated.get(moduleName)!, name)).toContain('= /* @__PURE__ */ (() =>')
    }
    for (const key of generatedDeniedInitializerKeysV1()) {
      const [moduleName, name] = key.split('.') as ['array' | 'math', string]
      expect(declaration(generated.get(moduleName)!, name)).not.toContain('@__PURE__')
    }

    const markerCount = [...generated.values()].reduce(
      (count, source) => count + (source.match(/= \/\* @__PURE__ \*\/ \(\(\) =>/gu) ?? []).length,
      0,
    )
    expect(markerCount).toBe(generatedPureInitializerKeysV1().length)
  })

  it('fails closed when a reviewed generated initializer changes shape', () => {
    expect(
      generatedPureAnnotationV1({
        module: 'array',
        name: 'futureOperator',
        bodyKind: 'inline',
      }),
    ).toBe('')
    expect(() =>
      generatedPureAnnotationV1({
        module: 'array',
        name: 'head',
        bodyKind: 'reference',
      }),
    ).toThrow(/no longer creates a fresh local function/u)
    expect(() =>
      generatedPureAnnotationV1({
        module: 'array',
        name: 'sum',
        bodyKind: 'inline',
      }),
    ).toThrow(/changed shape and requires purity review/u)
  })

  it('keeps every manual dual annotation on the exact reviewed allowlist', () => {
    for (const [moduleName, names] of Object.entries(MANUAL_PURE_DUAL_INITIALIZERS_V1)) {
      const source = readFileSync(join(packageRoot, 'src', `${moduleName}.ts`), 'utf8')
      for (const name of names) {
        const initializer = declaration(source, name)
        expect(initializer).toContain('= /* @__PURE__ */ dual(')
        expect(initializer).not.toMatch(/\{\s*op\s*:/u)
      }
      expect((source.match(/\/\* @__PURE__ \*\/ dual\(/gu) ?? []).length).toBe(names.length)
    }
  })

  it('keeps every reviewed immutable singleton annotation', () => {
    for (const [moduleName, names] of Object.entries(MANUAL_PURE_FREEZE_INITIALIZERS_V1)) {
      const source = readFileSync(join(packageRoot, 'src', `${moduleName}.ts`), 'utf8')
      for (const name of names) {
        expect(declaration(source, name)).toMatch(
          /= \/\* @__PURE__ \*\/ Object\.freeze\(\{\s*_tag:\s*0\s*\}\)\s*$/u,
        )
      }
    }
  })

  it('keeps every registered unary annotation on a fresh local function', () => {
    for (const [moduleName, names] of Object.entries(MANUAL_PURE_REGISTERED_INITIALIZERS_V1)) {
      const source = readFileSync(join(packageRoot, 'src', `${moduleName}.ts`), 'utf8')
      for (const name of names) {
        const initializer = declaration(source, name)
        expect(initializer).toContain('= /* @__PURE__ */ taggedUnary(')
      }
    }
  })

  it('keeps every registered dual wrapper on a pure allocation initializer', () => {
    for (const [moduleName, names] of Object.entries(MANUAL_PURE_REGISTERED_DUAL_INITIALIZERS_V1)) {
      const source = readFileSync(join(packageRoot, 'src', `${moduleName}.ts`), 'utf8')
      for (const name of names) {
        expect(declaration(source, name)).toContain('= /* @__PURE__ */ (() =>')
      }
    }
  })

  it('denies unreviewed tagged String factories', () => {
    for (const [moduleName, names] of Object.entries(MANUAL_DENIED_PURE_INITIALIZERS_V1)) {
      const source = readFileSync(join(packageRoot, 'src', `${moduleName}.ts`), 'utf8')
      for (const name of names) {
        expect(declaration(source, name)).not.toContain('@__PURE__')
      }
    }
  })

  it('rejects every package-wide pure marker outside the reviewed inventory', () => {
    const modules = productionSourceModules()
    expect(() => validatePureInitializerSourcePolicyV1(modules)).not.toThrow()
    expect(() =>
      validatePureInitializerSourcePolicyV1([
        ...modules,
        {
          module: 'future',
          source: 'export const hidden = /* @__PURE__ */ dual(2, () => undefined)\n',
        },
      ]),
    ).toThrow(/unreviewed pure initializer future\.hidden/u)

    const changedNone = modules.map((module) =>
      module.module === 'option'
        ? {
            ...module,
            source: module.source.replace(
              'Object.freeze({ _tag: 0 })',
              'Object.freeze(makeNone())',
            ),
          }
        : module,
    )
    expect(() => validatePureInitializerSourcePolicyV1(changedNone)).toThrow(
      /option\.none changed its reviewed freeze shape/u,
    )
  })
})
