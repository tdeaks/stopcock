import { view, set as lensSet, over as lensOver, type Lens } from '@stopcock/fp'
import { diff, applyUnsafe, type Patch } from '@stopcock/diff'
import { compile, buildLens, overlaps } from './compile.js'
import type { Accessor, Handle, Listener, Middleware, Store, StoreOptions, Unsubscribe } from './types.js'
import type { Path } from '@stopcock/diff'

type Sub = {
  path: Path | null
  lens: Lens<any, any> | null
  listener: Listener<any>
}

export function create<S extends object>(initial: S, options?: StoreOptions<S>): Store<S> {
  let state = initial
  let subs: Sub[] = []
  const mw = options?.middleware ?? []
  let batchDepth = 0
  let batchPrev: S | null = null

  function runMiddleware(p: Patch, s: S): Patch | null {
    let current: Patch | null = p
    for (let i = 0; i < mw.length; i++) {
      if (!current) return null
      current = mw[i](current, s)
    }
    return current
  }

  function notify(prev: S, next: S, p: Patch) {
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i]
      if (sub.path === null) {
        sub.listener(next, prev)
        continue
      }
      let affected = false
      for (let j = 0; j < p.ops.length; j++) {
        if (overlaps(sub.path, p.ops[j].path)) { affected = true; break }
      }
      if (!affected) continue
      const prevVal = view(prev, sub.lens!)
      const nextVal = view(next, sub.lens!)
      if (prevVal !== nextVal) sub.listener(nextVal, prevVal)
    }
  }

  function commit(p: Patch) {
    if (p.ops.length === 0) return
    if (batchDepth > 0) {
      state = applyUnsafe(state, p)
      return
    }
    const final = runMiddleware(p, state)
    if (!final || final.ops.length === 0) return
    const prev = state
    state = applyUnsafe(prev, final)
    notify(prev, state, final)
  }

  return {
    get(accessor?: Accessor<S, any>) {
      if (!accessor) return state
      return view(state, compile(accessor).lens)
    },

    set(accessor: Accessor<S, any>, value: any) {
      const { lens } = compile(accessor)
      if (view(state, lens) === value) return
      commit(diff(state, lensSet(state, lens, value)))
    },

    over(accessor: Accessor<S, any>, fn: (a: any) => any) {
      commit(diff(state, lensOver(state, compile(accessor).lens, fn)))
    },

    update(accessorOrFn: any, maybeFn?: any) {
      if (typeof maybeFn === 'function') {
        const { lens } = compile(accessorOrFn)
        const slice = view(state, lens)
        const draft = structuredClone(slice)
        maybeFn(draft)
        const next = lensSet(state, lens, draft)
        commit(diff(state, next))
      } else {
        const draft = structuredClone(state)
        accessorOrFn(draft)
        commit(diff(state, draft))
      }
    },

    replace(next: S) {
      commit(diff(state, next))
    },

    batch(fn: () => void) {
      const isOutermost = batchDepth === 0
      if (isOutermost) batchPrev = state
      batchDepth++
      try {
        fn()
      } catch (e) {
        batchDepth--
        if (isOutermost) { state = batchPrev!; batchPrev = null }
        throw e
      }
      batchDepth--
      if (!isOutermost) return
      const prev = batchPrev!
      batchPrev = null
      const p = diff(prev, state)
      if (p.ops.length === 0) return
      const final = runMiddleware(p, prev)
      if (!final || final.ops.length === 0) { state = prev; return }
      state = applyUnsafe(prev, final)
      notify(prev, state, final)
    },

    at<A = unknown>(path: readonly (string | number)[]): Handle<A> {
      if (path.length === 0) throw new Error('Path must have at least one segment')
      const lens = buildLens<S, A>(path)
      return {
        get: () => view(state, lens),
        set: (value: A) => {
          if (view(state, lens) === value) return
          commit(diff(state, lensSet(state, lens, value)))
        },
        over: (fn: (a: A) => A) => {
          commit(diff(state, lensOver(state, lens, fn)))
        },
        subscribe: (listener: Listener<A>) => {
          const sub: Sub = { path, lens, listener }
          subs.push(sub)
          return () => { subs = subs.filter(s => s !== sub) }
        },
      }
    },

    subscribe(accessorOrListener: any, maybeListener?: any): Unsubscribe {
      const sub: Sub = typeof maybeListener === 'function'
        ? (() => { const { lens, path } = compile(accessorOrListener); return { path, lens, listener: maybeListener } })()
        : { path: null, lens: null, listener: accessorOrListener }
      subs.push(sub)
      return () => { subs = subs.filter(s => s !== sub) }
    },

    destroy() { subs = [] },
  }
}
