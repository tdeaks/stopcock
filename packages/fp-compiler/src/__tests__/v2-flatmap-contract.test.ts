import { describe, expect, it } from 'vite-plus/test'
import { runFixture } from './harness'

const STD_IMPORTS = `import { pipe } from '@stopcock/fp'
import * as A from '@stopcock/fp/array'`

describe('@stopcock/fp-compiler eager Array.flatMap 2.0 contract', () => {
  it('emits the explicit indexed Array result and value-only callback trace', () => {
    const result = runFixture({
      name: 'v2-flat-map-array-contract',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        const calls = []
        const values = pipe(
          [1, 2, 3],
          A.flatMap((...args) => {
            calls.push(args)
            return [args[0], args[0] * 10]
          }),
        )
        return { values, calls }
      `,
      expectTransformed: true,
    })

    expect(result.transformed).toBe(true)
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual({
      values: [1, 10, 2, 20, 3, 30],
      calls: [[1], [2], [3]],
    })
  })

  it('does not consume an arbitrary callback-returned iterable', () => {
    const result = runFixture({
      name: 'v2-flat-map-reject-iterable',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        let iteratorReads = 0
        const returned = {
          get [Symbol.iterator]() {
            iteratorReads++
            return function* () {
              yield 10
              yield 20
            }
          },
        }
        const values = pipe([1], A.flatMap(() => returned))
        return { values, iteratorReads }
      `,
      expectTransformed: true,
    })

    expect(result.transformed).toBe(true)
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual({ values: [], iteratorReads: 0 })
  })

  it('snapshots returned Array length before indexed getters mutate it', () => {
    const result = runFixture({
      name: 'v2-flat-map-returned-length',
      imports: STD_IMPORTS,
      locals: { pipe: 'pipe', A: 'A' },
      body: `
        const events = []
        const values = pipe(
          [1],
          A.flatMap((value) => {
            const returned = new Array(2)
            Object.defineProperty(returned, 0, {
              get() {
                events.push('get:0')
                returned.push(99)
                return value
              },
            })
            Object.defineProperty(returned, 1, {
              get() {
                events.push('get:1')
                return value + 1
              },
            })
            return returned
          }),
        )
        return { values, events }
      `,
      expectTransformed: true,
    })

    expect(result.transformed).toBe(true)
    expect(result.compiled.error).toBeUndefined()
    expect(result.compiled.value).toEqual({
      values: [1, 2],
      events: ['get:0', 'get:1'],
    })
  })

  it('preserves thrown getter identity and callback stop order', () => {
    const sentinel = new Error('flatMap getter failed')
    const callLogs: number[][] = []
    const result = runFixture(
      {
        name: 'v2-flat-map-getter-error',
        imports: STD_IMPORTS,
        locals: { pipe: 'pipe', A: 'A' },
        body: `
          return pipe(
            [1, 2, 3],
            A.flatMap((value) => {
              calls.push(value)
              if (value === 1) return [value]
              const returned = new Array(1)
              Object.defineProperty(returned, 0, {
                get() {
                  throw sentinel
                },
              })
              return returned
            }),
          )
        `,
        expectTransformed: true,
      },
      () => {
        const calls: number[] = []
        callLogs.push(calls)
        return { sentinel, calls }
      },
    )

    expect(result.transformed).toBe(true)
    expect(result.original.error).toBe(sentinel)
    expect(result.compiled.error).toBe(sentinel)
    expect(callLogs.slice(1)).toEqual([
      [1, 2],
      [1, 2],
    ])
  })
})
