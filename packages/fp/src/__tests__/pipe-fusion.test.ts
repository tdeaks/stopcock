import { describe, it, expect } from 'vitest'
import { pipe } from '../pipe'
import * as A from '../array'
import * as S from '../string'
import * as M from '../math'

describe('pipe fusion', () => {
  describe('correctness (known expected values)', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    it('single map', () => {
      expect(pipe(data, A.map((x: number) => x * 2))).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
    })

    it('filter then map', () => {
      expect(pipe(data, A.filter((x: number) => x % 2 === 0), A.map((x: number) => x * 10))).toEqual([20, 40, 60, 80, 100])
    })

    it('filter, map, take', () => {
      expect(pipe(data, A.filter((x: number) => x % 2 === 0), A.map((x: number) => x * 10), A.take(3))).toEqual([20, 40, 60])
    })

    it('map, sort (non-fuseable), take', () => {
      expect(pipe(data, A.map((x: number) => -x), A.sort, A.take(5))).toEqual([-10, -9, -8, -7, -6])
    })

    it('flatMap then filter', () => {
      expect(pipe([1, 2, 3], A.flatMap((x: number) => [x, x * 10]), A.filter((x: number) => x > 5))).toEqual([10, 20, 30])
    })

    it('drop then map', () => {
      expect(pipe(data, A.drop(7), A.map((x: number) => x * 2))).toEqual([16, 18, 20])
    })

    it('dropWhile then take', () => {
      expect(pipe(data, A.dropWhile((x: number) => x < 5), A.take(3))).toEqual([5, 6, 7])
    })

    it('takeWhile', () => {
      expect(pipe(data, A.takeWhile((x: number) => x < 6))).toEqual([1, 2, 3, 4, 5])
    })

    it('map then flatMap then take', () => {
      expect(pipe([1, 2, 3], A.map((x: number) => x + 1), A.flatMap((x: number) => [x, x]), A.take(4))).toEqual([2, 2, 3, 3])
    })
  })

  describe('early termination', () => {
    const million = Array.from({ length: 1_000_000 }, (_, i) => i)

    it('take(5) visits far fewer than 1M items', () => {
      let visited = 0
      const spy = (x: number) => { visited++; return x }
      pipe(million, A.map(spy), A.take(5))
      expect(visited).toBeLessThanOrEqual(6)
    })

    it('filter + take visits only enough to find matches', () => {
      let visited = 0
      const spy = (x: number) => { visited++; return x % 100 === 0 }
      pipe(million, A.filter(spy), A.take(5))
      expect(visited).toBeLessThan(1000)
    })

    it('takeWhile stops at first failing item', () => {
      let visited = 0
      const spy = (x: number) => { visited++; return x < 10 }
      pipe(million, A.takeWhile(spy))
      expect(visited).toBe(11)
    })
  })

  describe('materialization boundaries', () => {
    const data = [5, 3, 8, 1, 9, 2, 7, 4, 6, 10]

    it('non-fuseable in middle: filter, sort, take', () => {
      expect(pipe(data, A.filter((x: number) => x > 3), A.sort, A.take(3))).toEqual([4, 5, 6])
    })

    it('multiple non-fuseable: sort, reverse', () => {
      expect(pipe(data, A.sort, A.reverse)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    })

    it('non-fuseable at start: sort, filter, map', () => {
      expect(pipe(data, A.sort, A.filter((x: number) => x > 7), A.map((x: number) => x * 2))).toEqual([16, 18, 20])
    })

    it('non-fuseable at end: filter, sort', () => {
      expect(pipe(data, A.filter((x: number) => x % 2 === 0), A.sort)).toEqual([2, 4, 6, 8, 10])
    })

    it('sortBy in middle', () => {
      expect(pipe(data, A.filter((x: number) => x > 3), A.sortBy((a: number, b: number) => b - a), A.take(3))).toEqual([10, 9, 8])
    })
  })

  describe('graceful degradation', () => {
    const data = [1, 2, 3, 4, 5]

    it('untagged function in chain', () => {
      const custom = (arr: number[]) => arr.map(x => x + 100)
      expect(pipe(data, A.filter((x: number) => x > 2), custom, A.map((x: number) => x * 2))).toEqual([206, 208, 210])
    })

    it('all untagged behaves like pipe', () => {
      const f1 = (arr: number[]) => arr.filter(x => x > 2)
      const f2 = (arr: number[]) => arr.map(x => x * 10)
      expect(pipe(data, f1, f2)).toEqual([30, 40, 50])
    })

    it('mixed tagged and untagged', () => {
      const custom = (arr: number[]) => [...arr].reverse()
      expect(pipe(data, A.map((x: number) => x * 2), custom, A.take(3))).toEqual([10, 8, 6])
    })
  })

  describe('fuseable terminal ops', () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    it('filter + reduce', () => {
      expect(pipe(data, A.filter((x: number) => x % 2 === 0), A.reduce((acc: number, x: number) => acc + x, 0))).toBe(30)
    })

    it('map + forEach', () => {
      const result: number[] = []
      pipe(data, A.map((x: number) => x * 2), A.forEach((x: number) => result.push(x)))
      expect(result).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20])
    })

    it('filter + every (true)', () => {
      expect(pipe(data, A.filter((x: number) => x > 3), A.every((x: number) => x > 0))).toBe(true)
    })

    it('every returns false', () => {
      expect(pipe(data, A.every((x: number) => x < 5))).toBe(false)
    })

    it('filter + some', () => {
      expect(pipe(data, A.filter((x: number) => x > 8), A.some((x: number) => x === 10))).toBe(true)
    })

    it('some returns false', () => {
      expect(pipe(data, A.some((x: number) => x > 100))).toBe(false)
    })

    it('map + find', () => {
      expect(pipe(data, A.map((x: number) => x * 2), A.find((x: number) => x > 10))).toBe(12)
    })

    it('find returns undefined when no match', () => {
      expect(pipe(data, A.find((x: number) => x > 100))).toBeUndefined()
    })

    it('filter + findIndex', () => {
      expect(pipe(data, A.filter((x: number) => x % 2 === 0), A.findIndex((x: number) => x > 5))).toBe(2)
    })

    it('findIndex returns undefined when no match', () => {
      expect(pipe(data, A.findIndex((x: number) => x > 100))).toBeUndefined()
    })
  })

  describe('flatMap in fused context', () => {
    it('expanding then limiting', () => {
      expect(pipe([1, 2, 3, 4, 5], A.flatMap((x: number) => [x, x]), A.take(4))).toEqual([1, 1, 2, 2])
    })

    it('filtering via flatMap then mapping', () => {
      expect(pipe([-2, -1, 0, 1, 2, 3], A.flatMap((x: number) => x > 0 ? [x] : []), A.map((x: number) => x * 10))).toEqual([10, 20, 30])
    })

    it('collapsing to empty', () => {
      expect(pipe([1, 2, 3], A.flatMap(() => []))).toEqual([])
    })

    it('flatMap early termination with take', () => {
      let visited = 0
      const million = Array.from({ length: 1_000_000 }, (_, i) => i)
      const f = (x: number) => { visited++; return [x, x + 1] }
      pipe(million, A.flatMap(f), A.take(4))
      expect(visited).toBeLessThanOrEqual(3)
    })
  })

  describe('edge cases', () => {
    it('empty input', () => {
      expect(pipe([], A.map((x: number) => x * 2))).toEqual([])
    })

    it('no operations', () => {
      const data = [1, 2, 3]
      expect(pipe(data)).toBe(data)
    })

    it('single operation', () => {
      expect(pipe([1, 2, 3], A.map((x: number) => x * 2))).toEqual([2, 4, 6])
    })

    it('take(0)', () => {
      expect(pipe([1, 2, 3], A.take(0))).toEqual([])
    })

    it('drop(Infinity)', () => {
      expect(pipe([1, 2, 3], A.drop(Infinity))).toEqual([])
    })

    it('drop more than length', () => {
      expect(pipe([1, 2, 3], A.drop(10))).toEqual([])
    })

    it('take more than length', () => {
      expect(pipe([1, 2, 3], A.take(10))).toEqual([1, 2, 3])
    })
  })

  describe('toString() callback inlining', () => {
    it('inlines arithmetic in map', () => {
      expect(pipe([1, 2, 3], A.map((x: number) => x * 2))).toEqual([2, 4, 6])
    })

    it('inlines property access in map', () => {
      expect(pipe([{ n: 'a' }, { n: 'b' }], A.map((x: any) => x.n))).toEqual(['a', 'b'])
    })

    it('inlines comparison in filter', () => {
      expect(pipe([1, 2, 3, 4, 5], A.filter((x: number) => x > 3))).toEqual([4, 5])
    })

    it('inlines property comparison in filter', () => {
      expect(pipe(
        [{ age: 10 }, { age: 20 }, { age: 30 }],
        A.filter((x: any) => x.age >= 18),
        A.map((x: any) => x.age),
      )).toEqual([20, 30])
    })

    it('inlines typeof checks', () => {
      expect(pipe([1, 'a', 2, 'b'] as any[], A.filter((x: any) => typeof x === 'number'))).toEqual([1, 2])
    })

    it('inlines negation in filter', () => {
      expect(pipe([true, false, true], A.filter((x: boolean) => !x))).toEqual([false])
    })

    it('inlines method calls', () => {
      expect(pipe(['  a  ', '  b  '], A.map((x: string) => x.trim()))).toEqual(['a', 'b'])
    })

    it('inlines chained property access', () => {
      const data = [{ name: { first: 'Tom' } }, { name: { first: 'Jo' } }]
      expect(pipe(data, A.map((x: any) => x.name.first))).toEqual(['Tom', 'Jo'])
    })

    it('inlines in every terminal', () => {
      expect(pipe([2, 4, 6], A.every((x: number) => x % 2 === 0))).toBe(true)
      expect(pipe([2, 4, 5], A.every((x: number) => x % 2 === 0))).toBe(false)
    })

    it('inlines in some terminal', () => {
      expect(pipe([1, 2, 3], A.some((x: number) => x > 2))).toBe(true)
      expect(pipe([1, 2, 3], A.some((x: number) => x > 5))).toBe(false)
    })

    it('inlines in find terminal', () => {
      expect(pipe([1, 2, 3, 4], A.find((x: number) => x > 2))).toBe(3)
    })

    it('falls back for closures (still works correctly)', () => {
      const threshold = 3
      expect(pipe([1, 2, 3, 4, 5], A.filter((x: number) => x > threshold))).toEqual([4, 5])
    })

    it('falls back for block bodies (still works correctly)', () => {
      expect(pipe([1, 2, 3], A.map((x: number) => { const y = x * 2; return y }))).toEqual([2, 4, 6])
    })

    it('full fused pipeline with inlining', () => {
      const data = Array.from({ length: 1000 }, (_, i) => ({ id: i, score: i * 0.1 }))
      const result = pipe(
        data,
        A.filter((x: any) => x.score > 50),
        A.map((x: any) => x.id),
        A.take(5),
      )
      expect(result).toHaveLength(5)
      expect(result).toEqual([501, 502, 503, 504, 505])
    })

    it('multi-expression inlining', () => {
      expect(pipe(
        [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }],
        A.map((p: any) => p.x + p.y),
      )).toEqual([3, 7, 11])
    })

    it('inlines takeWhile callback', () => {
      expect(pipe([1, 2, 3, 4, 5], A.takeWhile((x: number) => x < 4))).toEqual([1, 2, 3])
    })

    it('inlines dropWhile callback', () => {
      expect(pipe([1, 2, 3, 4, 5], A.dropWhile((x: number) => x < 3))).toEqual([3, 4, 5])
    })

    it('inlines reduce callback', () => {
      expect(pipe([1, 2, 3, 4], A.reduce((a: number, b: number) => a + b, 0))).toBe(10)
    })

    it('inlines reduce with property access', () => {
      const data = [{ v: 10 }, { v: 20 }, { v: 30 }]
      expect(pipe(data, A.reduce((a: number, b: any) => a + b.v, 0))).toBe(60)
    })

    it('pre-alloc for pure map chain', () => {
      const result = pipe(
        [1, 2, 3, 4, 5],
        A.map((x: number) => x * 2),
        A.map((x: number) => x + 1),
      )
      expect(result).toEqual([3, 5, 7, 9, 11])
    })

    it('push for filter+map chain (not pre-alloc)', () => {
      const result = pipe(
        [1, 2, 3, 4, 5],
        A.filter((x: number) => x > 2),
        A.map((x: number) => x * 10),
      )
      expect(result).toEqual([30, 40, 50])
    })
  })

  describe('reject in pipe', () => {
    it('standalone reject', () => {
      expect(pipe([1, 2, 3, 4, 5], A.reject((x: number) => x % 2 === 0))).toEqual([1, 3, 5])
    })

    it('reject then map', () => {
      expect(pipe([1, 2, 3, 4, 5], A.reject((x: number) => x > 3), A.map((x: number) => x * 10))).toEqual([10, 20, 30])
    })
  })

  describe('none in pipe', () => {
    it('none returns true when no match', () => {
      expect(pipe([1, 2, 3], A.none((x: number) => x > 10))).toBe(true)
    })

    it('none returns false when match exists', () => {
      expect(pipe([1, 2, 3], A.none((x: number) => x === 2))).toBe(false)
    })

    it('filter then none', () => {
      expect(pipe([1, 2, 3, 4, 5], A.filter((x: number) => x > 3), A.none((x: number) => x < 4))).toBe(true)
    })
  })

  describe('count in pipe', () => {
    it('standalone count', () => {
      expect(pipe([1, 2, 3, 4, 5], A.count((x: number) => x % 2 === 0))).toBe(2)
    })

    it('filter then count', () => {
      expect(pipe([1, 2, 3, 4, 5, 6, 7, 8], A.filter((x: number) => x > 3), A.count((x: number) => x % 2 === 0))).toBe(3)
    })
  })

  describe('takeWhile in pipe', () => {
    it('map then takeWhile', () => {
      expect(pipe([1, 2, 3, 4, 5], A.map((x: number) => x * 2), A.takeWhile((x: number) => x < 8))).toEqual([2, 4, 6])
    })
  })

  describe('dropWhile in pipe', () => {
    it('standalone dropWhile', () => {
      expect(pipe([1, 2, 3, 4, 5], A.dropWhile((x: number) => x < 3))).toEqual([3, 4, 5])
    })

    it('dropWhile then map', () => {
      expect(pipe([1, 2, 3, 4, 5], A.dropWhile((x: number) => x < 4), A.map((x: number) => x * 10))).toEqual([40, 50])
    })
  })

  describe('sortBy + take (quickselect)', () => {
    it('sortBy then take triggers takeSorted', () => {
      const data = [9, 1, 5, 3, 7, 2, 8, 4, 6, 10]
      expect(pipe(data, A.sortBy((a: number, b: number) => a - b), A.take(3))).toEqual([1, 2, 3])
    })

    it('sortBy descending then take', () => {
      const data = [9, 1, 5, 3, 7, 2, 8, 4, 6, 10]
      expect(pipe(data, A.sortBy((a: number, b: number) => b - a), A.take(4))).toEqual([10, 9, 8, 7])
    })

    it('sort then take (default comparator)', () => {
      expect(pipe([5, 3, 8, 1, 9, 2], A.sort, A.take(3))).toEqual([1, 2, 3])
    })
  })

  describe('accessor ops as terminals', () => {
    it('filter then sum', () => {
      expect(pipe([1, 2, 3, 4, 5], A.filter((x: number) => x > 2), A.sum)).toBe(12)
    })

    it('filter then min', () => {
      expect(pipe([5, 3, 8, 1, 9], A.filter((x: number) => x > 2), A.min)).toBe(3)
    })

    it('filter then max', () => {
      expect(pipe([5, 3, 8, 1, 9], A.filter((x: number) => x < 8), A.max)).toBe(5)
    })

    it('map then length', () => {
      expect(pipe([1, 2, 3, 4, 5], A.map((x: number) => x * 2), A.length)).toBe(5)
    })

    it('filter then isEmpty (non-empty)', () => {
      expect(pipe([1, 2, 3], A.filter((x: number) => x > 1), A.isEmpty)).toBe(false)
    })

    it('filter then isEmpty (empty)', () => {
      expect(pipe([1, 2, 3], A.filter((x: number) => x > 10), A.isEmpty)).toBe(true)
    })

    it('map then sum', () => {
      expect(pipe([1, 2, 3], A.map((x: number) => x * 10), A.sum)).toBe(60)
    })

    it('map then min', () => {
      expect(pipe([3, 1, 2], A.map((x: number) => x * 5), A.min)).toBe(5)
    })

    it('map then max', () => {
      expect(pipe([3, 1, 2], A.map((x: number) => x * 5), A.max)).toBe(15)
    })
  })

  describe('forEach as terminal', () => {
    it('map then forEach', () => {
      const out: number[] = []
      pipe([1, 2, 3], A.map((x: number) => x + 10), A.forEach((x: number) => out.push(x)))
      expect(out).toEqual([11, 12, 13])
    })

    it('filter then forEach', () => {
      const out: number[] = []
      pipe([1, 2, 3, 4, 5], A.filter((x: number) => x % 2 === 0), A.forEach((x: number) => out.push(x)))
      expect(out).toEqual([2, 4])
    })
  })

  describe('find as terminal', () => {
    it('map then find', () => {
      expect(pipe([1, 2, 3, 4], A.map((x: number) => x * 3), A.find((x: number) => x > 8))).toBe(9)
    })

    it('filter then find', () => {
      expect(pipe([1, 2, 3, 4, 5], A.filter((x: number) => x % 2 === 0), A.find((x: number) => x > 3))).toBe(4)
    })
  })

  describe('findIndex as terminal', () => {
    it('map then findIndex', () => {
      expect(pipe([10, 20, 30, 40], A.map((x: number) => x / 10), A.findIndex((x: number) => x === 3))).toBe(2)
    })

    it('map then findIndex no match', () => {
      expect(pipe([1, 2, 3], A.map((x: number) => x * 2), A.findIndex((x: number) => x > 100))).toBeUndefined()
    })
  })

  describe('every as terminal', () => {
    it('filter then every (true)', () => {
      expect(pipe([1, 2, 3, 4, 5], A.filter((x: number) => x > 2), A.every((x: number) => x >= 3))).toBe(true)
    })

    it('filter then every (false)', () => {
      expect(pipe([1, 2, 3, 4, 5], A.filter((x: number) => x > 2), A.every((x: number) => x > 4))).toBe(false)
    })

    it('map then every', () => {
      expect(pipe([1, 2, 3], A.map((x: number) => x * 2), A.every((x: number) => x % 2 === 0))).toBe(true)
    })
  })

  describe('some as terminal', () => {
    it('filter then some (true)', () => {
      expect(pipe([1, 2, 3, 4, 5], A.filter((x: number) => x > 3), A.some((x: number) => x === 5))).toBe(true)
    })

    it('filter then some (false)', () => {
      expect(pipe([1, 2, 3, 4, 5], A.filter((x: number) => x > 3), A.some((x: number) => x > 10))).toBe(false)
    })

    it('map then some', () => {
      expect(pipe([1, 2, 3], A.map((x: number) => x * 10), A.some((x: number) => x === 30))).toBe(true)
    })
  })

  describe('sort + accessor', () => {
    it('sort then head', () => {
      expect(pipe([5, 3, 8, 1, 9], A.sort, A.head)).toBe(1)
    })

    it('sort then last', () => {
      expect(pipe([5, 3, 8, 1, 9], A.sort, A.last)).toBe(9)
    })

    it('sort then head then sort then last (MRU collision)', () => {
      expect(pipe([5, 3, 8, 1, 9], A.sort, A.head)).toBe(1)
      expect(pipe([5, 3, 8, 1, 9], A.sort, A.last)).toBe(9)
    })

    it('filter, sort, head', () => {
      expect(pipe([5, 3, 8, 1, 9, 2], A.filter((x: number) => x > 3), A.sort, A.head)).toBe(5)
    })
  })

  describe('string scalar ops in pipe', () => {
    it('trim', () => {
      expect(pipe('  hello  ', S.trim)).toBe('hello')
    })

    it('toLowerCase', () => {
      expect(pipe('HELLO', S.toLowerCase)).toBe('hello')
    })

    it('toUpperCase', () => {
      expect(pipe('hello', S.toUpperCase)).toBe('HELLO')
    })

    it('trim then toLowerCase', () => {
      expect(pipe('  HELLO  ', S.trim, S.toLowerCase)).toBe('hello')
    })

    it('trim then toUpperCase', () => {
      expect(pipe('  hello  ', S.trim, S.toUpperCase)).toBe('HELLO')
    })
  })

  describe('scalar JIT string ops', () => {
    it('trimStart', () => {
      expect(pipe('  hello', S.trimStart)).toBe('hello')
    })

    it('trimEnd', () => {
      expect(pipe('hello  ', S.trimEnd)).toBe('hello')
    })

    it('split (tagged)', () => {
      expect(pipe('a,b,c', S.split(','))).toEqual(['a', 'b', 'c'])
    })

    it('length (tagged)', () => {
      expect(pipe('hello', S.length)).toBe(5)
    })

    it('isEmpty (tagged)', () => {
      expect(pipe('', S.isEmpty)).toBe(true)
      expect(pipe('x', S.isEmpty)).toBe(false)
    })

    it('chain: trimStart then toLowerCase', () => {
      expect(pipe('  HELLO', S.trimStart, S.toLowerCase)).toBe('hello')
    })

    it('chain: trimEnd then toUpperCase', () => {
      expect(pipe('hello  ', S.trimEnd, S.toUpperCase)).toBe('HELLO')
    })
  })

  describe('scalar JIT math ops', () => {
    it('add then multiply then subtract', () => {
      expect(pipe(5, M.add(3), M.multiply(2), M.subtract(1))).toBe(15)
    })

    it('negate then inc then dec', () => {
      expect(pipe(5, M.negate, M.inc, M.dec)).toBe(-5)
    })

    it('divide', () => {
      expect(pipe(20, M.divide(4))).toBe(5)
    })
  })

  describe('sortDesc + take fusion', () => {
    it('sortDesc then take triggers takeSorted', () => {
      const data = [9, 1, 5, 3, 7, 2, 8, 4, 6, 10]
      expect(pipe(data, A.sortDesc, A.take(3))).toEqual([10, 9, 8])
    })

    it('sortAsc then take', () => {
      const data = [9, 1, 5, 3, 7, 2, 8, 4, 6, 10]
      expect(pipe(data, A.sortAsc, A.take(4))).toEqual([1, 2, 3, 4])
    })
  })

  describe('mixed array and scalar ops (slow path)', () => {
    it('array ops then untagged then array ops', () => {
      const custom = (arr: number[]) => arr.map(x => x + 100)
      expect(
        pipe(
          [1, 2, 3, 4, 5],
          A.filter((x: number) => x > 2),
          A.map((x: number) => x * 10),
          custom,
          A.map((x: number) => x + 1),
          A.take(2),
        ),
      ).toEqual([131, 141])
    })
  })

  describe('AOT cache hit', () => {
    it('filter + map hits AOT (block-body callbacks bypass inlining)', () => {
      const f = (x: number) => { const r = x > 2; return r }
      const g = (x: number) => { const r = x * 10; return r }
      expect(pipe([1, 2, 3, 4, 5], A.filter(f), A.map(g))).toEqual([30, 40, 50])
    })

    it('map + take hits AOT', () => {
      const f = (x: number) => { const r = x * 2; return r }
      expect(pipe([1, 2, 3, 4, 5], A.map(f), A.take(3))).toEqual([2, 4, 6])
    })

    it('filter + reduce hits AOT', () => {
      const f = (x: number) => { const r = x % 2 === 0; return r }
      const r = (acc: number, x: number) => { const s = acc + x; return s }
      expect(pipe([1, 2, 3, 4, 5], A.filter(f), A.reduce(r, 0))).toBe(6)
    })
  })
})
