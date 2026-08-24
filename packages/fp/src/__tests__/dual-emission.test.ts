/**
 * Runtime contract for the dual emission
 * (2026-08-24-dual-performance-first.md, Phase 1).
 *
 * Two guards. The parity table proves both call shapes of every sampled op
 * agree, which is the whole feature. The closure pins are invariant 1's
 * tripwire: the curried branch must keep returning the exact closure the
 * single-form emission shipped, because every pipe-row performance figure
 * rests on that closure's code. A pin failing means the codegen template
 * changed the hot path; re-measure before re-pinning, never re-pin blind.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import * as A from '../array'
import * as B from '../boolean'
import * as M from '../math'

const numbers = [3, 1, 4, 1, 5, 9, 2, 6]

describe('data-first and curried shapes agree', () => {
  const double = (x: number) => x * 2
  const isBig = (x: number) => x > 3
  const sum = (acc: number, x: number) => acc + x

  const cases: readonly [string, unknown, unknown][] = [
    ['map', A.map(numbers, double), A.map(double)(numbers)],
    ['filter', A.filter(numbers, isBig), A.filter(isBig)(numbers)],
    ['take', A.take(numbers, 3), A.take(3)(numbers)],
    ['drop', A.drop(numbers, 3), A.drop(3)(numbers)],
    ['reduce', A.reduce(numbers, sum, 0), A.reduce(sum, 0)(numbers)],
    ['flatMap', A.flatMap(numbers, (x) => [x, x]), A.flatMap((x: number) => [x, x])(numbers)],
    ['xprod', A.xprod([1, 2], ['a']), A.xprod(['a'])([1, 2])],
    ['repeat', A.repeat('x', 3), A.repeat(3)('x')],
    ['chunk', A.chunk(numbers, 3), A.chunk(3)(numbers)],
    ['includes', A.includes(numbers, 4), A.includes(4)(numbers)],
    ['add', M.add(5, 3), M.add(3)(5)],
    ['subtract', M.subtract(5, 3), M.subtract(3)(5)],
    ['modulo', M.modulo(17, 5), M.modulo(5)(17)],
    ['and_', B.and_(true, false), B.and_(false)(true)],
  ]

  for (const [name, dataFirst, curried] of cases) {
    test(name, () => {
      expect(dataFirst).toEqual(curried)
    })
  }
})

describe('the curried closure is the single-form closure, byte for byte', () => {
  // Pinned against the generated FILE text (runtime toString goes through
  // the test transform and is not the shipped code). codegen:check keeps
  // file and generator in lockstep; these pins keep the generator honest
  // about the hot path itself.
  const closureOf = (module: string, op: string): string => {
    const src = readFileSync(join(import.meta.dirname, '..', `${module}.ts`), 'utf8')
    const block = src.split(new RegExp(`^export const ${op}:`, 'm'))[1]?.split('\n} as any')[0]
    const idx = block?.lastIndexOf('return function (') ?? -1
    if (block === undefined || idx === -1) throw new Error(`${module}.${op}: closure not found`)
    return block.slice(idx)
  }

  test('map (delegate policy)', () => {
    expect(closureOf('array', 'map')).toBe(`return function (arr: any) {
    const len = arr.length,
      out = new Array(len)
    for (let i = 0; i < len; i++) out[i] = f(arr[i])
    return out
  }`)
  })

  test('add (inline policy)', () => {
    expect(closureOf('math', 'add')).toBe(`return function (a: any) {
    return a + b;
  }`)
  })
})
