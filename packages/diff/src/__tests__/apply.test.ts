import { describe, it, expect } from 'vitest'
import { apply, applyUnsafe } from '../apply'
import { patch, empty } from '../patch'
import type { Operation } from '../types'

const ok = (r: any) => r._tag === 1
const err = (r: any) => r._tag === 0

describe('apply', () => {
  describe('add', () => {
    it('adds a key to an object', () => {
      const p = patch([{ op: 'add', path: ['b'], value: 2 }])
      const r = apply({ a: 1 }, p)
      expect(ok(r)).toBe(true)
      expect(r.value).toEqual({ a: 1, b: 2 })
    })

    it('adds at root (empty path)', () => {
      const p = patch([{ op: 'add', path: [], value: 'new' }])
      const r = apply('old', p)
      expect(r.value).toBe('new')
    })

    it('inserts into array by index', () => {
      const p = patch([{ op: 'add', path: [1], value: 'x' }])
      const r = apply(['a', 'b'], p)
      expect(r.value).toEqual(['a', 'x', 'b'])
    })

    it('errors on missing parent path', () => {
      const p = patch([{ op: 'add', path: ['x', 'y'], value: 1 }])
      const r = apply({}, p)
      expect(err(r)).toBe(true)
    })

    it('errors on out-of-bounds array index', () => {
      const p = patch([{ op: 'add', path: [5], value: 'x' }])
      const r = apply(['a'], p)
      expect(err(r)).toBe(true)
    })

    it('errors on negative array index', () => {
      const p = patch([{ op: 'add', path: [-1], value: 'x' }])
      const r = apply(['a'], p)
      expect(err(r)).toBe(true)
    })
  })

  describe('remove', () => {
    it('removes a key from object', () => {
      const p = patch([{ op: 'remove', path: ['b'], oldValue: 2 }])
      const r = apply({ a: 1, b: 2 }, p)
      expect(r.value).toEqual({ a: 1 })
    })

    it('removes from array by index', () => {
      const p = patch([{ op: 'remove', path: [1], oldValue: 'b' }])
      const r = apply(['a', 'b', 'c'], p)
      expect(r.value).toEqual(['a', 'c'])
    })

    it('errors on missing path', () => {
      const p = patch([{ op: 'remove', path: ['missing'], oldValue: undefined }])
      const r = apply({}, p)
      expect(err(r)).toBe(true)
    })

    it('remove at root returns undefined', () => {
      const p = patch([{ op: 'remove', path: [], oldValue: 'x' }])
      const r = apply('x', p)
      expect(r.value).toBeUndefined()
    })
  })

  describe('replace', () => {
    it('replaces a value', () => {
      const p = patch([{ op: 'replace', path: ['a'], oldValue: 1, newValue: 99 }])
      const r = apply({ a: 1 }, p)
      expect(r.value).toEqual({ a: 99 })
    })

    it('replaces at root', () => {
      const p = patch([{ op: 'replace', path: [], oldValue: 'old', newValue: 'new' }])
      const r = apply('old', p)
      expect(r.value).toBe('new')
    })

    it('errors on missing path', () => {
      const p = patch([{ op: 'replace', path: ['missing'], oldValue: 1, newValue: 2 }])
      const r = apply({}, p)
      expect(err(r)).toBe(true)
    })

    it('replaces nested value', () => {
      const p = patch([{ op: 'replace', path: ['a', 'b'], oldValue: 1, newValue: 2 }])
      const r = apply({ a: { b: 1 } }, p)
      expect(r.value).toEqual({ a: { b: 2 } })
    })
  })

  describe('move', () => {
    it('moves a value between paths', () => {
      const p = patch([{ op: 'move', from: ['a'], path: ['b'] }])
      const r = apply({ a: 1 }, p)
      expect(r.value).toEqual({ b: 1 })
    })

    it('errors on missing source', () => {
      const p = patch([{ op: 'move', from: ['missing'], path: ['b'] }])
      const r = apply({}, p)
      expect(err(r)).toBe(true)
    })
  })

  describe('rename', () => {
    it('renames a key', () => {
      const p = patch([{ op: 'rename', path: [], oldKey: 'a', newKey: 'b' }])
      const r = apply({ a: 1 }, p)
      expect(r.value).toEqual({ b: 1 })
    })

    it('renames nested key', () => {
      const p = patch([{ op: 'rename', path: ['obj'], oldKey: 'x', newKey: 'y' }])
      const r = apply({ obj: { x: 1 } }, p)
      expect(r.value).toEqual({ obj: { y: 1 } })
    })

    it('errors on non-object path', () => {
      const p = patch([{ op: 'rename', path: ['x'], oldKey: 'a', newKey: 'b' }])
      const r = apply({ x: 'string' }, p)
      expect(err(r)).toBe(true)
    })

    it('errors on null path', () => {
      const p = patch([{ op: 'rename', path: ['missing'], oldKey: 'a', newKey: 'b' }])
      const r = apply({}, p)
      expect(err(r)).toBe(true)
    })

    it('errors on missing old key', () => {
      const p = patch([{ op: 'rename', path: [], oldKey: 'missing', newKey: 'b' }])
      const r = apply({ a: 1 }, p)
      expect(err(r)).toBe(true)
    })
  })

  describe('test', () => {
    it('passes when value matches', () => {
      const p = patch([{ op: 'test', path: ['a'], value: 1 }])
      const r = apply({ a: 1 }, p)
      expect(ok(r)).toBe(true)
    })

    it('fails when value does not match', () => {
      const p = patch([{ op: 'test', path: ['a'], value: 99 }])
      const r = apply({ a: 1 }, p)
      expect(err(r)).toBe(true)
    })

    it('tests deep equality', () => {
      const p = patch([{ op: 'test', path: ['a'], value: { b: [1, 2] } }])
      const r = apply({ a: { b: [1, 2] } }, p)
      expect(ok(r)).toBe(true)
    })
  })

  it('applies multiple ops in sequence', () => {
    const p = patch([
      { op: 'add', path: ['b'], value: 2 },
      { op: 'replace', path: ['a'], oldValue: 1, newValue: 10 },
    ])
    const r = apply({ a: 1 }, p)
    expect(r.value).toEqual({ a: 10, b: 2 })
  })

  it('stops on first error', () => {
    const p = patch([
      { op: 'replace', path: ['missing'], oldValue: 1, newValue: 2 },
      { op: 'add', path: ['b'], value: 2 },
    ])
    const r = apply({}, p)
    expect(err(r)).toBe(true)
  })

  it('empty patch returns target unchanged', () => {
    const obj = { a: 1 }
    const r = apply(obj, empty())
    expect(r.value).toBe(obj)
  })

  it('curried form works', () => {
    const addB = apply(patch([{ op: 'add', path: ['b'], value: 2 }]))
    const r = addB({ a: 1 })
    expect(r.value).toEqual({ a: 1, b: 2 })
  })
})

describe('applyUnsafe', () => {
  it('returns value on success', () => {
    const p = patch([{ op: 'add', path: ['b'], value: 2 }])
    expect(applyUnsafe({ a: 1 }, p)).toEqual({ a: 1, b: 2 })
  })

  it('throws on error', () => {
    const p = patch([{ op: 'remove', path: ['missing'], oldValue: 1 }])
    expect(() => applyUnsafe({}, p)).toThrow()
  })

  it('curried form works', () => {
    const addB = applyUnsafe(patch([{ op: 'add', path: ['b'], value: 2 }]))
    expect(addB({ a: 1 })).toEqual({ a: 1, b: 2 })
  })
})
