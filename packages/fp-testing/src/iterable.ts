export interface IteratorProbe {
  iterations: number
  pulls: number
  returns: number
  completions: number
}

export interface TrackedIterable<A> {
  readonly iterable: Iterable<A>
  readonly probe: IteratorProbe
}

export const trackedIterable = <A>(values: readonly A[]): TrackedIterable<A> => {
  const probe: IteratorProbe = {
    iterations: 0,
    pulls: 0,
    returns: 0,
    completions: 0,
  }

  const iterable: Iterable<A> = {
    [Symbol.iterator](): Iterator<A> {
      probe.iterations++
      let index = 0
      let closed = false
      return {
        next(): IteratorResult<A> {
          probe.pulls++
          if (closed || index >= values.length) {
            if (!closed) {
              closed = true
              probe.completions++
            }
            return { done: true, value: undefined }
          }
          return { done: false, value: values[index++] as A }
        },
        return(): IteratorResult<A> {
          if (!closed) {
            closed = true
            probe.returns++
          }
          return { done: true, value: undefined }
        },
      }
    },
  }

  return { iterable, probe }
}

export const throwingIterable = <A>(
  values: readonly A[],
  throwAtPull: number,
  error: unknown = new Error('Iterator probe failure'),
): Iterable<A> => ({
  *[Symbol.iterator](): Generator<A, void, undefined> {
    let pull = 0
    for (const value of values) {
      if (pull++ === throwAtPull) throw error
      yield value
    }
    if (pull === throwAtPull) throw error
  },
})

export const referenceMap = <A, B>(source: Iterable<A>, f: (value: A, index: number) => B): B[] => {
  const output: B[] = []
  let index = 0
  for (const value of source) output.push(f(value, index++))
  return output
}

export const referenceFilter = <A>(
  source: Iterable<A>,
  predicate: (value: A, index: number) => boolean,
): A[] => {
  const output: A[] = []
  let index = 0
  for (const value of source) {
    if (predicate(value, index++)) output.push(value)
  }
  return output
}

export const referenceTake = <A>(source: Iterable<A>, count: number): A[] => {
  const output: A[] = []
  const limit = Number.isNaN(count) || count <= 0 ? 0 : Math.floor(count)
  if (limit === 0) return output
  for (const value of source) {
    output.push(value)
    if (output.length === limit) break
  }
  return output
}
