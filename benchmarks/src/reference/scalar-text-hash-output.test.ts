import { describe, expect, it } from 'vite-plus/test'
import * as Eq from '../../../packages/fp/src/eq'
import * as Hash from '../../../packages/fp/src/hash'
import * as NumberOps from '../../../packages/fp/src/number'
import * as StringOps from '../../../packages/fp/src/string'
import {
  bigintBefore,
  camelCaseBefore,
  codePointLengthBefore,
  deepEqBefore,
  gcdBefore,
  hashUnknownBefore,
  numberBefore,
  roundToCurriedBefore,
  structHashBefore,
  symbolBefore,
  titleCaseBefore,
} from './scalar-text-hash-before'

describe('scalar/text/hash frozen-output parity', () => {
  it('matches text transforms for Unicode and separator-heavy inputs', () => {
    const values = [
      '',
      'helloWorld',
      'HTTPServer_value',
      'ÉCOLE déjà VU',
      '東京 Café42Value',
      '😀emoji_VALUE',
      'e\u0301-mixed_CASE',
    ] as const
    for (const value of values) {
      expect(StringOps.camelCase(value)).toBe(camelCaseBefore(value))
      expect(StringOps.titleCase(value)).toBe(titleCaseBefore(value))
      expect(StringOps.codePointLength(value)).toBe(
        codePointLengthBefore(value),
      )
    }
  })

  it('matches gcd and every curried rounding mode', () => {
    for (const [left, right] of [
      [54, 24],
      [-54.9, 24.8],
      [0, 7],
      [-0, 0],
      [1_836_311_903, 1_134_903_170],
    ] as const) {
      expect(Object.is(NumberOps.gcd(right)(left), gcdBefore(left, right))).toBe(
        true,
      )
    }
    for (const digits of [-4, 0, 2, 20]) {
      for (const mode of ['round', 'floor', 'ceil', 'trunc'] as const) {
        const current = NumberOps.roundTo(digits, mode)
        const before = roundToCurriedBefore(digits, mode)
        for (const value of [123.456, -123.456, -0, Number.NaN]) {
          expect(Object.is(current(value), before(value))).toBe(true)
        }
      }
    }
  })

  it('matches deep equality for primitives, cycles, symbols, and sparse arrays', () => {
    const symbol = Symbol('field')
    const left: Record<PropertyKey, unknown> = { a: 1, [symbol]: [2, 3] }
    const right: Record<PropertyKey, unknown> = { a: 1, [symbol]: [2, 3] }
    left.self = left
    right.self = right
    const sparse = new Array<unknown>(2)
    sparse[1] = 1
    const pairs: readonly (readonly [unknown, unknown])[] = [
      [Number.NaN, Number.NaN],
      [-0, 0],
      [left, right],
      [sparse, [undefined, 1]],
      [{ a: 1 }, { a: 2 }],
      [new Date(0), new Date(0)],
    ]
    for (const [self, that] of pairs) {
      expect(Eq.deep.equals(self, that)).toBe(
        deepEqBefore.equals(self, that),
      )
    }
  })

  it('matches every optimized hash family exactly', () => {
    for (const value of [
      Number.NaN,
      -0,
      0,
      1,
      -1,
      1.5,
      Infinity,
      -Infinity,
    ]) {
      expect(Hash.number.hash(value)).toBe(numberBefore.hash(value))
    }
    for (const value of [0n, -1n, 2n ** 100n]) {
      expect(Hash.bigint.hash(value)).toBe(bigintBefore.hash(value))
    }
    for (const value of [Symbol(), Symbol('x'), Symbol.for('global')]) {
      expect(Hash.symbol.hash(value)).toBe(symbolBefore.hash(value))
    }

    const symbol = Symbol('field')
    const fields = { name: Hash.string, [symbol]: Hash.number }
    const currentStruct = Hash.struct(fields)
    const beforeStruct = structHashBefore(fields)
    const record = { name: 'Ada', [symbol]: 42 }
    expect(currentStruct.hash(record)).toBe(beforeStruct.hash(record))

    const cyclic: Record<PropertyKey, unknown> = { value: 1 }
    cyclic.self = cyclic
    const corpus: unknown[] = [
      null,
      undefined,
      true,
      'text',
      [1, 'x', Number.NaN],
      { b: 2, a: 1, [symbol]: 'symbol' },
      cyclic,
      new Date(123),
      new Map<unknown, unknown>([
        ['a', 1],
        [{ key: 2 }, new Set([3, 4])],
      ]),
      new Uint8Array([1, 2, 255]),
      function named() {
        return undefined
      },
    ]
    for (const value of corpus) {
      expect(Hash.hashUnknown(value)).toBe(hashUnknownBefore(value))
    }
  })

  it('matches frozen struct hashing after construction under a temporary imul patch', () => {
    const fields = { value: Hash.number }
    const originalImul = Math.imul
    Math.imul = () => 0
    let current!: Hash.Hash<{ readonly value: number }>
    let before!: Hash.Hash<{ readonly value: number }>
    try {
      current = Hash.struct(fields)
      before = structHashBefore(fields)
    } finally {
      Math.imul = originalImul
    }

    expect(current.hash({ value: 42 })).toBe(before.hash({ value: 42 }))
  })
})
