import type { Monoid } from './monoid'

export type Writer<Output, A> = readonly [A, Output]

export const writer = <Output, A>(value: A, output: Output): Writer<Output, A> => [
  value,
  output,
]

export const value = <Output, A>(self: Writer<Output, A>): A => self[0]
export const written = <Output, A>(self: Writer<Output, A>): Output => self[1]

export const of =
  <Output>(output: Monoid<Output>) =>
  <A>(item: A): Writer<Output, A> =>
    [item, output.empty]

export const tell = <Output>(output: Output): Writer<Output, void> => [undefined, output]

export const map =
  <A, B>(transform: (value: A) => B) =>
  <Output>(self: Writer<Output, A>): Writer<Output, B> =>
    [transform(self[0]), self[1]]

export const mapWritten =
  <Output, Output2>(transform: (output: Output) => Output2) =>
  <A>(self: Writer<Output, A>): Writer<Output2, A> =>
    [self[0], transform(self[1])]

export const bimap =
  <Output, Output2, A, B>(
    mapOutput: (output: Output) => Output2,
    mapValue: (value: A) => B,
  ) =>
  (self: Writer<Output, A>): Writer<Output2, B> =>
    [mapValue(self[0]), mapOutput(self[1])]

export const flatMap =
  <Output>(output: Monoid<Output>) =>
  <A, B>(transform: (value: A) => Writer<Output, B>) =>
  (self: Writer<Output, A>): Writer<Output, B> => {
    const next = transform(self[0])
    return [next[0], output.combine(self[1], next[1])]
  }

export const flatten =
  <Output>(output: Monoid<Output>) =>
  <A>(self: Writer<Output, Writer<Output, A>>): Writer<Output, A> => [
    self[0][0],
    output.combine(self[1], self[0][1]),
  ]

export const zipWith =
  <Output>(output: Monoid<Output>) =>
  <A, B, C>(that: Writer<Output, B>, combine: (self: A, that: B) => C) =>
  (self: Writer<Output, A>): Writer<Output, C> => [
    combine(self[0], that[0]),
    output.combine(self[1], that[1]),
  ]

export const zip =
  <Output>(output: Monoid<Output>) =>
  <B>(that: Writer<Output, B>) =>
  <A>(self: Writer<Output, A>): Writer<Output, readonly [A, B]> => [
    [self[0], that[0]],
    output.combine(self[1], that[1]),
  ]

export const listen = <Output, A>(
  self: Writer<Output, A>,
): Writer<Output, readonly [A, Output]> => [[self[0], self[1]], self[1]]

export const listens =
  <Output, B>(project: (output: Output) => B) =>
  <A>(self: Writer<Output, A>): Writer<Output, readonly [A, B]> => [
    [self[0], project(self[1])],
    self[1],
  ]

export const censor =
  <Output>(transform: (output: Output) => Output) =>
  <A>(self: Writer<Output, A>): Writer<Output, A> =>
    [self[0], transform(self[1])]

export const pass = <Output, A>(
  self: Writer<Output, readonly [A, (output: Output) => Output]>,
): Writer<Output, A> => [self[0][0], self[0][1](self[1])]

/** Traverses left-to-right with dense array semantics. */
export const traverseReadonlyArray =
  <Output>(output: Monoid<Output>) =>
  <A, B>(transform: (value: A, index: number) => Writer<Output, B>) =>
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

export const sequenceReadonlyArray =
  <Output>(output: Monoid<Output>) =>
  <A>(values: readonly Writer<Output, A>[]): Writer<Output, readonly A[]> => {
    const result = new Array<A>(values.length)
    let written = output.empty
    for (let index = 0; index < values.length; index += 1) {
      const next = values[index] as Writer<Output, A>
      result[index] = next[0]
      written = output.combine(written, next[1])
    }
    return [result, written]
  }
