import { expectTypeOf, test } from 'vite-plus/test'
import type { Err, Fn, LazyValue, None, Ok, Option, Result, Some } from '..'
// S8 moved these to the subpaths that own them. They stay importable, just not
// from the root.
import type { PipelineExplanation, PureRewrite, Runner } from '../compile'

test('every mapped current root type export remains importable', () => {
  expectTypeOf<Fn<number, string>>().toEqualTypeOf<(value: number) => string>()
  expectTypeOf<LazyValue<number>>().toEqualTypeOf<() => number>()
  expectTypeOf<Runner<number, string>>().toEqualTypeOf<(input: number) => string>()
  expectTypeOf<PipelineExplanation>().toBeObject()
  expectTypeOf<PureRewrite>().toBeObject()
  expectTypeOf<None>().toMatchTypeOf<{ readonly _tag: 0 }>()
  expectTypeOf<Some<number>>().toMatchTypeOf<{ readonly _tag: 1; readonly value: number }>()
  expectTypeOf<Option<number>>().toMatchTypeOf<None | Some<number>>()
  expectTypeOf<Err<string>>().toMatchTypeOf<{ readonly _tag: 0; readonly error: string }>()
  expectTypeOf<Ok<number>>().toMatchTypeOf<{ readonly _tag: 1; readonly value: number }>()
  expectTypeOf<Result<number, string>>().toMatchTypeOf<Ok<number> | Err<string>>()
})
