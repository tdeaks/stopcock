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

export const fromLens: {
  <S, A>(s: S, optic: Lens<S, A>, target: S): Patch | null
  <S, A>(optic: Lens<S, A>, target: S): (s: S) => Patch | null
} = function fromLens<S, A>(
  sOrOptic: S | Lens<S, A>,
  opticOrTarget: Lens<S, A> | S,
  maybeTarget?: S,
): any {
  if (arguments.length < 3) {
    const optic = sOrOptic as Lens<S, A>
    const target = opticOrTarget as S
    return (s: S): Patch | null => fromLens(s, optic, target)
  }
  const s = sOrOptic as S
  const optic = opticOrTarget as Lens<S, A>
  const target = maybeTarget as S
  const a = view(optic)(s)
  const b = view(optic)(target)
  if (deep.equals(a, b)) return null
  return patch([{ op: 'replace', path: [], oldValue: a, newValue: b }])
} as any

export const fromTraversal: {
  <S, A>(s: S, optic: Traversal<S, A>, f: (a: A) => A): Patch
  <S, A>(optic: Traversal<S, A>, f: (a: A) => A): (s: S) => Patch
} = function fromTraversal<S, A>(
  sOrOptic: S | Traversal<S, A>,
  opticOrTransform: Traversal<S, A> | ((a: A) => A),
  maybeTransform?: (a: A) => A,
): any {
  if (arguments.length < 3) {
    const optic = sOrOptic as Traversal<S, A>
    const transform = opticOrTransform as (a: A) => A
    return (s: S): Patch => fromTraversal(s, optic, transform)
  }
  const s = sOrOptic as S
  const optic = opticOrTransform as Traversal<S, A>
  const f = maybeTransform as (a: A) => A
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
} as any
