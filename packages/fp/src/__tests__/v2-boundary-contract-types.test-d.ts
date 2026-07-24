import { expectTypeOf, test } from 'vite-plus/test'
import type {
  Err,
  Fn,
  LazyValue,
  None,
  Ok,
  Option,
  PipelineExplanation,
  PureRewrite,
  Result,
  Runner,
  Some,
} from '..'

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
