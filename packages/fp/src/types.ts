export type Fn<A, B> = (a: A) => B
export type LazyValue<A> = () => A

export type PathValue<T, P extends string> =
  P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? PathValue<T[K], Rest>
      : unknown
    : P extends keyof T
      ? T[P]
      : unknown
