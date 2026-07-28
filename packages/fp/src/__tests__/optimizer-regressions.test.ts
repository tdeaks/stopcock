import { describe, it, expect } from 'vite-plus/test'
// Imported from the explicit fusion entry for historical reasons (this file
// predates the one-runtime-path plan, when that entry ran a separate fused
// engine). `@stopcock/fp/fusion`'s `pipe` is now the same sequential
// function as root `pipe`, covered separately by root-sequential.test.ts.
import { pipe } from '../fusion'
import { flow } from '../flow'
import * as A from '../array'
import * as M from '../math'
import * as O from '../option'

describe('optimizer regressions', () => {
  describe('plan identity includes bound arguments', () => {
    it('take with different counts does not reuse a stale runner', () => {
      const f = (x: number) => x * 2
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      for (let i = 0; i < 5; i++) pipe(data, A.map(f), A.take(2))
      const r1 = pipe(data, A.map(f), A.take(2))
      const r2 = pipe(data, A.map(f), A.take(5))
      expect(r1).toEqual([2, 4])
      expect(r2).toEqual([2, 4, 6, 8, 10])
    })

    it('drop with different counts does not reuse a stale runner', () => {
      const f = (x: number) => x + 1
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      for (let i = 0; i < 5; i++) pipe(data, A.map(f), A.drop(2))
      const r1 = pipe(data, A.map(f), A.drop(2))
      const r2 = pipe(data, A.map(f), A.drop(5))
      expect(r1).toEqual([4, 5, 6, 7, 8, 9, 10, 11])
      expect(r2).toEqual([7, 8, 9, 10, 11])
    })

    it('reduce with different initial values does not reuse a stale runner', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      const pred = (x: number) => x % 2 === 0
      const reducer = (a: number, b: number) => a + b
      for (let i = 0; i < 5; i++) pipe(data, A.filter(pred), A.reduce(reducer, 0))
      const r1 = pipe(data, A.filter(pred), A.reduce(reducer, 0))
      const r2 = pipe(data, A.filter(pred), A.reduce(reducer, 100))
      expect(r1).toBe(30)
      expect(r2).toBe(130)
    })
  })

  describe('array-to-terminal-to-scalar segmentation', () => {
    it('map, sum, then scalar math ops', () => {
      const data = [1, 2, 3, 4]
      const result = pipe(
        data,
        A.map((x: number) => x * 2),
        A.sum,
        M.add(1),
        M.multiply(2),
      )
      expect(result).toBe(42)
    })

    it('filter, min, then scalar math ops', () => {
      const data = [5, 3, 8, 1, 9]
      const result = pipe(
        data,
        A.filter((x: number) => x > 0),
        A.min,
        O.map(M.multiply(10)),
      )
      expect(result).toEqual(O.some(10))
    })
  })

  describe('materializer-to-array segmentation matches naive evaluation', () => {
    it('sort then map then take: order and count match naive', () => {
      const data = [3, 1, 2, 5, 4]
      const calls: number[] = []
      const f = (x: number) => {
        calls.push(x)
        return x * 10
      }
      const result = pipe(data, A.sort, A.map(f), A.take(3))
      expect(result).toEqual([10, 20, 30])
      // D1 / one-runtime-path: there is no fused runtime engine left, so map
      // runs to completion over the whole (sorted) array before take slices
      // it -- one full pass per step, same as root pipe.
      expect(calls).toEqual([1, 2, 3, 4, 5])
    })

    it('accessor op used non-terminally is not silently dropped (pipe, few args)', () => {
      const data = [1, 2, 3, 4, 5]
      expect(
        pipe(
          data,
          A.reverse,
          A.filter((x: number) => x > 2),
        ),
      ).toEqual([5, 4, 3])
    })

    it('accessor op used non-terminally is not silently dropped (pipe, 7+ args)', () => {
      const data = [1, 2, 3, 4, 5]
      const id = (x: number) => x
      const result = pipe(
        data,
        A.map(id),
        A.map(id),
        A.map(id),
        A.map(id),
        A.reverse,
        A.filter((x: number) => x > 2),
      )
      expect(result).toEqual([5, 4, 3])
    })

    it('reverse then filter: order and predicate-call order match naive', () => {
      const data = [1, 2, 3, 4, 5]
      const visited: number[] = []
      const p = (x: number) => {
        visited.push(x)
        return x > 2
      }
      const result = pipe(data, A.reverse, A.filter(p))
      expect(result).toEqual([5, 4, 3])
      expect(visited).toEqual([5, 4, 3, 2, 1])
    })
  })

  describe('filter to accessor terminals', () => {
    it('filter then sum matches manual loop', () => {
      const data = [1, 2, 3, 4, 5, 6]
      const result = pipe(
        data,
        A.filter((x: number) => x % 2 === 0),
        A.sum,
      )
      let manual = 0
      for (const x of data) if (x % 2 === 0) manual += x
      expect(result).toBe(manual)
    })

    it('reject then sum matches manual loop', () => {
      const data = [1, 2, 3, 4, 5, 6]
      const result = pipe(
        data,
        A.reject((x: number) => x % 2 === 0),
        A.sum,
      )
      let manual = 0
      for (const x of data) if (!(x % 2 === 0)) manual += x
      expect(result).toBe(manual)
    })

    it('two filters then sum matches manual loop', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8]
      const result = pipe(
        data,
        A.filter((x: number) => x > 0),
        A.filter((x: number) => x % 2 === 0),
        A.sum,
      )
      expect(result).toBe(20)
    })

    it('two filters then min matches manual loop', () => {
      const data = [5, 3, 8, 1, 9, 2]
      const result = pipe(
        data,
        A.filter((x: number) => x > 0),
        A.filter((x: number) => x % 2 === 0),
        A.min,
      )
      expect(result).toEqual(O.some(2))
    })

    it('two filters then max matches manual loop', () => {
      const data = [5, 3, 8, 1, 9, 2]
      const result = pipe(
        data,
        A.filter((x: number) => x > 0),
        A.filter((x: number) => x % 2 === 0),
        A.max,
      )
      expect(result).toEqual(O.some(8))
    })

    it('two filters then count matches manual loop', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8]
      const result = pipe(
        data,
        A.filter((x: number) => x > 1),
        A.count((x: number) => x % 2 === 0),
      )
      expect(result).toBe(4)
    })
  })

  describe('flatMap early termination across outer and inner iterators', () => {
    it('take slices the fully expanded array: no early exit without a fusion engine (D1)', () => {
      // Before the one-runtime-path plan this ran through the fused compact
      // engine and stopped after the first outer call once take's quota was
      // satisfied mid-expansion. There is no fused runtime left: flatMap
      // expands every outer element first, and take(7) slices the result.
      const wide = Array.from({ length: 1000 }, (_, i) => i)
      let outerCalls = 0
      const f = (x: number) => {
        outerCalls++
        return Array.from({ length: 50 }, (_, k) => x * 100 + k)
      }
      const result = pipe(wide, A.flatMap(f), A.take(7))
      expect(result).toEqual([0, 1, 2, 3, 4, 5, 6])
      expect(outerCalls).toBe(1000)
    })

    it('takeWhile filters the fully expanded array: no early exit without a fusion engine (D1)', () => {
      // Same reasoning as the take case above: flatMap expands every one of
      // the 1000 outer elements (outerCalls) before takeWhile ever runs.
      // takeWhile's own early exit is intact -- it is a property of
      // takeWhile's implementation, not of fusion -- and it still only
      // needs 6 predicate calls to find its stopping point, because that
      // point falls within the first outer element's own 50-item expansion.
      const wide = Array.from({ length: 1000 }, (_, i) => i)
      let outerCalls = 0
      let innerCalls = 0
      const f = (x: number) => {
        outerCalls++
        return Array.from({ length: 50 }, (_, k) => x * 100 + k)
      }
      const pred = (v: number) => {
        innerCalls++
        return v < 5
      }
      const result = pipe(wide, A.flatMap(f), A.takeWhile(pred))
      expect(result).toEqual([0, 1, 2, 3, 4])
      expect(outerCalls).toBe(1000)
      expect(innerCalls).toBe(6)
    })

    it('find stops mid expansion, no over-production', () => {
      const result = pipe(
        [1, 2, 3],
        A.flatMap((x: number) => [x, x + 10]),
        A.find((v: number) => v > 5),
      )
      expect(result).toEqual(O.some(11))
    })
  })

  describe('tagged scalar flow chains at all supported arities', () => {
    it('scalar chains from arity 2 through 8 match manual composition', () => {
      const ops = [M.add(1), M.multiply(2), M.subtract(3), M.divide(2), M.inc, M.dec, M.negate]
      const manual = (x: number, n: number) => {
        let v = x
        const fns = [
          (y: number) => y + 1,
          (y: number) => y * 2,
          (y: number) => y - 3,
          (y: number) => y / 2,
          (y: number) => y + 1,
          (y: number) => y - 1,
          (y: number) => -y,
        ]
        for (let i = 0; i < n; i++) v = fns[i](v)
        return v
      }
      for (let n = 2; n <= 7; n++) {
        const composed = (flow as any)(...ops.slice(0, n))
        expect(composed(5)).toBe(manual(5, n))
      }
    })

    it('flow mixing array and scalar segments matches manual composition', () => {
      const g = flow(
        A.map((x: number) => x * 2),
        A.sum,
        M.add(1),
      )
      expect(g([1, 2, 3])).toBe(13)
    })

    it('pipe scalar dispatch: pipe(5, M.add(1), M.multiply(2))', () => {
      expect(pipe(5, M.add(1), M.multiply(2))).toBe(12)
    })
  })
})
