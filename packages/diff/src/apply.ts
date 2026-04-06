import { dual, ok, err, type Result, isDeepEqual } from '@stopcock/fp'
import type { Operation, Patch, PatchError, Path } from './types'

function patchError(message: string, op: Operation, path: Path): PatchError {
  return { _tag: 'PatchError', message, op, path }
}

function getAtPath(obj: unknown, path: Path): unknown {
  let current = obj
  for (const seg of path) {
    if (current == null) return undefined
    current = (current as any)[seg]
  }
  return current
}

function setAtPath(obj: unknown, path: Path, value: unknown, insert: boolean): unknown {
  if (path.length === 0) return value
  obj = Array.isArray(obj) ? [...obj] : { ...(obj as any) }
  let current: any = obj
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]
    const child = current[seg]
    current[seg] = Array.isArray(child) ? [...child] : { ...child }
    current = current[seg]
  }
  const last = path[path.length - 1]
  if (Array.isArray(current) && typeof last === 'number' && insert) {
    current.splice(last, 0, value)
  } else {
    current[last] = value
  }
  return obj
}

function removeAtPath(obj: unknown, path: Path): unknown {
  if (path.length === 0) return undefined
  obj = Array.isArray(obj) ? [...obj] : { ...(obj as any) }
  let current: any = obj
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]
    const child = current[seg]
    current[seg] = Array.isArray(child) ? [...child] : { ...child }
    current = current[seg]
  }
  const last = path[path.length - 1]
  if (Array.isArray(current) && typeof last === 'number') {
    current.splice(last, 1)
  } else {
    delete current[last]
  }
  return obj
}

function applyOp(target: unknown, op: Operation): Result<unknown, PatchError> {
  switch (op.op) {
    case 'add': {
      if (op.path.length === 0) return ok(op.value)
      const parent = getAtPath(target, op.path.slice(0, -1))
      if (parent == null) return err(patchError('Path not found', op, op.path))
      const last = op.path[op.path.length - 1]
      if (Array.isArray(parent)) {
        const idx = last as number
        if (idx < 0 || idx > parent.length) return err(patchError('Index out of bounds', op, op.path))
      }
      return ok(setAtPath(target, op.path, op.value, true))
    }
    case 'remove': {
      if (getAtPath(target, op.path) === undefined && op.path.length > 0)
        return err(patchError('Path not found for remove', op, op.path))
      return ok(removeAtPath(target, op.path))
    }
    case 'replace': {
      if (op.path.length === 0) return ok(op.newValue)
      if (getAtPath(target, op.path) === undefined)
        return err(patchError('Path not found for replace', op, op.path))
      return ok(setAtPath(target, op.path, op.newValue, false))
    }
    case 'move': {
      const value = getAtPath(target, op.from)
      if (value === undefined)
        return err(patchError('Source path not found for move', op, op.from))
      let result = removeAtPath(target, op.from)
      result = setAtPath(result, op.path, value, true)
      return ok(result)
    }
    case 'rename': {
      const parent = getAtPath(target, op.path)
      if (parent == null || typeof parent !== 'object')
        return err(patchError('Path not found for rename', op, op.path))
      if (!(op.oldKey in (parent as any)))
        return err(patchError(`Key "${op.oldKey}" not found for rename`, op, op.path))
      const value = (parent as any)[op.oldKey]
      let result: unknown = target
      result = setAtPath(result, [...op.path, op.newKey], value, false)
      result = removeAtPath(result, [...op.path, op.oldKey])
      return ok(result)
    }
    case 'test': {
      const actual = getAtPath(target, op.path)
      return isDeepEqual(actual, op.value)
        ? ok(target)
        : err(patchError(`Test failed: expected ${JSON.stringify(op.value)}, got ${JSON.stringify(actual)}`, op, op.path))
    }
  }
}

export const apply: {
  <T>(target: T, p: Patch): Result<T, PatchError>
  (p: Patch): <T>(target: T) => Result<T, PatchError>
} = dual(2, <T>(target: T, p: Patch): Result<T, PatchError> => {
  let current: unknown = target
  for (const op of p.ops) {
    const result = applyOp(current, op)
    if (result._tag === 0) return result as any
    current = result.value
  }
  return ok(current as T)
})

export const applyUnsafe: {
  <T>(target: T, p: Patch): T
  (p: Patch): <T>(target: T) => T
} = dual(2, <T>(target: T, p: Patch): T => {
  const result = apply(target, p)
  if (result._tag === 0) throw new Error(result.error.message)
  return result.value
})
