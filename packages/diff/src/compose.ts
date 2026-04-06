import { dual, isDeepEqual } from '@stopcock/fp'
import type { Operation, Patch, Path } from './types'
import { patch, empty } from './patch'

export const compose: {
  (p1: Patch, p2: Patch): Patch
  (p2: Patch): (p1: Patch) => Patch
} = dual(2, (p1: Patch, p2: Patch): Patch => {
  if (p1.ops.length === 0) return p2
  if (p2.ops.length === 0) return p1

  const combined = [...p1.ops, ...p2.ops]
  const simplified = simplify(combined)
  return simplified.length === 0 ? empty() : patch(simplified)
})

function pathEq(a: Path, b: Path): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function simplify(ops: Operation[]): Operation[] {
  const result: Operation[] = []

  for (let i = 0; i < ops.length; i++) {
    const current = ops[i]

    if (result.length > 0) {
      const prev = result[result.length - 1]
      const merged = tryMerge(prev, current)
      if (merged !== null) {
        if (merged.length === 0) {
          result.pop()
        } else {
          result[result.length - 1] = merged[0]
          for (let j = 1; j < merged.length; j++) result.push(merged[j])
        }
        continue
      }
    }

    result.push(current)
  }

  return result
}

function tryMerge(prev: Operation, next: Operation): Operation[] | null {
  if (prev.op === 'add' && next.op === 'remove' && pathEq(prev.path, next.path)) {
    return []
  }

  if (prev.op === 'remove' && next.op === 'add' && pathEq(prev.path, next.path)) {
    if (isDeepEqual(prev.oldValue, next.value)) return []
    return [{ op: 'replace', path: prev.path, oldValue: prev.oldValue, newValue: next.value }]
  }

  if (prev.op === 'add' && next.op === 'replace' && pathEq(prev.path, next.path)) {
    return [{ op: 'add', path: prev.path, value: next.newValue }]
  }

  if (prev.op === 'replace' && next.op === 'replace' && pathEq(prev.path, next.path)) {
    if (isDeepEqual(prev.oldValue, next.newValue)) return []
    return [{ op: 'replace', path: prev.path, oldValue: prev.oldValue, newValue: next.newValue }]
  }

  if (prev.op === 'move' && next.op === 'move' && pathEq(prev.path, next.from)) {
    return [{ op: 'move', from: prev.from, path: next.path }]
  }

  return null
}
