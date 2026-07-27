import { describe, expect, it } from 'vite-plus/test'
import * as A from '../array'
import { compile } from '../compile'
import { pipe as compactPipe } from '../fusion'
import { pipe, flow } from '../index'

/**
 * An `@stopcock/fp` install is complete on its own: every fusion tier it
 * ships loads and runs with no optional dependency, peer, or dynamic lookup.
 */
describe('an FP-only install', () => {
  it('runs every tier it ships', () => {
    const steps = [A.map((x: number) => x * 2), A.filter((x: number) => x > 2)] as const
    const expected = [4, 6]
    expect(pipe([1, 2, 3], ...steps)).toEqual(expected)
    expect(flow(...steps)([1, 2, 3])).toEqual(expected)
    expect(compactPipe([1, 2, 3], ...steps)).toEqual(expected)
    expect(compile(...steps)([1, 2, 3])).toEqual(expected)
  })

  it('keeps the deprecated compile subpath working', () => {
    expect(compile(A.map((x: number) => x + 1))([1, 2])).toEqual([2, 3])
  })
})
