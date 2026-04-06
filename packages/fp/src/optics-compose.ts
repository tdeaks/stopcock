import type { Lens } from './lens'
import type { Prism } from './prism'
import type { Traversal } from './traversal'
import type { Iso } from './iso'
import { lens } from './lens'
import { prism } from './prism'
import { traversal } from './traversal'
import { iso } from './iso'
import { isSome, some, none } from './option'

type Optic = Lens<unknown, unknown> | Prism<unknown, unknown> | Traversal<unknown, unknown> | Iso<unknown, unknown>

type AnyLens = Lens<any, any>
type AnyPrism = Prism<any, any>
type AnyTraversal = Traversal<any, any>
type AnyIso = Iso<any, any>

function toLens(o: Optic): AnyLens | null {
  if (o._tag === 'Lens') return o as AnyLens
  if (o._tag === 'Iso') {
    const i = o as AnyIso
    return lens(i.get, (_s, a) => i.reverseGet(a))
  }
  return null
}

function toPrism(o: Optic): AnyPrism | null {
  if (o._tag === 'Prism') return o as AnyPrism
  if (o._tag === 'Lens') { const l = o as AnyLens; return prism(s => some(l.get(s)), l.set) }
  if (o._tag === 'Iso') { const i = o as AnyIso; return prism(s => some(i.get(s)), (_, a) => i.reverseGet(a)) }
  return null
}

function toTraversal(o: Optic): AnyTraversal {
  if (o._tag === 'Traversal') return o as AnyTraversal
  if (o._tag === 'Lens') {
    const l = o as AnyLens
    return traversal(s => [l.get(s)], (s, f) => l.set(s, f(l.get(s))))
  }
  if (o._tag === 'Prism') {
    const p = o as AnyPrism
    return traversal(
      s => { const r = p.getOption(s); return isSome(r) ? [r.value] : [] },
      (s, f) => { const r = p.getOption(s); return isSome(r) ? p.set(s, f(r.value)) : s },
    )
  }
  const i = o as AnyIso
  return traversal(s => [i.get(s)], (s, f) => i.reverseGet(f(i.get(s))))
}

export function composeOptics(outer: AnyLens, inner: AnyLens): AnyLens
export function composeOptics(outer: AnyLens, inner: AnyPrism): AnyPrism
export function composeOptics(outer: AnyPrism, inner: AnyLens): AnyPrism
export function composeOptics(outer: AnyPrism, inner: AnyPrism): AnyPrism
export function composeOptics(outer: Optic, inner: AnyTraversal): AnyTraversal
export function composeOptics(outer: AnyTraversal, inner: Optic): AnyTraversal
export function composeOptics(outer: AnyIso, inner: AnyIso): AnyIso
export function composeOptics(outer: Optic, inner: Optic): Optic
export function composeOptics(outer: Optic, inner: Optic): Optic {
  if (outer._tag === 'Iso' && inner._tag === 'Iso') {
    const o = outer as AnyIso, i = inner as AnyIso
    return iso(
      (s: unknown) => i.get(o.get(s)),
      (b: unknown) => o.reverseGet(i.reverseGet(b)),
    )
  }

  const outerL = toLens(outer)
  const innerL = toLens(inner)
  if (outerL && innerL && outer._tag !== 'Prism' && inner._tag !== 'Prism'
    && outer._tag !== 'Traversal' && inner._tag !== 'Traversal') {
    return lens(
      (s: unknown) => innerL.get(outerL.get(s)),
      (s: unknown, b: unknown) => outerL.set(s, innerL.set(outerL.get(s), b)),
    )
  }

  const outerP = toPrism(outer)
  const innerP = toPrism(inner)
  if (outerP && innerP && outer._tag !== 'Traversal' && inner._tag !== 'Traversal') {
    return prism(
      (s: unknown) => {
        const a = outerP.getOption(s)
        return isSome(a) ? innerP.getOption(a.value) : none
      },
      (s: unknown, b: unknown) => {
        const a = outerP.getOption(s)
        if (!isSome(a)) return s
        return outerP.set(s, innerP.set(a.value, b))
      },
    )
  }

  const outerT = toTraversal(outer)
  const innerT = toTraversal(inner)
  return traversal(
    (s: unknown) => outerT.getAll(s).flatMap((a: unknown) => innerT.getAll(a)),
    (s: unknown, f: (a: unknown) => unknown) => outerT.modify(s, (a: unknown) => innerT.modify(a, f)),
  )
}
