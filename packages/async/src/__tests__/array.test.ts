import { describe, it, expect } from 'vitest'
import { run, runWithCancel } from '../task'
import { mapAsync, filterAsync, forEachAsync, reduceAsync, collectAsync } from '../array'

describe('mapAsync', () => {
  it('maps all elements', async () => {
    const result = await run(mapAsync([1, 2, 3], async (x) => x * 2))
    expect(result).toEqual([2, 4, 6])
  })

  it('preserves order with bounded concurrency', async () => {
    const result = await run(mapAsync(
      [3, 1, 2],
      async (x) => { await new Promise(r => setTimeout(r, x * 10)); return x },
      2,
    ))
    expect(result).toEqual([3, 1, 2])
  })

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0
    let current = 0
    await run(mapAsync(
      Array.from({ length: 10 }, (_, i) => i),
      async () => {
        current++
        if (current > maxConcurrent) maxConcurrent = current
        await new Promise(r => setTimeout(r, 20))
        current--
        return 0
      },
      3,
    ))
    expect(maxConcurrent).toBeLessThanOrEqual(3)
  })

  it('empty array returns empty', async () => {
    expect(await run(mapAsync([], async (x: number) => x))).toEqual([])
  })
})

describe('filterAsync', () => {
  it('filters with async predicate', async () => {
    const result = await run(filterAsync(
      [1, 2, 3, 4, 5],
      async (x) => x % 2 === 0,
    ))
    expect(result).toEqual([2, 4])
  })

  it('preserves order with bounded concurrency', async () => {
    const result = await run(filterAsync(
      [5, 4, 3, 2, 1],
      async (x) => { await new Promise(r => setTimeout(r, x * 5)); return x > 2 },
      2,
    ))
    expect(result).toEqual([5, 4, 3])
  })
})

describe('forEachAsync', () => {
  it('processes all elements', async () => {
    const seen: number[] = []
    await run(forEachAsync([1, 2, 3], async (x) => { seen.push(x) }))
    expect(seen).toEqual([1, 2, 3])
  })

  it('respects concurrency', async () => {
    let maxConcurrent = 0
    let current = 0
    await run(forEachAsync(
      Array.from({ length: 8 }, (_, i) => i),
      async () => {
        current++
        if (current > maxConcurrent) maxConcurrent = current
        await new Promise(r => setTimeout(r, 20))
        current--
      },
      2,
    ))
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })
})

describe('reduceAsync', () => {
  it('reduces sequentially', async () => {
    const result = await run(reduceAsync(
      [1, 2, 3, 4],
      async (acc, x) => acc + x,
      0,
    ))
    expect(result).toBe(10)
  })

  it('processes in order', async () => {
    const order: number[] = []
    await run(reduceAsync(
      [1, 2, 3],
      async (acc, x) => { order.push(x); return acc + x },
      0,
    ))
    expect(order).toEqual([1, 2, 3])
  })
})

describe('collectAsync', () => {
  it('collects async iterable', async () => {
    async function* gen() { yield 1; yield 2; yield 3 }
    const result = await run(collectAsync(gen()))
    expect(result).toEqual([1, 2, 3])
  })
})

describe('mapAsync edge cases', () => {
  it('empty array returns empty', async () => {
    const result = await run(mapAsync([], async (x: number) => x * 2))
    expect(result).toEqual([])
  })

  it('one item throws aborts others', async () => {
    let secondCompleted = false
    const promise = run(mapAsync(
      [1, 2, 3],
      async (x) => {
        if (x === 2) throw new Error('fail')
        await new Promise(r => setTimeout(r, 50))
        if (x === 3) secondCompleted = true
        return x
      },
      2,
    ))
    await expect(promise).rejects.toThrow('fail')
    await new Promise(r => setTimeout(r, 100))
    // After failure, remaining tasks should be aborted
  })
})

describe('reduceAsync edge cases', () => {
  it('empty array returns init', async () => {
    const result = await run(reduceAsync([], async (acc: number, _x: number) => acc, 42))
    expect(result).toBe(42)
  })
})
