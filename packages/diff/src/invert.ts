import type { Operation, Patch } from './types'
import { patch } from './patch'

export function invert(p: Patch): Patch {
  const inverted = p.ops.map(invertOp).reverse()
  return patch(inverted)
}

function invertOp(op: Operation): Operation {
  switch (op.op) {
    case 'add':
      return { op: 'remove', path: op.path, oldValue: op.value }
    case 'remove':
      return { op: 'add', path: op.path, value: op.oldValue }
    case 'replace':
      return { op: 'replace', path: op.path, oldValue: op.newValue, newValue: op.oldValue }
    case 'move':
      return { op: 'move', from: op.path, path: op.from }
    case 'rename':
      return { op: 'rename', path: op.path, oldKey: op.newKey, newKey: op.oldKey }
    case 'test':
      return op
  }
}
