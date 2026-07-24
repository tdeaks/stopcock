export type Fn<A, B> = (a: A) => B
export type LazyValue<A> = () => A

export type PathKey = string | number | symbol
export type PathSegments = readonly PathKey[]

type UnionMemberFlag<T, Whole = T> = T extends unknown
  ? [Whole] extends [T]
    ? false
    : true
  : never

type ContainsUnion<T> = true extends UnionMemberFlag<T> ? true : false

type IsSinglePathKey<K extends PathKey> = ContainsUnion<K> extends true ? false : true

type UnsafeWritePathKey = '__proto__' | 'constructor' | 'prototype'

type IsSafePathKey<K extends PathKey> = K extends string
  ? string extends K
    ? true
    : K extends UnsafeWritePathKey
      ? false
      : true
  : true

type LiteralPathSegments<P extends PathSegments> = P extends readonly []
  ? P
  : P extends readonly [infer K extends PathKey, ...infer Rest extends PathSegments]
    ? IsSinglePathKey<K> extends true
      ? IsSafePathKey<K> extends true
        ? LiteralPathSegments<Rest> extends never
          ? never
          : P
        : never
      : never
    : never

/**
 * A single finite tuple path whose segments are not unions.
 *
 * Broad path arrays, unions of paths, and paths containing a union segment are
 * rejected because their focus and replacement types cannot remain correlated.
 * Unsafe object-mutation keys are also rejected when they are known literals.
 * A broad segment such as `number` or `string` remains valid when
 * `ValidPath<T>` permits it for an array or index signature; broad strings are
 * checked for unsafe values at runtime.
 */
export type LiteralPath<P extends PathSegments> =
  ContainsUnion<P> extends true
    ? never
    : number extends P['length']
      ? never
      : LiteralPathSegments<P>

type TupleIndex<T extends readonly unknown[]> =
  Exclude<keyof T, keyof (readonly unknown[])> extends infer K
    ? K extends `${infer N extends number}`
      ? N
      : never
    : never

type PathKeys<T> =
  NonNullable<T> extends readonly unknown[]
    ? number extends NonNullable<T>['length']
      ? number
      : TupleIndex<NonNullable<T>>
    : keyof NonNullable<T> & PathKey

type PathChild<T, K extends PathKey> = K extends keyof NonNullable<T>
  ? NonNullable<T>[K]
  : NonNullable<T> extends readonly (infer A)[]
    ? K extends number
      ? A
      : never
    : never

type TupleWithoutUndefinedAt<T extends readonly unknown[], K extends number> = {
  [I in keyof T]: I extends `${K}` ? Exclude<T[I], undefined> : T[I]
}

type TupleWriteChild<T extends readonly unknown[], K extends number> = [TupleIndex<T>] extends [
  never,
]
  ? T[number]
  : K extends keyof Required<T>
    ? {} extends Pick<T, K>
      ? T extends TupleWithoutUndefinedAt<T, K>
        ? Required<T>[K]
        : Required<T>[K] | undefined
      : T[K]
    : never

type PathWriteChild<T, K extends PathKey> =
  NonNullable<T> extends readonly unknown[]
    ? K extends number
      ? TupleWriteChild<NonNullable<T>, K>
      : never
    : K extends keyof Required<NonNullable<T>>
      ? Required<NonNullable<T>>[K]
      : never

type RequiredTupleIndices<T extends readonly unknown[]> = {
  [K in TupleIndex<T>]-?: {} extends Pick<T, K> ? never : K
}[TupleIndex<T>]

type HasMatchingIndexSignature<T, K extends PathKey> = K extends string
  ? string extends keyof T
    ? true
    : false
  : K extends number
    ? number extends keyof T
      ? true
      : false
    : symbol extends keyof T
      ? true
      : false

type WithoutIndexSignatures<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K]: T[K]
}

type ExplicitKeys<T> = keyof WithoutIndexSignatures<T>

type PublicShape<T extends object> = { [K in keyof T]: T[K] }

type ContainerMemberIsTraversable<T> = T extends object
  ? PublicShape<T> extends T
    ? true
    : false
  : false

type ContainerIsTraversable<T> = false extends (
  NonNullable<T> extends infer Member
    ? Member extends unknown
      ? ContainerMemberIsTraversable<Member>
      : never
    : never
)
  ? false
  : true

type ArrayBase<T extends readonly unknown[]> = T extends readonly [...infer Elements]
  ? T extends unknown[]
    ? [...Elements]
    : readonly [...Elements]
  : T extends unknown[]
    ? Array<T[number]>
    : ReadonlyArray<T[number]>

type ContainerMemberIsConstructible<T, K extends PathKey> = T extends readonly unknown[]
  ? [TupleIndex<T>] extends [never]
    ? K extends number
      ? Array<T[number]> extends T
        ? true
        : false
      : false
    : ArrayBase<T> extends T
      ? RequiredTupleIndices<T> extends never
        ? true
        : K extends number
          ? number extends K
            ? false
            : Exclude<RequiredTupleIndices<T>, K> extends never
              ? true
              : false
          : false
      : false
  : T extends object
    ? K extends keyof T
      ? Required<Pick<T, K>> extends T
        ? true
        : false
      : false
    : false

type ContainerIsConstructible<T, K extends PathKey> = false extends (
  NonNullable<T> extends infer Member
    ? Member extends unknown
      ? ContainerMemberIsConstructible<Member, K>
      : never
    : never
)
  ? false
  : true

type CurrentMayBeMissing<T> = undefined extends T ? true : null extends T ? true : false

type MemberHasUncheckedKey<T, K extends PathKey> = T extends readonly unknown[]
  ? [TupleIndex<T>] extends [never]
    ? K extends number
      ? true
      : false
    : K extends number
      ? K extends RequiredTupleIndices<T>
        ? false
        : true
      : false
  : T extends object
    ? K extends ExplicitKeys<T>
      ? false
      : HasMatchingIndexSignature<T, K>
    : false

type HasUncheckedKey<T, K extends PathKey> = true extends (
  NonNullable<T> extends infer Member
    ? Member extends unknown
      ? MemberHasUncheckedKey<Member, K>
      : never
    : never
)
  ? true
  : false

type ConstructionChild<T, K extends PathKey> =
  | PathChild<T, K>
  | (CurrentMayBeMissing<T> extends true
      ? undefined
      : HasUncheckedKey<T, K> extends true
        ? undefined
        : never)

/**
 * Whether traversing `P` can create every missing container without omitting
 * required sibling fields or tuple elements.
 */
export type IsPathConstructible<T, P extends PathSegments> = P extends readonly []
  ? true
  : P extends readonly [infer K extends PathKey, ...infer Rest extends PathSegments]
    ? ContainerIsTraversable<T> extends true
      ? CurrentMayBeMissing<T> extends true
        ? ContainerIsConstructible<T, K> extends true
          ? IsPathConstructible<ConstructionChild<T, K>, Rest>
          : false
        : IsPathConstructible<ConstructionChild<T, K>, Rest>
      : false
    : false

type OptionalLeafMember<T, K extends PathKey> = T extends readonly unknown[]
  ? number extends T['length']
    ? false
    : K extends TupleIndex<T>
      ? {} extends Pick<T, K>
        ? true
        : false
      : false
  : T extends object
    ? K extends keyof T
      ? Omit<T, K> extends T
        ? true
        : false
      : false
    : false

type IsOptionalLeaf<T, K extends PathKey> = false extends (
  NonNullable<T> extends infer Member
    ? Member extends unknown
      ? OptionalLeafMember<Member, K>
      : never
    : never
)
  ? false
  : true

/** Whether deleting the leaf at `P` preserves `T`. */
export type IsRemovablePath<T, P extends PathSegments> = P extends readonly []
  ? true
  : P extends readonly [infer K extends PathKey]
    ? ContainerIsTraversable<T> extends true
      ? IsOptionalLeaf<T, K>
      : false
    : P extends readonly [infer K extends PathKey, ...infer Rest extends PathSegments]
      ? ContainerIsTraversable<T> extends true
        ? IsRemovablePath<ConstructionChild<T, K>, Rest>
        : false
      : false

/**
 * Every statically valid tuple path into `T`, including the empty path which
 * focuses `T` itself. Array paths accept numeric indices; tuple paths accept
 * only their known numeric indices.
 */
export type ValidPath<T, Depth extends readonly unknown[] = []> = Depth['length'] extends 8
  ? readonly []
  :
      | readonly []
      | (NonNullable<T> extends readonly unknown[]
          ?
              | {
                  [K in TupleIndex<NonNullable<T>>]: ValidPath<
                    PathChild<T, K>,
                    readonly [...Depth, unknown]
                  > extends infer Rest extends PathSegments
                    ? readonly [K, ...Rest]
                    : never
                }[TupleIndex<NonNullable<T>>]
              | (number extends NonNullable<T>['length']
                  ? ValidPath<
                      NonNullable<T>[number],
                      readonly [...Depth, unknown]
                    > extends infer Rest extends PathSegments
                    ? readonly [number, ...Rest]
                    : never
                  : never)
          : NonNullable<T> extends object
            ? {
                [K in PathKeys<T>]: ValidPath<
                  PathChild<T, K>,
                  readonly [...Depth, unknown]
                > extends infer Rest extends PathSegments
                  ? readonly [K, ...Rest]
                  : never
              }[PathKeys<T>]
            : never)

type StringPathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? StringPathValue<T[K], Rest>
    : unknown
  : P extends keyof T
    ? T[P]
    : unknown

type PathValueAt<T, K extends PathKey> = K extends keyof NonNullable<T>
  ? NonNullable<T>[K]
  : NonNullable<T> extends readonly (infer A)[]
    ? K extends number
      ? A
      : unknown
    : unknown

type WithPossiblyMissingSegment<T, K extends PathKey, V> = undefined extends T
  ? V | undefined
  : null extends T
    ? V | undefined
    : HasUncheckedKey<T, K> extends true
      ? V | undefined
      : V

type TuplePathValue<T, P extends readonly unknown[]> = P extends readonly []
  ? T
  : P extends readonly [infer K, ...infer Rest]
    ? K extends PathKey
      ? WithPossiblyMissingSegment<T, K, TuplePathValue<PathValueAt<T, K>, Rest>>
      : unknown
    : unknown

type IntersectMemberWrites<T, K extends PathKey, P extends readonly unknown[]> = (
  NonNullable<T> extends infer Member
    ? Member extends unknown
      ? (value: TuplePathWriteValue<PathWriteChild<Member, K>, P>) => void
      : never
    : never
) extends (value: infer I) => void
  ? I
  : never

type TuplePathWriteValue<T, P extends readonly unknown[]> = P extends readonly []
  ? T
  : P extends readonly [infer K, ...infer Rest]
    ? K extends PathKeys<T>
      ? IntersectMemberWrites<T, K, Rest>
      : never
    : never

export type PathValue<T, P extends string | PathSegments> = P extends string
  ? StringPathValue<T, P>
  : P extends PathSegments
    ? TuplePathValue<T, P>
    : unknown

/**
 * The value that can be written at `P` without changing the declared shape of
 * `T`. Missing optional intermediates do not add `undefined` to the write type:
 * writing through them creates the missing containers at runtime.
 */
export type PathWriteValue<T, P extends PathSegments> = TuplePathWriteValue<T, P>

export type PathValueOrDefault<T, P extends string | PathSegments, D> =
  | Exclude<PathValue<T, P>, undefined>
  | D
