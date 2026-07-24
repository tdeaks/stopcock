import { describe, expect, it } from 'vite-plus/test'
import * as Monoid from '../monoid'
import { none, some } from '../option'
import * as Reader from '../reader'
import * as Recursion from '../recursion'
import * as State from '../state-fn'
import * as Writer from '../writer'

describe('Reader', () => {
  interface Environment {
    readonly prefix: string
    readonly scale: number
  }

  it('reads, maps, flatMaps, and provides an environment', () => {
    const prefix = Reader.asks((environment: Environment) => environment.prefix)
    const program = Reader.flatMap((left: string) =>
      Reader.map((scale: number) => `${left}:${scale}`)(
        Reader.asks((environment: Environment) => environment.scale),
      ),
    )(prefix)

    expect(Reader.provide({ prefix: 'value', scale: 2 })(program)).toBe('value:2')
  })

  it('transforms local environments and traverses arrays densely', () => {
    const length = Reader.asks((text: string) => text.length)
    expect(Reader.local((value: { readonly text: string }) => value.text)(length)({ text: 'abc' }))
      .toBe(3)

    const sparse = new Array<number | undefined>(2)
    sparse[1] = 2
    const traversed = Reader.traverseReadonlyArray(
      (value: number | undefined) => (offset: number) => (value ?? 0) + offset,
    )(sparse)
    expect(traversed(1)).toEqual([1, 3])
  })
})

describe('State', () => {
  it('threads state left-to-right through flatMap', () => {
    const increment = State.modifyAndGet((value: number) => value + 1)
    const program = State.flatMap((first: number) =>
      State.map((second: number) => first + second)(increment),
    )(increment)

    expect(State.run(0)(program)).toEqual([3, 2])
    expect(State.evaluate(0)(program)).toBe(3)
    expect(State.execute(0)(program)).toBe(2)
  })

  it('traverses densely and keeps ordinary operations immutable', () => {
    const sparse = new Array<number | undefined>(2)
    sparse[1] = 2
    const program = State.traverseReadonlyArray(
      (value: number | undefined) =>
      State.state<number, number>((current) => [(value ?? 0) + current, current + 1]),
    )(sparse)

    expect(program(1)).toEqual([[1, 4], 3])
    expect(sparse).toHaveLength(2)
    expect(0 in sparse).toBe(false)
  })
})

describe('Writer', () => {
  const output = Monoid.array<string>()

  it('accumulates output in evaluation order', () => {
    const start = Writer.writer(1, ['start'])
    const program = Writer.flatMap(output)((value: number) =>
      Writer.writer(value + 1, ['next']),
    )(start)

    expect(program).toEqual([2, ['start', 'next']])
    expect(Writer.listen(program)).toEqual([[2, ['start', 'next']], ['start', 'next']])
  })

  it('supports censor, pass, and dense traversal', () => {
    expect(Writer.censor((items: readonly string[]) => [...items, 'end'])(
      Writer.writer(1, ['start']),
    )).toEqual([1, ['start', 'end']])
    expect(
      Writer.pass(
        Writer.writer(
          [1, (items: readonly string[]) => items.filter((item) => item !== 'drop')] as const,
          ['keep', 'drop'],
        ),
      ),
    ).toEqual([1, ['keep']])

    const sparse = new Array<number | undefined>(2)
    sparse[1] = 2
    expect(
      Writer.traverseReadonlyArray(output)((value: number | undefined, index) =>
        Writer.writer(value ?? 0, [String(index)]),
      )(sparse),
    ).toEqual([[0, 2], ['0', '1']])
  })
})

describe('Recursion', () => {
  it('runs large tail-recursive programs without growing the stack', () => {
    const result = Recursion.tailRec(
      { remaining: 100_000, total: 0 },
      ({ remaining, total }) =>
        remaining === 0
          ? Recursion.complete(total)
          : Recursion.continueWith({ remaining: remaining - 1, total: total + 1 }),
    )
    expect(result).toBe(100_000)
  })

  it('runs suspended trampolines without growing the stack', () => {
    const count = (remaining: number, total: number): Recursion.Trampoline<number> =>
      remaining === 0
        ? Recursion.now(total)
        : Recursion.suspend(() => count(remaining - 1, total + 1))

    expect(Recursion.run(count(100_000, 0))).toBe(100_000)
  })

  it('supports memoized fixed points with SameValueZero keys', () => {
    let evaluations = 0
    const fibonacci = Recursion.memoFix<number, number>((recur, value) => {
      evaluations += 1
      return Number.isNaN(value) ? value : value < 2 ? value : recur(value - 1) + recur(value - 2)
    })

    expect(fibonacci(20)).toBe(6765)
    expect(evaluations).toBe(21)
    expect(fibonacci(Number.NaN)).toBeNaN()
    const afterNaN = evaluations
    expect(fibonacci(Number.NaN)).toBeNaN()
    expect(evaluations).toBe(afterNaN)
  })

  it('unfolds and terminates bounded iteration with Option', () => {
    expect(
      Recursion.unfold(0, (value) =>
        value < 3 ? some([value, value + 1] as const) : none,
      ),
    ).toEqual([0, 1, 2])
    expect(Recursion.iterateUntil(1, (value) => value >= 8, (value) => value * 2, 3))
      .toEqual(some(8))
    expect(Recursion.iterateUntil(1, (value) => value >= 16, (value) => value * 2, 3))
      .toBe(none)
  })
})
