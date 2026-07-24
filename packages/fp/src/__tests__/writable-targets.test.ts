import { describe, expect, it } from 'vite-plus/test'
import * as ArrayOps from '../array'
import * as Collector from '../collector'
import * as Indexed from '../indexed'
import * as Iter from '../iter'
import * as Transducer from '../transducer'
import * as Tuple from '../tuple'

class NumberBucket extends Array<number> {
  readonly kind = 'number' as const
}

class NumberSet extends Set<number> {
  readonly kind = 'number-set' as const
}

class NumberMap extends Map<string, number> {
  readonly kind = 'number-map' as const
}

describe('writable-target collection helpers', () => {
  it('returns the exact array target in both array invocation styles', () => {
    const direct = new NumberBucket()
    const curried = new NumberBucket()

    expect(ArrayOps.mapInto([1, 2], direct, (value) => value * 2)).toBe(direct)
    expect([...direct]).toEqual([2, 4])
    expect(ArrayOps.filterInto(curried, (value: number) => value > 1)([1, 2, 3])).toBe(curried)
    expect([...curried]).toEqual([2, 3])
  })

  it('preserves caller-owned targets for Indexed and Tuple writes', () => {
    const indexed = new NumberBucket(3)
    const appended = new NumberBucket()

    expect(Indexed.copyInto([1, 2, 3], indexed)).toBe(indexed)
    expect([...indexed]).toEqual([1, 2, 3])
    expect(Tuple.mapInto([1, 2] as const, appended, (value) => value * 3)).toBe(appended)
    expect([...appended]).toEqual([3, 6])
  })

  it('allows a guard to safely populate narrower storage', () => {
    const target: string[] = []
    const source: readonly (string | number)[] = ['one', 2, 'three']
    const isString = (value: string | number): value is string => typeof value === 'string'

    expect(Indexed.filterInto(source, target, isString)).toBe(target)
    expect(target).toEqual(['one', 'three'])
  })

  it('preserves exact targets for iterable and transducer terminals', () => {
    const iterTarget = new NumberBucket()
    const transducerTarget = new NumberBucket()

    expect(Iter.toArrayInto([1, 2], iterTarget)).toBe(iterTarget)
    expect(
      Transducer.intoArrayInto(
        [1, 2],
        Transducer.map((value: number) => value * 2),
        transducerTarget,
      ),
    ).toBe(transducerTarget)
    expect([...iterTarget]).toEqual([1, 2])
    expect([...transducerTarget]).toEqual([2, 4])
  })

  it('preserves exact targets across collector factories and array reducers', () => {
    const arrayTarget = new NumberBucket()
    const setTarget = new NumberSet()
    const mapTarget = new NumberMap()
    const recordTarget = Object.create(null) as Collector.MutableRecord<number>
    const reducerTarget = new NumberBucket()

    expect(Collector.collect([1, 2], Collector.arrayInto(arrayTarget))).toBe(arrayTarget)
    expect(Collector.collect([1, 1, 2], Collector.setInto(setTarget))).toBe(setTarget)
    expect(
      Collector.collect(
        [
          ['one', 1],
          ['two', 2],
        ],
        Collector.mapInto(mapTarget),
      ),
    ).toBe(mapTarget)
    expect(
      Collector.collect(
        [
          ['one', 1],
          [Symbol.iterator, 2],
        ],
        Collector.recordInto(recordTarget),
      ),
    ).toBe(recordTarget)
    expect(
      Transducer.transduce(
        [1, 2],
        Transducer.identity<number>(),
        Transducer.arrayReducerInto(reducerTarget),
      ),
    ).toBe(reducerTarget)

    expect([...arrayTarget]).toEqual([1, 2])
    expect([...setTarget]).toEqual([1, 2])
    expect([...mapTarget]).toEqual([
      ['one', 1],
      ['two', 2],
    ])
    expect(recordTarget.one).toBe(1)
    expect(recordTarget[Symbol.iterator]).toBe(2)
    expect([...reducerTarget]).toEqual([1, 2])
  })

  it('defines __proto__ record entries without invoking the legacy prototype setter', () => {
    const target = {} as Collector.MutableRecord<object>
    const payload = { safe: true }

    expect(Collector.collect([['__proto__', payload] as const], Collector.recordInto(target))).toBe(
      target,
    )

    expect(Object.getPrototypeOf(target)).toBe(Object.prototype)
    expect(Object.hasOwn(target, '__proto__')).toBe(true)
    expect(Object.getOwnPropertyDescriptor(target, '__proto__')).toEqual({
      value: payload,
      configurable: true,
      enumerable: true,
      writable: true,
    })
  })

  it('preserves isDone property absence and forwards an existing callback', () => {
    const collectorWithoutDone = Collector.contramap(Collector.array<number>(), (value: string) =>
      Number(value),
    )
    const reducerWithoutDone = Transducer.map((value: number) => value)(
      Transducer.arrayReducer<number>(),
    )

    expect(Object.hasOwn(collectorWithoutDone, 'isDone')).toBe(false)
    expect(Object.hasOwn(reducerWithoutDone, 'isDone')).toBe(false)

    const collectorDone = (): boolean => false
    const reducerDone = (): boolean => false
    const baseCollector: Collector.Collector<number, number[]> = {
      init: () => [],
      add: (state, value) => {
        state.push(value)
        return state
      },
      finish: (state) => state,
      isDone: collectorDone,
    }
    const baseReducer: Transducer.Reducer<number, number[]> = {
      init: () => [],
      step: (state, value) => {
        state.push(value)
        return state
      },
      complete: (state) => state,
      isDone: reducerDone,
    }
    const collectorWithDone = Collector.mapResult(baseCollector, (value) => value.length)
    const reducerWithDone = Transducer.filter<number>(() => true)(baseReducer)

    expect(Object.hasOwn(collectorWithDone, 'isDone')).toBe(true)
    expect(collectorWithDone.isDone).toBe(collectorDone)
    expect(Object.hasOwn(reducerWithDone, 'isDone')).toBe(true)
    expect(reducerWithDone.isDone).toBe(reducerDone)
  })
})
