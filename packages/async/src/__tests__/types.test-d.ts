import { describe, expectTypeOf, it } from 'vitest'
import { AsyncIter, Task, type AsyncSource, type Task as TaskType } from '../index'

describe('public async types', () => {
  it('infers ordered concurrent mapping through the root namespace', () => {
    const iter = AsyncIter.mapConcurrent(
      [1, 2, 3],
      async (value, index, signal) => {
        expectTypeOf(value).toEqualTypeOf<number>()
        expectTypeOf(index).toEqualTypeOf<number>()
        expectTypeOf(signal).toEqualTypeOf<AbortSignal>()
        return String(value)
      },
      { concurrency: 2 },
    )

    expectTypeOf(iter).toMatchTypeOf<AsyncSource<string>>()
    expectTypeOf(AsyncIter.collect(iter)).toEqualTypeOf<TaskType<string[], unknown>>()
  })

  it('exposes Task as a functional namespace and subpath-compatible type', () => {
    const task = Task.tryPromise(
      async () => 1,
      (error) => ({ _tag: 'Failure' as const, error }),
    )
    expectTypeOf(task).toEqualTypeOf<TaskType<number, { _tag: 'Failure'; error: unknown }>>()
    expectTypeOf(Task.run(task)).toEqualTypeOf<Promise<number>>()
  })

  it('preserves higher-rank Task channels through map, tap, and mapError', () => {
    const source = Task.of<number, 'original'>(async () => 1)

    expectTypeOf(Task.map(source, String)).toEqualTypeOf<TaskType<string, 'original'>>()
    expectTypeOf(Task.map((value: number) => String(value))(source)).toEqualTypeOf<
      TaskType<string, 'original'>
    >()

    expectTypeOf(Task.tap(source, async (_value) => {})).toEqualTypeOf<
      TaskType<number, 'original'>
    >()
    expectTypeOf(Task.tap(async (_value: number) => {})(source)).toEqualTypeOf<
      TaskType<number, 'original'>
    >()

    expectTypeOf(Task.mapError(source, (error) => error.length)).toEqualTypeOf<
      TaskType<number, number>
    >()
    expectTypeOf(Task.mapError((error: 'original') => error.length)(source)).toEqualTypeOf<
      TaskType<number, number>
    >()
  })
})
