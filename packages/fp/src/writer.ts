import type { Monoid } from './monoid'

export type Writer<Output, A> = readonly [A, Output]

export const writer = <Output, A>(value: A, output: Output): Writer<Output, A> => [value, output]

export const value = <Output, A>(self: Writer<Output, A>): A => self[0]
export const written = <Output, A>(self: Writer<Output, A>): Output => self[1]

export const of: {
  <Output, A>(item: A, output: Monoid<Output>): Writer<Output, A>
  <Output>(output: Monoid<Output>): <A>(item: A) => Writer<Output, A>
} = function of<Output>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return of(__arg1)(__arg0)
  const output = __arg0
  return <A>(item: A): Writer<Output, A> =>
    [item, output.empty]
} as any

export const tell = <Output>(output: Output): Writer<Output, void> => [undefined, output]

export const map: {
  <A, B, Output>(self: Writer<Output, A>, transform: (value: A) => B): Writer<Output, B>
  <A, B>(transform: (value: A) => B): <Output>(self: Writer<Output, A>) => Writer<Output, B>
} = function map<A, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return map(__arg1)(__arg0)
  const transform = __arg0
  return <Output>(self: Writer<Output, A>): Writer<Output, B> =>
    [transform(self[0]), self[1]]
} as any

export const mapWritten: {
  <Output, Output2, A>(
    self: Writer<Output, A>,
    transform: (output: Output) => Output2,
  ): Writer<Output2, A>
  <Output, Output2>(
    transform: (output: Output) => Output2,
  ): <A>(self: Writer<Output, A>) => Writer<Output2, A>
} = function mapWritten<Output, Output2>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return mapWritten(__arg1)(__arg0)
  const transform = __arg0
  return <A>(self: Writer<Output, A>): Writer<Output2, A> =>
    [self[0], transform(self[1])]
} as any

export const bimap: {
  <Output, Output2, A, B>(
    self: Writer<Output, A>,
    mapOutput: (output: Output) => Output2,
    mapValue: (value: A) => B,
  ): Writer<Output2, B>
  <Output, Output2, A, B>(
    mapOutput: (output: Output) => Output2,
    mapValue: (value: A) => B,
  ): (self: Writer<Output, A>) => Writer<Output2, B>
} = function bimap<Output, Output2, A, B>(__arg0: any, __arg1?: any, __arg2?: any): any {
  if (arguments.length >= 3) return bimap(__arg1, __arg2)(__arg0)
  const mapOutput = __arg0
  const mapValue = __arg1
  return (self: Writer<Output, A>): Writer<Output2, B> =>
    [mapValue(self[0]), mapOutput(self[1])]
} as any

export const flatMap: {
  <Output, A, B>(
    self: Writer<Output, A>,
    output: Monoid<Output>,
    transform: (value: A) => Writer<Output, B>,
  ): Writer<Output, B>
  <Output>(
    output: Monoid<Output>,
  ): <A, B>(
    transform: (value: A) => Writer<Output, B>,
  ) => (self: Writer<Output, A>) => Writer<Output, B>
} = function flatMap<Output>(__arg0: any, __arg1?: any, __arg2?: any): any {
  if (arguments.length >= 3) return flatMap(__arg1)(__arg2)(__arg0)
  const output = __arg0
  return <A, B>(transform: (value: A) => Writer<Output, B>) =>
  (self: Writer<Output, A>): Writer<Output, B> => {
    const next = transform(self[0])
    return [next[0], output.combine(self[1], next[1])]
  }
} as any

export const flatten: {
  <Output, A>(self: Writer<Output, Writer<Output, A>>, output: Monoid<Output>): Writer<Output, A>
  <Output>(
    output: Monoid<Output>,
  ): <A>(self: Writer<Output, Writer<Output, A>>) => Writer<Output, A>
} = function flatten<Output>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return flatten(__arg1)(__arg0)
  const output = __arg0
  return <A>(self: Writer<Output, Writer<Output, A>>): Writer<Output, A> => [
    self[0][0],
    output.combine(self[1], self[0][1]),
  ]
} as any

export const zipWith: {
  <Output, A, B, C>(
    self: Writer<Output, A>,
    output: Monoid<Output>,
    that: Writer<Output, B>,
    combine: (self: A, that: B) => C,
  ): Writer<Output, C>
  <Output>(
    output: Monoid<Output>,
  ): <A, B, C>(
    that: Writer<Output, B>,
    combine: (self: A, that: B) => C,
  ) => (self: Writer<Output, A>) => Writer<Output, C>
} = function zipWith<Output>(__arg0: any, __arg1?: any, __arg2?: any, __arg3?: any): any {
  if (arguments.length >= 4) return zipWith(__arg1)(__arg2, __arg3)(__arg0)
  const output = __arg0
  return <A, B, C>(that: Writer<Output, B>, combine: (self: A, that: B) => C) =>
  (self: Writer<Output, A>): Writer<Output, C> => [
    combine(self[0], that[0]),
    output.combine(self[1], that[1]),
  ]
} as any

export const zip: {
  <Output, B, A>(
    self: Writer<Output, A>,
    output: Monoid<Output>,
    that: Writer<Output, B>,
  ): Writer<Output, readonly [A, B]>
  <Output>(
    output: Monoid<Output>,
  ): <B>(that: Writer<Output, B>) => <A>(self: Writer<Output, A>) => Writer<Output, readonly [A, B]>
} = function zip<Output>(__arg0: any, __arg1?: any, __arg2?: any): any {
  if (arguments.length >= 3) return zip(__arg1)(__arg2)(__arg0)
  const output = __arg0
  return <B>(that: Writer<Output, B>) =>
  <A>(self: Writer<Output, A>): Writer<Output, readonly [A, B]> => [
    [self[0], that[0]],
    output.combine(self[1], that[1]),
  ]
} as any

export const listen = <Output, A>(
  self: Writer<Output, A>,
): Writer<Output, readonly [A, Output]> => [[self[0], self[1]], self[1]]

export const listens: {
  <Output, B, A>(
    self: Writer<Output, A>,
    project: (output: Output) => B,
  ): Writer<Output, readonly [A, B]>
  <Output, B>(
    project: (output: Output) => B,
  ): <A>(self: Writer<Output, A>) => Writer<Output, readonly [A, B]>
} = function listens<Output, B>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return listens(__arg1)(__arg0)
  const project = __arg0
  return <A>(self: Writer<Output, A>): Writer<Output, readonly [A, B]> => [
    [self[0], project(self[1])],
    self[1],
  ]
} as any

export const censor: {
  <Output, A>(self: Writer<Output, A>, transform: (output: Output) => Output): Writer<Output, A>
  <Output>(transform: (output: Output) => Output): <A>(self: Writer<Output, A>) => Writer<Output, A>
} = function censor<Output>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return censor(__arg1)(__arg0)
  const transform = __arg0
  return <A>(self: Writer<Output, A>): Writer<Output, A> =>
    [self[0], transform(self[1])]
} as any

export const pass = <Output, A>(
  self: Writer<Output, readonly [A, (output: Output) => Output]>,
): Writer<Output, A> => [self[0][0], self[0][1](self[1])]

/** Traverses left-to-right with dense array semantics. */
export const traverseReadonlyArray: {
  <Output, A, B>(
    values: readonly A[],
    output: Monoid<Output>,
    transform: (value: A, index: number) => Writer<Output, B>,
  ): Writer<Output, readonly B[]>
  <Output>(
    output: Monoid<Output>,
  ): <A, B>(
    transform: (value: A, index: number) => Writer<Output, B>,
  ) => (values: readonly A[]) => Writer<Output, readonly B[]>
} = function traverseReadonlyArray<Output>(__arg0: any, __arg1?: any, __arg2?: any): any {
  if (arguments.length >= 3) return traverseReadonlyArray(__arg1)(__arg2)(__arg0)
  const output = __arg0
  return <A, B>(transform: (value: A, index: number) => Writer<Output, B>) =>
  (values: readonly A[]): Writer<Output, readonly B[]> => {
    const result = new Array<B>(values.length)
    let written = output.empty
    for (let index = 0; index < values.length; index += 1) {
      const next = transform(values[index] as A, index)
      result[index] = next[0]
      written = output.combine(written, next[1])
    }
    return [result, written]
  }
} as any

export const sequenceReadonlyArray: {
  <Output, A>(
    values: readonly Writer<Output, A>[],
    output: Monoid<Output>,
  ): Writer<Output, readonly A[]>
  <Output>(
    output: Monoid<Output>,
  ): <A>(values: readonly Writer<Output, A>[]) => Writer<Output, readonly A[]>
} = function sequenceReadonlyArray<Output>(__arg0: any, __arg1?: any): any {
  if (arguments.length >= 2) return sequenceReadonlyArray(__arg1)(__arg0)
  const output = __arg0
  return <A>(values: readonly Writer<Output, A>[]): Writer<Output, readonly A[]> => {
    const result = new Array<A>(values.length)
    let written = output.empty
    for (let index = 0; index < values.length; index += 1) {
      const next = values[index] as Writer<Output, A>
      result[index] = next[0]
      written = output.combine(written, next[1])
    }
    return [result, written]
  }
} as any
