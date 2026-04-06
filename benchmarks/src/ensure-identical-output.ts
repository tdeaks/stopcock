import { describe, it, expect } from 'vitest'
import { pipe, A, S, D, N, Obj } from '@stopcock/fp'
import * as R from 'remeda'
import * as _ from 'lodash-es'
import * as Ra from 'ramda'
import * as Rb from 'rambda'
import { A as TB, pipe as tbPipe } from '@mobily/ts-belt'

const nums = [5, 3, 8, 1, 9, 2, 7, 4, 6, 10]
const pred = (x: number) => x > 4
const dbl = (x: number) => x * 2
const cmp = (a: number, b: number) => a - b
const add = (acc: number, x: number) => acc + x

describe('correctness: all libraries produce identical output', () => {
  it('map', () => {
    const expected = nums.map(dbl)
    expect(A.map(nums, dbl)).toEqual(expected)
    expect(TB.map(nums, dbl)).toEqual(expected)
    expect(R.map(nums, dbl)).toEqual(expected)
    expect(Rb.map(dbl)(nums)).toEqual(expected)
    expect(Ra.map(dbl, nums)).toEqual(expected)
    expect(_.map(nums, dbl)).toEqual(expected)
  })

  it('filter', () => {
    const expected = nums.filter(pred)
    expect(A.filter(nums, pred)).toEqual(expected)
    expect(TB.filter(nums, pred)).toEqual(expected)
    expect(R.filter(nums, pred)).toEqual(expected)
    expect(Rb.filter(pred)(nums)).toEqual(expected)
    expect(Ra.filter(pred, nums)).toEqual(expected)
    expect(_.filter(nums, pred)).toEqual(expected)
  })

  it('sort', () => {
    const expected = [...nums].sort(cmp)
    expect(A.sortBy(nums, cmp)).toEqual(expected)
    expect(TB.sort(nums, cmp)).toEqual(expected)
    expect(R.sort(nums, cmp)).toEqual(expected)
    expect(Ra.sort(cmp, nums)).toEqual(expected)
  })

  it('uniq', () => {
    const input = [1, 2, 2, 3, 3, 3]
    const expected = [1, 2, 3]
    expect(A.uniq(input)).toEqual(expected)
    expect(TB.uniq(input)).toEqual(expected)
    expect(R.unique(input)).toEqual(expected)
    expect(Rb.uniq(input)).toEqual(expected)
    expect(Ra.uniq(input)).toEqual(expected)
    expect(_.uniq(input)).toEqual(expected)
  })

  it('take', () => {
    const expected = nums.slice(0, 3)
    expect(A.take(nums, 3)).toEqual(expected)
    expect(TB.take(nums, 3)).toEqual(expected)
    expect(R.take(nums, 3)).toEqual(expected)
    expect(Rb.take(3)(nums)).toEqual(expected)
    expect(Ra.take(3, nums)).toEqual(expected)
    expect(_.take(nums, 3)).toEqual(expected)
  })

  it('drop', () => {
    const expected = nums.slice(3)
    expect(A.drop(nums, 3)).toEqual(expected)
    expect(TB.drop(nums, 3)).toEqual(expected)
    expect(R.drop(nums, 3)).toEqual(expected)
    expect(Rb.drop(3)(nums)).toEqual(expected)
    expect(Ra.drop(3, nums)).toEqual(expected)
    expect(_.drop(nums, 3)).toEqual(expected)
  })

  it('reduce', () => {
    const expected = nums.reduce(add, 0)
    expect(A.reduce(nums, add, 0)).toBe(expected)
    expect(TB.reduce(nums, 0, add)).toBe(expected)
    expect(R.reduce(nums, add, 0)).toBe(expected)
    expect(Rb.reduce(add, 0)(nums)).toBe(expected)
    expect(Ra.reduce(add, 0, nums)).toBe(expected)
    expect(_.reduce(nums, add, 0)).toBe(expected)
  })

  it('find', () => {
    const expected = nums.find(pred)
    expect(A.find(nums, pred)).toBe(expected)
    expect(TB.getBy(nums, pred)).toBe(expected)
    expect(R.find(nums, pred)).toBe(expected)
    expect(Rb.find(pred)(nums)).toBe(expected)
    expect(Ra.find(pred, nums)).toBe(expected)
    expect(_.find(nums, pred)).toBe(expected)
  })

  it('findIndex', () => {
    const idx = nums.findIndex(pred)
    expect(A.findIndex(nums, pred)).toBe(idx)
    expect(Rb.findIndex(pred)(nums)).toBe(idx)
    expect(Ra.findIndex(pred, nums)).toBe(idx)
    expect(_.findIndex(nums, pred)).toBe(idx)
  })

  it('every', () => {
    const allPos = (x: number) => x > 0
    expect(A.every(nums, allPos)).toBe(true)
    expect(TB.every(nums, allPos)).toBe(true)
    expect(Rb.all(allPos)(nums)).toBe(true)
    expect(Ra.all(allPos, nums)).toBe(true)
    expect(_.every(nums, allPos)).toBe(true)
  })

  it('some', () => {
    expect(A.some(nums, pred)).toBe(true)
    expect(TB.some(nums, pred)).toBe(true)
    expect(Rb.any(pred)(nums)).toBe(true)
    expect(Ra.any(pred, nums)).toBe(true)
    expect(_.some(nums, pred)).toBe(true)
  })

  it('reverse', () => {
    const expected = [...nums].reverse()
    expect(A.reverse(nums)).toEqual(expected)
    expect(TB.reverse(nums)).toEqual(expected)
    expect(R.reverse(nums)).toEqual(expected)
    expect(Ra.reverse(nums)).toEqual(expected)
  })

  it('flatten', () => {
    const input = [[1, 2], [3], [4, 5]]
    const expected = [1, 2, 3, 4, 5]
    expect(A.flatten(input)).toEqual(expected)
    expect(TB.flat(input)).toEqual(expected)
    expect(R.flat(input)).toEqual(expected)
    expect(Rb.flatten(input)).toEqual(expected)
    expect(Ra.flatten(input)).toEqual(expected)
    expect(_.flatten(input)).toEqual(expected)
  })

  it('flatMap', () => {
    const f = (x: number) => [x, x * 2]
    const expected = nums.flatMap(f)
    expect(A.flatMap(nums, f)).toEqual(expected)
    expect(Ra.chain(f, nums)).toEqual(expected)
    expect(_.flatMap(nums, f)).toEqual(expected)
  })

  it('head', () => {
    expect(A.head(nums)).toBe(5)
    expect(TB.head(nums)).toBe(5)
    expect(Rb.head(nums)).toBe(5)
    expect(Ra.head(nums)).toBe(5)
    expect(_.head(nums)).toBe(5)
  })

  it('last', () => {
    expect(A.last(nums)).toBe(10)
    expect(TB.last(nums)).toBe(10)
    expect(Rb.last(nums)).toBe(10)
    expect(Ra.last(nums)).toBe(10)
    expect(_.last(nums)).toBe(10)
  })

  it('tail', () => {
    const expected = nums.slice(1)
    expect(A.tail(nums)).toEqual(expected)
    expect(TB.tail(nums)).toEqual(expected)
    expect(Rb.tail(nums)).toEqual(expected)
    expect(Ra.tail(nums)).toEqual(expected)
    expect(_.tail(nums)).toEqual(expected)
  })

  it('init', () => {
    const expected = nums.slice(0, -1)
    expect(A.init(nums)).toEqual(expected)
    expect(Ra.init(nums)).toEqual(expected)
    expect(_.initial(nums)).toEqual(expected)
  })

  it('includes', () => {
    expect(A.includes(nums, 8)).toBe(true)
    expect(A.includes(nums, 99)).toBe(false)
    expect(Ra.includes(8, nums)).toBe(true)
    expect(_.includes(nums, 8)).toBe(true)
  })

  it('forEach', () => {
    const nmOut: number[] = [], raOut: number[] = [], ldOut: number[] = []
    A.forEach(nums, x => nmOut.push(x))
    Ra.forEach(x => raOut.push(x), nums)
    _.forEach(nums, x => ldOut.push(x))
    expect(nmOut).toEqual(nums)
    expect(raOut).toEqual(nums)
    expect(ldOut).toEqual(nums)
  })

  it('intersection', () => {
    const a = [1, 2, 3, 4, 5], b = [3, 4, 5, 6, 7]
    const expected = [3, 4, 5]
    expect(A.intersection(a, b)).toEqual(expected)
    expect(Rb.intersection(a)(b)).toEqual(expected)
    expect(Ra.intersection(a, b)).toEqual(expected)
    expect(_.intersection(a, b)).toEqual(expected)
  })

  it('difference', () => {
    const a = [1, 2, 3, 4, 5], b = [3, 4, 5, 6, 7]
    const expected = [1, 2]
    expect(A.difference(a, b)).toEqual(expected)
    expect(Ra.difference(a, b)).toEqual(expected)
    expect(_.difference(a, b)).toEqual(expected)
  })

  it('union', () => {
    const a = [1, 2, 3, 4, 5], b = [3, 4, 5, 6, 7]
    const expected = [1, 2, 3, 4, 5, 6, 7]
    expect(A.union(a, b)).toEqual(expected)
    expect(Ra.union(a, b)).toEqual(expected)
    expect(_.union(a, b)).toEqual(expected)
  })

  it('symmetricDifference', () => {
    const a = [1, 2, 3, 4, 5], b = [3, 4, 5, 6, 7]
    const expected = [1, 2, 6, 7]
    expect(A.symmetricDifference(a, b)).toEqual(expected)
    expect(_.xor(a, b)).toEqual(expected)
  })

  it('zip', () => {
    const a = [1, 2, 3], b = ['a', 'b', 'c']
    const expected = [[1, 'a'], [2, 'b'], [3, 'c']]
    expect(A.zip(a, b)).toEqual(expected)
    expect(R.zip(a, b)).toEqual(expected)
    expect(Rb.zip(a)(b)).toEqual(expected)
  })

  it('partition', () => {
    const [pass, fail] = A.partition(nums, pred)
    expect(pass).toEqual(nums.filter(pred))
    expect(fail).toEqual(nums.filter(x => !pred(x)))
  })

  it('chunk', () => {
    const expected = [[5, 3, 8], [1, 9, 2], [7, 4, 6], [10]]
    expect(A.chunk(nums, 3)).toEqual(expected)
    expect(_.chunk(nums, 3)).toEqual(expected)
  })

  it('takeWhile', () => {
    const input = [2, 4, 6, 1, 3, 5]
    const p = (x: number) => x % 2 === 0
    const expected = [2, 4, 6]
    expect(A.takeWhile(input, p)).toEqual(expected)
    expect(Rb.takeWhile(p)(input)).toEqual(expected)
    expect(Ra.takeWhile(p, input)).toEqual(expected)
    expect(_.takeWhile(input, p)).toEqual(expected)
  })

  it('dropWhile', () => {
    const input = [2, 4, 6, 1, 3, 5]
    const p = (x: number) => x % 2 === 0
    const expected = [1, 3, 5]
    expect(A.dropWhile(input, p)).toEqual(expected)
    expect(Rb.dropWhile(p)(input)).toEqual(expected)
    expect(Ra.dropWhile(p, input)).toEqual(expected)
    expect(_.dropWhile(input, p)).toEqual(expected)
  })

  it('groupBy', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const f = (x: number) => x % 2 === 0 ? 'even' : 'odd'
    const expected = { odd: [1, 3, 5], even: [2, 4, 6] }
    expect(A.groupBy(input, f)).toEqual(expected)
    expect(Rb.groupBy(f)(input)).toEqual(expected)
    expect(Ra.groupBy(f, input)).toEqual(expected)
    expect(_.groupBy(input, f)).toEqual(expected)
  })

  it('join', () => {
    expect(A.join(['a', 'b', 'c'], ',')).toBe('a,b,c')
    expect(Rb.join(',')(['a', 'b', 'c'])).toBe('a,b,c')
    expect(Ra.join(',', ['a', 'b', 'c'])).toBe('a,b,c')
    expect(_.join(['a', 'b', 'c'], ',')).toBe('a,b,c')
  })

  it('reject', () => {
    const expected = nums.filter(x => !pred(x))
    expect(A.reject(nums, pred)).toEqual(expected)
    expect(Rb.reject(pred)(nums)).toEqual(expected)
    expect(Ra.reject(pred, nums)).toEqual(expected)
    expect(_.reject(nums, pred)).toEqual(expected)
  })

  it('uniqBy', () => {
    const input = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 1, n: 'c' }]
    const f = (x: any) => x.id
    const result = A.uniqBy(input, f)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 1, n: 'a' })
    expect(result[1]).toEqual({ id: 2, n: 'b' })
  })

  // Dict operations
  it('D.keys', () => {
    const d = { a: 1, b: 2, c: 3 }
    expect(D.keys(d).sort()).toEqual(['a', 'b', 'c'])
  })

  it('D.values', () => {
    const d = { a: 1, b: 2, c: 3 }
    expect(D.values(d).sort()).toEqual([1, 2, 3])
  })

  it('D.fromEntries', () => {
    const entries: [string, number][] = [['a', 1], ['b', 2]]
    expect(D.fromEntries(entries)).toEqual({ a: 1, b: 2 })
    expect(Ra.fromPairs(entries)).toEqual({ a: 1, b: 2 })
  })

  it('D.toEntries', () => {
    const d = { a: 1, b: 2 }
    const result = D.toEntries(d).sort((a, b) => a[0].localeCompare(b[0]))
    expect(result).toEqual([['a', 1], ['b', 2]])
  })

  it('D.merge', () => {
    expect(D.merge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
    expect(D.merge({ a: 1 }, { a: 2 })).toEqual({ a: 2 })
  })

  // Object operations
  it('Obj.pick', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(Obj.pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
    expect(Ra.pick(['a', 'c'], obj)).toEqual({ a: 1, c: 3 })
    expect(_.pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })

  it('Obj.omit', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(Obj.omit(obj, ['b'])).toEqual({ a: 1, c: 3 })
    expect(Ra.omit(['b'], obj)).toEqual({ a: 1, c: 3 })
    expect(_.omit(obj, ['b'])).toEqual({ a: 1, c: 3 })
  })

  it('Obj.path', () => {
    const obj = { user: { address: { city: 'London' } } }
    expect(Obj.path(obj, 'user.address.city')).toBe('London')
    expect(Obj.path(obj, 'user.nope.city')).toBeUndefined()
  })

  // Pipe fusion
  it('pipe: filter→map→take', () => {
    const expected = nums.filter(pred).map(dbl).slice(0, 3)
    expect(pipe(nums, A.filter(pred), A.map(dbl), A.take(3))).toEqual(expected)
    expect(tbPipe(nums, TB.filter(pred), TB.map(dbl), TB.take(3))).toEqual(expected)
    expect(R.pipe(nums, R.filter(pred), R.map(dbl), R.take(3))).toEqual(expected)
  })

  it('pipe: map→map→map', () => {
    const inc = (x: number) => x + 1
    const expected = nums.map(dbl).map(inc).map(dbl)
    expect(pipe(nums, A.map(dbl), A.map(inc), A.map(dbl))).toEqual(expected)
  })

  it('pipe: filter→reduce', () => {
    const expected = nums.filter(pred).reduce(add, 0)
    expect(pipe(nums, A.filter(pred), A.reduce(add, 0))).toBe(expected)
  })

  it('pipe: filter→map→flatMap', () => {
    const expand = (x: number) => [x, x + 1]
    const expected = nums.filter(pred).map(dbl).flatMap(expand)
    expect(pipe(nums, A.filter(pred), A.map(dbl), A.flatMap(expand))).toEqual(expected)
  })
})
