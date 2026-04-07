import { invert, applyUnsafe, type Patch, type Operation } from '@stopcock/diff'
import type { Middleware, Store, StoreOptions, OnCommit } from './types.js'

const OP_COLORS: Record<string, string> = {
  replace: '#6cb6ff',
  add: '#3fb950',
  remove: '#f85149',
  move: '#d2a8ff',
  rename: '#d2a8ff',
  test: '#768390',
}

export type LoggerOptions = {
  collapsed?: boolean
  table?: boolean
}

export function logger<S>(options?: LoggerOptions): Middleware<S> {
  const collapsed = options?.collapsed ?? false
  const table = options?.table ?? true

  return (patch) => {
    const ops = patch.ops
    if (ops.length === 0) return patch

    const summary = ops.length === 1
      ? describeOp(ops[0])
      : groupOps(ops) ?? `${ops.length} changes`

    const groupMethod = collapsed ? console.groupCollapsed : console.group
    groupMethod.call(console, '%c state %c' + summary, 'background:#161b22;color:#58a6ff;padding:2px 6px;border-radius:3px;font-weight:bold', 'color:inherit;font-weight:normal;margin-left:4px')

    if (table) {
      const rows = ops.map(op => {
        const row: Record<string, unknown> = {
          op: op.op,
          path: formatPath(op.path),
        }
        if (op.op === 'replace') { row.from = op.oldValue; row.to = op.newValue }
        else if (op.op === 'add') { row.value = op.value }
        else if (op.op === 'remove') { row.was = op.oldValue }
        else if (op.op === 'move') { row.from = formatPath(op.from) }
        else if (op.op === 'rename') { row.from = op.oldKey; row.to = op.newKey }
        return row
      })
      console.table(rows)
    } else {
      for (const op of ops) {
        const color = OP_COLORS[op.op] ?? '#768390'
        console.log(`%c${op.op}%c ${describeOp(op)}`, `color:#fff;background:${color};padding:1px 5px;border-radius:2px;font-size:10px`, 'color:inherit')
      }
    }

    console.groupEnd()
    return patch
  }
}

export type DevtoolsOptions = {
  name?: string
  debounce?: number
}

/**
 * Returns an `onCommit` callback for use in `StoreOptions`.
 * Connects to Redux DevTools and receives patches directly from
 * the store's commit path — no re-diffing.
 *
 * Usage:
 *   const dt = devtools<State>('MyStore')
 *   const store = create(initial, { onCommit: dt.onCommit })
 *   // dt.connect(store) to enable time travel
 */
export function devtools<S extends object>(options?: string | DevtoolsOptions) {
  const opts = typeof options === 'string' ? { name: options } : options ?? {}
  const ext = typeof window !== 'undefined' && (window as any).__REDUX_DEVTOOLS_EXTENSION__

  // no-op if devtools extension isn't present
  if (!ext) return { onCommit: (() => {}) as OnCommit<S>, connect(_store: Store<S>) {} }

  const conn = ext.connect({ name: opts.name ?? 'Store' })
  let silent = false
  let pending: { label: string; state: S } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounceMs = opts.debounce ?? 0

  function flush() {
    if (!pending) return
    conn.send({ type: pending.label }, pending.state)
    pending = null
    timer = null
  }

  function send(label: string, state: S) {
    if (silent) return
    if (debounceMs <= 0) {
      conn.send({ type: label }, state)
      return
    }
    pending = { label, state }
    if (!timer) timer = setTimeout(flush, debounceMs)
  }

  function describePatch(p: Patch): string {
    if (p.ops.length === 1) return describeOp(p.ops[0])
    return groupOps(p.ops) ?? p.ops.map(describeOp).join('; ')
  }

  const onCommit: OnCommit<S> = (patch, _prev, next) => {
    send(describePatch(patch), next)
  }

  function connect(store: Store<S>) {
    conn.init(store.get())
    conn.subscribe((msg: any) => {
      if (msg.type === 'DISPATCH' && msg.state) {
        const { type } = msg.payload ?? {}
        if (type === 'JUMP_TO_STATE' || type === 'JUMP_TO_ACTION') {
          silent = true
          store.replace(JSON.parse(msg.state))
          silent = false
        }
      }
    })
  }

  return { onCommit, connect }
}

function formatPath(segments: readonly (string | number)[]): string {
  let out = ''
  for (const seg of segments) {
    if (typeof seg === 'number' || /^\d+$/.test(String(seg))) out += `[${seg}]`
    else out += out ? `.${seg}` : String(seg)
  }
  return out
}

function truncate(v: unknown, max = 40): string {
  if (typeof v === 'string') return v.length > max ? `"${v.slice(0, max - 1)}..."` : `"${v}"`
  if (typeof v === 'boolean' || typeof v === 'number' || v === null) return String(v)
  const s = JSON.stringify(v)
  return s.length > max ? s.slice(0, max - 1) + '...' : s
}

function describeOp(op: Operation): string {
  const p = formatPath(op.path)
  switch (op.op) {
    case 'replace': return `${p}: ${truncate(op.oldValue)} -> ${truncate(op.newValue)}`
    case 'add': return `added ${p}: ${truncate(op.value)}`
    case 'remove': return `removed ${p}`
    case 'move': return `moved ${formatPath(op.from)} -> ${p}`
    case 'rename': return `renamed ${p}.${op.oldKey} -> ${op.newKey}`
    case 'test': return `test ${p}`
  }
}

function groupOps(ops: readonly Operation[]): string | null {
  const roots = new Set(ops.map(op => op.path[0]))
  if (roots.size > 3) return `${ops.length} changes`
  const parts: string[] = []
  for (const key of roots) {
    const group = ops.filter(op => op.path[0] === key)
    if (group.length === 1) parts.push(describeOp(group[0]))
    else parts.push(`${key} (${group.length} changes)`)
  }
  return parts.join(', ')
}

/**
 * One-liner devtools setup. Returns StoreOptions with onCommit wired up.
 * After creating the store, call the returned `connect` to enable time travel.
 *
 *   const opts = withDevtools<State>('MyStore')
 *   const store = create(initial, opts)
 *   opts.connect(store)
 */
export function withDevtools<S extends object>(
  options?: string | DevtoolsOptions,
  base?: StoreOptions<S>,
): StoreOptions<S> & { connect: (store: Store<S>) => void } {
  const dt = devtools<S>(options)
  const baseOnCommit = base?.onCommit
  return {
    ...base,
    onCommit: baseOnCommit
      ? (patch, prev, next) => { baseOnCommit(patch, prev, next); dt.onCommit(patch, prev, next) }
      : dt.onCommit,
    connect: dt.connect,
  }
}

/** Compose multiple middleware into one. Runs left to right, short-circuits on null. */
export function composeMiddleware<S>(...mws: Middleware<S>[]): Middleware<S> {
  return (patch, state) => {
    let current: Patch | null = patch
    for (let i = 0; i < mws.length; i++) {
      if (!current) return null
      current = mws[i](current, state)
    }
    return current
  }
}

export type HistoryOptions = {
  maxDepth?: number
}

export type History<S extends object = any> = {
  readonly middleware: Middleware<S>
  readonly canUndo: boolean
  readonly canRedo: boolean
  undo(store: Store<S>): void
  redo(store: Store<S>): void
}

export function history<S extends object = any>(options?: HistoryOptions): History<S> {
  const max = options?.maxDepth ?? Infinity
  const undos: Patch[] = []
  const redos: Patch[] = []
  let silent = false
  return {
    middleware: (patch) => {
      if (silent) return patch
      undos.push(patch)
      if (undos.length > max) undos.shift()
      redos.length = 0
      return patch
    },
    undo(store: Store<S>) {
      const p = undos.pop()
      if (!p) return
      redos.push(p)
      const inverted = invert(p)
      silent = true
      store.replace(applyUnsafe(store.get(), inverted) as S)
      silent = false
    },
    redo(store: Store<S>) {
      const p = redos.pop()
      if (!p) return
      undos.push(p)
      silent = true
      store.replace(applyUnsafe(store.get(), p) as S)
      silent = false
    },
    get canUndo() { return undos.length > 0 },
    get canRedo() { return redos.length > 0 },
  }
}
