import { describe, expect, it } from 'vite-plus/test'
import {
  collect,
  filter,
  flatMap,
  from,
  map,
  mapConcurrent,
  take,
} from '../async-iter'
import { run, runWithCancel } from '../task'
import { CancelledError } from '../types'

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('AsyncIter', () => {
  it('is lazy and composes over sync and async sources', async () => {
    let pulled = 0
    async function* source() {
      for (const value of [1, 2, 3, 4]) {
        pulled++
        yield value
      }
    }

    const iter = flatMap(
      filter(
        map(from(source()), async (value) => value * 2),
        (value) => value % 4 === 0,
      ),
      (value) => [value, value + 1],
    )

    expect(pulled).toBe(0)
    expect(await run(collect(iter))).toEqual([4, 5, 8, 9])
    expect(pulled).toBe(4)
  })

  it('take closes its source after the requested number of values', async () => {
    let closed = false
    async function* source() {
      try {
        yield 1
        yield 2
        yield 3
      } finally {
        closed = true
      }
    }

    expect(await run(collect(take(source(), 2)))).toEqual([1, 2])
    expect(closed).toBe(true)
  })

  it('propagates Task cancellation while an upstream next() is pending', async () => {
    let closed = false
    const source: AsyncIterable<number> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<number>>(() => {}),
          return: async () => {
            closed = true
            return { done: true, value: undefined }
          },
        }
      },
    }

    const [promise, cancel] = runWithCancel(collect(from(source)))
    await wait(5)
    cancel()

    await expect(promise).rejects.toBeInstanceOf(CancelledError)
    expect(closed).toBe(true)
  })

  it('mapConcurrent is bounded and yields in source order', async () => {
    let active = 0
    let maximum = 0
    const seenSignals: AbortSignal[] = []

    const iter = mapConcurrent(
      [3, 1, 2, 4],
      async (value, _index, signal) => {
        seenSignals.push(signal)
        active++
        maximum = Math.max(maximum, active)
        await wait(value * 5)
        active--
        return value * 10
      },
      { concurrency: 2 },
    )

    expect(await run(collect(iter))).toEqual([30, 10, 20, 40])
    expect(maximum).toBe(2)
    expect(seenSignals).toHaveLength(4)
  })

  it('mapConcurrent never pulls more than its bound ahead of the consumer', async () => {
    let pulls = 0
    async function* source() {
      for (let value = 0; value < 10; value++) {
        pulls++
        yield value
      }
    }

    const iterator = mapConcurrent(source(), async (value) => value, {
      concurrency: 3,
    })[Symbol.asyncIterator]()

    expect(pulls).toBe(0)
    expect((await iterator.next()).value).toBe(0)
    expect(pulls).toBe(3)
    await iterator.return?.()
  })

  it('mapConcurrent aborts sibling work on the first mapper failure', async () => {
    let siblingAborted = false
    const iter = mapConcurrent(
      [1, 2],
      async (value, _index, signal) => {
        if (value === 2) {
          await wait(5)
          throw new Error('boom')
        }
        return new Promise<number>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              siblingAborted = true
              reject(signal.reason)
            },
            { once: true },
          )
        })
      },
      { concurrency: 2 },
    )

    await expect(run(collect(iter))).rejects.toThrow('boom')
    expect(siblingAborted).toBe(true)
  })

  it('rejects invalid concurrency at pipeline construction', () => {
    expect(() =>
      mapConcurrent([1, 2, 3], async (value) => value, { concurrency: 0 }),
    ).toThrow(RangeError)
    expect(() =>
      mapConcurrent([1, 2, 3], async (value) => value, {
        concurrency: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(RangeError)
  })

  it('supports pipe-friendly curried operators', async () => {
    const double = map(async (value: number) => value * 2)
    const firstTwo = take(2)
    expect(await run(collect(firstTwo(double([1, 2, 3]))))).toEqual([2, 4])
  })
})
