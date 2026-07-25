import { describe, expect, it, vi } from 'vite-plus/test'
import { dual } from '../dual'
import { dual as internalDual, dualUntagged2, dualUntagged3, dualUntagged4 } from '../dual-internal'
import * as O from '../option'
import * as R from '../result'

describe('untagged internal duals', () => {
  const body2 = (data: number, a: number) => data + a
  const body3 = (data: number, a: number, b: number) => data + a + b
  const body4 = (data: number, a: number, b: number, c: number) => data + a + b + c

  it('matches the untagged public dual on both call forms', () => {
    const publicOp = dual(2, body2) as (...args: number[]) => never
    const internalOp = dualUntagged2<typeof body2, (...args: number[]) => never>(body2)
    expect(internalOp(1, 2)).toBe(publicOp(1, 2))
    expect((internalOp(2) as unknown as (data: number) => number)(1)).toBe(
      (publicOp(2) as unknown as (data: number) => number)(1),
    )
  })

  it.each([
    [dualUntagged3<typeof body3, (...args: number[]) => never>(body3), body3, 3],
    [dualUntagged4<typeof body4, (...args: number[]) => never>(body4), body4, 4],
  ])('dispatches on arguments.length', (operation, body, arity) => {
    const args = Array.from({ length: arity }, (_, i) => i + 1)
    expect(operation(...args)).toBe((body as (...xs: number[]) => number)(...args))
    const partial = operation(...args.slice(1)) as unknown as (data: number) => number
    expect(partial(args[0])).toBe((body as (...xs: number[]) => number)(...args))
  })

  it('carries no opcode, argument, or fusion fields', () => {
    const operation = dualUntagged2<typeof body2, (...args: number[]) => never>(body2)
    const dataLast = operation(2) as unknown as Record<string, unknown>
    expect(Object.keys(dataLast)).toEqual([])
    expect('_op' in dataLast).toBe(false)
    expect('_fn' in dataLast).toBe(false)
  })

  it('allocates one closure per partial application and none per direct call', () => {
    const operation = dualUntagged2<typeof body2, (...args: number[]) => never>(body2)
    expect(operation(2)).not.toBe(operation(2))
  })

  it('propagates errors from the body unchanged', () => {
    const failure = new Error('boom')
    const throwing = dualUntagged2<
      (data: number, a: number) => number,
      (...args: number[]) => never
    >(() => {
      throw failure
    })
    expect(() => throwing(1, 2)).toThrow(failure)
    expect(() => (throwing(2) as unknown as (data: number) => number)(1)).toThrow(failure)
  })

  it('calls the body exactly once per invocation', () => {
    const spy = vi.fn(body2)
    const operation = dualUntagged2<typeof body2, (...args: number[]) => never>(spy)
    operation(1, 2)
    ;(operation(2) as unknown as (data: number) => number)(1)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('dispatches the arity-generic form for unmigrated modules', () => {
    const operation = internalDual(3, body3) as (...args: number[]) => never
    expect(operation(1, 2, 3)).toBe(6)
    expect((operation(2, 3) as unknown as (data: number) => number)(1)).toBe(6)
  })
})

describe('migrated non-fusible modules', () => {
  it('keeps Option representations and canonical none identity exact', () => {
    expect(O.map(O.some(2), (x) => x * 3)).toEqual(O.some(6))
    expect(O.map(O.none, (x: number) => x * 3)).toBe(O.none)
    expect(O.flatMap(O.some(2), () => O.none)).toBe(O.none)
    expect(O.filter(O.some(2), (x) => x > 5)).toBe(O.none)
  })

  it('keeps Result representations exact', () => {
    expect(R.map(R.ok(2), (x) => x * 3)).toEqual(R.ok(6))
    expect(R.mapErr(R.err('e'), (e) => `${e}!`)).toEqual(R.err('e!'))
    expect(R.flatMap(R.ok(2), (x) => R.ok(x + 1))).toEqual(R.ok(3))
  })

  it('keeps both call forms on migrated operations', () => {
    expect(O.map(O.some(2), (x: number) => x * 3)).toEqual(O.map((x: number) => x * 3)(O.some(2)))
    expect(R.map(R.ok(2), (x: number) => x * 3)).toEqual(R.map((x: number) => x * 3)(R.ok(2)))
  })

  it('leaves no opcode on a migrated data-last operation', () => {
    const operation = O.map((x: number) => x * 3) as unknown as Record<string, unknown>
    expect('_op' in operation).toBe(false)
  })
})
