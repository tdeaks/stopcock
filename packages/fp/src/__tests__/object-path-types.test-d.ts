import { expectTypeOf, test } from 'vite-plus/test'
import * as Obj from '../object'
import type { PathSegments, PathValue, PathWriteValue, ValidPath } from '../types'

type Model = {
  readonly version: number
  readonly explicitlyUndefined: string | undefined
  readonly profile?: {
    readonly name: string
    readonly nickname?: string
  }
  readonly preferences?: {
    readonly nickname?: string
  }
  readonly scores: readonly number[]
  readonly pair: readonly [{ readonly label: string }, number?]
}

const model = {} as Model
declare const tupleBrand: unique symbol

test('setPath is type-preserving for objects, optional intermediates, and the root', () => {
  expectTypeOf(Obj.setPath(['version'], 2)(model)).toEqualTypeOf<Model>()
  expectTypeOf(Obj.setPath(['profile', 'name'], 'Ada')(model)).toEqualTypeOf<Model>()
  expectTypeOf(Obj.setPath(['preferences', 'nickname'], 'alias')(model)).toEqualTypeOf<Model>()
  expectTypeOf(Obj.setPath(['explicitlyUndefined'], undefined)(model)).toEqualTypeOf<Model>()
  expectTypeOf(Obj.setPath([], model)(model)).toEqualTypeOf<Model>()

  // @ts-expect-error a replacement cannot change the focused property type.
  Obj.setPath(['profile', 'name'], 42)(model)
  // @ts-expect-error an optional intermediate does not make its required leaf writable as undefined.
  Obj.setPath(['profile', 'name'], undefined)(model)
  // @ts-expect-error optional property syntax does not make undefined a writable leaf value.
  Obj.setPath(['preferences', 'nickname'], undefined)(model)
  // @ts-expect-error constructing profile through nickname would omit required sibling name.
  Obj.setPath(['profile', 'nickname'], 'alias')(model)
  // @ts-expect-error the empty path focuses the complete source value.
  Obj.setPath([], { version: 2 })(model)
  // @ts-expect-error tuple paths reject keys absent from the source.
  Obj.setPath(['profile', 'missing'], 'value')(model)

  const mixedReplacement = 'Ada' as string | number
  // @ts-expect-error every member of a replacement union must fit the focus.
  Obj.setPath(['profile', 'name'], mixedReplacement)(model)

  const maybeInvalidPath = ['version'] as const as readonly ['version'] | readonly ['missing']
  // @ts-expect-error every member of a path union must be valid for the source.
  Obj.setPath(maybeInvalidPath, 2)(model)

  const correlatedPath = ['version'] as const as readonly ['version'] | readonly ['profile', 'name']
  const correlatedReplacement = 2 as number | string
  // @ts-expect-error unions of valid paths cannot preserve focus/replacement correlation.
  Obj.setPath(correlatedPath, correlatedReplacement)(model)

  const unionSegment = ['version' as 'version' | 'profile'] as const
  // @ts-expect-error a union within one tuple segment is not a single literal path.
  Obj.setPath(unionSegment, 2)(model)

  const dynamicPath: PathSegments = ['version']
  // @ts-expect-error broad runtime path arrays are not statically sound write paths.
  Obj.setPath(dynamicPath, 2)(model)
})

test('setPath understands readonly arrays and fixed tuples', () => {
  const index: number = 10
  expectTypeOf(Obj.setPath(['scores', 10], 42)(model)).toEqualTypeOf<Model>()
  expectTypeOf(Obj.setPath(['scores', index], 42)(model)).toEqualTypeOf<Model>()
  expectTypeOf(Obj.setPath(['pair', 0, 'label'], 'right')(model)).toEqualTypeOf<Model>()
  expectTypeOf(Obj.setPath(['pair', 1], 2)(model)).toEqualTypeOf<Model>()

  // @ts-expect-error array elements retain their declared value type.
  Obj.setPath(['scores', 0], 'zero')(model)
  // @ts-expect-error tuple indices outside the declared tuple are invalid.
  Obj.setPath(['pair', 2], 2)(model)
  // @ts-expect-error tuple fields retain their declared value type.
  Obj.setPath(['pair', 0, 'label'], false)(model)
  // @ts-expect-error optional tuple syntax does not make undefined a writable element value.
  Obj.setPath(['pair', 1], undefined)(model)
})

test('modifyPath infers the observable focus and preserves the declared write type', () => {
  expectTypeOf(
    Obj.modifyPath(['version'], (version: number) => {
      expectTypeOf(version).toEqualTypeOf<number>()
      return version + 1
    })(model),
  ).toEqualTypeOf<Model>()

  expectTypeOf(
    Obj.modifyPath(['profile', 'name'], (name: string | undefined) => {
      expectTypeOf(name).toEqualTypeOf<string | undefined>()
      return (name ?? 'anonymous').toUpperCase()
    })(model),
  ).toEqualTypeOf<Model>()

  expectTypeOf(
    Obj.modifyPath(['preferences', 'nickname'], (nickname: string | undefined) => {
      expectTypeOf(nickname).toEqualTypeOf<string | undefined>()
      return nickname?.trim() ?? ''
    })(model),
  ).toEqualTypeOf<Model>()

  expectTypeOf(
    Obj.modifyPath([], (current: Model) => {
      expectTypeOf(current).toEqualTypeOf<Model>()
      return { ...current, version: current.version + 1 }
    })(model),
  ).toEqualTypeOf<Model>()

  // @ts-expect-error a modifier cannot change the focused property type.
  Obj.modifyPath(['version'], () => 'two')(model)
  // @ts-expect-error a modifier through an optional intermediate must restore the required leaf.
  Obj.modifyPath(['profile', 'name'], (name: string | undefined) => name?.trim())(model)
  // @ts-expect-error an optional leaf modifier must restore its declared non-undefined value.
  Obj.modifyPath(['preferences', 'nickname'], (nickname: string | undefined) => nickname?.trim())(model)
  // @ts-expect-error constructing profile through nickname would omit required sibling name.
  Obj.modifyPath(['profile', 'nickname'], () => 'alias')(model)
  // @ts-expect-error the root modifier must return the complete source type.
  Obj.modifyPath([], () => ({ version: 2 }))(model)
  // @ts-expect-error invalid paths are rejected before the callback is accepted.
  Obj.modifyPath(['profile', 'missing'], () => 'value')(model)

  const correlatedPath = ['version'] as const as readonly ['version'] | readonly ['profile', 'name']
  // @ts-expect-error a data-last modifier cannot safely correlate a union path and focus.
  Obj.modifyPath(correlatedPath, (value: number | string | undefined) => value)(model)

  const unionSegment = ['version' as 'version' | 'profile'] as const
  // @ts-expect-error a data-last modifier rejects a union-valued segment.
  Obj.modifyPath(unionSegment, (value: unknown) => value)(model)

  const dynamicPath: PathSegments = ['version']
  // @ts-expect-error broad runtime path arrays are not statically sound write paths.
  Obj.modifyPath(dynamicPath, (value: unknown) => value)(model)
})

test('modifyPath models unchecked arrays separately from known tuple positions', () => {
  const index: number = 0
  expectTypeOf(
    Obj.modifyPath(['scores', index], (score: number | undefined) => {
      expectTypeOf(score).toEqualTypeOf<number | undefined>()
      return (score ?? 0) + 1
    })(model),
  ).toEqualTypeOf<Model>()

  expectTypeOf(
    Obj.modifyPath(['pair', 0, 'label'], (label: string) => {
      expectTypeOf(label).toEqualTypeOf<string>()
      return label.toUpperCase()
    })(model),
  ).toEqualTypeOf<Model>()
})

test('missing intermediates are writable only when the created shape is complete', () => {
  type SafeBranch = {
    readonly branch?: {
      readonly target: string
      readonly optionalSibling?: number
    }
  }
  type UnsafeBranch = {
    readonly branch?: {
      readonly target: string
      readonly sibling: number
    }
  }
  type NullableUnsafeBranch = {
    readonly branch: {
      readonly target: string
      readonly sibling: number
    } | null
  }
  type UnionBranch =
    | {
        readonly branch?: {
          readonly target: string
        }
      }
    | {
        readonly branch?: {
          readonly target: string
          readonly sibling: number
        }
      }

  const safeBranch = {} as SafeBranch
  const unsafeBranch = {} as UnsafeBranch
  const nullableUnsafeBranch = {} as NullableUnsafeBranch
  const unionBranch = {} as UnionBranch
  expectTypeOf(Obj.setPath(['branch', 'target'], 'ready')(safeBranch)).toEqualTypeOf<SafeBranch>()
  expectTypeOf(
    Obj.modifyPath(['branch', 'target'], (target: string | undefined) => target?.trim() ?? '')(
      safeBranch,
    ),
  ).toEqualTypeOf<SafeBranch>()

  // @ts-expect-error constructing branch would omit required sibling.
  Obj.setPath(['branch', 'target'], 'ready')(unsafeBranch)
  // @ts-expect-error modifiers cannot construct a branch that omits required sibling.
  Obj.modifyPath(['branch', 'target'], () => 'ready')(unsafeBranch)
  // @ts-expect-error the same required-sibling rule applies to nullable containers.
  Obj.setPath(['branch', 'target'], 'ready')(nullableUnsafeBranch)
  // @ts-expect-error every union member must be independently constructible.
  Obj.setPath(['branch', 'target'], 'ready')(unionBranch)

  const setUnsafeTarget = Obj.setPath(['branch', 'target'], 'ready')
  // @ts-expect-error data-last set validates constructibility against the eventual source.
  setUnsafeTarget(unsafeBranch)
  const modifyUnsafeTarget = Obj.modifyPath(
    ['branch', 'target'],
    (_target: string | undefined): string => 'ready',
  )
  // @ts-expect-error data-last modify validates constructibility against the eventual source.
  modifyUnsafeTarget(unsafeBranch)
})

test('nullish, indexed, nominal, callable, and stateful containers remain sound', () => {
  type NullableSafe = {
    readonly branch: { readonly target: string } | null
  }
  type UndefinedSafe = {
    readonly branch: { readonly target: string } | undefined
  }
  const nullableSafe = {} as NullableSafe
  const undefinedSafe = {} as UndefinedSafe

  expectTypeOf(
    Obj.setPath(['branch', 'target'], 'ready')(nullableSafe),
  ).toEqualTypeOf<NullableSafe>()
  expectTypeOf(
    Obj.modifyPath(['branch', 'target'], (target: string | undefined) => target?.trim() ?? '')(
      nullableSafe,
    ),
  ).toEqualTypeOf<NullableSafe>()
  expectTypeOf(
    Obj.setPath(['branch', 'target'], 'ready')(undefinedSafe),
  ).toEqualTypeOf<UndefinedSafe>()
  expectTypeOf(
    Obj.setPath(['branch', 'target'], 'ready')(nullableSafe),
  ).toEqualTypeOf<NullableSafe>()

  type Indexed = {
    readonly values: Readonly<Record<string, { readonly target: string }>>
  }
  const indexed = {} as Indexed
  const indexKey: string = 'missing'
  expectTypeOf(
    Obj.modifyPath(['values', indexKey, 'target'], (target: string | undefined) => {
      expectTypeOf(target).toEqualTypeOf<string | undefined>()
      return target?.trim() ?? ''
    })(indexed),
  ).toEqualTypeOf<Indexed>()
  // @ts-expect-error an unchecked index cannot promise a present callback focus.
  Obj.modifyPath(['values', indexKey, 'target'], (target: string): string => target.trim())(indexed)

  type IndexedWithSibling = {
    readonly [key: string]: unknown
    readonly target: string
    readonly sibling: number
  }
  const indexedSibling = {} as { readonly branch?: IndexedWithSibling }
  // @ts-expect-error an index signature does not make required explicit siblings constructible.
  Obj.setPath(['branch', 'target'], 'ready')(indexedSibling)

  class Counter {
    readonly #brand = true
    constructor(readonly count: number) {}
  }
  type Callable = (() => void) & { readonly count: number }
  const nominal = {} as { readonly counter?: Counter }
  const callable = {} as { readonly callable?: Callable }
  const presentNominal = {} as { readonly counter: Counter }
  const presentCallable = {} as { readonly callable: Callable }
  const counter = {} as Counter
  // @ts-expect-error a missing nominal instance cannot be synthesized as a plain object.
  Obj.setPath(['counter', 'count'], 2)(nominal)
  // @ts-expect-error a missing callable cannot be synthesized as a plain object.
  Obj.setPath(['callable', 'count'], 2)(callable)
  // @ts-expect-error nominal instances are guaranteed to fail the plain-container runtime check.
  Obj.setPath(['count'], 2)(counter)
  // @ts-expect-error nested nominal instances cannot be traversed either.
  Obj.modifyPath(['counter', 'count'], (count: number) => count + 1)(presentNominal)
  // @ts-expect-error callable objects are not supported path containers.
  Obj.setPath(['callable', 'count'], 2)(presentCallable)
  // @ts-expect-error removal cannot traverse a callable object.
  Obj.removePath(['callable', 'nickname'])({} as { readonly callable: Callable & { readonly nickname?: string } })

  type StatefulArray = readonly number[] & { readonly state: string }
  const stateful = {} as { readonly values?: StatefulArray }
  const presentStateful = {} as { readonly values: StatefulArray }
  const dynamicIndex: number = 0
  // @ts-expect-error constructing an array would omit its required intersection state.
  Obj.setPath(['values', dynamicIndex], 1)(stateful)
  expectTypeOf(Obj.setPath(['values', dynamicIndex], 1)(presentStateful)).toEqualTypeOf<{
    readonly values: StatefulArray
  }>()

  class PrivateArray extends Array<number> {
    readonly #arrayBrand = true
  }
  const privateArray = {} as { readonly values: PrivateArray }
  // @ts-expect-error array subclasses with private state cannot be immutably cloned.
  Obj.setPath(['values', dynamicIndex], 1)(privateArray)
})

test('unchecked collections validate the shape of values they may need to create', () => {
  type Complete = { readonly target: string; readonly sibling: number }
  type Constructible = { readonly target: string; readonly optionalSibling?: number }
  type UnsafeRows = { readonly rows: readonly Complete[] }
  type SafeRows = { readonly rows: readonly Constructible[] }
  type UnsafeIndex = { readonly entries: Readonly<Record<string, Complete>> }
  type SafeIndex = { readonly entries: Readonly<Record<string, Constructible>> }

  const unsafeRows = {} as UnsafeRows
  const safeRows = {} as SafeRows
  const unsafeIndex = {} as UnsafeIndex
  const safeIndex = {} as SafeIndex
  const row: number = 3
  const key: string = 'missing'

  expectTypeOf(Obj.setPath(['rows', row, 'target'], 'ready')(safeRows)).toEqualTypeOf<SafeRows>()
  expectTypeOf(
    Obj.modifyPath(['rows', row, 'target'], (target: string | undefined) => target?.trim() ?? '')(
      safeRows,
    ),
  ).toEqualTypeOf<SafeRows>()
  expectTypeOf(
    Obj.setPath(['entries', key, 'target'], 'ready')(safeIndex),
  ).toEqualTypeOf<SafeIndex>()

  const setRowTarget = Obj.setPath(['rows', row, 'target'], 'ready')
  expectTypeOf(setRowTarget(safeRows)).toEqualTypeOf<SafeRows>()
  // @ts-expect-error data-last array writes retain the constructibility guard.
  setRowTarget(unsafeRows)
  const modifyEntryTarget = Obj.modifyPath(
    ['entries', key, 'target'],
    (_target: string | undefined): string => 'ready',
  )
  expectTypeOf(modifyEntryTarget(safeIndex)).toEqualTypeOf<SafeIndex>()
  // @ts-expect-error data-last index-signature writes retain the constructibility guard.
  modifyEntryTarget(unsafeIndex)

  // @ts-expect-error a missing array element cannot be created without required sibling.
  Obj.setPath(['rows', row, 'target'], 'ready')(unsafeRows)
  // @ts-expect-error the same array constructibility rule applies to modify.
  Obj.modifyPath(['rows', row, 'target'], () => 'ready')(unsafeRows)
  // @ts-expect-error a missing index-signature entry cannot omit required sibling.
  Obj.setPath(['entries', key, 'target'], 'ready')(unsafeIndex)
  // @ts-expect-error the same index-signature constructibility rule applies to modify.
  Obj.modifyPath(['entries', key, 'target'], () => 'ready')(unsafeIndex)
})

test('missing fixed tuples require every sibling index promised by the tuple', () => {
  type TupleState = {
    readonly pair?: readonly [{ readonly target: string }, number?]
  }
  const tupleState = {} as TupleState

  expectTypeOf(Obj.setPath(['pair', 0, 'target'], 'ready')(tupleState)).toEqualTypeOf<TupleState>()
  expectTypeOf(
    Obj.modifyPath(['pair', 0, 'target'], (target: string | undefined) => target?.trim() ?? '')(
      tupleState,
    ),
  ).toEqualTypeOf<TupleState>()

  // @ts-expect-error constructing optional index 1 would omit required tuple index 0.
  Obj.setPath(['pair', 1], 2)(tupleState)
  // @ts-expect-error modify has the same required-index constructibility rule.
  Obj.modifyPath(['pair', 1], () => 2)(tupleState)

  type VariadicState = {
    readonly items?: readonly [{ readonly target: string }, ...number[]]
  }
  const variadicState = {} as VariadicState
  expectTypeOf(
    Obj.setPath(['items', 0, 'target'], 'ready')(variadicState),
  ).toEqualTypeOf<VariadicState>()
  // @ts-expect-error a rest index cannot construct a tuple while omitting required index 0.
  Obj.setPath(['items', 1], 2)(variadicState)
  const dynamicIndex: number = 0
  // @ts-expect-error a dynamic index cannot guarantee it supplies required tuple index 0.
  Obj.setPath(['items', dynamicIndex], 2)(variadicState)

  type StatefulTuple = readonly [{ readonly target: string }, number?] & {
    readonly state: string
  }
  type CallableTuple = readonly [{ readonly target: string }, number?] & (() => void)
  type BrandedTuple = readonly [{ readonly target: string }, number?] & {
    readonly [tupleBrand]: true
  }
  const missingStateful = {} as { readonly pair?: StatefulTuple }
  const missingCallable = {} as { readonly pair?: CallableTuple }
  const missingBranded = {} as { readonly pair?: BrandedTuple }
  const presentStateful = {} as { readonly pair: StatefulTuple }

  expectTypeOf(Obj.setPath(['pair', 0, 'target'], 'ready')(presentStateful)).toEqualTypeOf<{
    readonly pair: StatefulTuple
  }>()
  // @ts-expect-error synthesizing a fixed tuple would omit its required intersection state.
  Obj.setPath(['pair', 0, 'target'], 'ready')(missingStateful)
  // @ts-expect-error a synthesized fixed tuple cannot reproduce a call signature.
  Obj.setPath(['pair', 0, 'target'], 'ready')(missingCallable)
  // @ts-expect-error a synthesized fixed tuple cannot reproduce required branded state.
  Obj.setPath(['pair', 0, 'target'], 'ready')(missingBranded)
})

test('union sources expose only write focuses safe for every member', () => {
  type Shared =
    | { readonly kind: 'a'; readonly value: number }
    | {
        readonly kind: 'b'
        readonly value: number
      }
  type Correlated =
    | { readonly kind: 'a'; readonly value: string }
    | {
        readonly kind: 'b'
        readonly value: number
      }
  type Nested = {
    readonly payload:
      | { readonly kind: 'a'; readonly value: string }
      | { readonly kind: 'b'; readonly value: number }
  }

  const shared = {} as Shared
  const correlated = {} as Correlated
  const nested = {} as Nested
  expectTypeOf(Obj.setPath(['value'], 2)(shared)).toEqualTypeOf<Shared>()
  expectTypeOf(Obj.modifyPath(['value'], (value: number) => value + 1)(shared)).toEqualTypeOf<Shared>()

  // @ts-expect-error changing a discriminant is unsafe for at least one union member.
  Obj.setPath(['kind'], 'a')(shared)
  // @ts-expect-error correlated member focus types intersect to no safe replacement.
  Obj.setPath(['value'], 'changed')(correlated)
  // @ts-expect-error modifiers must return a focus safe for every correlated member.
  Obj.modifyPath(['value'], () => 'changed')(correlated)
  // @ts-expect-error nested structural unions retain the same correlation protection.
  Obj.setPath(['payload', 'value'], 'changed')(nested)
})

test('removePath preserves T only for optional leaves', () => {
  expectTypeOf(Obj.removePath([])(model)).toEqualTypeOf<Model>()
  expectTypeOf(Obj.removePath(['preferences', 'nickname'])(model)).toEqualTypeOf<Model>()
  expectTypeOf(Obj.removePath(['profile'])(model)).toEqualTypeOf<Model>()
  expectTypeOf(Obj.removePath(['pair', 1])(model)).toEqualTypeOf<Model>()

  // @ts-expect-error required object properties cannot be deleted while returning T.
  Obj.removePath(['version'])(model)
  // @ts-expect-error required nested properties cannot be deleted while returning T.
  Obj.removePath(['profile', 'name'])(model)
  // @ts-expect-error deleting an array index creates a hole not represented by its element type.
  Obj.removePath(['scores', 0])(model)
  // @ts-expect-error required tuple elements cannot be deleted while returning the tuple type.
  Obj.removePath(['pair', 0])(model)

  const removeNickname = Obj.removePath(['preferences', 'nickname'])
  expectTypeOf(removeNickname(model)).toEqualTypeOf<Model>()

  const removeVersion = Obj.removePath(['version'])
  // @ts-expect-error data-last removal validates optionality against the eventual source.
  removeVersion(model)

  const pathUnion = ['profile'] as const as readonly ['profile'] | readonly ['version']
  // @ts-expect-error removals also reject unions of paths.
  Obj.removePath(pathUnion)(model)
  // @ts-expect-error data-last removals reject unions before accepting a source.
  Obj.removePath(pathUnion)

  type OptionalInBoth =
    | { readonly kind: 'a'; readonly removable?: number }
    | { readonly kind: 'b'; readonly removable?: number }
  type RequiredInOne =
    | { readonly kind: 'a'; readonly removable?: number }
    | { readonly kind: 'b'; readonly removable: number }
  const optionalInBoth = {} as OptionalInBoth
  const requiredInOne = {} as RequiredInOne
  expectTypeOf(Obj.removePath(['removable'])(optionalInBoth)).toEqualTypeOf<OptionalInBoth>()
  // @ts-expect-error a removable union focus must be optional in every member.
  Obj.removePath(['removable'])(requiredInOne)

  const indexed = {} as Readonly<Record<string, number>>
  const dynamicKey: string = 'dynamic'
  expectTypeOf(Obj.removePath(['literal'])(indexed)).toEqualTypeOf<
    Readonly<Record<string, number>>
  >()
  expectTypeOf(Obj.removePath([dynamicKey])(indexed)).toEqualTypeOf<
    Readonly<Record<string, number>>
  >()
})

test('data-last path writes are checked when their source is supplied', () => {
  const setName = Obj.setPath(['profile', 'name'], 'Grace')
  expectTypeOf(setName(model)).toEqualTypeOf<Model>()

  const index: number = 1
  const setScore = Obj.setPath(['scores', index], 42)
  expectTypeOf(setScore(model)).toEqualTypeOf<Model>()

  const normalizeName = Obj.modifyPath(
    ['profile', 'name'],
    (name: string | undefined): string => name?.trim() ?? '',
  )
  expectTypeOf(normalizeName(model)).toEqualTypeOf<Model>()

  const wrongName = Obj.setPath(['profile', 'name'], 42)
  // @ts-expect-error the eventual source rejects an incompatible replacement.
  wrongName(model)

  const mixedName = Obj.setPath(['profile', 'name'], 'Grace' as string | number)
  // @ts-expect-error every member of a curried replacement union must fit the eventual focus.
  mixedName(model)

  const wrongModifier = Obj.modifyPath(
    ['profile', 'name'],
    (_name: string | undefined): number => 42,
  )
  // @ts-expect-error the eventual source rejects an incompatible modifier result.
  wrongModifier(model)

  const unknownPath = Obj.setPath(['profile', 'missing'], 'value')
  // @ts-expect-error the eventual source rejects an invalid path.
  unknownPath(model)

  const correlatedPath = ['version'] as const as readonly ['version'] | readonly ['profile', 'name']
  // @ts-expect-error data-last writes reject unions of otherwise valid paths.
  Obj.setPath(correlatedPath, 2 as number | string)
  // @ts-expect-error data-last modifiers reject unions of otherwise valid paths.
  Obj.modifyPath(correlatedPath, (value: number | string | undefined) => value)

  const unionSegment = ['version' as 'version' | 'profile'] as const
  // @ts-expect-error data-last writes reject union-valued path segments.
  Obj.setPath(unionSegment, 2)
  // @ts-expect-error data-last modifiers reject union-valued path segments.
  Obj.modifyPath(unionSegment, (value: unknown) => value)

  const dynamicPath: PathSegments = ['version']
  // @ts-expect-error data-last writes reject broad runtime path arrays.
  Obj.setPath(dynamicPath, 2)
  // @ts-expect-error data-last modifiers reject broad runtime path arrays.
  Obj.modifyPath(dynamicPath, (value: unknown) => value)
})

test('path helper types distinguish observed values from writable values', () => {
  expectTypeOf<readonly []>().toMatchTypeOf<ValidPath<Model>>()
  expectTypeOf<readonly ['version']>().toMatchTypeOf<ValidPath<Model>>()
  expectTypeOf<readonly ['profile', 'name']>().toMatchTypeOf<ValidPath<Model>>()
  expectTypeOf<readonly ['scores', number]>().toMatchTypeOf<ValidPath<Model>>()
  expectTypeOf<readonly ['pair', 0, 'label']>().toMatchTypeOf<ValidPath<Model>>()
  expectTypeOf<PathValue<Model, readonly ['profile', 'name']>>().toEqualTypeOf<string | undefined>()
  expectTypeOf<PathWriteValue<Model, readonly ['profile', 'name']>>().toEqualTypeOf<string>()
  expectTypeOf<
    PathWriteValue<Model, readonly ['preferences', 'nickname']>
  >().toEqualTypeOf<string>()
  expectTypeOf<PathWriteValue<Model, readonly ['explicitlyUndefined']>>().toEqualTypeOf<
    string | undefined
  >()
  expectTypeOf<PathValue<Model, readonly ['scores', number]>>().toEqualTypeOf<number | undefined>()
  expectTypeOf<PathWriteValue<Model, readonly ['scores', number]>>().toEqualTypeOf<number>()
  expectTypeOf<PathWriteValue<Model, readonly ['pair', 1]>>().toEqualTypeOf<number>()
  expectTypeOf<PathValue<Model, readonly []>>().toEqualTypeOf<Model>()
  expectTypeOf<PathWriteValue<Model, readonly []>>().toEqualTypeOf<Model>()

  type IndexedWithKnownKey = {
    readonly [key: string]: string | number
    readonly known: string
  }
  expectTypeOf<PathValue<IndexedWithKnownKey, readonly ['known']>>().toEqualTypeOf<string>()
  expectTypeOf<PathValue<IndexedWithKnownKey, readonly ['unknown']>>().toEqualTypeOf<
    string | number | undefined
  >()
  expectTypeOf<PathValue<IndexedWithKnownKey, readonly [string]>>().toEqualTypeOf<
    string | number | undefined
  >()

  const root: ValidPath<Model> = []
  const nested: ValidPath<Model> = ['profile', 'name']
  const arrayElement: ValidPath<Model> = ['scores', 100]
  const index: number = 100
  expectTypeOf(Obj.pathOf<Model>()('scores', index)).toEqualTypeOf<readonly ['scores', number]>()
  void root
  void nested
  void arrayElement

  // @ts-expect-error tuple path unions exclude invalid object keys.
  const invalidKey: ValidPath<Model> = ['profile', 'missing']
  // @ts-expect-error tuple path unions exclude out-of-range tuple indices.
  const invalidTupleIndex: ValidPath<Model> = ['pair', 2]
  // @ts-expect-error pathOf rejects a union-valued segment too.
  Obj.pathOf<Model>()('version' as 'version' | 'profile')

  const indexed = {} as Readonly<Record<string, number>>
  const broadKey: string = 'runtime-key'
  expectTypeOf(Obj.setPath([broadKey], 1)(indexed)).toEqualTypeOf<
    Readonly<Record<string, number>>
  >()
  // @ts-expect-error unsafe literal mutation keys are rejected before runtime.
  Obj.setPath(['__proto__'], 1)(indexed)
  // @ts-expect-error unsafe literal mutation keys are rejected in data-last form too.
  Obj.modifyPath(['constructor'], (_value: number | undefined) => 1)
  // @ts-expect-error unsafe literal mutation keys cannot be captured with pathOf.
  Obj.pathOf<Readonly<Record<string, number>>>()('prototype')
  // @ts-expect-error removal rejects unsafe literal mutation keys.
  Obj.removePath(['__proto__'])(indexed)
  void invalidKey
  void invalidTupleIndex
})
