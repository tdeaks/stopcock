import { describe, expect, it } from 'vite-plus/test'
import * as F from '../index'
import * as A from '../array'
import * as Iter from '../iter'
import { compile } from '../compile'
import { interpret } from '../interpret'
import { lowerPlan } from '../lower'
import { buildPlan } from '../plan'
import {
  V2_EAGER_FLAT_MAP_EXPECTATIONS,
  V2_EAGER_FLAT_MAP_SURFACES,
  V2_ITER_FLAT_MAP_EXPECTATIONS,
  V2_ROOT_MIGRATION,
} from './v2-contract-fixtures.mts'

type EagerCallback = (value: number) => number[]

interface EagerSurface {
  readonly id: string
  readonly run: (input: number[], callback: EagerCallback) => unknown
}

const happyPathArraySurfaces: readonly EagerSurface[] = [
  {
    id: 'direct-data-first',
    run: (input, callback) => A.flatMap(input, callback),
  },
  {
    id: 'generated-data-last',
    run: (input, callback) => A.flatMap(callback)(input),
  },
  {
    id: 'reference-interpreter',
    run: (input, callback) => interpret(buildPlan([A.flatMap(callback)]), input),
  },
  {
    id: 'portable-lowering',
    run: (input, callback) => lowerPlan(buildPlan([A.flatMap(callback)]))(input),
  },
  {
    id: 'runtime-compile',
    run: (input, callback) =>
      compile(
        A.flatMap(callback),
        A.map((value: number) => value),
      )(input),
  },
]

const directEagerSurfaces = happyPathArraySurfaces.slice(0, 2)

const divergentArraySurfaces: readonly EagerSurface[] = [
  {
    id: 'reference-interpreter',
    run: (input, callback) => interpret(buildPlan([A.flatMap(callback)]), input),
  },
  {
    id: 'portable-lowering',
    run: (input, callback) =>
      lowerPlan(buildPlan([A.flatMap(callback), A.map((value: number) => value)]))(input),
  },
  {
    id: 'runtime-compile',
    run: (input, callback) =>
      compile(
        A.flatMap(callback),
        A.map((value: number) => value),
      )(input),
  },
]

describe('Stopcock 2.0 root migration snapshot', () => {
  it('gives every current runtime root export exactly one intentional destination', () => {
    const actualRuntimeExports = Object.keys(F).sort()
    const expectedRuntimeExports = V2_ROOT_MIGRATION.filter(({ kind }) => kind === 'value')
      .map(({ name }) => name)
      .sort()

    expect(actualRuntimeExports).toEqual(expectedRuntimeExports)
    expect(new Set(expectedRuntimeExports).size).toBe(expectedRuntimeExports.length)
  })

  it('records one intended destination for every known current root type export', () => {
    const expectedTypeExports = [
      'Err',
      'Fn',
      'LazyValue',
      'None',
      'Ok',
      'Option',
      'PipelineExplanation',
      'PureRewrite',
      'Result',
      'Runner',
      'Some',
    ]
    const mappedTypeExports = V2_ROOT_MIGRATION.filter(({ kind }) => kind === 'type')
      .map(({ name }) => name)
      .sort()

    expect(mappedTypeExports).toEqual(expectedTypeExports)
    expect(new Set(mappedTypeExports).size).toBe(mappedTypeExports.length)
  })
})

describe('eager Array.flatMap 2.0 contract', () => {
  it('records one intended contract and an explicit oracle status for every execution surface', () => {
    expect(V2_EAGER_FLAT_MAP_SURFACES.map(({ id }) => id)).toEqual([
      'direct-data-first',
      'generated-data-last',
      'reference-interpreter',
      'portable-lowering',
      'runtime-compile',
      'fp-compiler',
    ])
    expect(
      V2_EAGER_FLAT_MAP_SURFACES.every(
        ({ expectedContract }) => expectedContract === 'indexed-returned-array',
      ),
    ).toBe(true)
    expect(
      V2_EAGER_FLAT_MAP_SURFACES.filter(({ currentStatus }) =>
        currentStatus.startsWith('divergent-'),
      ).every(({ oracleEligible }) => !oracleEligible),
    ).toBe(true)
  })

  it.each(happyPathArraySurfaces)(
    '$id independently matches the explicit Array-return happy-path result and callback shape',
    ({ run }) => {
      const calls: unknown[][] = []
      const result = run([1, 2, 3], (...args: unknown[]) => {
        calls.push(args)
        const value = args[0] as number
        return [value, value * 10]
      })

      expect(result).toEqual([1, 10, 2, 20, 3, 30])
      expect(calls).toEqual([[1], [2], [3]])
    },
  )

  it.each(divergentArraySurfaces)(
    '$id currently consumes arbitrary returned iterables and is therefore not an oracle',
    ({ id, run }) => {
      let iteratorReads = 0
      const iterable = {
        get [Symbol.iterator]() {
          iteratorReads++
          return function* () {
            yield 10
            yield 20
          }
        },
      }

      expect(run([1], () => iterable as unknown as number[])).toEqual([10, 20])
      expect(iteratorReads).toBe(1)
      expect(V2_EAGER_FLAT_MAP_SURFACES.find((surface) => surface.id === id)?.oracleEligible).toBe(
        false,
      )
    },
  )

  it.each(divergentArraySurfaces)(
    '$id currently observes returned Array growth and is therefore not an oracle',
    ({ run }) => {
      const returned = [1]
      Object.defineProperty(returned, 0, {
        configurable: true,
        get() {
          returned.push(2)
          return 1
        },
      })

      expect(run([0], () => returned)).toEqual([1, 2])
    },
  )

  it.each(directEagerSurfaces)(
    '$id snapshots the source and returned Array lengths and reads every indexed hole',
    ({ run }) => {
      const source = [1, 2]
      const events: string[] = []
      const result = run(source, (value) => {
        events.push(`callback:${value}`)
        if (value === 1) source.push(3)

        const returned = new Array<number>(3)
        Object.defineProperty(returned, 0, {
          configurable: true,
          get() {
            events.push(`get:${value}:0`)
            returned.push(value + 100)
            return value
          },
        })
        Object.defineProperty(returned, 2, {
          configurable: true,
          get() {
            events.push(`get:${value}:2`)
            return value + 10
          },
        })
        return returned
      })

      expect(result).toEqual([1, undefined, 11, 2, undefined, 12])
      expect(events).toEqual([
        'callback:1',
        'get:1:0',
        'get:1:2',
        'callback:2',
        'get:2:0',
        'get:2:2',
      ])
    },
  )

  it.each(directEagerSurfaces)(
    '$id does not consume an arbitrary callback-returned iterable',
    ({ run }) => {
      let iteratorReads = 0
      const iterable = {
        get [Symbol.iterator]() {
          iteratorReads++
          return function* () {
            yield 10
            yield 20
          }
        },
      }

      const result = run([1], () => iterable as unknown as number[])

      expect(result).toEqual([])
      expect(iteratorReads).toBe(0)
      expect(V2_EAGER_FLAT_MAP_EXPECTATIONS.arbitraryReturnedIterable).toBe('not-consumed')
    },
  )

  it.each(directEagerSurfaces)(
    '$id preserves the first thrown getter error and stops outer callbacks',
    ({ run }) => {
      const error = new Error('flatMap getter failed')
      const calls: number[] = []
      const callback = (value: number): number[] => {
        calls.push(value)
        if (value === 1) return [value]
        const returned = new Array<number>(1)
        Object.defineProperty(returned, 0, {
          get() {
            throw error
          },
        })
        return returned
      }

      let caught: unknown
      try {
        run([1, 2, 3], callback)
      } catch (thrown) {
        caught = thrown
      }

      expect(caught).toBe(error)
      expect(calls).toEqual([1, 2])
    },
  )
})

describe('lazy Iter.flatMap 2.0 contract', () => {
  it('accepts arbitrary iterables lazily with an independent outer index', () => {
    const calls: Array<[number, number]> = []
    const values = Iter.flatMap([2, 4], (value, index) => {
      calls.push([value, index])
      return new Set([value, value + index + 1])
    })

    expect(calls).toEqual([])
    expect(Iter.toArray(values)).toEqual([2, 3, 4, 6])
    expect(calls).toEqual([
      [2, 0],
      [4, 1],
    ])
    expect(V2_ITER_FLAT_MAP_EXPECTATIONS.callbackResult).toBe('arbitrary-iterable')
  })

  it('closes the active nested iterator and source on early termination', () => {
    const events: string[] = []
    const source = (function* () {
      try {
        yield 1
        yield 2
      } finally {
        events.push('source:close')
      }
    })()
    const expanded = Iter.flatMap(source, (value) =>
      (function* () {
        try {
          yield value * 10
          yield value * 10 + 1
        } finally {
          events.push(`nested:${value}:close`)
        }
      })(),
    )

    expect(Iter.toArray(Iter.take(expanded, 1))).toEqual([10])
    expect(events).toEqual(['nested:1:close', 'source:close'])
  })
})
