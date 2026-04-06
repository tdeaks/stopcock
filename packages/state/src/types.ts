import type { Patch } from '@stopcock/diff'

/** Plain property accessor: `s => s.user.name` */
export type Accessor<S, A> = (state: S) => A

export type Listener<A> = (next: A, prev: A) => void

export type Unsubscribe = () => void

/**
 * Receives a patch and the current (pre-apply) state.
 * Return the patch to continue, a modified patch to transform, or null to reject.
 */
export type Middleware<S> = (patch: Patch, state: S) => Patch | null

export type StoreOptions<S> = {
  readonly middleware?: Middleware<S>[]
}

export interface Handle<A> {
  get(): A
  set(value: A): void
  over(fn: (a: A) => A): void
  subscribe(listener: Listener<A>): Unsubscribe
}

export interface Store<S> {
  get(): S
  get<A>(accessor: Accessor<S, A>): A
  set<A>(accessor: Accessor<S, A>, value: A): void
  over<A>(accessor: Accessor<S, A>, fn: (a: A) => A): void
  update(fn: (draft: S) => void): void
  update<A>(accessor: Accessor<S, A>, fn: (draft: A) => void): void
  replace(next: S): void
  batch(fn: () => void): void
  at<A = unknown>(path: readonly (string | number)[]): Handle<A>
  subscribe(listener: Listener<S>): Unsubscribe
  subscribe<A>(accessor: Accessor<S, A>, listener: Listener<A>): Unsubscribe
  destroy(): void
}
