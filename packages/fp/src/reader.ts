export type Reader<Environment, A> = (environment: Environment) => A

export const ask = <Environment>(): Reader<Environment, Environment> => (environment) => environment

export const asks = <Environment, A>(
  project: (environment: Environment) => A,
): Reader<Environment, A> => project

export const of = <A>(value: A): Reader<unknown, A> => () => value

export const map =
  <A, B>(transform: (value: A) => B) =>
  <Environment>(self: Reader<Environment, A>): Reader<Environment, B> =>
  (environment) =>
    transform(self(environment))

export const flatMap =
  <A, Environment2, B>(transform: (value: A) => Reader<Environment2, B>) =>
  <Environment>(
    self: Reader<Environment, A>,
  ): Reader<Environment & Environment2, B> =>
  (environment) =>
    transform(self(environment))(environment)

export const flatten = <Environment, Environment2, A>(
  self: Reader<Environment, Reader<Environment2, A>>,
): Reader<Environment & Environment2, A> =>
  (environment) =>
    self(environment)(environment)

export const zipWith =
  <Environment2, B, A, C>(
    that: Reader<Environment2, B>,
    combine: (self: A, that: B) => C,
  ) =>
  <Environment>(
    self: Reader<Environment, A>,
  ): Reader<Environment & Environment2, C> =>
  (environment) =>
    combine(self(environment), that(environment))

export const zip =
  <Environment2, B>(that: Reader<Environment2, B>) =>
  <Environment, A>(
    self: Reader<Environment, A>,
  ): Reader<Environment & Environment2, readonly [A, B]> =>
    zipWith<Environment2, B, A, readonly [A, B]>(
      that,
      (left, right) => [left, right] as const,
    )(self)

export const ap =
  <Environment2, A>(value: Reader<Environment2, A>) =>
  <Environment, B>(
    self: Reader<Environment, (value: A) => B>,
  ): Reader<Environment & Environment2, B> =>
  (environment) =>
    self(environment)(value(environment))

export const tap =
  <A, Environment2, B>(effect: (value: A) => Reader<Environment2, B>) =>
  <Environment>(
    self: Reader<Environment, A>,
  ): Reader<Environment & Environment2, A> =>
  (environment) => {
    const value = self(environment)
    effect(value)(environment)
    return value
  }

export const local =
  <Environment0, Environment>(
    transform: (environment: Environment0) => Environment,
  ) =>
  <A>(self: Reader<Environment, A>): Reader<Environment0, A> =>
  (environment) =>
    self(transform(environment))

export const provide =
  <Environment>(environment: Environment) =>
  <A>(self: Reader<Environment, A>): A =>
    self(environment)

export const compose =
  <A, Environment>(toEnvironment: (value: A) => Environment) =>
  <B>(self: Reader<Environment, B>): Reader<A, B> =>
    local(toEnvironment)(self)

/** Traverses with dense array semantics. */
export const traverseReadonlyArray =
  <A, Environment, B>(transform: (value: A, index: number) => Reader<Environment, B>) =>
  (values: readonly A[]): Reader<Environment, readonly B[]> =>
  (environment) => {
    const result = new Array<B>(values.length)
    for (let index = 0; index < values.length; index += 1) {
      result[index] = transform(values[index] as A, index)(environment)
    }
    return result
  }

export const sequenceReadonlyArray = <Environment, A>(
  values: readonly Reader<Environment, A>[],
): Reader<Environment, readonly A[]> =>
  traverseReadonlyArray((value: Reader<Environment, A>) => value)(values)
