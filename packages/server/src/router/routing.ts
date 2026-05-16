type ExtractParams<S extends string> =
  S extends `${string}:${infer Rest}`
    ? Rest extends `${infer Name}/${infer Tail}`
      ? { [K in Name]: string } & ExtractParams<`/${Tail}`>
      : { [K in Rest]: string }
    : {}

type Pretty<T> = { [K in keyof T]: T[K] } & {}

export type Params<P extends string> = Pretty<ExtractParams<P>>
