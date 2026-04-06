import { dual } from './dual'

export interface Stream<A> {
  [Symbol.iterator](): Iterator<A>
}

const make = <A>(iter: () => Iterator<A>): Stream<A> => ({ [Symbol.iterator]: iter })

// --- Creators ---

export const from = <A>(iterable: Iterable<A>): Stream<A> =>
  make(() => iterable[Symbol.iterator]())

export const range = (start: number, end: number): Stream<number> =>
  make(function* () {
    for (let i = start; i < end; i++) yield i
  })

export const iterate = <A>(f: (a: A) => A, seed: A): Stream<A> =>
  make(function* () {
    let current = seed
    while (true) { yield current; current = f(current) }
  })

export const repeat = <A>(value: A): Stream<A> =>
  make(function* () { while (true) yield value })

export const empty = <A = never>(): Stream<A> =>
  make(function* () {})

// --- Transformers ---

export const map: {
  <A, B>(stream: Stream<A>, f: (a: A) => B): Stream<B>
  <A, B>(f: (a: A) => B): (stream: Stream<A>) => Stream<B>
} = dual(2, <A, B>(stream: Stream<A>, f: (a: A) => B): Stream<B> =>
  make(function* () { for (const a of stream) yield f(a) }))

export const filter: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A>
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A> =>
  make(function* () { for (const a of stream) if (pred(a)) yield a }))

export const flatMap: {
  <A, B>(stream: Stream<A>, f: (a: A) => Stream<B>): Stream<B>
  <A, B>(f: (a: A) => Stream<B>): (stream: Stream<A>) => Stream<B>
} = dual(2, <A, B>(stream: Stream<A>, f: (a: A) => Stream<B>): Stream<B> =>
  make(function* () { for (const a of stream) yield* f(a) }))

export const take: {
  <A>(stream: Stream<A>, n: number): Stream<A>
  (n: number): <A>(stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, n: number): Stream<A> =>
  make(function* () {
    if (n <= 0) return
    let i = 0
    const it = stream[Symbol.iterator]()
    let next = it.next()
    while (!next.done) {
      yield next.value
      if (++i >= n) return
      next = it.next()
    }
  }))

export const drop: {
  <A>(stream: Stream<A>, n: number): Stream<A>
  (n: number): <A>(stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, n: number): Stream<A> =>
  make(function* () {
    let i = 0
    for (const a of stream) { if (i++ < n) continue; yield a }
  }))

export const takeWhile: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A>
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A> =>
  make(function* () { for (const a of stream) { if (!pred(a)) return; yield a } }))

export const dropWhile: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A>
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A> =>
  make(function* () {
    let dropping = true
    for (const a of stream) {
      if (dropping && pred(a)) continue
      dropping = false
      yield a
    }
  }))

export const chunk: {
  <A>(stream: Stream<A>, n: number): Stream<A[]>
  (n: number): <A>(stream: Stream<A>) => Stream<A[]>
} = dual(2, <A>(stream: Stream<A>, n: number): Stream<A[]> => {
  if (n < 1) throw new Error(`chunk: size must be >= 1, got ${n}`)
  return make(function* () {
    let buf: A[] = []
    for (const a of stream) {
      buf.push(a)
      if (buf.length === n) { yield buf; buf = [] }
    }
    if (buf.length > 0) yield buf
  })
})

export const scan: {
  <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): Stream<B>
  <A, B>(f: (acc: B, a: A) => B, init: B): (stream: Stream<A>) => Stream<B>
} = dual(3, <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): Stream<B> =>
  make(function* () {
    let acc = init
    for (const a of stream) { acc = f(acc, a); yield acc }
  }))

export const zip: {
  <A, B>(stream: Stream<A>, other: Stream<B>): Stream<[A, B]>
  <B>(other: Stream<B>): <A>(stream: Stream<A>) => Stream<[A, B]>
} = dual(2, <A, B>(stream: Stream<A>, other: Stream<B>): Stream<[A, B]> =>
  make(function* () {
    const itA = stream[Symbol.iterator]()
    const itB = other[Symbol.iterator]()
    while (true) {
      const a = itA.next(), b = itB.next()
      if (a.done || b.done) return
      yield [a.value, b.value] as [A, B]
    }
  }))

export const concat: {
  <A>(stream: Stream<A>, other: Stream<A>): Stream<A>
  <A>(other: Stream<A>): (stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, other: Stream<A>): Stream<A> =>
  make(function* () { yield* stream; yield* other }))

export const distinct = <A>(stream: Stream<A>): Stream<A> =>
  make(function* () {
    const seen = new Set<A>()
    for (const a of stream) { if (!seen.has(a)) { seen.add(a); yield a } }
  })

export const distinctN: {
  <A>(stream: Stream<A>, maxSize: number): Stream<A>
  (maxSize: number): <A>(stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, maxSize: number): Stream<A> =>
  make(function* () {
    const seen = new Set<A>()
    for (const a of stream) {
      if (!seen.has(a)) {
        if (seen.size >= maxSize) seen.clear()
        seen.add(a)
        yield a
      }
    }
  }))

export const intersperse: {
  <A>(stream: Stream<A>, sep: A): Stream<A>
  <A>(sep: A): (stream: Stream<A>) => Stream<A>
} = dual(2, <A>(stream: Stream<A>, sep: A): Stream<A> =>
  make(function* () {
    let first = true
    for (const a of stream) { if (!first) yield sep; first = false; yield a }
  }))

// --- Terminals ---

export const toArray = <A>(stream: Stream<A>): A[] => [...stream]

export const collect = toArray

export const reduce: {
  <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): B
  <A, B>(f: (acc: B, a: A) => B, init: B): (stream: Stream<A>) => B
} = dual(3, <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): B => {
  let acc = init
  for (const a of stream) acc = f(acc, a)
  return acc
})

export const first = <A>(stream: Stream<A>): A | undefined => {
  for (const a of stream) return a
  return undefined
}

export const last = <A>(stream: Stream<A>): A | undefined => {
  let result: A | undefined
  for (const a of stream) result = a
  return result
}

export const count = <A>(stream: Stream<A>): number => {
  let n = 0
  for (const _ of stream) n++
  return n
}

export const every: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => boolean
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean => {
  for (const a of stream) if (!pred(a)) return false
  return true
})

export const some: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => boolean
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean => {
  for (const a of stream) if (pred(a)) return true
  return false
})

export const find: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): A | undefined
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => A | undefined
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): A | undefined => {
  for (const a of stream) if (pred(a)) return a
  return undefined
})

export const forEach: {
  <A>(stream: Stream<A>, f: (a: A) => void): void
  <A>(f: (a: A) => void): (stream: Stream<A>) => void
} = dual(2, <A>(stream: Stream<A>, f: (a: A) => void): void => {
  for (const a of stream) f(a)
})
