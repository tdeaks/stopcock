import { isDeepEqual } from '@stopcock/fp'
import type { Operation, Path, DiffOptions } from './types'
import { objectDiff } from './object-diff'

type EditOp = { type: 'keep'; oldIdx: number; newIdx: number }
  | { type: 'insert'; newIdx: number }
  | { type: 'delete'; oldIdx: number }

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype
}

function myersDiff<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): EditOp[] {
  const n = a.length
  const m = b.length
  if (n === 0 && m === 0) return []
  if (n === 0) return b.map((_, i) => ({ type: 'insert' as const, newIdx: i }))
  if (m === 0) return a.map((_, i) => ({ type: 'delete' as const, oldIdx: i }))

  const max = n + m
  const offset = max
  const size = 2 * max + 1
  const v = new Int32Array(size)
  const trace: Int32Array[] = []

  v[1 + offset] = 0
  outer: for (let d = 0; d <= max; d++) {
    trace.push(new Int32Array(v))
    for (let k = -d; k <= d; k += 2) {
      let x: number
      if (k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])) {
        x = v[k + 1 + offset]
      } else {
        x = v[k - 1 + offset] + 1
      }
      let y = x - k
      while (x < n && y < m && eq(a[x], b[y])) { x++; y++ }
      v[k + offset] = x
      if (x >= n && y >= m) break outer
    }
  }

  let cx = n, cy = m
  const result: EditOp[] = []
  for (let d = trace.length - 1; d >= 0; d--) {
    const snap = trace[d]
    const k = cx - cy
    let pk: number
    if (k === -d || (k !== d && snap[k - 1 + offset] < snap[k + 1 + offset])) {
      pk = k + 1
    } else {
      pk = k - 1
    }
    const prevX = snap[pk + offset]
    const prevY = prevX - pk

    while (cx > prevX && cy > prevY) {
      cx--; cy--
      result.push({ type: 'keep', oldIdx: cx, newIdx: cy })
    }

    if (d > 0) {
      if (pk === k + 1) {
        cy--
        result.push({ type: 'insert', newIdx: cy })
      } else {
        cx--
        result.push({ type: 'delete', oldIdx: cx })
      }
    }
  }

  return result.reverse()
}

function arrayDiff(a: unknown[], b: unknown[], path: Path, options: DiffOptions): Operation[] {
  const eq = options.eq ?? isDeepEqual
  const edits = myersDiff(a, b, eq)
  const ops: Operation[] = []

  const deleted: { oldIdx: number; value: unknown }[] = []
  const inserted: { newIdx: number; value: unknown }[] = []

  for (const edit of edits) {
    if (edit.type === 'delete') deleted.push({ oldIdx: edit.oldIdx, value: a[edit.oldIdx] })
    else if (edit.type === 'insert') inserted.push({ newIdx: edit.newIdx, value: b[edit.newIdx] })
  }

  if (options.detectMoves !== false && deleted.length > 0 && inserted.length > 0) {
    const usedDel = new Set<number>()
    const usedIns = new Set<number>()
    const moves: { from: number; to: number; value: unknown }[] = []

    for (let i = 0; i < deleted.length; i++) {
      for (let j = 0; j < inserted.length; j++) {
        if (usedDel.has(i) || usedIns.has(j)) continue
        if (eq(deleted[i].value, inserted[j].value)) {
          moves.push({ from: deleted[i].oldIdx, to: inserted[j].newIdx, value: deleted[i].value })
          usedDel.add(i)
          usedIns.add(j)
          break
        }
      }
    }

    const realDeleted = deleted.filter((_, i) => !usedDel.has(i))
    for (let i = realDeleted.length - 1; i >= 0; i--) {
      ops.push({ op: 'remove', path: [...path, realDeleted[i].oldIdx], oldValue: realDeleted[i].value })
    }
    for (const move of moves) {
      ops.push({ op: 'move', from: [...path, move.from], path: [...path, move.to] })
    }
    const realInserted = inserted.filter((_, i) => !usedIns.has(i))
    for (const ins of realInserted) {
      ops.push({ op: 'add', path: [...path, ins.newIdx], value: ins.value })
    }
  } else {
    for (let i = deleted.length - 1; i >= 0; i--) {
      ops.push({ op: 'remove', path: [...path, deleted[i].oldIdx], oldValue: deleted[i].value })
    }
    for (const ins of inserted) {
      ops.push({ op: 'add', path: [...path, ins.newIdx], value: ins.value })
    }
  }

  for (const edit of edits) {
    if (edit.type === 'keep') {
      const childOps = treeDiffRecursive(a[edit.oldIdx], b[edit.newIdx], [...path, edit.newIdx], options)
      ops.push(...childOps)
    }
  }

  return ops
}

function treeDiffRecursive(a: unknown, b: unknown, path: Path, options: DiffOptions): Operation[] {
  if ((options.eq ?? isDeepEqual)(a, b)) return []

  const aIsArr = Array.isArray(a)
  const bIsArr = Array.isArray(b)
  const aIsObj = isPlainObject(a)
  const bIsObj = isPlainObject(b)

  if (aIsArr && bIsArr) return arrayDiff(a, b, path, options)
  if (aIsObj && bIsObj) return objectDiff(a, b, path, options, treeDiffRecursive)

  return [{ op: 'replace', path, oldValue: a, newValue: b }]
}

export function treeDiff(a: unknown, b: unknown, path: Path, options: DiffOptions): Operation[] {
  return treeDiffRecursive(a, b, path, options)
}
