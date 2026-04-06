import { type Lens } from '@stopcock/fp'
import { diff, applyUnsafe, compose, patch as mkPatch, type Patch } from '@stopcock/diff'
import { compile, buildLens } from './compile.js'
import { recordMutations } from './draft.js'
import type { Accessor, Handle, Listener, Store, StoreOptions, Unsubscribe } from './types.js'
import type { Path } from '@stopcock/diff'

type Sub = {
  path: Path | null
  lens: Lens<any, any> | null
  get: ((state: any) => any) | null
  listener: Listener<any>
  idx: number
}

function replacePatch(path: Path, oldValue: unknown, newValue: unknown): Patch {
  return mkPatch([{ op: 'replace', path, oldValue, newValue }])
}

/** Build a patch from a shallow partial by comparing only the partial's keys. O(partial) not O(state). */
function patchFromPartial<S>(prev: S, partial: Partial<S>): Patch {
  const ops: import('@stopcock/diff').Operation[] = []
  for (const key in partial) {
    const oldVal = (prev as any)[key]
    const newVal = (partial as any)[key]
    if (oldVal !== newVal) {
      ops.push(key in (prev as any)
        ? { op: 'replace', path: [key], oldValue: oldVal, newValue: newVal }
        : { op: 'add', path: [key], value: newVal },
      )
    }
  }
  return mkPatch(ops)
}

export function create<S extends object>(initial: S, options?: StoreOptions<S>): Store<S> {
  let state = initial
  let subs: Sub[] = []
  let subLen = 0
  const mw = options?.middleware ?? []
  const hasMw = mw.length > 0
  const onCommit = options?.onCommit
  const onError = options?.onError
  let batchDepth = 0
  let batchPrev: S | null = null
  let batchPatches: Patch[] | null = null
  let notifying = false
  let pendingNotifications: Array<() => void> = []
  let firstError: unknown = undefined

  // --- subscriber trie ---
  type TrieNode = { subs: Set<number>; children: Map<string | number, TrieNode> }
  const rootNode: TrieNode = { subs: new Set(), children: new Map() }
  const globalSubs = new Set<number>()

  function trieGet(path: Path): TrieNode {
    let node = rootNode
    for (let i = 0; i < path.length; i++) {
      const seg = path[i]
      let child = node.children.get(seg)
      if (!child) { child = { subs: new Set(), children: new Map() }; node.children.set(seg, child) }
      node = child
    }
    return node
  }

  function indexSub(sub: Sub) {
    if (sub.path === null) { globalSubs.add(sub.idx); return }
    trieGet(sub.path).subs.add(sub.idx)
  }

  function deindexSub(sub: Sub) {
    if (sub.path === null) { globalSubs.delete(sub.idx); return }
    const path = sub.path
    const nodes: TrieNode[] = [rootNode]
    let node = rootNode
    for (let i = 0; i < path.length; i++) {
      const child = node.children.get(path[i])
      if (!child) return
      nodes.push(child)
      node = child
    }
    node.subs.delete(sub.idx)
    for (let i = nodes.length - 1; i > 0; i--) {
      const n = nodes[i]
      if (n.subs.size === 0 && n.children.size === 0) {
        nodes[i - 1].children.delete(path[i - 1])
      } else { break }
    }
  }

  function addSub(sub: Sub): Unsubscribe {
    sub.idx = subLen
    subs[subLen++] = sub
    indexSub(sub)
    return () => removeSub(sub)
  }

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

  // --- notification ---

  function fireSub(sub: Sub, prev: S, next: S) {
    try {
      if (sub.path === null) { sub.listener(next, prev); return }
      const pv = sub.get!(prev)
      const nv = sub.get!(next)
      if (pv !== nv) sub.listener(nv, pv)
    } catch (e) {
      if (firstError === undefined) firstError = e
      onError?.(e)
    }
  }

  function guardedNotify(fn: () => void) {
    if (notifying) { pendingNotifications.push(fn); return }
    firstError = undefined
    notifying = true
    try { fn() } finally { notifying = false }
    while (pendingNotifications.length > 0) {
      const queue = pendingNotifications
      pendingNotifications = []
      for (let i = 0; i < queue.length; i++) {
        notifying = true
        try { queue[i]() } finally { notifying = false }
      }
    }
    if (firstError !== undefined && !onError) {
      const e = firstError
      firstError = undefined
      throw e
    }
  }

  function fireSubtree(node: TrieNode, prev: S, next: S) {
    for (const idx of node.subs) {
      if (idx < subLen) fireSub(subs[idx], prev, next)
    }
    for (const child of node.children.values()) fireSubtree(child, prev, next)
  }

  /** Fast notify for single-path ops (set/over). No Set allocation. */
  function notifyPath(prev: S, next: S, opPath: Path) {
    // global subs
    for (const idx of globalSubs) {
      if (idx < subLen) fireSub(subs[idx], prev, next)
    }
    // walk trie along opPath
    let node: TrieNode | undefined = rootNode
    for (let i = 0; i < opPath.length; i++) {
      // subs here have a path that's a prefix of opPath. They're affected
      for (const idx of node.subs) {
        if (idx < subLen) fireSub(subs[idx], prev, next)
      }
      node = node.children.get(opPath[i])
      if (!node) return
    }
    // at terminal + subtree: op is prefix of their path
    fireSubtree(node, prev, next)
  }

  /** General notify for multi-op patches (batch, replace). */
  function notify(prev: S, next: S, p: Patch) {
    const hit = new Set<number>()
    for (const idx of globalSubs) hit.add(idx)
    for (let j = 0; j < p.ops.length; j++) {
      collectFromTrie(p.ops[j].path, hit)
    }
    for (const i of hit) {
      if (i < subLen) fireSub(subs[i], prev, next)
    }
  }

  function collectFromTrie(opPath: Path, hit: Set<number>) {
    let node: TrieNode | undefined = rootNode
    for (let i = 0; i < opPath.length; i++) {
      for (const idx of node.subs) hit.add(idx)
      node = node.children.get(opPath[i])
      if (!node) return
    }
    collectSubtree(node, hit)
  }

  function collectSubtree(node: TrieNode, hit: Set<number>) {
    for (const idx of node.subs) hit.add(idx)
    for (const child of node.children.values()) collectSubtree(child, hit)
  }

  /** Notify all subs (for replace with no middleware. Skips diff entirely). */
  function notifyAll(prev: S, next: S) {
    for (let i = 0; i < subLen; i++) fireSub(subs[i], prev, next)
  }

  return {
    get(accessor?: Accessor<S, any>) {
      if (!accessor) return state
      return compile(accessor).get(state)
    },

    set(accessor: Accessor<S, any>, value: any) {
      const c = compile(accessor)
      const old = c.get(state)
      if (old === value) return
      const prev = state
      const next = c.set(state, value) as S

      if (batchDepth > 0) {
        state = next
        if (hasMw) batchPatches!.push(replacePatch(c.path, old, value))
        return
      }
      if (hasMw) {
        const p = replacePatch(c.path, old, value)
        const final = runMiddleware(p, prev)
        if (!final || final.ops.length === 0) return
        state = final === p ? next : applyUnsafe(prev, final)
        const s = state; guardedNotify(() => { notifyPath(prev, s, c.path); onCommit?.(final, prev, s) })
      } else {
        state = next
        if (subLen === 0 && !onCommit) return
        const s = state; guardedNotify(() => { notifyPath(prev, s, c.path); if (onCommit) onCommit(replacePatch(c.path, old, value), prev, s) })
      }
    },

    over(accessor: Accessor<S, any>, fn: (a: any) => any) {
      const c = compile(accessor)
      const old = c.get(state)
      const val = fn(old)
      if (old === val) return
      const prev = state
      const next = c.set(state, val) as S

      if (batchDepth > 0) {
        state = next
        if (hasMw) batchPatches!.push(replacePatch(c.path, old, val))
        return
      }
      if (hasMw) {
        const p = replacePatch(c.path, old, val)
        const final = runMiddleware(p, prev)
        if (!final || final.ops.length === 0) return
        state = final === p ? next : applyUnsafe(prev, final)
        const s = state; guardedNotify(() => { notifyPath(prev, s, c.path); onCommit?.(final, prev, s) })
      } else {
        state = next
        if (subLen === 0 && !onCommit) return
        const s = state; guardedNotify(() => { notifyPath(prev, s, c.path); if (onCommit) onCommit(replacePatch(c.path, old, val), prev, s) })
      }
    },

    update(accessorOrFn: any, maybeFn?: any) {
      if (typeof maybeFn === 'function') {
        const c = compile(accessorOrFn)
        const slice = c.get(state) as object
        const { draft, finish } = recordMutations(slice, c.path)
        maybeFn(draft)
        const p = finish()
        if (p.ops.length === 0) return
        if (batchDepth > 0) {
          if (hasMw) batchPatches!.push(p)
          state = applyUnsafe(state, p)
          return
        }
        const final = hasMw ? runMiddleware(p, state) : p
        if (!final || final.ops.length === 0) return
        const prev = state
        state = applyUnsafe(prev, final)
        const s = state; guardedNotify(() => { notify(prev, s, final); onCommit?.(final, prev, s) })
      } else {
        const { draft, finish } = recordMutations(state)
        accessorOrFn(draft)
        const p = finish()
        if (p.ops.length === 0) return
        if (batchDepth > 0) {
          if (hasMw) batchPatches!.push(p)
          state = applyUnsafe(state, p)
          return
        }
        const final = hasMw ? runMiddleware(p, state) : p
        if (!final || final.ops.length === 0) return
        const prev = state
        state = applyUnsafe(prev, final)
        const s = state; guardedNotify(() => { notify(prev, s, final); onCommit?.(final, prev, s) })
      }
    },

    replace(next: S) {
      if (next === state) return
      if (batchDepth > 0) {
        const p = diff(state, next)
        if (hasMw) batchPatches!.push(p)
        state = applyUnsafe(state, p)
        return
      }
      if (!hasMw) {
        const prev = state
        state = next
        if (subLen === 0 && !onCommit) return
        const s = state; guardedNotify(() => { notifyAll(prev, s); if (onCommit) onCommit(diff(prev, s), prev, s) })
        return
      }
      const p = diff(state, next)
      if (p.ops.length === 0) return
      const final = runMiddleware(p, state)
      if (!final || final.ops.length === 0) return
      const prev = state
      state = applyUnsafe(prev, final)
      const s = state; guardedNotify(() => { notify(prev, s, final); onCommit?.(final, prev, s) })
    },

    merge(partial: Partial<S>) {
      const prev = state
      const next = Object.assign({}, state, partial) as S
      if (batchDepth > 0) {
        state = next
        if (hasMw) batchPatches!.push(patchFromPartial(prev, partial))
        return
      }
      if (hasMw) {
        const p = patchFromPartial(prev, partial)
        if (p.ops.length === 0) return
        const final = runMiddleware(p, prev)
        if (!final || final.ops.length === 0) return
        state = final === p ? next : applyUnsafe(prev, final)
        const s = state; guardedNotify(() => { notify(prev, s, final); onCommit?.(final, prev, s) })
      } else {
        state = next
        if (subLen === 0 && !onCommit) return
        const p = patchFromPartial(prev, partial)
        if (p.ops.length === 0) return
        const s = state; guardedNotify(() => { notify(prev, s, p); if (onCommit) onCommit(p, prev, s) })
      }
    },

    batch(fn: () => void) {
      const isOutermost = batchDepth === 0
      if (isOutermost) { batchPrev = state; if (hasMw) batchPatches = [] }
      batchDepth++
      try {
        fn()
      } catch (e) {
        batchDepth--
        if (isOutermost) { state = batchPrev!; batchPrev = null; batchPatches = null }
        throw e
      }
      batchDepth--
      if (!isOutermost) return
      const prev = batchPrev!
      batchPrev = null
      if (state === prev) return

      if (!hasMw) {
        batchPatches = null
        if (subLen === 0 && !onCommit) return
        const s = state; guardedNotify(() => { notifyAll(prev, s); if (onCommit) onCommit(diff(prev, s), prev, s) })
        return
      }

      const patches = batchPatches!
      batchPatches = null
      if (patches.length === 0) { state = prev; return }
      const composed = patches.length === 1 ? patches[0] : patches.reduce((a, b) => compose(a, b))
      if (composed.ops.length === 0) { state = prev; return }
      const final = runMiddleware(composed, prev)
      if (!final || final.ops.length === 0) { state = prev; return }
      if (final !== composed) state = applyUnsafe(prev, final)
      const s = state; guardedNotify(() => { notify(prev, s, final); onCommit?.(final, prev, s) })
    },

    at<A = unknown>(path: readonly (string | number)[]): Handle<A> {
      if (path.length === 0) throw new Error('Path must have at least one segment')
      const lens = buildLens<S, A>(path)
      const compiled = compile<S, A>((s: S) => {
        let r: any = s
        for (let i = 0; i < path.length; i++) r = r[path[i]]
        return r
      })
      return {
        get: () => compiled.get(state) as A,
        set: (value: A) => {
          const old = compiled.get(state)
          if (old === value) return
          const prev = state
          const next = compiled.set(state, value) as S
          if (batchDepth > 0) {
            state = next
            if (hasMw) batchPatches!.push(replacePatch(path, old, value))
            return
          }
          if (hasMw) {
            const p = replacePatch(path, old, value)
            const final = runMiddleware(p, prev)
            if (!final || final.ops.length === 0) return
            state = final === p ? next : applyUnsafe(prev, final)
            const s = state; guardedNotify(() => { notifyPath(prev, s, path); onCommit?.(final, prev, s) })
          } else {
            state = next
            const s = state; guardedNotify(() => { notifyPath(prev, s, path) })
          }
        },
        over: (fn: (a: A) => A) => {
          const old = compiled.get(state) as A
          const val = fn(old)
          if ((old as unknown) === (val as unknown)) return
          const prev = state
          const next = compiled.set(state, val) as S
          if (batchDepth > 0) {
            state = next
            if (hasMw) batchPatches!.push(replacePatch(path, old, val))
            return
          }
          if (hasMw) {
            const p = replacePatch(path, old, val)
            const final = runMiddleware(p, prev)
            if (!final || final.ops.length === 0) return
            state = final === p ? next : applyUnsafe(prev, final)
            const s = state; guardedNotify(() => { notifyPath(prev, s, path); onCommit?.(final, prev, s) })
          } else {
            state = next
            const s = state; guardedNotify(() => { notifyPath(prev, s, path) })
          }
        },
        subscribe: (listener: Listener<A>) => {
          const sub: Sub = { path, lens, get: compiled.get, listener, idx: 0 }
          return addSub(sub)
        },
      }
    },

    subscribe(accessorOrListener: any, maybeListener?: any): Unsubscribe {
      if (typeof maybeListener === 'function') {
        const c = compile(accessorOrListener)
        const sub: Sub = { path: c.path, lens: c.lens, get: c.get, listener: maybeListener, idx: 0 }
        return addSub(sub)
      }
      return addSub({ path: null, lens: null, get: null, listener: accessorOrListener, idx: 0 })
    },

    destroy() { subs = []; subLen = 0; rootNode.subs.clear(); rootNode.children.clear(); globalSubs.clear() },
  }
}
