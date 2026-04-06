import { isDeepEqual } from '@stopcock/fp'
import type { Operation, Path, DiffOptions } from './types'

export function objectDiff(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  path: Path,
  options: DiffOptions,
  recurse: (a: unknown, b: unknown, path: Path, options: DiffOptions) => Operation[],
): Operation[] {
  const ops: Operation[] = []
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  const bSet = new Set(bKeys)
  const aSet = new Set(aKeys)

  const removed: { key: string; value: unknown }[] = []
  const added: { key: string; value: unknown }[] = []

  for (const key of aKeys) if (!bSet.has(key)) removed.push({ key, value: a[key] })
  for (const key of bKeys) if (!aSet.has(key)) added.push({ key, value: b[key] })

  if (options.detectRenames !== false && removed.length > 0 && added.length > 0) {
    const usedRemoved = new Set<number>()
    const usedAdded = new Set<number>()
    const eq = options.eq ?? isDeepEqual

    for (let i = 0; i < removed.length; i++) {
      for (let j = 0; j < added.length; j++) {
        if (usedRemoved.has(i) || usedAdded.has(j)) continue
        if (eq(removed[i].value, added[j].value)) {
          ops.push({ op: 'rename', path, oldKey: removed[i].key, newKey: added[j].key })
          usedRemoved.add(i)
          usedAdded.add(j)
          break
        }
      }
    }

    for (let i = 0; i < removed.length; i++)
      if (!usedRemoved.has(i)) ops.push({ op: 'remove', path: [...path, removed[i].key], oldValue: removed[i].value })
    for (let i = 0; i < added.length; i++)
      if (!usedAdded.has(i)) ops.push({ op: 'add', path: [...path, added[i].key], value: added[i].value })
  } else {
    for (const { key, value } of removed) ops.push({ op: 'remove', path: [...path, key], oldValue: value })
    for (const { key, value } of added) ops.push({ op: 'add', path: [...path, key], value: value })
  }

  for (const key of aKeys) {
    if (bSet.has(key)) {
      const childOps = recurse(a[key], b[key], [...path, key], options)
      ops.push(...childOps)
    }
  }

  return ops
}
