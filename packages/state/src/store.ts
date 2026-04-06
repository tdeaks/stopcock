import { view, set as lensSet, over as lensOver, type Lens } from '@stopcock/fp'
import { diff, applyUnsafe, compose, patch as mkPatch, type Patch } from '@stopcock/diff'
import { compile, buildLens, overlaps } from './compile.js'
import type { Accessor, Handle, Listener, Middleware, Store, StoreOptions, Unsubscribe } from './types.js'
import type { Path } from '@stopcock/diff'

type Sub = {
  path: Path | null
  lens: Lens<any, any> | null
  listener: Listener<any>
  idx: number
}

/** Build a single-op replace patch directly from the compiled path */
function replacePatch(path: Path, oldValue: unknown, newValue: unknown): Patch {
  return mkPatch([{ op: 'replace', path, oldValue, newValue }])
}

export function create<S extends object>(initial: S, options?: StoreOptions<S>): Store<S> {
  let state = initial
  let subs: Sub[] = []
  let subLen = 0
  const mw = options?.middleware ?? []
  let batchDepth = 0
  let batchPrev: S | null = null
  let batchPatches: Patch[] = []

  // --- subscriber path index ---
  // Maps each root key to subscriber indices, so notification
  // only checks subscribers whose root overlaps the patch.
  // null key = root-level (all-state) subscribers.
  const subIndex = new Map<string | number | null, Set<number>>()

  function indexSub(sub: Sub) {
    const key = sub.path === null ? null : sub.path[0]
    let set = subIndex.get(key)
    if (!set) { set = new Set(); subIndex.set(key, set) }
    set.add(sub.idx)
  }

  function deindexSub(sub: Sub) {
    const key = sub.path === null ? null : sub.path[0]
    subIndex.get(key)?.delete(sub.idx)
  }

  function addSub(sub: Sub): Unsubscribe {
    sub.idx = subLen
    subs[subLen++] = sub
    indexSub(sub)
    return () => removeSub(sub)
  }

  // swap-remove: O(1) unsub instead of filter
  function removeSub(sub: Sub) {
    const i = sub.idx
    if (i >= subLen || subs[i] !== sub) return
    deindexSub(sub)
    subLen--
    if (i < subLen) {
      const moved = subs[subLen]
      subs[i] = moved
      moved.idx = i
      deindexSub(moved)
      indexSub(moved)
    }
    subs[subLen] = undefined!
  }

  function runMiddleware(p: Patch, s: S): Patch | null {
    let current: Patch | null = p
    for (let i = 0; i < mw.length; i++) {
      if (!current) return null
      current = mw[i](current, s)
    }
    return current
  }

  function collectAffected(p: Patch): Set<number> {
    const hit = new Set<number>()
    // root-level subscribers are always affected
    const rootSubs = subIndex.get(null)
    if (rootSubs) for (const idx of rootSubs) hit.add(idx)
    // check only subscribers whose root key matches an op
    for (let j = 0; j < p.ops.length; j++) {
      const opRoot = p.ops[j].path[0]
      if (opRoot === undefined) {
        // root-level op affects everything
        for (let k = 0; k < subLen; k++) hit.add(k)
        break
      }
      const bucket = subIndex.get(opRoot)
      if (bucket) for (const idx of bucket) hit.add(idx)
    }
    return hit
  }

  function notify(prev: S, next: S, p: Patch) {
    const affected = collectAffected(p)
    for (const i of affected) {
      if (i >= subLen) continue
      const sub = subs[i]
      if (sub.path === null) {
        sub.listener(next, prev)
        continue
      }
      let match = false
      for (let j = 0; j < p.ops.length; j++) {
        if (overlaps(sub.path, p.ops[j].path)) { match = true; break }
      }
      if (!match) continue
      const prevVal = view(prev, sub.lens!)
      const nextVal = view(next, sub.lens!)
      if (prevVal !== nextVal) sub.listener(nextVal, prevVal)
    }
  }

  // TODO: implement commitDirect — the fast path for set/over
  // where we already have both the patch AND the precomputed next state.
  //
  // This is where the key design decision lives:
  // - If no middleware, skip applyUnsafe entirely and use `precomputed`.
  // - If middleware returns the patch unchanged, still use `precomputed`.
  // - If middleware transforms or rejects the patch, fall back to applyUnsafe.
  // - During a batch, accumulate the patch and use precomputed state.
  //
  // function commitDirect(p: Patch, precomputed: S): void { ... }

  /** Slow path: used by replace() and update() where we don't have a precomputed state */
  function commitFull(p: Patch) {
    if (p.ops.length === 0) return
    if (batchDepth > 0) {
      batchPatches.push(p)
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
      const { lens, path } = compile(accessor)
      const oldVal = view(state, lens)
      if (oldVal === value) return
      const p = replacePatch(path, oldVal, value)
      const precomputed = lensSet(state, lens, value)
      // TODO: call commitDirect(p, precomputed) once implemented.
      // For now, fall back to the full path:
      commitFull(p)
    },

    over(accessor: Accessor<S, any>, fn: (a: any) => any) {
      const { lens, path } = compile(accessor)
      const oldVal = view(state, lens)
      const newVal = fn(oldVal)
      if (oldVal === newVal) return
      const p = replacePatch(path, oldVal, newVal)
      const precomputed = lensSet(state, lens, newVal)
      // TODO: call commitDirect(p, precomputed) once implemented
      commitFull(p)
    },

    update(accessorOrFn: any, maybeFn?: any) {
      if (typeof maybeFn === 'function') {
        const { lens } = compile(accessorOrFn)
        const slice = view(state, lens)
        const draft = structuredClone(slice)
        maybeFn(draft)
        // diff only the slice, not the entire tree
        const slicePatch = diff(slice, draft)
        if (slicePatch.ops.length === 0) return
        // rebase slice ops onto the full path
        const fullOps = slicePatch.ops.map(op => rebasePath(op, compile(accessorOrFn).path))
        commitFull(mkPatch(fullOps))
      } else {
        const draft = structuredClone(state)
        accessorOrFn(draft)
        commitFull(diff(state, draft))
      }
    },

    replace(next: S) {
      commitFull(diff(state, next))
    },

    batch(fn: () => void) {
      const isOutermost = batchDepth === 0
      if (isOutermost) { batchPrev = state; batchPatches = [] }
      batchDepth++
      try {
        fn()
      } catch (e) {
        batchDepth--
        if (isOutermost) { state = batchPrev!; batchPrev = null; batchPatches = [] }
        throw e
      }
      batchDepth--
      if (!isOutermost) return
      const prev = batchPrev!
      batchPrev = null
      // compose accumulated patches instead of diffing the whole tree
      let composed = batchPatches.reduce((a, b) => compose(a, b))
      batchPatches = []
      if (composed.ops.length === 0) { state = prev; return }
      const final = runMiddleware(composed, prev)
      if (!final || final.ops.length === 0) { state = prev; return }
      if (final === composed) {
        // middleware passed through — state is already correct from batch writes
        notify(prev, state, final)
      } else {
        // middleware transformed — must re-apply from pre-batch state
        state = applyUnsafe(prev, final)
        notify(prev, state, final)
      }
    },

    at<A = unknown>(path: readonly (string | number)[]): Handle<A> {
      if (path.length === 0) throw new Error('Path must have at least one segment')
      const lens = buildLens<S, A>(path)
      return {
        get: () => view(state, lens),
        set: (value: A) => {
          const oldVal = view(state, lens) as unknown
          if (oldVal === value) return
          const p = replacePatch(path, oldVal, value)
          // TODO: call commitDirect(p, lensSet(state, lens, value)) once implemented
          commitFull(p)
        },
        over: (fn: (a: A) => A) => {
          const oldVal = view(state, lens) as unknown
          const newVal = fn(oldVal as A)
          if (oldVal === newVal) return
          const p = replacePatch(path, oldVal, newVal)
          // TODO: call commitDirect(p, lensSet(state, lens, newVal)) once implemented
          commitFull(p)
        },
        subscribe: (listener: Listener<A>) => {
          const sub: Sub = { path, lens, listener, idx: 0 }
          return addSub(sub)
        },
      }
    },

    subscribe(accessorOrListener: any, maybeListener?: any): Unsubscribe {
      const sub: Sub = typeof maybeListener === 'function'
        ? (() => { const { lens, path } = compile(accessorOrListener); return { path, lens, listener: maybeListener, idx: 0 } as Sub })()
        : { path: null, lens: null, listener: accessorOrListener, idx: 0 }
      return addSub(sub)
    },

    destroy() { subs = []; subLen = 0; subIndex.clear() },
  }
}

/** Prepend a base path to all operation paths */
function rebasePath(op: any, base: Path): any {
  const result = { ...op, path: [...base, ...op.path] }
  if ('from' in op) result.from = [...base, ...op.from]
  return result
}
