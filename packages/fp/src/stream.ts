import { dual } from './dual'
import { tryInlineSource } from './fuse'

export interface Stream<A> {
  [Symbol.iterator](): Iterator<A>
}

type Step =
  | { tag: 'map'; fn: (value: any) => any }
  | { tag: 'filter'; pred: (value: any) => boolean }
  | { tag: 'flatMap'; fn: (value: any) => Iterable<any> }
  | { tag: 'take'; n: number }
  | { tag: 'drop'; n: number }
  | { tag: 'takeWhile'; pred: (value: any) => boolean }
  | { tag: 'dropWhile'; pred: (value: any) => boolean }
  | { tag: 'scan'; fn: (acc: any, value: any) => any; init: any }

type RuntimeState = {
  counts: number[]
  dropping: boolean[]
  scanAcc: any[]
}

const STOP = 0
const CONTINUE = 1

class PipelineStream<A> implements Stream<A> {
  readonly source: Iterable<any>
  readonly steps: readonly Step[]

  constructor(source: Iterable<any>, steps: readonly Step[]) {
    this.source = source
    this.steps = steps
  }

  [Symbol.iterator](): Iterator<A> {
    return iteratePipeline(this.source, this.steps)
  }
}

const make = <A>(iter: () => Iterator<A>): Stream<A> => ({ [Symbol.iterator]: iter })

const isPipeline = <A>(stream: Stream<A>): stream is PipelineStream<A> =>
  stream instanceof PipelineStream

const appendStep = <A, B>(stream: Stream<A>, step: Step): Stream<B> =>
  isPipeline(stream)
    ? new PipelineStream<B>(stream.source, [...stream.steps, step])
    : new PipelineStream<B>(stream, [step])

const initState = (steps: readonly Step[]): RuntimeState => ({
  counts: new Array(steps.length).fill(0),
  dropping: steps.map((step) => step.tag === 'dropWhile'),
  scanAcc: steps.map((step) => (step.tag === 'scan' ? step.init : undefined)),
})

const hasZeroTake = (steps: readonly Step[]): boolean =>
  steps.some((step) => step.tag === 'take' && step.n <= 0)

type ArrayMapFilterTakeRunner = (
  source: readonly any[],
  mapFn: (value: any) => any,
  pred: (value: any) => boolean,
  take: number,
) => any[]

let arrayMapFilterTakeMapFn: Function | null = null
let arrayMapFilterTakePred: Function | null = null
let arrayMapFilterTakeRunner: ArrayMapFilterTakeRunner | null = null

const runArrayMapFilterTakeFallback: ArrayMapFilterTakeRunner = (source, mapFn, pred, take) => {
  const out: any[] = []
  let count = 0

  for (let i = 0, len = source.length; i < len && count < take; i++) {
    const mapped = mapFn(source[i])
    if (pred(mapped)) out[count++] = mapped
  }

  return out
}

const getArrayMapFilterTakeRunner = (
  mapFn: (value: any) => any,
  pred: (value: any) => boolean,
): ArrayMapFilterTakeRunner => {
  if (
    mapFn === arrayMapFilterTakeMapFn &&
    pred === arrayMapFilterTakePred &&
    arrayMapFilterTakeRunner
  ) {
    return arrayMapFilterTakeRunner
  }

  const mapSrc = tryInlineSource(mapFn)
  const predSrc = tryInlineSource(pred)
  let runner = runArrayMapFilterTakeFallback

  if (mapSrc && predSrc) {
    try {
      runner = new Function(
        'source',
        'mapFn',
        'pred',
        'take',
        `var out=[];var count=0;for(var i=0,len=source.length;i<len&&count<take;i++){var v=source[i];v=${mapSrc};if(${predSrc})out[count++]=v}return out`,
      ) as ArrayMapFilterTakeRunner
    } catch {
      runner = runArrayMapFilterTakeFallback
    }
  }

  arrayMapFilterTakeMapFn = mapFn
  arrayMapFilterTakePred = pred
  arrayMapFilterTakeRunner = runner
  return runner
}

function visitProcessed(
  value: any,
  steps: readonly Step[],
  index: number,
  state: RuntimeState,
  emit: (value: any) => boolean | void,
): number {
  let current = value
  let stopAfterCurrent = false

  for (let i = index; i < steps.length; i++) {
    const step = steps[i]!

    switch (step.tag) {
      case 'map':
        current = step.fn(current)
        break
      case 'filter':
        if (!step.pred(current)) return stopAfterCurrent ? STOP : CONTINUE
        break
      case 'flatMap':
        for (const inner of step.fn(current)) {
          if (visitProcessed(inner, steps, i + 1, state, emit) === STOP) return STOP
        }
        return stopAfterCurrent ? STOP : CONTINUE
      case 'take':
        if (state.counts[i]! >= step.n) return STOP
        state.counts[i] = state.counts[i]! + 1
        if (state.counts[i]! >= step.n) stopAfterCurrent = true
        break
      case 'drop':
        if (state.counts[i]! < step.n) {
          state.counts[i] = state.counts[i]! + 1
          return stopAfterCurrent ? STOP : CONTINUE
        }
        break
      case 'takeWhile':
        if (!step.pred(current)) return STOP
        break
      case 'dropWhile':
        if (state.dropping[i]) {
          if (step.pred(current)) return stopAfterCurrent ? STOP : CONTINUE
          state.dropping[i] = false
        }
        break
      case 'scan':
        state.scanAcc[i] = step.fn(state.scanAcc[i], current)
        current = state.scanAcc[i]
        break
    }
  }

  return emit(current) === false || stopAfterCurrent ? STOP : CONTINUE
}

function visitPipeline(
  source: Iterable<any>,
  steps: readonly Step[],
  emit: (value: any) => boolean | void,
): void {
  if (hasZeroTake(steps)) return

  const state = initState(steps)

  if (Array.isArray(source)) {
    for (let i = 0, len = source.length; i < len; i++) {
      if (visitProcessed(source[i], steps, 0, state, emit) === STOP) return
    }
    return
  }

  for (const value of source) {
    if (visitProcessed(value, steps, 0, state, emit) === STOP) return
  }
}

function* yieldProcessed(
  value: any,
  steps: readonly Step[],
  index: number,
  state: RuntimeState,
): Generator<any, number> {
  let current = value
  let stopAfterCurrent = false

  for (let i = index; i < steps.length; i++) {
    const step = steps[i]!

    switch (step.tag) {
      case 'map':
        current = step.fn(current)
        break
      case 'filter':
        if (!step.pred(current)) return stopAfterCurrent ? STOP : CONTINUE
        break
      case 'flatMap':
        for (const inner of step.fn(current)) {
          const result = yield* yieldProcessed(inner, steps, i + 1, state)
          if (result === STOP) return STOP
        }
        return stopAfterCurrent ? STOP : CONTINUE
      case 'take':
        if (state.counts[i]! >= step.n) return STOP
        state.counts[i] = state.counts[i]! + 1
        if (state.counts[i]! >= step.n) stopAfterCurrent = true
        break
      case 'drop':
        if (state.counts[i]! < step.n) {
          state.counts[i] = state.counts[i]! + 1
          return stopAfterCurrent ? STOP : CONTINUE
        }
        break
      case 'takeWhile':
        if (!step.pred(current)) return STOP
        break
      case 'dropWhile':
        if (state.dropping[i]) {
          if (step.pred(current)) return stopAfterCurrent ? STOP : CONTINUE
          state.dropping[i] = false
        }
        break
      case 'scan':
        state.scanAcc[i] = step.fn(state.scanAcc[i], current)
        current = state.scanAcc[i]
        break
    }
  }

  yield current
  return stopAfterCurrent ? STOP : CONTINUE
}

function* iteratePipeline<A>(source: Iterable<any>, steps: readonly Step[]): Iterator<A> {
  if (hasZeroTake(steps)) return

  const state = initState(steps)

  for (const value of source) {
    const result = yield* yieldProcessed(value, steps, 0, state)
    if (result === STOP) return
  }
}

function tryArrayMapFilterTakeToArray<A>(stream: PipelineStream<A>): A[] | null {
  const { source, steps } = stream
  if (!Array.isArray(source) || steps.length !== 3) return null

  const [mapStep, filterStep, takeStep] = steps
  if (mapStep?.tag !== 'map' || filterStep?.tag !== 'filter' || takeStep?.tag !== 'take')
    return null
  if (takeStep.n <= 0) return []

  return getArrayMapFilterTakeRunner(mapStep.fn, filterStep.pred)(
    source,
    mapStep.fn,
    filterStep.pred,
    takeStep.n,
  )
}

function toArrayInternal<A>(stream: Stream<A>): A[] {
  if (isPipeline(stream)) {
    const specialized = tryArrayMapFilterTakeToArray(stream)
    if (specialized) return specialized

    const out: A[] = []
    visitPipeline(stream.source, stream.steps, (value) => {
      out.push(value)
    })
    return out
  }

  return [...stream]
}

// --- Creators ---

export const from = <A>(iterable: Iterable<A>): Stream<A> => new PipelineStream<A>(iterable, [])

export const range = (start: number, end: number): Stream<number> =>
  make(function* () {
    for (let i = start; i < end; i++) yield i
  })

export const iterate = <A>(f: (a: A) => A, seed: A): Stream<A> =>
  make(function* () {
    let current = seed
    while (true) {
      yield current
      current = f(current)
    }
  })

export const repeat = <A>(value: A): Stream<A> =>
  make(function* () {
    while (true) yield value
  })

export const empty = <A = never>(): Stream<A> => make(function* () {})

// --- Transformers ---

export const map: {
  <A, B>(stream: Stream<A>, f: (a: A) => B): Stream<B>
  <A, B>(f: (a: A) => B): (stream: Stream<A>) => Stream<B>
} = dual(
  2,
  <A, B>(stream: Stream<A>, f: (a: A) => B): Stream<B> => appendStep(stream, { tag: 'map', fn: f }),
) as any

export const filter: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A>
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A> =>
    appendStep(stream, { tag: 'filter', pred }),
) as any

export const flatMap: {
  <A, B>(stream: Stream<A>, f: (a: A) => Stream<B>): Stream<B>
  <A, B>(f: (a: A) => Stream<B>): (stream: Stream<A>) => Stream<B>
} = dual(
  2,
  <A, B>(stream: Stream<A>, f: (a: A) => Stream<B>): Stream<B> =>
    appendStep(stream, { tag: 'flatMap', fn: f }),
) as any

export const take: {
  <A>(stream: Stream<A>, n: number): Stream<A>
  (n: number): <A>(stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, n: number): Stream<A> => appendStep(stream, { tag: 'take', n }),
) as any

export const drop: {
  <A>(stream: Stream<A>, n: number): Stream<A>
  (n: number): <A>(stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, n: number): Stream<A> => appendStep(stream, { tag: 'drop', n }),
) as any

export const takeWhile: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A>
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A> =>
    appendStep(stream, { tag: 'takeWhile', pred }),
) as any

export const dropWhile: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A>
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, pred: (a: A) => boolean): Stream<A> =>
    appendStep(stream, { tag: 'dropWhile', pred }),
) as any

export const chunk: {
  <A>(stream: Stream<A>, n: number): Stream<A[]>
  (n: number): <A>(stream: Stream<A>) => Stream<A[]>
} = dual(2, <A>(stream: Stream<A>, n: number): Stream<A[]> => {
  if (n < 1) throw new Error(`chunk: size must be >= 1, got ${n}`)

  return make(function* () {
    let buf: A[] = []
    for (const a of stream) {
      buf.push(a)
      if (buf.length === n) {
        yield buf
        buf = []
      }
    }
    if (buf.length > 0) yield buf
  })
}) as any

export const scan: {
  <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): Stream<B>
  <A, B>(f: (acc: B, a: A) => B, init: B): (stream: Stream<A>) => Stream<B>
} = dual(
  3,
  <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): Stream<B> =>
    appendStep(stream, { tag: 'scan', fn: f, init }),
) as any

export const zip: {
  <A, B>(stream: Stream<A>, other: Stream<B>): Stream<[A, B]>
  <B>(other: Stream<B>): <A>(stream: Stream<A>) => Stream<[A, B]>
} = dual(
  2,
  <A, B>(stream: Stream<A>, other: Stream<B>): Stream<[A, B]> =>
    make(function* () {
      const itA = stream[Symbol.iterator]()
      const itB = other[Symbol.iterator]()
      while (true) {
        const a = itA.next()
        const b = itB.next()
        if (a.done || b.done) return
        yield [a.value, b.value]
      }
    }),
) as any

export const concat: {
  <A>(stream: Stream<A>, other: Stream<A>): Stream<A>
  <A>(other: Stream<A>): (stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, other: Stream<A>): Stream<A> =>
    make(function* () {
      yield* stream
      yield* other
    }),
) as any

export const distinct = <A>(stream: Stream<A>): Stream<A> =>
  make(function* () {
    const seen = new Set<A>()
    for (const a of stream) {
      if (!seen.has(a)) {
        seen.add(a)
        yield a
      }
    }
  })

export const distinctN: {
  <A>(stream: Stream<A>, maxSize: number): Stream<A>
  (maxSize: number): <A>(stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, maxSize: number): Stream<A> =>
    make(function* () {
      const seen = new Set<A>()
      for (const a of stream) {
        if (!seen.has(a)) {
          if (seen.size >= maxSize) seen.clear()
          seen.add(a)
          yield a
        }
      }
    }),
) as any

export const intersperse: {
  <A>(stream: Stream<A>, sep: A): Stream<A>
  <A>(sep: A): (stream: Stream<A>) => Stream<A>
} = dual(
  2,
  <A>(stream: Stream<A>, sep: A): Stream<A> =>
    make(function* () {
      let firstValue = true
      for (const a of stream) {
        if (!firstValue) yield sep
        firstValue = false
        yield a
      }
    }),
) as any

// --- Terminals ---

export const toArray = <A>(stream: Stream<A>): A[] => toArrayInternal(stream)

export const collect = toArray

export const reduce: {
  <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): B
  <A, B>(f: (acc: B, a: A) => B, init: B): (stream: Stream<A>) => B
} = dual(3, <A, B>(stream: Stream<A>, f: (acc: B, a: A) => B, init: B): B => {
  let acc = init

  if (isPipeline(stream)) {
    visitPipeline(stream.source, stream.steps, (value) => {
      acc = f(acc, value)
    })
    return acc
  }

  for (const a of stream) acc = f(acc, a)
  return acc
}) as any

export const first = <A>(stream: Stream<A>): A | undefined => {
  if (isPipeline(stream)) {
    let result: A | undefined
    visitPipeline(stream.source, stream.steps, (value) => {
      result = value
      return false
    })
    return result
  }

  for (const a of stream) return a
  return undefined
}

export const last = <A>(stream: Stream<A>): A | undefined => {
  let result: A | undefined

  if (isPipeline(stream)) {
    visitPipeline(stream.source, stream.steps, (value) => {
      result = value
    })
    return result
  }

  for (const a of stream) result = a
  return result
}

export const count = <A>(stream: Stream<A>): number => {
  let n = 0

  if (isPipeline(stream)) {
    visitPipeline(stream.source, stream.steps, () => {
      n++
    })
    return n
  }

  for (const _ of stream) n++
  return n
}

export const every: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => boolean
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean => {
  let result = true

  const check = (value: A) => {
    if (!pred(value)) {
      result = false
      return false
    }
    return true
  }

  if (isPipeline(stream)) visitPipeline(stream.source, stream.steps, check)
  else for (const a of stream) if (check(a) === false) break

  return result
}) as any

export const some: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => boolean
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): boolean => {
  let result = false

  const check = (value: A) => {
    if (pred(value)) {
      result = true
      return false
    }
    return true
  }

  if (isPipeline(stream)) visitPipeline(stream.source, stream.steps, check)
  else for (const a of stream) if (check(a) === false) break

  return result
}) as any

export const find: {
  <A>(stream: Stream<A>, pred: (a: A) => boolean): A | undefined
  <A>(pred: (a: A) => boolean): (stream: Stream<A>) => A | undefined
} = dual(2, <A>(stream: Stream<A>, pred: (a: A) => boolean): A | undefined => {
  let result: A | undefined

  const check = (value: A) => {
    if (pred(value)) {
      result = value
      return false
    }
    return true
  }

  if (isPipeline(stream)) visitPipeline(stream.source, stream.steps, check)
  else for (const a of stream) if (check(a) === false) break

  return result
}) as any

export const forEach: {
  <A>(stream: Stream<A>, f: (a: A) => void): void
  <A>(f: (a: A) => void): (stream: Stream<A>) => void
} = dual(2, <A>(stream: Stream<A>, f: (a: A) => void): void => {
  if (isPipeline(stream)) {
    visitPipeline(stream.source, stream.steps, (value) => {
      f(value)
    })
    return
  }

  for (const a of stream) f(a)
}) as any
