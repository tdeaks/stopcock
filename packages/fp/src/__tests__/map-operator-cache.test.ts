import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import { pipe } from '../pipe'

/**
 * The operator cache is keyed on the callback itself. That preserves
 * `map(f) === map(f)` while `f` is live and retains nothing once it is not,
 * which the previous one-entry strong slot could not do: it held the last
 * callback and its operator alive for the lifetime of the module.
 */
describe('Array.map operator cache', () => {
  it('returns the same operator while the callback is live', () => {
    const f = (x: number) => x * 2
    expect(A.map(f)).toBe(A.map(f))
  })

  it('gives distinct callbacks distinct operators', () => {
    expect(A.map((x: number) => x * 2)).not.toBe(A.map((x: number) => x * 2))
  })

  it('keeps more than one callback cached at a time', () => {
    const f = (x: number) => x + 1
    const g = (x: number) => x * 10
    const fromF = A.map(f)
    const fromG = A.map(g)
    // The old one-entry slot lost `f` the moment `g` arrived.
    expect(A.map(f)).toBe(fromF)
    expect(A.map(g)).toBe(fromG)
    expect(fromF).not.toBe(fromG)
  })

  it('keeps each cached operator bound to its own callback', () => {
    const f = (x: number) => x + 1
    const g = (x: number) => x * 10
    expect(A.map(f)([1, 2])).toEqual([2, 3])
    expect(A.map(g)([1, 2])).toEqual([10, 20])
    expect(A.map(f)([1, 2])).toEqual([2, 3])
  })

  it('retains nothing strongly: the cache holds only weak keys', () => {
    // A structural assertion, not a GC-timing test: GC timing is not a
    // correctness contract, but a strong module-level reference would be.
    const source = A.map.toString()
    expect(source).not.toMatch(/constructMapFn|constructMapOperator/u)
  })

  it('never exposes a partially constructed operator on reentrancy', () => {
    const seen: unknown[] = []
    const reentrant = (x: number): number => {
      seen.push(A.map(reentrant))
      return x
    }
    const operator = A.map(reentrant)
    operator([1, 2])
    expect(seen).toHaveLength(2)
    for (const observed of seen) {
      expect(observed).toBe(operator)
      expect(typeof observed).toBe('function')
    }
  })

  it('keeps a cached operator fusible', () => {
    const f = (x: number) => x * 2
    const operator = A.map(f)
    expect(
      pipe(
        [1, 2, 3],
        operator,
        A.filter((x: number) => x > 2),
      ),
    ).toEqual([4, 6])
    expect(A.map(f)).toBe(operator)
  })

  it('does not cache a non-function argument', () => {
    const operator = (A.map as unknown as (x: unknown) => unknown)(42)
    expect(typeof operator).toBe('function')
  })
})
