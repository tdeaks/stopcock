import { patch as mkPatch, type Patch, type Operation, type Path } from '@stopcock/diff'

/**
 * Copy-on-write recording proxy. Captures mutations as patch operations
 * without deep-cloning upfront. Each object level is shallow-copied on
 * first write, so the original state is never mutated.
 *
 * Replaces structuredClone + diff with O(mutations) work.
 */
export function recordMutations<T extends object>(base: T, basePath: Path = []): { draft: T; finish: () => Patch } {
  const ops: Operation[] = []
  const copies = new WeakMap<object, any>()

  function getCopy(target: any): any {
    if (copies.has(target)) return copies.get(target)
    const copy = Array.isArray(target) ? [...target] : { ...target }
    copies.set(target, copy)
    return copy
  }

  function wrap(target: any, path: Path): any {
    if (target == null || typeof target !== 'object') return target

    return new Proxy(target, {
      get(obj, prop) {
        if (typeof prop === 'symbol') return Reflect.get(obj, prop)
        const actual = copies.has(obj) ? copies.get(obj) : obj
        const val = Reflect.get(actual, prop)
        if (val != null && typeof val === 'object') {
          const seg = /^\d+$/.test(prop) ? Number(prop) : prop
          return wrap(val, [...path, seg])
        }
        return val
      },
      set(obj, prop, value) {
        if (typeof prop === 'symbol') return Reflect.set(obj, prop, value)
        const seg: string | number = /^\d+$/.test(prop) ? Number(prop) : prop
        const opPath = [...path, seg]
        const copy = getCopy(obj)
        const oldValue = Reflect.get(copy, prop)
        if (oldValue === value) return true
        const exists = prop in copy && (!Array.isArray(copy) || (seg as number) < copy.length)
        ops.push(exists
          ? { op: 'replace', path: opPath, oldValue, newValue: value }
          : { op: 'add', path: opPath, value },
        )
        Reflect.set(copy, prop, value)
        return true
      },
      deleteProperty(obj, prop) {
        if (typeof prop === 'symbol') return Reflect.deleteProperty(obj, prop)
        const seg: string | number = /^\d+$/.test(prop) ? Number(prop) : prop
        const copy = getCopy(obj)
        const oldValue = Reflect.get(copy, prop)
        ops.push({ op: 'remove', path: [...path, seg], oldValue })
        Reflect.deleteProperty(copy, prop)
        return true
      },
    })
  }

  const draft = wrap(base, basePath) as T
  return { draft, finish: () => mkPatch(ops) }
}
