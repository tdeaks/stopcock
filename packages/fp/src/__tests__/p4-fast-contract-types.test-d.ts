import { expectTypeOf, test } from 'vite-plus/test'
import * as MapOps from '../map'
import * as Obj from '../object'
import type { Option } from '../option'

interface User {
  readonly id: number
  readonly profile: {
    readonly name: string
    readonly address: { readonly city: string }
    readonly nickname?: string
  }
  readonly scores: readonly number[]
}

test('compiled paths keep the generic path inference', () => {
  const city = Obj.compilePathOf<User>()('profile', 'address', 'city')
  expectTypeOf(city.path).toEqualTypeOf<readonly ['profile', 'address', 'city']>()
  expectTypeOf(city.get).toEqualTypeOf<(value: User) => Option<string>>()
  expectTypeOf(city.getOrUndefined).toEqualTypeOf<(value: User) => string | undefined>()
  expectTypeOf(city.has).toEqualTypeOf<(value: User) => boolean>()

  const nickname = Obj.compilePathOf<User>()('profile', 'nickname')
  expectTypeOf(nickname.getOrUndefined({} as User)).toEqualTypeOf<string | undefined>()

  const score = Obj.compilePathOf<User>()('scores', 0)
  expectTypeOf(score.getOrUndefined({} as User)).toEqualTypeOf<number | undefined>()

  // @ts-expect-error compiled paths reject a segment the source does not have.
  Obj.compilePathOf<User>()('missing')

  // @ts-expect-error compiled paths reject a widened, non-literal segment.
  Obj.compilePathOf<User>()('profile' as string)
})

test('Map.getOrElse widens to the fallback in both forms', () => {
  const source = new Map<string, number>()

  expectTypeOf(MapOps.getOrElse(source, 'key', () => 0)).toEqualTypeOf<number>()
  expectTypeOf(MapOps.getOrElse(source, 'key', () => 'none' as const)).toEqualTypeOf<
    number | 'none'
  >()
  expectTypeOf(MapOps.getOrElse('key', () => 'none' as const)(source)).toEqualTypeOf<
    number | 'none'
  >()

  const unionKeySource = new Map<string | number, number>()
  expectTypeOf(MapOps.getOrElse('key', () => 0)(unionKeySource)).toEqualTypeOf<number>()

  // @ts-expect-error the data-last form rejects a source whose keys cannot accept the key.
  MapOps.getOrElse('key', () => 0)(new Map<number, number>())

  // @ts-expect-error the fallback is lazy, not a value.
  MapOps.getOrElse(source, 'key', 0)
})
