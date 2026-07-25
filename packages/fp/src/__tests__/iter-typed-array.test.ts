import { runInNewContext } from 'node:vm'
import { describe, expect, test } from 'vite-plus/test'
import { admitTypedArraySource } from '../internal/typed-array-source'
import * as Iter from '../iter'
import { none, some, type Option } from '../option'

/**
 * An admitted typed array runs a generated indexed kernel; every other typed
 * array iterates. The oracle is the same view behind a wrapper that hides it
 * from admission, so both sides read the same elements through the same
 * iterator and any disagreement is the kernel's.
 */

const hidden = <A>(source: Iterable<A>): Iterable<A> => ({
  [Symbol.iterator]: () => source[Symbol.iterator](),
})

type Call = readonly [stage: string, value: unknown, index: number]

interface Stages {
  readonly calls: Call[]
  readonly double: (value: unknown, index: number) => unknown
  readonly keep: (value: unknown, index: number) => boolean
  readonly halve: (value: unknown, index: number) => Option<unknown>
  readonly sum: (state: unknown, value: unknown, index: number) => unknown
}

const stages = (): Stages => {
  const calls: Call[] = []
  return {
    calls,
    double: (value, index) => {
      calls.push(['map', value, index])
      return Number(value) * 2
    },
    keep: (value, index) => {
      calls.push(['filter', value, index])
      return Number(value) % 3 !== 0
    },
    halve: (value, index) => {
      calls.push(['filterMap', value, index])
      return Number(value) % 4 === 0 ? some(Number(value) / 2) : none
    },
    sum: (state, value, index) => {
      calls.push(['scan', value, index])
      return Number(state) + Number(value)
    },
  }
}

const SHAPES: Readonly<
  Record<string, (source: Iterable<unknown>, s: Stages) => Iterable<unknown>>
> = {
  map: (source, s) => Iter.map(source, s.double),
  filter: (source, s) => Iter.filter(source, s.keep),
  filterMap: (source, s) => Iter.filterMap(source, s.halve),
  take: (source) => Iter.take(source, 5),
  drop: (source) => Iter.drop(source, 5),
  takeWhile: (source, s) => Iter.takeWhile(source, s.keep),
  dropWhile: (source, s) => Iter.dropWhile(source, s.keep),
  scan: (source, s) => Iter.scan(source, s.sum, 0),
  'map-filter': (source, s) => Iter.filter(Iter.map(source, s.double), s.keep),
  'map-filter-take': (source, s) => Iter.take(Iter.filter(Iter.map(source, s.double), s.keep), 3),
  'filter-map-take': (source, s) => Iter.take(Iter.map(Iter.filter(source, s.keep), s.double), 3),
  'filterMap-take': (source, s) => Iter.take(Iter.filterMap(source, s.halve), 3),
  'scan-filterMap': (source, s) => Iter.filterMap(Iter.scan(source, s.sum, 0), s.halve),
  'flatMap-map-filter': (source, s) =>
    Iter.filter(
      Iter.map(
        Iter.flatMap(source, (value) => [value, value]),
        s.double,
      ),
      s.keep,
    ),
}

const TERMINALS: Readonly<Record<string, (plan: Iterable<unknown>) => unknown>> = {
  toArray: (plan) => Iter.toArray(plan),
  toArrayInto: (plan) => Iter.toArrayInto(plan, ['seed'] as unknown[]),
  reduce: (plan) => Iter.reduce(plan, (state: number, value) => state + Number(value), 0),
  find: (plan) => Iter.find(plan, (value) => Number(value) > 10),
  findOrUndefined: (plan) => Iter.findOrUndefined(plan, (value) => Number(value) > 10),
  some: (plan) => Iter.some(plan, (value) => Number(value) > 10),
  every: (plan) => Iter.every(plan, (value) => Number(value) > 10),
  count: (plan) => Iter.count(plan),
  forEach: (plan) => {
    const seen: unknown[] = []
    Iter.forEach(plan, (value) => seen.push(value))
    return seen
  },
  first: (plan) => Iter.first(plan),
  firstOrUndefined: (plan) => Iter.firstOrUndefined(plan),
  last: (plan) => Iter.last(plan),
  lastOrUndefined: (plan) => Iter.lastOrUndefined(plan),
  nth: (plan) => Iter.nth(plan, 2),
  nthOrUndefined: (plan) => Iter.nthOrUndefined(plan, 2),
}

const numbers = Array.from({ length: 24 }, (_, index) => index + 1)

const FAMILIES: Readonly<Record<string, () => ArrayBufferView & Iterable<unknown>>> = {
  int8: () => new Int8Array(numbers),
  uint8: () => new Uint8Array(numbers),
  uint8clamped: () => new Uint8ClampedArray(numbers),
  int16: () => new Int16Array(numbers),
  uint16: () => new Uint16Array(numbers),
  int32: () => new Int32Array(numbers),
  uint32: () => new Uint32Array(numbers),
  float32: () => new Float32Array(numbers),
  float64: () => new Float64Array(numbers),
  bigint64: () => new BigInt64Array(numbers.map(BigInt)),
  biguint64: () => new BigUint64Array(numbers.map(BigInt)),
}

const Float16 = Reflect.get(globalThis, 'Float16Array') as
  | (new (values: readonly number[]) => ArrayBufferView & Iterable<unknown>)
  | undefined
if (Float16 !== undefined) FAMILIES.float16 = () => new Float16(numbers)

describe('typed-array source admission', () => {
  test('every shape and terminal agrees with generic iteration', () => {
    const source = new Float64Array(numbers)
    for (const [shapeId, shape] of Object.entries(SHAPES)) {
      for (const [terminalId, terminal] of Object.entries(TERMINALS)) {
        const admitted = stages()
        const oracle = stages()
        const id = `${shapeId}/${terminalId}`
        expect([id, terminal(shape(source, admitted))]).toEqual([
          id,
          terminal(shape(hidden(source), oracle)),
        ])
        expect([id, admitted.calls]).toEqual([id, oracle.calls])
      }
    }
  })

  test('every family in this realm agrees with generic iteration', () => {
    for (const [family, make] of Object.entries(FAMILIES)) {
      const source = make()
      const admitted = stages()
      const oracle = stages()
      expect([family, Iter.toArray(SHAPES['map-filter'](source, admitted))]).toEqual([
        family,
        Iter.toArray(SHAPES['map-filter'](hidden(source), oracle)),
      ])
      expect([family, admitted.calls]).toEqual([family, oracle.calls])
      expect(admitTypedArraySource(source)).toBe(numbers.length)
    }
  })

  test('an empty view is admitted and produces nothing', () => {
    expect(admitTypedArraySource(new Uint8Array(0))).toBe(0)
    expect(Iter.toArray(Iter.map(new Uint8Array(0), (value) => value))).toEqual([])
  })
})

describe('values a kernel must not touch', () => {
  const rejected = (value: object): void => {
    expect(admitTypedArraySource(value)).toBe(-1)
  }

  test('a subclass keeps iterating', () => {
    class Loud extends Uint8Array {}
    rejected(new Loud(numbers))
  })

  test('an own constructor keeps iterating', () => {
    const view = new Uint8Array(numbers)
    Object.defineProperty(view, 'constructor', { value: Uint8Array })
    rejected(view)
  })

  test('an own iterator keeps iterating, and its values are the ones observed', () => {
    const view = new Uint8Array([1, 2, 3])
    Object.defineProperty(view, Symbol.iterator, {
      value: function* () {
        yield 9
      },
    })
    rejected(view)
    expect(Iter.toArray(Iter.map(view, (value) => value))).toEqual([9])
  })

  test('a family prototype iterator keeps iterating', () => {
    const original = Object.getOwnPropertyDescriptor(Int16Array.prototype, Symbol.iterator)
    Object.defineProperty(Int16Array.prototype, Symbol.iterator, {
      configurable: true,
      value: function* () {
        yield 7
      },
    })
    try {
      rejected(new Int16Array([1, 2, 3]))
      expect(Iter.toArray(Iter.map(new Int16Array([1, 2, 3]), (value) => value))).toEqual([7])
    } finally {
      if (original) Object.defineProperty(Int16Array.prototype, Symbol.iterator, original)
      else Reflect.deleteProperty(Int16Array.prototype, Symbol.iterator)
    }
  })

  test('a shared prototype iterator keeps iterating', () => {
    const shared = Object.getPrototypeOf(Uint8Array.prototype) as object
    const original = Object.getOwnPropertyDescriptor(shared, Symbol.iterator)
    Object.defineProperty(shared, Symbol.iterator, {
      configurable: true,
      value: function* () {
        yield 5
      },
    })
    try {
      rejected(new Uint8Array([1, 2, 3]))
    } finally {
      if (original) Object.defineProperty(shared, Symbol.iterator, original)
    }
  })

  test('a cross-realm view keeps iterating', () => {
    const foreign = runInNewContext('new Uint8Array([1, 2, 3])') as Uint8Array
    rejected(foreign)
    expect(Iter.toArray(Iter.map(foreign, (value) => value))).toEqual([1, 2, 3])
  })

  test('a DataView is never a source', () => {
    rejected(new DataView(new ArrayBuffer(8)))
  })

  test('a resizable buffer keeps iterating, tracking and fixed-length alike', () => {
    const buffer = new ArrayBuffer(8, { maxByteLength: 16 })
    rejected(new Uint8Array(buffer))
    rejected(new Uint8Array(buffer, 0, 4))
  })

  test('a growable SharedArrayBuffer keeps iterating and a fixed one is admitted', () => {
    if (typeof SharedArrayBuffer === 'undefined') return
    rejected(new Uint8Array(new SharedArrayBuffer(8, { maxByteLength: 16 })))
    expect(admitTypedArraySource(new Uint8Array(new SharedArrayBuffer(8)))).toBe(8)
  })

  test('a detached view keeps iterating, so it throws where iteration throws', () => {
    const buffer = new ArrayBuffer(8)
    const view = new Uint8Array(buffer)
    structuredClone(buffer, { transfer: [buffer] })
    rejected(view)
    expect(() => Iter.toArray(Iter.map(view, (value) => value))).toThrow(TypeError)
  })

  test('a proxy over a view is never a source', () => {
    rejected(new Proxy(new Uint8Array([1, 2, 3]), {}))
  })
})

describe('detachment under a running traversal', () => {
  const detachAt = (
    trigger: number,
  ): { readonly view: Uint8Array; readonly detach: (value: unknown) => void } => {
    const buffer = new ArrayBuffer(16)
    const view = new Uint8Array(buffer)
    for (let index = 0; index < view.length; index++) view[index] = index + 1
    return {
      view,
      detach: (value) => {
        if (Number(value) === trigger) structuredClone(buffer, { transfer: [buffer] })
      },
    }
  }

  test('a stage callback that detaches throws, exactly as iteration does', () => {
    const admitted = detachAt(4)
    const oracle = detachAt(4)
    expect(() =>
      Iter.toArray(
        Iter.map(admitted.view, (value) => {
          admitted.detach(value)
          return value
        }),
      ),
    ).toThrow(TypeError)
    expect(() =>
      Iter.toArray(
        Iter.map(hidden(oracle.view), (value) => {
          oracle.detach(value)
          return value
        }),
      ),
    ).toThrow(TypeError)
  })

  test('a terminal callback that detaches throws, and the effects already run stand', () => {
    const admitted = detachAt(4)
    const seen: unknown[] = []
    expect(() =>
      Iter.forEach(
        Iter.map(admitted.view, (value) => value),
        (value) => {
          seen.push(value)
          admitted.detach(value)
        },
      ),
    ).toThrow(TypeError)
    expect(seen).toEqual([1, 2, 3, 4])
  })

  test('a reducer that detaches throws rather than reporting a short answer', () => {
    const admitted = detachAt(4)
    expect(() =>
      Iter.reduce(
        Iter.map(admitted.view, (value) => value),
        (state: number, value) => {
          admitted.detach(value)
          return state + Number(value)
        },
        0,
      ),
    ).toThrow(TypeError)
  })

  test('a detach on the last element still throws, because iteration asks once more', () => {
    const run = (wrap: (view: Uint8Array) => Iterable<unknown>): void => {
      const buffer = new ArrayBuffer(4)
      const view = new Uint8Array(buffer)
      view.set([1, 2, 3, 4])
      Iter.toArray(
        Iter.map(wrap(view), (value) => {
          if (value === 4) structuredClone(buffer, { transfer: [buffer] })
          return value
        }),
      )
    }
    expect(() => run((view) => view)).toThrow(TypeError)
    expect(() => run(hidden)).toThrow(TypeError)
  })

  test('a hot kernel stops at the detach rather than reading past it', () => {
    // The guarantee is that the loop re-reads length every iteration. Warm the
    // kernel first, because an optimised loop that hoisted the read would feed
    // the callback undefined instead of stopping.
    const warm = new Uint8Array(16)
    for (let round = 0; round < 20_000; round++) {
      Iter.forEach(
        Iter.map(warm, (value) => value),
        () => {},
      )
    }
    const admitted = detachAt(4)
    const seen: unknown[] = []
    expect(() =>
      Iter.forEach(
        Iter.map(admitted.view, (value) => {
          admitted.detach(value)
          return value
        }),
        (value) => seen.push(value),
      ),
    ).toThrow(TypeError)
    expect(seen).toEqual([1, 2, 3, 4])
  })

  test('an early-exit terminal is never admitted, so a detaching predicate answers', () => {
    const admitted = detachAt(4)
    expect(
      Iter.findOrUndefined(
        Iter.map(admitted.view, (value) => value),
        (value) => {
          admitted.detach(value)
          return value === 4
        },
      ),
    ).toBe(4)
  })
})
