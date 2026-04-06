import { lens, type Lens, path as lensPath, isDeepEqual, type Traversal } from '@stopcock/fp'
import type { Operation, Patch } from './types'
import { patch } from './patch'

export function toLens(op: Operation): Lens<any, any> | null {
  const p = op.path
  if (p.length === 0) return null
  const allStrings = p.filter(s => typeof s === 'string')
  if (allStrings.length !== p.length) {
    return lens(
      (s: any) => { let o = s; for (const seg of p) o = o[seg]; return o },
      (s: any, v: any) => {
        const root = Array.isArray(s) ? [...s] : { ...s }
        let parent: any = root
        for (let i = 0; i < p.length - 1; i++) {
          const seg = p[i]
          const child = parent[seg]
          parent[seg] = Array.isArray(child) ? [...child] : { ...child }
          parent = parent[seg]
        }
        parent[p[p.length - 1]] = v
        return root
      },
    )
  }
  return (lensPath as any)(...allStrings)
}

export function fromLens<S, A>(s: S, lens: Lens<S, A>, target: S): Patch | null {
  const a = lens.get(s)
  const b = lens.get(target)
  if (isDeepEqual(a, b)) return null
  return patch([{ op: 'replace', path: [], oldValue: a, newValue: b }])
}

export function fromTraversal<S, A>(s: S, traversal: Traversal<S, A>, f: (a: A) => A): Patch {
  const items = traversal.getAll(s)
  const ops: Operation[] = []
  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    const b = f(a)
    if (!isDeepEqual(a, b)) {
      ops.push({ op: 'replace', path: [i], oldValue: a, newValue: b })
    }
  }
  return patch(ops)
}
