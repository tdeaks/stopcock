export type Reader<Environment, A> = (environment: Environment) => A

export const ask =
  <Environment>(): Reader<Environment, Environment> =>
  (environment) => environment

export const asks = <Environment, A>(
  project: (environment: Environment) => A,
): Reader<Environment, A> => project

export const of =
  <A>(value: A): Reader<unknown, A> =>
  () => value

export const map: {
  <A, B, Environment>(
    self: Reader<Environment, A>,
    transform: (value: A) => B,
  ): Reader<Environment, B>
  <A, B>(
    transform: (value: A) => B,
  ): <Environment>(self: Reader<Environment, A>) => Reader<Environment, B>
} = function map<A, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return map(__arg1)(__arg0)
  const transform = __arg0
  return <Environment>(self: Reader<Environment, A>): Reader<Environment, B> =>
  (environment) =>
    transform(self(environment))
} as any

export const flatMap: {
  <A, Environment2, B, Environment>(
    self: Reader<Environment, A>,
    transform: (value: A) => Reader<Environment2, B>,
  ): Reader<Environment & Environment2, B>
  <A, Environment2, B>(
    transform: (value: A) => Reader<Environment2, B>,
  ): <Environment>(self: Reader<Environment, A>) => Reader<Environment & Environment2, B>
} = function flatMap<A, Environment2, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return flatMap(__arg1)(__arg0)
  const transform = __arg0
  return <Environment>(
    self: Reader<Environment, A>,
  ): Reader<Environment & Environment2, B> =>
  (environment) =>
    transform(self(environment))(environment)
} as any

export const flatten =
  <Environment, Environment2, A>(
    self: Reader<Environment, Reader<Environment2, A>>,
  ): Reader<Environment & Environment2, A> =>
  (environment) =>
    self(environment)(environment)

export const zipWith: {
  <Environment2, B, A, C, Environment>(
    self: Reader<Environment, A>,
    that: Reader<Environment2, B>,
    combine: (self: A, that: B) => C,
  ): Reader<Environment & Environment2, C>
  <Environment2, B, A, C>(
    that: Reader<Environment2, B>,
    combine: (self: A, that: B) => C,
  ): <Environment>(self: Reader<Environment, A>) => Reader<Environment & Environment2, C>
} = function zipWith<Environment2, B, A, C>(__arg0: any, __arg1?: any, __arg2?: any): any {
  if (arguments.length >= 3) return zipWith(__arg1, __arg2)(__arg0)
  const that = __arg0
  const combine = __arg1
  return <Environment>(
    self: Reader<Environment, A>,
  ): Reader<Environment & Environment2, C> =>
  (environment) =>
    combine(self(environment), that(environment))
} as any

export const zip: {
  <Environment2, B, Environment, A>(
    self: Reader<Environment, A>,
    that: Reader<Environment2, B>,
  ): Reader<Environment & Environment2, readonly [A, B]>
  <Environment2, B>(
    that: Reader<Environment2, B>,
  ): <Environment, A>(
    self: Reader<Environment, A>,
  ) => Reader<Environment & Environment2, readonly [A, B]>
} = function zip<Environment2, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return zip(__arg1)(__arg0)
  const that = __arg0
  return <Environment, A>(
    self: Reader<Environment, A>,
  ): Reader<Environment & Environment2, readonly [A, B]> =>
    zipWith<Environment2, B, A, readonly [A, B]>(
      that,
      (left, right) => [left, right] as const,
    )(self)
} as any

export const ap: {
  <Environment2, A, Environment, B>(
    self: Reader<Environment, (value: A) => B>,
    value: Reader<Environment2, A>,
  ): Reader<Environment & Environment2, B>
  <Environment2, A>(
    value: Reader<Environment2, A>,
  ): <Environment, B>(
    self: Reader<Environment, (value: A) => B>,
  ) => Reader<Environment & Environment2, B>
} = function ap<Environment2, A>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return ap(__arg1)(__arg0)
  const value = __arg0
  return <Environment, B>(
    self: Reader<Environment, (value: A) => B>,
  ): Reader<Environment & Environment2, B> =>
  (environment) =>
    self(environment)(value(environment))
} as any

export const tap: {
  <A, Environment2, B, Environment>(
    self: Reader<Environment, A>,
    effect: (value: A) => Reader<Environment2, B>,
  ): Reader<Environment & Environment2, A>
  <A, Environment2, B>(
    effect: (value: A) => Reader<Environment2, B>,
  ): <Environment>(self: Reader<Environment, A>) => Reader<Environment & Environment2, A>
} = function tap<A, Environment2, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return tap(__arg1)(__arg0)
  const effect = __arg0
  return <Environment>(
    self: Reader<Environment, A>,
  ): Reader<Environment & Environment2, A> =>
  (environment) => {
    const value = self(environment)
    effect(value)(environment)
    return value
  }
} as any

export const local: {
  <Environment0, Environment, A>(
    self: Reader<Environment, A>,
    transform: (environment: Environment0) => Environment,
  ): Reader<Environment0, A>
  <Environment0, Environment>(
    transform: (environment: Environment0) => Environment,
  ): <A>(self: Reader<Environment, A>) => Reader<Environment0, A>
} = function local<Environment0, Environment>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return local(__arg1)(__arg0)
  const transform = __arg0
  return <A>(self: Reader<Environment, A>): Reader<Environment0, A> =>
  (environment) =>
    self(transform(environment))
} as any

export const provide: {
  <Environment, A>(self: Reader<Environment, A>, environment: Environment): A
  <Environment>(environment: Environment): <A>(self: Reader<Environment, A>) => A
} = function provide<Environment>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return provide(__arg1)(__arg0)
  const environment = __arg0
  return <A>(self: Reader<Environment, A>): A =>
    self(environment)
} as any

export const compose: {
  <A, Environment, B>(
    self: Reader<Environment, B>,
    toEnvironment: (value: A) => Environment,
  ): Reader<A, B>
  <A, Environment>(
    toEnvironment: (value: A) => Environment,
  ): <B>(self: Reader<Environment, B>) => Reader<A, B>
} = function compose<A, Environment>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return compose(__arg1)(__arg0)
  const toEnvironment: (value: A) => Environment = __arg0
  return <B>(self: Reader<Environment, B>): Reader<A, B> =>
    local(toEnvironment)(self)
} as any

/** Traverses with dense array semantics. */
export const traverseReadonlyArray: {
  <A, Environment, B>(
    values: readonly A[],
    transform: (value: A, index: number) => Reader<Environment, B>,
  ): Reader<Environment, readonly B[]>
  <A, Environment, B>(
    transform: (value: A, index: number) => Reader<Environment, B>,
  ): (values: readonly A[]) => Reader<Environment, readonly B[]>
} = function traverseReadonlyArray<A, Environment, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return traverseReadonlyArray(__arg1)(__arg0)
  const transform = __arg0
  return (values: readonly A[]): Reader<Environment, readonly B[]> =>
  (environment) => {
    const result = new Array<B>(values.length)
    for (let index = 0; index < values.length; index += 1) {
      result[index] = transform(values[index] as A, index)(environment)
    }
    return result
  }
} as any

export const sequenceReadonlyArray = <Environment, A>(
  values: readonly Reader<Environment, A>[],
): Reader<Environment, readonly A[]> =>
  traverseReadonlyArray((value: Reader<Environment, A>) => value)(values)
