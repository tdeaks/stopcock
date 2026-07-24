import { describe, expect, it } from 'vite-plus/test'
import * as R from '../result'
import * as V from '../validation'
import { isString } from '../guard'

describe('Result validation and composition', () => {
  it('fromPredicate supports both forms, refinements, and lazy errors', () => {
    const rejected: unknown[] = []
    const onFalse = (value: unknown) => {
      rejected.push(value)
      return { value }
    }

    expect(R.fromPredicate('ok' as unknown, isString, onFalse)).toEqual(R.ok('ok'))
    expect(R.fromPredicate(isString, onFalse)('ok')).toEqual(R.ok('ok'))
    expect(rejected).toEqual([])

    const value = 42
    expect(R.fromPredicate(value, isString, onFalse)).toEqual(R.err({ value }))
    expect(R.fromPredicate(isString, onFalse)(value)).toEqual(R.err({ value }))
    expect(rejected).toEqual([value, value])
  })

  it('filterOrElse validates Ok values in both forms', () => {
    const positive = (value: number) => value > 0
    const onFalse = (value: number) => `not positive: ${value}`

    expect(R.filterOrElse(R.ok(1), positive, onFalse)).toEqual(R.ok(1))
    expect(R.filterOrElse(positive, onFalse)(R.ok(1))).toEqual(R.ok(1))
    expect(R.filterOrElse(R.ok(-1), positive, onFalse)).toEqual(R.err('not positive: -1'))
    expect(R.filterOrElse(positive, onFalse)(R.ok(-1))).toEqual(R.err('not positive: -1'))
  })

  it('filterOrElse preserves existing errors by identity and skips callbacks', () => {
    const existing = R.err({ code: 'existing' })
    let predicates = 0
    let failures = 0
    const predicate = (_value: number) => {
      predicates++
      return false
    }
    const onFalse = (_value: number) => {
      failures++
      return 'new'
    }

    const dataFirst = R.filterOrElse(existing, predicate, onFalse)
    const dataLast = R.filterOrElse(predicate, onFalse)(existing)

    expect(dataFirst).toBe(existing)
    expect(dataLast).toBe(existing)
    expect(predicates).toBe(0)
    expect(failures).toBe(0)
  })

  it('all and sequence preserve tuples, use the first error, and handle empty input', () => {
    const first = R.err({ position: 1 })
    const second = R.err({ position: 2 })

    expect(R.all([R.ok(1), R.ok('two'), R.ok(true)] as const)).toEqual(R.ok([1, 'two', true]))
    expect(R.all([R.ok(1), first, second])).toBe(first)
    expect(R.sequence([R.ok(1), first, second])).toBe(first)
    expect(R.sequence).toBe(R.all)
    expect(R.all([])).toEqual(R.ok([]))
    expect(R.sequence([])).toEqual(R.ok([]))
  })

  it('traverse is left-to-right, supports both forms, and stops after the first error', () => {
    const dataFirstSeen: number[] = []
    const dataLastSeen: number[] = []
    const decodeWith = (seen: number[]) => (value: number) => {
      seen.push(value)
      return value < 3 ? R.ok(String(value)) : R.err(`bad:${value}`)
    }

    expect(R.traverse([1, 2, 3, 4], decodeWith(dataFirstSeen))).toEqual(R.err('bad:3'))
    expect(R.traverse(decodeWith(dataLastSeen))([1, 2, 3, 4])).toEqual(R.err('bad:3'))
    expect(dataFirstSeen).toEqual([1, 2, 3])
    expect(dataLastSeen).toEqual([1, 2, 3])
    expect(R.traverse([], decodeWith([]))).toEqual(R.ok([]))
  })

  it('optional bypasses only undefined and nullable bypasses only null', () => {
    const optionalSeen: unknown[] = []
    const nullableSeen: unknown[] = []
    const optionalDecode = (value: unknown) => {
      optionalSeen.push(value)
      return R.ok(value)
    }
    const nullableDecode = (value: unknown) => {
      nullableSeen.push(value)
      return R.ok(value)
    }

    expect(R.optional(undefined, optionalDecode)).toEqual(R.ok(undefined))
    expect(R.optional(optionalDecode)(undefined)).toEqual(R.ok(undefined))
    expect(R.optional(null, optionalDecode)).toEqual(R.ok(null))
    expect(R.optional(optionalDecode)(null)).toEqual(R.ok(null))
    expect(optionalSeen).toEqual([null, null])

    expect(R.nullable(null, nullableDecode)).toEqual(R.ok(null))
    expect(R.nullable(nullableDecode)(null)).toEqual(R.ok(null))
    expect(R.nullable(undefined, nullableDecode)).toEqual(R.ok(undefined))
    expect(R.nullable(nullableDecode)(undefined)).toEqual(R.ok(undefined))
    expect(nullableSeen).toEqual([undefined, undefined])
  })
})

describe('Validation', () => {
  it('constructs valid and non-empty invalid values', () => {
    expect(V.valid(1)).toEqual(R.ok(1))
    expect(V.invalid('required')).toEqual(R.err(['required']))
    expect(V.fromResult(R.ok(1))).toEqual(V.valid(1))
    expect(V.fromResult(R.err('broken'))).toEqual(V.invalid('broken'))
  })

  it('fromPredicate supports both forms and lazy error construction', () => {
    let failures = 0
    const onFalse = (value: unknown) => {
      failures++
      return { value }
    }

    expect(V.fromPredicate('ok' as unknown, isString, onFalse)).toEqual(V.valid('ok'))
    expect(V.fromPredicate(isString, onFalse)('ok')).toEqual(V.valid('ok'))
    expect(failures).toBe(0)
    expect(V.fromPredicate(1 as unknown, isString, onFalse)).toEqual(V.invalid({ value: 1 }))
    expect(V.fromPredicate(isString, onFalse)(1)).toEqual(V.invalid({ value: 1 }))
    expect(failures).toBe(2)
  })

  it('all accumulates and flattens errors in stable input order', () => {
    const nested: V.Validation<never, string> = R.err(['second', 'third'] as const)

    expect(V.all([V.valid(1), V.valid('two')] as const)).toEqual(V.valid([1, 'two']))
    expect(V.all([V.invalid('first'), nested, V.invalid('fourth')])).toEqual(
      R.err(['first', 'second', 'third', 'fourth']),
    )
    expect(V.all([])).toEqual(V.valid([]))
  })

  it('traverse validates every input and accumulates errors in both forms', () => {
    const dataFirstSeen: number[] = []
    const dataLastSeen: number[] = []
    const validateWith = (seen: number[]) => (value: number) => {
      seen.push(value)
      return value % 2 === 0 ? V.valid(value * 2) : V.invalid(`odd:${value}`)
    }

    expect(V.traverse([1, 2, 3, 4], validateWith(dataFirstSeen))).toEqual(R.err(['odd:1', 'odd:3']))
    expect(V.traverse(validateWith(dataLastSeen))([1, 2, 3, 4])).toEqual(R.err(['odd:1', 'odd:3']))
    expect(dataFirstSeen).toEqual([1, 2, 3, 4])
    expect(dataLastSeen).toEqual([1, 2, 3, 4])
    expect(V.traverse([], validateWith([]))).toEqual(V.valid([]))
  })

  it('remains compatible with Result transforms and extraction', () => {
    expect(R.map((value: number) => value + 1)(V.valid(1))).toEqual(V.valid(2))
    expect(
      R.match({
        err: (errors: V.NonEmptyArray<string>) => errors.join(','),
        ok: (value: number) => String(value),
      })(V.invalid('bad')),
    ).toBe('bad')
  })
})
