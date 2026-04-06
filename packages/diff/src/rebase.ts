import { dual, ok, err, type Result } from '@stopcock/fp'
import type { Operation, Patch, ConflictError, Path } from './types'
import { patch, empty } from './patch'

export const rebase: {
  (p: Patch, onto: Patch): Result<Patch, ConflictError>
  (onto: Patch): (p: Patch) => Result<Patch, ConflictError>
} = dual(2, (p: Patch, onto: Patch): Result<Patch, ConflictError> => {
  if (onto.ops.length === 0) return ok(p)
  if (p.ops.length === 0) return ok(empty())

  const result: Operation[] = []
  for (const op of p.ops) {
    const transformed = transformOp(op, onto.ops)
    if (transformed._tag === 0) return transformed as any
    if (transformed.value !== null) result.push(transformed.value)
  }
  return ok(result.length === 0 ? empty() : patch(result))
})

function conflictError(message: string, local: Operation, remote: Operation): ConflictError {
  return { _tag: 'ConflictError', message, local, remote }
}

function transformOp(op: Operation, remoteOps: readonly Operation[]): Result<Operation | null, ConflictError> {
  let current: Operation | null = op
  for (const remote of remoteOps) {
    if (current === null) return ok(null)
    const result = transformPair(current, remote)
    if (result._tag === 0) return result as any
    current = result.value
  }
  return ok(current)
}

function transformPair(local: Operation, remote: Operation): Result<Operation | null, ConflictError> {
  const lPath = getPath(local)
  const rPath = getPath(remote)

  if (remote.op === 'remove' && isPrefix(rPath, lPath) && !pathEquals(rPath, lPath)) {
    return ok(null)
  }

  if (pathEquals(lPath, rPath)) {
    if (local.op === 'replace' && remote.op === 'replace')
      return err(conflictError('Both sides replace the same path', local, remote))
    if (local.op === 'add' && remote.op === 'add')
      return err(conflictError('Both sides add at the same path', local, remote))
    if (local.op === 'remove' && remote.op === 'remove')
      return ok(null)
    if (remote.op === 'remove' && (local.op === 'replace' || local.op === 'rename'))
      return ok(null)
  }

  if (lPath.length > 0 && rPath.length > 0) {
    const adjusted = adjustIndex(local, remote)
    if (adjusted !== null) return ok(adjusted)
  }

  return ok(local)
}

function adjustIndex(local: Operation, remote: Operation): Operation | null {
  const lPath = getPath(local)
  const rPath = getPath(remote)

  const lParent = lPath.slice(0, -1)
  const rParent = rPath.slice(0, -1)
  if (!pathEquals(lParent, rParent)) return null

  const lIdx = lPath[lPath.length - 1]
  const rIdx = rPath[rPath.length - 1]
  if (typeof lIdx !== 'number' || typeof rIdx !== 'number') return null

  if (remote.op === 'add') {
    if (lIdx >= rIdx) return shiftOp(local, lParent, lIdx + 1)
  } else if (remote.op === 'remove') {
    if (lIdx > rIdx) return shiftOp(local, lParent, lIdx - 1)
  }

  return null
}

function shiftOp(op: Operation, parent: Path, newIdx: number): Operation {
  const newPath = [...parent, newIdx]
  switch (op.op) {
    case 'add': return { ...op, path: newPath }
    case 'remove': return { ...op, path: newPath }
    case 'replace': return { ...op, path: newPath }
    case 'test': return { ...op, path: newPath }
    case 'rename': return { ...op, path: newPath }
    case 'move': return { ...op, path: newPath }
  }
}

function getPath(op: Operation): Path { return op.path }

function pathEquals(a: Path, b: Path): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function isPrefix(prefix: Path, path: Path): boolean {
  if (prefix.length > path.length) return false
  for (let i = 0; i < prefix.length; i++) if (prefix[i] !== path[i]) return false
  return true
}
