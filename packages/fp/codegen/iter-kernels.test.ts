import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vite-plus/test'
import {
  ITER_KERNEL_SHAPES_V1,
  ITER_KERNEL_TERMINALS_V1,
  iterArrayShapeCodeV1,
  iterKernelFunctionNameV1,
  iterKernelFunctionTerminalV1,
  iterKernelIdV1,
  iterKernelLookupKeyV1,
  iterKernelManifestV1,
  iterKernelShapeIdV1,
  renderIterKernelV1,
  renderIterKernelsModuleV1,
} from './iter-kernels'

const FP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('kernel shape identity', () => {
  test('every shape gets its own code and every kernel its own name', () => {
    const codes = new Map<number, string>()
    for (const shape of ITER_KERNEL_SHAPES_V1) {
      const code = iterArrayShapeCodeV1(shape)
      expect(code).toBeGreaterThan(0)
      expect(codes.get(code)).toBeUndefined()
      codes.set(code, iterKernelShapeIdV1(shape))
    }

    // `filterMap-take` and `filter-map-take` camel-case to the same word, so a
    // naive name would silently collapse two different kernels into one.
    const names = new Map<string, string>()
    for (const shape of ITER_KERNEL_SHAPES_V1) {
      for (const terminal of ITER_KERNEL_TERMINALS_V1) {
        const name = iterKernelFunctionNameV1(terminal, shape)
        const key = `${iterKernelShapeIdV1(shape)}/${iterKernelFunctionTerminalV1(terminal)}`
        const seen = names.get(name)
        expect(seen ?? key).toBe(key)
        names.set(name, key)
      }
    }
  })

  test('lookup keys are unique per shape and kernel terminal', () => {
    const keys = new Set<number>()
    for (const shape of ITER_KERNEL_SHAPES_V1) {
      for (const terminal of ITER_KERNEL_TERMINALS_V1) {
        keys.add(iterKernelLookupKeyV1(terminal, shape))
      }
    }
    expect(keys.size).toBe(ITER_KERNEL_SHAPES_V1.length * 11)
  })
})

describe('disposition manifest', () => {
  const manifest = iterKernelManifestV1()

  test('covers the terminal by shape matrix exactly once', () => {
    expect(manifest).toHaveLength(ITER_KERNEL_TERMINALS_V1.length * ITER_KERNEL_SHAPES_V1.length)
    const ids = new Set(manifest.map((record) => record.kernelId))
    expect(ids.size).toBe(manifest.length)
    for (const terminal of ITER_KERNEL_TERMINALS_V1) {
      for (const shape of ITER_KERNEL_SHAPES_V1) {
        expect(ids.has(iterKernelIdV1(terminal, shape))).toBe(true)
      }
    }
  })

  test('every row carries a disposition and a reason', () => {
    for (const record of manifest) {
      expect(
        record.disposition === 'shipped' ||
          record.disposition === 'generic-fallback' ||
          record.disposition.startsWith('stopped:'),
      ).toBe(true)
      expect(record.reason.length).toBeGreaterThan(20)
    }
  })

  test('a shape is shipped for every terminal or for none', () => {
    for (const shape of ITER_KERNEL_SHAPES_V1) {
      const rows = manifest.filter(
        (record) => iterKernelShapeIdV1(record.shape) === iterKernelShapeIdV1(shape),
      )
      const shipped = rows.filter((record) => record.disposition === 'shipped').length
      expect(shipped === 0 || shipped === rows.length).toBe(true)
    }
  })

  test('the checked-in manifest matches the policy', () => {
    const onDisk = JSON.parse(
      readFileSync(join(FP_ROOT, 'codegen/generated/iter-kernel-manifest-v1.json'), 'utf8'),
    ) as { readonly rows: readonly { readonly kernelId: string; readonly disposition: string }[] }
    expect(onDisk.rows.map((row) => [row.kernelId, row.disposition])).toEqual(
      manifest.map((record) => [record.kernelId, record.disposition]),
    )
  })
})

describe('kernel rendering', () => {
  test('a map/toArray kernel is one indexed loop with the push inlined', () => {
    const rendered = renderIterKernelV1({ terminal: 'toArray', shape: ['map'] })
    expect(rendered).toContain('for (let cursor = 0; cursor < source.length; cursor++)')
    expect(rendered).toContain('out.push(value0)')
    expect(rendered).not.toContain('emit')
    // The length is read every iteration, so a source that grows mid-traversal
    // is observed the same way the generic executor observes it.
    expect(rendered).not.toContain('const length = source.length')
  })

  test('stage state is hoisted so callback indexes are per stage, not per element', () => {
    const rendered = renderIterKernelV1({ terminal: 'toArray', shape: ['filter', 'map', 'take'] })
    const loopAt = rendered.indexOf('for (let cursor')
    expect(rendered.indexOf('let index0 = 0')).toBeLessThan(loopAt)
    expect(rendered.indexOf('let index1 = 0')).toBeLessThan(loopAt)
    expect(rendered.indexOf('let taken2 = 0')).toBeLessThan(loopAt)
  })

  test('a nested flatMap loop breaks out of the labelled source loop', () => {
    const rendered = renderIterKernelV1({ terminal: 'find', shape: ['flatMap', 'map', 'filter'] })
    expect(rendered).toContain('source: for (let cursor')
    expect(rendered).toContain('break source')
    expect(rendered).toContain('for (const value0 of fn0(')
  })

  test('an unconditional early exit drops the trailing take check', () => {
    const first = renderIterKernelV1({ terminal: 'first', shape: ['map', 'filter', 'take'] })
    const find = renderIterKernelV1({ terminal: 'find', shape: ['map', 'filter', 'take'] })
    expect(first.match(/taken2 >= limit2/g)).toHaveLength(1)
    expect(find.match(/taken2 >= limit2/g)).toHaveLength(2)
  })

  test('a terminal only declares the arguments it reads', () => {
    expect(renderIterKernelV1({ terminal: 'count', shape: ['map'] })).toContain(
      'steps: readonly IterKernelStep[]): unknown',
    )
    expect(renderIterKernelV1({ terminal: 'reduce', shape: ['map'] })).toContain(
      'a: unknown, b: unknown',
    )
  })

  test('an Option/undefined terminal pair shares one kernel', () => {
    expect(renderIterKernelV1({ terminal: 'findOrUndefined', shape: ['map'] })).toBe(
      renderIterKernelV1({ terminal: 'find', shape: ['map'] }),
    )
  })
})

describe('module rendering', () => {
  test('emits each kernel once and matches the checked-in module', () => {
    const rendered = renderIterKernelsModuleV1(iterKernelManifestV1())
    const declared = [...rendered.matchAll(/^function (kernel\$[^(]+)\(/gmu)].map(
      (match) => match[1],
    )
    expect(new Set(declared).size).toBe(declared.length)
    for (const name of declared) expect(rendered).toContain(`, ${name}],`)

    // The generator is the only author of src/iter-kernels.ts. Formatting is
    // applied afterwards, so compare on tokens rather than bytes.
    const checkedIn = readFileSync(join(FP_ROOT, 'src/iter-kernels.ts'), 'utf8')
    for (const name of declared) expect(checkedIn).toContain(`function ${name}(`)
    expect([...checkedIn.matchAll(/^function (kernel\$[^(]+)\(/gmu)]).toHaveLength(declared.length)
  })

  test('imports nothing beyond the Option type', () => {
    const rendered = renderIterKernelsModuleV1(iterKernelManifestV1())
    const imports = [...rendered.matchAll(/^import .*? from '([^']+)'$/gmu)].map(
      (match) => match[1],
    )
    expect(imports).toEqual(['./option'])
  })
})
