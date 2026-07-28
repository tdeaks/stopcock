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
 * There is no runtime fusion engine any more (one-runtime-path plan):
 * `flow`/`fusedFlow` both compose left to right over plain function
 * application, whatever the steps are. Composition stays cheap because
 * there is nothing left to build before running it; `@stopcock/fp-compiler`
 * is the only thing that still fuses, and it does that at build time.
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

  it('is sequential through the explicit entry too: fusedFlow is flow', () => {
    // `@stopcock/fp/fusion`'s `flow` is the same sequential function as root
    // `flow` -- there is no separate runtime engine left to interleave
    // callbacks. `@stopcock/fp-compiler` is what fuses, at build time.
    expect(fusedFlow).toBe(flow)
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
    expect(order).toEqual(['map', 'map', 'filter', 'filter'])
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
