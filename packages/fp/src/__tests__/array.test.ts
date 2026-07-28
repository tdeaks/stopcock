import { describe, it, expect } from 'vite-plus/test'
import { pipe } from '../pipe'
import { none, some } from '../option'
import * as A from '../array'

describe('array', () => {
  describe('operator construction', () => {
    it('constructs a plain data-last closure, with no runtime tag', () => {
      const double = (x: number) => x * 2
      const op = A.map(double)

      expect((op as any)._op).toBeUndefined()
      expect((op as any)._fn).toBeUndefined()
      expect(pipe([1, 2, 3], op)).toEqual([2, 4, 6])
    })
  })

  describe('partial API contract', () => {
    it('uses Option by default and preserves present undefined values', () => {
      expect(A.head([])).toEqual(none)
      expect(A.head([undefined])).toEqual(some(undefined))
      expect(A.find(() => true)([undefined])).toEqual(some(undefined))
      expect(A.findIndex(() => false)([1])).toEqual(none)
      expect(A.nth(0)([])).toEqual(none)
      expect(A.min([])).toEqual(none)
      expect(A.max([3, 1, 2])).toEqual(some(3))
    })

    it('reserves undefined for explicit raw variants', () => {
      expect(A.headOrUndefined([])).toBeUndefined()
      expect(A.findOrUndefined((value) => value > 1)([1, 2])).toBe(2)
      expect(A.findIndexOrUndefined(() => false)([1])).toBeUndefined()
      expect(A.nthOrUndefined(2)([1])).toBeUndefined()
      expect(A.minOrUndefined([])).toBeUndefined()
      expect(A.onlyOrUndefined([1, 2])).toBeUndefined()
      expect(A.meanByOrUndefined(Number)([])).toBeUndefined()
    })

    it('provides total non-empty variants', () => {
      expect(A.headNonEmpty([1])).toBe(1)
      expect(A.lastNonEmpty([1, 2])).toBe(2)
      expect(A.minNonEmpty([2, 1])).toBe(1)
      expect(A.maxNonEmpty([2, 1])).toBe(2)
      expect(A.meanByNonEmpty((entry) => entry.value)([{ value: 2 }])).toBe(2)
    })
  })

  describe('arity 1 re-exports', () => {
    it('head', () => expect(A.head([1, 2, 3])).toEqual(some(1)))
    it('last', () => expect(A.last([1, 2, 3])).toEqual(some(3)))
    it('tail', () => expect(A.tail([1, 2, 3])).toEqual([2, 3]))
    it('init', () => expect(A.init([1, 2, 3])).toEqual([1, 2]))
    it('isEmpty', () => expect(A.isEmpty([])).toBe(true))
    it('length', () => expect(A.length([1, 2])).toBe(2))
    it('reverse', () => expect(A.reverse([1, 2, 3])).toEqual([3, 2, 1]))
    it('reverse does not mutate the input', () => {
      const arr = [1, 2, 3]
      const out = A.reverse(arr)
      expect(arr).toEqual([1, 2, 3])
      expect(out).toEqual([3, 2, 1])
      expect(out).not.toBe(arr)
    })
    it('flatten', () => expect(A.flatten([[1], [2, 3]])).toEqual([1, 2, 3]))
    it('first (alias for head)', () => expect(A.first([1, 2])).toEqual(some(1)))
    it('uniq', () => expect(A.uniq([1, 2, 2, 3])).toEqual([1, 2, 3]))
  })

  describe('standalone generators', () => {
    it('range', () => expect(A.range(1, 4)).toEqual([1, 2, 3]))
    it('sort', () => expect(A.sort([3, 1, 2])).toEqual([1, 2, 3]))
    it('transpose', () =>
      expect(
        A.transpose([
          [1, 2],
          [3, 4],
        ]),
      ).toEqual([
        [1, 3],
        [2, 4],
      ]))
    it('repeat', () => expect(A.repeat(3)('a')).toEqual(['a', 'a', 'a']))
    it('times', () => expect(A.times(3)((i) => i * 2)).toEqual([0, 2, 4]))
    it('unfold', () =>
      expect(A.unfold(1)((n) => (n < 5 ? [n, n + 1] : undefined))).toEqual([1, 2, 3, 4]))
    it('xprod', () =>
      expect(A.xprod(['a', 'b'])([1, 2])).toEqual([
        [1, 'a'],
        [1, 'b'],
        [2, 'a'],
        [2, 'b'],
      ]))
  })

  describe('arity 2 dual wrappers', () => {
    it('map data-last', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.map((x) => x * 2),
        ),
      ).toEqual([2, 4, 6]))

    it('mapWithIndex data-last', () =>
      expect(
        pipe(
          [10, 20],
          A.mapWithIndex((x, i) => x + i),
        ),
      ).toEqual([10, 21]))

    it('filter data-last', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.filter((x) => x % 2 === 0),
        ),
      ).toEqual([2, 4]))

    it('filterWithIndex data-last', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.filterWithIndex((_, i) => i > 0),
        ),
      ).toEqual([2, 3]))

    it('flatMap data-last', () =>
      expect(
        pipe(
          [1, 2],
          A.flatMap((x) => [x, x]),
        ),
      ).toEqual([1, 1, 2, 2]))

    it('find data-last', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.find((x) => x > 1),
        ),
      ).toEqual(some(2)))

    it('findIndex data-last', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.findIndex((x) => x > 1),
        ),
      ).toEqual(some(1)))

    it('every data-last', () =>
      expect(
        pipe(
          [2, 4, 6],
          A.every((x) => x % 2 === 0),
        ),
      ).toBe(true))

    it('some data-last', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.some((x) => x > 2),
        ),
      ).toBe(true))

    it('includes data-last', () => expect(pipe([1, 2, 3], A.includes(2))).toBe(true))

    it('sortBy data-last', () =>
      expect(
        pipe(
          [3, 1, 2],
          A.sortBy((a, b) => a - b),
        ),
      ).toEqual([1, 2, 3]))

    it('uniqBy data-last', () =>
      expect(pipe([1.1, 1.9, 2.1], A.uniqBy(Math.floor))).toEqual([1.1, 2.1]))

    it('take data-first', () => expect(A.take([1, 2, 3], 2)).toEqual([1, 2]))
    it('take data-last', () => expect(pipe([1, 2, 3], A.take(2))).toEqual([1, 2]))

    it('drop data-first', () => expect(A.drop([1, 2, 3], 1)).toEqual([2, 3]))
    it('drop data-last', () => expect(pipe([1, 2, 3], A.drop(1))).toEqual([2, 3]))

    it('takeWhile data-last', () =>
      expect(
        pipe(
          [1, 2, 3, 1],
          A.takeWhile((x) => x < 3),
        ),
      ).toEqual([1, 2]))

    it('dropWhile data-last', () =>
      expect(
        pipe(
          [1, 2, 3, 1],
          A.dropWhile((x) => x < 3),
        ),
      ).toEqual([3, 1]))

    it('chunk data-last', () =>
      expect(pipe([1, 2, 3, 4, 5], A.chunk(2))).toEqual([[1, 2], [3, 4], [5]]))
    it('chunk with empty input returns []', () => expect(A.chunk(2)([])).toEqual([]))
    it('chunk with size 0 returns []', () => expect(A.chunk(0)([1, 2, 3])).toEqual([]))
    it('chunk with negative size returns []', () => expect(A.chunk(-1)([1, 2, 3])).toEqual([]))
    it('chunk with size 1 returns singleton chunks', () =>
      expect(A.chunk(1)([1, 2, 3])).toEqual([[1], [2], [3]]))
    it('chunk with size >= length returns one chunk', () =>
      expect(A.chunk(10)([1, 2, 3])).toEqual([[1, 2, 3]]))
    it('chunk final short chunk keeps remainder length', () =>
      expect(A.chunk(3)([1, 2, 3, 4, 5, 6, 7])).toEqual([[1, 2, 3], [4, 5, 6], [7]]))

    it('slidingWindow data-last', () =>
      expect(pipe([1, 2, 3, 4], A.slidingWindow(2))).toEqual([
        [1, 2],
        [2, 3],
        [3, 4],
      ]))

    it('intersperse data-last', () =>
      expect(pipe([1, 2, 3], A.intersperse(0))).toEqual([1, 0, 2, 0, 3]))

    it('groupBy data-last', () =>
      expect(
        pipe(
          ['one', 'two', 'three'],
          A.groupBy((s) => String(s.length)),
        ),
      ).toEqual({ '3': ['one', 'two'], '5': ['three'] }))

    it('partition data-last', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.partition((x) => x % 2 === 0),
        ),
      ).toEqual([
        [2, 4],
        [1, 3],
      ]))

    it('aperture data-last', () =>
      expect(pipe([1, 2, 3, 4], A.aperture(2))).toEqual([
        [1, 2],
        [2, 3],
        [3, 4],
      ]))

    it('intersection data-last', () =>
      expect(pipe([1, 2, 3], A.intersection([2, 3, 4]))).toEqual([2, 3]))

    it('union data-last', () => expect(pipe([1, 2], A.union([2, 3]))).toEqual([1, 2, 3]))

    it('difference data-last', () => expect(pipe([1, 2, 3], A.difference([2, 3, 4]))).toEqual([1]))

    it('symmetricDifference data-last', () =>
      expect(pipe([1, 2, 3], A.symmetricDifference([2, 3, 4]))).toEqual([1, 4]))
  })

  describe('forEach', () => {
    it('data-first returns undefined, does not fall through to the curried branch', () => {
      const result: number[] = []
      const ret = A.forEach((x) => result.push(x))([1, 2, 3])
      expect(ret).toBeUndefined()
    })
    it('data-last', () => {
      const result: number[] = []
      pipe(
        [1, 2, 3],
        A.forEach((x) => result.push(x)),
      )
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('forEachWithIndex', () => {
    it('data-first returns undefined, does not fall through to the curried branch', () => {
      const result: [number, number][] = []
      const ret = A.forEachWithIndex((x, i) => result.push([x, i]))([10, 20])
      expect(ret).toBeUndefined()
    })
    it('data-last', () => {
      const result: [number, number][] = []
      pipe(
        [10, 20],
        A.forEachWithIndex((x, i) => result.push([x, i])),
      )
      expect(result).toEqual([
        [10, 0],
        [20, 1],
      ])
    })
  })

  describe('arity 3 dual wrappers', () => {
    it('reduce data-last', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.reduce((acc: number, x: number) => acc + x, 0),
        ),
      ).toBe(6))

    it('reduceRight data-last', () =>
      expect(
        pipe(
          ['a', 'b', 'c'],
          A.reduceRight((acc: string, x: string) => acc + x, ''),
        ),
      ).toBe('cba'))

    it('zip data-last', () =>
      expect(pipe([1, 2], A.zip(['a', 'b']))).toEqual([
        [1, 'a'],
        [2, 'b'],
      ]))

    it('zipWith data-last', () =>
      expect(
        pipe(
          [1, 2],
          A.zipWith([10, 20], (a: number, b: number) => a + b),
        ),
      ).toEqual([11, 22]))

    it('adjust data-last', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.adjust(1, (x: number) => x * 10),
        ),
      ).toEqual([1, 20, 3]))

    it('update data-last', () => expect(pipe([1, 2, 3], A.update(1, 99))).toEqual([1, 99, 3]))

    it('insert data-last', () => expect(pipe([1, 3], A.insert(1, 2))).toEqual([1, 2, 3]))

    it('remove data-last', () => expect(pipe([1, 2, 3, 4], A.remove(1, 2))).toEqual([1, 4]))

    it('scan data-last', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.scan((acc: number, x: number) => acc + x, 0),
        ),
      ).toEqual([0, 1, 3, 6]))
  })

  describe('pipe composition', () => {
    it('chains multiple array operations', () => {
      const result = pipe(
        [1, 2, 3, 4, 5, 6],
        A.filter((x) => x % 2 === 0),
        A.map((x) => x * 10),
        A.reduce((acc: number, x: number) => acc + x, 0),
      )
      expect(result).toBe(120)
    })
  })

  describe('arity 1 newly exposed', () => {
    it('dropRepeats', () => expect(A.dropRepeats([1, 1, 2, 2, 3, 1])).toEqual([1, 2, 3, 1]))
    it('only single', () => expect(A.only([42])).toEqual(some(42)))
    it('only multi', () => expect(A.only([1, 2])).toEqual(none))
    it('mergeAll', () => expect(A.mergeAll([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 }))
    it('unnest', () => expect(A.unnest([[1, 2], [3]])).toEqual([1, 2, 3]))
  })

  describe('arity 2 newly exposed', () => {
    it('reject curried', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.reject((x) => x % 2 === 0),
        ),
      ).toEqual([1, 3]))

    it('none curried', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.none((x) => x > 5),
        ),
      ).toBe(true))
    it('none false', () => expect(A.none((x) => x > 2)([1, 2, 3])).toBe(false))

    it('count curried', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.count((x) => x % 2 === 0),
        ),
      ).toBe(2))

    it('filterMap curried', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.filterMap((x) => (x % 2 === 0 ? x * 10 : undefined)),
        ),
      ).toEqual([20, 40]))
    it('findMap data-first stops at first mapped value', () => {
      let visited = 0
      const result = A.findMap((x) => {
        visited++
        return x > 2 ? String(x) : undefined
      })([1, 2, 3, 4])

      expect(result).toEqual(some('3'))
      expect(visited).toBe(3)
    })
    it('findMap curried', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.findMap((x) => (x > 1 ? String(x) : undefined)),
        ),
      ).toEqual(some('2')))
    it('mapWhile data-first stops at first nullish result', () => {
      let visited = 0
      const result = A.mapWhile((x) => {
        visited++
        return x < 3 ? x * 2 : undefined
      })([1, 2, 3, 4])

      expect(result).toEqual([2, 4])
      expect(visited).toBe(3)
    })
    it('mapWhile curried', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.mapWhile((x) => (x < 4 ? String(x) : undefined)),
        ),
      ).toEqual(['1', '2', '3']))
    it('takeUntil data-first stops before first match', () => {
      let visited = 0
      const result = A.takeUntil((x) => {
        visited++
        return x >= 3
      })([1, 2, 3, 4])

      expect(result).toEqual([1, 2])
      expect(visited).toBe(3)
    })
    it('takeUntil curried', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.takeUntil((x) => x > 2),
        ),
      ).toEqual([1, 2]))

    it('append curried', () => expect(pipe([1, 2], A.append(3))).toEqual([1, 2, 3]))

    it('prepend curried', () => expect(pipe([2, 3], A.prepend(1))).toEqual([1, 2, 3]))

    it('concat curried', () => expect(pipe([1, 2], A.concat([3, 4]))).toEqual([1, 2, 3, 4]))

    it('nth curried', () => expect(pipe([10, 20, 30], A.nth(1))).toEqual(some(20)))
    it('nth negative', () => expect(A.nth(-1)([10, 20, 30])).toEqual(some(30)))

    it('indexOf curried', () => expect(pipe([10, 20, 30], A.indexOf(20))).toEqual(some(1)))
    it('indexOf missing', () => expect(A.indexOf(99)([1, 2])).toEqual(none))

    it('lastIndexOf curried', () => expect(pipe([1, 2, 1], A.lastIndexOf(1))).toEqual(some(2)))
    it('lastIndexOf missing', () => expect(A.lastIndexOf(99)([1, 2])).toEqual(none))

    it('findLast curried', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.findLast((x) => x % 2 === 0),
        ),
      ).toEqual(some(4)))

    it('findLastIndex curried', () =>
      expect(
        pipe(
          [1, 2, 3, 2],
          A.findLastIndex((x) => x === 2),
        ),
      ).toEqual(some(3)))

    it('without curried', () => expect(pipe([1, 2, 3, 4], A.without([2, 4]))).toEqual([1, 3]))
    it('without empty exclusions returns a copy', () => {
      const arr = [1, 2, 3]
      const out = A.without([])(arr)
      expect(out).toEqual([1, 2, 3])
      expect(out).not.toBe(arr)
    })
    it('without excludes NaN via SameValueZero', () =>
      expect(A.without([NaN])([1, NaN, 2, NaN])).toEqual([1, 2]))
    it('without treats +0 and -0 as equal', () => {
      expect(A.without([0])([0, -0, 1])).toEqual([1])
      expect(A.without([-0])([0, 1])).toEqual([1])
    })
    it('without dedupes exclusions and preserves duplicate survivors', () =>
      expect(A.without([2])([1, 1, 2, 3, 3])).toEqual([1, 1, 3, 3]))
    it('without with 8 exclusions (unrolled tier boundary)', () =>
      expect(A.without([1, 2, 3, 4, 5, 6, 7, 8])([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([9]))
    it('without with 9 exclusions (linear-scan tier)', () =>
      expect(A.without([1, 2, 3, 4, 5, 6, 7, 8, 9])([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual([10]))
    it('without with 40 exclusions (Set tier)', () => {
      const excl = Array.from({ length: 40 }, (_, i) => i)
      expect(A.without(excl)([...excl, 40, 41])).toEqual([40, 41])
    })
    it('without rebuilds membership per call when exclusions mutate', () => {
      const excl = [2]
      expect(A.without(excl)([1, 2, 3])).toEqual([1, 3])
      excl.push(3)
      expect(A.without(excl)([1, 2, 3])).toEqual([1])
    })
    it('without preserves SameValueZero semantics across every crossover boundary', () => {
      const sameValueZero = (left: number, right: number): boolean =>
        left === right || (left !== left && right !== right)
      for (const sourceSize of [0, 1, 8, 33, 256]) {
        const source = Array.from({ length: sourceSize }, (_, index) =>
          index % 17 === 0 ? NaN : index % 19 === 0 ? -0 : index % 41,
        )
        for (const exclusionSize of [0, 1, 4, 8, 9, 16, 32, 33, 128]) {
          const exclusions = Array.from({ length: exclusionSize }, (_, index) =>
            index % 17 === 0 ? NaN : index % 19 === 0 ? 0 : index,
          )
          const expected = source.filter(
            (value) => !exclusions.some((excluded) => sameValueZero(value, excluded)),
          )
          expect(A.without(exclusions)(source), `${sourceSize}/${exclusionSize}`).toEqual(expected)
        }
      }
    })

    it('pluck curried', () => expect(pipe([{ x: 1 }, { x: 2 }], A.pluck('x'))).toEqual([1, 2]))

    it('dropRepeatsBy curried', () =>
      expect(pipe([1.1, 1.9, 2.1, 2.8], A.dropRepeatsBy(Math.floor))).toEqual([1.1, 2.1]))

    it('dropRepeatsWith curried', () =>
      expect(
        pipe(
          [1, 1, 2, 2, 3],
          A.dropRepeatsWith((a, b) => a === b),
        ),
      ).toEqual([1, 2, 3]))

    it('dropLast curried', () => expect(pipe([1, 2, 3, 4], A.dropLast(2))).toEqual([1, 2]))

    it('dropLastWhile curried', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.dropLastWhile((x) => x > 2),
        ),
      ).toEqual([1, 2]))

    it('takeLast curried', () => expect(pipe([1, 2, 3, 4], A.takeLast(2))).toEqual([3, 4]))

    it('takeLastWhile curried', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.takeLastWhile((x) => x > 2),
        ),
      ).toEqual([3, 4]))

    it('splitAt curried', () =>
      expect(pipe([1, 2, 3, 4], A.splitAt(2))).toEqual([
        [1, 2],
        [3, 4],
      ]))

    it('splitWhen curried', () =>
      expect(
        pipe(
          [1, 2, 3, 4],
          A.splitWhen((x) => x === 3),
        ),
      ).toEqual([
        [1, 2],
        [3, 4],
      ]))

    it('splitWhenever curried', () =>
      expect(
        pipe(
          [1, 0, 2, 0, 3],
          A.splitWhenever((x) => x === 0),
        ),
      ).toEqual([[1], [2], [3]]))

    it('join curried', () => expect(pipe(['a', 'b', 'c'], A.join('-'))).toBe('a-b-c'))

    it('uniqWith curried', () =>
      expect(
        pipe(
          [1, -1, 2, -2],
          A.uniqWith((a, b) => Math.abs(a) === Math.abs(b)),
        ),
      ).toEqual([1, 2]))

    it('groupWith curried', () =>
      expect(
        pipe(
          [1, 1, 2, 2, 3],
          A.groupWith((a, b) => a === b),
        ),
      ).toEqual([[1, 1], [2, 2], [3]]))

    it('indexBy curried', () =>
      expect(
        pipe(
          [{ id: 'a', v: 1 }],
          A.indexBy((x) => x.id),
        ),
      ).toEqual({ a: { id: 'a', v: 1 } }))

    it('collectBy curried', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.collectBy((x) => (x % 2 === 0 ? 'even' : 'odd')),
        ),
      ).toEqual([[1, 3], [2]]))

    it('sample returns correct length', () => expect(A.sample(3)([1, 2, 3, 4, 5]).length).toBe(3))
    it('sample curried', () => expect(pipe([1, 2, 3, 4, 5], A.sample(2)).length).toBe(2))

    it('hasAtLeast curried', () => expect(pipe([1, 2, 3], A.hasAtLeast(5))).toBe(false))

    it('meanBy curried', () =>
      expect(
        pipe(
          [{ v: 10 }, { v: 20 }],
          A.meanBy((x) => x.v),
        ),
      ).toEqual(some(15)))

    it('sumBy curried', () =>
      expect(
        pipe(
          [{ v: 10 }, { v: 20 }],
          A.sumBy((x) => x.v),
        ),
      ).toBe(30))

    it('mapToObj curried', () =>
      expect(
        pipe(
          [1, 2],
          A.mapToObj((x) => [String(x), x * 10]),
        ),
      ).toEqual({ '1': 10, '2': 20 }))

    it('zipObj curried', () => expect(pipe(['a', 'b'], A.zipObj([1, 2]))).toEqual({ a: 1, b: 2 }))

    it('groupByProp curried', () =>
      expect(pipe([{ t: 'x' }], A.groupByProp('t'))).toEqual({ x: [{ t: 'x' }] }))

    it('arrayStartsWith curried', () =>
      expect(pipe([1, 2, 3], A.arrayStartsWith([1, 2]))).toBe(true))
    it('arrayStartsWith false', () => expect(A.arrayStartsWith([2, 3])([1, 2, 3])).toBe(false))

    it('arrayEndsWith curried', () => expect(pipe([1, 2, 3], A.arrayEndsWith([2, 3]))).toBe(true))
    it('arrayEndsWith false', () => expect(A.arrayEndsWith([1, 2])([1, 2, 3])).toBe(false))

    it('sortedIndexWith curried', () =>
      expect(
        pipe(
          [1, 3, 5, 7],
          A.sortedIndexWith((x) => x >= 6),
        ),
      ).toBe(3))
  })

  describe('non-dual standalone', () => {
    it('sortedIndex', () => expect(A.sortedIndex(4)([1, 3, 5, 7])).toBe(2))
    it('sortedLastIndex', () => expect(A.sortedLastIndex(3)([1, 3, 3, 5])).toBe(3))
    it('pair', () => expect(A.pair('a', 1)).toEqual(['a', 1]))
  })

  describe('arity 3 newly exposed', () => {
    it('withoutBy curried', () =>
      expect(
        pipe(
          [{ id: 1 }, { id: 2 }],
          A.withoutBy([{ id: 1 }], (x) => String(x.id)),
        ),
      ).toEqual([{ id: 2 }]))

    it('slice curried', () => expect(pipe([1, 2, 3, 4, 5], A.slice(1, 4))).toEqual([2, 3, 4]))

    it('swap curried', () => expect(pipe([1, 2, 3], A.swap(0, 2))).toEqual([3, 2, 1]))

    it('insertAll curried', () =>
      expect(pipe([1, 4], A.insertAll(1, [2, 3]))).toEqual([1, 2, 3, 4]))

    it('unionBy curried', () =>
      expect(
        pipe(
          [{ id: 1 }],
          A.unionBy([{ id: 1 }, { id: 2 }], (x) => String(x.id)),
        ),
      ).toEqual([{ id: 1 }, { id: 2 }]))

    it('unionWith curried', () =>
      expect(
        pipe(
          [1, 2],
          A.unionWith([2, 3], (a, b) => a === b),
        ),
      ).toEqual([1, 2, 3]))

    it('intersectionBy curried', () =>
      expect(
        pipe(
          [{ id: 1 }, { id: 2 }],
          A.intersectionBy([{ id: 2 }], (x) => String(x.id)),
        ),
      ).toEqual([{ id: 2 }]))

    it('differenceBy curried', () =>
      expect(
        pipe(
          [{ id: 1 }, { id: 2 }],
          A.differenceBy([{ id: 2 }], (x) => String(x.id)),
        ),
      ).toEqual([{ id: 1 }]))

    it('differenceWith curried', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.differenceWith([2, 4], (a, b) => a === b),
        ),
      ).toEqual([1, 3]))

    it('symmetricDifferenceBy curried', () =>
      expect(
        pipe(
          [{ id: 1 }, { id: 2 }],
          A.symmetricDifferenceBy([{ id: 2 }, { id: 3 }], (x) => String(x.id)),
        ),
      ).toEqual([{ id: 1 }, { id: 3 }]))

    it('symmetricDifferenceWith curried', () =>
      expect(
        pipe(
          [1, 2],
          A.symmetricDifferenceWith([2, 3], (a, b) => a === b),
        ),
      ).toEqual([1, 3]))

    it('sortedIndexBy curried', () =>
      expect(
        pipe(
          [{ v: 1 }, { v: 3 }, { v: 5 }],
          A.sortedIndexBy({ v: 4 }, (x) => x.v),
        ),
      ).toBe(2))

    it('sortedLastIndexBy curried', () =>
      expect(
        pipe(
          [{ v: 1 }, { v: 3 }, { v: 3 }, { v: 5 }],
          A.sortedLastIndexBy({ v: 3 }, (x) => x.v),
        ),
      ).toBe(3))

    it('mapAccum curried', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.mapAccum((acc: number, x: number) => [acc + x, x * 2], 0),
        ),
      ).toEqual([6, [2, 4, 6]]))

    it('mapAccumRight curried', () =>
      expect(
        pipe(
          [1, 2, 3],
          A.mapAccumRight((acc: number, x: number) => [acc + x, x * 2], 0),
        ),
      ).toEqual([6, [2, 4, 6]]))
  })

  describe('arity 4 newly exposed', () => {
    it('reduceBy curried', () =>
      expect(
        pipe(
          ['a', 'bb'],
          A.reduceBy(
            (x) => String(x.length),
            (acc: string, x: string) => acc + x,
            '',
          ),
        ),
      ).toEqual({ '1': 'a', '2': 'bb' }))

    it('reduceWhile curried', () =>
      expect(
        pipe(
          [1, 2, 3, 4, 5],
          A.reduceWhile(
            (acc: number, _x: number) => acc < 6,
            (acc: number, x: number) => acc + x,
            0,
          ),
        ),
      ).toBe(6))

    it('splice curried', () =>
      expect(pipe([1, 2, 3, 4, 5], A.splice(1, 2, [10, 20]))).toEqual([1, 10, 20, 4, 5]))
  })
})
