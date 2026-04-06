import { dual, ok, err, type Result, isSome, type Option } from '@stopcock/fp'
import { abortableDelay } from './internals'

export type Task<A, E = never> = {
  readonly _tag: 'Task'
  readonly run: (signal?: AbortSignal) => Promise<A>
  readonly _E?: E
}

// --- Constructors ---

export const of = <A, E = never>(thunk: (signal?: AbortSignal) => Promise<A>): Task<A, E> => ({
  _tag: 'Task',
  run: thunk,
})

export const resolve = <A>(value: A): Task<A, never> => ({
  _tag: 'Task',
  run: () => Promise.resolve(value),
})

export const reject = <E>(error: E): Task<never, E> => ({
  _tag: 'Task',
  run: () => Promise.reject(error),
})

export const fromPromise = <A>(thunk: () => Promise<A>): Task<A, unknown> => ({
  _tag: 'Task',
  run: async () => thunk(),
})

export const fromResult = <A, E>(result: Result<A, E>): Task<A, E> => ({
  _tag: 'Task',
  run: () => result._tag === 1 ? Promise.resolve(result.value) : Promise.reject(result.error),
})

export const fromOption = <A, E>(option: Option<A>, onNone: () => E): Task<A, E> => ({
  _tag: 'Task',
  run: () => isSome(option) ? Promise.resolve(option.value) : Promise.reject(onNone()),
})

export const delay = (ms: number): Task<void, never> => ({
  _tag: 'Task',
  run: (signal?) => abortableDelay(ms, signal),
})

export const never: Task<never, never> = {
  _tag: 'Task',
  run: (signal?) => new Promise<never>((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
  }),
}

// --- Combinators ---

export const map: {
  <A, B, E>(task: Task<A, E>, f: (a: A) => B): Task<B, E>
  <A, B>(f: (a: A) => B): <E>(task: Task<A, E>) => Task<B, E>
} = dual(2, <A, B, E>(task: Task<A, E>, f: (a: A) => B): Task<B, E> => ({
  _tag: 'Task',
  run: async (signal?) => {
    const a = await task.run(signal)
    signal?.throwIfAborted()
    return f(a)
  },
}))

export const flatMap: {
  <A, B, E, E2>(task: Task<A, E>, f: (a: A) => Task<B, E2>): Task<B, E | E2>
  <A, B, E2>(f: (a: A) => Task<B, E2>): <E>(task: Task<A, E>) => Task<B, E | E2>
} = dual(2, <A, B, E, E2>(task: Task<A, E>, f: (a: A) => Task<B, E2>): Task<B, E | E2> => ({
  _tag: 'Task',
  run: async (signal?) => {
    const a = await task.run(signal)
    signal?.throwIfAborted()
    return f(a).run(signal)
  },
}))

export const tap: {
  <A, E>(task: Task<A, E>, f: (a: A) => void | Promise<void>): Task<A, E>
  <A>(f: (a: A) => void | Promise<void>): <E>(task: Task<A, E>) => Task<A, E>
} = dual(2, <A, E>(task: Task<A, E>, f: (a: A) => void | Promise<void>): Task<A, E> => ({
  _tag: 'Task',
  run: async (signal?) => {
    const a = await task.run(signal)
    signal?.throwIfAborted()
    await f(a)
    return a
  },
}))

export const mapError: {
  <A, E, E2>(task: Task<A, E>, f: (e: E) => E2): Task<A, E2>
  <E, E2>(f: (e: E) => E2): <A>(task: Task<A, E>) => Task<A, E2>
} = dual(2, <A, E, E2>(task: Task<A, E>, f: (e: E) => E2): Task<A, E2> => ({
  _tag: 'Task',
  run: async (signal?) => {
    try { return await task.run(signal) }
    catch (e) { throw f(e as E) }
  },
}))

export const catchError: {
  <A, E, B>(task: Task<A, E>, f: (e: E) => B): Task<A | B, never>
  <E, B>(f: (e: E) => B): <A>(task: Task<A, E>) => Task<A | B, never>
} = dual(2, <A, E, B>(task: Task<A, E>, f: (e: E) => B): Task<A | B, never> => ({
  _tag: 'Task',
  run: async (signal?) => {
    try { return await task.run(signal) }
    catch (e) { return f(e as E) }
  },
}))

export const flatMapError: {
  <A, E, B, E2>(task: Task<A, E>, f: (e: E) => Task<B, E2>): Task<A | B, E2>
  <E, B, E2>(f: (e: E) => Task<B, E2>): <A>(task: Task<A, E>) => Task<A | B, E2>
} = dual(2, <A, E, B, E2>(task: Task<A, E>, f: (e: E) => Task<B, E2>): Task<A | B, E2> => ({
  _tag: 'Task',
  run: async (signal?) => {
    try { return await task.run(signal) }
    catch (e) { return f(e as E).run(signal) }
  },
}))

export const match: {
  <A, E, B, C>(task: Task<A, E>, handlers: { ok: (a: A) => B; err: (e: E) => C }): Task<B | C, never>
  <A, E, B, C>(handlers: { ok: (a: A) => B; err: (e: E) => C }): (task: Task<A, E>) => Task<B | C, never>
} = dual(2, <A, E, B, C>(task: Task<A, E>, handlers: { ok: (a: A) => B; err: (e: E) => C }): Task<B | C, never> => ({
  _tag: 'Task',
  run: async (signal?) => {
    try { return handlers.ok(await task.run(signal)) }
    catch (e) { return handlers.err(e as E) }
  },
}))

// --- Terminals ---

export const run = <A, E>(task: Task<A, E>): Promise<A> => task.run()

export const runSafe = <A, E>(task: Task<A, E>): Promise<Result<A, E>> =>
  task.run().then(a => ok(a) as Result<A, E>, e => err(e as E) as Result<A, E>)

export const runWithCancel = <A, E>(task: Task<A, E>): [Promise<A>, () => void] => {
  const controller = new AbortController()
  return [task.run(controller.signal), () => controller.abort()]
}
