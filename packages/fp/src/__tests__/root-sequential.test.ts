import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import * as root from '../index'
import { flow } from '../flow'
import { pipe as fusedPipe } from '../fusion'
import { sequentialPipe } from '../internal/sequential'
import { pipe } from '../pipe'

/**
 * S8: root `pipe` and `flow` are sequential. Fusion is something you ask for by
 * name. The two must agree on output and disagree on execution, and this file
 * pins both halves — a root that quietly still fused would pass every result
 * assertion in the suite.
 */
describe('root pipe is sequential', () => {
  it('is the sequential core, not the engine', () => {
    expect(pipe).not.toBe(fusedPipe)
  })

  it('runs every stage before the next rather than interleaving', () => {
    const order: string[] = []
    pipe(
      [1, 2],
      A.map((x: number) => {
        order.push('map')
        return x * 2
      }),
      A.filter((x: number) => {
        order.push('filter')
        return x > 0
      }),
    )
    expect(order).toEqual(['map', 'map', 'filter', 'filter'])
  })

  it('agrees with explicit fusion on output', () => {
    const steps = [A.map((x: number) => x * 2), A.filter((x: number) => x > 2)] as const
    expect(pipe([1, 2, 3], ...steps)).toEqual(fusedPipe([1, 2, 3], ...steps))
  })

  it.each([1, 2, 3, 4, 5])('agrees with fusion at arity %i', (arity) => {
    const steps = Array.from({ length: arity }, () =>
      A.map((x: number) => x + 1),
    ) as unknown as readonly [never]
    expect(pipe([1, 2, 3], ...steps)).toEqual(fusedPipe([1, 2, 3], ...steps))
  })

  it('passes a lone value straight through', () => {
    expect(pipe(5)).toBe(5)
  })

  it('composes plain functions', () => {
    expect(
      pipe(
        5,
        (x: number) => x + 1,
        (x: number) => x * 2,
      ),
    ).toBe(12)
  })
})

describe('root flow is sequential', () => {
  it('returns a single function unchanged', () => {
    const f = (x: number) => x + 1
    expect(flow(f)).toBe(f)
  })

  it('agrees with pipe on the same steps', () => {
    const steps = [A.map((x: number) => x * 2), A.filter((x: number) => x > 2)] as const
    expect(flow(...steps)([1, 2, 3])).toEqual(pipe([1, 2, 3], ...steps))
  })
})

describe('the root surface is narrowed', () => {
  it.each(['compile', 'compilePure', 'explain', 'dual'])('no longer exports %s', (name) => {
    expect(Object.keys(root)).not.toContain(name)
  })

  it('still exports what ordinary composition needs', () => {
    for (const name of ['pipe', 'flow', 'some', 'none', 'ok', 'err', 'isSome', 'isOk']) {
      expect(Object.keys(root)).toContain(name)
    }
  })
})

describe('the sequential core stays dependency free', () => {
  it('imports nothing', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(new URL('../internal/sequential.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/^\s*import\s/mu)
  })

  it('is what root pipe delegates to', () => {
    expect(sequentialPipe(5, (x: number) => x + 1)).toBe(pipe(5, (x: number) => x + 1))
  })
})
