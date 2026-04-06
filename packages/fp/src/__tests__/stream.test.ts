import { describe, it, expect, vi } from 'vitest'
import { pipe } from '@stopcock/fp'
import * as Stream from '../stream'
import { distinctN } from '../stream'

describe('creators', () => {
  it('from wraps an iterable', () => {
    expect(Stream.toArray(Stream.from([1, 2, 3]))).toEqual([1, 2, 3])
  })

  it('range produces half-open interval', () => {
    expect(Stream.toArray(Stream.range(0, 5))).toEqual([0, 1, 2, 3, 4])
  })

  it('iterate produces infinite sequence', () => {
    const doubles = pipe(Stream.iterate(x => x * 2, 1), Stream.take(5), Stream.toArray)
    expect(doubles).toEqual([1, 2, 4, 8, 16])
  })

  it('repeat produces infinite constant stream', () => {
    expect(pipe(Stream.repeat('x'), Stream.take(3), Stream.toArray)).toEqual(['x', 'x', 'x'])
  })

  it('empty yields nothing', () => {
    expect(Stream.toArray(Stream.empty())).toEqual([])
  })
})

describe('laziness', () => {
  it('transformers do not execute until terminal is called', () => {
    const spy = vi.fn((x: number) => x * 2)
    const s = pipe(Stream.from([1, 2, 3]), Stream.map(spy))
    expect(spy).not.toHaveBeenCalled()
    Stream.toArray(s)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('take short-circuits an infinite stream', () => {
    const spy = vi.fn((x: number) => x + 1)
    const s = pipe(Stream.iterate(spy, 0), Stream.take(3))
    const result = Stream.toArray(s)
    expect(result).toEqual([0, 1, 2])
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('transformers', () => {
  it('map', () => {
    expect(pipe(Stream.from([1, 2, 3]), Stream.map(x => x * 10), Stream.toArray)).toEqual([10, 20, 30])
  })

  it('filter', () => {
    expect(pipe(Stream.from([1, 2, 3, 4]), Stream.filter(x => x % 2 === 0), Stream.toArray)).toEqual([2, 4])
  })

  it('flatMap', () => {
    const result = pipe(
      Stream.from([1, 2, 3]),
      Stream.flatMap(x => Stream.from([x, x * 10])),
      Stream.toArray,
    )
    expect(result).toEqual([1, 10, 2, 20, 3, 30])
  })

  it('take', () => {
    expect(pipe(Stream.range(0, 100), Stream.take(3), Stream.toArray)).toEqual([0, 1, 2])
  })

  it('drop', () => {
    expect(pipe(Stream.from([1, 2, 3, 4, 5]), Stream.drop(2), Stream.toArray)).toEqual([3, 4, 5])
  })

  it('takeWhile', () => {
    expect(pipe(Stream.from([1, 2, 3, 4, 1]), Stream.takeWhile(x => x < 3), Stream.toArray)).toEqual([1, 2])
  })

  it('dropWhile', () => {
    expect(pipe(Stream.from([1, 2, 3, 2, 1]), Stream.dropWhile(x => x < 3), Stream.toArray)).toEqual([3, 2, 1])
  })

  it('chunk', () => {
    expect(pipe(Stream.range(0, 7), Stream.chunk(3), Stream.toArray)).toEqual([[0, 1, 2], [3, 4, 5], [6]])
  })

  it('scan', () => {
    expect(pipe(Stream.from([1, 2, 3]), Stream.scan((a: number, b: number) => a + b, 0), Stream.toArray)).toEqual([1, 3, 6])
  })

  it('zip', () => {
    const result = pipe(Stream.from([1, 2, 3]), Stream.zip(Stream.from(['a', 'b'])), Stream.toArray)
    expect(result).toEqual([[1, 'a'], [2, 'b']])
  })

  it('concat', () => {
    const result = pipe(Stream.from([1, 2]), Stream.concat(Stream.from([3, 4])), Stream.toArray)
    expect(result).toEqual([1, 2, 3, 4])
  })

  it('distinct', () => {
    expect(Stream.toArray(Stream.distinct(Stream.from([1, 2, 2, 3, 1, 3])))).toEqual([1, 2, 3])
  })

  it('intersperse', () => {
    expect(pipe(Stream.from([1, 2, 3]), Stream.intersperse(0), Stream.toArray)).toEqual([1, 0, 2, 0, 3])
  })
})

describe('terminals', () => {
  it('reduce', () => {
    expect(pipe(Stream.from([1, 2, 3, 4]), Stream.reduce((a: number, b: number) => a + b, 0))).toBe(10)
  })

  it('first', () => {
    expect(Stream.first(Stream.from([5, 6, 7]))).toBe(5)
    expect(Stream.first(Stream.empty())).toBeUndefined()
  })

  it('last', () => {
    expect(Stream.last(Stream.from([5, 6, 7]))).toBe(7)
    expect(Stream.last(Stream.empty())).toBeUndefined()
  })

  it('count', () => {
    expect(Stream.count(Stream.from([1, 2, 3]))).toBe(3)
  })

  it('every', () => {
    expect(pipe(Stream.from([2, 4, 6]), Stream.every(x => x % 2 === 0))).toBe(true)
    expect(pipe(Stream.from([2, 3, 6]), Stream.every(x => x % 2 === 0))).toBe(false)
  })

  it('some', () => {
    expect(pipe(Stream.from([1, 3, 5]), Stream.some(x => x % 2 === 0))).toBe(false)
    expect(pipe(Stream.from([1, 2, 5]), Stream.some(x => x % 2 === 0))).toBe(true)
  })

  it('find', () => {
    expect(pipe(Stream.from([1, 2, 3, 4]), Stream.find(x => x > 2))).toBe(3)
    expect(pipe(Stream.from([1, 2]), Stream.find(x => x > 5))).toBeUndefined()
  })

  it('forEach', () => {
    const items: number[] = []
    pipe(Stream.from([1, 2, 3]), Stream.forEach(x => items.push(x)))
    expect(items).toEqual([1, 2, 3])
  })

  it('collect is an alias for toArray', () => {
    expect(Stream.collect(Stream.from([1, 2]))).toEqual([1, 2])
  })
})

describe('data-first usage', () => {
  it('map data-first', () => {
    expect(Stream.toArray(Stream.map(Stream.from([1, 2]), x => x + 1))).toEqual([2, 3])
  })

  it('filter data-first', () => {
    expect(Stream.toArray(Stream.filter(Stream.from([1, 2, 3, 4]), x => x > 2))).toEqual([3, 4])
  })

  it('reduce data-first', () => {
    expect(Stream.reduce(Stream.from([1, 2, 3]), (a: number, b: number) => a + b, 0)).toBe(6)
  })
})

describe('distinct with infinite streams', () => {
  it('distinct + take on infinite repeat works', () => {
    const result = pipe(Stream.repeat(42), Stream.distinct, Stream.take(1), Stream.toArray)
    expect(result).toEqual([42])
  })

  it('distinct on cycling values with take', () => {
    const cycling = Stream.from(function* () { while (true) { yield 1; yield 2; yield 3 } }())
    const result = pipe(cycling, Stream.distinct, Stream.take(3), Stream.toArray)
    expect(result).toEqual([1, 2, 3])
  })
})

describe('distinctN', () => {
  it('clears set after reaching cap', () => {
    // With maxSize=2: {1,2} full, then 3 triggers clear -> yields 3, then 1 triggers clear -> yields 1...
    const result = pipe(
      Stream.from([1, 2, 3, 1, 2, 3]),
      distinctN(2),
      Stream.toArray,
    )
    // 1: not seen, size(0)<2, add -> yield 1. seen={1}
    // 2: not seen, size(1)<2, add -> yield 2. seen={1,2}
    // 3: not seen, size(2)>=2, clear, add -> yield 3. seen={3}
    // 1: not seen, size(1)<2, add -> yield 1. seen={3,1}
    // 2: not seen, size(2)>=2, clear, add -> yield 2. seen={2}
    // 3: not seen, size(1)<2, add -> yield 3. seen={2,3}
    expect(result).toEqual([1, 2, 3, 1, 2, 3])
  })

  it('acts like distinct when maxSize is large', () => {
    const result = pipe(
      Stream.from([1, 2, 2, 3, 1]),
      distinctN(100),
      Stream.toArray,
    )
    expect(result).toEqual([1, 2, 3])
  })

  it('works as data-last', () => {
    const result = pipe(
      Stream.from([1, 1, 2, 2, 3]),
      Stream.distinctN(50),
      Stream.toArray,
    )
    expect(result).toEqual([1, 2, 3])
  })
})

describe('flatMap with infinite inner stream', () => {
  it('take terminates flatMap over infinite inner', () => {
    const result = pipe(
      Stream.from([1]),
      Stream.flatMap(() => Stream.iterate(x => x + 1, 0)),
      Stream.take(5),
      Stream.toArray,
    )
    expect(result).toEqual([0, 1, 2, 3, 4])
  })
})

describe('zip edge cases', () => {
  it('terminates at shorter stream (left shorter)', () => {
    const result = pipe(
      Stream.from([1, 2]),
      Stream.zip(Stream.from(['a', 'b', 'c', 'd'])),
      Stream.toArray,
    )
    expect(result).toEqual([[1, 'a'], [2, 'b']])
  })

  it('terminates at shorter stream (right shorter)', () => {
    const result = pipe(
      Stream.from([1, 2, 3, 4]),
      Stream.zip(Stream.from(['a'])),
      Stream.toArray,
    )
    expect(result).toEqual([[1, 'a']])
  })

  it('empty + non-empty = empty', () => {
    const result = pipe(
      Stream.empty<number>(),
      Stream.zip(Stream.from([1, 2])),
      Stream.toArray,
    )
    expect(result).toEqual([])
  })
})

describe('chunk edge cases', () => {
  it('chunk(0) throws', () => {
    expect(() => Stream.chunk(Stream.from([1, 2, 3]), 0)).toThrow('chunk: size must be >= 1, got 0')
  })

  it('chunk(-1) throws', () => {
    expect(() => pipe(Stream.from([1]), Stream.chunk(-1))).toThrow('chunk: size must be >= 1')
  })
})

describe('take edge cases', () => {
  it('take(0) yields empty stream', () => {
    expect(pipe(Stream.from([1, 2, 3]), Stream.take(0), Stream.toArray)).toEqual([])
  })

  it('take(0) on infinite stream is empty', () => {
    expect(pipe(Stream.repeat(1), Stream.take(0), Stream.toArray)).toEqual([])
  })
})

describe('drop edge cases', () => {
  it('drop more than stream length yields empty', () => {
    expect(pipe(Stream.from([1, 2, 3]), Stream.drop(100), Stream.toArray)).toEqual([])
  })

  it('drop(0) yields full stream', () => {
    expect(pipe(Stream.from([1, 2, 3]), Stream.drop(0), Stream.toArray)).toEqual([1, 2, 3])
  })
})

describe('scan edge cases', () => {
  it('scan with empty stream yields empty', () => {
    const result = pipe(Stream.empty<number>(), Stream.scan((a: number, b: number) => a + b, 0), Stream.toArray)
    expect(result).toEqual([])
  })
})

describe('from with various iterables', () => {
  it('from a Set', () => {
    const result = Stream.toArray(Stream.from(new Set([3, 1, 2])))
    expect(result).toEqual([3, 1, 2])
  })

  it('from Map.keys()', () => {
    const m = new Map([['a', 1], ['b', 2]])
    const result = Stream.toArray(Stream.from(m.keys()))
    expect(result).toEqual(['a', 'b'])
  })

  it('from a generator', () => {
    function* gen() { yield 10; yield 20; yield 30 }
    const result = Stream.toArray(Stream.from(gen()))
    expect(result).toEqual([10, 20, 30])
  })

  it('from Map.values()', () => {
    const m = new Map([['a', 1], ['b', 2]])
    const result = Stream.toArray(Stream.from(m.values()))
    expect(result).toEqual([1, 2])
  })
})

describe('pipe integration', () => {
  it('complex pipeline with infinite stream', () => {
    const result = pipe(
      Stream.range(0, Infinity),
      Stream.filter(x => x % 2 === 0),
      Stream.map(x => x * x),
      Stream.take(10),
      Stream.toArray,
    )
    expect(result).toEqual([0, 4, 16, 36, 64, 100, 144, 196, 256, 324])
  })

  it('chained operations preserve laziness', () => {
    const calls: string[] = []
    const result = pipe(
      Stream.from([1, 2, 3, 4, 5]),
      Stream.map(x => { calls.push(`map:${x}`); return x * 2 }),
      Stream.filter(x => { calls.push(`filter:${x}`); return x > 4 }),
      Stream.take(2),
      Stream.toArray,
    )
    expect(result).toEqual([6, 8])
    expect(calls).toEqual(['map:1', 'filter:2', 'map:2', 'filter:4', 'map:3', 'filter:6', 'map:4', 'filter:8'])
  })
})
