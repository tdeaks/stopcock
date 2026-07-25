import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import { flow } from '../flow'
import { flow as fusedFlow } from '../fusion'
import { pipe } from '../pipe'

const inc = (x: number) => x + 1
const dbl = (x: number) => x * 2

/**
 * `flow` used to compile every composition, including ones with nothing to
 * fuse. Building a plan to discover there was no plan to build made composing
 * plain functions about 15x slower than lodash for an identical result.
 *
 * It now compiles only when a step is one of this package's operators. These
 * tests pin both halves of that: composition stays cheap, and fusion still
 * happens where it is the point.
 */
describe('flow over plain functions', () => {
  it('composes left to right', () => {
    expect(flow(inc, dbl)(5)).toBe(12)
    expect(flow(dbl, inc)(5)).toBe(11)
  })

  it('returns the single function unchanged', () => {
    expect(flow(inc)).toBe(inc)
  })

  it('applies every step exactly once, in order', () => {
    const order: string[] = []
    const a = (x: number) => {
      order.push('a')
      return x + 1
    }
    const b = (x: number) => {
      order.push('b')
      return x * 2
    }
    expect(flow(a, b)(1)).toBe(4)
    expect(order).toEqual(['a', 'b'])
  })

  it('propagates a throwing step without wrapping it', () => {
    const boom = new Error('boom')
    const throwing = () => {
      throw boom
    }
    expect(() => flow(inc, throwing)(1)).toThrow(boom)
  })

  it('composes long chains', () => {
    const steps = Array.from({ length: 12 }, () => inc) as [typeof inc, typeof inc]
    expect(flow(...steps)(0)).toBe(12)
  })
})

describe('flow over this package operators', () => {
  it('composes sequentially at the root since S8', () => {
    const order: string[] = []
    const composed = flow(
      A.map((x: number) => {
        order.push('map')
        return x * 2
      }),
      A.filter((x: number) => {
        order.push('filter')
        return x > 0
      }),
    )
    expect(composed([1, 2])).toEqual([2, 4])
    // Sequential: every mapper runs before the first predicate.
    expect(order).toEqual(['map', 'map', 'filter', 'filter'])
  })

  it('still fuses through the explicit entry', () => {
    // Fused execution interleaves the callbacks per element; a sequential
    // composition would run every mapper before the first predicate.
    const order: string[] = []
    const composed = fusedFlow(
      A.map((x: number) => {
        order.push('map')
        return x * 2
      }),
      A.filter((x: number) => {
        order.push('filter')
        return x > 0
      }),
    )
    expect(composed([1, 2])).toEqual([2, 4])
    expect(order).toEqual(['map', 'filter', 'map', 'filter'])
  })

  it('fuses when only a later step is an operator', () => {
    const composed = flow(
      (xs: readonly number[]) => xs.map(inc),
      A.filter((x: number) => x > 2),
    )
    expect(composed([1, 2, 3])).toEqual([3, 4])
  })

  it('agrees with pipe on the same steps', () => {
    const steps = [A.map(dbl), A.filter((x: number) => x > 2)] as const
    expect(flow(...steps)([1, 2, 3])).toEqual(pipe([1, 2, 3], ...steps))
  })
})
