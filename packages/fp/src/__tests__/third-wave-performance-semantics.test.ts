import { describe, expect, it } from 'vite-plus/test'
import * as Match from '../match'
import type { Monoid } from '../monoid'
import { none, some } from '../option'
import * as Option from '../option'
import * as Recursion from '../recursion'
import { err, ok } from '../result'
import * as Schema from '../schema'
import type { Writer as WriterValue } from '../writer'
import * as Writer from '../writer'

const suspendedValue = (events: string[]): Recursion.Trampoline<number> => {
  const terminal: Recursion.Now<number> = {
    get _tag(): 'Now' {
      events.push('terminal:tag')
      return 'Now'
    },
    get value(): number {
      events.push('terminal:value')
      return 2
    },
  }
  return {
    get _tag(): 'Suspend' {
      events.push('source:tag')
      return 'Suspend'
    },
    get thunk(): () => Recursion.Trampoline<number> {
      events.push('source:thunk:get')
      return () => {
        events.push('source:thunk:call')
        return terminal
      }
    },
  }
}

describe('recursion allocation fast paths', () => {
  it('maps and flatMaps suspended values with the original forcing order', () => {
    const mapEvents: string[] = []
    const mapped = Recursion.map((value: number) => {
      mapEvents.push(`map:${value}`)
      return value + 1
    })(suspendedValue(mapEvents))
    expect(mapEvents).toEqual(['source:tag'])
    expect(Recursion.run(mapped)).toBe(3)
    expect(mapEvents).toEqual([
      'source:tag',
      'source:thunk:get',
      'source:thunk:call',
      'terminal:tag',
      'terminal:value',
      'map:2',
    ])

    const flatMapEvents: string[] = []
    const flattened = Recursion.flatMap((value: number) => {
      flatMapEvents.push(`flatMap:${value}`)
      return Recursion.suspend(() => Recursion.now(value * 2))
    })(suspendedValue(flatMapEvents))
    expect(Recursion.run(flattened)).toBe(4)
    expect(flatMapEvents).toEqual([
      'source:tag',
      'source:thunk:get',
      'source:thunk:call',
      'terminal:tag',
      'terminal:value',
      'flatMap:2',
    ])
  })

  it('memoizes defined and undefined results with SameValueZero keys', () => {
    const calls: string[] = []
    const cachedUndefined = Recursion.memoFix<number, undefined>(
      (_recur, value) => {
        calls.push(`undefined:${String(value)}`)
        return undefined
      },
    )
    expect(cachedUndefined(Number.NaN)).toBeUndefined()
    expect(cachedUndefined(Number.NaN)).toBeUndefined()
    expect(cachedUndefined(1)).toBeUndefined()
    expect(cachedUndefined(1)).toBeUndefined()
    expect(calls).toEqual(['undefined:NaN', 'undefined:1'])

    const cachedNumber = Recursion.memoFix<number, string>(
      (_recur, value) => {
        calls.push(`number:${String(value)}`)
        return Object.is(value, -0) ? 'negative-zero' : String(value)
      },
    )
    expect(cachedNumber(-0)).toBe('negative-zero')
    expect(cachedNumber(0)).toBe('negative-zero')
    expect(calls).toEqual(['undefined:NaN', 'undefined:1', 'number:0'])
  })
})

describe('match direct dispatch', () => {
  type Shape =
    | { readonly kind: 'circle'; readonly radius: number }
    | { readonly kind: 'square'; readonly side: number }

  const observedShape = (events: string[]): Shape =>
    new Proxy(
      { kind: 'circle', radius: 2 } as const,
      {
        get(target, key, receiver) {
          events.push(`value:${String(key)}`)
          return Reflect.get(target, key, receiver)
        },
      },
    )

  const observedHandlers = (
    events: string[],
  ): Match.Handlers<Shape, 'kind', number> =>
    new Proxy(
      {
        circle: function (
          this: unknown,
          value: Extract<Shape, { readonly kind: 'circle' }>,
        ): number {
          events.push(`handler:${String(this === undefined)}`)
          return value.radius
        },
        square: (value: Extract<Shape, { readonly kind: 'square' }>) =>
          value.side,
      },
      {
        get(target, key, receiver) {
          events.push(`handlers:${String(key)}`)
          return Reflect.get(target, key, receiver)
        },
      },
    )

  it('preserves lookup and receiver order for data-first and curried discriminants', () => {
    const dataFirstEvents: string[] = []
    expect(
      Match.discriminant(
        'kind',
        observedShape(dataFirstEvents),
        observedHandlers(dataFirstEvents),
      ),
    ).toBe(2)
    expect(dataFirstEvents).toEqual([
      'value:kind',
      'handlers:circle',
      'handler:true',
      'value:radius',
    ])

    const curriedEvents: string[] = []
    const run = Match.discriminant(
      'kind',
      observedHandlers(curriedEvents),
    )
    expect(curriedEvents).toEqual([])
    expect(run(observedShape(curriedEvents))).toBe(2)
    expect(curriedEvents).toEqual(dataFirstEvents)
  })

  it('keeps tagged data-first and curried dispatch equivalent', () => {
    type Value =
      | { readonly _tag: 'Left'; readonly value: number }
      | { readonly _tag: 'Right'; readonly value: number }
    const handlers: Match.TaggedHandlers<Value, number> = {
      Left: (value) => -value.value,
      Right: (value) => value.value,
    }
    const input: Value = { _tag: 'Right', value: 3 }
    expect(Match.tag(input, handlers)).toBe(3)
    expect(Match.tag(handlers)(input)).toBe(3)
  })
})

describe('schema mapped validation', () => {
  it('preserves synchronous success and failure evaluation order', () => {
    const events: string[] = []
    const source = Schema.make((value) => {
      events.push(`decode:${String(value)}`)
      return typeof value === 'number' ? ok(value) : err('number required')
    })
    const mapped = Schema.map(source, (value) => {
      events.push(`transform:${value}`)
      return value * 2
    })

    expect(Schema.validateSync(2, mapped)).toEqual(ok(4))
    expect(Schema.validateSync('no', mapped)).toEqual(
      err([{ message: 'number required' }]),
    )
    expect(events).toEqual(['decode:2', 'transform:2', 'decode:no'])
  })

  it('keeps asynchronous transforms ordered after decoding', async () => {
    const events: string[] = []
    const source = Schema.make(async (value) => {
      events.push(`decode:${String(value)}`)
      return ok(Number(value))
    })
    const mapped = Schema.map(source, (value) => {
      events.push(`transform:${value}`)
      return value + 1
    })

    const pending = Schema.validate(2, mapped)
    expect(events).toEqual(['decode:2'])
    expect(await pending).toEqual(ok(3))
    expect(events).toEqual(['decode:2', 'transform:2'])
  })
})

const observedWriter = <A>(
  label: string,
  value: A,
  output: string,
  events: string[],
): WriterValue<string, A> =>
  new Proxy([value, output] as const, {
    get(target, key, receiver) {
      if (key === '0' || key === '1') events.push(`${label}:${key}`)
      return Reflect.get(target, key, receiver)
    },
  })

const observedMonoid = (
  events: string[],
  onCombine?: () => void,
): Monoid<string> => {
  let instance: Monoid<string>
  const target: Monoid<string> = {
    empty: '',
    combine(this: unknown, self, that) {
      events.push(`combine:${String(this === instance)}:${self}:${that}`)
      onCombine?.()
      return self + that
    },
    combineMany(self, values) {
      let result = self
      for (const value of values) result += value
      return result
    },
    combineAll(values) {
      let result = ''
      for (const value of values) result += value
      return result
    },
  }
  instance = new Proxy(target, {
    get(value, key, receiver) {
      if (key === 'empty' || key === 'combine') {
        events.push(`monoid:${String(key)}`)
      }
      return Reflect.get(value, key, receiver)
    },
  })
  return instance
}

describe('writer direct zip and sequence', () => {
  it('preserves zip tuple reads and Monoid receiver ordering', () => {
    const events: string[] = []
    const output = observedMonoid(events)
    const self = observedWriter('self', 1, 'a', events)
    const that = observedWriter('that', 2, 'b', events)

    expect(Writer.zip(output)(that)(self)).toEqual([[1, 2], 'ab'])
    expect(events).toEqual([
      'self:0',
      'that:0',
      'monoid:combine',
      'self:1',
      'that:1',
      'combine:true:a:b',
    ])
  })

  it('sequences dynamically grown inputs with dense read order', () => {
    const events: string[] = []
    const values: WriterValue<string, number>[] = []
    let combined = false
    const output = observedMonoid(events, () => {
      if (!combined) {
        combined = true
        values.push(observedWriter('second', 2, 'b', events))
      }
    })
    values.push(observedWriter('first', 1, 'a', events))
    const source = new Proxy(values, {
      get(target, key, receiver) {
        if (key === 'length' || key === '0' || key === '1') {
          events.push(`values:${String(key)}`)
        }
        return Reflect.get(target, key, receiver)
      },
    })

    expect(Writer.sequenceReadonlyArray(output)(source)).toEqual([
      [1, 2],
      'ab',
    ])
    expect(events).toEqual([
      'values:length',
      'monoid:empty',
      'values:length',
      'values:0',
      'first:0',
      'monoid:combine',
      'first:1',
      'combine:true::a',
      'values:length',
      'values:1',
      'second:0',
      'monoid:combine',
      'second:1',
      'combine:true:a:b',
      'values:length',
    ])
  })
})

describe('Option traversal optimization boundaries', () => {
  it('retains dynamic length, dense holes, and callback order', () => {
    const events: string[] = []
    const values = [1]
    const source = new Proxy(values, {
      get(target, key, receiver) {
        if (key === 'length' || key === '0' || key === '1') {
          events.push(`get:${String(key)}`)
        }
        return Reflect.get(target, key, receiver)
      },
    })
    const result = Option.traverse(source, (value, index) => {
      events.push(`callback:${index}:${value}`)
      if (index === 0) values.push(2)
      return some(value * 10)
    })
    expect(result).toEqual(some([10, 20]))
    expect(events).toEqual([
      'get:length',
      'get:0',
      'callback:0:1',
      'get:length',
      'get:1',
      'callback:1:2',
      'get:length',
    ])

    const sparse = new Array<number | undefined>(2)
    sparse[1] = 2
    expect(
      Option.traverse(sparse, (value) => some(value ?? 0)),
    ).toEqual(some([0, 2]))
  })

  it('stops without a trailing length read and preserves exotic lengths', () => {
    const events: string[] = []
    const source = new Proxy([1, 2], {
      get(target, key, receiver) {
        if (key === 'length' || key === '0' || key === '1') {
          events.push(`get:${String(key)}`)
        }
        return Reflect.get(target, key, receiver)
      },
    })
    expect(
      Option.traverse(source, (value, index) => {
        events.push(`callback:${index}:${value}`)
        return none
      }),
    ).toBe(none)
    expect(events).toEqual(['get:length', 'get:0', 'callback:0:1'])

    const fractional = new Proxy([] as number[], {
      get(_target, key) {
        if (key === 'length') return 1.5
        if (key === '0') return 3
        if (key === '1') return 4
        return undefined
      },
    })
    expect(
      Option.traverse(fractional, (value) => some(value)),
    ).toEqual(some([3, 4]))
  })

  it('leaves all on iterator semantics and closes custom iterators', () => {
    const events: string[] = []
    const values = [some(1), none, some(3)]
    Object.defineProperty(values, Symbol.iterator, {
      configurable: true,
      value: function* () {
        try {
          events.push('yield:3')
          yield values[2] as Option.Option<number>
          events.push('yield:none')
          yield values[1] as Option.Option<number>
          events.push('yield:1')
          yield values[0] as Option.Option<number>
        } finally {
          events.push('close')
        }
      },
    })

    expect(Option.all(values)).toBe(none)
    expect(events).toEqual(['yield:3', 'yield:none', 'close'])
  })

  it('retains the observable Array.prototype.push contract', () => {
    const calls: unknown[][] = []
    const original = Array.prototype.push
    Array.prototype.push = function <T>(
      this: T[],
      ...values: T[]
    ): number {
      calls[calls.length] = values
      return Reflect.apply(original, this, values) as number
    }
    let result: Option.Option<number[]> | undefined
    try {
      result = Option.traverse([1, 2], (value) =>
        some(value * 2),
      )
    } finally {
      Array.prototype.push = original
    }
    expect(result).toEqual(some([2, 4]))
    expect(calls).toEqual([[2], [4]])
  })
})
