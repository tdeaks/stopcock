import { describe, it, expect } from 'vitest'
import { pipe } from '../pipe'
import { each, filtered, compose, toArray, modify, set, traversal } from '../traversal'

describe('Traversal', () => {
  it('each', () => {
    const t = each<number>()
    expect(toArray([1, 2, 3], t)).toEqual([1, 2, 3])
  })

  it('each modify', () => {
    const t = each<number>()
    expect(modify([1, 2, 3], t, x => x * 2)).toEqual([2, 4, 6])
  })

  it('each set', () => {
    const t = each<number>()
    expect(set([1, 2, 3], t, 0)).toEqual([0, 0, 0])
  })

  it('filtered', () => {
    const t = filtered<number>(n => n > 2)
    expect(toArray([1, 2, 3, 4, 5], t)).toEqual([3, 4, 5])
  })

  it('filtered modify', () => {
    const t = filtered<number>(n => n % 2 === 0)
    expect(modify([1, 2, 3, 4], t, x => x * 10)).toEqual([1, 20, 3, 40])
  })

  it('compose traversals', () => {
    const outer = each<number[]>()
    const inner = each<number>()
    const composed = compose(outer, inner)
    expect(toArray([[1, 2], [3, 4]], composed)).toEqual([1, 2, 3, 4])
    expect(modify([[1, 2], [3, 4]], composed, x => x + 10)).toEqual([[11, 12], [13, 14]])
  })

  it('compose each + filtered', () => {
    const t = compose(each<number[]>(), filtered<number>(n => n > 2))
    expect(toArray([[1, 2, 3], [4, 5]], t)).toEqual([3, 4, 5])
    expect(modify([[1, 2, 3], [4, 5]], t, x => x * 10)).toEqual([[1, 2, 30], [40, 50]])
  })

  it('custom traversal', () => {
    type Pair<A> = { fst: A; snd: A }
    const both = traversal<Pair<number>, number>(
      s => [s.fst, s.snd],
      (s, f) => ({ fst: f(s.fst), snd: f(s.snd) }),
    )
    expect(toArray({ fst: 1, snd: 2 }, both)).toEqual([1, 2])
    expect(modify({ fst: 1, snd: 2 }, both, x => x + 10)).toEqual({ fst: 11, snd: 12 })
  })

  it('pipe integration (data-last)', () => {
    const t = each<number>()
    const result = pipe([1, 2, 3], modify(t, (x: number) => x * 3))
    expect(result).toEqual([3, 6, 9])
  })
})
