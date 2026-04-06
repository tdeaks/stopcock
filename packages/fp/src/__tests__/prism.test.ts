import { describe, it, expect } from 'vitest'
import { pipe, type Option, type Result, some as optSome, none, ok as resOk, err, isSome, isNone } from '../index'
import { prism, fromPredicate, some, ok, preview, set, over, compose } from '../prism'

describe('Prism', () => {
  it('fromPredicate', () => {
    const positive = fromPredicate<number>(n => n > 0)
    expect(isSome(preview(5, positive))).toBe(true)
    expect(isNone(preview(-1, positive))).toBe(true)
  })

  it('some prism', () => {
    const p = some<number>()
    const s: Option<number> = optSome(42)
    const n: Option<number> = none
    const sv = preview(s, p)
    expect(isSome(sv) && sv.value).toBe(42)
    expect(isNone(preview(n, p))).toBe(true)
  })

  it('some prism set', () => {
    const p = some<number>()
    const s: Option<number> = optSome(42)
    const updated = set(s, p, 99)
    expect(isSome(updated) && updated.value).toBe(99)
  })

  it('some prism set on None does nothing', () => {
    const p = some<number>()
    const n: Option<number> = none
    const result = set(n, p, 99)
    expect(isNone(result)).toBe(true)
  })

  it('ok prism', () => {
    const p = ok<number, string>()
    const success: Result<number, string> = resOk(10)
    const failure: Result<number, string> = err('fail')
    const sv = preview(success, p)
    expect(isSome(sv) && sv.value).toBe(10)
    expect(isNone(preview(failure, p))).toBe(true)
  })

  it('over prism', () => {
    const p = some<number>()
    const s: Option<number> = optSome(5)
    const result = over(s, p, (n: number) => n * 2)
    expect(isSome(result) && result.value).toBe(10)
  })

  it('compose prisms', () => {
    type Nested = Option<Option<number>>
    const outer = some<Option<number>>()
    const inner = some<number>()
    const composed = compose(outer, inner)

    const val: Nested = optSome(optSome(42))
    const v = preview(val, composed)
    expect(isSome(v) && v.value).toBe(42)

    const noneInner: Nested = optSome(none)
    expect(isNone(preview(noneInner, composed))).toBe(true)
  })

  it('custom prism', () => {
    const parseInt_ = prism<string, number>(
      s => { const n = parseInt(s, 10); return isNaN(n) ? none : optSome(n) },
      (_, a) => String(a),
    )
    const v = preview('42', parseInt_)
    expect(isSome(v) && v.value).toBe(42)
    expect(isNone(preview('abc', parseInt_))).toBe(true)
  })

  it('pipe integration (data-last)', () => {
    const p = some<number>()
    const result = pipe(optSome(10) as Option<number>, over(p, (n: number) => n + 5))
    expect(isSome(result) && result.value).toBe(15)
  })

  it('fromPredicate set replaces value', () => {
    const positive = fromPredicate<number>(n => n > 0)
    const result = set(5, positive, 99)
    expect(result).toBe(99)
  })

  it('fromPredicate set on non-match returns original', () => {
    const positive = fromPredicate<number>(n => n > 0)
    const result = set(-1, positive, 99)
    expect(result).toBe(-1)
  })

  it('ok prism set on success replaces value', () => {
    const p = ok<number, string>()
    const success: Result<number, string> = resOk(10)
    const result = set(success, p, 99)
    expect(result).toEqual(resOk(99))
  })

  it('ok prism set on failure returns failure', () => {
    const p = ok<number, string>()
    const failure: Result<number, string> = err('fail')
    const result = set(failure, p, 99)
    expect(result).toEqual(err('fail'))
  })

  it('compose set when outer is None returns original', () => {
    type Nested = Option<Option<number>>
    const outer = some<Option<number>>()
    const inner = some<number>()
    const composed = compose(outer, inner)
    const n: Nested = none
    const result = set(n, composed, 99)
    expect(result).toBe(none)
  })

  it('compose set when inner is None returns original', () => {
    type Nested = Option<Option<number>>
    const outer = some<Option<number>>()
    const inner = some<number>()
    const composed = compose(outer, inner)
    const val: Nested = optSome(none)
    const result = set(val, composed, 99)
    expect(isSome(result) && isNone(result.value)).toBe(true)
  })

  it('compose set when both Some replaces value', () => {
    type Nested = Option<Option<number>>
    const outer = some<Option<number>>()
    const inner = some<number>()
    const composed = compose(outer, inner)
    const val: Nested = optSome(optSome(42))
    const result = set(val, composed, 99)
    expect(isSome(result) && isSome(result.value) && result.value.value).toBe(99)
  })
})
