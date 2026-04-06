import type { Operation, Patch, Path } from './types'
import { patch } from './patch'

export type JsonPatchOperation =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string }
  | { op: 'test'; path: string; value: unknown }
  | { op: 'copy'; from: string; path: string; value: unknown }

function toPointer(path: Path): string {
  if (path.length === 0) return ''
  return '/' + path.map(s => String(s).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')
}

function fromPointer(pointer: string): Path {
  if (pointer === '' || pointer === '/') return []
  return pointer.slice(1).split('/').map(seg => {
    const decoded = seg.replace(/~1/g, '/').replace(/~0/g, '~')
    const num = Number(decoded)
    return Number.isInteger(num) && num >= 0 && String(num) === decoded ? num : decoded
  })
}

export function toJsonPatch(p: Patch): JsonPatchOperation[] {
  return p.ops.map(opToJson)
}

export function fromJsonPatch(ops: JsonPatchOperation[]): Patch {
  return patch(ops.map(jsonToOp))
}

function opToJson(op: Operation): JsonPatchOperation {
  switch (op.op) {
    case 'add': return { op: 'add', path: toPointer(op.path), value: op.value }
    case 'remove': return { op: 'remove', path: toPointer(op.path) }
    case 'replace': return { op: 'replace', path: toPointer(op.path), value: op.newValue }
    case 'move': return { op: 'move', path: toPointer(op.path), from: toPointer(op.from) }
    case 'test': return { op: 'test', path: toPointer(op.path), value: op.value }
    case 'rename': return { op: 'move', from: toPointer([...op.path, op.oldKey]), path: toPointer([...op.path, op.newKey]) }
  }
}

function jsonToOp(op: JsonPatchOperation): Operation {
  const path = fromPointer(op.path)
  switch (op.op) {
    case 'add': return { op: 'add', path, value: op.value }
    case 'remove': return { op: 'remove', path, oldValue: undefined }
    case 'replace': return { op: 'replace', path, oldValue: undefined, newValue: op.value }
    case 'move': return { op: 'move', from: fromPointer(op.from), path }
    case 'test': return { op: 'test', path, value: op.value }
    case 'copy': return { op: 'add', path, value: op.value }
  }
}
