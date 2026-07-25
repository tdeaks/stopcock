import { describe, expect, it } from 'vite-plus/test'
import { transformStopcockPipelines } from '../transform'

const FP_DIST = new URL('../../../fp/dist', import.meta.url).pathname

/**
 * Compiled Option terminals must return the *same* `none`, not an equal one.
 * Option is a tagged singleton: code that checks `result === none` is correct
 * against the runtime, and would silently break against a compiler that emitted
 * a fresh `{ _tag: 0 }` per site.
 */
const compileAndRun = async (body: string): Promise<unknown> => {
  const source = `import { pipe } from '@stopcock/fp'
import { find, findIndex, head, last, map } from '@stopcock/fp/array'
${body}
`
  const out = transformStopcockPipelines(source, '/repo/src/a.ts', { diagnostics: 'summary' })
  expect(out.diagnostics.every((site) => site.transformed)).toBe(true)
  const code = out.code
    .split("'@stopcock/fp/array'")
    .join(`'${FP_DIST}/array.js'`)
    .split("'@stopcock/fp'")
    .join(`'${FP_DIST}/index.js'`)
  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  )) as { r: unknown }
  return module.r
}

const interpret = async (body: string): Promise<unknown> => {
  const array = (await import(`${FP_DIST}/array.js`)) as Record<string, never>
  const root = (await import(`${FP_DIST}/index.js`)) as Record<string, never>
  const scope = { ...array, pipe: root.pipe }
  const runner = new Function(
    ...Object.keys(scope),
    `${body.replace('export const r =', 'return')}`,
  ) as (...args: unknown[]) => unknown
  return runner(...Object.values(scope))
}

describe('compiled Option terminals', () => {
  it('returns the canonical none, not a copy', async () => {
    // The comparison happens inside the compiled module. Importing `none` from
    // the test would compare across two module graphs — vitest's loader and the
    // data: URL import — and fail on two copies of the singleton for reasons
    // that have nothing to do with the compiler.
    const source = `import { pipe } from '@stopcock/fp'
import { find, map } from '@stopcock/fp/array'
import { none } from '@stopcock/fp/option'
export const r = pipe([1,2,3], map((x)=>x*2), find((x)=>x>99)) === none
`
    const out = transformStopcockPipelines(source, '/repo/src/a.ts', { diagnostics: 'summary' })
    const code = out.code
      .split("'@stopcock/fp/array'")
      .join(`'${FP_DIST}/array.js'`)
      .split("'@stopcock/fp/option'")
      .join(`'${FP_DIST}/option.js'`)
      .split("'@stopcock/fp'")
      .join(`'${FP_DIST}/index.js'`)
    const module = (await import(
      `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    )) as { r: boolean }
    expect(module.r).toBe(true)
  })

  it.each([
    ['find hit', 'export const r = pipe([1,2,3], map((x)=>x*2), find((x)=>x>2))'],
    ['find miss', 'export const r = pipe([1,2,3], map((x)=>x*2), find((x)=>x>99))'],
    ['head of empty', 'export const r = pipe([], map((x)=>x*2), head)'],
    ['head of non-empty', 'export const r = pipe([5,6], map((x)=>x*2), head)'],
    ['last of empty', 'export const r = pipe([], map((x)=>x*2), last)'],
    ['last of non-empty', 'export const r = pipe([5,6], map((x)=>x*2), last)'],
  ])('agrees with the interpreted pipeline: %s', async (_label, body) => {
    expect(await compileAndRun(body)).toEqual(await interpret(body))
  })

  it('keeps none identical across two separate compiled sites', async () => {
    // A per-site singleton would pass a deep-equality check and fail here.
    const source = `import { pipe } from '@stopcock/fp'
import { find, map } from '@stopcock/fp/array'
const a = pipe([1], map((x)=>x), find((x)=>x>99))
const b = pipe([2], map((x)=>x), find((x)=>x>99))
export const r = a === b
`
    const out = transformStopcockPipelines(source, '/repo/src/a.ts', { diagnostics: 'summary' })
    const code = out.code
      .split("'@stopcock/fp/array'")
      .join(`'${FP_DIST}/array.js'`)
      .split("'@stopcock/fp'")
      .join(`'${FP_DIST}/index.js'`)
    const module = (await import(
      `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    )) as { r: boolean }
    expect(module.r).toBe(true)
  })
})
