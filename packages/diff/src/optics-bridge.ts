import { collect, lens, view, type Lens, type Traversal } from '@stopcock/fp/optic'
import { deep } from '@stopcock/fp/eq'
import type { Operation, Patch } from './types'
import { patch } from './patch'

export function toLens(op: Operation): Lens<any, any> | null {
  const p = op.path
  if (p.length === 0) return null
  return lens(
    (source: any) => {
      let focus = source
      for (const segment of p) focus = focus[segment]
      return focus
    },
    (source: any, focus: any) => {
      const root = Array.isArray(source) ? [...source] : { ...source }
      let parent: any = root
      for (let index = 0; index < p.length - 1; index++) {
        const segment = p[index]
        const child = parent[segment]
        parent[segment] = Array.isArray(child) ? [...child] : { ...child }
        parent = parent[segment]
      }
      parent[p[p.length - 1]] = focus
      return root
    },
  )
}

export function fromLens<S, A>(s: S, optic: Lens<S, A>, target: S): Patch | null {
  const a = view(optic)(s)
  const b = view(optic)(target)
  if (deep.equals(a, b)) return null
  return patch([{ op: 'replace', path: [], oldValue: a, newValue: b }])
}

export function fromTraversal<S, A>(s: S, optic: Traversal<S, A>, f: (a: A) => A): Patch {
  const items = collect(optic)(s)
  const ops: Operation[] = []
  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    const b = f(a)
    if (!deep.equals(a, b)) {
      ops.push({ op: 'replace', path: [i], oldValue: a, newValue: b })
    }
  }
  return patch(ops)
}
