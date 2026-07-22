// Serializable callback specs. The seeded generator and the pinned/shrunk
// corpus both describe callbacks this way instead of as live closures, so a
// fuzz failure's minimal repro (steps + specs + input) is plain JSON, and
// re-running it later reconstructs the exact same functions.
export type CallbackSpec =
  | { readonly kind: 'identity' }
  | { readonly kind: 'linear'; readonly a: number; readonly b: number }
  | { readonly kind: 'allocLinear'; readonly a: number }
  | { readonly kind: 'mod'; readonly m: number; readonly r: number }
  | { readonly kind: 'allocMod'; readonly m: number; readonly r: number }
  | { readonly kind: 'constTrue' }
  | { readonly kind: 'constFalse' }
  | { readonly kind: 'filterMapMod'; readonly m: number; readonly r: number; readonly a: number; readonly b: number }
  | { readonly kind: 'flatMapRange'; readonly factor: number; readonly a: number; readonly b: number }
  | { readonly kind: 'reduceAdd' }
  | { readonly kind: 'reduceSub' }
  | { readonly kind: 'allocReduceAdd' }
  | { readonly kind: 'noop' }
  | { readonly kind: 'sortCmpAsc' }
  | { readonly kind: 'sortCmpDesc' }

/** Builds the live callback a CallbackSpec describes. */
export function buildCallback(spec: CallbackSpec): unknown {
  switch (spec.kind) {
    case 'identity':
      return (x: number) => x
    case 'linear':
      return (x: number) => x * spec.a + spec.b
    case 'allocLinear':
      return (x: number) => {
        const tmp = [x, x + spec.a]
        return tmp[0] + tmp[1]
      }
    case 'mod':
      return (x: number) => x % spec.m === spec.r
    case 'allocMod':
      return (x: number) => {
        const tmp = { v: x }
        return tmp.v % spec.m === spec.r
      }
    case 'constTrue':
      return () => true
    case 'constFalse':
      return () => false
    case 'filterMapMod':
      return (x: number) => (x % spec.m === spec.r ? x * spec.a + spec.b : undefined)
    case 'flatMapRange': {
      const { factor, a, b } = spec
      return (x: number) => {
        const out: number[] = new Array(factor)
        for (let i = 0; i < factor; i++) out[i] = x * a + b + i
        return out
      }
    }
    case 'reduceAdd':
      return (acc: number, x: number) => acc + x
    case 'reduceSub':
      return (acc: number, x: number) => acc - x
    case 'allocReduceAdd':
      return (acc: number, x: number) => ({ v: acc + x }).v
    case 'noop':
      return () => {}
    case 'sortCmpAsc':
      return (a: number, b: number) => a - b
    case 'sortCmpDesc':
      return (a: number, b: number) => b - a
  }
}
