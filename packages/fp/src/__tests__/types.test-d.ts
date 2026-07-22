import { expectTypeOf, test } from 'vite-plus/test'
import * as A from '../array'
import { flow } from '../flow'
import * as G from '../guard'
import * as L from '../lens'
import * as Obj from '../object'
import * as O from '../option'
import { pipe } from '../pipe'
import * as R from '../result'
import * as S from '../string'
import type { Fn, LazyValue } from '../types'
import {
  and as rootAnd,
  explainPipeline as rootExplainPipeline,
  getOptimizerStats as rootGetOptimizerStats,
  resetOptimizerStats as rootResetOptimizerStats,
  type Brand as RootBrand,
  type OptimizerStats as RootOptimizerStats,
  type Predicate as RootPredicate,
} from '..'

test('Fn maps A to B', () => {
  expectTypeOf<Fn<string, number>>().toEqualTypeOf<(a: string) => number>()
})

test('LazyValue is a thunk returning A', () => {
  expectTypeOf<LazyValue<number>>().toEqualTypeOf<() => number>()
})

test('String functions preserve concrete return types', () => {
  expectTypeOf(S.trim(' hi ')).toEqualTypeOf<string>()
  expectTypeOf(S.length('hello')).toEqualTypeOf<number>()
  expectTypeOf(S.includes('ell')).toEqualTypeOf<(s: string) => boolean>()
  expectTypeOf(pipe('hello', S.toUpperCase)).toEqualTypeOf<string>()
})

test('pipe infers values through multiple stages', () => {
  const result = pipe(
    ' 42 ',
    S.trim,
    Number.parseInt,
    (n) => n + 1,
    (n) => ({ value: n, label: String(n) }),
    (value) => value.label,
  )

  expectTypeOf(result).toEqualTypeOf<string>()
})

test('pipe rejects calls past the public overload limit', () => {
  const step = (n: number) => n + 1

  // @ts-expect-error pipe exposes overloads through 20 public stages.
  pipe(
    0,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
  )
})

test('flow infers values through multiple stages', () => {
  const parseLabel = flow(
    S.trim,
    Number.parseInt,
    (n) => n + 1,
    (n) => ({ value: n, label: String(n) }),
    (value) => value.label,
  )

  expectTypeOf(parseLabel).toEqualTypeOf<(a: string) => string>()
  expectTypeOf(parseLabel(' 41 ')).toEqualTypeOf<string>()
})

test('flow rejects calls past the public overload limit', () => {
  const step = (n: number) => n + 1

  // @ts-expect-error flow exposes overloads through 20 public stages.
  flow(
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
    step,
  )
})

test('Array data-last functions infer input and output values', () => {
  const appended = 4 as number
  const prepended = 0 as number
  const extraNumbers = [3, 4] as number[]

  expectTypeOf(A.map((n: number) => String(n))).toEqualTypeOf<
    (arr: readonly number[]) => string[]
  >()
  expectTypeOf(A.mapWithIndex((n: number, i) => `${i}:${n}`)).toEqualTypeOf<
    (arr: readonly number[]) => string[]
  >()
  expectTypeOf(A.filter((n: number) => n > 1)).toEqualTypeOf<(arr: readonly number[]) => number[]>()
  expectTypeOf(A.filterWithIndex((n: number, i) => n > i)).toEqualTypeOf<
    (arr: readonly number[]) => number[]
  >()
  expectTypeOf(A.flatMap((n: number) => [String(n)])).toEqualTypeOf<
    (arr: readonly number[]) => string[]
  >()
  expectTypeOf(A.filterMap((n: number) => (n > 1 ? String(n) : undefined))).toEqualTypeOf<
    (arr: readonly number[]) => string[]
  >()
  expectTypeOf(A.findMap((n: number) => (n > 1 ? String(n) : undefined))).toEqualTypeOf<
    (arr: readonly number[]) => string | undefined
  >()
  expectTypeOf(A.mapWhile((n: number) => (n < 3 ? String(n) : undefined))).toEqualTypeOf<
    (arr: readonly number[]) => string[]
  >()
  expectTypeOf(A.takeUntil((n: number) => n > 2)).toEqualTypeOf<
    (arr: readonly number[]) => number[]
  >()
  expectTypeOf(A.find((n: number) => n > 1)).toEqualTypeOf<
    (arr: readonly number[]) => number | undefined
  >()
  expectTypeOf(A.findIndex((n: number) => n > 1)).toEqualTypeOf<
    (arr: readonly number[]) => number | undefined
  >()
  expectTypeOf(A.every((n: number) => n > 0)).toEqualTypeOf<(arr: readonly number[]) => boolean>()
  expectTypeOf(A.some((n: number) => n > 0)).toEqualTypeOf<(arr: readonly number[]) => boolean>()
  expectTypeOf(A.partition((n: number) => n > 0)).toEqualTypeOf<
    (arr: readonly number[]) => [number[], number[]]
  >()
  expectTypeOf(A.reject((n: number) => n > 0)).toEqualTypeOf<(arr: readonly number[]) => number[]>()
  expectTypeOf(A.reduce((total: number, n: number) => total + n, 0)).toEqualTypeOf<
    (arr: readonly number[]) => number
  >()
  expectTypeOf(A.append(appended)).toEqualTypeOf<(arr: readonly number[]) => number[]>()
  expectTypeOf(A.prepend(prepended)).toEqualTypeOf<(arr: readonly number[]) => number[]>()
  expectTypeOf(A.concat(extraNumbers)).toEqualTypeOf<(arr: readonly number[]) => number[]>()
  expectTypeOf(A.zip(['a'])).toEqualTypeOf<<A>(a: readonly A[]) => [A, string][]>()
  expectTypeOf(A.zipWith(['a'], (n: number, s) => `${s}:${n}`)).toEqualTypeOf<
    (a: readonly number[]) => string[]
  >()
  // Current gap: pluck does not infer B from the requested key.
  expectTypeOf(A.pluck('id')).toEqualTypeOf<<A, B>(arr: readonly A[]) => B[]>()
  expectTypeOf(A.sortBy((a: { id: number }, b) => a.id - b.id)).toEqualTypeOf<
    (arr: readonly { id: number }[]) => { id: number }[]
  >()
  expectTypeOf(A.uniqBy((value: { id: number }) => value.id)).toEqualTypeOf<
    (arr: readonly { id: number }[]) => { id: number }[]
  >()
  expectTypeOf(A.groupBy((value: { kind: string }) => value.kind)).toEqualTypeOf<
    (arr: readonly { kind: string }[]) => Record<string, { kind: string }[]>
  >()
  expectTypeOf(A.take(2)).toEqualTypeOf<<A>(arr: readonly A[]) => A[]>()
  expectTypeOf(A.drop(1)).toEqualTypeOf<<A>(arr: readonly A[]) => A[]>()
  expectTypeOf(A.join(',')).toEqualTypeOf<(arr: readonly string[]) => string>()
})

test('String data-last functions preserve concrete return types', () => {
  expectTypeOf(S.startsWith('a')).toEqualTypeOf<(s: string) => boolean>()
  expectTypeOf(S.endsWith('z')).toEqualTypeOf<(s: string) => boolean>()
  expectTypeOf(S.split(',')).toEqualTypeOf<(s: string) => string[]>()
  expectTypeOf(S.repeat(2)).toEqualTypeOf<(s: string) => string>()
  expectTypeOf(S.slice(1, 3)).toEqualTypeOf<(s: string) => string>()
  expectTypeOf(S.replaceAll('a', 'b')).toEqualTypeOf<(s: string) => string>()
})

test('Object data-last functions infer object changes and path values', () => {
  type User = {
    id: string
    name: string
    meta: { active: boolean; score: number }
  }
  type OptionalUser = {
    id: string
    meta?: { active: boolean; score: number } | null
  }
  const optionalUser = {} as OptionalUser
  const tupleActivePath = ['meta', 'active'] as const
  const tupleActiveReader = Obj.path(tupleActivePath)
  const tupleActiveDefaultReader = Obj.pathOr(tupleActivePath, false)
  const dynamicPath = 'meta.active' as string

  expectTypeOf(Obj.pick(['id', 'name'])).toEqualTypeOf<(obj: User) => Pick<User, 'id' | 'name'>>()
  expectTypeOf(Obj.omit(['meta'])).toEqualTypeOf<(obj: User) => Omit<User, 'meta'>>()
  expectTypeOf(Obj.dissoc('meta')).toEqualTypeOf<(obj: User) => Partial<User>>()
  expectTypeOf(Obj.assoc('role', 'admin')).toEqualTypeOf<
    (obj: User) => User & Record<string, string>
  >()
  expectTypeOf(Obj.mergeDeepLeft({ extra: true })).toEqualTypeOf<
    (a: User) => User & { extra: boolean }
  >()
  expectTypeOf(Obj.mergeDeepRight({ extra: true })).toEqualTypeOf<
    (a: User) => User & { extra: boolean }
  >()
  expectTypeOf(
    Obj.mergeWith(
      { id: 'fallback', name: 'Grace', meta: { active: false, score: 0 } },
      (l: string, r) => l || r,
    ),
  ).toEqualTypeOf<(a: User) => User>()
  expectTypeOf(Obj.path('meta.active')).toEqualTypeOf<(obj: User) => boolean | undefined>()
  expectTypeOf(Obj.path('meta.missing')).toEqualTypeOf<(obj: User) => unknown>()
  expectTypeOf(Obj.pathOr('meta.score', 0)).toEqualTypeOf<(obj: User) => number>()
  expectTypeOf(Obj.pathOr('meta.missing', 'fallback')).toEqualTypeOf<(obj: User) => unknown>()
  expectTypeOf(Obj.path(optionalUser, tupleActivePath)).toEqualTypeOf<boolean | undefined>()
  expectTypeOf(Obj.path(tupleActivePath)).toEqualTypeOf<
    (obj: OptionalUser) => boolean | undefined
  >()
  expectTypeOf(Obj.path(tupleActivePath)(optionalUser)).toEqualTypeOf<boolean | undefined>()
  expectTypeOf(tupleActiveReader(optionalUser)).toEqualTypeOf<boolean | undefined>()
  expectTypeOf(Obj.path(optionalUser, dynamicPath)).toEqualTypeOf<unknown>()
  expectTypeOf(Obj.path(dynamicPath)).toEqualTypeOf<(obj: OptionalUser) => unknown>()
  expectTypeOf(Obj.pathOr(optionalUser, tupleActivePath, false)).toEqualTypeOf<boolean>()
  expectTypeOf(Obj.pathOr(tupleActivePath, false)).toEqualTypeOf<(obj: OptionalUser) => boolean>()
  expectTypeOf(Obj.pathOr(tupleActivePath, false)(optionalUser)).toEqualTypeOf<boolean>()
  expectTypeOf(tupleActiveDefaultReader(optionalUser)).toEqualTypeOf<boolean>()
  expectTypeOf(Obj.pathOr(dynamicPath, 'fallback')).toEqualTypeOf<(obj: OptionalUser) => unknown>()
  expectTypeOf(Obj.evolve<User>({ name: (name) => name.trim() })).toEqualTypeOf<
    (obj: User) => User
  >()
})

test('Option preserves value inference through constructors, transforms, and extraction', () => {
  const value = O.some(1)
  const nullable = O.fromNullable('hello' as string | null | undefined)
  const mapped = pipe(
    value,
    O.map((n) => String(n)),
  )
  const flatMapped = pipe(
    value,
    O.flatMap((n) => O.some(String(n))),
  )

  expectTypeOf(value).toEqualTypeOf<O.Option<number>>()
  expectTypeOf(nullable).toEqualTypeOf<O.Option<string>>()
  expectTypeOf(mapped).toEqualTypeOf<O.Option<string>>()
  expectTypeOf(flatMapped).toEqualTypeOf<O.Option<string>>()
  expectTypeOf(
    pipe(
      value,
      O.getOrElse(() => 'fallback'),
    ),
  ).toEqualTypeOf<number | string>()
  expectTypeOf(O.toNullable(value)).toEqualTypeOf<number | null>()
  expectTypeOf(O.toUndefined(value)).toEqualTypeOf<number | undefined>()
})

test('Option completeness combinators preserve data-last inference', () => {
  const value = O.some(1)
  const fallback = O.some('fallback')
  const nested = O.some(O.some('nested'))
  declare const unionValue: O.Option<'a' | 'b'>

  expectTypeOf(pipe(value, O.orElse(fallback))).toEqualTypeOf<O.Option<number | string>>()
  expectTypeOf(
    pipe(
      value,
      O.orElseWith(() => fallback),
    ),
  ).toEqualTypeOf<O.Option<number | string>>()
  expectTypeOf(pipe(value, O.and(fallback))).toEqualTypeOf<O.Option<string>>()
  expectTypeOf(
    pipe(
      value,
      O.andThen((n) => O.some(String(n))),
    ),
  ).toEqualTypeOf<O.Option<string>>()
  expectTypeOf(O.flatten(nested)).toEqualTypeOf<O.Option<string>>()
  expectTypeOf(pipe(value, O.zip(O.some('label')))).toEqualTypeOf<O.Option<[number, string]>>()
  expectTypeOf(
    pipe(
      value,
      O.zipWith(O.some('label'), (n, label) => `${label}:${n}`),
    ),
  ).toEqualTypeOf<O.Option<string>>()
  expectTypeOf(pipe(value, O.contains(1))).toEqualTypeOf<boolean>()
  expectTypeOf(pipe(O.some('a' as 'a' | 'b'), O.contains('a'))).toEqualTypeOf<boolean>()
  expectTypeOf(O.contains('a')(unionValue)).toEqualTypeOf<boolean>()
  expectTypeOf(O.contains<'a'>('a')(unionValue)).toEqualTypeOf<boolean>()
  expectTypeOf(
    pipe(
      value,
      O.exists((n) => n > 0),
    ),
  ).toEqualTypeOf<boolean>()
  expectTypeOf(
    pipe(
      value,
      O.mapNullable((n) => (n > 0 ? String(n) : null)),
    ),
  ).toEqualTypeOf<O.Option<string>>()
})

test('Result preserves value and error inference through transforms and extraction', () => {
  const value = R.ok(1)
  const error = R.err({ code: 'bad' as const })
  const mapped = pipe(
    value,
    R.map((n) => String(n)),
  )
  const mappedErr = pipe(
    error,
    R.mapErr((e) => e.code),
  )
  const flatMapped = pipe(
    value,
    R.flatMap((n) => (n > 0 ? R.ok(String(n)) : R.err('negative' as const))),
  )

  expectTypeOf(value).toEqualTypeOf<R.Result<number, never>>()
  expectTypeOf(error).toEqualTypeOf<R.Result<never, { code: 'bad' }>>()
  expectTypeOf(mapped).toEqualTypeOf<R.Result<string, never>>()
  expectTypeOf(mappedErr).toEqualTypeOf<R.Result<never, 'bad'>>()
  expectTypeOf(flatMapped).toEqualTypeOf<R.Result<string, 'negative'>>()
  expectTypeOf(
    pipe(
      error,
      R.getOrElse(() => 0),
    ),
  ).toEqualTypeOf<number>()
  expectTypeOf(R.toOption(value)).toEqualTypeOf<O.Option<number>>()
})

test('Result completeness combinators preserve data-last inference', () => {
  const value = R.ok(1)
  const fallback = R.ok('fallback')
  const nested = R.ok(R.ok('nested'))
  const error = R.err({ code: 'bad' as const })
  declare const unionValue: R.Result<'a' | 'b', Error>

  expectTypeOf(pipe(value, R.orElse(fallback))).toEqualTypeOf<R.Result<number | string, never>>()
  expectTypeOf(
    pipe(
      error,
      R.orElseWith((e) => R.err(e.code)),
    ),
  ).toEqualTypeOf<R.Result<never, 'bad'>>()
  expectTypeOf(pipe(value, R.and(fallback))).toEqualTypeOf<R.Result<string, never>>()
  expectTypeOf(
    pipe(
      value,
      R.andThen((n) => R.ok(String(n))),
    ),
  ).toEqualTypeOf<R.Result<string, never>>()
  expectTypeOf(R.flatten(nested)).toEqualTypeOf<R.Result<string, never>>()
  expectTypeOf(pipe(value, R.zip(R.ok('label')))).toEqualTypeOf<R.Result<[number, string], never>>()
  expectTypeOf(
    pipe(
      value,
      R.zipWith(R.ok('label'), (n, label) => `${label}:${n}`),
    ),
  ).toEqualTypeOf<R.Result<string, never>>()
  expectTypeOf(pipe(value, R.contains(1))).toEqualTypeOf<boolean>()
  expectTypeOf(
    pipe(R.ok('a' as 'a' | 'b') as R.Result<'a' | 'b', Error>, R.contains('a')),
  ).toEqualTypeOf<boolean>()
  expectTypeOf(R.contains('a')(unionValue)).toEqualTypeOf<boolean>()
  expectTypeOf(R.contains<'a'>('a')(unionValue)).toEqualTypeOf<boolean>()
  expectTypeOf(
    pipe(
      value,
      R.exists((n) => n > 0),
    ),
  ).toEqualTypeOf<boolean>()
  expectTypeOf(R.fromThrowable(() => 1)).toEqualTypeOf<R.Result<number, unknown>>()
  expectTypeOf(R.tryCatchAsync(async () => 1)).toEqualTypeOf<Promise<R.Result<number, unknown>>>()
})

test('Guard predicates narrow through Array filter', () => {
  const values: Array<string | number | boolean> = ['a', 1, true]

  expectTypeOf(A.filter(values, G.isString)).toEqualTypeOf<string[]>()
  expectTypeOf(A.filter(G.isNumber)(values)).toEqualTypeOf<number[]>()
})

test('Object paths and lenses pin current public behavior', () => {
  type User = {
    name: string
    meta: { active: boolean; tags: string[] }
  }

  const user: User = { name: 'Ada', meta: { active: true, tags: ['fp'] } }
  const activeLens = L.path<User, 'meta', 'active'>('meta', 'active')
  const tupleActiveLens = L.path<User, readonly ['meta', 'active']>(['meta', 'active'] as const)
  const tagLens = L.compose(L.path<User, 'meta', 'tags'>('meta', 'tags'), L.index<string>(0))

  expectTypeOf(Obj.path(user, 'meta.active')).toEqualTypeOf<boolean | undefined>()
  expectTypeOf(Obj.path(user, 'meta.missing')).toEqualTypeOf<unknown>()
  expectTypeOf(L.view(user, L.prop('name'))).toEqualTypeOf<string>()
  expectTypeOf(L.view(user, activeLens)).toEqualTypeOf<boolean>()
  expectTypeOf(L.view(user, tupleActiveLens)).toEqualTypeOf<boolean>()
  expectTypeOf(L.view(user, tagLens)).toEqualTypeOf<string>()
  expectTypeOf(L.set(user, activeLens, false)).toEqualTypeOf<User>()
  expectTypeOf(L.over(user, activeLens, (active) => !active)).toEqualTypeOf<User>()
  expectTypeOf(L.view([1, 2], L.index<number>(0))).toEqualTypeOf<number>()

  const readonlyValues = [1, 2] as const
  // @ts-expect-error lens.index currently exposes mutable array lenses only.
  L.view(readonlyValues, L.index<number>(0))
})

test('Guard exports predicate, refinement, and brand types', () => {
  type UserId = G.Brand<string, 'UserId'>

  expectTypeOf<G.Predicate<string>>().toEqualTypeOf<(a: string) => boolean>()
  expectTypeOf<G.Refinement<string | number, string>>().toEqualTypeOf<
    (a: string | number) => a is string
  >()
  expectTypeOf<UserId>().toEqualTypeOf<string & { readonly __brand: 'UserId' }>()
})

test('Guard refinement combinators preserve narrowing', () => {
  type User = { kind: 'user'; active: boolean }
  type Admin = User & { role: 'admin' }
  type Guest = { kind: 'guest'; invitedBy: string }
  type Account = User | Guest
  type RawAccount = { kind: 'user' | 'guest'; active?: boolean; name?: string }
  type ActiveAccount = RawAccount & { active: true }
  type NamedAccount = RawAccount & { name: string }

  const isUser: G.Refinement<Account, User> = (value): value is User => value.kind === 'user'
  const isAdmin: G.Refinement<User, Admin> = (value): value is Admin => 'role' in value
  const isGuest: G.Refinement<Account, Guest> = (value): value is Guest => value.kind === 'guest'
  const isActive: G.Refinement<RawAccount, ActiveAccount> = (value): value is ActiveAccount =>
    value.active === true
  const hasName: G.Refinement<RawAccount, NamedAccount> = (value): value is NamedAccount =>
    typeof value.name === 'string'
  const isStringValue: G.Refinement<string | number | boolean, string> = (value): value is string =>
    typeof value === 'string'

  expectTypeOf(G.and(isUser, isAdmin)).toEqualTypeOf<G.Refinement<Account, Admin>>()
  expectTypeOf(G.and(isActive, hasName)).toEqualTypeOf<
    G.Refinement<RawAccount, ActiveAccount & NamedAccount>
  >()
  expectTypeOf(G.or(isUser, isGuest)).toEqualTypeOf<G.Refinement<Account, User | Guest>>()
  expectTypeOf(G.not(isStringValue)).toEqualTypeOf<
    G.Refinement<string | number | boolean, number | boolean>
  >()
})

test('Guard combinators expose predicate fallbacks', () => {
  const longerThanOne: G.Predicate<string> = (value) => value.length > 1
  const startsWithA: G.Predicate<string> = (value) => value.startsWith('a')

  expectTypeOf(G.and(longerThanOne, startsWithA)).toEqualTypeOf<G.Predicate<string>>()
  expectTypeOf(G.or(longerThanOne, startsWithA)).toEqualTypeOf<G.Predicate<string>>()
  expectTypeOf(G.not(longerThanOne)).toEqualTypeOf<G.Predicate<string>>()
})

test('Root exports guard combinators and types', () => {
  type RootUserId = RootBrand<string, 'UserId'>

  expectTypeOf(rootAnd).toMatchTypeOf<typeof G.and>()
  expectTypeOf<RootPredicate<string>>().toEqualTypeOf<G.Predicate<string>>()
  expectTypeOf<RootUserId>().toEqualTypeOf<G.Brand<string, 'UserId'>>()
})

test('Root exports optimizer diagnostics types', () => {
  const explanation = rootExplainPipeline(A.map((n: number) => n + 1))

  expectTypeOf(rootGetOptimizerStats()).toEqualTypeOf<Readonly<RootOptimizerStats>>()
  expectTypeOf(rootResetOptimizerStats).toEqualTypeOf<() => void>()
  expectTypeOf(explanation.segments).toEqualTypeOf<readonly import('../plan').SegmentShape[]>()
  expectTypeOf(explanation.semantics).toEqualTypeOf<'exact' | 'pure'>()
})
