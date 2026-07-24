import { describe, expect, it } from 'vite-plus/test'
import {
  LawCheckError,
  arrayCases,
  assertLaws,
  checkEqLaws,
  checkGroupLaws,
  checkIsoLaws,
  checkLensLaws,
  checkMonoidLaws,
  optionCases,
  referenceTake,
  trackedIterable,
} from '../index'

describe('law checks', () => {
  it('passes lawful Eq and Monoid instances', () => {
    expect(checkEqLaws({ equals: Object.is }, [1, 2, 3]).passed).toBe(true)
    expect(
      checkMonoidLaws(
        { empty: 0, combine: (left: number, right: number) => left + right },
        { equals: Object.is },
        [-1, 0, 2],
      ).passed,
    ).toBe(true)
  })

  it('reports witnesses and throws a dedicated assertion error', () => {
    const report = checkEqLaws({ equals: () => false }, [1])
    expect(report.passed).toBe(false)
    expect(report.violations[0]?.law).toBe('Eq.reflexivity')
    expect(() => assertLaws(report)).toThrow(LawCheckError)
  })

  it('checks Group, Lens, and Iso laws through structural adapters', () => {
    expect(
      checkGroupLaws(
        {
          empty: 0,
          combine: (left: number, right: number) => left + right,
          inverse: (value: number) => -value,
        },
        { equals: Object.is },
        [-1, 0, 2],
      ).passed,
    ).toBe(true)

    const lens = {
      get: (source: { readonly value: number }) => source.value,
      replace: (source: { readonly value: number }, value: number) => ({ ...source, value }),
    }
    expect(
      checkLensLaws(
        lens,
        { equals: (left, right) => left.value === right.value },
        { equals: Object.is },
        [{ value: 1 }],
        [0, 2],
      ).passed,
    ).toBe(true)

    expect(
      checkIsoLaws(
        {
          to: (value: number) => String(value),
          from: (value: string) => Number(value),
        },
        { equals: Object.is },
        { equals: Object.is },
        [0, 2],
        ['0', '2'],
      ).passed,
    ).toBe(true)
  })

  it('honours a combined max-check budget', () => {
    expect(
      checkMonoidLaws(
        { empty: 0, combine: (left: number, right: number) => left + right },
        { equals: Object.is },
        [0, 1, 2],
        { maxChecks: 1 },
      ).checks,
    ).toBe(1)
  })
})

describe('deterministic cases and iterable probes', () => {
  it('builds structural Option and bounded array cases without fp at runtime', () => {
    expect(optionCases([1, 2])).toEqual([{ _tag: 0 }, { _tag: 1, value: 1 }, { _tag: 1, value: 2 }])
    expect(arrayCases([0, 1], 2)).toEqual([[], [0], [1], [0, 0], [0, 1], [1, 0], [1, 1]])
    expect(arrayCases([], Number.POSITIVE_INFINITY)).toEqual([[]])
  })

  it('observes early IteratorClose precisely', () => {
    const tracked = trackedIterable([1, 2, 3])
    expect(referenceTake(tracked.iterable, 2)).toEqual([1, 2])
    expect(tracked.probe).toEqual({
      iterations: 1,
      pulls: 2,
      returns: 1,
      completions: 0,
    })
  })
})
