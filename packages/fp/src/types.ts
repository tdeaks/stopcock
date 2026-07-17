export type Fn<A, B> = (a: A) => B
export type LazyValue<A> = () => A

export type PathKey = string | number | symbol
export type PathSegments = readonly PathKey[]

type StringPathValue<T, P extends string> =
  P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? StringPathValue<T[K], Rest>
      : unknown
    : P extends keyof T
      ? T[P]
      : unknown

type PathValueAt<T, K extends PathKey> =
  K extends keyof NonNullable<T>
    ? NonNullable<T>[K]
    : unknown

type WithNullishIntermediate<T, V> =
  undefined extends T
    ? V | undefined
    : null extends T
      ? V | undefined
      : V

type TuplePathValue<T, P extends readonly unknown[]> =
  P extends readonly []
    ? T
    : P extends readonly [infer K, ...infer Rest]
      ? K extends PathKey
        ? WithNullishIntermediate<T, TuplePathValue<PathValueAt<T, K>, Rest>>
        : unknown
      : unknown

export type PathValue<T, P extends string | PathSegments> =
  P extends string
    ? StringPathValue<T, P>
    : P extends PathSegments
      ? TuplePathValue<T, P>
      : unknown

export type PathValueOrDefault<T, P extends string | PathSegments, D> =
  Exclude<PathValue<T, P>, undefined> | D
