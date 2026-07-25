import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import * as compact from '../fusion'
import * as optimized from '../fusion-optimized'
import { resetCompactCache } from '../internal/compact-runtime'
import { interpret } from '../interpret'
import { buildPlan } from '../plan'

const double = (x: number) => x * 2
const big = (x: number) => x > 4
const input = [1, 2, 3, 4, 5, 6]

/** Every tier must agree on results, callback order, and early-exit counts. */
const tiers = {
  compact: (steps: readonly unknown[], value: unknown) =>
    (compact.pipe as (v: unknown, ...s: readonly never[]) => unknown)(
      value,
      ...(steps as readonly never[]),
    ),
  optimized: (steps: readonly unknown[], value: unknown) =>
    (optimized.pipe as (v: unknown, ...s: readonly never[]) => unknown)(
      value,
      ...(steps as readonly never[]),
    ),
  generic: (steps: readonly unknown[], value: unknown) => interpret(buildPlan(steps), value),
}

describe('compact agrees with every other tier', () => {
  it.each([
    ['map then filter', () => [A.map(double), A.filter(big)]],
    ['filter then map', () => [A.filter(big), A.map(double)]],
    ['map filter take', () => [A.map(double), A.filter(big), A.take(2)]],
    ['sink: reduce', () => [A.map(double), A.reduce((a: number, b: number) => a + b, 0)]],
    ['sink: find', () => [A.map(double), A.find(big)]],
    ['sink: every', () => [A.map(double), A.every(big)]],
    ['sink: some', () => [A.map(double), A.some(big)]],
    ['materializer: reverse', () => [A.map(double), A.reverse]],
    ['materializer: sum', () => [A.map(double), A.sum]],
    ['empty input', () => [A.map(double), A.filter(big)]],
  ])('%s', (_label, makeSteps) => {
    const value = _label === 'empty input' ? [] : input
    const results = Object.entries(tiers).map(([name, run]) => [name, run(makeSteps(), value)])
    const [, first] = results[0]
    for (const [name, result] of results) {
      expect(result, `${name} disagrees`).toEqual(first)
    }
  })

  it('agrees on callback order', () => {
    const trace = (run: (steps: readonly unknown[], value: unknown) => unknown): string[] => {
      const order: string[] = []
      run(
        [
          A.map((x: number) => {
            order.push(`m${x}`)
            return x * 2
          }),
          A.filter((x: number) => {
            order.push(`f${x}`)
            return x > 4
          }),
        ],
        [1, 2, 3],
      )
      return order
    }
    expect(trace(tiers.compact)).toEqual(trace(tiers.optimized))
    expect(trace(tiers.compact)).toEqual(['m1', 'f2', 'm2', 'f4', 'm3', 'f6'])
  })

  it('agrees on early-exit callback counts', () => {
    const count = (run: (steps: readonly unknown[], value: unknown) => unknown): number => {
      let calls = 0
      run(
        [
          A.map((x: number) => {
            calls++
            return x
          }),
          A.take(2),
        ],
        Array.from({ length: 1_000 }, (_, i) => i),
      )
      return calls
    }
    expect(count(tiers.compact)).toBe(count(tiers.optimized))
    expect(count(tiers.compact)).toBeLessThan(10)
  })

  it('keeps a forged step on the exact generic fallback', () => {
    const forged = Object.assign((xs: readonly number[]) => xs.slice(0, 1), { _op: 1, _fn: double })
    expect(tiers.compact([A.map(double), forged], [1, 2, 3])).toEqual(
      tiers.optimized([A.map(double), forged], [1, 2, 3]),
    )
  })
})

describe('compact cache', () => {
  it('gives the same answer cold and warm', () => {
    const steps = [A.map(double), A.filter(big)] as const
    resetCompactCache()
    const cold = compact.pipe(input, ...steps)
    const warm = compact.pipe(input, ...steps)
    expect(warm).toEqual(cold)
  })

  it('does not confuse two pipelines of the same shape', () => {
    const a = compact.pipe(input, A.map(double), A.filter(big))
    const b = compact.pipe(
      input,
      A.map((x: number) => x * 10),
      A.filter(big),
    )
    expect(a).not.toEqual(b)
  })

  it('stays correct with fresh closures every call', () => {
    for (let round = 0; round < 20; round++) {
      expect(
        compact.pipe(
          input,
          A.map((x: number) => x * 2),
          A.filter((x: number) => x > 4),
        ),
      ).toEqual([6, 8, 10, 12])
    }
  })
})
