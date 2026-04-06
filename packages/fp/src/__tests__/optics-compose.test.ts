import { describe, it, expect } from 'vitest'
import { type Option, type Result, some as optSome, none, ok as resOk, err, isSome, isNone } from '../index'
import { prop, view } from '../lens'
import { some, ok, preview, set as setPrism, over as overPrism } from '../prism'
import { each, filtered, toArray, modify } from '../traversal'
import { iso, reverse } from '../iso'
import { composeOptics } from '../optics-compose'

describe('composeOptics', () => {
  it('lens + lens = lens', () => {
    type S = { a: { b: number } }
    const ab = composeOptics(prop<S, 'a'>('a'), prop<S['a'], 'b'>('b'))
    expect(ab._tag).toBe('Lens')
    expect(view({ a: { b: 42 } }, ab as any)).toBe(42)
  })

  it('lens + prism = prism', () => {
    type S = { opt: Option<number> }
    const composed = composeOptics(prop<S, 'opt'>('opt'), some<number>())
    expect(composed._tag).toBe('Prism')
    const v = preview({ opt: optSome(5) }, composed as any)
    expect(isSome(v) && v.value).toBe(5)
  })

  it('prism + lens = prism', () => {
    type Inner = { x: number }
    const composed = composeOptics(some<Inner>(), prop<Inner, 'x'>('x'))
    expect(composed._tag).toBe('Prism')
    const v = preview(optSome({ x: 10 }) as Option<Inner>, composed as any)
    expect(isSome(v) && v.value).toBe(10)
    const v2 = preview(none as Option<Inner>, composed as any)
    expect(isSome(v2)).toBe(false)
  })

  it('prism + traversal = traversal', () => {
    type S = Option<number[]>
    const composed = composeOptics(some<number[]>(), each<number>())
    expect(composed._tag).toBe('Traversal')
    const s: S = optSome([1, 2, 3])
    expect(toArray(s, composed as any)).toEqual([1, 2, 3])
    const n: S = none
    expect(toArray(n, composed as any)).toEqual([])
  })

  it('lens + traversal = traversal', () => {
    type S = { items: number[] }
    const composed = composeOptics(prop<S, 'items'>('items'), each<number>())
    expect(composed._tag).toBe('Traversal')
    expect(toArray({ items: [1, 2, 3] }, composed as any)).toEqual([1, 2, 3])
  })

  it('traversal + traversal', () => {
    const composed = composeOptics(each<number[]>(), each<number>())
    expect(toArray([[1], [2, 3]], composed as any)).toEqual([1, 2, 3])
    expect(modify([[1], [2, 3]], composed as any, (x: number) => x + 10)).toEqual([[11], [12, 13]])
  })

  it('iso + iso = iso', () => {
    const double = iso<number, number>(n => n * 2, n => n / 2)
    const addOne = iso<number, number>(n => n + 1, n => n - 1)
    const composed = composeOptics(double, addOne)
    expect(composed._tag).toBe('Iso')
    expect((composed as any).get(5)).toBe(11)
    expect((composed as any).reverseGet(11)).toBe(5)
  })

  it('iso + lens = lens', () => {
    type S = { x: number }
    const wrap = iso<S, S>(s => s, s => s)
    const composed = composeOptics(wrap, prop<S, 'x'>('x'))
    expect(composed._tag).toBe('Lens')
    expect(view({ x: 42 }, composed as any)).toBe(42)
  })

  it('iso + prism = prism', () => {
    const wrap = iso<Option<number>, Option<number>>(s => s, s => s)
    const composed = composeOptics(wrap, some<number>())
    expect(composed._tag).toBe('Prism')
    const v = preview(optSome(5), composed as any)
    expect(isSome(v) && v.value).toBe(5)
  })

  it('prism + prism = prism', () => {
    type Nested = Option<Option<number>>
    const composed = composeOptics(some<Option<number>>(), some<number>())
    expect(composed._tag).toBe('Prism')
    const v = preview(optSome(optSome(7)) as Nested, composed as any)
    expect(isSome(v) && v.value).toBe(7)
    expect(isNone(preview(optSome(none) as Nested, composed as any))).toBe(true)
  })

  it('prism + prism set on none returns original', () => {
    type Nested = Option<Option<number>>
    const composed = composeOptics(some<Option<number>>(), some<number>())
    const result = setPrism(none as Nested, composed as any, 99)
    expect(result).toBe(none)
  })

  it('iso + traversal = traversal', () => {
    const wrap = iso<number[], number[]>(s => s, s => s)
    const composed = composeOptics(wrap, each<number>())
    expect(composed._tag).toBe('Traversal')
    expect(toArray([1, 2, 3], composed as any)).toEqual([1, 2, 3])
    expect(modify([1, 2], composed as any, (x: number) => x * 10)).toEqual([10, 20])
  })

  it('traversal + iso = traversal', () => {
    const double = iso<number, number>(n => n * 2, n => n / 2)
    const composed = composeOptics(each<number>(), double)
    expect(composed._tag).toBe('Traversal')
    expect(toArray([1, 2, 3], composed as any)).toEqual([2, 4, 6])
  })

  it('traversal + lens = traversal', () => {
    type S = { x: number }
    const composed = composeOptics(each<S>(), prop<S, 'x'>('x'))
    expect(composed._tag).toBe('Traversal')
    expect(toArray([{ x: 1 }, { x: 2 }], composed as any)).toEqual([1, 2])
  })
})

describe('optics edge cases', () => {
  it('some() prism on None', () => {
    const p = some<number>()
    const n: Option<number> = none
    expect(isNone(preview(n, p))).toBe(true)
    expect(setPrism(n, p, 99)).toBe(none)
    expect(overPrism(n, p, (x: number) => x + 1)).toBe(none)
  })

  it('ok() prism on Err', () => {
    const p = ok<number, string>()
    const failure: Result<number, string> = err('fail')
    expect(isNone(preview(failure, p))).toBe(true)
    expect(setPrism(failure, p, 99)).toEqual(err('fail'))
    expect(overPrism(failure, p, (x: number) => x + 1)).toEqual(err('fail'))
  })

  it('each() on empty array', () => {
    const t = each<number>()
    expect(toArray([] as number[], t)).toEqual([])
    expect(modify([] as number[], t, (x: number) => x + 1)).toEqual([])
  })

  it('filtered with no matches', () => {
    const t = filtered<number>(n => n > 100)
    expect(toArray([1, 2, 3], t)).toEqual([])
    expect(modify([1, 2, 3], t, (x: number) => x * 10)).toEqual([1, 2, 3])
  })

  it('iso reverse roundtrip', () => {
    const strToNum = iso<string, number>(s => parseInt(s, 10), n => String(n))
    const roundtrip = reverse(reverse(strToNum))
    expect(roundtrip.get('42')).toBe(42)
    expect(roundtrip.reverseGet(42)).toBe('42')
  })
})
