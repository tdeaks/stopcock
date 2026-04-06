import { describe, it, expect } from 'vitest'
import { toJsonPatch, fromJsonPatch } from '../json-patch'
import { patch } from '../patch'

describe('toJsonPatch', () => {
  it('converts add', () => {
    const p = patch([{ op: 'add', path: ['a', 'b'], value: 1 }])
    const jp = toJsonPatch(p)
    expect(jp).toEqual([{ op: 'add', path: '/a/b', value: 1 }])
  })

  it('converts remove', () => {
    const p = patch([{ op: 'remove', path: ['a'], oldValue: 1 }])
    const jp = toJsonPatch(p)
    expect(jp).toEqual([{ op: 'remove', path: '/a' }])
  })

  it('converts replace', () => {
    const p = patch([{ op: 'replace', path: ['a'], oldValue: 1, newValue: 2 }])
    const jp = toJsonPatch(p)
    expect(jp).toEqual([{ op: 'replace', path: '/a', value: 2 }])
  })

  it('converts move', () => {
    const p = patch([{ op: 'move', from: ['a'], path: ['b'] }])
    const jp = toJsonPatch(p)
    expect(jp).toEqual([{ op: 'move', path: '/b', from: '/a' }])
  })

  it('converts test', () => {
    const p = patch([{ op: 'test', path: ['a'], value: 1 }])
    const jp = toJsonPatch(p)
    expect(jp).toEqual([{ op: 'test', path: '/a', value: 1 }])
  })

  it('converts rename to move', () => {
    const p = patch([{ op: 'rename', path: ['obj'], oldKey: 'x', newKey: 'y' }])
    const jp = toJsonPatch(p)
    expect(jp).toEqual([{ op: 'move', from: '/obj/x', path: '/obj/y' }])
  })

  it('escapes special characters in paths', () => {
    const p = patch([{ op: 'add', path: ['a/b', 'c~d'], value: 1 }])
    const jp = toJsonPatch(p)
    expect(jp[0].path).toBe('/a~1b/c~0d')
  })

  it('handles root path', () => {
    const p = patch([{ op: 'replace', path: [], oldValue: 'a', newValue: 'b' }])
    const jp = toJsonPatch(p)
    expect(jp[0].path).toBe('')
  })

  it('handles numeric path segments', () => {
    const p = patch([{ op: 'add', path: ['items', 0], value: 'x' }])
    const jp = toJsonPatch(p)
    expect(jp[0].path).toBe('/items/0')
  })
})

describe('fromJsonPatch', () => {
  it('converts add', () => {
    const p = fromJsonPatch([{ op: 'add', path: '/a', value: 1 }])
    expect(p.ops[0].op).toBe('add')
    expect(p.ops[0].path).toEqual(['a'])
    expect((p.ops[0] as any).value).toBe(1)
  })

  it('converts remove', () => {
    const p = fromJsonPatch([{ op: 'remove', path: '/a' }])
    expect(p.ops[0].op).toBe('remove')
  })

  it('converts replace', () => {
    const p = fromJsonPatch([{ op: 'replace', path: '/a', value: 2 }])
    expect(p.ops[0].op).toBe('replace')
    expect((p.ops[0] as any).newValue).toBe(2)
  })

  it('converts move', () => {
    const p = fromJsonPatch([{ op: 'move', from: '/a', path: '/b' }])
    expect(p.ops[0].op).toBe('move')
    expect((p.ops[0] as any).from).toEqual(['a'])
    expect(p.ops[0].path).toEqual(['b'])
  })

  it('converts test', () => {
    const p = fromJsonPatch([{ op: 'test', path: '/a', value: 1 }])
    expect(p.ops[0].op).toBe('test')
  })

  it('converts copy to add', () => {
    const p = fromJsonPatch([{ op: 'copy', from: '/a', path: '/b', value: 1 }])
    expect(p.ops[0].op).toBe('add')
    expect((p.ops[0] as any).value).toBe(1)
  })

  it('unescapes special characters', () => {
    const p = fromJsonPatch([{ op: 'add', path: '/a~1b/c~0d', value: 1 }])
    expect(p.ops[0].path).toEqual(['a/b', 'c~d'])
  })

  it('handles root path', () => {
    const p = fromJsonPatch([{ op: 'replace', path: '', value: 'x' }])
    expect(p.ops[0].path).toEqual([])
  })

  it('handles slash-only path as root', () => {
    const p = fromJsonPatch([{ op: 'replace', path: '/', value: 'x' }])
    expect(p.ops[0].path).toEqual([])
  })

  it('parses numeric segments as numbers', () => {
    const p = fromJsonPatch([{ op: 'add', path: '/items/0', value: 'x' }])
    expect(p.ops[0].path).toEqual(['items', 0])
  })
})
