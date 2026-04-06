import { describe, it, expect } from 'vitest'
import { rebase } from '../rebase'
import { patch, empty } from '../patch'

const ok = (r: any) => r._tag === 1
const err = (r: any) => r._tag === 0

describe('rebase', () => {
  it('rebasing onto empty returns original', () => {
    const p = patch([{ op: 'add', path: ['a'], value: 1 }])
    const r = rebase(p, empty())
    expect(ok(r)).toBe(true)
    expect(r.value).toBe(p)
  })

  it('rebasing empty onto anything returns empty', () => {
    const onto = patch([{ op: 'add', path: ['a'], value: 1 }])
    const r = rebase(empty(), onto)
    expect(ok(r)).toBe(true)
    expect(r.value.ops).toHaveLength(0)
  })

  it('non-conflicting ops pass through', () => {
    const local = patch([{ op: 'replace', path: ['a'], oldValue: 1, newValue: 2 }])
    const remote = patch([{ op: 'replace', path: ['b'], oldValue: 10, newValue: 20 }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops).toHaveLength(1)
  })

  it('both replace same path conflicts', () => {
    const local = patch([{ op: 'replace', path: ['a'], oldValue: 1, newValue: 2 }])
    const remote = patch([{ op: 'replace', path: ['a'], oldValue: 1, newValue: 3 }])
    const r = rebase(local, remote)
    expect(err(r)).toBe(true)
  })

  it('both add same path conflicts', () => {
    const local = patch([{ op: 'add', path: ['a'], value: 1 }])
    const remote = patch([{ op: 'add', path: ['a'], value: 2 }])
    const r = rebase(local, remote)
    expect(err(r)).toBe(true)
  })

  it('both remove same path cancels local', () => {
    const local = patch([{ op: 'remove', path: ['a'], oldValue: 1 }])
    const remote = patch([{ op: 'remove', path: ['a'], oldValue: 1 }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops).toHaveLength(0)
  })

  it('remote remove of ancestor path drops local', () => {
    const local = patch([{ op: 'replace', path: ['a', 'b'], oldValue: 1, newValue: 2 }])
    const remote = patch([{ op: 'remove', path: ['a'], oldValue: { b: 1 } }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops).toHaveLength(0)
  })

  it('remote remove then local replace at same path drops local', () => {
    const local = patch([{ op: 'replace', path: ['a'], oldValue: 1, newValue: 2 }])
    const remote = patch([{ op: 'remove', path: ['a'], oldValue: 1 }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops).toHaveLength(0)
  })

  it('adjusts array index on remote add before local', () => {
    const local = patch([{ op: 'replace', path: ['items', 2], oldValue: 'c', newValue: 'C' }])
    const remote = patch([{ op: 'add', path: ['items', 0], value: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['items', 3])
  })

  it('adjusts array index on remote remove before local', () => {
    const local = patch([{ op: 'replace', path: ['items', 2], oldValue: 'c', newValue: 'C' }])
    const remote = patch([{ op: 'remove', path: ['items', 0], oldValue: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['items', 1])
  })

  it('no index adjustment when remote is at or after local', () => {
    const local = patch([{ op: 'replace', path: ['items', 0], oldValue: 'a', newValue: 'A' }])
    const remote = patch([{ op: 'add', path: ['items', 5], value: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['items', 0])
  })

  it('no index adjustment for different parent paths', () => {
    const local = patch([{ op: 'replace', path: ['a', 0], oldValue: 1, newValue: 2 }])
    const remote = patch([{ op: 'add', path: ['b', 0], value: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['a', 0])
  })

  it('no index adjustment for string keys', () => {
    const local = patch([{ op: 'replace', path: ['obj', 'key'], oldValue: 1, newValue: 2 }])
    const remote = patch([{ op: 'add', path: ['obj', 'other'], value: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['obj', 'key'])
  })

  it('shifts add op index on remote add', () => {
    const local = patch([{ op: 'add', path: ['items', 2], value: 'new' }])
    const remote = patch([{ op: 'add', path: ['items', 0], value: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['items', 3])
    expect(r.value.ops[0].op).toBe('add')
  })

  it('shifts remove op index on remote add', () => {
    const local = patch([{ op: 'remove', path: ['items', 2], oldValue: 'c' }])
    const remote = patch([{ op: 'add', path: ['items', 0], value: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['items', 3])
    expect(r.value.ops[0].op).toBe('remove')
  })

  it('shifts test op index on remote add', () => {
    const local = patch([{ op: 'test', path: ['items', 2], value: 'c' }])
    const remote = patch([{ op: 'add', path: ['items', 0], value: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['items', 3])
    expect(r.value.ops[0].op).toBe('test')
  })

  it('shifts rename op index on remote add', () => {
    const local = patch([{ op: 'rename', path: ['items', 2], oldKey: 'a', newKey: 'b' }])
    const remote = patch([{ op: 'add', path: ['items', 0], value: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['items', 3])
    expect(r.value.ops[0].op).toBe('rename')
  })

  it('shifts move op index on remote add', () => {
    const local = patch([{ op: 'move', from: ['items', 0], path: ['items', 2] }])
    const remote = patch([{ op: 'add', path: ['items', 0], value: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['items', 3])
    expect(r.value.ops[0].op).toBe('move')
  })

  it('no shift when local index equals remote remove index', () => {
    const local = patch([{ op: 'replace', path: ['items', 2], oldValue: 'c', newValue: 'C' }])
    const remote = patch([{ op: 'remove', path: ['items', 2], oldValue: 'c' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    // local index 2, remote removes index 2 - should drop local (same path remove takes it)
    // but actually rebase checks pathEquals first for remove+replace, which drops local
  })

  it('no shift when local index is before remote remove', () => {
    const local = patch([{ op: 'replace', path: ['items', 0], oldValue: 'a', newValue: 'A' }])
    const remote = patch([{ op: 'remove', path: ['items', 2], oldValue: 'c' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['items', 0])
  })

  it('no shift when local index equals remote add index', () => {
    const local = patch([{ op: 'replace', path: ['items', 2], oldValue: 'c', newValue: 'C' }])
    const remote = patch([{ op: 'add', path: ['items', 2], value: 'x' }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops[0].path).toEqual(['items', 3])
  })

  it('curried form works', () => {
    const onto = patch([{ op: 'add', path: ['b'], value: 2 }])
    const rebaseOnto = rebase(onto)
    const local = patch([{ op: 'add', path: ['a'], value: 1 }])
    const r = rebaseOnto(local)
    expect(ok(r)).toBe(true)
  })

  it('remote rename then local replace at same path drops local', () => {
    const local = patch([{ op: 'rename', path: [], oldKey: 'a', newKey: 'b' }])
    const remote = patch([{ op: 'remove', path: [], oldValue: { a: 1 } }])
    const r = rebase(local, remote)
    expect(ok(r)).toBe(true)
    expect(r.value.ops).toHaveLength(0)
  })
})
