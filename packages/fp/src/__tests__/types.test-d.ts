import { expectTypeOf, test } from 'vitest'
import type { Fn, LazyValue } from '../types'

test('Fn maps A to B', () => {
  expectTypeOf<Fn<string, number>>().toEqualTypeOf<(a: string) => number>()
})

test('LazyValue is a thunk returning A', () => {
  expectTypeOf<LazyValue<number>>().toEqualTypeOf<() => number>()
})
