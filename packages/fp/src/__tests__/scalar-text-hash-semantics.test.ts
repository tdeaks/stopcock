import { describe, expect, it } from 'vite-plus/test'
import * as Eq from '../eq'
import * as Hash from '../hash'
import * as NumberOps from '../number'
import * as StringOps from '../string'

describe('String scalar hot paths', () => {
  it('preserves case transform output across separators and Unicode text', () => {
    const values = [
      '',
      'HTTPServer_value',
      '--already kebab--',
      'ÉCOLE déjà VU',
      '東京 Café42Value',
      'e\u0301-mixed_CASE',
    ] as const

    expect(values.map(StringOps.camelCase)).toEqual([
      '',
      'httpserverValue',
      'alreadyKebab',
      'écoleDéjàVu',
      '東京Café42Value',
      'eMixedCase',
    ])
    expect(values.map(StringOps.kebabCase)).toEqual([
      '',
      'httpserver-value',
      'already-kebab',
      'école-déjà-vu',
      '東京-café42-value',
      'e-mixed-case',
    ])
    expect(values.map(StringOps.snakeCase)).toEqual([
      '',
      'httpserver_value',
      'already_kebab',
      'école_déjà_vu',
      '東京_café42_value',
      'e_mixed_case',
    ])
    expect(values.map(StringOps.titleCase)).toEqual([
      '',
      'Httpserver Value',
      'Already Kebab',
      'École Déjà Vu',
      '東京 Café42 Value',
      'E Mixed Case',
    ])
  })

  it('keeps camelCase locale conversion order and method receivers', () => {
    const originalLower = String.prototype.toLocaleLowerCase
    const originalUpper = String.prototype.toLocaleUpperCase
    const trace: string[] = []
    let output = ''
    String.prototype.toLocaleLowerCase = function (...locales): string {
      trace.push(`lower:${String(this)}`)
      return Reflect.apply(originalLower, this, locales)
    }
    String.prototype.toLocaleUpperCase = function (...locales): string {
      trace.push(`upper:${String(this)}`)
      return Reflect.apply(originalUpper, this, locales)
    }
    try {
      output = StringOps.camelCase('ALPHA_second_THREE')
    } finally {
      String.prototype.toLocaleLowerCase = originalLower
      String.prototype.toLocaleUpperCase = originalUpper
    }

    expect(output).toBe('alphaSecondThree')
    expect(trace).toEqual([
      'lower:ALPHA',
      'lower:second',
      'lower:THREE',
      'upper:s',
      'upper:t',
    ])
  })

  it('counts code points without allocating and preserves lone surrogates', () => {
    const values = [
      '',
      'plain',
      '😀a𝌆',
      '\ud800a',
      'a\udc00',
      '👨‍👩‍👧‍👦',
    ] as const
    for (const value of values) {
      expect(StringOps.codePointLength(value)).toBe(Array.from(value).length)
      expect(StringOps.codePoints(value)).toEqual(Array.from(value))
    }
  })
})

describe('Number scalar hot paths', () => {
  it('preserves Euclidean gcd normalization and edge values', () => {
    expect(NumberOps.gcd(54, 24)).toBe(6)
    expect(NumberOps.gcd(-54.9, 24.8)).toBe(6)
    expect(NumberOps.gcd(0, 7)).toBe(7)
    expect(Object.is(NumberOps.gcd(-0, 0), 0)).toBe(true)
  })

  it('keeps curried roundTo identical to data-first execution', () => {
    const values = [123.456, -123.456, 0, -0, Number.NaN] as const
    const digits = [-3, 0, 2, 20] as const
    const modes = ['round', 'floor', 'ceil', 'trunc'] as const
    for (const digit of digits) {
      for (const mode of modes) {
        const round = NumberOps.roundTo(digit, mode)
        for (const value of values) {
          expect(Object.is(round(value), NumberOps.roundTo(value, digit, mode))).toBe(
            true,
          )
        }
      }
    }
  })

  it('retains the Math rounding method receiver in curried form', () => {
    const original = Math.round
    let receiver: unknown
    Math.round = function (this: unknown, value: number): number {
      receiver = this
      return Reflect.apply(original, Math, [value])
    }
    let output = 0
    try {
      output = NumberOps.roundTo(2, 'round')(1.234)
    } finally {
      Math.round = original
    }
    expect(output).toBe(1.23)
    expect(receiver).toBe(Math)
  })

  it('retains invocation-time Math.trunc lookup in curried form', () => {
    const round = NumberOps.roundTo(2, 'round')
    const original = Math.trunc
    let receiver: unknown
    Math.trunc = function (this: unknown): number {
      receiver = this
      return 1
    }
    let output = 0
    try {
      output = round(1.26)
    } finally {
      Math.trunc = original
    }
    expect(output).toBe(1.3)
    expect(receiver).toBe(Math)
  })
})

describe('Eq.deep compact traversal', () => {
  it('preserves primitive, reference, sparse, and cyclic semantics', () => {
    expect(Eq.deep.equals(Number.NaN, Number.NaN)).toBe(true)
    expect(Eq.deep.equals(-0, 0)).toBe(true)
    const reference = { value: 1 }
    expect(Eq.deep.equals(reference, reference)).toBe(true)

    const sparse = new Array<unknown>(2)
    sparse[1] = { value: 1 }
    expect(Eq.deep.equals(sparse, [undefined, { value: 1 }])).toBe(true)

    const left: { value: number; self?: unknown } = { value: 1 }
    left.self = left
    const right: { value: number; self?: unknown } = { value: 1 }
    right.self = right
    expect(Eq.deep.equals(left, right)).toBe(true)
    right.value = 2
    expect(Eq.deep.equals(left, right)).toBe(false)
  })

  it('compacts enumerable keys without changing proxy trap order', () => {
    const symbol = Symbol('visible')
    const trace: string[] = []
    const makeProxy = (side: string) =>
      new Proxy(
        Object.defineProperties(
          { visible: 1, [symbol]: 2 },
          { hidden: { configurable: true, enumerable: false, value: 3 } },
        ),
        {
          ownKeys(target) {
            trace.push(`${side}:keys`)
            return Reflect.ownKeys(target)
          },
          getOwnPropertyDescriptor(target, key) {
            trace.push(`${side}:descriptor:${String(key)}`)
            return Reflect.getOwnPropertyDescriptor(target, key)
          },
          get(target, key, receiver) {
            trace.push(`${side}:get:${String(key)}`)
            return Reflect.get(target, key, receiver)
          },
        },
      )

    expect(Eq.deep.equals(makeProxy('left'), makeProxy('right'))).toBe(true)
    expect(trace).toEqual([
      'left:keys',
      'left:descriptor:visible',
      'left:descriptor:hidden',
      'left:descriptor:Symbol(visible)',
      'right:keys',
      'right:descriptor:visible',
      'right:descriptor:hidden',
      'right:descriptor:Symbol(visible)',
      'right:descriptor:visible',
      'left:get:visible',
      'right:get:visible',
      'right:descriptor:Symbol(visible)',
      'left:get:Symbol(visible)',
      'right:get:Symbol(visible)',
    ])
  })
})

describe('Hash precomputation preserves exact output formulas', () => {
  const FNV_OFFSET = 0x811c9dc5
  const CYCLE_HASH = 0x42108425

  it('preserves prefixed primitive hashes', () => {
    for (const value of [Number.NaN, -0, 0, 1, -1, 1.5, Infinity, -Infinity]) {
      const normalized = Number.isNaN(value) ? 'NaN' : String(value === 0 ? 0 : value)
      expect(Hash.number.hash(value)).toBe(Hash.string.hash(`number:${normalized}`))
    }
    for (const value of [0n, 1n, -1n, 2n ** 100n]) {
      expect(Hash.bigint.hash(value)).toBe(Hash.string.hash(`bigint:${value}`))
    }
    const symbols = [Symbol(), Symbol('x'), Symbol.for('global')]
    for (const value of symbols) {
      const description = Symbol.keyFor(value) ?? value.description ?? ''
      expect(Hash.symbol.hash(value)).toBe(Hash.string.hash(`symbol:${description}`))
    }
  })

  it('falls back to public string hashing when hash intrinsics are replaced', () => {
    const stringInstance = Hash.string as {
      hash: (value: string) => number
    }
    const originalStringHash = stringInstance.hash
    const struct = Hash.struct({ value: Hash.number })
    const receivers: unknown[] = []
    stringInstance.hash = function (this: unknown): number {
      receivers.push(this)
      return 123
    }
    try {
      expect(Hash.number.hash(1)).toBe(123)
      expect(Hash.bigint.hash(1n)).toBe(123)
      expect(Hash.symbol.hash(Symbol('x'))).toBe(123)
      let expectedStruct = Hash.combine(FNV_OFFSET, 123)
      expectedStruct = Hash.combine(expectedStruct, 123)
      expect(struct.hash({ value: 1 })).toBe(expectedStruct)
      expect(Hash.hashUnknown('x')).toBe(Hash.combine(123, 123))
    } finally {
      stringInstance.hash = originalStringHash
    }
    expect(receivers.every((receiver) => receiver === Hash.string)).toBe(true)

    const originalImul = Math.imul
    Math.imul = function (
      this: unknown,
      left: number,
      right: number,
    ): number {
      return Reflect.apply(originalImul, Math, [left, right])
    }
    try {
      expect(Hash.number.hash(123)).toBe(
        Hash.string.hash('number:123'),
      )
    } finally {
      Math.imul = originalImul
    }
  })

  it('does not capture a temporary Math.imul patch while constructing a struct', () => {
    const originalImul = Math.imul
    Math.imul = () => 0
    let constructedDuringPatch!: Hash.Hash<{ readonly value: number }>
    try {
      constructedDuringPatch = Hash.struct({ value: Hash.number })
    } finally {
      Math.imul = originalImul
    }

    const constructedAfterRestore = Hash.struct({ value: Hash.number })
    const record = { value: 1 }
    let expected = Hash.combine(FNV_OFFSET, Hash.string.hash('value'))
    expected = Hash.combine(expected, Hash.number.hash(record.value))
    expect(constructedDuringPatch.hash(record)).toBe(expected)
    expect(constructedDuringPatch.hash(record)).toBe(
      constructedAfterRestore.hash(record),
    )
  })

  it('preserves precomputed struct property-key hashes and dynamic fields', () => {
    const symbol = Symbol('field')
    const fields: {
      name: Hash.Hash<string>
      [symbol]: Hash.Hash<number>
    } = {
      name: Hash.string,
      [symbol]: Hash.number,
    }
    const instance = Hash.struct(fields)
    const value = { name: 'Ada', [symbol]: 42 }
    let expected = FNV_OFFSET
    expected = Hash.combine(expected, Hash.string.hash('name'))
    expected = Hash.combine(expected, Hash.string.hash(value.name))
    expected = Hash.combine(expected, Hash.string.hash(String(symbol)))
    expected = Hash.combine(expected, Hash.number.hash(value[symbol]))
    expect(instance.hash(value)).toBe(expected)

    fields.name = { hash: () => 123 }
    expect(instance.hash(value)).not.toBe(expected)
  })

  it('preserves hashUnknown tags, sorted keys, bytes, and cycle markers', () => {
    const array = [1, 'x']
    let expectedArray = Hash.combine(Hash.string.hash('Array'), array.length)
    expectedArray = Hash.combine(expectedArray, Hash.number.hash(1))
    expectedArray = Hash.combine(
      expectedArray,
      Hash.combine(Hash.string.hash('string'), Hash.string.hash('x')),
    )
    expect(Hash.hashUnknown(array)).toBe(expectedArray)

    const record = { b: 2, a: 1 }
    let expectedRecord = Hash.combine(
      Hash.string.hash('[object Object]'),
      2,
    )
    expectedRecord = Hash.combine(expectedRecord, Hash.string.hash('a'))
    expectedRecord = Hash.combine(expectedRecord, Hash.number.hash(1))
    expectedRecord = Hash.combine(expectedRecord, Hash.string.hash('b'))
    expectedRecord = Hash.combine(expectedRecord, Hash.number.hash(2))
    expect(Hash.hashUnknown(record)).toBe(expectedRecord)

    const bytes = new Uint8Array([1, 2, 255])
    let expectedBytes = Hash.combine(
      Hash.string.hash('[object Uint8Array]'),
      bytes.length,
    )
    for (const byte of bytes) expectedBytes = Hash.combine(expectedBytes, byte)
    expect(Hash.hashUnknown(bytes)).toBe(expectedBytes)

    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    let expectedCycle = Hash.combine(
      Hash.string.hash('[object Object]'),
      1,
    )
    expectedCycle = Hash.combine(expectedCycle, Hash.string.hash('self'))
    expectedCycle = Hash.combine(
      expectedCycle,
      Hash.combine(CYCLE_HASH, 0),
    )
    expect(Hash.hashUnknown(cyclic)).toBe(expectedCycle)
  })
})
