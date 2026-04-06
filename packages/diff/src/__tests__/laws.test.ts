import { describe, it, expect } from 'vitest'
import { diff } from '../diff'
import { apply, applyUnsafe } from '../apply'
import { invert } from '../invert'
import { compose } from '../compose'

const ok = (r: any) => r._tag === 1

describe('diff laws', () => {
  const cases = [
    { name: 'flat object', a: { x: 1, y: 2 }, b: { x: 1, y: 3, z: 4 } },
    { name: 'nested object', a: { a: { b: { c: 1 } } }, b: { a: { b: { c: 2, d: 3 } } } },
    { name: 'array', a: [1, 2, 3], b: [1, 3, 4] },
    { name: 'nested array', a: { items: [{ id: 1 }, { id: 2 }] }, b: { items: [{ id: 2 }, { id: 3 }] } },
    { name: 'empty to populated', a: {}, b: { a: 1, b: [2] } },
    { name: 'populated to empty', a: { a: 1, b: [2] }, b: {} },
    { name: 'type change', a: { x: 'string' }, b: { x: 42 } },
    { name: 'null handling', a: { x: null }, b: { x: { nested: true } } },
    { name: 'array reorder', a: ['a', 'b', 'c'], b: ['c', 'a', 'b'] },
  ]

  for (const { name, a, b } of cases) {
    it(`apply(a, diff(a, b)) = b [${name}]`, () => {
      const p = diff(a, b)
      const result = apply(a, p)
      expect(ok(result)).toBe(true)
      expect(result.value).toEqual(b)
    })

    it(`apply(b, invert(diff(a, b))) = a [${name}]`, () => {
      const p = diff(a, b)
      const b2 = applyUnsafe(a, p)
      const restored = applyUnsafe(b2, invert(p))
      expect(restored).toEqual(a)
    })
  }

  it('diff(a, a) = empty', () => {
    const obj = { deep: { nested: [1, 2, 3] } }
    expect(diff(obj, obj).ops).toHaveLength(0)
  })

  it('compose(diff(a,b), diff(b,c)) applied to a gives c', () => {
    const a = { x: 1, y: 2 }
    const b = { x: 1, y: 3 }
    const c = { x: 1, y: 4 }
    const p1 = diff(a, b)
    const p2 = diff(b, c)
    const composed = compose(p1, p2)
    const result = applyUnsafe(a, composed)
    expect(result).toEqual(c)
  })
})
