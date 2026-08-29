import { expectTypeOf, test } from 'vite-plus/test'
import * as Indexed from '../indexed'
import type { Option } from '../option'
import * as Tuple from '../tuple'

declare const mixed: readonly (number | string)[]
const isString = (value: number | string): value is string => typeof value === 'string'

test('Indexed duals preserve inference, narrowing, and target identity', () => {
  expectTypeOf(Indexed.at([1, 2], 0)).toEqualTypeOf<Option<number>>()
  expectTypeOf(Indexed.at(0)([1, 2])).toEqualTypeOf<Option<number>>()
  expectTypeOf(Indexed.slice([1, 2])).toEqualTypeOf<number[]>()
  expectTypeOf(Indexed.slice()([1, 2])).toEqualTypeOf<number[]>()
  expectTypeOf(Indexed.map([1, 2], (value) => String(value))).toEqualTypeOf<string[]>()
  expectTypeOf(Indexed.map((value: number) => String(value))([1, 2])).toEqualTypeOf<string[]>()
  expectTypeOf(Indexed.filter(mixed, isString)).toEqualTypeOf<string[]>()
  expectTypeOf(Indexed.filter(isString)(mixed)).toEqualTypeOf<string[]>()
  expectTypeOf(Indexed.find(mixed, isString)).toEqualTypeOf<Option<string>>()
  expectTypeOf(Indexed.find(isString)(mixed)).toEqualTypeOf<Option<string>>()

  class NumberBucket extends Array<number> {
    readonly kind = 'number-bucket' as const
  }
  const target = new NumberBucket(4)
  expectTypeOf(Indexed.copyInto([1, 2], target)).toEqualTypeOf<NumberBucket>()
  expectTypeOf(Indexed.copyInto(target)([1, 2])).toEqualTypeOf<NumberBucket>()
  expectTypeOf(Indexed.mapInto([1, 2], target, (value) => value * 2)).toEqualTypeOf<NumberBucket>()
  expectTypeOf(
    Indexed.mapInto(target, (value: number) => value * 2)([1, 2]),
  ).toEqualTypeOf<NumberBucket>()

  // @ts-expect-error data alone is not a map configuration.
  Indexed.map([1, 2])
  // @ts-expect-error string sources cannot populate a number target.
  Indexed.copyInto(target)(['one'])
})

test('Tuple duals preserve variadic tuple structure', () => {
  const tuple = [1, true] as const
  expectTypeOf(Tuple.at(tuple, 0)).toEqualTypeOf<Option<1 | true>>()
  expectTypeOf(Tuple.at(0)(tuple)).toEqualTypeOf<Option<1 | true>>()
  expectTypeOf(Tuple.append(tuple, 'x' as const)).toEqualTypeOf<readonly [1, true, 'x']>()
  expectTypeOf(Tuple.append('x' as const)(tuple)).toEqualTypeOf<readonly [1, true, 'x']>()
  expectTypeOf(Tuple.prepend(tuple, 'x' as const)).toEqualTypeOf<readonly ['x', 1, true]>()
  expectTypeOf(Tuple.prepend('x' as const)(tuple)).toEqualTypeOf<readonly ['x', 1, true]>()
  expectTypeOf(Tuple.concat(tuple, ['x'] as const)).toEqualTypeOf<readonly [1, true, 'x']>()
  expectTypeOf(Tuple.concat(['x'] as const)(tuple)).toEqualTypeOf<readonly [1, true, 'x']>()
  expectTypeOf(Tuple.mapFirst(tuple, String)).toEqualTypeOf<readonly [string, true]>()
  expectTypeOf(Tuple.mapFirst((value: number) => String(value))(tuple)).toEqualTypeOf<
    readonly [string, true]
  >()
  expectTypeOf(Tuple.zip(tuple, ['a', 'b'] as const)).toEqualTypeOf<
    Array<readonly [1 | true, 'a' | 'b']>
  >()
  expectTypeOf(Tuple.zip(['a', 'b'] as const)(tuple)).toEqualTypeOf<
    Array<readonly [1 | true, 'a' | 'b']>
  >()

  // @ts-expect-error data alone is not a Tuple.map configuration.
  Tuple.map(tuple)
})
