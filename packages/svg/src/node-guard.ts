import type { Node } from './types'

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null

const hasNumbers = (value: UnknownRecord, keys: ReadonlyArray<string>): boolean =>
  keys.every((key) => typeof value[key] === 'number')

export const isNode = (value: unknown): value is Node => {
  if (!isRecord(value)) return false

  switch (value.kind) {
    case 'circle':
      return hasNumbers(value, ['r', 'cx', 'cy'])
    case 'rect':
      return hasNumbers(value, ['w', 'h', 'x', 'y'])
    case 'ellipse':
      return hasNumbers(value, ['rx', 'ry', 'cx', 'cy'])
    case 'image':
      return typeof value.href === 'string' && hasNumbers(value, ['w', 'h', 'x', 'y'])
    case 'line':
      return hasNumbers(value, ['x1', 'y1', 'x2', 'y2'])
    case 'path':
      return Array.isArray(value.d)
    case 'text':
      return typeof value.text === 'string' && hasNumbers(value, ['x', 'y', 'size'])
    case 'group':
      return Array.isArray(value.children)
    case 'use':
      return isRecord(value.target)
    case 'root':
      return isRecord(value.child) && Array.isArray(value.viewBox) && value.viewBox.length === 4
    default:
      return false
  }
}
