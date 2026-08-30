import { prop, traversal } from '@stopcock/fp/optic'
import { describe, expect, it } from 'vite-plus/test'
import {
  apply,
  applyUnsafe,
  compose,
  diff,
  diffWith,
  fromLens,
  fromTraversal,
  patch,
  rebase,
} from '../index'

describe('dual API parity', () => {
  const before = { count: 1, label: 'before' }
  const after = { count: 2, label: 'after' }

  it('diff and diffWith match their curried forms', () => {
    expect(diff(before, after)).toEqual(diff(after)(before))
    expect(diffWith(before, after, { detectRenames: false })).toEqual(
      diffWith(after, { detectRenames: false })(before),
    )
  })

  it('apply and applyUnsafe match their curried forms', () => {
    const changes = diff(after)(before)

    expect(apply(before, changes)).toEqual(apply(changes)(before))
    expect(applyUnsafe(before, changes)).toEqual(applyUnsafe(changes)(before))
  })

  it('compose matches its curried form', () => {
    const p1 = patch([{ op: 'add', path: ['count'], value: 1 }])
    const p2 = patch([{ op: 'add', path: ['label'], value: 'ready' }])

    expect(compose(p1, p2)).toEqual(compose(p2)(p1))
  })

  it('rebase matches its curried form', () => {
    const local = patch([{ op: 'replace', path: ['count'], oldValue: 1, newValue: 2 }])
    const remote = patch([
      { op: 'replace', path: ['label'], oldValue: 'before', newValue: 'after' },
    ])

    expect(rebase(local, remote)).toEqual(rebase(remote)(local))
  })

  it('fromLens matches its curried form', () => {
    const count = prop<typeof before, 'count'>('count')

    expect(fromLens(before, count, after)).toEqual(fromLens(count, after)(before))
  })

  it('fromTraversal matches its curried form', () => {
    const each = traversal<number[], number>(
      (source) => [...source],
      (source, transform) => source.map(transform),
    )
    const double = (value: number) => value * 2

    expect(fromTraversal([1, 2, 3], each, double)).toEqual(fromTraversal(each, double)([1, 2, 3]))
  })
})
