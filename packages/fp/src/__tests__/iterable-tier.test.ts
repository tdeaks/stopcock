import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test'
import { pipe } from '../pipe'
import * as A from '../array'
import * as Stream from '../stream'
import { __resetJitModuleCache } from '../compile'
import { __clearEntries } from '../shape-entry'
import { __setProbeOverride } from '../jit-chunk'

// See stream-w5.test.ts: the dynamic import of jit-chunk.ts settles over a
// few event-loop turns, not synchronously.
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

// A fresh Set/generator each call, exercising every shape the tier-1
// iterable codegen has to cover, run enough times to cross the promotion
// threshold (8 execs), then checked against interpret's own array-backed
// path over the equivalent data.
function set6(): Set<number> {
  return new Set([1, 2, 3, 4, 5, 6])
}

function* gen6(): Generator<number> {
  for (let i = 1; i <= 6; i++) yield i
}

describe('iterable tier: promotion parity with the array executor', () => {
  it('map -> filter -> take promotes and matches the array result', async () => {
    const build = () =>
      pipe(
        Stream.from(set6()),
        Stream.map((x: number) => x * 2),
        Stream.filter((x: number) => x % 4 === 0),
        Stream.take(2),
      )
    const expected = pipe(
      [...set6()],
      A.map((x: number) => x * 2),
      A.filter((x: number) => x % 4 === 0),
      A.take(2),
    )

    for (let i = 0; i < 8; i++) expect(Stream.toArray(build())).toEqual(expected)
    await settle()

    const entry = Stream.__entryForIterableStream(build())
    expect(entry.tier).toBe(1)
    expect(Stream.toArray(build())).toEqual(expected)
  })

  it('flatMap over a Set promotes and matches interpret', async () => {
    const build = () =>
      pipe(
        Stream.from(set6()),
        Stream.flatMap((x: number) => [x, -x]),
        Stream.take(4),
      )
    const expected = [1, -1, 2, -2]

    for (let i = 0; i < 8; i++) expect(Stream.toArray(build())).toEqual(expected)
    await settle()

    expect(Stream.__entryForIterableStream(build()).tier).toBe(1)
    expect(Stream.toArray(build())).toEqual(expected)
  })

  it('takeWhile over a generator promotes and matches the array result', async () => {
    const build = () => pipe(Stream.from(gen6()), Stream.takeWhile((x: number) => x < 4))
    const expected = A.takeWhile([1, 2, 3, 4, 5, 6], (x: number) => x < 4)

    for (let i = 0; i < 8; i++) expect(Stream.toArray(build())).toEqual(expected)
    await settle()

    expect(Stream.__entryForIterableStream(build()).tier).toBe(1)
    expect(Stream.toArray(build())).toEqual(expected)
  })

  it('dropWhile over a generator promotes and matches the array result', async () => {
    const build = () => pipe(Stream.from(gen6()), Stream.dropWhile((x: number) => x < 4), Stream.take(3))
    const expected = [4, 5, 6]

    for (let i = 0; i < 8; i++) expect(Stream.toArray(build())).toEqual(expected)
    await settle()

    expect(Stream.__entryForIterableStream(build()).tier).toBe(1)
    expect(Stream.toArray(build())).toEqual(expected)
  })

  it('reduce over a Set (sink fused into the loop) promotes and matches array reduce', async () => {
    const build = () =>
      pipe(
        Stream.from(set6()),
        Stream.takeWhile((x: number) => x < 100),
        (s) => Stream.reduce(s, (acc: number, x: number) => acc + x, 0),
      )
    const expected = [...set6()].reduce((acc, x) => acc + x, 0)

    for (let i = 0; i < 8; i++) expect(build()).toBe(expected)
    await settle()

    const entryBuild = () => pipe(Stream.from(set6()), Stream.takeWhile((x: number) => x < 100))
    expect(Stream.__entryForIterableStream(entryBuild())).toBeDefined()
    expect(build()).toBe(expected)
  })

  it('find over a generator promotes and matches interpret', async () => {
    const build = () => Stream.find(Stream.from(gen6()), (x: number) => x > 3)
    for (let i = 0; i < 8; i++) expect(build()).toBe(4)
    await settle()
    expect(build()).toBe(4)
  })

  it('scan over a Set promotes and matches interpret order (no initial emit)', async () => {
    const build = () =>
      pipe(
        Stream.from(set6()),
        Stream.scan((acc: number, x: number) => acc + x, 0),
        Stream.takeWhile((x: number) => x < 1000),
      )
    const expected = [1, 3, 6, 10, 15, 21]

    for (let i = 0; i < 8; i++) expect(Stream.toArray(build())).toEqual(expected)
    await settle()

    expect(Stream.toArray(build())).toEqual(expected)
  })
})

describe('iterable tier: callback order matches tier-0 exactly', () => {
  it('map/filter/take callback order and count are unchanged across promotion', async () => {
    const calls: number[] = []
    const build = () =>
      pipe(
        Stream.from(set6()),
        Stream.map((x: number) => {
          calls.push(x)
          return x * 2
        }),
        Stream.take(2),
      )

    Stream.toArray(build())
    const preOrder = [...calls]
    calls.length = 0

    for (let i = 0; i < 8; i++) Stream.toArray(build())
    await settle()
    expect(Stream.__entryForIterableStream(build()).tier).toBe(1)

    calls.length = 0
    Stream.toArray(build())
    expect(calls).toEqual(preOrder)
  })
})

describe('iterable tier: take-over-infinite-generator still halts after promotion', () => {
  it('a promoted take-over-infinite chain still terminates and closes the source', async () => {
    function* infinite(): Generator<number> {
      let i = 0
      while (true) yield i++
    }
    const build = () => pipe(Stream.from(infinite()), Stream.take(3))

    // Cross the promotion threshold on a bounded generator first (an
    // infinite one would never let the *array* comparison finish, but
    // takeWhile below is the promotion driver -- the take-over-infinite
    // shape here is only exercised once it's already promoted).
    const driver = () => pipe(Stream.from(gen6()), Stream.take(3))
    for (let i = 0; i < 8; i++) Stream.toArray(driver())
    await settle()
    expect(Stream.__entryForIterableStream(driver()).tier).toBe(1)

    const result = Stream.toArray(build())
    expect(result).toEqual([0, 1, 2])
  })

  it('.return() is called on the source when a promoted generated runner exits early', async () => {
    const track = { returned: false }
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        let i = 0
        return {
          next: (): IteratorResult<number> => ({ done: false, value: i++ }),
          return: (value?: unknown): IteratorResult<number> => {
            track.returned = true
            return { done: true, value: value as number }
          },
        }
      },
    }

    const driver = () => pipe(Stream.from(gen6()), Stream.take(3))
    for (let i = 0; i < 8; i++) Stream.toArray(driver())
    await settle()
    expect(Stream.__entryForIterableStream(driver()).tier).toBe(1)

    const result = Stream.toArray(pipe(Stream.from(iterable), Stream.take(3)))
    expect(result).toEqual([0, 1, 2])
    expect(track.returned).toBe(true)
  })

  it('.return() is called on the source when a promoted generated runner rethrows a callback error', async () => {
    const track = { returned: false }
    const iterable: Iterable<number> = {
      [Symbol.iterator]() {
        let i = 0
        return {
          next: (): IteratorResult<number> => ({ done: false, value: i++ }),
          return: (value?: unknown): IteratorResult<number> => {
            track.returned = true
            return { done: true, value: value as number }
          },
        }
      },
    }

    const driver = () =>
      pipe(
        Stream.from(gen6()),
        Stream.map((x: number) => x),
        Stream.take(50),
      )
    for (let i = 0; i < 8; i++) Stream.toArray(driver())
    await settle()
    expect(Stream.__entryForIterableStream(driver()).tier).toBe(1)

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
})

describe('iterable tier: execution identity distinct from the array-backed entry', () => {
  it('the same opcode sequence over an array vs. an iterable resolves to different ShapeEntry objects', () => {
    const build = () =>
      pipe(
        Stream.from([1, 2, 3]),
        Stream.map((x: number) => x + 1),
        Stream.takeWhile((x: number) => x < 100),
      )
    const arrayEntry = Stream.__entryForStream(build())
    const iterableEntry = Stream.__entryForIterableStream(build())
    expect(arrayEntry).not.toBe(iterableEntry)
  })

  it('promoting the iterable entry never mutates the array-backed entry for the same ops', async () => {
    const build = () =>
      pipe(
        Stream.from(set6()),
        Stream.map((x: number) => x + 1),
        Stream.takeWhile((x: number) => x < 100),
      )
    for (let i = 0; i < 8; i++) Stream.toArray(build())
    await settle()

    expect(Stream.__entryForIterableStream(build()).tier).toBe(1)
    expect(Stream.__entryForStream(build()).tier).toBe(0)
  })
})
