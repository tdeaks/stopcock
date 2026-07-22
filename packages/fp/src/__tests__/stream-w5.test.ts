import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test'
import { pipe } from '../pipe'
import * as A from '../array'
import * as Stream from '../stream'
import { __resetJitModuleCache } from '../compile'
import { __clearEntries } from '../shape-entry'
import { __setProbeOverride } from '../jit-chunk'

// See tier1.test.ts: the dynamic import of jit-chunk.ts settles over a few
// event-loop turns, not synchronously.
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  __clearEntries()
  __resetJitModuleCache()
  __setProbeOverride(undefined)
})

afterEach(() => {
  __setProbeOverride(undefined)
})

describe('W5 dialect: take', () => {
  it('array take permits one extra upstream callback after the quota fills', () => {
    let calls = 0
    const result = pipe(
      [1, 2, 3, 4, 5, 6],
      A.map((x: number) => {
        calls++
        return x
      }),
      A.take(2),
    )
    expect(result).toEqual([1, 2])
    // items 1,2 fill the quota; item 3's map call still fires before take's
    // check-before-increment halts on it (see pipe-fusion.test.ts).
    expect(calls).toBe(3)
  })

  it('stream take stops immediately once the quota-filling item is processed', () => {
    let calls = 0
    const result = Stream.toArray(
      pipe(
        Stream.from([1, 2, 3, 4, 5, 6]),
        Stream.map((x: number) => {
          calls++
          return x
        }),
        Stream.take(2),
      ),
    )
    expect(result).toEqual([1, 2])
    // no extra call for item 3: the source is never touched again once the
    // quota-filling item (2) finishes.
    expect(calls).toBe(2)
  })

  it('the two dialects diverge on the same source and quota, side by side', () => {
    const source = [1, 2, 3, 4, 5]
    let arrayCalls = 0
    let streamCalls = 0

    pipe(
      source,
      A.map((x: number) => {
        arrayCalls++
        return x
      }),
      A.take(3),
    )
    Stream.toArray(
      pipe(
        Stream.from(source),
        Stream.map((x: number) => {
          streamCalls++
          return x
        }),
        Stream.take(3),
      ),
    )

    expect(arrayCalls).toBe(4)
    expect(streamCalls).toBe(3)
  })
})

describe('W5 dialect: scan', () => {
  it('array scan (array.ts) includes the initial accumulator', () => {
    expect(A.scan([1, 2, 3], (a: number, b: number) => a + b, 0)).toEqual([0, 1, 3, 6])
  })

  it('stream scan does not emit the initial accumulator', () => {
    const result = pipe(
      Stream.from([1, 2, 3]),
      Stream.scan((a: number, b: number) => a + b, 0),
      Stream.toArray,
    )
    expect(result).toEqual([1, 3, 6])
  })

  it('the two dialects diverge on the same source and reducer, side by side', () => {
    const source = [1, 2, 3]
    const reducer = (a: number, b: number) => a + b

    const arrayResult = A.scan(source, reducer, 0)
    const streamResult = pipe(Stream.from(source), Stream.scan(reducer, 0), Stream.toArray)

    expect(arrayResult).toEqual([0, 1, 3, 6])
    expect(streamResult).toEqual([1, 3, 6])
    expect(arrayResult.length).toBe(streamResult.length + 1)
  })
})

describe('W5 iterator closure', () => {
  it('take closes the source iterator once satisfied', () => {
    const track = { returned: false }
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        let i = 0
        return {
          next: (): IteratorResult<number> => (i < 100 ? { done: false, value: i++ } : { done: true, value: undefined }),
          return: (value?: unknown): IteratorResult<number> => {
            track.returned = true
            return { done: true, value: value as number }
          },
        }
      },
    }
    const result = Stream.toArray(pipe(Stream.from(iterable), Stream.take(3)))
    expect(result).toEqual([0, 1, 2])
    expect(track.returned).toBe(true)
  })

  it('find closes the source iterator once a match is found', () => {
    const track = { returned: false }
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        let i = 0
        return {
          next: (): IteratorResult<number> => (i < 100 ? { done: false, value: i++ } : { done: true, value: undefined }),
          return: (value?: unknown): IteratorResult<number> => {
            track.returned = true
            return { done: true, value: value as number }
          },
        }
      },
    }
    const found = Stream.find(Stream.from(iterable), (x) => x === 5)
    expect(found).toBe(5)
    expect(track.returned).toBe(true)
  })

  it('every closes the source iterator once a failing element is seen', () => {
    const track = { returned: false }
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        let i = 0
        return {
          next: (): IteratorResult<number> => (i < 100 ? { done: false, value: i++ } : { done: true, value: undefined }),
          return: (value?: unknown): IteratorResult<number> => {
            track.returned = true
            return { done: true, value: value as number }
          },
        }
      },
    }
    const ok = Stream.every(Stream.from(iterable), (x) => x < 5)
    expect(ok).toBe(false)
    expect(track.returned).toBe(true)
  })

  it('a thrown callback error closes the source iterator', () => {
    const track = { returned: false }
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        let i = 0
        return {
          next: (): IteratorResult<number> => (i < 100 ? { done: false, value: i++ } : { done: true, value: undefined }),
          return: (value?: unknown): IteratorResult<number> => {
            track.returned = true
            return { done: true, value: value as number }
          },
        }
      },
    }
    // take(50) makes this an early-termination shape, so the terminal
    // drives the fused push loop (not the materialize-then-array-executor
    // path): the source is still open when map throws, so it must close.
    expect(() =>
      Stream.toArray(
        pipe(
          Stream.from(iterable),
          Stream.map((x: number) => {
            if (x === 3) throw new Error('boom')
            return x
          }),
          Stream.take(50),
        ),
      ),
    ).toThrow('boom')
    expect(track.returned).toBe(true)
  })

  it('a chain with no early-termination op materializes the (finite) source before running callbacks', () => {
    // No take/find/every/some/etc in this chain, so the terminal path is
    // Array.from(source) followed by the array executor — correct because
    // nothing was ever going to stop early, so full materialization can't
    // observably differ from a lazy pull. The finite source here still
    // exhausts (and closes) normally via Array.from; map's throw happens
    // afterward, against the already-materialized array.
    const track = { returned: false, drained: false }
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        let i = 0
        return {
          next: (): IteratorResult<number> => {
            if (i < 5) return { done: false, value: i++ }
            track.drained = true
            return { done: true, value: undefined }
          },
          return: (value?: unknown): IteratorResult<number> => {
            track.returned = true
            return { done: true, value: value as number }
          },
        }
      },
    }
    expect(() =>
      Stream.toArray(
        pipe(
          Stream.from(iterable),
          Stream.map((x: number) => {
            if (x === 3) throw new Error('boom')
            return x
          }),
        ),
      ),
    ).toThrow('boom')
    expect(track.drained).toBe(true)
  })

  it('direct iteration (for-of over the Stream itself) closes the source when a callback throws', () => {
    // Only [Symbol.iterator]() (StreamIterator) still needs its own
    // try/catch for this: a thrown callback unwinds out of Iterator.next()
    // itself, which does not trigger the engine's automatic IteratorClose
    // the way a thrown loop *body* does.
    const track = { returned: false }
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        let i = 0
        return {
          next: (): IteratorResult<number> => (i < 100 ? { done: false, value: i++ } : { done: true, value: undefined }),
          return: (value?: unknown): IteratorResult<number> => {
            track.returned = true
            return { done: true, value: value as number }
          },
        }
      },
    }
    const s = pipe(
      Stream.from(iterable),
      Stream.map((x: number) => {
        if (x === 3) throw new Error('boom')
        return x
      }),
    )
    expect(() => {
      for (const _ of s) {
        // draining until the throw
      }
    }).toThrow('boom')
    expect(track.returned).toBe(true)
  })

  it('closes nested flatMap inner iterators when take halts mid-expansion', () => {
    const innerTrack = { returned: false }
    const innerIterable: Iterable<number> = {
      [Symbol.iterator]() {
        let i = 0
        return {
          next: (): IteratorResult<number> => ({ done: false, value: i++ }), // infinite
          return: (value?: unknown): IteratorResult<number> => {
            innerTrack.returned = true
            return { done: true, value: value as number }
          },
        }
      },
    }
    const result = Stream.toArray(
      pipe(
        Stream.from([1]),
        Stream.flatMap(() => innerIterable),
        Stream.take(3),
      ),
    )
    expect(result).toEqual([0, 1, 2])
    expect(innerTrack.returned).toBe(true)
  })
})

describe('W5 array-backed tiering', () => {
  it('promotes an array-backed Stream operator chain to tier 1 after enough executions', async () => {
    const inc = (x: number) => x + 1
    const positive = (x: number) => x > 0

    const build = () => pipe(Stream.from([1, -2, 3]), Stream.map(inc), Stream.filter(positive))
    for (let i = 0; i < 8; i++) Stream.toArray(build())
    await settle()

    const entry = Stream.__entryForStream(build())
    expect(entry.tier).toBe(1)
    expect(entry.chunkState).toBe('loaded')

    expect(Stream.toArray(build())).toEqual([2, 4])
  })

  it('Stream.compile requests eager tier-1/2 generation like compile()', async () => {
    const factory = Stream.compile<number, number>(
      Stream.map((x: number) => x * 2),
      Stream.filter((x: number) => x > 2),
    )
    await settle()

    const s = factory([1, 2, 3])
    expect(Stream.toArray(s)).toEqual([4, 6])

    const entry = Stream.__entryForStream(factory([]))
    expect(entry.tier).toBeGreaterThanOrEqual(1)
  })
})

describe('W5 generic iterable source', () => {
  it('map/filter/take over a Set matches the array-backed result', () => {
    const set = new Set([1, 2, 3, 4, 5, 6])
    const result = Stream.toArray(
      pipe(
        Stream.from(set),
        Stream.map((x: number) => x * 2),
        Stream.filter((x: number) => x % 4 === 0),
        Stream.take(2),
      ),
    )
    const arrayResult = pipe(
      [...set],
      A.map((x: number) => x * 2),
      A.filter((x: number) => x % 4 === 0),
      A.take(2),
    )
    expect(result).toEqual(arrayResult)
  })

  it('reduce over a generator (non-array source) works without materializing eagerly', () => {
    function* gen() {
      let i = 0
      while (true) yield i++
    }
    const result = pipe(
      Stream.from(gen()),
      Stream.take(5),
      (s) => Stream.reduce(s, (acc: number, x: number) => acc + x, 0),
    )
    expect(result).toBe(0 + 1 + 2 + 3 + 4)
  })
})

describe('W5 re-iteration', () => {
  it('replays from scratch on every fresh [Symbol.iterator]() call', () => {
    const s = pipe(
      Stream.from([1, 2, 3]),
      Stream.map((x: number) => x * 2),
    )
    expect([...s]).toEqual([2, 4, 6])
    expect([...s]).toEqual([2, 4, 6])
    expect(Stream.toArray(s)).toEqual([2, 4, 6])
  })

  it('replays correctly once the underlying shape has been promoted', async () => {
    const build = () =>
      pipe(
        Stream.from([1, 2, 3, 4]),
        Stream.map((x: number) => x + 1),
        Stream.filter((x: number) => x % 2 === 0),
      )
    for (let i = 0; i < 8; i++) Stream.toArray(build())
    await settle()

    const s = build()
    expect(Stream.toArray(s)).toEqual([2, 4])
    expect(Stream.toArray(s)).toEqual([2, 4])
  })
})
