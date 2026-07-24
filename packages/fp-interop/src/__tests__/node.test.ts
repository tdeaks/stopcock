import { describe, expect, it, vi } from 'vite-plus/test'
import * as Result from '@stopcock/fp/result'
import {
  fromNodeCallback,
  liftNodeCallback,
  resultToNodeCallback,
} from '../node'

describe('Node callback subpath', () => {
  it('turns callback errors and synchronous throws into Result', async () => {
    expect(
      await fromNodeCallback<number>((callback) => callback(null, 2)),
    ).toEqual(Result.ok(2))
    expect(
      await fromNodeCallback<number, string>(
        (callback) => callback(new Error('bad'), 0),
        (error) => (error as Error).message,
      ),
    ).toEqual(Result.err('bad'))
    expect(
      await fromNodeCallback<number, string>(
        () => {
          throw new Error('sync')
        },
        (error) => (error as Error).message,
      ),
    ).toEqual(Result.err('sync'))
  })

  it('settles once and lifts callback-last functions', async () => {
    const onError = vi.fn(String)
    const settled = await fromNodeCallback<number, string>(
      (callback) => {
        callback(null, 1)
        callback(new Error('too late'), 2)
        throw new Error('also too late')
      },
      onError,
    )
    expect(settled).toEqual(Result.ok(1))
    expect(onError).not.toHaveBeenCalled()

    const parse = liftNodeCallback(
      (input: string, callback: (error: unknown, value: number) => void) => {
        const value = Number(input)
        callback(Number.isNaN(value) ? new Error('NaN') : null, value)
      },
      (error) => (error as Error).message,
    )
    expect(await parse('4')).toEqual(Result.ok(4))
    expect(await parse('no')).toEqual(Result.err('NaN'))
  })

  it('converts Result to a synchronous Node-style callback', () => {
    const callback = vi.fn()
    resultToNodeCallback(Result.ok(2), callback)
    resultToNodeCallback(Result.err('bad'), callback)
    expect(callback.mock.calls).toEqual([
      [null, 2],
      ['bad'],
    ])
  })
})
