import { expectTypeOf, test } from 'vite-plus/test'
import * as Root from '..'
import * as Compile from '../compile'
import * as FusionDebug from '../fusion-debug'
import * as A from '../array'
import type { Eq } from '../eq'
import * as G from '../guard'
import * as Indexed from '../indexed'
import * as Iter from '../iter'
import * as MapOps from '../map'
import * as Match from '../match'
import * as N from '../number'
import * as Obj from '../object'
import * as O from '../option'
import * as Optic from '../optic'
import * as RecordOps from '../record'
import * as R from '../result'
import * as Schema from '../schema'
import * as These from '../these'
import * as TypedArray from '../typed-array'
import * as V from '../validation'

test('the root remains intentionally slim', () => {
  expectTypeOf(Root.pipe).toBeFunction()
  expectTypeOf(Root.flow).toBeFunction()
  // compile moved to the subpath in S8; the root keeps composition only.
  expectTypeOf(Compile.compile).toBeFunction()
  expectTypeOf(Root.some(1)).toEqualTypeOf<O.Some<number>>()
  expectTypeOf(Root.ok(1)).toEqualTypeOf<R.Ok<number>>()

  // @ts-expect-error specialist array APIs live at @stopcock/fp/array.
  void Root.A
  // @ts-expect-error specialist validation APIs live at @stopcock/fp/validation.
  void Root.valid
})

test('pipe and flow preserve multi-stage inference', () => {
  const output = Root.pipe(
    ' 41 ',
    (value) => value.trim(),
    Number.parseInt,
    (value) => value + 1,
    (value) => ({ value, label: String(value) }),
  )
  expectTypeOf(output).toEqualTypeOf<{ value: number; label: string }>()

  const parse = Root.flow(
    (value: string) => value.trim(),
    Number.parseInt,
    (value) => value + 1,
  )
  expectTypeOf(parse).toEqualTypeOf<(a: string) => number>()
})

test('array APIs support data-first, data-last, refinements, and tuples', () => {
  const values: readonly (string | number)[] = ['one', 2]
  expectTypeOf(A.filter(G.isString)(values)).toEqualTypeOf<string[]>()
  expectTypeOf(A.map((value: number) => String(value))).toEqualTypeOf<
    (arr: readonly number[]) => string[]
  >()
  expectTypeOf(A.head([1, 2])).toEqualTypeOf<O.Option<number>>()
  expectTypeOf(A.headOrUndefined([1, 2])).toEqualTypeOf<number | undefined>()
  expectTypeOf(A.headNonEmpty([1, 2])).toEqualTypeOf<number>()
  expectTypeOf(A.find(G.isString)(values)).toEqualTypeOf<O.Option<string>>()
  expectTypeOf(A.findOrUndefined(G.isString)(values)).toEqualTypeOf<string | undefined>()
  expectTypeOf(
    A.partitionMap((value: string | number) =>
      typeof value === 'string' ? R.ok(value) : R.err(value),
    )(values),
  ).toEqualTypeOf<readonly [number[], string[]]>()
  const sequenced: R.Result<[number, string], never> = A.sequence([R.ok(1), R.ok('two')] as const)
  expectTypeOf(sequenced).toMatchTypeOf<R.Result<[number, string], never>>()
})

test('Option composition preserves value inference', () => {
  const input: O.Option<number> = O.some(1)
  const output = Root.pipe(
    input,
    O.filter((value: number) => value > 0),
    O.map((value) => String(value)),
    O.zip(O.some(true)),
  )
  const checkedOutput: O.Option<readonly [string, boolean]> = output
  expectTypeOf(checkedOutput).toMatchTypeOf<O.Option<readonly [string, boolean]>>()
  expectTypeOf(O.all([O.some(1), O.some('two')] as const)).toEqualTypeOf<
    O.Option<[number, string]>
  >()
  expectTypeOf(O.struct({ count: O.some(1), label: O.some('one') })).toEqualTypeOf<
    O.Option<{ count: number; label: string }>
  >()
  expectTypeOf(O.fromNullable('value' as string | null)).toEqualTypeOf<O.Option<string>>()
})

test('Result composition preserves value and error unions', () => {
  const decoded = null as unknown as R.Result<number, 'decode'>
  const decodeStep: (value: number) => R.Result<string, 'negative'> = (value) =>
    value > 0 ? R.ok(String(value)) : R.err('negative' as const)
  const flatMapped = R.flatMap<number, typeof decodeStep>(decodeStep)(decoded)
  const output = R.map((value: string) => value.length)(flatMapped)
  const checkedOutput: R.Result<number, 'decode' | 'negative'> = output
  expectTypeOf(checkedOutput).toMatchTypeOf<R.Result<number, 'decode' | 'negative'>>()
  const allResults: R.Result<[number, string], 'first' | 'second'> = R.all([
    R.ok(1) as R.Result<number, 'first'>,
    R.ok('two') as R.Result<string, 'second'>,
  ] as const)
  expectTypeOf(allResults).toMatchTypeOf<R.Result<[number, string], 'first' | 'second'>>()
  const structured: R.Result<{ count: number; label: string }, 'count' | 'label'> = R.struct({
    count: R.ok(1) as R.Result<number, 'count'>,
    label: R.ok('one') as R.Result<string, 'label'>,
  })
  expectTypeOf(structured).toMatchTypeOf<
    R.Result<{ count: number; label: string }, 'count' | 'label'>
  >()
  expectTypeOf(R.liftThrowable((value: string) => Number(value))).toEqualTypeOf<
    (value: string) => R.Result<number, unknown>
  >()
  expectTypeOf(
    R.liftThrowable(
      (value: string) => Number(value),
      () => 'parse' as const,
    ),
  ).toEqualTypeOf<(value: string) => R.Result<number, 'parse'>>()
})

test('Validation accumulates a typed non-empty error collection', () => {
  const first: V.Validation<number, 'first'> = V.invalid('first')
  const second: V.Validation<string, 'second'> = V.valid('two')
  expectTypeOf(V.all([first, second] as const)).toEqualTypeOf<
    V.Validation<[number, string], 'first' | 'second'>
  >()
  expectTypeOf(
    V.traverse(
      (value: string): V.Validation<number, 'empty'> =>
        value.length > 0 ? V.valid(value.length) : V.invalid('empty'),
    )(['a']),
  ).toEqualTypeOf<V.Validation<number[], 'empty'>>()
})

test('guards compose refinements and brands without runtime wrappers', () => {
  type Input = string | number | boolean
  const isText: G.Refinement<Input, string> = (value): value is string => typeof value === 'string'
  const isLong: G.Refinement<string, string & { readonly long: true }> = (
    value,
  ): value is string & { readonly long: true } => value.length > 3
  const longText: G.Refinement<Input, string & { readonly long: true }> = G.and(isText, isLong)
  expectTypeOf(longText).toBeFunction()
  expectTypeOf(G.not(isText)).toEqualTypeOf<G.Refinement<Input, number | boolean>>()
  expectTypeOf<G.Brand<string, 'UserId'>>().toMatchTypeOf<string>()
})

test('tuple paths preserve nested values and reject invalid paths', () => {
  type User = {
    readonly profile?: {
      readonly name: string
      readonly flags?: readonly boolean[]
    }
  }
  const user = {} as User
  const namePath = Obj.pathOf<User>()('profile', 'name')
  expectTypeOf(Obj.getPath(namePath)(user)).toEqualTypeOf<O.Option<string | undefined>>()
  expectTypeOf(Obj.getPathOrUndefined(namePath)(user)).toEqualTypeOf<string | undefined>()
  expectTypeOf(Obj.setPath(['profile', 'name'], 'Ada')(user)).toEqualTypeOf<User>()

  // @ts-expect-error path builders reject keys that do not exist.
  Obj.pathOf<User>()('missing')
})

test('polymorphic optics preserve source and focus types', () => {
  type User = { readonly profile: { readonly name: string } }
  const profile = Optic.prop<User, 'profile'>('profile')
  const name = Optic.prop<User['profile'], 'name'>('name')
  const userName = Optic.compose(profile, name)
  const user: User = { profile: { name: 'Ada' } }
  expectTypeOf(Optic.view(userName)(user)).toEqualTypeOf<string>()
  expectTypeOf(Optic.set(userName, 'Grace')(user)).toEqualTypeOf<User>()
  expectTypeOf(Optic.preview(Optic.index<number>(0))([1, 2])).toEqualTypeOf<O.Option<number>>()
})

test('Iter pipelines remain lazy in their types', () => {
  const values = Root.pipe(
    Iter.range(0, 10),
    Iter.filter((value) => value % 2 === 0),
    Iter.map((value) => String(value)),
    Iter.take(2),
  )
  expectTypeOf(values).toEqualTypeOf<Iter.Iter<string>>()
  const firstValue: O.Option<string> = Iter.first(values)
  expectTypeOf(firstValue).toMatchTypeOf<O.Option<string>>()
  expectTypeOf(Iter.toArray(values)).toEqualTypeOf<string[]>()
  expectTypeOf(Iter.firstOrUndefined(values)).toEqualTypeOf<string | undefined>()
})

test('partial collection and statistical APIs expose Option by default', () => {
  const map = new Map<string, number | undefined>()
  const record = {} as RecordOps.ReadonlyRecord<number | undefined>
  expectTypeOf(MapOps.get('key')(map)).toEqualTypeOf<O.Option<number | undefined>>()
  expectTypeOf(MapOps.getOrUndefined('key')(map)).toEqualTypeOf<number | undefined>()
  expectTypeOf(RecordOps.get('key')(record)).toEqualTypeOf<O.Option<number | undefined>>()
  expectTypeOf(Indexed.at([1, 2], 0)).toEqualTypeOf<O.Option<number>>()
  expectTypeOf(Indexed.atOrUndefined([1, 2], 0)).toEqualTypeOf<number | undefined>()
  expectTypeOf(TypedArray.at(0)(new Uint8Array())).toEqualTypeOf<O.Option<number>>()
  expectTypeOf(
    TypedArray.filter((value: number) => value > 0)(new Uint16Array()),
  ).toMatchTypeOf<Uint16Array>()
  expectTypeOf(
    TypedArray.filter((value: bigint) => value > 0n)(new BigInt64Array()),
  ).toMatchTypeOf<BigInt64Array>()
  expectTypeOf(
    TypedArray.copyInto(new Uint8Array(), new Float64Array()),
  ).toMatchTypeOf<Float64Array>()
  expectTypeOf(
    TypedArray.copyInto(new BigInt64Array(), new BigUint64Array()),
  ).toMatchTypeOf<BigUint64Array>()
  // @ts-expect-error number and bigint typed-array storage cannot be mixed.
  TypedArray.copyInto(new Uint8Array(), new BigInt64Array())
  // @ts-expect-error number and bigint typed-array storage cannot be mixed.
  TypedArray.copyInto(new BigInt64Array(), new Float64Array())
  expectTypeOf(N.mean([])).toEqualTypeOf<O.Option<number>>()
  expectTypeOf(N.meanOrUndefined([])).toEqualTypeOf<number | undefined>()
  expectTypeOf(N.meanNonEmpty([1])).toEqualTypeOf<number>()
  expectTypeOf(N.varianceSampleAtLeastTwo([1, 2])).toEqualTypeOf<number>()

  // @ts-expect-error v1 Option suffixes are intentionally removed.
  void A.headOption
  // @ts-expect-error the Option-returning path API owns the concise name.
  void Obj.getPathOption
})

test('matching requires every discriminant case', () => {
  type Event =
    | { readonly kind: 'created'; readonly id: string }
    | { readonly kind: 'deleted'; readonly id: string }
  const render = Match.discriminant<'kind', Event, string>('kind', {
    created: (event) => event.id,
    deleted: (event) => event.id,
  })
  expectTypeOf(render).toEqualTypeOf<(value: Event) => string>()

  // @ts-expect-error exhaustive handlers require the deleted case.
  Match.discriminant<'kind', Event, string>('kind', {
    created: (event) => event.id,
  })
})

test('Standard Schema adapters infer transformed outputs', () => {
  const positive = Schema.fromPredicate(
    (value: unknown): value is number => typeof value === 'number' && value > 0,
  )
  const label = Schema.map(positive, (value) => `n:${value}`)
  expectTypeOf<Schema.StandardSchemaV1.InferOutput<typeof label>>().toEqualTypeOf<string>()
  expectTypeOf(Schema.validateSync(label)(1)).toEqualTypeOf<
    R.Result<string, readonly Schema.Issue[]>
  >()
  expectTypeOf(Schema.validate(label)).toEqualTypeOf<
    (value: unknown) => Promise<R.Result<string, readonly Schema.Issue[]>>
  >()
})

test('algebra and inclusive data types expose concrete instances', () => {
  const numeric: Eq<number> = { equals: (left, right) => left === right }
  expectTypeOf(numeric.equals).toEqualTypeOf<(left: number, right: number) => boolean>()
  expectTypeOf(These.both('warning', 1)).toEqualTypeOf<These.Both<string, number>>()
})

test('portable compiler runners retain endpoint types', () => {
  const runner = Compile.compile(
    A.map((value: number) => value + 1),
    A.filter((value: number) => value > 2),
    A.sum,
  )
  expectTypeOf(runner).toEqualTypeOf<(input: readonly number[]) => number>()
  expectTypeOf(
    FusionDebug.explain(
      A.map((value: number) => value + 1),
      A.sum,
    ),
  ).toEqualTypeOf<'sequential' | 'compiled site'>()
})
