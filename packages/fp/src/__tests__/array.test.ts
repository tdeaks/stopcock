import { describe, it, expect } from 'vitest'
import { pipe } from '../pipe'
import * as A from '../array'

describe('array', () => {
  describe('arity 1 re-exports', () => {
    it('head', () => expect(A.head([1, 2, 3])).toBe(1))
    it('last', () => expect(A.last([1, 2, 3])).toBe(3))
    it('tail', () => expect(A.tail([1, 2, 3])).toEqual([2, 3]))
    it('init', () => expect(A.init([1, 2, 3])).toEqual([1, 2]))
    it('isEmpty', () => expect(A.isEmpty([])).toBe(true))
    it('length', () => expect(A.length([1, 2])).toBe(2))
    it('reverse', () => expect(A.reverse([1, 2, 3])).toEqual([3, 2, 1]))
    it('flatten', () => expect(A.flatten([[1], [2, 3]])).toEqual([1, 2, 3]))
    it('first (alias for head)', () => expect(A.first([1, 2])).toBe(1))
    it('uniq', () => expect(A.uniq([1, 2, 2, 3])).toEqual([1, 2, 3]))
  })

  describe('standalone generators', () => {
    it('range', () => expect(A.range(1, 4)).toEqual([1, 2, 3]))
    it('sort', () => expect(A.sort([3, 1, 2])).toEqual([1, 2, 3]))
    it('transpose', () => expect(A.transpose([[1, 2], [3, 4]])).toEqual([[1, 3], [2, 4]]))
    it('repeat', () => expect(A.repeat('a', 3)).toEqual(['a', 'a', 'a']))
    it('times', () => expect(A.times(i => i * 2, 3)).toEqual([0, 2, 4]))
    it('unfold', () => expect(A.unfold(n => n < 5 ? [n, n + 1] : undefined, 1)).toEqual([1, 2, 3, 4]))
    it('xprod', () => expect(A.xprod([1, 2], ['a', 'b'])).toEqual([[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']]))
  })

  describe('arity 2 dual wrappers', () => {
    it('map data-first', () => expect(A.map([1, 2, 3], x => x * 2)).toEqual([2, 4, 6]))
    it('map data-last', () => expect(pipe([1, 2, 3], A.map(x => x * 2))).toEqual([2, 4, 6]))

    it('mapWithIndex data-first', () => expect(A.mapWithIndex([10, 20], (x, i) => x + i)).toEqual([10, 21]))
    it('mapWithIndex data-last', () => expect(pipe([10, 20], A.mapWithIndex((x, i) => x + i))).toEqual([10, 21]))

    it('filter data-first', () => expect(A.filter([1, 2, 3, 4], x => x % 2 === 0)).toEqual([2, 4]))
    it('filter data-last', () => expect(pipe([1, 2, 3, 4], A.filter(x => x % 2 === 0))).toEqual([2, 4]))

    it('filterWithIndex data-first', () => expect(A.filterWithIndex([1, 2, 3], (_, i) => i > 0)).toEqual([2, 3]))
    it('filterWithIndex data-last', () => expect(pipe([1, 2, 3], A.filterWithIndex((_, i) => i > 0))).toEqual([2, 3]))

    it('flatMap data-first', () => expect(A.flatMap([1, 2], x => [x, x])).toEqual([1, 1, 2, 2]))
    it('flatMap data-last', () => expect(pipe([1, 2], A.flatMap(x => [x, x]))).toEqual([1, 1, 2, 2]))

    it('find data-first', () => expect(A.find([1, 2, 3], x => x > 1)).toBe(2))
    it('find data-last', () => expect(pipe([1, 2, 3], A.find(x => x > 1))).toBe(2))

    it('findIndex data-first', () => expect(A.findIndex([1, 2, 3], x => x > 1)).toBe(1))
    it('findIndex data-last', () => expect(pipe([1, 2, 3], A.findIndex(x => x > 1))).toBe(1))

    it('every data-first', () => expect(A.every([2, 4, 6], x => x % 2 === 0)).toBe(true))
    it('every data-last', () => expect(pipe([2, 4, 6], A.every(x => x % 2 === 0))).toBe(true))

    it('some data-first', () => expect(A.some([1, 2, 3], x => x > 2)).toBe(true))
    it('some data-last', () => expect(pipe([1, 2, 3], A.some(x => x > 2))).toBe(true))

    it('includes data-first', () => expect(A.includes([1, 2, 3], 2)).toBe(true))
    it('includes data-last', () => expect(pipe([1, 2, 3], A.includes(2))).toBe(true))

    it('sortBy data-first', () => expect(A.sortBy([3, 1, 2], (a, b) => a - b)).toEqual([1, 2, 3]))
    it('sortBy data-last', () => expect(pipe([3, 1, 2], A.sortBy((a, b) => a - b))).toEqual([1, 2, 3]))

    it('uniqBy data-first', () => expect(A.uniqBy([1.1, 1.9, 2.1], Math.floor)).toEqual([1.1, 2.1]))
    it('uniqBy data-last', () => expect(pipe([1.1, 1.9, 2.1], A.uniqBy(Math.floor))).toEqual([1.1, 2.1]))

    it('take data-first', () => expect(A.take([1, 2, 3], 2)).toEqual([1, 2]))
    it('take data-last', () => expect(pipe([1, 2, 3], A.take(2))).toEqual([1, 2]))

    it('drop data-first', () => expect(A.drop([1, 2, 3], 1)).toEqual([2, 3]))
    it('drop data-last', () => expect(pipe([1, 2, 3], A.drop(1))).toEqual([2, 3]))

    it('takeWhile data-first', () => expect(A.takeWhile([1, 2, 3, 1], x => x < 3)).toEqual([1, 2]))
    it('takeWhile data-last', () => expect(pipe([1, 2, 3, 1], A.takeWhile(x => x < 3))).toEqual([1, 2]))

    it('dropWhile data-first', () => expect(A.dropWhile([1, 2, 3, 1], x => x < 3)).toEqual([3, 1]))
    it('dropWhile data-last', () => expect(pipe([1, 2, 3, 1], A.dropWhile(x => x < 3))).toEqual([3, 1]))

    it('chunk data-first', () => expect(A.chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]))
    it('chunk data-last', () => expect(pipe([1, 2, 3, 4, 5], A.chunk(2))).toEqual([[1, 2], [3, 4], [5]]))

    it('slidingWindow data-first', () => expect(A.slidingWindow([1, 2, 3, 4], 2)).toEqual([[1, 2], [2, 3], [3, 4]]))
    it('slidingWindow data-last', () => expect(pipe([1, 2, 3, 4], A.slidingWindow(2))).toEqual([[1, 2], [2, 3], [3, 4]]))

    it('intersperse data-first', () => expect(A.intersperse([1, 2, 3], 0)).toEqual([1, 0, 2, 0, 3]))
    it('intersperse data-last', () => expect(pipe([1, 2, 3], A.intersperse(0))).toEqual([1, 0, 2, 0, 3]))

    it('groupBy data-first', () => expect(A.groupBy(['one', 'two', 'three'], s => String(s.length))).toEqual({ '3': ['one', 'two'], '5': ['three'] }))
    it('groupBy data-last', () => expect(pipe(['one', 'two', 'three'], A.groupBy(s => String(s.length)))).toEqual({ '3': ['one', 'two'], '5': ['three'] }))

    it('partition data-first', () => expect(A.partition([1, 2, 3, 4], x => x % 2 === 0)).toEqual([[2, 4], [1, 3]]))
    it('partition data-last', () => expect(pipe([1, 2, 3, 4], A.partition(x => x % 2 === 0))).toEqual([[2, 4], [1, 3]]))

    it('aperture data-first', () => expect(A.aperture([1, 2, 3, 4], 2)).toEqual([[1, 2], [2, 3], [3, 4]]))
    it('aperture data-last', () => expect(pipe([1, 2, 3, 4], A.aperture(2))).toEqual([[1, 2], [2, 3], [3, 4]]))

    it('intersection data-first', () => expect(A.intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]))
    it('intersection data-last', () => expect(pipe([1, 2, 3], A.intersection([2, 3, 4]))).toEqual([2, 3]))

    it('union data-first', () => expect(A.union([1, 2], [2, 3])).toEqual([1, 2, 3]))
    it('union data-last', () => expect(pipe([1, 2], A.union([2, 3]))).toEqual([1, 2, 3]))

    it('difference data-first', () => expect(A.difference([1, 2, 3], [2, 3, 4])).toEqual([1]))
    it('difference data-last', () => expect(pipe([1, 2, 3], A.difference([2, 3, 4]))).toEqual([1]))

    it('symmetricDifference data-first', () => expect(A.symmetricDifference([1, 2, 3], [2, 3, 4])).toEqual([1, 4]))
    it('symmetricDifference data-last', () => expect(pipe([1, 2, 3], A.symmetricDifference([2, 3, 4]))).toEqual([1, 4]))
  })

  describe('forEach', () => {
    it('data-first', () => {
      const result: number[] = []
      A.forEach([1, 2, 3], x => result.push(x))
      expect(result).toEqual([1, 2, 3])
    })
    it('data-last', () => {
      const result: number[] = []
      pipe([1, 2, 3], A.forEach(x => result.push(x)))
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('forEachWithIndex', () => {
    it('data-first', () => {
      const result: [number, number][] = []
      A.forEachWithIndex([10, 20], (x, i) => result.push([x, i]))
      expect(result).toEqual([[10, 0], [20, 1]])
    })
  })

  describe('arity 3 dual wrappers', () => {
    it('reduce data-first', () => expect(A.reduce([1, 2, 3], (acc, x) => acc + x, 0)).toBe(6))
    it('reduce data-last', () => expect(pipe([1, 2, 3], A.reduce((acc: number, x: number) => acc + x, 0))).toBe(6))

    it('reduceRight data-first', () => expect(A.reduceRight(['a', 'b', 'c'], (acc, x) => acc + x, '')).toBe('cba'))
    it('reduceRight data-last', () => expect(pipe(['a', 'b', 'c'], A.reduceRight((acc: string, x: string) => acc + x, ''))).toBe('cba'))

    it('zip data-first', () => expect(A.zip([1, 2], ['a', 'b'])).toEqual([[1, 'a'], [2, 'b']]))
    it('zip data-last', () => expect(pipe([1, 2], A.zip(['a', 'b']))).toEqual([[1, 'a'], [2, 'b']]))

    it('zipWith data-first', () => expect(A.zipWith([1, 2], [10, 20], (a, b) => a + b)).toEqual([11, 22]))
    it('zipWith data-last', () => expect(pipe([1, 2], A.zipWith([10, 20], (a: number, b: number) => a + b))).toEqual([11, 22]))

    it('adjust data-first', () => expect(A.adjust([1, 2, 3], 1, x => x * 10)).toEqual([1, 20, 3]))
    it('adjust data-last', () => expect(pipe([1, 2, 3], A.adjust(1, (x: number) => x * 10))).toEqual([1, 20, 3]))

    it('update data-first', () => expect(A.update([1, 2, 3], 1, 99)).toEqual([1, 99, 3]))
    it('update data-last', () => expect(pipe([1, 2, 3], A.update(1, 99))).toEqual([1, 99, 3]))

    it('insert data-first', () => expect(A.insert([1, 3], 1, 2)).toEqual([1, 2, 3]))
    it('insert data-last', () => expect(pipe([1, 3], A.insert(1, 2))).toEqual([1, 2, 3]))

    it('remove data-first', () => expect(A.remove([1, 2, 3, 4], 1, 2)).toEqual([1, 4]))
    it('remove data-last', () => expect(pipe([1, 2, 3, 4], A.remove(1, 2))).toEqual([1, 4]))

    it('scan data-first', () => expect(A.scan([1, 2, 3], (acc, x) => acc + x, 0)).toEqual([0, 1, 3, 6]))
    it('scan data-last', () => expect(pipe([1, 2, 3], A.scan((acc: number, x: number) => acc + x, 0))).toEqual([0, 1, 3, 6]))
  })

  describe('pipe composition', () => {
    it('chains multiple array operations', () => {
      const result = pipe(
        [1, 2, 3, 4, 5, 6],
        A.filter(x => x % 2 === 0),
        A.map(x => x * 10),
        A.reduce((acc: number, x: number) => acc + x, 0),
      )
      expect(result).toBe(120)
    })
  })

  describe('arity 1 newly exposed', () => {
    it('dropRepeats', () => expect(A.dropRepeats([1, 1, 2, 2, 3, 1])).toEqual([1, 2, 3, 1]))
    it('only single', () => expect(A.only([42])).toBe(42))
    it('only multi', () => expect(A.only([1, 2])).toBeUndefined())
    it('mergeAll', () => expect(A.mergeAll([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 }))
    it('unnest', () => expect(A.unnest([[1, 2], [3]])).toEqual([1, 2, 3]))
  })

  describe('arity 2 newly exposed', () => {
    it('reject data-first', () => expect(A.reject([1, 2, 3, 4], x => x % 2 === 0)).toEqual([1, 3]))
    it('reject curried', () => expect(pipe([1, 2, 3, 4], A.reject(x => x % 2 === 0))).toEqual([1, 3]))

    it('none data-first', () => expect(A.none([1, 2, 3], x => x > 5)).toBe(true))
    it('none curried', () => expect(pipe([1, 2, 3], A.none(x => x > 5))).toBe(true))
    it('none false', () => expect(A.none([1, 2, 3], x => x > 2)).toBe(false))

    it('count data-first', () => expect(A.count([1, 2, 3, 4], x => x % 2 === 0)).toBe(2))
    it('count curried', () => expect(pipe([1, 2, 3, 4], A.count(x => x % 2 === 0))).toBe(2))

    it('append data-first', () => expect(A.append([1, 2], 3)).toEqual([1, 2, 3]))
    it('append curried', () => expect(pipe([1, 2], A.append(3))).toEqual([1, 2, 3]))

    it('prepend data-first', () => expect(A.prepend([2, 3], 1)).toEqual([1, 2, 3]))
    it('prepend curried', () => expect(pipe([2, 3], A.prepend(1))).toEqual([1, 2, 3]))

    it('concat data-first', () => expect(A.concat([1, 2], [3, 4])).toEqual([1, 2, 3, 4]))
    it('concat curried', () => expect(pipe([1, 2], A.concat([3, 4]))).toEqual([1, 2, 3, 4]))

    it('nth data-first', () => expect(A.nth([10, 20, 30], 1)).toBe(20))
    it('nth curried', () => expect(pipe([10, 20, 30], A.nth(1))).toBe(20))
    it('nth negative', () => expect(A.nth([10, 20, 30], -1)).toBe(30))

    it('indexOf data-first', () => expect(A.indexOf([10, 20, 30], 20)).toBe(1))
    it('indexOf curried', () => expect(pipe([10, 20, 30], A.indexOf(20))).toBe(1))
    it('indexOf missing', () => expect(A.indexOf([1, 2], 99)).toBeUndefined())

    it('lastIndexOf data-first', () => expect(A.lastIndexOf([1, 2, 1], 1)).toBe(2))
    it('lastIndexOf curried', () => expect(pipe([1, 2, 1], A.lastIndexOf(1))).toBe(2))
    it('lastIndexOf missing', () => expect(A.lastIndexOf([1, 2], 99)).toBeUndefined())

    it('findLast data-first', () => expect(A.findLast([1, 2, 3, 4], x => x % 2 === 0)).toBe(4))
    it('findLast curried', () => expect(pipe([1, 2, 3, 4], A.findLast(x => x % 2 === 0))).toBe(4))

    it('findLastIndex data-first', () => expect(A.findLastIndex([1, 2, 3, 2], x => x === 2)).toBe(3))
    it('findLastIndex curried', () => expect(pipe([1, 2, 3, 2], A.findLastIndex(x => x === 2))).toBe(3))

    it('without data-first', () => expect(A.without([1, 2, 3, 4], [2, 4])).toEqual([1, 3]))
    it('without curried', () => expect(pipe([1, 2, 3, 4], A.without([2, 4]))).toEqual([1, 3]))

    it('pluck data-first', () => expect(A.pluck([{ x: 1 }, { x: 2 }], 'x')).toEqual([1, 2]))
    it('pluck curried', () => expect(pipe([{ x: 1 }, { x: 2 }], A.pluck('x'))).toEqual([1, 2]))

    it('dropRepeatsBy data-first', () => expect(A.dropRepeatsBy([1.1, 1.9, 2.1, 2.8], Math.floor)).toEqual([1.1, 2.1]))
    it('dropRepeatsBy curried', () => expect(pipe([1.1, 1.9, 2.1, 2.8], A.dropRepeatsBy(Math.floor))).toEqual([1.1, 2.1]))

    it('dropRepeatsWith data-first', () => expect(A.dropRepeatsWith([1, 1, 2, 2, 3], (a, b) => a === b)).toEqual([1, 2, 3]))
    it('dropRepeatsWith curried', () => expect(pipe([1, 1, 2, 2, 3], A.dropRepeatsWith((a, b) => a === b))).toEqual([1, 2, 3]))

    it('dropLast data-first', () => expect(A.dropLast([1, 2, 3, 4], 2)).toEqual([1, 2]))
    it('dropLast curried', () => expect(pipe([1, 2, 3, 4], A.dropLast(2))).toEqual([1, 2]))

    it('dropLastWhile data-first', () => expect(A.dropLastWhile([1, 2, 3, 4], x => x > 2)).toEqual([1, 2]))
    it('dropLastWhile curried', () => expect(pipe([1, 2, 3, 4], A.dropLastWhile(x => x > 2))).toEqual([1, 2]))

    it('takeLast data-first', () => expect(A.takeLast([1, 2, 3, 4], 2)).toEqual([3, 4]))
    it('takeLast curried', () => expect(pipe([1, 2, 3, 4], A.takeLast(2))).toEqual([3, 4]))

    it('takeLastWhile data-first', () => expect(A.takeLastWhile([1, 2, 3, 4], x => x > 2)).toEqual([3, 4]))
    it('takeLastWhile curried', () => expect(pipe([1, 2, 3, 4], A.takeLastWhile(x => x > 2))).toEqual([3, 4]))

    it('splitAt data-first', () => expect(A.splitAt([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]))
    it('splitAt curried', () => expect(pipe([1, 2, 3, 4], A.splitAt(2))).toEqual([[1, 2], [3, 4]]))

    it('splitWhen data-first', () => expect(A.splitWhen([1, 2, 3, 4], x => x === 3)).toEqual([[1, 2], [3, 4]]))
    it('splitWhen curried', () => expect(pipe([1, 2, 3, 4], A.splitWhen(x => x === 3))).toEqual([[1, 2], [3, 4]]))

    it('splitWhenever data-first', () => expect(A.splitWhenever([1, 0, 2, 0, 3], x => x === 0)).toEqual([[1], [2], [3]]))
    it('splitWhenever curried', () => expect(pipe([1, 0, 2, 0, 3], A.splitWhenever(x => x === 0))).toEqual([[1], [2], [3]]))

    it('join data-first', () => expect(A.join(['a', 'b', 'c'], '-')).toBe('a-b-c'))
    it('join curried', () => expect(pipe(['a', 'b', 'c'], A.join('-'))).toBe('a-b-c'))

    it('uniqWith data-first', () => expect(A.uniqWith([1, -1, 2, -2], (a, b) => Math.abs(a) === Math.abs(b))).toEqual([1, 2]))
    it('uniqWith curried', () => expect(pipe([1, -1, 2, -2], A.uniqWith((a, b) => Math.abs(a) === Math.abs(b)))).toEqual([1, 2]))

    it('groupWith data-first', () => expect(A.groupWith([1, 1, 2, 2, 3], (a, b) => a === b)).toEqual([[1, 1], [2, 2], [3]]))
    it('groupWith curried', () => expect(pipe([1, 1, 2, 2, 3], A.groupWith((a, b) => a === b))).toEqual([[1, 1], [2, 2], [3]]))

    it('indexBy data-first', () => expect(A.indexBy([{ id: 'a', v: 1 }, { id: 'b', v: 2 }], x => x.id)).toEqual({ a: { id: 'a', v: 1 }, b: { id: 'b', v: 2 } }))
    it('indexBy curried', () => expect(pipe([{ id: 'a', v: 1 }], A.indexBy(x => x.id))).toEqual({ a: { id: 'a', v: 1 } }))

    it('collectBy data-first', () => expect(A.collectBy([1, 2, 3, 4], x => x % 2 === 0 ? 'even' : 'odd')).toEqual([[1, 3], [2, 4]]))
    it('collectBy curried', () => expect(pipe([1, 2, 3], A.collectBy(x => x % 2 === 0 ? 'even' : 'odd'))).toEqual([[1, 3], [2]]))

    it('sample returns correct length', () => expect(A.sample([1, 2, 3, 4, 5], 3).length).toBe(3))
    it('sample curried', () => expect(pipe([1, 2, 3, 4, 5], A.sample(2)).length).toBe(2))

    it('hasAtLeast data-first', () => expect(A.hasAtLeast([1, 2, 3], 2)).toBe(true))
    it('hasAtLeast curried', () => expect(pipe([1, 2, 3], A.hasAtLeast(5))).toBe(false))

    it('meanBy data-first', () => expect(A.meanBy([{ v: 2 }, { v: 4 }], x => x.v)).toBe(3))
    it('meanBy curried', () => expect(pipe([{ v: 10 }, { v: 20 }], A.meanBy(x => x.v))).toBe(15))

    it('sumBy data-first', () => expect(A.sumBy([{ v: 1 }, { v: 2 }, { v: 3 }], x => x.v)).toBe(6))
    it('sumBy curried', () => expect(pipe([{ v: 10 }, { v: 20 }], A.sumBy(x => x.v))).toBe(30))

    it('mapToObj data-first', () => expect(A.mapToObj([1, 2], x => [String(x), x * 10])).toEqual({ '1': 10, '2': 20 }))
    it('mapToObj curried', () => expect(pipe([1, 2], A.mapToObj(x => [String(x), x * 10]))).toEqual({ '1': 10, '2': 20 }))

    it('zipObj data-first', () => expect(A.zipObj(['a', 'b'], [1, 2])).toEqual({ a: 1, b: 2 }))
    it('zipObj curried', () => expect(pipe(['a', 'b'], A.zipObj([1, 2]))).toEqual({ a: 1, b: 2 }))

    it('groupByProp data-first', () => expect(A.groupByProp([{ t: 'a', v: 1 }, { t: 'b', v: 2 }, { t: 'a', v: 3 }], 't')).toEqual({ a: [{ t: 'a', v: 1 }, { t: 'a', v: 3 }], b: [{ t: 'b', v: 2 }] }))
    it('groupByProp curried', () => expect(pipe([{ t: 'x' }], A.groupByProp('t'))).toEqual({ x: [{ t: 'x' }] }))

    it('arrayStartsWith data-first', () => expect(A.arrayStartsWith([1, 2, 3], [1, 2])).toBe(true))
    it('arrayStartsWith curried', () => expect(pipe([1, 2, 3], A.arrayStartsWith([1, 2]))).toBe(true))
    it('arrayStartsWith false', () => expect(A.arrayStartsWith([1, 2, 3], [2, 3])).toBe(false))

    it('arrayEndsWith data-first', () => expect(A.arrayEndsWith([1, 2, 3], [2, 3])).toBe(true))
    it('arrayEndsWith curried', () => expect(pipe([1, 2, 3], A.arrayEndsWith([2, 3]))).toBe(true))
    it('arrayEndsWith false', () => expect(A.arrayEndsWith([1, 2, 3], [1, 2])).toBe(false))

    it('sortedIndexWith data-first', () => expect(A.sortedIndexWith([1, 3, 5, 7], x => x >= 4)).toBe(2))
    it('sortedIndexWith curried', () => expect(pipe([1, 3, 5, 7], A.sortedIndexWith(x => x >= 6))).toBe(3))
  })

  describe('non-dual standalone', () => {
    it('sortedIndex', () => expect(A.sortedIndex([1, 3, 5, 7], 4)).toBe(2))
    it('sortedLastIndex', () => expect(A.sortedLastIndex([1, 3, 3, 5], 3)).toBe(3))
    it('pair', () => expect(A.pair('a', 1)).toEqual(['a', 1]))
  })

  describe('arity 3 newly exposed', () => {
    it('withoutBy data-first', () => expect(A.withoutBy([{ id: 1 }, { id: 2 }, { id: 3 }], [{ id: 2 }], x => String(x.id))).toEqual([{ id: 1 }, { id: 3 }]))
    it('withoutBy curried', () => expect(pipe([{ id: 1 }, { id: 2 }], A.withoutBy([{ id: 1 }], x => String(x.id)))).toEqual([{ id: 2 }]))

    it('slice data-first', () => expect(A.slice([1, 2, 3, 4, 5], 1, 4)).toEqual([2, 3, 4]))
    it('slice curried', () => expect(pipe([1, 2, 3, 4, 5], A.slice(1, 4))).toEqual([2, 3, 4]))

    it('swap data-first', () => expect(A.swap([1, 2, 3], 0, 2)).toEqual([3, 2, 1]))
    it('swap curried', () => expect(pipe([1, 2, 3], A.swap(0, 2))).toEqual([3, 2, 1]))

    it('insertAll data-first', () => expect(A.insertAll([1, 4], 1, [2, 3])).toEqual([1, 2, 3, 4]))
    it('insertAll curried', () => expect(pipe([1, 4], A.insertAll(1, [2, 3]))).toEqual([1, 2, 3, 4]))

    it('unionBy data-first', () => expect(A.unionBy([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], x => String(x.id))).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]))
    it('unionBy curried', () => expect(pipe([{ id: 1 }], A.unionBy([{ id: 1 }, { id: 2 }], x => String(x.id)))).toEqual([{ id: 1 }, { id: 2 }]))

    it('unionWith data-first', () => expect(A.unionWith([1, 2], [2, 3], (a, b) => a === b)).toEqual([1, 2, 3]))
    it('unionWith curried', () => expect(pipe([1, 2], A.unionWith([2, 3], (a, b) => a === b))).toEqual([1, 2, 3]))

    it('intersectionBy data-first', () => expect(A.intersectionBy([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], x => String(x.id))).toEqual([{ id: 2 }]))
    it('intersectionBy curried', () => expect(pipe([{ id: 1 }, { id: 2 }], A.intersectionBy([{ id: 2 }], x => String(x.id)))).toEqual([{ id: 2 }]))

    it('differenceBy data-first', () => expect(A.differenceBy([{ id: 1 }, { id: 2 }], [{ id: 2 }], x => String(x.id))).toEqual([{ id: 1 }]))
    it('differenceBy curried', () => expect(pipe([{ id: 1 }, { id: 2 }], A.differenceBy([{ id: 2 }], x => String(x.id)))).toEqual([{ id: 1 }]))

    it('differenceWith data-first', () => expect(A.differenceWith([1, 2, 3], [2, 4], (a, b) => a === b)).toEqual([1, 3]))
    it('differenceWith curried', () => expect(pipe([1, 2, 3], A.differenceWith([2, 4], (a, b) => a === b))).toEqual([1, 3]))

    it('symmetricDifferenceBy data-first', () => expect(A.symmetricDifferenceBy([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], x => String(x.id))).toEqual([{ id: 1 }, { id: 3 }]))
    it('symmetricDifferenceBy curried', () => expect(pipe([{ id: 1 }, { id: 2 }], A.symmetricDifferenceBy([{ id: 2 }, { id: 3 }], x => String(x.id)))).toEqual([{ id: 1 }, { id: 3 }]))

    it('symmetricDifferenceWith data-first', () => expect(A.symmetricDifferenceWith([1, 2], [2, 3], (a, b) => a === b)).toEqual([1, 3]))
    it('symmetricDifferenceWith curried', () => expect(pipe([1, 2], A.symmetricDifferenceWith([2, 3], (a, b) => a === b))).toEqual([1, 3]))

    it('sortedIndexBy data-first', () => expect(A.sortedIndexBy([{ v: 1 }, { v: 3 }, { v: 5 }], { v: 4 }, x => x.v)).toBe(2))
    it('sortedIndexBy curried', () => expect(pipe([{ v: 1 }, { v: 3 }, { v: 5 }], A.sortedIndexBy({ v: 4 }, x => x.v))).toBe(2))

    it('sortedLastIndexBy data-first', () => expect(A.sortedLastIndexBy([{ v: 1 }, { v: 3 }, { v: 3 }, { v: 5 }], { v: 3 }, x => x.v)).toBe(3))
    it('sortedLastIndexBy curried', () => expect(pipe([{ v: 1 }, { v: 3 }, { v: 3 }, { v: 5 }], A.sortedLastIndexBy({ v: 3 }, x => x.v))).toBe(3))

    it('mapAccum data-first', () => expect(A.mapAccum([1, 2, 3], (acc, x) => [acc + x, x * 2], 0)).toEqual([6, [2, 4, 6]]))
    it('mapAccum curried', () => expect(pipe([1, 2, 3], A.mapAccum((acc: number, x: number) => [acc + x, x * 2], 0))).toEqual([6, [2, 4, 6]]))

    it('mapAccumRight data-first', () => expect(A.mapAccumRight([1, 2, 3], (acc, x) => [acc + x, x * 2], 0)).toEqual([6, [2, 4, 6]]))
    it('mapAccumRight curried', () => expect(pipe([1, 2, 3], A.mapAccumRight((acc: number, x: number) => [acc + x, x * 2], 0))).toEqual([6, [2, 4, 6]]))
  })

  describe('arity 4 newly exposed', () => {
    it('reduceBy data-first', () => expect(A.reduceBy(['a', 'bb', 'ccc', 'dd'], x => String(x.length), (acc, x) => acc + ',' + x, '')).toEqual({ '1': ',a', '2': ',bb,dd', '3': ',ccc' }))
    it('reduceBy curried', () => expect(pipe(['a', 'bb'], A.reduceBy(x => String(x.length), (acc: string, x: string) => acc + x, ''))).toEqual({ '1': 'a', '2': 'bb' }))

    it('reduceWhile data-first', () => expect(A.reduceWhile([1, 2, 3, 4, 5], (acc, _x) => acc < 6, (acc, x) => acc + x, 0)).toBe(6))
    it('reduceWhile curried', () => expect(pipe([1, 2, 3, 4, 5], A.reduceWhile((acc: number, _x: number) => acc < 6, (acc: number, x: number) => acc + x, 0))).toBe(6))

    it('splice data-first', () => expect(A.splice([1, 2, 3, 4, 5], 1, 2, [10, 20])).toEqual([1, 10, 20, 4, 5]))
    it('splice curried', () => expect(pipe([1, 2, 3, 4, 5], A.splice(1, 2, [10, 20]))).toEqual([1, 10, 20, 4, 5]))
  })
})
