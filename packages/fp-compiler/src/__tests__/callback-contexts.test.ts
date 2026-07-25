import { describe, expect, it } from 'vite-plus/test'
import { transformStopcockPipelines } from '../transform'

const FP = '@stopcock/fp'
const ARRAY = '@stopcock/fp/array'

/**
 * Minimal source-map lookup. Decoding the mappings here rather than adding a
 * dependency mid-programme, and it is only ever asked for the original line of
 * a known generated position.
 */
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const decodeSegments = (mappings: string): number[][][] =>
  mappings.split(';').map((line) => {
    if (line.length === 0) return []
    return line.split(',').map((segment) => {
      const values: number[] = []
      let index = 0
      while (index < segment.length) {
        let result = 0
        let shift = 0
        let digit: number
        do {
          digit = BASE64.indexOf(segment[index++])
          result += (digit & 31) << shift
          shift += 5
        } while (digit & 32)
        const negative = result & 1
        result >>= 1
        values.push(negative ? -result : result)
      }
      return values
    })
  })

/** Original 1-based line for a generated 0-based line and column. */
const originalLineFor = (
  map: { mappings: string },
  generatedLine: number,
  generatedColumn: number,
): number | undefined => {
  const lines = decodeSegments(map.mappings)
  let sourceLine = 0
  let best: number | undefined
  for (let line = 0; line < lines.length; line++) {
    let generatedColumnCursor = 0
    for (const segment of lines[line]) {
      generatedColumnCursor += segment[0]
      if (segment.length >= 4) sourceLine += segment[2]
      if (line !== generatedLine) continue
      if (generatedColumnCursor <= generatedColumn) best = sourceLine + 1
    }
  }
  return best
}

const run = (source: string) =>
  transformStopcockPipelines(source, '/repo/src/a.ts', { diagnostics: 'summary' })

/** Executes transformed output with the operators stubbed to the real runtime. */
const execute = async (source: string): Promise<unknown> => {
  const out = run(source)
  // `file://` hrefs, not bare paths: these fixtures happen to have every
  // import pruned, so nothing needs resolving today, but a bare path would
  // fail the moment one did.
  const fpDist = new URL('../../../fp/dist/index.js', import.meta.url).href
  const arrayDist = new URL('../../../fp/dist/array.js', import.meta.url).href
  const code = out.code
    .split(`'${ARRAY}'`)
    .join(`'${arrayDist}'`)
    .split(`'${FP}'`)
    .join(`'${fpDist}'`)
  const encoded = Buffer.from(code).toString('base64')
  const module = (await import(`data:text/javascript;base64,${encoded}`)) as { r: unknown }
  return module.r
}

describe('callback contexts survive fusion', () => {
  it('captures a closure variable', async () => {
    expect(
      await execute(`import { pipe } from '${FP}'
import { map } from '${ARRAY}'
const factor = 3
export const r = pipe([1, 2], map((x) => x * factor))
`),
    ).toEqual([3, 6])
  })

  it('keeps a shadowed name bound to the right scope', async () => {
    expect(
      await execute(`import { pipe } from '${FP}'
import { map } from '${ARRAY}'
const x = 100
export const r = pipe([1, 2], map((x) => x + 1))
`),
    ).toEqual([2, 3])
  })

  it('destructures parameters', async () => {
    expect(
      await execute(`import { pipe } from '${FP}'
import { map } from '${ARRAY}'
export const r = pipe([{ a: 1 }, { a: 2 }], map(({ a }) => a * 2))
`),
    ).toEqual([2, 4])
  })

  it('accepts a member-expression callback', async () => {
    expect(
      await execute(`import { pipe } from '${FP}'
import { map } from '${ARRAY}'
const helpers = { double: (x) => x * 2 }
export const r = pipe([1, 2], map(helpers.double))
`),
    ).toEqual([2, 4])
  })

  it('preserves this for a bound callback', async () => {
    expect(
      await execute(`import { pipe } from '${FP}'
import { map } from '${ARRAY}'
const counter = { step: 10, scale(x) { return x * this.step } }
const bound = counter.scale.bind(counter)
export const r = pipe([1, 2], map(bound))
`),
    ).toEqual([10, 20])
  })

  it('does not leak the enclosing arguments object into a callback', async () => {
    expect(
      await execute(`import { pipe } from '${FP}'
import { map } from '${ARRAY}'
function outer() {
  return pipe([1, 2], map(function (x) { return x + arguments.length }))
}
export const r = outer()
`),
    ).toEqual([2, 3])
  })

  it('propagates a throw from a callback unchanged', async () => {
    await expect(
      execute(`import { pipe } from '${FP}'
import { map } from '${ARRAY}'
export const r = pipe([1], map(() => { throw new Error('from callback') }))
`),
    ).rejects.toThrow('from callback')
  })

  it('keeps callback evaluation order and count', async () => {
    expect(
      await execute(`import { pipe } from '${FP}'
import { filter, map } from '${ARRAY}'
const seen = []
const out = pipe([1, 2, 3], map((x) => { seen.push('m' + x); return x * 2 }), filter((x) => { seen.push('f' + x); return x > 2 }))
export const r = [out, seen]
`),
    ).toEqual([
      [4, 6],
      ['m1', 'f2', 'm2', 'f4', 'm3', 'f6'],
    ])
  })
})

describe('source maps resolve to original locations', () => {
  const source = `import { pipe } from '${FP}'
import { filter, map } from '${ARRAY}'
const boom = (x) => {
  throw new Error('boom at ' + x)
}
export const r = pipe([1, 2, 3], map(boom), filter((x) => x > 2))
`

  it('maps a callback body back to where it was written', () => {
    const out = run(source)
    expect(out.map).not.toBeNull()
    const lines = out.code.split('\n')
    const throwLine = lines.findIndex((line) => line.includes("throw new Error('boom at "))
    expect(throwLine).toBeGreaterThanOrEqual(0)
    // The callback was written on line 4 of the source and must still say so.
    expect(originalLineFor(out.map as never, throwLine, lines[throwLine].indexOf('throw'))).toBe(4)
  })

  it('maps generated pipeline code back to the call site it replaced', () => {
    const out = run(source)
    const lines = out.code.split('\n')
    const generated = lines.findIndex((line) => line.includes('_cb0'))
    expect(generated).toBeGreaterThanOrEqual(0)
    // Line 6 is the pipe() call the generated code stands in for.
    expect(originalLineFor(out.map as never, generated, lines[generated].indexOf('_cb0'))).toBe(6)
  })

  it('still produces a map when imports were pruned', () => {
    const out = run(`import { pipe } from '${FP}'
import { map } from '${ARRAY}'
export const r = pipe([1, 2], map((x) => x * 2))
`)
    expect(out.code).not.toContain(ARRAY)
    expect(out.map).not.toBeNull()
    const lines = out.code.split('\n')
    const body = lines.findIndex((line) => line.includes('* 2'))
    expect(originalLineFor(out.map as never, body, lines[body].indexOf('* 2'))).toBe(3)
  })
})
