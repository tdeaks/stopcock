# Stopcock patch-native state transactions implementation plan

> **Status:** proposed independent runtime workstream.
>
> **Primary owners:** `@stopcock/diff` owns patch semantics and rebasing;
> `@stopcock/state` owns capture, optimistic overlays, subscriptions, and
> transaction state. HTTP is an adapter, not a hard dependency of the
> transaction engine.
>
> **Initial operation subset:** keyed object/map-style add, remove, and replace.
> Array move/rename and arbitrary nested structural transforms are excluded
> until their rebase laws are independently proven.

## Outcome

Ship a transaction API that can:

1. capture a local state change as a checked patch;
2. apply it optimistically;
3. send a versioned transaction envelope through a caller-supplied cancellable
   transport;
4. commit an accepted server revision/patch;
5. remove or rebase a rejected optimistic overlay without overwriting later
   local work;
6. return an explicit typed conflict or indeterminate result;
7. emit deterministic audit/replay events;
8. support bounded persistence and recovery in a later slice.

The design is patch-native and reversible. It is not a CRDT, multi-writer
replication protocol, or complete local-first synchronization system.

## Current repository seams

- Store updates already record patches and emit commit hooks.
- Store batching composes patches and can revert synchronous failures.
- State history already stores forward/inverse patch pairs.
- `@stopcock/diff` exports `apply`, `invert`, `compose`, and `rebase`.
- Resource mutations currently run an optimistic callback before the request
  and refetch invalidated resources after ordinary failure.
- Resource updates do not expose patches.
- Store patch recording/application primitives are internal.
- commit hooks have no transaction ID, origin, or revision context.
- current `apply` does not use `oldValue` as a required precondition.
- current rebase can silently discard local edits below a removed path and does
  not fully transform array move sources.
- JSON Patch conversion discards information needed to reconstruct inverses.
- persistence stores snapshots, not an append-only transaction journal.

These gaps must be resolved in order. Do not build optimistic network behavior
on top of unchecked inverse application.

## Explicit exclusions

- No CRDT or Automerge-compatible semantics.
- No automatic conflict resolution for concurrent same-field writes.
- No array `move`, array index rebasing, or `rename` in the first release.
- No blind inverse application over a state that has received later edits.
- No direct dependency from State core to HTTP.
- No silent rollback after an indeterminate network outcome.
- No unbounded offline queue or audit log.
- No persistence of arbitrary non-JSON values.
- No guarantee that cancelling an already-sent request cancelled the server
  mutation.

## Strengthen Diff first

### Checked patch application

Add a strict operation path:

```ts
export interface ApplyOptions {
  readonly checkPrevious?: boolean
  readonly eq?: Eq<unknown>
}

export function applyChecked<A>(
  value: A,
  patch: Patch,
  options?: ApplyOptions,
): Result<A, PatchError>
```

For the transaction subset:

- add requires the target to be absent;
- remove requires the target to exist and equal `oldValue`;
- replace requires the target to exist and equal `oldValue`;
- a failed precondition returns `PatchError` without applying later operations;
- the whole patch is atomic from the caller's perspective;
- equality defaults to the same documented relation used during capture;
- `apply` compatibility behavior may remain, but transactions use only
  `applyChecked`.

### Rebase contract

For object/keyed operations:

- edits to disjoint keys commute;
- identical accepted changes collapse deterministically;
- replace/replace on the same path conflicts unless an explicit resolver is
  supplied;
- remove versus descendant/local replacement is a conflict, never a silent
  drop;
- add/add on the same path conflicts;
- rebase output retains valid `oldValue` preconditions for the rebased base;
- `rebase(p, onto)` followed by checked apply is differentially tested against
  applying accepted remote work then the intended local work.

Array paths remain rejected by transaction validation until separate laws and
fixtures cover index shifts, moves, duplicates, and stable identity.

### JSON-safe patch envelope

Define a lossless Stopcock wire representation rather than relying on lossy
JSON Patch conversion:

```ts
export interface PatchEnvelope {
  readonly format: "stopcock.patch"
  readonly version: 1
  readonly operations: readonly JsonSafePatchOperation[]
}
```

Serialization validates finite numbers, dense arrays, plain objects, no cycles,
no symbol keys, configured depth/byte limits, and all required previous values.

## Store primitives

Expose narrow primitives:

```ts
export interface CommitContext {
  readonly origin: "local" | "optimistic" | "remote" | "rollback" | "replay"
  readonly transactionId?: string
  readonly revision?: string
}

export interface CapturedChange<A> {
  readonly before: A
  readonly after: A
  readonly patch: Patch
  readonly inverse: Patch
}

interface Store<A> {
  capture(recipe: (draft: Draft<A>) => void): Result<CapturedChange<A>, PatchError>
  applyPatch(patch: Patch, context?: CommitContext): Result<A, PatchError>
}
```

Rules:

- `capture` does not mutate the Store;
- `applyPatch` routes through one checked commit path and always emits commit
  metadata;
- root Store, focused Handle, batch, history, middleware, and framework adapter
  paths observe the same commit;
- observers never see a partially applied patch;
- commit metadata is immutable and does not contain user values;
- a transaction engine never reaches into draft recorder internals.

## Transaction model

### Envelope

```ts
export interface StateTransactionEnvelope {
  readonly format: "stopcock.state.transaction"
  readonly version: 1
  readonly id: string
  readonly key: string
  readonly baseRevision: string
  readonly patch: PatchEnvelope
  readonly idempotencyKey: string
  readonly metadata?: Readonly<Record<string, JsonValue>>
}
```

`id` and `idempotencyKey` are supplied or generated through an injected
deterministic/cryptographic ID factory. Core code must not assume a Node-only
random API. Metadata is bounded and JSON-safe.

### Transport-neutral request

```ts
export type TransactionTransport = (
  envelope: StateTransactionEnvelope,
  signal: AbortSignal,
) => Promise<TransactionServerResult>

export type TransactionServerResult =
  | {
      readonly kind: "accepted"
      readonly revision: string
      readonly serverPatch?: PatchEnvelope
    }
  | {
      readonly kind: "conflict"
      readonly revision: string
      readonly serverPatch: PatchEnvelope
    }
  | {
      readonly kind: "rejected"
      readonly error: unknown
    }
```

An optional `@stopcock/state/async` adapter may accept/return
`@stopcock/async` Tasks. An optional HTTP recipe maps the envelope to a request.
The transaction core knows neither URLs nor HTTP status codes.

### Overlay state

Model visible state as:

```text
accepted base snapshot/revision
  + ordered pending optimistic overlays
  = visible Store state
```

On acceptance:

1. validate the response revision;
2. apply the accepted local patch or authoritative server patch to the base;
3. remove the accepted overlay;
4. rebase every later overlay over the new base in order;
5. recompute the visible snapshot atomically;
6. emit one accepted commit/event.

On rejection:

1. remove only the rejected overlay;
2. replay/rebase later overlays over the unchanged accepted base;
3. atomically publish the resulting visible snapshot;
4. emit a rejection event.

This avoids blindly applying the captured inverse to a state that has later
optimistic or remote edits.

### Concurrency

The first release serializes transport per transaction key:

- one in-flight transaction per key;
- later transactions for the same key remain ordered optimistic overlays;
- disjoint keys may proceed concurrently only when their patches are proven
  disjoint;
- a remote patch touching pending paths triggers rebase before commit;
- unresolved rebase produces an explicit conflict and pauses that key;
- no queue item is silently discarded.

## Result and lifecycle

```ts
export type TransactionOutcome =
  | { readonly kind: "committed"; readonly id: string; readonly revision: string }
  | { readonly kind: "rolled-back"; readonly id: string; readonly reason: unknown }
  | { readonly kind: "conflict"; readonly id: string; readonly conflict: ConflictError }
  | { readonly kind: "cancelled"; readonly id: string; readonly phase: "queued" | "unsent" }
  | { readonly kind: "indeterminate"; readonly id: string; readonly reason: unknown }
```

Cancellation policy:

- cancelling while queued removes the overlay and returns `cancelled`;
- cancelling before transport accepts the envelope removes the overlay;
- once the request may have reached the server, abort can produce
  `indeterminate`;
- indeterminate transactions keep enough identity to reconcile by idempotency
  key and server revision;
- do not label an unknown server outcome “rolled back” merely because local
  state was hidden;
- stale non-cooperative promises cannot commit after a newer generation has
  taken ownership.

## Audit events

Emit immutable bounded events:

```ts
type TransactionEvent =
  | CapturedEvent
  | OptimisticAppliedEvent
  | SentEvent
  | AcceptedEvent
  | RebasedEvent
  | RolledBackEvent
  | ConflictEvent
  | IndeterminateEvent
```

Events contain IDs, revisions, patch hashes, operation counts, timestamps from
an injected clock, and sanitized error categories. Raw patch values are omitted
by default. A caller may persist encrypted/full envelopes through an explicit
adapter.

## Persistence and replay

Persistence is a later independently releasable slice:

- append envelopes and lifecycle events before acknowledging durable queueing;
- version every record;
- recover accepted base revision plus ordered pending overlays;
- validate checksums, JSON limits, patch preconditions, and monotonic sequence;
- stop and surface corruption instead of skipping a record;
- compact only at an accepted revision boundary;
- retain idempotency keys through replay;
- expose adapter contracts for memory and caller-provided durable storage;
- do not add filesystem or IndexedDB imports to State root.

## Implementation slices

### Slice 0 — Freeze counterexamples and operation subset

1. Add failing fixtures for inverse-over-later-edit, remove/descendant rebase,
   same-path replacement, and array move/index shifts.
2. Approve add/remove/replace on keyed object paths as the only initial subset.
3. Freeze JSON-safe value and equality policies.

**Gate:** every known unsafe current behavior has a failing regression fixture
before implementation.

### Slice 1 — Harden Diff

1. Implement atomic `applyChecked`.
2. Correct object/key rebase behavior and preconditions.
3. Add lossless versioned patch envelopes.
4. Add property tests for apply/invert/compose/rebase within the subset.

**Gate:** randomized valid histories commute or return explicit conflict; no
local operation disappears silently.

### Slice 2 — Expose Store capture and checked commit

1. Implement `capture` without Store mutation.
2. Implement one `applyPatch` commit path.
3. Add origin/transaction/revision context.
4. Route Store, Handle, batch, middleware, history, and subscribers through
   consistent commit notification.

**Gate:** all mutation surfaces produce one consistent patch/context event and
retain existing framework behavior.

### Slice 3 — Implement optimistic overlay engine

1. Separate accepted base from ordered pending overlays.
2. Implement capture, optimistic apply, acceptance, rejection, and later-overlay
   replay.
3. Serialize per key and permit only proven disjoint concurrency.
4. Add lifecycle events and generation guards.

**Gate:** after every randomized server response/order, visible and accepted
state match an independent overlay oracle.

### Slice 4 — Add transport, cancellation, and conflicts

1. Implement the transport-neutral interface.
2. Add exact cancellation/indeterminate policies.
3. Apply authoritative server patches and rebase later overlays.
4. Return typed outcomes rather than throwing expected conflict states.

**Gate:** delayed/non-cooperative responses, abort races, duplicate responses,
and idempotent retries cannot overwrite a newer accepted generation.

### Slice 5 — Add Task/HTTP recipes

1. Add an optional Task adapter under the existing async boundary.
2. Document HTTP status/envelope mapping without hard-coding it in core.
3. Propagate cancellation and preserve typed transport/domain errors.
4. Add mock-server contract fixtures.

**Gate:** importing State core does not include Async or HTTP code.

### Slice 6 — Add persistence, replay, and audit adapters

1. Define durable journal format and corruption policy.
2. Add in-memory reference adapter and caller-owned storage interface.
3. Implement recovery, reconciliation, and compaction.
4. Add redacted audit rendering and undo of accepted local transactions where
   revision policy permits.

**Gate:** crash/restart at every lifecycle boundary recovers deterministically
or fails explicitly without duplicating a committed transaction.

## Test matrix

- object add/remove/replace at root and nested keyed paths;
- precondition success/failure and custom equality;
- patch inversion and checked round-trip;
- disjoint/same-path/remove-descendant rebase;
- capture without mutation and one commit notification;
- multiple optimistic overlays on one key;
- disjoint keys and remote patches;
- accept, reject, conflict, cancel, timeout, duplicate response, and
  non-cooperative late response;
- indeterminate reconciliation by idempotency key;
- serialization depth/size/cycle/non-finite/symbol rejection;
- journal corruption, partial writes, duplicate records, and compaction;
- React/Svelte/Vue adapter snapshot consistency;
- packed ESM, declarations, tree shaking, Node, Bun, and browser tests.

## Acceptance criteria

- Transactions never blindly apply an inverse over intervening work.
- Checked patch preconditions protect previous-value assumptions.
- Rebase never silently drops local changes in the supported subset.
- Visible state is accepted base plus ordered overlays, atomically published.
- Expected conflicts and indeterminate outcomes are typed.
- Cancellation semantics distinguish unsent from possibly-sent work.
- State core has no HTTP dependency.
- Audit/persistence are bounded, versioned, and redacted by default.
- Array moves remain unsupported until their separate laws pass.
- Documentation uses “patch-native transactions” or “reversible state,” not
  CRDT/local-first claims.

## Rollback

Diff hardening, Store primitives, overlay transactions, transport adapters, and
persistence are independent slices. If the overlay engine is disabled, ordinary
Store/Resource behavior remains available. Never roll back to unchecked patch
application or silent rebase drops merely to preserve the higher-level API.
