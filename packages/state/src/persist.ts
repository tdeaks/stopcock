import type { Store, OnCommit } from './types.js'

export type Storage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type PersistOptions<S> = {
  storage?: Storage
  serialize?: (state: S) => string
  deserialize?: (raw: string) => S
  include?: (keyof S)[]
  exclude?: (keyof S)[]
  version?: number
  migrate?: (persisted: any, version: number) => S
}

type Envelope = { v: number; s: unknown }

function defaultStorage(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

function pick<S extends object>(state: S, keys: (keyof S)[]): Partial<S> {
  const out: Partial<S> = {}
  for (const k of keys) out[k] = state[k]
  return out
}

function omit<S extends object>(state: S, keys: (keyof S)[]): Partial<S> {
  const out = { ...state }
  for (const k of keys) delete out[k]
  return out as Partial<S>
}

export function persist<S extends object>(key: string, options?: PersistOptions<S>) {
  const storage = options?.storage ?? defaultStorage()
  const serialize = options?.serialize ?? JSON.stringify
  const deserialize = options?.deserialize ?? JSON.parse
  const version = options?.version ?? 0
  const migrate = options?.migrate

  function toSave(state: S): unknown {
    if (options?.include) return pick(state, options.include)
    if (options?.exclude) return omit(state, options.exclude)
    return state
  }

  const onCommit: OnCommit<S> = (_patch, _prev, next) => {
    if (!storage) return
    const envelope: Envelope = { v: version, s: toSave(next) }
    storage.setItem(key, serialize(envelope as any))
  }

  function hydrate(store: Store<S>) {
    if (!storage) return
    const raw = storage.getItem(key)
    if (raw == null) return
    const envelope = deserialize(raw) as Envelope
    let persisted = envelope.s as S
    if (migrate && envelope.v !== version) {
      persisted = migrate(persisted, envelope.v)
    }
    if (options?.include) {
      store.merge(persisted as Partial<S>)
    } else {
      store.replace(persisted)
    }
  }

  function clear() {
    storage?.removeItem(key)
  }

  return { onCommit, hydrate, clear }
}
